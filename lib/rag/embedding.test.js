import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmbeddingProvider } from './embedding.js';

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
