// Warstwa embeddingów. Provider wymienny za jednym interfejsem (sekcja 4, 9), wybierany
// zmienną RAG_EMBED_PROVIDER. Czysty JS, żadnego React/Next/window.
//
// KLUCZOWE (6.1): DWIE osobne metody — embedDocuments dokleja RAG_EMBED_DOC_PREFIX,
// embedQuery dokleja RAG_EMBED_QUERY_PREFIX. Dla bge-m3 oba puste, ale mechanizm musi
// istnieć — tą samą ścieżką pójdzie przyszła kolekcja na modelu wymagającym prefiksów.

function ollamaError(message) {
  const e = new Error(message);
  e.code = 'ollama_unavailable';
  return e;
}

// Niskopoziomowe wsadowe wywołanie Ollamy: teksty → wektory (bez prefiksów — te dokłada provider).
async function ollamaEmbedBatch(ollamaUrl, model, texts) {
  const endpoint = ollamaUrl.replace(/\/+$/, '') + '/api/embed';
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
    });
  } catch (err) {
    throw ollamaError(`Ollama nie odpowiada pod ${ollamaUrl}: ${(err && err.message) || 'brak połączenia'}.`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 404 || /not found/i.test(body)) {
      throw ollamaError(`Model "${model}" nie jest dostępny w Ollamie. Pobierz go: ollama pull ${model}`);
    }
    throw ollamaError(`Ollama /api/embed zwróciła ${res.status}: ${body}`);
  }
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.embeddings)) {
    throw ollamaError(`Nieoczekiwana odpowiedź Ollamy dla modelu "${model}".`);
  }
  return data.embeddings;
}

// Dzieli teksty na partie i woła transport partiami (respektuje RAG_EMBED_BATCH).
async function runBatched(texts, batchSize, transport) {
  const size = batchSize > 0 ? batchSize : texts.length || 1;
  const out = [];
  for (let i = 0; i < texts.length; i += size) {
    const part = await transport(texts.slice(i, i + size));
    for (const v of part) out.push(v);
  }
  return out;
}

function createOllamaProvider(cfg, deps) {
  // transport wstrzykiwalny → testy prefiksów/partii bez realnej Ollamy.
  const transport = deps.transport || ((texts) => ollamaEmbedBatch(cfg.ollamaUrl, cfg.model, texts));
  return {
    name: `ollama:${cfg.model}`,
    dim: cfg.dim,
    // Dokument: dokleja RAG_EMBED_DOC_PREFIX do KAŻDEGO tekstu.
    async embedDocuments(texts) {
      const prefixed = cfg.docPrefix ? texts.map((t) => cfg.docPrefix + t) : texts.slice();
      return runBatched(prefixed, cfg.batch, transport);
    },
    // Zapytanie: dokleja RAG_EMBED_QUERY_PREFIX (jeden tekst).
    async embedQuery(text) {
      const prefixed = cfg.queryPrefix ? cfg.queryPrefix + text : text;
      const [vec] = await transport([prefixed]);
      return vec;
    },
  };
}

// Zaślepka chmurowa (np. OpenAI-compatible): tylko interfejs + czytelny błąd. Dzięki niej
// przełączenie RAG_EMBED_PROVIDER ma "gdzie zaskoczyć" — nie implementujemy chmury na serio.
function createCloudStub(cfg) {
  const notImplemented = () => {
    const e = new Error(
      `Provider chmurowy "${cfg.provider}" nie jest zaimplementowany (tylko szkielet). Ustaw RAG_EMBED_PROVIDER=ollama.`
    );
    e.code = 'invalid_input';
    throw e;
  };
  return {
    name: `${cfg.provider}:stub`,
    dim: cfg.dim,
    async embedDocuments() {
      return notImplemented();
    },
    async embedQuery() {
      return notImplemented();
    },
  };
}

// =============================================================================
//  OPENROUTER
// =============================================================================
//
// Endpoint OpenAI-zgodny: POST /api/v1/embeddings { model, input: string[] }
// → { data: [{ index, embedding }] }.
//
// KLUCZ BEZ PREFIKSU `RAG_`, I TO JEST DECYZJA, NIE NIEDOPATRZENIE.
// Konwencja tego pliku konfiguracyjnego (lib/rag/config.js) jest taka:
//   • `RAG_*` dostaje to, co RDZEŃ MOŻE MIEĆ INNE niż aplikacja — model, partia,
//     prefiksy, progi, adres Ollamy, a nawet instancja Supabase (i tam
//     RAG_SUPABASE_URL i tak ma fallback na NEXT_PUBLIC_SUPABASE_URL),
//   • POŚWIADCZENIA DZIELONE Z APLIKACJĄ idą bez prefiksu — tak już jest
//     z ANTHROPIC_API_KEY (dostawca pojęć) i z OPENROUTER_API_KEY, który
//     ten sam plik czyta od rundy 8 dla pojęć przez OpenRoutera.
// To ten sam klucz, to samo konto i ten sam rachunek co przy czacie. Drugie
// imię dla jednego sekretu kupiłoby wyłącznie awarię „ustawiłem
// RAG_OPENROUTER_API_KEY, a pojęcia dalej mówią, że klucza nie ma".
function openrouterError(message, code) {
  const e = new Error(message);
  e.code = code || 'internal';
  return e;
}

async function openrouterEmbedBatch(cfg, texts) {
  if (!cfg.openrouterApiKey) {
    throw openrouterError(
      'Brak OPENROUTER_API_KEY. Ustaw go w .env.local albo przełącz RAG_EMBED_PROVIDER na "ollama".',
      'no_key'
    );
  }
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.openrouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: cfg.model, input: texts }),
    });
  } catch (err) {
    throw openrouterError(
      `OpenRouter nie odpowiada: ${(err && err.message) || 'brak połączenia'}.`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) {
      throw openrouterError('OpenRouter odrzucił klucz OPENROUTER_API_KEY (401).', 'no_key');
    }
    if (res.status === 402) {
      throw openrouterError('Brak środków na koncie OpenRoutera (402).');
    }
    // ZMIERZONE W RUNDZIE 0: partia 2048 przechodzi, 4096 wraca NIEPRZEZROCZYSTYM
    // 500 — bez komunikatu o limicie, więc nie ma czego złapać po treści.
    // Dopowiadamy podpowiedź sami, bo inaczej użytkownik zobaczy „500" i tyle.
    if (res.status === 500 && texts.length > 512) {
      throw openrouterError(
        `OpenRouter zwrócił 500 dla partii ${texts.length} tekstów. Zmierzone: 2048 przechodzi, 4096 nie — zmniejsz RAG_EMBED_BATCH.`
      );
    }
    throw openrouterError(`OpenRouter /embeddings zwrócił ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.data)) {
    throw openrouterError(`Nieoczekiwana odpowiedź OpenRoutera dla modelu "${cfg.model}".`);
  }

  // =========================================================================
  //  KOLEJNOŚĆ PO `index`, NIGDY PO POZYCJI W TABLICY.
  //
  //  Kontrakt OpenAI-zgodny dopuszcza zwrot pozycji w innej kolejności niż
  //  wysłane. Wzięcie ich „jak leci" przypisałoby wektory do NIE TYCH
  //  fragmentów — a to awaria BEZ OBJAWU: indeksowanie kończy się sukcesem,
  //  wymiar się zgadza, liczba wektorów się zgadza, i dopiero wyszukiwanie
  //  zwraca cudze fragmenty, czego nikt nie powiąże z tym miejscem.
  //  Dlatego sortujemy jawnie i sprawdzamy komplet.
  // =========================================================================
  if (data.data.length !== texts.length) {
    throw openrouterError(
      `OpenRouter zwrócił ${data.data.length} wektorów na ${texts.length} tekstów.`
    );
  }
  const wynik = new Array(texts.length);
  for (const poz of data.data) {
    const i = poz && typeof poz.index === 'number' ? poz.index : -1;
    if (i < 0 || i >= texts.length || wynik[i] !== undefined) {
      throw openrouterError(
        `OpenRouter zwrócił nieprawidłowy index=${poz && poz.index} przy ${texts.length} tekstach.`
      );
    }
    if (!Array.isArray(poz.embedding)) {
      throw openrouterError(`OpenRouter: pozycja index=${i} nie ma tablicy embedding.`);
    }
    wynik[i] = poz.embedding;
  }
  return wynik;
}

function createOpenRouterProvider(cfg, deps) {
  // transport wstrzykiwalny → testy prefiksów/partii/kolejności bez sieci,
  // dokładnie jak przy Ollamie.
  const transport = deps.transport || ((texts) => openrouterEmbedBatch(cfg, texts));
  return {
    name: `openrouter:${cfg.model}`,
    dim: cfg.dim,
    async embedDocuments(texts) {
      const prefixed = cfg.docPrefix ? texts.map((t) => cfg.docPrefix + t) : texts.slice();
      return runBatched(prefixed, cfg.batch, transport);
    },
    async embedQuery(text) {
      const prefixed = cfg.queryPrefix ? cfg.queryPrefix + text : text;
      const [vec] = await transport([prefixed]);
      return vec;
    },
  };
}

// cfg: { provider, model, dim, batch, docPrefix, queryPrefix, ollamaUrl }
// deps: { transport } — opcjonalne, do testów.
export function createEmbeddingProvider(cfg, deps = {}) {
  const provider = cfg.provider;
  if (provider === 'ollama') return createOllamaProvider(cfg, deps);
  if (provider === 'openrouter') return createOpenRouterProvider(cfg, deps);
  // openai / voyage ZOSTAJĄ ZAŚLEPKĄ. Nie doimplementowuję ich przy okazji:
  // szkielet ma wartość dokładnie taką, jaką miał — mówi, że miejsce istnieje,
  // i wywala się czytelnie zamiast po cichu.
  if (provider === 'openai' || provider === 'voyage') return createCloudStub(cfg);
  const e = new Error(
    `Nieznany provider embeddingów: "${provider}". Dozwolone: ollama | openrouter | openai | voyage.`
  );
  e.code = 'invalid_input';
  throw e;
}

// =============================================================================
//  KONFIGURACJA GLOBALNA → KONFIGURACJA DOSTAWCY EMBEDDINGÓW
//
//  JEDNA KOPIA, TRZECH CZYTELNIKÓW: search.js, documents.js i concepts.js.
//  Do rundy 1 każdy z nich miał WŁASNĄ, identyczną funkcję przepisującą pola
//  z `config.embed` — i to nie było niewinne powielenie. Dołożenie
//  `openrouterApiKey` wymagało zmiany w trzech miejscach, o dwóch z nich
//  zapomniałem, a objaw pojawił się dopiero przy realnym indeksowaniu:
//  „Brak OPENROUTER_API_KEY" mimo klucza obecnego w konfiguracji.
//
//  Mapowanie mieszka TU, bo tu mieszka kontrakt dostawcy — kto dokłada pole
//  do `createEmbeddingProvider`, ma je pod ręką i nie musi pamiętać o niczym
//  poza tym plikiem.
// =============================================================================
export function embedConfigFromGlobal(config) {
  return {
    provider: config.embed.provider,
    model: config.embed.model,
    dim: config.embed.dim,
    batch: config.embed.batch,
    docPrefix: config.embed.docPrefix,
    queryPrefix: config.embed.queryPrefix,
    ollamaUrl: config.embed.ollamaUrl,
    openrouterApiKey: config.embed.openrouterApiKey,
  };
}

// =============================================================================
//  ZGODNOŚĆ KOLEKCJI Z KONFIGURACJĄ — JEDNA REGUŁA, DWÓCH CZYTELNIKÓW
//
//  Wołają to lib/rag/search.js (przed wyszukiwaniem) i lib/rag/documents.js
//  (przed indeksowaniem kolejnej partii). Reguła MUSI być wspólna: gdyby
//  rozjechały się te dwa miejsca, dałoby się zaindeksować kolekcję modelem,
//  którym potem nie wolno jej przeszukać — albo odwrotnie.
//
//  POROWNUJEMY PARĘ (dostawca, model), NIE SAM MODEL. Od migracji 021 kolekcja
//  pamięta jedno i drugie. Powód jest konkretny: ten sam plik wag nazywa się
//  „bge-m3" w Ollamie i „baai/bge-m3" w OpenRouterze, a różne pliki wag u tego
//  samego dostawcy też mają różne nazwy. Sama nazwa nie jest tożsamością.
//
//  ZWRACA KOMUNIKAT ALBO null, a nie rzuca — bo wołający mają różne kody
//  błędu i różne teksty domykające („ustaw … przed indeksowaniem" wobec
//  „wyniki byłyby bez sensu"). Rzucanie stąd zabrałoby im tę różnicę.
//
//  `embed_provider` MOŻE BYĆ PUSTE u kolekcji sprzed migracji 021, jeśli ktoś
//  wstawiał wiersze ręcznie z pominięciem defaultu. Traktujemy to jak „ollama",
//  bo innej drogi wtedy nie było — ale porównanie robimy jawnie, żeby nie
//  wyglądało na przeoczenie.
// =============================================================================
export function niezgodnoscModelu(kolekcja, embedConfig) {
  const cfg = embedConfig || {};
  const dostawcaKolekcji = kolekcja?.embed_provider || 'ollama';
  const dostawcaKonfiguracji = cfg.provider || 'ollama';
  const modelKolekcji = kolekcja?.embed_model;

  // Kolekcja bez zapisanego modelu (kolumna jest nullowalna od
  // session-2-schema.sql:26) — nie ma czego porównać, przepuszczamy jak dotąd.
  if (!modelKolekcji) return null;

  if (modelKolekcji === cfg.model && dostawcaKolekcji === dostawcaKonfiguracji) {
    return null;
  }
  return (
    `Kolekcja zbudowana modelem "${dostawcaKolekcji}/${modelKolekcji}", ` +
    `a konfiguracja używa "${dostawcaKonfiguracji}/${cfg.model}". ` +
    `Wektory z dwóch różnych modeli nie są porównywalne — ustaw ` +
    `RAG_EMBED_PROVIDER=${dostawcaKolekcji} i RAG_EMBED_MODEL=${modelKolekcji}.`
  );
}

// Sonda wymiaru (używana przez createCollection, sekcja 9). Wymiar nie zależy od prefiksu.
//
// DLACZEGO SONDA, A NIE ODCZYT Z API — dla OpenRoutera to jedyna droga.
// Zmierzone w rundzie 0: rekord modelu z /api/v1/embeddings/models NIE MA pola
// z wymiarem. Liczba pada wyłącznie w polu `description`, prozą („encodes …
// into a 1024-dimensional dense vector space"), i to tylko dla 17 z 31 modeli.
// Wyciąganie wymiaru regexem z opisu marketingowego byłoby zgadywaniem —
// policzenie jednego wektora daje odpowiedź pewną, za jedno wywołanie
// i ułamek grosza.
const TEKST_SONDY = 'sonda wymiaru wektora';

export async function probeModelDim(model, embedConfig) {
  const cfg = embedConfig || {};
  const provider = cfg.provider || 'ollama';

  let vec;
  if (provider === 'ollama') {
    [vec] = await ollamaEmbedBatch(cfg.ollamaUrl || 'http://localhost:11434', model, [TEKST_SONDY]);
    if (!Array.isArray(vec) || vec.length === 0) {
      throw ollamaError(`Nieoczekiwana odpowiedź Ollamy przy sondowaniu wymiaru modelu "${model}".`);
    }
  } else if (provider === 'openrouter') {
    // `model` z argumentu, nie cfg.model — createCollection pozwala założyć
    // kolekcję na INNYM modelu niż domyślny z konfiguracji.
    [vec] = await openrouterEmbedBatch({ ...cfg, model }, [TEKST_SONDY]);
    if (!Array.isArray(vec) || vec.length === 0) {
      throw openrouterError(
        `Nieoczekiwana odpowiedź OpenRoutera przy sondowaniu wymiaru modelu "${model}".`
      );
    }
  } else {
    const e = new Error(`Sonda wymiaru dla providera "${provider}" nie jest zaimplementowana.`);
    e.code = 'invalid_input';
    throw e;
  }
  return vec.length;
}
