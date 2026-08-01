import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchCollection, distanceToScore } from './search.js';

// Wszystko testowalne BEZ Ollamy i BEZ bazy: klient i provider są wstrzykiwane.
// Sprawdzamy dokładnie to, co sekcja 11 nazywa sednem: przeliczanie distance→score,
// odcinanie progiem, noResults, filtr documentIds i model_mismatch.

// --- Fake klienta: tyle, ile używa searchCollection (from().select().eq().single() + rpc) ---
function makeFakeClient({ collection = { id: 'k1', embed_model: 'bge-m3', embed_dim: 1024 }, rows = [], rpcError = null, spy = {} }) {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async single() {
          if (!collection) return { data: null, error: { message: 'not found' } };
          return { data: collection, error: null };
        },
      };
    },
    async rpc(name, args) {
      spy.name = name;
      spy.args = args;
      if (rpcError) return { data: null, error: rpcError };
      return { data: rows, error: null };
    },
  };
}

// Provider, który liczy wywołania — pozwala udowodnić, że zapytanie idzie przez
// embedQuery, a nie embedDocuments, i że przy model_mismatch nikt go nie woła.
function makeProvider(spy = {}) {
  spy.queryCalls = 0;
  spy.docCalls = 0;
  spy.lastQuery = null;
  return {
    async embedQuery(text) {
      spy.queryCalls++;
      spy.lastQuery = text;
      return [0.1, 0.2, 0.3];
    },
    async embedDocuments(texts) {
      spy.docCalls++;
      return texts.map(() => [0.1, 0.2, 0.3]);
    },
  };
}

function row(id, distance, extra = {}) {
  return {
    chunk_id: id,
    document_id: extra.document_id || 'd1',
    file_name: extra.file_name || '01-regulamin-pracy.md',
    heading_path: extra.heading_path || 'Rozdział 3 › 3.2 Urlopy',
    page_from: extra.page_from ?? null,
    page_to: extra.page_to ?? null,
    content: extra.content || 'treść ' + id,
    distance,
  };
}

async function withEnv(overrides, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// --- distanceToScore: sedno reguły "score to podobieństwo, nie odległość" ---------

test('distanceToScore: odległość 0 → score 1 (identyczne), 1 → 0 (prostopadłe)', () => {
  assert.equal(distanceToScore(0), 1);
  assert.equal(distanceToScore(1), 0);
  assert.equal(distanceToScore(0.35), 0.65);
});

test('distanceToScore: odległość > 1 przycięta do 0, nie ujemna', () => {
  assert.equal(distanceToScore(1.4), 0);
  assert.equal(distanceToScore(2), 0);
});

test('distanceToScore: śmieciowe wejście → 0, nigdy NaN', () => {
  assert.equal(distanceToScore(null), 0);
  assert.equal(distanceToScore(undefined), 0);
  assert.equal(distanceToScore('abc'), 0);
});

// --- score, sortowanie, brak odległości na zewnątrz ------------------------------

test('hits mają score = 1 - distance, posortowane MALEJĄCO, bez pola distance', async () => {
  const client = makeFakeClient({ rows: [row('c1', 0.4), row('c2', 0.1), row('c3', 0.25)] });
  const out = await searchCollection(
    { collectionId: 'k1', query: 'ile dni urlopu', minScore: 0 },
    { client, provider: makeProvider() }
  );

  assert.deepEqual(out.hits.map((h) => h.chunkId), ['c2', 'c3', 'c1']);
  assert.deepEqual(out.hits.map((h) => h.score), [0.9, 0.75, 0.6]);
  for (const h of out.hits) {
    assert.equal('distance' in h, false, 'odległość nie może wyjść poza rdzeń');
  }
  assert.equal(out.noResults, false);
});

test('hit ma komplet pól z kontraktu sekcji 9', async () => {
  const client = makeFakeClient({
    rows: [row('c1', 0.2, { page_from: 4, page_to: 5, content: 'Pracownikowi przysługuje 26 dni urlopu.' })],
  });
  const out = await searchCollection({ collectionId: 'k1', query: 'urlop' }, { client, provider: makeProvider() });

  // Kontrakt rozszerzony w 11.2 o `tekstRank` i `trafionePrzez`. `score` pozostaje
  // JEDYNĄ liczbą typu „score" na wyjściu — wartość porządkująca fuzji (scoreEfektywny)
  // nie opuszcza rdzenia, żeby nikt nie porównał jej z progiem.
  assert.deepEqual(Object.keys(out.hits[0]).sort(), [
    'chunkId', 'content', 'documentId', 'fileName', 'headingPath', 'pageFrom', 'pageTo',
    'score', 'tekstRank', 'trafionePrzez',
  ]);
  assert.equal(out.hits[0].pageFrom, 4);
  assert.equal(out.hits[0].pageTo, 5);
  assert.equal(out.hits[0].trafionePrzez, 'wektor', 'zapytanie bez cyfry → sama ścieżka wektorowa');
  assert.equal(out.hits[0].tekstRank, null);
});

test('zapytanie bez identyfikatora NIE woła funkcji tekstowej', () => {
  // Gwarancja braku regresji jest konstrukcyjna: skoro RPC tekstowe nie jest wołane,
  // nie ma jak zmienić wyniku pytań semantycznych.
  const wolane = [];
  const client = makeFakeClient({ rows: [row('c1', 0.2)] });
  const opakowany = { ...client, rpc: (nazwa, args) => { wolane.push(nazwa); return client.rpc(nazwa, args); } };
  return searchCollection(
    { collectionId: 'k1', query: 'kiedy mogę żądać usunięcia danych' },
    { client: opakowany, provider: makeProvider() }
  ).then(() => {
    assert.deepEqual(wolane, ['rag_search_chunks']);
  });
});

// --- próg i noResults: sedno Sesji 5 --------------------------------------------

test('próg odcina słabe trafienia, mocne zostają', async () => {
  await withEnv({ RAG_MIN_SCORE: '0.35' }, async () => {
    // score: 0.9, 0.5, 0.3, 0.1 — próg 0.35 przepuszcza dwa pierwsze.
    const client = makeFakeClient({ rows: [row('c1', 0.1), row('c2', 0.5), row('c3', 0.7), row('c4', 0.9)] });
    const out = await searchCollection({ collectionId: 'k1', query: 'urlop' }, { client, provider: makeProvider() });

    assert.deepEqual(out.hits.map((h) => h.chunkId), ['c1', 'c2']);
    assert.equal(out.noResults, false);
  });
});

test('gdy WSZYSTKO poniżej progu → { hits: [], noResults: true }', async () => {
  await withEnv({ RAG_MIN_SCORE: '0.35' }, async () => {
    // Pytanie spoza bazy ("jak upiec sernik"): baza i tak zwraca najbliższe fragmenty,
    // ale wszystkie są słabe. Rdzeń MUSI powiedzieć "nie znalazłem", a nie podać ich.
    const client = makeFakeClient({ rows: [row('c1', 0.8), row('c2', 0.85), row('c3', 0.95)] });
    const out = await searchCollection({ collectionId: 'k1', query: 'jak upiec sernik' }, { client, provider: makeProvider() });

    assert.deepEqual(out.hits, []);
    assert.equal(out.noResults, true);
  });
});

test('próg na granicy: score dokładnie równy progowi PRZECHODZI', async () => {
  const client = makeFakeClient({ rows: [row('c1', 0.65)] }); // score = 0.35
  const out = await searchCollection(
    { collectionId: 'k1', query: 'urlop', minScore: 0.35 },
    { client, provider: makeProvider() }
  );
  assert.equal(out.hits.length, 1);
});

test('minScore z parametru nadpisuje RAG_MIN_SCORE', async () => {
  await withEnv({ RAG_MIN_SCORE: '0.35' }, async () => {
    const client = makeFakeClient({ rows: [row('c1', 0.8)] }); // score 0.2 < 0.35
    const surowe = await searchCollection(
      { collectionId: 'k1', query: 'urlop', minScore: 0.1 },
      { client, provider: makeProvider() }
    );
    assert.equal(surowe.hits.length, 1, 'niższy próg z parametru ma przepuścić trafienie');
  });
});

test('minScore = 0 (diagnostyka progu) przepuszcza wszystko — zero nie może zniknąć jako falsy', async () => {
  await withEnv({ RAG_MIN_SCORE: '0.35' }, async () => {
    const client = makeFakeClient({ rows: [row('c1', 0.9), row('c2', 1.5)] }); // score 0.1 i 0
    const out = await searchCollection(
      { collectionId: 'k1', query: 'cokolwiek', minScore: 0 },
      { client, provider: makeProvider() }
    );
    assert.equal(out.hits.length, 2);
    assert.equal(out.hits[1].score, 0);
    assert.equal(out.noResults, false);
  });
});

// --- topK i filtr po dokumentach -------------------------------------------------

test('topK domyślnie z RAG_TOP_K, parametr go nadpisuje', async () => {
  // Z ODSIEWEM WYŁĄCZONYM limit w SQL jest DOKŁADNIE topK — to jest gwarancja
  // „bez identyfikatora zachowanie bit w bit dzisiejsze" z 11.2, wyrażona konstrukcją.
  await withEnv({ RAG_TOP_K: '5', RAG_DEDUP: 'off' }, async () => {
    const spy = {};
    const client = makeFakeClient({ rows: [], spy });
    await searchCollection({ collectionId: 'k1', query: 'x' }, { client, provider: makeProvider() });
    assert.equal(spy.args.p_limit, 5);

    await searchCollection({ collectionId: 'k1', query: 'x', topK: 20 }, { client, provider: makeProvider() });
    assert.equal(spy.args.p_limit, 20);
  });
});

test('documentIds trafia do zapytania jako tablica; brak filtru → null', async () => {
  const spy = {};
  const client = makeFakeClient({ rows: [], spy });

  await searchCollection({ collectionId: 'k1', query: 'x' }, { client, provider: makeProvider() });
  assert.equal(spy.args.p_document_ids, null, 'bez filtru szukamy w całej kolekcji');

  await searchCollection(
    { collectionId: 'k1', query: 'x', documentIds: ['d1', 'd2'] },
    { client, provider: makeProvider() }
  );
  assert.deepEqual(spy.args.p_document_ids, ['d1', 'd2']);
});

test('pusta tablica documentIds → null, nie zapytanie o zero dokumentów', async () => {
  const spy = {};
  const client = makeFakeClient({ rows: [], spy });
  await searchCollection({ collectionId: 'k1', query: 'x', documentIds: [] }, { client, provider: makeProvider() });
  assert.equal(spy.args.p_document_ids, null);
});

// --- ścieżka zapytania: embedQuery, nie embedDocuments ---------------------------

test('zapytanie idzie przez embedQuery, embedDocuments NIE jest wołane', async () => {
  const spy = {};
  const provider = makeProvider(spy);
  const client = makeFakeClient({ rows: [] });
  await searchCollection({ collectionId: 'k1', query: '  ile dni urlopu  ' }, { client, provider });

  assert.equal(spy.queryCalls, 1);
  assert.equal(spy.docCalls, 0, 'użycie embedDocuments dla zapytania łamie 6.1');
  assert.equal(spy.lastQuery, 'ile dni urlopu', 'zapytanie przycięte, bez heading_path');
});

test('wektor zapytania jedzie do bazy jako kanoniczny literał pgvector', async () => {
  const spy = {};
  const client = makeFakeClient({ rows: [], spy });
  await searchCollection({ collectionId: 'k1', query: 'x' }, { client, provider: makeProvider() });
  assert.equal(spy.args.p_query_embedding, '[0.1,0.2,0.3]');
});

// --- kontrola spójności i błędy --------------------------------------------------

test('model_mismatch: sprawdzany PRZED wyszukiwaniem, provider nie jest wołany', async () => {
  await withEnv({ RAG_EMBED_MODEL: 'bge-m3' }, async () => {
    const spy = {};
    const provider = makeProvider(spy);
    const client = makeFakeClient({ collection: { id: 'k1', embed_model: 'mxbai-embed-large', embed_dim: 1024 } });

    await assert.rejects(
      () => searchCollection({ collectionId: 'k1', query: 'urlop' }, { client, provider }),
      (e) => e.code === 'model_mismatch' && /mxbai-embed-large/.test(e.message)
    );
    assert.equal(spy.queryCalls, 0, 'nie licz wektora, skoro i tak nie ma czego z czym porównać');
  });
});

test('nieistniejąca kolekcja → not_found', async () => {
  const client = makeFakeClient({ collection: null });
  await assert.rejects(
    () => searchCollection({ collectionId: 'brak', query: 'x' }, { client, provider: makeProvider() }),
    (e) => e.code === 'not_found'
  );
});

test('puste zapytanie → invalid_input (bez dotykania bazy)', async () => {
  const client = makeFakeClient({ rows: [] });
  await assert.rejects(
    () => searchCollection({ collectionId: 'k1', query: '   ' }, { client, provider: makeProvider() }),
    (e) => e.code === 'invalid_input'
  );
});

test('brak collectionId → invalid_input', async () => {
  const client = makeFakeClient({ rows: [] });
  await assert.rejects(
    () => searchCollection({ query: 'x' }, { client, provider: makeProvider() }),
    (e) => e.code === 'invalid_input'
  );
});

test('brak funkcji RPC w bazie → komunikat wskazujący skrypt SQL do uruchomienia', async () => {
  const client = makeFakeClient({ rpcError: { code: 'PGRST202', message: 'Could not find the function public.rag_search_chunks' } });
  await assert.rejects(
    () => searchCollection({ collectionId: 'k1', query: 'x' }, { client, provider: makeProvider() }),
    (e) => e.code === 'invalid_input' && /session-5-search\.sql/.test(e.message)
  );
});
