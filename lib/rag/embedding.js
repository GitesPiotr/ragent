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

// cfg: { provider, model, dim, batch, docPrefix, queryPrefix, ollamaUrl }
// deps: { transport } — opcjonalne, do testów.
export function createEmbeddingProvider(cfg, deps = {}) {
  const provider = cfg.provider;
  if (provider === 'ollama') return createOllamaProvider(cfg, deps);
  if (provider === 'openai' || provider === 'voyage') return createCloudStub(cfg);
  const e = new Error(`Nieznany provider embeddingów: "${provider}". Dozwolone: ollama | openai | voyage.`);
  e.code = 'invalid_input';
  throw e;
}

// Sonda wymiaru (używana przez createCollection, sekcja 9). Wymiar nie zależy od prefiksu.
export async function probeModelDim(model, embedConfig) {
  const cfg = embedConfig || {};
  const provider = cfg.provider || 'ollama';
  if (provider !== 'ollama') {
    const e = new Error(`Sonda wymiaru dla providera "${provider}" nie jest zaimplementowana (Sesja 4+).`);
    e.code = 'invalid_input';
    throw e;
  }
  const [vec] = await ollamaEmbedBatch(cfg.ollamaUrl || 'http://localhost:11434', model, ['sonda wymiaru wektora']);
  if (!Array.isArray(vec) || vec.length === 0) {
    throw ollamaError(`Nieoczekiwana odpowiedź Ollamy przy sondowaniu wymiaru modelu "${model}".`);
  }
  return vec.length;
}
