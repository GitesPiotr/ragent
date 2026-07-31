import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVector,
  getMapData,
  buildCollectionProjection,
  refreshProjectionAfterIndexing,
  projectPendingChunks,
  bazaNieaktualna,
} from './map.js';

// --- Mini-silnik zapytań w pamięci: tyle Supabase, ile używa map.js ---------------
// Obsługuje eq / not(is,null) / is(null) / order / range / single / update / rpc,
// żeby dało się przetestować stronicowanie i zapis BEZ bazy.
class Q {
  constructor(state, table, spy) {
    this.state = state;
    this.table = table;
    this.spy = spy;
    this.filters = [];
    this._count = false;
    this._head = false;
    this._order = null;
    this._range = null;
    this._update = null;
  }
  select(_c, opts) {
    if (opts && opts.count) this._count = true;
    if (opts && opts.head) this._head = true;
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
  not(col, op, val) {
    if (op === 'is' && val === null) this.filters.push((r) => r[col] !== null && r[col] !== undefined);
    return this;
  }
  is(col, val) {
    if (val === null) this.filters.push((r) => r[col] === null || r[col] === undefined);
    return this;
  }
  order(col, opts) {
    this._order = { col, asc: !opts || opts.ascending !== false };
    return this;
  }
  range(from, to) {
    this._range = [from, to];
    this.spy.ranges.push([from, to]);
    return this;
  }
  update(patch) {
    this._update = patch;
    return this;
  }
  _rows() {
    let rows = (this.state[this.table] || []).slice();
    for (const f of this.filters) rows = rows.filter(f);
    if (this._order) {
      const { col, asc } = this._order;
      rows.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0));
      if (!asc) rows.reverse();
    }
    if (this._range) rows = rows.slice(this._range[0], this._range[1] + 1);
    return rows;
  }
  async single() {
    const rows = this._rows();
    if (!rows.length) return { data: null, error: { message: 'not found' } };
    return { data: rows[0], error: null };
  }
  then(resolve) {
    if (this._update) {
      const rows = this._rows();
      for (const r of rows) Object.assign(r, this._update);
      return resolve({ data: null, error: null });
    }
    if (this._count && this._head) return resolve({ count: this._rows().length, error: null, data: null });
    return resolve({ data: this._rows(), error: null });
  }
}

function fakeClient(state) {
  const spy = { ranges: [], rpcCalls: [], rpcRows: 0 };
  const client = {
    spy,
    from: (t) => new Q(state, t, spy),
    async rpc(name, args) {
      spy.rpcCalls.push(name);
      if (name === 'rag_set_chunk_coords') {
        const rows = args.p_rows;
        spy.rpcRows += rows.length;
        for (const r of rows) {
          const chunk = state.rag_chunks.find((c) => c.id === r.id);
          if (chunk) {
            chunk.coord_x = r.x;
            chunk.coord_y = r.y;
            chunk.coord_z = r.z;
            chunk.neighbors = r.neighbors;
          }
        }
        return { data: rows.length, error: null };
      }
      return { data: null, error: { code: 'PGRST202', message: 'nieznana funkcja ' + name } };
    },
  };
  return client;
}

function wektor(i, dim = 4) {
  const v = [];
  for (let k = 0; k < dim; k++) v.push(Math.sin(i * (k + 1) * 0.7) * (k + 1));
  return '[' + v.join(',') + ']';
}

function makeState(nChunks, { projection = null, docStatus = 'ready' } = {}) {
  const chunks = [];
  for (let i = 0; i < nChunks; i++) {
    chunks.push({
      id: 'c' + String(i).padStart(4, '0'),
      collection_id: 'k1',
      document_id: i % 2 === 0 ? 'd1' : 'd2',
      embedding: wektor(i),
      coord_x: null,
      coord_y: null,
      coord_z: null,
      neighbors: null,
      content: 'Treść fragmentu numer ' + i + '. ' + 'x'.repeat(300),
      page_from: 3,
      heading_path: 'Rozdział 1 › punkt ' + i,
    });
  }
  return {
    rag_collections: [{ id: 'k1', name: 'Regulaminy', embed_model: 'bge-m3', projection }],
    rag_documents: [
      { id: 'd1', collection_id: 'k1', file_name: 'a.md', status: docStatus, created_at: '2026-01-01' },
      { id: 'd2', collection_id: 'k1', file_name: 'b.md', status: docStatus, created_at: '2026-01-02' },
    ],
    rag_chunks: chunks,
  };
}

// --- parseVector: pgvector wraca TEKSTEM, nie tablicą ----------------------------

test('parseVector czyta tekstowy format pgvector', () => {
  const v = parseVector('[0.5,-0.25,1]');
  assert.equal(v.length, 3);
  assert.equal(v[0], 0.5);
  assert.equal(v[1], -0.25);
});

test('parseVector przyjmuje też zwykłą tablicę', () => {
  assert.equal(parseVector([1, 2, 3]).length, 3);
});

test('parseVector: śmieć → błąd, nie ciche zero', () => {
  assert.throws(() => parseVector('0.5,0.25'), (e) => e.code === 'internal');
  assert.throws(() => parseVector(null), (e) => e.code === 'internal');
});

// --- budowa bazy: stronicowanie, zapis, determinizm ------------------------------

test('buildCollectionProjection czyta WSZYSTKIE fragmenty, nie tylko pierwszą stronę', async () => {
  const state = makeState(600); // > PAGE (500) → wymusza drugie żądanie
  const client = fakeClient(state);

  const out = await buildCollectionProjection('k1', { client });

  assert.equal(out.chunkCount, 600, 'PCA policzone z niepełnych danych to cichy błąd');
  assert.equal(out.updated, 600);
  assert.ok(client.spy.ranges.length >= 2, 'odczyt musi być stronicowany');
});

test('budowa zapisuje coord_x/y/z ORAZ neighbors dla każdego fragmentu', async () => {
  const state = makeState(20);
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });

  for (const c of state.rag_chunks) {
    assert.ok(Number.isFinite(c.coord_x), 'brak coord_x');
    assert.ok(Number.isFinite(c.coord_y), 'brak coord_y');
    assert.ok(Number.isFinite(c.coord_z), 'brak coord_z (12.2 każe liczyć trzy od razu)');
    assert.ok(Array.isArray(c.neighbors), 'neighbors mają powstać JUŻ w Sesji 6');
    assert.ok(c.neighbors.length > 0);
    assert.ok(typeof c.neighbors[0].dist2d === 'number', 'sąsiad ma dist2d, nie score');
  }
});

test('budowa zapisuje projection z mean, components, viewport i chunkCount (12.1)', async () => {
  const state = makeState(20);
  await buildCollectionProjection('k1', { client: fakeClient(state) });

  const p = state.rag_collections[0].projection;
  assert.equal(p.method, 'pca');
  assert.equal(p.components.length, 3);
  assert.equal(p.mean.length, 4);
  assert.equal(p.chunkCount, 20);
  assert.equal(p.embedModel, 'bge-m3');
  assert.ok(p.viewport && typeof p.viewport.xMin === 'number');
  assert.ok(p.builtAt);
});

test('DoD: dwukrotna budowa na tych samych danych daje IDENTYCZNE współrzędne', async () => {
  const s1 = makeState(40);
  const s2 = makeState(40);
  await buildCollectionProjection('k1', { client: fakeClient(s1) });
  await buildCollectionProjection('k1', { client: fakeClient(s2) });

  const a = s1.rag_chunks.map((c) => [c.coord_x, c.coord_y, c.coord_z]);
  const b = s2.rag_chunks.map((c) => [c.coord_x, c.coord_y, c.coord_z]);
  assert.deepEqual(a, b);
  assert.deepEqual(s1.rag_collections[0].projection.components, s2.rag_collections[0].projection.components);
});

test('brak funkcji rag_set_chunk_coords → komunikat wskazujący skrypt SQL', async () => {
  const state = makeState(10);
  const client = fakeClient(state);
  client.rpc = async () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } });

  await assert.rejects(
    () => buildCollectionProjection('k1', { client }),
    (e) => e.code === 'invalid_input' && /session-6-map\.sql/.test(e.message)
  );
});

test('za mało fragmentów na PCA → invalid_input', async () => {
  const state = makeState(2);
  await assert.rejects(
    () => buildCollectionProjection('k1', { client: fakeClient(state) }),
    (e) => e.code === 'invalid_input'
  );
});

// --- DoD: dołożenie fragmentów NIE rusza istniejących punktów ---------------------

test('nowe fragmenty dostają współrzędne starą bazą, istniejące zostają NIETKNIĘTE', async () => {
  const state = makeState(40);
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });

  const przed = state.rag_chunks.map((c) => [c.id, c.coord_x, c.coord_y]);

  // Dokładamy fragment bez współrzędnych — tak jak po zaindeksowaniu nowego pliku.
  state.rag_chunks.push({
    id: 'c9999',
    collection_id: 'k1',
    document_id: 'd1',
    embedding: wektor(999),
    coord_x: null, coord_y: null, coord_z: null, neighbors: null,
    content: 'nowy', page_from: 1, heading_path: null,
  });

  const out = await projectPendingChunks('k1', { client });
  assert.equal(out.projected, 1);

  const nowy = state.rag_chunks.find((c) => c.id === 'c9999');
  assert.ok(Number.isFinite(nowy.coord_x));

  const po = state.rag_chunks.filter((c) => c.id !== 'c9999').map((c) => [c.id, c.coord_x, c.coord_y]);
  assert.deepEqual(po, przed, 'istniejące punkty nie mają prawa drgnąć');
});

test('dołożenie WIĘCEJ niż jedna strona nowych fragmentów rzutuje wszystkie', async () => {
  const state = makeState(40, { docStatus: 'ready' });
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });

  // 600 nowych fragmentów = więcej niż jedna strona odczytu (500).
  for (let i = 2000; i < 2600; i++) {
    state.rag_chunks.push({
      id: 'c' + i, collection_id: 'k1', document_id: 'd1', embedding: wektor(i),
      coord_x: null, coord_y: null, coord_z: null, neighbors: null,
      content: 'x', page_from: null, heading_path: null,
    });
  }

  const out = await projectPendingChunks('k1', { client });
  assert.equal(out.projected, 600, 'część fragmentów została bez współrzędnych');
  assert.equal(state.rag_chunks.filter((c) => c.coord_x === null).length, 0);
});

// --- reguła 12.4: kiedy budować, kiedy przeliczać --------------------------------

test('poniżej RAG_PROJECTION_MIN_CHUNKS i przy trwającym indeksowaniu — mapa NIE powstaje', async () => {
  const state = makeState(10, { docStatus: 'chunked' });
  const out = await refreshProjectionAfterIndexing('k1', { client: fakeClient(state) });
  assert.equal(out.action, 'ponizej-progu');
  assert.equal(state.rag_collections[0].projection, null);
});

test('mała, ale SKOŃCZONA kolekcja dostaje mapę mimo progu (wyjątek z 12.4)', async () => {
  const state = makeState(10, { docStatus: 'ready' });
  const out = await refreshProjectionAfterIndexing('k1', { client: fakeClient(state) });
  assert.equal(out.action, 'zbudowana-mala-kolekcja');
  assert.ok(state.rag_collections[0].projection);
});

test('po przekroczeniu progu baza powstaje i współrzędne pojawiają się WSTECZ dla wszystkich', async () => {
  const state = makeState(60, { docStatus: 'chunked' });
  const out = await refreshProjectionAfterIndexing('k1', { client: fakeClient(state) });
  assert.equal(out.action, 'zbudowana');
  assert.equal(state.rag_chunks.filter((c) => c.coord_x !== null).length, 60);
});

test('przyrost > 30% → pełne przeliczenie bazy', async () => {
  const state = makeState(60, { docStatus: 'ready' });
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });
  const stareBuiltAt = state.rag_collections[0].projection.builtAt;

  // 60 → 90 to +50%, czyli powyżej progu przeliczenia.
  for (let i = 1000; i < 1030; i++) {
    state.rag_chunks.push({
      id: 'c' + i, collection_id: 'k1', document_id: 'd1', embedding: wektor(i),
      coord_x: null, coord_y: null, coord_z: null, neighbors: null,
      content: 'x', page_from: null, heading_path: null,
    });
  }
  const out = await refreshProjectionAfterIndexing('k1', { client });
  assert.equal(out.action, 'przeliczona');
  assert.equal(state.rag_collections[0].projection.chunkCount, 90);

  // builtAt sprawdzamy jako "nie starszy", NIE jako "inny": na atrapie klienta oba
  // przeliczenia mieszczą się w tej samej milisekundzie, a toISOString() nie ma większej
  // rozdzielczości — assert.notEqual dawał tu test chwiejny, przechodzący raz na dwa
  // uruchomienia. Fakt przeliczenia świadczy chunkCount i współrzędne poniżej.
  const nowyBuiltAt = state.rag_collections[0].projection.builtAt;
  assert.ok(Date.parse(nowyBuiltAt) >= Date.parse(stareBuiltAt), 'builtAt nie może się cofnąć');
  assert.equal(state.rag_chunks.filter((c) => c.coord_x !== null).length, 90);
  assert.equal(out.recalculated, true, 'klient musi wiedzieć, że RUSZYŁY SIĘ wszystkie punkty');
});

test('przyrost poniżej 30% → tylko rzut nowych, bez przeliczania bazy', async () => {
  const state = makeState(60, { docStatus: 'ready' });
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });
  const bazaPrzed = state.rag_collections[0].projection.components;

  state.rag_chunks.push({
    id: 'c1000', collection_id: 'k1', document_id: 'd1', embedding: wektor(1000),
    coord_x: null, coord_y: null, coord_z: null, neighbors: null,
    content: 'x', page_from: null, heading_path: null,
  });

  const out = await refreshProjectionAfterIndexing('k1', { client });
  assert.equal(out.action, 'dorzucone');
  assert.equal(out.projected, 1);
  assert.deepEqual(state.rag_collections[0].projection.components, bazaPrzed, 'baza miała zostać ta sama');
});

// --- getMapData: kontrakt z sekcji 9 ---------------------------------------------

test('getMapData bez bazy: projectionBuilt=false i licznik zamiast pustego płótna', async () => {
  const state = makeState(10, { docStatus: 'chunked' });
  const out = await getMapData('k1', {}, { client: fakeClient(state) });

  assert.equal(out.projectionBuilt, false);
  assert.deepEqual(out.chunks, []);
  assert.equal(out.chunkCount, 10);
  assert.equal(out.minChunks, 50);
  assert.equal(out.viewport, null);
});

test('getMapData NIE buduje bazy jako efekt uboczny odczytu', async () => {
  const state = makeState(60, { docStatus: 'ready' });
  await getMapData('k1', {}, { client: fakeClient(state) });
  assert.equal(state.rag_collections[0].projection, null, 'GET nie ma prawa pisać do bazy');
});

test('getMapData zwraca punkty, kolory dokumentów i viewport', async () => {
  const state = makeState(30);
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });

  const out = await getMapData('k1', {}, { client });
  assert.equal(out.projectionBuilt, true);
  assert.equal(out.chunks.length, 30);
  assert.equal(out.documents.length, 2);
  assert.ok(out.documents[0].color.startsWith('#'));
  assert.notEqual(out.documents[0].color, out.documents[1].color);
  assert.ok(typeof out.viewport.xMin === 'number');
});

test('preview przycięty do 120 znaków (rozmiar odpowiedzi, sekcja 9)', async () => {
  const state = makeState(10, { docStatus: 'ready' });
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });
  const out = await getMapData('k1', {}, { client });
  for (const c of out.chunks) assert.ok(c.preview.length <= 120);
});

test('sąsiedzi domyślnie POMIJANI, dołączani tylko na żądanie', async () => {
  const state = makeState(10, { docStatus: 'ready' });
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });

  const bez = await getMapData('k1', {}, { client });
  assert.equal('neighbors' in bez.chunks[0], false);

  const z = await getMapData('k1', { includeNeighbors: true }, { client });
  assert.ok(Array.isArray(z.chunks[0].neighbors));
});

test('getMapData stronicuje odczyt fragmentów', async () => {
  const state = makeState(600, { docStatus: 'ready' });
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });
  const out = await getMapData('k1', {}, { client });
  assert.equal(out.chunks.length, 600);
});

test('nieistniejąca kolekcja → not_found', async () => {
  const state = makeState(5);
  await assert.rejects(
    () => getMapData('brak', {}, { client: fakeClient(state) }),
    (e) => e.code === 'not_found'
  );
});

// --- Sesja 6b: rzut przyrostowy oddaje fragmenty pętli indeksowania ---------------
//
// Regresja, którą to zamyka: mapa dowiadywała się o nowych punktach WYŁĄCZNIE przez
// odpytywanie całej kolekcji (przy 3091 fragmentach z sąsiadami ~2 MB na odczyt).

test('projectPendingChunks zwraca zrzutowane fragmenty w kształcie getMapData().chunks', async () => {
  const state = makeState(60, { docStatus: 'ready' });
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });

  // Nowa partia: fragmenty z wektorem, bez współrzędnych.
  for (let i = 500; i < 505; i++) {
    state.rag_chunks.push({
      id: 'c' + i, collection_id: 'k1', document_id: 'd2', embedding: wektor(i),
      coord_x: null, coord_y: null, coord_z: null, neighbors: null,
      content: '  Treść   z   wieloma   spacjami ' + i, page_from: 7, heading_path: 'Rozdział 2',
    });
  }

  const out = await projectPendingChunks('k1', { client });
  assert.equal(out.projected, 5);
  assert.equal(out.chunks.length, 5);

  const c = out.chunks.find((x) => x.id === 'c500');
  // Ten sam kształt, co getMapData — klient dokleja je do tej samej tablicy.
  const wzorzec = await getMapData('k1', { includeNeighbors: true }, { client });
  assert.deepEqual(Object.keys(c).sort(), Object.keys(wzorzec.chunks[0]).sort());
  assert.equal(c.documentId, 'd2');
  assert.equal(c.pageFrom, 7);
  assert.equal(c.headingPath, 'Rozdział 2');
  assert.ok(typeof c.x === 'number' && typeof c.y === 'number' && typeof c.z === 'number');
  assert.ok(Array.isArray(c.neighbors) && c.neighbors.length > 0, 'nowy punkt ma połączenia od razu');
  assert.equal(c.preview.includes('   '), false, 'preview znormalizowany tak samo jak w getMapData');
});

test('rzut przyrostowy NIE rusza współrzędnych istniejących punktów', async () => {
  const state = makeState(60, { docStatus: 'ready' });
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });
  const przed = state.rag_chunks.map((c) => [c.id, c.coord_x, c.coord_y]);

  state.rag_chunks.push({
    id: 'c999', collection_id: 'k1', document_id: 'd1', embedding: wektor(999),
    coord_x: null, coord_y: null, coord_z: null, neighbors: null,
    content: 'nowy', page_from: 1, heading_path: null,
  });
  await projectPendingChunks('k1', { client });

  for (const [id, x, y] of przed) {
    const teraz = state.rag_chunks.find((c) => c.id === id);
    assert.equal(teraz.coord_x, x, `punkt ${id} nie miał prawa się ruszyć`);
    assert.equal(teraz.coord_y, y, `punkt ${id} nie miał prawa się ruszyć`);
  }
});

test('nowe punkty jednej partii widzą siebie wzajemnie, nie tylko starą mapę', async () => {
  const state = makeState(60, { docStatus: 'ready' });
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });

  // Dwa fragmenty o niemal identycznych wektorach — muszą znaleźć siebie.
  for (const id of ['cA', 'cB']) {
    state.rag_chunks.push({
      id, collection_id: 'k1', document_id: 'd2', embedding: wektor(4242),
      coord_x: null, coord_y: null, coord_z: null, neighbors: null,
      content: 'bliźniak', page_from: null, heading_path: null,
    });
  }
  const out = await projectPendingChunks('k1', { client });
  const a = out.chunks.find((c) => c.id === 'cA');
  assert.ok(a.neighbors.some((s) => s.id === 'cB'), 'partia musi widzieć własne punkty');
});

test('brak bazy rzutowania → rzut przyrostowy nic nie robi i nie wywala się', async () => {
  const state = makeState(10, { docStatus: 'chunked' });
  const out = await projectPendingChunks('k1', { client: fakeClient(state) });
  assert.deepEqual(out, { projected: 0, chunks: [], reason: 'brak bazy rzutowania' });
});

test('przyrost poniżej progu → refreshProjectionAfterIndexing oddaje chunks, nie recalculated', async () => {
  const state = makeState(60, { docStatus: 'ready' });
  const client = fakeClient(state);
  await buildCollectionProjection('k1', { client });

  state.rag_chunks.push({
    id: 'c777', collection_id: 'k1', document_id: 'd1', embedding: wektor(777),
    coord_x: null, coord_y: null, coord_z: null, neighbors: null,
    content: 'jeden nowy', page_from: null, heading_path: null,
  });
  const out = await refreshProjectionAfterIndexing('k1', { client });
  assert.equal(out.action, 'dorzucone');
  assert.equal(out.recalculated, undefined, 'nic się nie przeliczyło, więc flagi być nie może');
  assert.equal(out.chunks.length, 1);
  assert.equal(out.chunks[0].id, 'c777');
});

// =============================================================================
//  12.4 — próg przeliczenia bazy jest SYMETRYCZNY (Sesja 10, punkt 5)
//
//  Do Sesji 10 warunek brzmiał `liczba > bazowa * 1.3` — patrzył wyłącznie na
//  przyrost. Ubytek nie odpalał przeliczenia nigdy, więc po usunięciu dużego
//  dokumentu i po ponownych cięciach baza była policzona z 3091 fragmentów, gdy
//  w kolekcji zostało 1043. Osie PCA pochodziły z danych, których w dwóch trzecich
//  już nie było.
// =============================================================================

test('przyrost powyżej 30% wymaga przeliczenia (zachowanie sprzed zmiany)', () => {
  assert.equal(bazaNieaktualna(131, 100), true);
  assert.equal(bazaNieaktualna(130, 100), false, 'dokładnie 30% to jeszcze nie przyrost > 30%');
});

test('UBYTEK powyżej 30% też wymaga przeliczenia — to jest ta naprawa', () => {
  assert.equal(bazaNieaktualna(69, 100), true);
  assert.equal(bazaNieaktualna(70, 100), false);
});

test('realny przypadek z korpusu: 1043 fragmenty przy bazie z 3091', () => {
  assert.equal(bazaNieaktualna(1043, 3091), true);
});

test('brak bazy nie jest nieaktualnością — nie ma czego przeliczać', () => {
  assert.equal(bazaNieaktualna(500, 0), false);
  assert.equal(bazaNieaktualna(0, 0), false);
});

test('opróżnienie kolekcji do zera to skrajny ubytek', () => {
  assert.equal(bazaNieaktualna(0, 100), true);
});
