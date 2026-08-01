import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGraphData } from './graph.js';
import { searchByConcept } from './concepts.js';

// --- Mini-silnik zapytań w pamięci: tyle Supabase, ile używa graph.js -------------
// Ten sam wzorzec co w map.test.js. Liczy wywołania .range(), żeby dało się
// sprawdzić STRONICOWANIE bez bazy — pułapka „PostgREST oddaje max 1000 wierszy"
// wraca w każdej sesji i objawia się cichym policzeniem z części danych.
class Q {
  constructor(state, table, spy) {
    this.state = state;
    this.table = table;
    this.spy = spy;
    this.filters = [];
    // WIELE kluczy sortowania, nie jeden: getGraphData dokłada `id` jako klucz
    // rozstrzygający remisy, a mock z jednym `_order` po cichu gubiłby klucz główny
    // i test pokazywałby porządek, którego baza nie zwraca.
    this._orders = [];
    this._range = null;
  }
  // `select('id', { count: 'exact', head: true })` — wariant liczący. Mock musi go
  // znać, bo inaczej gałąź „czy są pojęcia nowsze niż znacznik normalizacji"
  // przechodziłaby testy bez ani jednego wywołania.
  select(_cols, opts) {
    this._count = !!(opts && opts.count);
    return this;
  }
  eq(col, val) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  gt(col, val) {
    this.filters.push((r) => r[col] != null && r[col] > val);
    return this;
  }
  in(col, vals) {
    this.spy.inSizes.push(vals.length);
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col, val) {
    if (val === null) this.filters.push((r) => r[col] === null || r[col] === undefined);
    return this;
  }
  order(col, opts) {
    const asc = !opts || opts.ascending !== false;
    this._orders.push({ col, asc });
    this.spy.orders.push([this.table, col, asc ? 'asc' : 'desc']);
    return this;
  }
  range(from, to) {
    this.spy.ranges.push([this.table, from, to]);
    this._range = [from, to];
    return this;
  }
  _rows() {
    let rows = (this.state[this.table] || []).slice();
    for (const f of this.filters) rows = rows.filter(f);
    if (this._orders.length) {
      // Sortowanie po kolejnych kluczach, jak ORDER BY a, b — a NIE `reverse()`
      // na całości, bo to odwróciłoby także klucz rozstrzygający remisy.
      rows.sort((a, b) => {
        for (const { col, asc } of this._orders) {
          if (a[col] === b[col]) continue;
          const znak = a[col] < b[col] ? -1 : 1;
          return asc ? znak : -znak;
        }
        return 0;
      });
    }
    if (this._range) rows = rows.slice(this._range[0], this._range[1] + 1);
    return rows;
  }
  async single() {
    const rows = this._rows();
    if (!rows.length) return { data: null, error: { message: 'not found' } };
    return { data: rows[0], error: null };
  }
  async maybeSingle() {
    const rows = this._rows();
    return { data: rows[0] || null, error: null };
  }
  then(resolve) {
    const rows = this._rows();
    return resolve({ data: rows, error: null, count: this._count ? rows.length : undefined });
  }
}

function fakeClient(state) {
  const spy = { ranges: [], inSizes: [], orders: [] };
  return { spy, from: (t) => new Q(state, t, spy) };
}

// Kolekcja odwzorowująca stan po Sesji 7+8: pięć małych plików z pojęciami
// plus dwa duże dokumenty BEZ pojęć (Kodeks i RODO nie były przepuszczane).
function stanPodstawowy() {
  return {
    rag_collections: [{ id: 'k1', name: 'Regulaminy' }],
    rag_documents: [
      { id: 'd1', collection_id: 'k1', file_name: '01-regulamin-pracy.md', chunk_count: 7, created_at: '2026-01-01' },
      { id: 'd2', collection_id: 'k1', file_name: '02-polityka.txt', chunk_count: 3, created_at: '2026-01-02' },
      { id: 'kod', collection_id: 'k1', file_name: 'D20250277Lj.pdf', chunk_count: 510, created_at: '2026-01-03' },
    ],
    rag_concepts: [
      { id: 'c-urlop', collection_id: 'k1', label: 'urlop', mention_count: 2, merged_into: null },
      { id: 'c-haslo', collection_id: 'k1', label: 'hasło', mention_count: 1, merged_into: null },
      // SCALONE w Sesji 8 — nie ma prawa pojawić się w grafie.
      { id: 'c-urlopw', collection_id: 'k1', label: 'urlop wypoczynkowy', mention_count: 0, merged_into: 'c-urlop' },
    ],
    rag_chunks: [
      { id: 'f1', collection_id: 'k1', document_id: 'd1' },
      { id: 'f2', collection_id: 'k1', document_id: 'd1' },
      { id: 'f3', collection_id: 'k1', document_id: 'd2' },
    ],
    rag_chunk_concepts: [
      { chunk_id: 'f1', concept_id: 'c-urlop' },
      { chunk_id: 'f2', concept_id: 'c-urlop' },
      { chunk_id: 'f3', concept_id: 'c-haslo' },
      // Powiązanie ze scalonym pojęciem: po Sesji 8 nie powinno istnieć, ale
      // gdyby zostało, NIE MOŻE dorysować węzła-duplikatu.
      { chunk_id: 'f1', concept_id: 'c-urlopw' },
    ],
  };
}

// =============================================================================
//  KSZTAŁT I DoD
// =============================================================================

test('kształt odpowiedzi dokładnie taki, jak opisuje sekcja 9', async () => {
  const { documents, concepts, edges } = await getGraphData('k1', { client: fakeClient(stanPodstawowy()) });

  assert.deepEqual(Object.keys(documents[0]).sort(), ['chunkCount', 'color', 'conceptCount', 'id', 'name']);
  assert.deepEqual(Object.keys(concepts[0]).sort(), ['id', 'label', 'mentionCount']);
  assert.deepEqual(Object.keys(edges[0]).sort(), ['conceptId', 'documentId', 'weight']);
});

test('DoD: WYŁĄCZNIE pojęcia kanoniczne — scalone nie tworzy ani węzła, ani krawędzi', async () => {
  const { concepts, edges } = await getGraphData('k1', { client: fakeClient(stanPodstawowy()) });

  assert.deepEqual(concepts.map((c) => c.id).sort(), ['c-haslo', 'c-urlop']);
  assert.ok(!concepts.some((c) => c.label === 'urlop wypoczynkowy'), 'duplikat z Sesji 8 nie wraca');
  assert.ok(!edges.some((e) => e.conceptId === 'c-urlopw'), 'osierocone powiązanie nie rysuje krawędzi');
});

test('waga = liczba fragmentów TEGO dokumentu przy TYM pojęciu', async () => {
  const { edges } = await getGraphData('k1', { client: fakeClient(stanPodstawowy()) });

  const urlop = edges.find((e) => e.documentId === 'd1' && e.conceptId === 'c-urlop');
  assert.equal(urlop.weight, 2, 'dwa fragmenty d1 wskazują na „urlop"');
  assert.equal(edges.find((e) => e.conceptId === 'c-haslo').weight, 1);
});

test('graf NIE zwraca fragmentów — to jest rozstrzygnięcie skali, nie przeoczenie', async () => {
  const wynik = await getGraphData('k1', { client: fakeClient(stanPodstawowy()) });
  assert.equal(wynik.chunks, undefined);
  // Przy 2000 fragmentów odpychanie każdy-z-każdym to ~4 mln par na klatkę.
  // `totals` doszło w Sesji 10: bez liczby przed filtrem widok nie ma z czego napisać
  // „pokazano 157 z 565" (12.9). `normalizacjaOczekuje` doszło 29.07.2026 z tego samego
  // powodu — bez niego widok nie odróżnia stanu końcowego od połowy potoku.
  assert.deepEqual(Object.keys(wynik).sort(), [
    'concepts',
    'documents',
    'edges',
    'normalizacjaOczekuje',
    'totals',
  ]);
  assert.deepEqual(Object.keys(wynik.totals).sort(), ['bridges', 'concepts', 'shown']);
});

// --- STAN POŚREDNI POTOKU (12.9) ------------------------------------------------
// Przypadek z 29.07.2026: po dołożeniu RODO wyciągnięto pojęcia, ale pominięto
// scalanie duplikatów. Graf ogłosił „1066 pojęć, 43 mosty" i nic nie krzyczało,
// choć w bazie leżało 100 par pojęć kanonicznych powyżej progu scalania.
function stanZeZnacznikiem(znacznik, utworzonePojec) {
  const s = stanPodstawowy();
  s.rag_collections = [{ id: 'k1', name: 'Regulaminy', concepts_normalized_at: znacznik }];
  s.rag_concepts = s.rag_concepts.map((c, i) => ({ ...c, created_at: utworzonePojec[i] }));
  return s;
}

test('pojęcie nowsze niż znacznik normalizacji → widok dostaje sygnał stanu pośredniego', async () => {
  const stan = stanZeZnacznikiem('2026-07-20T00:00:00Z', [
    '2026-07-19T00:00:00Z',
    '2026-07-29T00:00:00Z', // wyciągnięte PO ostatnim scalaniu
    '2026-07-19T00:00:00Z',
  ]);
  const wynik = await getGraphData('k1', { client: fakeClient(stan) });
  assert.equal(wynik.normalizacjaOczekuje, true);
});

test('wszystkie pojęcia starsze niż znacznik → stan końcowy, bez sygnału', async () => {
  const stan = stanZeZnacznikiem('2026-07-29T12:00:00Z', [
    '2026-07-19T00:00:00Z',
    '2026-07-20T00:00:00Z',
    '2026-07-19T00:00:00Z',
  ]);
  const wynik = await getGraphData('k1', { client: fakeClient(stan) });
  assert.equal(wynik.normalizacjaOczekuje, false);
});

test('brak znacznika przy istniejących pojęciach → stan pośredni, nie cisza', async () => {
  // NULL znaczy „nigdy nie normalizowano" i MUSI być nieodróżnialne od „nie przeszła":
  // obie sytuacje wymagają tego samego działania. Milczenie byłoby tu gorsze niż
  // fałszywy alarm — dokładnie ten przypadek zdarzył się naprawdę.
  const wynik = await getGraphData('k1', { client: fakeClient(stanPodstawowy()) });
  assert.equal(wynik.normalizacjaOczekuje, true);
});

test('kolekcja bez pojęć NIE zgłasza oczekującej normalizacji — nie ma czego scalać', async () => {
  const stan = stanPodstawowy();
  stan.rag_concepts = [];
  stan.rag_chunk_concepts = [];
  const wynik = await getGraphData('k1', { client: fakeClient(stan) });
  assert.equal(wynik.normalizacjaOczekuje, false);
});

test('dokument BEZ pojęć zostaje w odpowiedzi — ukrycie go byłoby kłamstwem (12.9)', async () => {
  const { documents, edges } = await getGraphData('k1', { client: fakeClient(stanPodstawowy()) });

  const kodeks = documents.find((d) => d.id === 'kod');
  assert.ok(kodeks, 'Kodeks musi być w grafie mimo zera pojęć');
  assert.equal(kodeks.chunkCount, 510, 'z prawdziwą liczbą fragmentów, nie z zerem');
  assert.ok(!edges.some((e) => e.documentId === 'kod'), 'ale bez krawędzi — bo ich nie ma');
});

test('kolor dokumentu wynika z pozycji po created_at — ten sam co na mapie', async () => {
  const { documents } = await getGraphData('k1', { client: fakeClient(stanPodstawowy()) });
  assert.equal(documents[0].name, '01-regulamin-pracy.md', 'sortowanie po created_at rosnąco');
  assert.notEqual(documents[0].color, documents[1].color);
  assert.ok(/^#[0-9a-f]{6}$/i.test(documents[0].color));
});

// =============================================================================
//  STRONICOWANIE — pułapka, która wraca w każdej sesji
// =============================================================================

test('powyżej 1000 powiązań wynik jest PEŁNY, a nie ucięty po pierwszej stronie', async () => {
  const state = stanPodstawowy();
  state.rag_chunks = [];
  state.rag_chunk_concepts = [];
  for (let i = 0; i < 1400; i++) {
    const id = 'x' + String(i).padStart(5, '0');
    state.rag_chunks.push({ id, collection_id: 'k1', document_id: 'kod' });
    state.rag_chunk_concepts.push({ chunk_id: id, concept_id: 'c-urlop' });
  }

  const client = fakeClient(state);
  const { edges } = await getGraphData('k1', { client });

  const kodeks = edges.find((e) => e.documentId === 'kod' && e.conceptId === 'c-urlop');
  assert.equal(kodeks.weight, 1400, 'bez stronicowania wyszłoby 500 albo 1000 — i wyglądałoby wiarygodnie');
  assert.ok(client.spy.ranges.filter((r) => r[0] === 'rag_chunk_concepts').length >= 3);
  assert.ok(client.spy.ranges.filter((r) => r[0] === 'rag_chunks').length >= 3);
});

test('lista identyfikatorów do .in() jest dzielona na grupy — URL ma swój limit', async () => {
  const state = stanPodstawowy();
  state.rag_concepts = [];
  for (let i = 0; i < 250; i++) {
    state.rag_concepts.push({ id: 'c' + i, collection_id: 'k1', label: 'p' + i, mention_count: 1, merged_into: null });
  }
  const client = fakeClient(state);
  await getGraphData('k1', { client });

  assert.ok(client.spy.inSizes.length >= 3, `250 pojęć musi pójść w kilku grupach, poszło w ${client.spy.inSizes.length}`);
  assert.ok(Math.max(...client.spy.inSizes) <= 100, 'żadna grupa nie przekracza 100 identyfikatorów');
});

// =============================================================================
//  PRÓG WYSTĄPIEŃ (Sesja 10) — FILTR W RDZENIU, MOSTY GO OMIJAJĄ
//
//  Stan odwzorowuje to, co pomiar znalazł na Regulaminach po Kodeksie: masę pojęć
//  z jednym wystąpieniem w jednym dokumencie plus garść mostów, z których część
//  ma tak mało wystąpień, że każdy sensowny próg by je uciął.
// =============================================================================
function stanZeMostami() {
  const state = {
    rag_collections: [{ id: 'k1', name: 'Regulaminy' }],
    rag_documents: [
      { id: 'd1', collection_id: 'k1', file_name: 'a.md', chunk_count: 5, created_at: '2026-01-01' },
      { id: 'd2', collection_id: 'k1', file_name: 'b.md', chunk_count: 5, created_at: '2026-01-02' },
    ],
    rag_concepts: [],
    rag_chunks: [
      { id: 'f1', collection_id: 'k1', document_id: 'd1' },
      { id: 'f2', collection_id: 'k1', document_id: 'd1' },
      { id: 'f3', collection_id: 'k1', document_id: 'd1' },
      { id: 'g1', collection_id: 'k1', document_id: 'd2' },
    ],
    rag_chunk_concepts: [],
  };
  // „pracodawca": 28 wystąpień, dwa dokumenty — most, który przeżyje każdy próg.
  state.rag_concepts.push({ id: 'c-pracodawca', collection_id: 'k1', label: 'pracodawca', mention_count: 28, merged_into: null });
  state.rag_chunk_concepts.push({ chunk_id: 'f1', concept_id: 'c-pracodawca' });
  state.rag_chunk_concepts.push({ chunk_id: 'g1', concept_id: 'c-pracodawca' });

  // „akcja ratownicza": 2 wystąpienia, ale DWA dokumenty — most, który próg 3 by uciął.
  state.rag_concepts.push({ id: 'c-akcja', collection_id: 'k1', label: 'akcja ratownicza', mention_count: 2, merged_into: null });
  state.rag_chunk_concepts.push({ chunk_id: 'f2', concept_id: 'c-akcja' });
  state.rag_chunk_concepts.push({ chunk_id: 'g1', concept_id: 'c-akcja' });

  // „czas pracy": 5 wystąpień, ale JEDEN dokument — nie most, przechodzi progiem.
  state.rag_concepts.push({ id: 'c-czas', collection_id: 'k1', label: 'czas pracy', mention_count: 5, merged_into: null });
  state.rag_chunk_concepts.push({ chunk_id: 'f1', concept_id: 'c-czas' });

  // Sto pojęć z jednym wystąpieniem w jednym dokumencie — to one wywracały układanie.
  for (let i = 0; i < 100; i++) {
    state.rag_concepts.push({ id: 'c-drobne' + i, collection_id: 'k1', label: 'drobne ' + i, mention_count: 1, merged_into: null });
    state.rag_chunk_concepts.push({ chunk_id: 'f3', concept_id: 'c-drobne' + i });
  }
  return state;
}

test('bez progu graf oddaje wszystko — domyślna wartość mieszka w widoku, nie w rdzeniu', async () => {
  const { concepts, totals } = await getGraphData('k1', { client: fakeClient(stanZeMostami()) });
  assert.equal(concepts.length, 103);
  assert.deepEqual(totals, { concepts: 103, shown: 103, bridges: 2 });
});

test('próg 2 odsiewa drobne pojęcia, a WSZYSTKIE mosty zostają', async () => {
  const { concepts, totals } = await getGraphData('k1', {
    client: fakeClient(stanZeMostami()),
    minMentions: 2,
  });
  const etykiety = concepts.map((c) => c.label).sort();
  assert.deepEqual(etykiety, ['akcja ratownicza', 'czas pracy', 'pracodawca']);
  assert.equal(totals.shown, 3);
  assert.equal(totals.concepts, 103, 'licznik musi znać liczbę PRZED filtrem (12.9)');
});

test('MOST OMIJA PRÓG — „akcja ratownicza" z dwoma wystąpieniami przeżywa próg 5', async () => {
  // Bez tej reguły filtr ucinałby dokładnie to, po co ten widok istnieje. Pomiar
  // na Regulaminach: przy progu 3 wypadały trzy mosty, przy 5 — sześć z piętnastu.
  const { concepts } = await getGraphData('k1', {
    client: fakeClient(stanZeMostami()),
    minMentions: 5,
  });
  const etykiety = concepts.map((c) => c.label).sort();
  assert.deepEqual(etykiety, ['akcja ratownicza', 'czas pracy', 'pracodawca']);
});

test('próg nie do przejścia zostawia SAME mosty, nigdy pustego grafu z mostami w bazie', async () => {
  const { concepts, totals } = await getGraphData('k1', {
    client: fakeClient(stanZeMostami()),
    minMentions: 9999,
  });
  assert.deepEqual(concepts.map((c) => c.label).sort(), ['akcja ratownicza', 'pracodawca']);
  assert.equal(totals.bridges, 2);
});

test('tylkoMosty pokazuje wyłącznie pojęcia wspólne — „czas pracy" wypada mimo 5 wystąpień', async () => {
  const { concepts, edges, totals } = await getGraphData('k1', {
    client: fakeClient(stanZeMostami()),
    tylkoMosty: true,
  });
  assert.deepEqual(concepts.map((c) => c.label).sort(), ['akcja ratownicza', 'pracodawca']);
  assert.equal(totals.shown, 2);
  assert.ok(
    edges.every((e) => e.conceptId === 'c-pracodawca' || e.conceptId === 'c-akcja'),
    'krawędzie odsianych pojęć nie mają prawa zostać'
  );
});

test('krawędzie odsianych pojęć znikają razem z nimi — inaczej fizyka liczy widmo', async () => {
  const { concepts, edges } = await getGraphData('k1', {
    client: fakeClient(stanZeMostami()),
    minMentions: 2,
  });
  const zostaje = new Set(concepts.map((c) => c.id));
  assert.ok(edges.length > 0);
  assert.ok(edges.every((e) => zostaje.has(e.conceptId)));
});

test('conceptCount liczy pojęcia PRZED progiem — legenda musi rozróżnić trzy powody', async () => {
  // Bez tej liczby widok pisze „brak pojęć przy tym progu" także dla dokumentu,
  // który nie ma policzonych pojęć w ogóle — czyli podaje wyjaśnienie, które jest
  // nieprawdziwe i sugeruje, że obniżenie progu coś przywróci.
  const wysoki = await getGraphData('k1', { client: fakeClient(stanZeMostami()), minMentions: 9999 });
  const wgId = new Map(wysoki.documents.map((d) => [d.id, d]));
  assert.equal(wgId.get('d1').conceptCount, 103, 'd1 MA pojęcia, choć próg je odsiał');
  assert.ok(
    !wysoki.edges.some((e) => e.documentId === 'd1' && e.conceptId.startsWith('c-drobne')),
    'ale odsiane pojęcia nie mają krawędzi'
  );

  const bezPojec = stanZeMostami();
  bezPojec.rag_documents.push({ id: 'd9', collection_id: 'k1', file_name: 'rodo.pdf', chunk_count: 504, created_at: '2026-01-09' });
  const g = await getGraphData('k1', { client: fakeClient(bezPojec) });
  const rodo = g.documents.find((d) => d.id === 'd9');
  assert.equal(rodo.conceptCount, 0, 'dokument bez policzonych pojęć ma zero');
  assert.equal(rodo.chunkCount, 504, 'ale ma fragmenty — to nie jest „brak tekstu"');
});

test('próg NIE rusza dokumentów — dokument bez pojęć zostaje przygaszony, nie ukryty', async () => {
  // W trybie „tylko mosty" na Regulaminach dwa dokumenty wiszą bez krawędzi (RODO
  // bez policzonych pojęć i skan bez tekstu). To jest prawidłowe i ma zostać widoczne.
  const { documents, edges } = await getGraphData('k1', {
    client: fakeClient(stanZeMostami()),
    tylkoMosty: true,
  });
  assert.equal(documents.length, 2, 'oba dokumenty zostają w grafie');
  const zKrawedziami = new Set(edges.map((e) => e.documentId));
  assert.ok(zKrawedziami.size <= documents.length);
});

test('próg spoza zakresu → invalid_input, a nie cicha domyślna jedynka', async () => {
  const client = fakeClient(stanZeMostami());
  for (const zly of ['abc', 0, -3, '']) {
    await assert.rejects(
      () => getGraphData('k1', { client, minMentions: zly }),
      (e) => e.code === 'invalid_input',
      `„${zly}" musi zostać odrzucone`
    );
  }
});

test('próg podany tekstem z adresu URL działa jak liczba', async () => {
  const { totals } = await getGraphData('k1', {
    client: fakeClient(stanZeMostami()),
    minMentions: '2',
  });
  assert.equal(totals.shown, 3);
});

// =============================================================================
//  DETERMINIZM KOLEJNOŚCI (12.9)
//
//  Kolejność wierszy nie jest szczegółem: decyduje o kolorze dokumentu i o pozycji
//  startowej węzła w spirali. Przy setkach pojęć z mention_count = 1 remis jest
//  regułą, więc bez klucza rozstrzygającego ta sama kolekcja układałaby się inaczej
//  przy każdym wejściu na stronę — to ten sam rodzaj nieuczciwości co Math.random().
// =============================================================================

test('sortowanie pojęć ma KLUCZ ROZSTRZYGAJĄCY remisy, nie tylko mention_count', async () => {
  const client = fakeClient(stanZeMostami());
  await getGraphData('k1', { client });
  const pojecia = client.spy.orders.filter((o) => o[0] === 'rag_concepts');
  assert.deepEqual(pojecia, [
    ['rag_concepts', 'mention_count', 'desc'],
    ['rag_concepts', 'id', 'asc'],
  ]);
});

test('dokumenty i powiązania też sortują się stabilnie', async () => {
  const client = fakeClient(stanZeMostami());
  await getGraphData('k1', { client });
  assert.deepEqual(
    client.spy.orders.filter((o) => o[0] === 'rag_documents'),
    [
      ['rag_documents', 'created_at', 'asc'],
      ['rag_documents', 'id', 'asc'],
    ]
  );
  // Stronicowanie po samym chunk_id gubiłoby wiersze na granicy stron: jeden
  // fragment ma po kilka pojęć, więc remis jest pewny.
  const linki = client.spy.orders.filter((o) => o[0] === 'rag_chunk_concepts');
  assert.deepEqual(linki[0], ['rag_chunk_concepts', 'chunk_id', 'asc']);
  assert.deepEqual(linki[1], ['rag_chunk_concepts', 'concept_id', 'asc']);
});

test('dwa przebiegi tych samych danych dają IDENTYCZNĄ kolejność węzłów', async () => {
  const raz = await getGraphData('k1', { client: fakeClient(stanZeMostami()), minMentions: 2 });
  const dwa = await getGraphData('k1', { client: fakeClient(stanZeMostami()), minMentions: 2 });
  assert.deepEqual(raz.concepts.map((c) => c.id), dwa.concepts.map((c) => c.id));
  assert.deepEqual(raz.documents.map((d) => d.id), dwa.documents.map((d) => d.id));
});

test('pojęcia powyżej 1000 wierszy są czytane w całości, nie ucięte po pierwszej stronie', async () => {
  // Ta sama pułapka co przy powiązaniach: odczyt bez .range() oddaje max 1000 wierszy,
  // a wynik i tak wygląda wiarygodnie. Po Kodeksie jest 565 pojęć — do progu zostało
  // mniej niż dwa razy tyle.
  const state = stanPodstawowy();
  state.rag_concepts = [];
  state.rag_chunk_concepts = [];
  for (let i = 0; i < 1200; i++) {
    state.rag_concepts.push({ id: 'c' + i, collection_id: 'k1', label: 'p' + i, mention_count: 1, merged_into: null });
  }
  const { totals } = await getGraphData('k1', { client: fakeClient(state) });
  assert.equal(totals.concepts, 1200, 'wszystkie 1200 pojęć, nie 1000');
});

// =============================================================================
//  PRZYPADKI BRZEGOWE
// =============================================================================

test('kolekcja bez pojęć zwraca dokumenty i pustą resztę, nie błąd', async () => {
  const state = stanPodstawowy();
  state.rag_concepts = [];
  const { documents, concepts, edges } = await getGraphData('k1', { client: fakeClient(state) });
  assert.equal(documents.length, 3);
  assert.deepEqual(concepts, []);
  assert.deepEqual(edges, []);
});

test('nieistniejąca kolekcja → not_found', async () => {
  await assert.rejects(
    () => getGraphData('kX', { client: fakeClient(stanPodstawowy()) }),
    (e) => e.code === 'not_found'
  );
});

test('brak identyfikatora → invalid_input, bez dotykania bazy', async () => {
  const client = fakeClient(stanPodstawowy());
  await assert.rejects(() => getGraphData('', { client }), (e) => e.code === 'invalid_input');
  assert.equal(client.spy.ranges.length, 0);
});

// =============================================================================
//  „pokazano 30 z 312" — CAŁA ŚCIEŻKA, bez 312 fragmentów w bazie
//
//  DoD Sesji 9 wymaga tego napisu przy pojęciu z 300+ fragmentami. Takie pojęcie
//  powstanie dopiero po przepuszczeniu Kodeksu. Regułę da się jednak sprawdzić
//  na atrapie: 312 powiązań, limit 30, sprawdzamy że `total` mówi prawdę o CAŁOŚCI,
//  a `chunks` zawiera tylko tyle, ile obiecano.
// =============================================================================

test('DoD: 312 powiązań przy limicie 30 → chunks 30, total 312', async () => {
  const state = stanPodstawowy();
  state.rag_chunks = [];
  state.rag_chunk_concepts = [];
  for (let i = 0; i < 312; i++) {
    const id = 'f' + String(i).padStart(4, '0');
    state.rag_chunks.push({
      id,
      collection_id: 'k1',
      document_id: i % 2 ? 'd1' : 'd2',
      chunk_index: i,
      content: 'treść ' + i,
      heading_path: 'Rozdział I',
      page_from: 1,
    });
    state.rag_chunk_concepts.push({ chunk_id: id, concept_id: 'c-urlop' });
  }
  state.rag_concepts = state.rag_concepts.map((c) =>
    c.id === 'c-urlop' ? { ...c, collection_id: 'k1' } : c
  );

  const { chunks, total } = await searchByConcept(
    { collectionId: 'k1', conceptId: 'c-urlop', limit: 30 },
    { client: fakeClient(state) }
  );

  assert.equal(total, 312, 'total to CAŁOŚĆ, nie liczba zwróconych');
  assert.equal(chunks.length, 30, 'zwracamy dokładnie limit, nie 312 węzłów na canvas');
  // Fragmenty z RÓŻNYCH dokumentów — po to jest graf.
  assert.ok(new Set(chunks.map((c) => c.documentId)).size > 1);
});
