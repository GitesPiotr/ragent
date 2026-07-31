import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractConceptsForDocument } from './concepts.js';

// Postęp wyciągania pojęć — kontrakt { done, total, finished } liczony Z BAZY.
//
// USTERKA, KTÓRĄ TE TESTY PILNUJĄ (wystąpiła DRUGI RAZ, pierwszy w Sesji 4 przy
// pasku embedowania): stan pętli trzymany w pamięci komponentu zamiast czytany
// z bazy. Objawy były dwa i oba widać dopiero na dużym dokumencie:
//   • do pierwszej odpowiedzi klient nie znał mianownika, a pierwsza odpowiedź
//     przychodzi po CAŁEJ partii — przy Kodeksie 4 fragmenty × ~11 s = 44 sekundy
//     paska „0 / 0", nie do odróżnienia od zawieszenia,
//   • po przeładowaniu strony postęp przepadał, choć baza znała prawdę.

class Q {
  constructor(state, table) {
    this.state = state;
    this.table = table;
    this.filters = [];
    this._range = null;
  }
  select() {
    return this;
  }
  eq(col, val) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col, vals) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col, val) {
    if (val === null) this.filters.push((r) => r[col] === null || r[col] === undefined);
    return this;
  }
  order() {
    return this;
  }
  range(from, to) {
    this._range = [from, to];
    return this;
  }
  _rows() {
    let rows = (this.state[this.table] || []).slice();
    for (const f of this.filters) rows = rows.filter(f);
    if (this._range) rows = rows.slice(this._range[0], this._range[1] + 1);
    return rows;
  }
  async single() {
    const rows = this._rows();
    if (!rows.length) return { data: null, error: { message: 'not found' } };
    return { data: rows[0], error: null };
  }
  async maybeSingle() {
    return { data: this._rows()[0] || null, error: null };
  }
  async upsert(row) {
    const wiersze = Array.isArray(row) ? row : [row];
    for (const r of wiersze) {
      const jest = (this.state[this.table] || []).some(
        (x) => x.chunk_id === r.chunk_id && x.concept_id === r.concept_id
      );
      if (!jest) this.state[this.table].push({ ...r });
    }
    return { data: null, error: null };
  }
  insert(row) {
    this._insert = row;
    return this;
  }
  update(patch) {
    this._update = patch;
    return this;
  }
  then(resolve) {
    if (this._insert) {
      const id = 'c' + (this.state.rag_concepts.length + 1);
      this.state.rag_concepts.push({ id, merged_into: null, ...this._insert });
      return resolve({ data: { id }, error: null });
    }
    if (this._update) {
      for (const r of this._rows()) Object.assign(r, this._update);
      return resolve({ data: null, error: null });
    }
    return resolve({ data: this._rows(), error: null });
  }
}

// Dokument o kształcie Kodeksu w miniaturze: 10 fragmentów, 2 śmieciowe
// (poniżej progu wyrazów), 3 już z pojęciami.
function stan() {
  const chunks = [];
  for (let i = 0; i < 10; i++) {
    chunks.push({
      id: 'f' + i,
      document_id: 'd1',
      collection_id: 'k1',
      chunk_index: i,
      // 10 wyrazów co najmniej dwuliterowych — powyżej progu 8. Krótsza wersja
      // tego zdania miała ich 7 i sama wpadała w odsiew śmieci.
      content:
        i < 2
          ? 'Rozdział I'
          : 'Fragment o odpowiedniej długości nadający się do wyciągania pojęć z jego treści.',
    });
  }
  return {
    rag_documents: [{ id: 'd1', collection_id: 'k1', status: 'ready' }],
    rag_chunks: chunks,
    rag_concepts: [{ id: 'c-urlop', collection_id: 'k1', label: 'urlop', label_normalized: 'urlop', merged_into: null }],
    // Trzy fragmenty mają już pojęcia — jak Kodeks po przerwanym przebiegu.
    rag_chunk_concepts: [
      { chunk_id: 'f2', concept_id: 'c-urlop' },
      { chunk_id: 'f3', concept_id: 'c-urlop' },
      { chunk_id: 'f4', concept_id: 'c-urlop' },
    ],
  };
}

function klient(state) {
  const spy = { rpc: 0 };
  return {
    spy,
    from: (t) => new Q(state, t),
    async rpc(_name, args) {
      spy.rpc++;
      // Odwzorowuje rag_chunks_without_concepts: bez pojęć ORAZ powyżej progu wyrazów.
      const bezPojec = state.rag_chunks.filter(
        (c) =>
          c.document_id === args.p_document_id &&
          !state.rag_chunk_concepts.some((k) => k.chunk_id === c.id) &&
          (c.content.match(/\p{L}{2,}/gu) || []).length >= args.p_min_words
      );
      return {
        data: bezPojec
          .slice(0, args.p_limit)
          .map((c) => ({ chunk_id: c.id, chunk_index: c.chunk_index, content: c.content })),
        error: null,
      };
    },
  };
}

const atrapaModelu = { dlaFragmentu: async () => ['urlop'] };
const atrapaWektorow = { embedDocuments: async (t) => t.map(() => [0.1, 0.2]) };

// =============================================================================
//  batch = 0 — SAM ODCZYT, odpowiednik getEmbedProgress
// =============================================================================

test('batch=0 zwraca postęp z bazy i NIE woła modelu', async () => {
  const state = stan();
  let wolanoModel = false;
  const wynik = await extractConceptsForDocument('d1', {
    client: klient(state),
    batch: 0,
    conceptProvider: {
      dlaFragmentu: async () => {
        wolanoModel = true;
        return ['x'];
      },
    },
    provider: atrapaWektorow,
  });

  assert.equal(wolanoModel, false, 'odczyt postępu nie ma prawa uruchomić modelu');
  assert.equal(wynik.done, 3, 'trzy fragmenty mają już pojęcia');
  assert.equal(wynik.total, 8, '10 fragmentów minus 2 śmieciowe');
  assert.equal(wynik.finished, false);
});

test('batch=0 niczego nie zapisuje — dwa wywołania dają ten sam wynik', async () => {
  const state = stan();
  const przed = JSON.stringify(state.rag_chunk_concepts);
  const a = await extractConceptsForDocument('d1', { client: klient(state), batch: 0 });
  const b = await extractConceptsForDocument('d1', { client: klient(state), batch: 0 });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(state.rag_chunk_concepts), przed);
});

test('ŚMIECI NIE WCHODZĄ DO MIANOWNIKA — inaczej pasek nigdy nie dobiłby do 100%', async () => {
  // Kodeks ma 510 fragmentów, z czego 17 jest poniżej progu wyrazów i z założenia
  // NIGDY nie dostanie pojęć. Gdyby mianownikiem był chunk_count, pasek zatrzymałby
  // się na 96,7% i wyglądał na zepsuty.
  const state = stan();
  const { total } = await extractConceptsForDocument('d1', { client: klient(state), batch: 0 });
  assert.equal(total, 8);
  assert.notEqual(total, state.rag_chunks.length, 'mianownik to NIE liczba wszystkich fragmentów');
});

// =============================================================================
//  POSTĘP LICZONY Z BAZY, NIE NARASTAJĄCO
// =============================================================================

test('done rośnie o przerobioną partię i jest liczone z bazy', async () => {
  const state = stan();
  const wynik = await extractConceptsForDocument('d1', {
    client: klient(state),
    batch: 2,
    conceptProvider: atrapaModelu,
    provider: atrapaWektorow,
  });
  assert.equal(wynik.done, 5, '3 wcześniejsze + 2 z tej partii');
  assert.equal(wynik.total, 8, 'mianownik się NIE zmienia w trakcie przebiegu');
  assert.equal(wynik.finished, false);
});

test('WZNOWIENIE: druga partia widzi dorobek pierwszej, bez sumowania w kliencie', async () => {
  const state = stan();
  const deps = { client: klient(state), batch: 2, conceptProvider: atrapaModelu, provider: atrapaWektorow };
  const a = await extractConceptsForDocument('d1', deps);
  const b = await extractConceptsForDocument('d1', deps);
  assert.equal(a.done, 5);
  assert.equal(b.done, 7, 'kolejne wywołanie kontynuuje, a nie zaczyna od zera');
  assert.equal(b.total, 8);

  // Kluczowe dla naprawy: świeży odczyt (jakby po przeładowaniu strony) pokazuje
  // TEN SAM stan. Wcześniej suma żyła w pamięci komponentu i przepadała.
  const poPrzeladowaniu = await extractConceptsForDocument('d1', { client: klient(state), batch: 0 });
  assert.equal(poPrzeladowaniu.done, 7);
  assert.equal(poPrzeladowaniu.total, 8);
});

test('ostatnia partia kończy przebieg', async () => {
  const state = stan();
  const deps = { client: klient(state), batch: 100, conceptProvider: atrapaModelu, provider: atrapaWektorow };
  const wynik = await extractConceptsForDocument('d1', deps);
  assert.equal(wynik.done, 8);
  assert.equal(wynik.total, 8);
  assert.equal(wynik.finished, true);
});

test('dokument w całości przerobiony → finished bez wołania modelu', async () => {
  const state = stan();
  for (const c of state.rag_chunks) {
    if (!state.rag_chunk_concepts.some((k) => k.chunk_id === c.id)) {
      if ((c.content.match(/\p{L}{2,}/gu) || []).length >= 8) {
        state.rag_chunk_concepts.push({ chunk_id: c.id, concept_id: 'c-urlop' });
      }
    }
  }
  let wolano = false;
  const wynik = await extractConceptsForDocument('d1', {
    client: klient(state),
    conceptProvider: { dlaFragmentu: async () => { wolano = true; return []; } },
    provider: atrapaWektorow,
  });
  assert.equal(wolano, false);
  assert.equal(wynik.finished, true);
  assert.equal(wynik.done, 8);
  assert.equal(wynik.total, 8);
});

// =============================================================================
//  SKOŃCZONOŚĆ PĘTLI
// =============================================================================

test('fragment, dla którego model milczy, NIE zapętla klienta w nieskończoność', async () => {
  // Gdyby `finished` brało się z `done >= total`, taki fragment nigdy nie dostałby
  // powiązania, wracałby jako kandydat i pętla chodziłaby bez końca. Koniec
  // wyznacza POKRYCIE PARTII, nie licznik.
  const state = stan();
  const wynik = await extractConceptsForDocument('d1', {
    client: klient(state),
    batch: 100,
    conceptProvider: { dlaFragmentu: async () => [] }, // model nie zwraca nic
    provider: atrapaWektorow,
  });
  assert.equal(wynik.finished, true, 'przebieg MUSI się zakończyć');
  assert.equal(wynik.done, 3, 'ale postęp uczciwie stoi w miejscu');
  assert.equal(wynik.total, 8, 'i widać, że 5 fragmentów nie dostało pojęć');
});
