import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmbeddingProvider,
  embedConfigDlaKolekcji,
  nieobslugiwanaPara,
  probeModelDim,
} from './embedding.js';

// Mock transportu Ollamy: zapisuje otrzymane teksty, zwraca atrapy wektorów.
function mockTransport() {
  const calls = [];
  const fn = async (texts) => {
    calls.push(texts);
    return texts.map(() => [0.1, 0.2, 0.3]);
  };
  return { fn, calls };
}

const BASE = { provider: 'ollama', model: 'bge-m3', dim: 3, batch: 32, ollamaUrl: 'http://x' };

test('embedDocuments dokleja RAG_EMBED_DOC_PREFIX do każdego tekstu', async () => {
  const t = mockTransport();
  const p = createEmbeddingProvider({ ...BASE, docPrefix: 'search_document: ', queryPrefix: 'search_query: ' }, { transport: t.fn });
  const vecs = await p.embedDocuments(['urlop', 'hasło']);
  assert.equal(vecs.length, 2);
  assert.deepEqual(t.calls[0], ['search_document: urlop', 'search_document: hasło']);
});

test('embedQuery dokleja RAG_EMBED_QUERY_PREFIX (a nie doc prefix)', async () => {
  const t = mockTransport();
  const p = createEmbeddingProvider({ ...BASE, docPrefix: 'search_document: ', queryPrefix: 'search_query: ' }, { transport: t.fn });
  const vec = await p.embedQuery('ile mam wolnego');
  assert.deepEqual(vec, [0.1, 0.2, 0.3]);
  assert.deepEqual(t.calls[0], ['search_query: ile mam wolnego']);
});

test('bge-m3: puste prefiksy → tekst bez zmian', async () => {
  const t = mockTransport();
  const p = createEmbeddingProvider({ ...BASE, docPrefix: '', queryPrefix: '' }, { transport: t.fn });
  await p.embedDocuments(['a', 'b']);
  await p.embedQuery('c');
  assert.deepEqual(t.calls[0], ['a', 'b']);
  assert.deepEqual(t.calls[1], ['c']);
});

test('embedDocuments dzieli na partie wg batch', async () => {
  const t = mockTransport();
  const p = createEmbeddingProvider({ ...BASE, batch: 2, docPrefix: '', queryPrefix: '' }, { transport: t.fn });
  const vecs = await p.embedDocuments(['1', '2', '3', '4', '5']);
  assert.equal(vecs.length, 5);
  assert.equal(t.calls.length, 3); // 2 + 2 + 1
  assert.deepEqual(t.calls[0], ['1', '2']);
  assert.deepEqual(t.calls[2], ['5']);
});

test('zaślepka chmurowa rzuca czytelny błąd, nie liczy', async () => {
  const p = createEmbeddingProvider({ ...BASE, provider: 'openai' });
  await assert.rejects(() => p.embedDocuments(['x']), (e) => e.code === 'invalid_input' && /zaimplementowany/i.test(e.message));
});

test('nieznany provider → invalid_input', () => {
  assert.throws(() => createEmbeddingProvider({ ...BASE, provider: 'cos' }), (e) => e.code === 'invalid_input');
});

// =============================================================================
//  OPENROUTER — transport (runda 1 cyklu RAG-embed)
// =============================================================================

const OR = { provider: 'openrouter', model: 'baai/bge-m3', dim: 3, batch: 32, openrouterApiKey: 'k' };

// Podmiana globalnego fetch na czas jednego wywołania. Zwraca też to, co poszło
// w ciele żądania — bo połowa tych testów dotyczy tego, CO wysyłamy.
async function zFetchem(odpowiedz, fn) {
  const pierwotny = globalThis.fetch;
  let wyslane = null;
  globalThis.fetch = async (_url, opcje) => {
    wyslane = JSON.parse(opcje.body);
    return typeof odpowiedz === 'function' ? odpowiedz(wyslane) : odpowiedz;
  };
  try {
    const wynik = await fn();
    return { wynik, wyslane };
  } finally {
    globalThis.fetch = pierwotny;
  }
}

const odp = (dane) => ({ ok: true, json: async () => ({ data: dane }) });

test('OPENROUTER: wektory układane po data[].index, NIE po pozycji w tablicy', async () => {
  // NAJWAŻNIEJSZY TEST TEGO PLIKU. Kontrakt OpenAI-zgodny dopuszcza zwrot
  // w innej kolejności niż wysłano. Wzięcie „jak leci" przypisałoby wektory
  // do NIE TYCH fragmentów — indeksowanie skończy się sukcesem, wymiar
  // i liczba wektorów się zgodzą, a dopiero wyszukiwanie zacznie zwracać
  // cudze fragmenty. Awaria bez objawu, więc pilnuje jej test, nie komentarz.
  const p = createEmbeddingProvider(OR);
  const { wynik } = await zFetchem(
    odp([
      { index: 2, embedding: [3, 3, 3] },
      { index: 0, embedding: [1, 1, 1] },
      { index: 1, embedding: [2, 2, 2] },
    ]),
    () => p.embedDocuments(['a', 'b', 'c']),
  );
  assert.deepEqual(wynik, [[1, 1, 1], [2, 2, 2], [3, 3, 3]]);
});

test('OPENROUTER: brakujący albo zdublowany index to błąd, nie ciche zgadywanie', async () => {
  const p = createEmbeddingProvider(OR);
  for (const zle of [
    [{ index: 0, embedding: [1] }, { index: 0, embedding: [2] }], // duplikat
    [{ index: 0, embedding: [1] }, { index: 5, embedding: [2] }], // poza zakresem
    [{ index: 0, embedding: [1] }, { embedding: [2] }],           // brak index
  ]) {
    await assert.rejects(
      () => zFetchem(odp(zle), () => p.embedDocuments(['a', 'b'])),
      (e) => /index/i.test(e.message),
      `powinno odrzucic: ${JSON.stringify(zle)}`,
    );
  }
});

test('OPENROUTER: niepełny komplet wektorów odrzucany', async () => {
  const p = createEmbeddingProvider(OR);
  await assert.rejects(
    () => zFetchem(odp([{ index: 0, embedding: [1] }]), () => p.embedDocuments(['a', 'b'])),
    (e) => /1 wektorów na 2/.test(e.message),
  );
});

test('OPENROUTER: ten sam kontrakt prefiksów i partii co Ollama', async () => {
  const p = createEmbeddingProvider({ ...OR, docPrefix: 'D:', queryPrefix: 'Q:' });
  const { wyslane: doc } = await zFetchem(
    (w) => odp(w.input.map((_, i) => ({ index: i, embedding: [1] }))),
    () => p.embedDocuments(['x', 'y']),
  );
  assert.deepEqual(doc.input, ['D:x', 'D:y']);
  assert.equal(doc.model, 'baai/bge-m3', 'model z konfiguracji leci w ciele');

  const { wyslane: q } = await zFetchem(
    odp([{ index: 0, embedding: [9] }]),
    () => p.embedQuery('z'),
  );
  assert.deepEqual(q.input, ['Q:z'], 'zapytanie dostaje SWÓJ prefiks, nie dokumentowy');
});

test('OPENROUTER: brak klucza to no_embed_key, a nie próba wywołania', async () => {
  const p = createEmbeddingProvider({ ...OR, openrouterApiKey: '' });
  await assert.rejects(
    () => p.embedDocuments(['x']),
    // `no_embed_key`, nie `no_key`: ten drugi znaczy w tej aplikacji „brak
    // dostępu do bazy" i UI ma pod nim zdanie o kluczu Supabase.
    (e) => e.code === 'no_embed_key' && /OPENROUTER_API_KEY/.test(e.message),
  );
});

test('OPENROUTER: 500 przy dużej partii podpowiada zmierzoną granicę', async () => {
  // Runda 0: 2048 przechodzi, 4096 wraca NIEPRZEZROCZYSTYM 500 — bez słowa
  // o limicie, więc nie ma czego złapać po treści. Podpowiedź dokładamy sami.
  //
  // batch = 1024, nie domyślne 32: podpowiedź patrzy na rozmiar POJEDYNCZEGO
  // wywołania, bo to on uderza w limit. Przy batch=32 tysiąc tekstów pójdzie
  // trzydziestoma dwoma bezpiecznymi żądaniami i żadne z nich limitu nie
  // dotknie — wtedy podpowiedź byłaby myląca, nie pomocna.
  const p = createEmbeddingProvider({ ...OR, batch: 1024 });
  await assert.rejects(
    () => zFetchem({ ok: false, status: 500, text: async () => '' },
      () => p.embedDocuments(Array.from({ length: 1024 }, (_, i) => 'x' + i))),
    (e) => /RAG_EMBED_BATCH/.test(e.message) && /2048 przechodzi/.test(e.message),
  );
});

test('OPENROUTER: 500 przy MAŁEJ partii nie udaje, że wie, o co chodzi', async () => {
  const p = createEmbeddingProvider(OR); // batch 32
  await assert.rejects(
    () => zFetchem({ ok: false, status: 500, text: async () => 'cos sie stalo' },
      () => p.embedDocuments(['a', 'b'])),
    (e) => /zwrócił 500/.test(e.message) && !/RAG_EMBED_BATCH/.test(e.message),
  );
});

test('sonda wymiaru dla OpenRoutera liczy JEDEN wektor i bierze jego długość', async () => {
  // API OpenRoutera nie podaje wymiaru w żadnym polu (zmierzone w rundzie 0) —
  // policzenie wektora to jedyna pewna droga.
  const { wynik, wyslane } = await zFetchem(
    odp([{ index: 0, embedding: new Array(1024).fill(0.1) }]),
    () => probeModelDim('baai/bge-m3', { provider: 'openrouter', openrouterApiKey: 'k' }),
  );
  assert.equal(wynik, 1024);
  assert.equal(wyslane.input.length, 1, 'dokładnie jedno wywołanie, jeden tekst');
  assert.equal(wyslane.model, 'baai/bge-m3', 'model Z ARGUMENTU, nie z konfiguracji');
});

// =============================================================================
//  KOLEKCJA JAKO ŹRÓDŁO PRAWDY (runda 3)
//
//  Testy pilnują dokładnie tej jednej rzeczy, której zabrakło rundzie 1:
//  że para z KOLEKCJI trafia do konfiguracji dostawcy, a konfiguracja serwera
//  daje tylko podkład środowiskowy.
// =============================================================================

// Konfiguracja serwera stojąca na Ollamie — ta sama we wszystkich testach niżej,
// bo cały sens jest w tym, że kolekcja jej NIE SŁUCHA.
const SERWER_NA_OLLAMIE = {
  embed: {
    provider: 'ollama',
    model: 'bge-m3',
    dim: 1024,
    batch: 64,
    docPrefix: '',
    queryPrefix: '',
    ollamaUrl: 'http://localhost:11434',
    openrouterApiKey: 'klucz',
  },
};

test('KOLEKCJA CHMUROWA NAPĘDZA OPENROUTERA MIMO SERWERA NA OLLAMIE', () => {
  // Sedno naprawy. Do rundy 3 ta para dawała odmowę (model_mismatch),
  // a dostawcę i tak budowano z konfiguracji — wybór bez skutku.
  const cfg = embedConfigDlaKolekcji(
    { embed_provider: 'openrouter', embed_model: 'baai/bge-m3', embed_dim: 1024 },
    SERWER_NA_OLLAMIE,
  );
  assert.equal(cfg.provider, 'openrouter');
  assert.equal(cfg.model, 'baai/bge-m3');
  assert.equal(createEmbeddingProvider(cfg, { transport: async () => [[]] }).name, 'openrouter:baai/bge-m3');
});

test('kolekcja lokalna zostaje na Ollamie mimo serwera przestawionego na chmurę', () => {
  // Ta sama reguła w drugą stronę — bez niej „źródło prawdy" byłoby
  // preferencją dla jednego dostawcy, a nie zasadą.
  const cfg = embedConfigDlaKolekcji(
    { embed_provider: 'ollama', embed_model: 'bge-m3' },
    { embed: { ...SERWER_NA_OLLAMIE.embed, provider: 'openrouter', model: 'baai/bge-m3' } },
  );
  assert.equal(cfg.provider, 'ollama');
  assert.equal(cfg.model, 'bge-m3');
});

test('pola ŚRODOWISKA dalej pochodzą z konfiguracji, nie z kolekcji', () => {
  // Kolekcja decyduje o PARZE. Partia, prefiksy, adres Ollamy i klucz to
  // właściwości maszyny — gdyby szły z kolekcji, nie dałoby się ich zmienić
  // bez przebudowy danych.
  const cfg = embedConfigDlaKolekcji({ embed_provider: 'openrouter', embed_model: 'baai/bge-m3' },
    SERWER_NA_OLLAMIE);
  assert.equal(cfg.batch, 64);
  assert.equal(cfg.ollamaUrl, 'http://localhost:11434');
  assert.equal(cfg.openrouterApiKey, 'klucz');
});

test('wymiar z kolekcji ma pierwszeństwo — zmierzyła go sonda tą właśnie parą', () => {
  assert.equal(
    embedConfigDlaKolekcji({ embed_provider: 'ollama', embed_model: 'x', embed_dim: 768 },
      SERWER_NA_OLLAMIE).dim,
    768,
  );
});

test('kolekcja bez zapisanej pary schodzi do konfiguracji', () => {
  // embed_model jest nullowalne od session-2-schema.sql:26, a embed_provider
  // bywa puste u kolekcji sprzed migracji 021 — nie ma czego uszanować.
  const cfg = embedConfigDlaKolekcji({ embed_model: null }, SERWER_NA_OLLAMIE);
  assert.equal(cfg.provider, 'ollama');
  assert.equal(cfg.model, 'bge-m3');
  assert.equal(embedConfigDlaKolekcji(null, SERWER_NA_OLLAMIE).model, 'bge-m3');
});

// =============================================================================
//  STRAŻNIK — CO Z NIEGO ZOSTAŁO
// =============================================================================

test('para spoza implementacji → czytelna odmowa', () => {
  const k = nieobslugiwanaPara({ embed_provider: 'voyage', embed_model: 'voyage-3' });
  assert.match(k, /voyage/);
  assert.match(k, /ollama, openrouter/, 'odmowa mówi, co JEST obsługiwane');
  assert.match(k, /od nowa/, 'i co z tym zrobić');
});

test('OBAJ ZAIMPLEMENTOWANI DOSTAWCY PRZECHODZĄ — także "niezgodni" z serwerem', () => {
  // To jest odwrócenie strażnika z rundy 1: para openrouter przy serwerze
  // na ollamie NIE JEST już powodem odmowy.
  assert.equal(nieobslugiwanaPara({ embed_provider: 'ollama', embed_model: 'bge-m3' }), null);
  assert.equal(nieobslugiwanaPara({ embed_provider: 'openrouter', embed_model: 'baai/bge-m3' }), null);
});

test('model spoza dzisiejszej oferty przechodzi, bo rdzeń oferty nie zna', () => {
  // Kolekcja na mxbai-embed-large sprzed rundy 2 działa poprawnie napędzana
  // własną parą. Odmowa byłaby regresją, a oferta to warstwa AIDEAS (sekcja 3).
  assert.equal(nieobslugiwanaPara({ embed_provider: 'ollama', embed_model: 'mxbai-embed-large' }), null);
});

test('kolekcja sprzed migracji 021 (bez embed_provider) liczy się jako ollama', () => {
  assert.equal(nieobslugiwanaPara({ embed_model: 'bge-m3' }), null);
});
