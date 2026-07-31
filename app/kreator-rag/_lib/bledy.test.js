import { test } from 'node:test';
import assert from 'node:assert/strict';
import { komunikatBledu } from './bledy.js';

// Punkt 3 Sesji 10: użytkownik AIDEAS nie wie, czym jest Ollama ani kolumna
// rag_chunks.embedding. Każdy kod z 10.2 ma dać zdanie CO SIĘ STAŁO i CO ZROBIĆ,
// a kod techniczny ma zostać obok — nie zamiast.

test('kod techniczny nigdy nie jest jedyną treścią komunikatu', () => {
  const kody = [
    'no_key', 'ollama_unavailable', 'dim_mismatch', 'model_mismatch',
    'no_text', 'limit_exceeded', 'not_found', 'invalid_input', 'internal',
  ];
  for (const code of kody) {
    const t = komunikatBledu({ code, message: 'oryginalny komunikat rdzenia' });
    assert.ok(t.includes(`kod: ${code}`), `${code}: brak kodu jako szczegółu technicznego`);
    const bezOgona = t.replace(/\s*\(.*\)$/, '');
    assert.ok(bezOgona.length > 20, `${code}: zdanie po ludzku jest za krótkie: ${t}`);
    assert.ok(!bezOgona.includes(code), `${code}: sam kod nie może być treścią zdania`);
  }
});

test('ollama_unavailable tłumaczy, czym jest Ollama i co zrobić', () => {
  const t = komunikatBledu({ code: 'ollama_unavailable', message: 'fetch failed' });
  assert.match(t, /zamienia tekst na wektory/, 'ma wyjaśnić rolę, nie tylko nazwę');
  assert.match(t, /uruchomiona/);
  assert.match(t, /fetch failed/, 'oryginalny komunikat zostaje jako szczegół');
});

test('dim_mismatch mówi o skutku, nie o nazwie kolumny', () => {
  const t = komunikatBledu({
    code: 'dim_mismatch',
    message: 'kolumna rag_chunks.embedding ma vector(768), a RAG_EMBED_DIM=1024',
  });
  assert.match(t, /Rozmiar wektorów/);
  assert.match(t, /Nie zapisuj nic/, 'użytkownik ma wiedzieć, czego NIE robić');
});

test('kody z dobrym komunikatem rdzenia nie dostają generycznego wstępu', () => {
  // "Nazwa kolekcji jest wymagana." jest już zrozumiałe — doklejanie
  // "Dane są nieprawidłowe" tylko zaszumiłoby przekaz.
  const t = komunikatBledu({ code: 'invalid_input', message: 'Nazwa kolekcji jest wymagana.' });
  assert.equal(t, 'Nazwa kolekcji jest wymagana. (kod: invalid_input)');
});

test('not_found dostaje radę, bo sam komunikat jej nie ma', () => {
  const t = komunikatBledu({ code: 'not_found', message: 'Kolekcja nie istnieje.' });
  assert.match(t, /Kolekcja nie istnieje\./);
  assert.match(t, /Odśwież stronę/);
});

test('nieznany kod nie gubi komunikatu — traktowany jak internal', () => {
  const t = komunikatBledu({ code: 'cos_nowego', message: 'szczegół' });
  assert.match(t, /po stronie serwera/);
  assert.match(t, /szczegół/);
});

test('brak błędu i goły string nie wywracają funkcji', () => {
  assert.equal(komunikatBledu(null), 'Wystąpił nieoczekiwany błąd.');
  assert.equal(komunikatBledu(undefined), 'Wystąpił nieoczekiwany błąd.');
  assert.equal(komunikatBledu('już gotowy tekst'), 'już gotowy tekst');
});

test('błąd bez message nadal daje sensowne zdanie', () => {
  const t = komunikatBledu({ code: 'no_key' });
  assert.match(t, /nie ma dostępu do bazy danych/);
  assert.match(t, /\.env\.local/);
  assert.equal(t.includes('undefined'), false);
});
