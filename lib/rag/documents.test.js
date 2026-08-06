import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  embedNextBatch,
  getEmbedProgress,
  ingestFile,
  deleteDocument,
  sanitizeStorageName,
  udzialPodejrzanychLiter,
} from './documents.js';

// --- Minimalny fake klienta Supabase: tyle metod, ile używa rdzeń dokumentów. ---
// In-memory tabele; łańcuchy from().select().eq().is().order().limit()/single()/update()
// /insert()/delete(), plus atrapa storage z zapisem wywołań upload/remove.
let seq = 0;
function nextId(prefix) {
  seq += 1;
  return `${prefix}-${seq}`;
}

class Query {
  constructor(state, name) {
    this.state = state;
    this.name = name;
    this.filters = [];
    this._count = false;
    this._head = false;
    this._limit = null;
    this._update = null;
    this._insert = null;
    this._delete = false;
    this._range = null;
  }
  select(_fields, opts) {
    if (opts && opts.count) this._count = true;
    if (opts && opts.head) this._head = true;
    return this;
  }
  eq(col, val) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  is(col, val) {
    this.filters.push((r) => {
      const isNull = r[col] === null || r[col] === undefined;
      return val === null ? isNull : !isNull;
    });
    return this;
  }
  not(col, op, val) {
    if (op === 'is' && val === null) {
      this.filters.push((r) => r[col] !== null && r[col] !== undefined);
    }
    return this;
  }
  order() {
    return this;
  }
  limit(n) {
    this._limit = n;
    return this;
  }
  range(from, to) {
    this._range = [from, to];
    return this;
  }
  update(patch) {
    this._update = patch;
    return this;
  }
  insert(payload) {
    const rows = (Array.isArray(payload) ? payload : [payload]).map((r) => ({
      id: r.id || nextId(this.name),
      ...r,
    }));
    if (!this.state[this.name]) this.state[this.name] = [];
    this.state[this.name].push(...rows);
    this._insert = rows;
    return this;
  }
  delete(opts) {
    this._delete = true;
    if (opts && opts.count) this._count = true;
    return this;
  }
  _rows() {
    let rows = this.state[this.name] || [];
    for (const f of this.filters) rows = rows.filter(f);
    return rows;
  }
  async single() {
    if (this._insert) return { data: this._insert[0], error: null };
    const rows = this._rows();
    if (rows.length === 0) return { data: null, error: { message: 'not found' } };
    return { data: rows[0], error: null };
  }
  async maybeSingle() {
    if (this._insert) return { data: this._insert[0], error: null };
    const rows = this._rows();
    return { data: rows[0] || null, error: null };
  }
  then(resolve) {
    if (this._insert) {
      return resolve({ data: this._insert, error: null, count: this._insert.length });
    }
    if (this._delete) {
      const doomed = new Set(this._rows());
      const before = this.state[this.name] || [];
      this.state[this.name] = before.filter((r) => !doomed.has(r));
      return resolve({ data: null, error: null, count: doomed.size });
    }
    if (this._update) {
      const rows = this._rows();
      for (const r of rows) Object.assign(r, this._update);
      return resolve({ data: null, error: null, count: rows.length });
    }
    if (this._count && this._head) {
      return resolve({ count: this._rows().length, error: null, data: null });
    }
    let rows = this._rows();
    if (this._range) rows = rows.slice(this._range[0], this._range[1] + 1);
    if (this._limit != null) rows = rows.slice(0, this._limit);
    return resolve({ data: rows, error: null });
  }
}

// storageBehavior.removeError — pozwala udawać Storage, który zgłasza brak obiektu.
function makeFakeClient(state, storageBehavior = {}) {
  state.uploads = state.uploads || [];
  state.removes = state.removes || [];
  return {
    from: (name) => new Query(state, name),
    // rag_set_chunk_coords — ta sama funkcja bazodanowa, której używa map.js.
    async rpc(name, args) {
      if (name !== 'rag_set_chunk_coords') return { data: null, error: { code: 'PGRST202', message: name } };
      for (const r of args.p_rows) {
        const c = (state.rag_chunks || []).find((x) => x.id === r.id);
        if (c) {
          c.coord_x = r.x;
          c.coord_y = r.y;
          c.coord_z = r.z;
          c.neighbors = r.neighbors;
        }
      }
      return { data: args.p_rows.length, error: null };
    },
    storage: {
      from: () => ({
        async upload(path, bytes, opts) {
          state.uploads.push({ path, bytes, opts });
          return { data: { path }, error: null };
        },
        async remove(paths) {
          state.removes.push(...paths);
          if (storageBehavior.removeError) {
            return { data: null, error: { message: storageBehavior.removeError } };
          }
          return { data: paths.map((p) => ({ name: p })), error: null };
        },
      }),
    },
  };
}

function mockProvider() {
  return {
    async embedDocuments(texts) {
      return texts.map(() => [0.1, 0.2, 0.3]);
    },
    async embedQuery() {
      return [0.1, 0.2, 0.3];
    },
  };
}

function makeState(nChunks, embedModel = 'bge-m3', docStatus = 'chunked', embedProvider = 'ollama') {
  const chunks = [];
  for (let i = 0; i < nChunks; i++) {
    chunks.push({ id: 'c' + i, document_id: 'd1', collection_id: 'k1', chunk_index: i, content: 'tekst ' + i, heading_path: null, embedding: null });
  }
  return {
    rag_documents: [{ id: 'd1', status: docStatus, collection_id: 'k1' }],
    rag_chunks: chunks,
    rag_collections: [{ id: 'k1', embed_provider: embedProvider, embed_model: embedModel, embed_dim: 1024 }],
  };
}

async function withBatch(n, fn) {
  const prev = process.env.RAG_EMBED_BATCH;
  process.env.RAG_EMBED_BATCH = String(n);
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.RAG_EMBED_BATCH;
    else process.env.RAG_EMBED_BATCH = prev;
  }
}

// Atrapa klienta obsługuje tylko to, czego potrzebuje SAMO indeksowanie — nie ma
// np. `.in()`, którego używa ścieżka rzutowania. Odkąd nieudane rzutowanie przestało
// znikać w cichym `catch` i wraca jako `mapaBlad`, te testy muszą odsiać to pole:
// sprawdzają postęp indeksowania, a nie mapę. Sama obecność `mapaBlad` jest tu
// spodziewana i nie świadczy o usterce.
const bezMapy = ({ mapaBlad, documents, builtAt, ...reszta }) => reszta;

test('embedNextBatch liczy JEDNĄ partię i raportuje postęp', async () => {
  await withBatch(2, async () => {
    const state = makeState(5);
    const deps = { client: makeFakeClient(state), provider: mockProvider() };
    const r = await embedNextBatch('d1', deps);
    assert.deepEqual(bezMapy(r), { done: 2, total: 5, finished: false });
    // dokładnie 2 fragmenty dostały wektor
    assert.equal(state.rag_chunks.filter((c) => c.embedding != null).length, 2);
    assert.equal(state.rag_documents[0].status, 'embedding');
  });
});

test('wznawialność: kolejne wywołania kończą dokument bez dublowania', async () => {
  await withBatch(2, async () => {
    const state = makeState(5);
    const deps = { client: makeFakeClient(state), provider: mockProvider() };

    const r1 = await embedNextBatch('d1', deps); // 2/5
    const r2 = await embedNextBatch('d1', deps); // 4/5
    const r3 = await embedNextBatch('d1', deps); // 5/5 finished

    assert.deepEqual(bezMapy(r1), { done: 2, total: 5, finished: false });
    assert.deepEqual(bezMapy(r2), { done: 4, total: 5, finished: false });
    assert.deepEqual(bezMapy(r3), { done: 5, total: 5, finished: true });

    // wszystkie mają wektor, każdy dokładnie raz (brak dubli, brak pominięć)
    assert.equal(state.rag_chunks.filter((c) => c.embedding != null).length, 5);
    assert.equal(state.rag_documents[0].status, 'ready');
  });
});

test('wznawialność po "przerwaniu": ponowne wywołanie kontynuuje od null', async () => {
  await withBatch(2, async () => {
    const state = makeState(5);
    const deps = { client: makeFakeClient(state), provider: mockProvider() };
    await embedNextBatch('d1', deps); // 2/5, "przerwanie" tutaj
    // symulujemy nowy proces: ten sam stan bazy, nowe wywołanie
    const r = await embedNextBatch('d1', deps);
    assert.equal(r.done, 4);
    assert.equal(r.finished, false);
    // pierwsze dwa wektory nietknięte (nie policzone od nowa)
    assert.ok(state.rag_chunks[0].embedding != null && state.rag_chunks[1].embedding != null);
  });
});

test('wywołanie po zakończeniu → finished, done=total, status ready', async () => {
  await withBatch(10, async () => {
    const state = makeState(3);
    const deps = { client: makeFakeClient(state), provider: mockProvider() };
    await embedNextBatch('d1', deps); // wszystko naraz (batch 10 > 3)
    const r = await embedNextBatch('d1', deps); // nic już nie zostało
    assert.deepEqual(bezMapy(r), { done: 3, total: 3, finished: true });
    assert.equal(state.rag_documents[0].status, 'ready');
  });
});

// ODWRÓCONE W RUNDZIE 3. Ten test brzmiał „model_mismatch: kolekcja na innym
// modelu niż konfiguracja" i pilnował strażnika, który porównywał parę kolekcji
// z konfiguracją serwera. Ta reguła zniknęła razem z powodem: kolekcja napędza
// teraz własnego dostawcę, więc inny model niż w konfiguracji to NORMA.
test('kolekcja na innym modelu niż konfiguracja indeksuje się NORMALNIE', async () => {
  await withBatch(2, async () => {
    const state = makeState(3, 'nomic-embed-text');
    const deps = { client: makeFakeClient(state), provider: mockProvider() };
    const r = await embedNextBatch('d1', deps);
    assert.deepEqual(r, { done: 2, total: 3, finished: false });
  });
});

test('model_mismatch: dostawca kolekcji bez implementacji → odmowa PRZED zapisem', async () => {
  await withBatch(2, async () => {
    const state = makeState(3, 'voyage-3', 'chunked', 'voyage');
    const deps = { client: makeFakeClient(state), provider: mockProvider() };
    await assert.rejects(() => embedNextBatch('d1', deps), (e) => e.code === 'model_mismatch');
    // Status dokumentu NIETKNIĘTY — odmowa poszła przed przestawieniem na 'embedding'.
    assert.equal(state.rag_documents[0].status, 'chunked');
    assert.equal(state.rag_chunks.filter((c) => c.embedding != null).length, 0);
  });
});

test('dokument no_text: nic nie liczy, zwraca finished', async () => {
  await withBatch(2, async () => {
    const state = makeState(0, 'bge-m3', 'no_text');
    const deps = { client: makeFakeClient(state), provider: mockProvider() };
    const r = await embedNextBatch('d1', deps);
    assert.deepEqual(r, { done: 0, total: 0, finished: true });
  });
});

// --- getEmbedProgress: to z niego pasek bierze punkt startowy po przerwaniu ---

test('getEmbedProgress po przerwaniu zwraca stan z bazy, nie zero', async () => {
  await withBatch(2, async () => {
    const state = makeState(7);
    const deps = { client: makeFakeClient(state), provider: mockProvider() };
    await embedNextBatch('d1', deps); // 2/7
    await embedNextBatch('d1', deps); // 4/7 — tu "Przerwij"

    const p = await getEmbedProgress('d1', { client: deps.client });
    assert.deepEqual(bezMapy(p), { done: 4, total: 7, finished: false });
  });
});

test('getEmbedProgress niczego nie liczy ani nie zmienia statusu', async () => {
  await withBatch(2, async () => {
    const state = makeState(7);
    const deps = { client: makeFakeClient(state), provider: mockProvider() };
    await embedNextBatch('d1', deps); // 2/7, status 'embedding'

    const przed = state.rag_chunks.map((c) => c.embedding);
    await getEmbedProgress('d1', { client: deps.client });
    await getEmbedProgress('d1', { client: deps.client });

    assert.deepEqual(state.rag_chunks.map((c) => c.embedding), przed, 'odczyt nie może dopisać wektorów');
    assert.equal(state.rag_documents[0].status, 'embedding', 'odczyt nie może ruszać statusu');
  });
});

test('getEmbedProgress: dokument w całości policzony → finished', async () => {
  await withBatch(10, async () => {
    const state = makeState(3);
    const deps = { client: makeFakeClient(state), provider: mockProvider() };
    await embedNextBatch('d1', deps);
    assert.deepEqual(bezMapy(await getEmbedProgress('d1', { client: deps.client })), { done: 3, total: 3, finished: true });
  });
});

// --- sanitizeStorageName: klucz Storage znosi tylko wąski ASCII -----------------
// Regresja: „Wykaz częstotliwości Rife.pdf" wywracał upload na "Invalid key".

test('polskie diakrytyki → ASCII, z ł/Ł włącznie', () => {
  assert.equal(sanitizeStorageName('Zażółć gęślą jaźń.txt'), 'Zazolc-gesla-jazn.txt');
  assert.equal(sanitizeStorageName('ŁÓDŹ-ŚĆĘĄŃŻ.pdf'), 'LODZ-SCEANZ.pdf');
  // NFD obejmuje resztę łacinki bez wypisywania alfabetów
  assert.equal(sanitizeStorageName('café-über-façade.md'), 'cafe-uber-facade.md');
});

test('spacje i znaki specjalne → pojedynczy myślnik', () => {
  assert.equal(sanitizeStorageName('Wykaz częstotliwości Rife.pdf'), 'Wykaz-czestotliwosci-Rife.pdf');
  assert.equal(sanitizeStorageName('raport (kopia), v2 #3 & final?.pdf'), 'raport-kopia-v2-3-final.pdf');
  assert.equal(sanitizeStorageName('a   b.txt'), 'a-b.txt', 'ciąg spacji zwija się do jednego myślnika');
});

test('kropki w środku nazwy nie gubią rozszerzenia', () => {
  assert.equal(sanitizeStorageName('raport.v2.final.pdf'), 'raport.v2.final.pdf');
  assert.equal(sanitizeStorageName('bez-rozszerzenia'), 'bez-rozszerzenia');
});

test('nazwa złożona wyłącznie ze znaków niedozwolonych → plik + rozszerzenie', () => {
  assert.equal(sanitizeStorageName('###.pdf'), 'plik.pdf');
  assert.equal(sanitizeStorageName('...pdf'), 'plik.pdf');
  assert.equal(sanitizeStorageName('   .pdf'), 'plik.pdf');
  assert.equal(sanitizeStorageName(''), 'plik');
});

test('nazwa dłuższa niż limit → obcięty rdzeń, rozszerzenie zachowane', () => {
  const out = sanitizeStorageName('ą'.repeat(400) + '.pdf');
  assert.ok(out.length <= 120, `segment ma ${out.length} znaków`);
  assert.ok(out.endsWith('.pdf'), 'obcinamy rdzeń, nie rozszerzenie');
  assert.ok(/^a+\.pdf$/.test(out));
});

test('wynik zawsze mieści się w dozwolonym zbiorze znaków klucza', () => {
  const próbki = [
    'Wykaz częstotliwości Rife.pdf',
    'CV — Jan Kowalski (2026).docx',
    '„cytat" i 100% pewności.md',
    'plik\tz\nbiałymi znakami.txt',
    'emoji 🎉 w nazwie.csv',
  ];
  for (const p of próbki) {
    assert.match(sanitizeStorageName(p), /^[A-Za-z0-9][A-Za-z0-9._-]*$/, `nazwa: ${p}`);
  }
});

// --- ingestFile: nazwa wyświetlana vs klucz Storage ----------------------------

const MD = new TextEncoder().encode(
  '# Rozdział pierwszy\n\nTreść akapitu wystarczająco długa, żeby nie wpaść w ścieżkę no_text.\n'
);

function makeIngestState() {
  return {
    rag_collections: [{ id: 'k1', name: 'Regulaminy', embed_model: 'bge-m3', embed_dim: 1024, status: 'ready' }],
    rag_documents: [],
    rag_chunks: [],
  };
}

test('ingestFile: file_name zostaje z ogonkami, sanityzowany jest tylko klucz Storage', async () => {
  const state = makeIngestState();
  const client = makeFakeClient(state);
  const file = {
    name: 'Wykaz częstotliwości Rife.md',
    mimeType: 'text/markdown',
    size: MD.length,
    bytes: MD,
  };

  const doc = await ingestFile({ collectionId: 'k1', file }, { client });

  // To jest sedno poprawki: nazwa wyświetlana nietknięta…
  assert.equal(doc.fileName, 'Wykaz częstotliwości Rife.md');
  assert.equal(state.rag_documents[0].file_name, 'Wykaz częstotliwości Rife.md');

  // …a klucz w Storage czysto ASCII, jako trzeci segment {kolekcja}/{dokument}/{nazwa}.
  assert.equal(state.uploads.length, 1);
  const segmenty = state.uploads[0].path.split('/');
  assert.equal(segmenty.length, 3);
  assert.equal(segmenty[0], 'k1');
  assert.equal(segmenty[2], 'Wykaz-czestotliwosci-Rife.md');
  assert.equal(doc.filePath, state.uploads[0].path);
  assert.equal(doc.status, 'chunked');
});

test('ingestFile: dwa pliki o tej samej zsanityzowanej nazwie nie kolidują (UUID w ścieżce)', async () => {
  const state = makeIngestState();
  const client = makeFakeClient(state);
  const wspólne = { mimeType: 'text/markdown', size: MD.length, bytes: MD };

  await ingestFile({ collectionId: 'k1', file: { ...wspólne, name: 'raport ą.md' } }, { client });
  await ingestFile({ collectionId: 'k1', file: { ...wspólne, name: 'raport-a.md' } }, { client });

  const [a, b] = state.uploads.map((u) => u.path);
  assert.notEqual(a, b, 'różne documentId dają różne katalogi');
  assert.equal(a.split('/')[2], b.split('/')[2], 'sama nazwa po sanityzacji — i to jest OK');
});

// --- deleteDocument: sierota po nieudanym uploadzie -----------------------------

test('deleteDocument usuwa wiersz bez file_path (sierota po padniętym uploadzie)', async () => {
  const state = {
    rag_documents: [{ id: 'd1', collection_id: 'k1', file_name: 'Wykaz częstotliwości Rife.pdf', file_path: null, status: 'error' }],
    rag_chunks: [],
  };
  const client = makeFakeClient(state);

  assert.deepEqual(await deleteDocument('d1', { client }), { id: 'd1', deleted: true });
  assert.equal(state.rag_documents.length, 0);
  assert.equal(state.removes.length, 0, 'nie ma czego kasować w Storage');
});

test('deleteDocument nie wywraca się, gdy obiektu nie ma w Storage', async () => {
  const state = {
    rag_documents: [{ id: 'd1', collection_id: 'k1', file_path: 'k1/d1/plik.pdf', status: 'error' }],
    rag_chunks: [],
  };
  const client = makeFakeClient(state, { removeError: 'Object not found' });

  assert.deepEqual(await deleteDocument('d1', { client }), { id: 'd1', deleted: true });
  assert.equal(state.rag_documents.length, 0);
});

test('deleteDocument kasuje wiersz i DOKŁADNIE ten obiekt, na który wskazuje file_path', async () => {
  // Ścieżka jest sanityzowana (10.a.3), więc do Storage MUSI pójść zapisany file_path,
  // a nie cokolwiek złożonego na nowo z file_name — inaczej plik z polskimi znakami
  // w nazwie zostałby w buckecie jako sierota.
  const state = {
    rag_documents: [
      { id: 'd1', collection_id: 'k1', file_name: 'Wykaz częstotliwości Rife.pdf', file_path: 'k1/d1/Wykaz-czestotliwosci-Rife.pdf', status: 'ready' },
      { id: 'd2', collection_id: 'k1', file_path: 'k1/d2/inny.pdf', status: 'ready' },
    ],
    rag_chunks: [],
  };
  const client = makeFakeClient(state);

  assert.deepEqual(await deleteDocument('d1', { client }), { id: 'd1', deleted: true });
  assert.deepEqual(state.removes, ['k1/d1/Wykaz-czestotliwosci-Rife.pdf']);
  assert.deepEqual(state.rag_documents.map((d) => d.id), ['d2'], 'sąsiedni dokument nietknięty');
});

test('deleteDocument nieistniejącego dokumentu → not_found', async () => {
  const client = makeFakeClient({ rag_documents: [], rag_chunks: [] });
  await assert.rejects(() => deleteDocument('dX', { client }), (e) => e.code === 'not_found');
});

test('deleteDocument bez identyfikatora → invalid_input', async () => {
  await assert.rejects(() => deleteDocument(''), (e) => e.code === 'invalid_input');
});

// --- Sesja 6b: partia oddaje nowe punkty mapie (12.4 + 12.6) ----------------------
//
// Regresja, którą to zamyka: embedNextBatch rzutował fragmenty WYŁĄCZNIE przy
// finished: true, więc dokument na 1283 fragmenty nie dawał mapie ani jednego punktu
// przez 40 partii, a "połączenia na żywo" z DoD 6b nie miały z czego powstać.

// Baza rzutowania tożsamościowa: mean = 0, składowe = osie. Dzięki temu wynik rzutu
// jest przewidywalny i test nie sprawdza PCA (to robi pca.test.js), tylko przepływ.
function bazaTozsamosciowa(chunkCount) {
  return {
    method: 'pca',
    mean: [0, 0, 0],
    components: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    viewport: { xMin: -1, xMax: 1, yMin: -1, yMax: 1, zMin: -1, zMax: 1 },
    chunkCount,
    embedModel: 'bge-m3',
    builtAt: '2026-07-01T00:00:00.000Z',
  };
}

function makeStateZMapa(nChunks) {
  const chunks = [];
  for (let i = 0; i < nChunks; i++) {
    chunks.push({
      id: 'c' + i,
      document_id: 'd1',
      collection_id: 'k1',
      chunk_index: i,
      content: 'tekst   ' + i,
      heading_path: 'Rozdział 1',
      page_from: 2,
      embedding: null,
      coord_x: null,
      coord_y: null,
      coord_z: null,
      neighbors: null,
    });
  }
  return {
    rag_documents: [{ id: 'd1', status: 'chunked', collection_id: 'k1' }],
    rag_chunks: chunks,
    // chunkCount bazy ustawiony wysoko, żeby przyrost nie przekroczył progu 30%
    // i test dotyczył ścieżki przyrostowej, nie przeliczenia.
    rag_collections: [{ id: 'k1', embed_model: 'bge-m3', projection: bazaTozsamosciowa(1000) }],
  };
}

test('partia W ŚRODKU dokumentu zwraca newChunks — bez tego mapa nie ma z czego żyć', async () => {
  await withBatch(2, async () => {
    const state = makeStateZMapa(5);
    const r = await embedNextBatch('d1', { client: makeFakeClient(state), provider: mockProvider() });

    assert.equal(r.finished, false, 'to ma być partia w środku dokumentu');
    assert.ok(Array.isArray(r.newChunks), 'brak newChunks = mapa znowu musi odpytywać całą kolekcję');
    assert.equal(r.newChunks.length, 2);
    assert.equal(r.recalculated, undefined);

    // Kształt zgodny z getMapData().chunks — klient dokleja to do tej samej tablicy.
    const c = r.newChunks[0];
    assert.deepEqual(
      Object.keys(c).sort(),
      ['documentId', 'headingPath', 'id', 'neighbors', 'pageFrom', 'preview', 'x', 'y', 'z']
    );
    assert.equal(c.documentId, 'd1');
    assert.equal(c.pageFrom, 2);
    assert.equal(c.preview, 'tekst 0', 'preview znormalizowany jak w getMapData');
    assert.ok(typeof c.x === 'number' && typeof c.z === 'number');
    assert.ok(Array.isArray(c.neighbors) && c.neighbors.length > 0, 'nowy punkt ma połączenia od razu');
  });
});

test('współrzędne trafiają do bazy po KAŻDEJ partii, nie tylko na końcu dokumentu', async () => {
  await withBatch(2, async () => {
    const state = makeStateZMapa(5);
    const deps = { client: makeFakeClient(state), provider: mockProvider() };

    await embedNextBatch('d1', deps);
    assert.equal(state.rag_chunks.filter((c) => c.coord_x !== null).length, 2);

    await embedNextBatch('d1', deps);
    assert.equal(state.rag_chunks.filter((c) => c.coord_x !== null).length, 4);
  });
});

test('fragmenty bez wektora NIE dostają współrzędnych (rzut tylko tego, co policzone)', async () => {
  await withBatch(2, async () => {
    const state = makeStateZMapa(5);
    await embedNextBatch('d1', { client: makeFakeClient(state), provider: mockProvider() });
    for (const c of state.rag_chunks) {
      if (c.embedding == null) assert.equal(c.coord_x, null, 'fragment bez wektora nie ma czego rzutować');
    }
  });
});

test('awaria mapy nie wywraca indeksowania — wektory zostają policzone', async () => {
  await withBatch(2, async () => {
    const state = makeStateZMapa(5);
    // Baza rzutowania bez `components` → rzut przyrostowy odmawia pracy.
    state.rag_collections[0].projection = { method: 'pca', chunkCount: 1000 };
    const r = await embedNextBatch('d1', { client: makeFakeClient(state), provider: mockProvider() });

    assert.equal(r.done, 2, 'partia musi się policzyć nawet bez mapy');
    assert.equal(r.newChunks, undefined);
    assert.equal(state.rag_chunks.filter((c) => c.embedding != null).length, 2);
  });
});

// --- 10.a.1: ostrzeżenie o uszkodzonym kodowaniu ---------------------------------
//
// W ludzie-bezdomni.pdf "j" wydobywa się jako telugu "గ", a "dz" jako "ǳ" (U+01F3).
// Zmierzone na korpusie: poprawne dokumenty mają 0,000%, ten plik 2,835%.

test('poprawny polski tekst ma zerowy udział podejrzanych liter', () => {
  const t = 'Zażółć gęślą jaźń. Pracownik ma prawo do urlopu wypoczynkowego w wymiarze 26 dni.';
  assert.equal(udzialPodejrzanychLiter(t), 0);
});

test('znaki spoza łacinki są liczone jako podejrzane', () => {
  // Dokładnie wzorzec z pliku: "podobnie గak tysiące innych".
  const t = 'podobnie గak tysiące innych';
  const u = udzialPodejrzanychLiter(t);
  assert.ok(u > 0, 'telugu w polskim zdaniu musi zostać zauważone');
  assert.ok(u < 0.1, 'jedna litera na zdanie to niewielki udział');
});

test('dwuznak ǳ (U+01F3) też jest podejrzany — Latin Extended-B', () => {
  assert.ok(udzialPodejrzanychLiter('bawiły się blade ǳieci') > 0);
});

test('typografia, cyfry i interpunkcja NIE psują wyniku', () => {
  // Liczymy po literach właśnie po to: „cudzysłowy", —, ¹, § i liczby są w porządku.
  const t = '§ 5. „Pracownik" — zgodnie z art. 3¹ ustawy (Dz.U. 2026, poz. 25) — ma prawo…';
  assert.equal(udzialPodejrzanychLiter(t), 0);
});

test('akcenty zachodnioeuropejskie są w porządku — to nie uszkodzenie', () => {
  assert.equal(udzialPodejrzanychLiter('café über façade señor'), 0);
});

test('pusty tekst nie dzieli przez zero', () => {
  assert.equal(udzialPodejrzanychLiter(''), 0);
  assert.equal(udzialPodejrzanychLiter(null), 0);
  assert.equal(udzialPodejrzanychLiter('123 456 !!!'), 0);
});

test('tekst w całości spoza łacinki daje 100%', () => {
  assert.equal(udzialPodejrzanychLiter('это кириллица'), 1);
});
