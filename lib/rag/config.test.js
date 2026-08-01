import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getConfig } from './config.js';

// getConfig() czyta process.env przy każdym wywołaniu, więc test podstawia zmienne,
// woła funkcję i sprząta po sobie. Czyścimy wszystkie RAG_* oraz fallbackowy URL,
// żeby wartości z realnego .env.local nie zafałszowały testu.
function withEnv(overrides, fn) {
  const saved = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('RAG_') || key === 'NEXT_PUBLIC_SUPABASE_URL') {
      delete process.env[key];
    }
  }
  Object.assign(process.env, overrides);
  try {
    fn();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('RAG_') || key === 'NEXT_PUBLIC_SUPABASE_URL') {
        delete process.env[key];
      }
    }
    Object.assign(process.env, saved);
  }
}

test('wartości domyślne z sekcji 5, gdy ustawione są tylko sekrety', () => {
  withEnv({ RAG_SUPABASE_URL: 'https://przyklad.supabase.co', RAG_SUPABASE_SERVICE_KEY: 'tajny' }, () => {
    const c = getConfig();
    assert.equal(c.tablePrefix, 'rag_');
    assert.equal(c.embed.provider, 'ollama');
    assert.equal(c.embed.model, 'bge-m3');
    assert.equal(c.embed.dim, 1024);
    assert.equal(c.embed.batch, 32);
    assert.equal(c.embed.ollamaUrl, 'http://localhost:11434');
    assert.equal(c.files.maxFileMb, 25);
    assert.equal(c.chunk.size, 900);
    assert.equal(c.chunk.max, 1400);
    assert.equal(c.chunk.min, 150);
    assert.equal(c.chunk.overlap, 150);
    assert.equal(c.chunk.prependHeadings, true);
    assert.equal(c.projection.minChunks, 50);
    assert.equal(c.projection.mapNeighbors, 3);
    assert.equal(c.search.topK, 5);
    // 0.45, nie 0.35 ze specyfikacji: próg dostrojony pomiarem po Sesji 5 (redline 8).
    assert.equal(c.search.minScore, 0.45);
    // 'ollama', nie 'anthropic' ze specyfikacji: decyzja Sesji 7. Powód jest
    // produktowy — przy narzędziu dla różnych użytkowników treść ich dokumentów
    // nie wychodzi na zewnątrz. Przełączenie to zmiana jednej zmiennej.
    assert.equal(c.concept.provider, 'ollama');
    assert.equal(c.concept.model, 'mistral-nemo');
    assert.equal(c.concept.perChunk, 2);
    assert.equal(c.concept.mergeThreshold, 0.88);
    assert.equal(c.concept.batch, 4);
    assert.equal(c.concept.minWords, 8);
    assert.deepEqual(c.missing, []);
    assert.equal(c.supabase.configured, true);
  });
});

test('fallback URL: NEXT_PUBLIC_SUPABASE_URL, gdy brak RAG_SUPABASE_URL', () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://fallback.supabase.co', RAG_SUPABASE_SERVICE_KEY: 'tajny' }, () => {
    const c = getConfig();
    assert.equal(c.supabase.url, 'https://fallback.supabase.co');
    assert.equal(c.supabase.configured, true);
    assert.deepEqual(c.missing, []);
  });
});

test('RAG_SUPABASE_URL ma pierwszeństwo przed NEXT_PUBLIC_SUPABASE_URL', () => {
  withEnv(
    {
      RAG_SUPABASE_URL: 'https://glowny.supabase.co',
      NEXT_PUBLIC_SUPABASE_URL: 'https://fallback.supabase.co',
      RAG_SUPABASE_SERVICE_KEY: 'tajny',
    },
    () => {
      const c = getConfig();
      assert.equal(c.supabase.url, 'https://glowny.supabase.co');
    }
  );
});

test('brak wymaganych zmiennych: raportowane w missing, configured=false, bez wyjątku', () => {
  withEnv({}, () => {
    const c = getConfig();
    assert.equal(c.supabase.configured, false);
    assert.equal(c.missing.length, 2);
    assert.ok(c.missing.some((m) => m.includes('RAG_SUPABASE_URL')));
    assert.ok(c.missing.includes('RAG_SUPABASE_SERVICE_KEY'));
  });
});

test('brak tylko klucza service_role: missing zawiera wyłącznie klucz', () => {
  withEnv({ RAG_SUPABASE_URL: 'https://przyklad.supabase.co' }, () => {
    const c = getConfig();
    assert.equal(c.supabase.configured, false);
    assert.deepEqual(c.missing, ['RAG_SUPABASE_SERVICE_KEY']);
  });
});
