import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODELE_EMBEDDINGOW,
  DOMYSLNY_MODEL_EMBEDDINGOW,
  znajdzModelEmbeddingow,
  dozwoloneParyOpis,
} from './modeleEmbeddingow.js';

test('oferta ma DWIE pozycje i tyle', () => {
  // Dokładanie kolejnych wymaga POMIARU progu, nie tylko wpisu — inny model
  // to inna skala podobieństw. Test jest tu po to, żeby dopisanie trzeciej
  // pozycji było świadomą decyzją, a nie przypadkiem.
  assert.equal(MODELE_EMBEDDINGOW.length, 2);
  assert.deepEqual(
    MODELE_EMBEDDINGOW.map((m) => `${m.provider}/${m.model}`),
    ['ollama/bge-m3', 'openrouter/baai/bge-m3'],
  );
});

test('domyślny jest lokalny', () => {
  assert.equal(DOMYSLNY_MODEL_EMBEDDINGOW.provider, 'ollama');
  assert.equal(MODELE_EMBEDDINGOW.filter((m) => m.domyslny).length, 1, 'dokładnie jeden domyślny');
});

test('każda pozycja ma komplet tekstów dla użytkownika', () => {
  for (const m of MODELE_EMBEDDINGOW) {
    for (const pole of ['etykieta', 'gdzie', 'koszt', 'opis']) {
      assert.ok(m[pole] && m[pole].length > 0, `${m.provider}: brakuje ${pole}`);
    }
  }
});

// --- walidacja pary -----------------------------------------------------------

test('obie oferowane pary przechodzą', () => {
  assert.ok(znajdzModelEmbeddingow('ollama', 'bge-m3'));
  assert.ok(znajdzModelEmbeddingow('openrouter', 'baai/bge-m3'));
});

test('SPRAWDZAMY PARĘ, NIE POLA OSOBNO', () => {
  // Sedno walidacji. `openrouter` jest na liście dostawców, `bge-m3` na liście
  // modeli — ale razem nie znaczą nic, bo pod tą nazwą OpenRouter nie ma modelu.
  // Sprawdzanie pola po polu przepuściłoby to i dałoby kolekcję nie do użycia.
  assert.equal(znajdzModelEmbeddingow('openrouter', 'bge-m3'), null);
  assert.equal(znajdzModelEmbeddingow('ollama', 'baai/bge-m3'), null);
});

test('para spoza oferty odrzucana', () => {
  assert.equal(znajdzModelEmbeddingow('openrouter', 'openai/text-embedding-3-large'), null);
  assert.equal(znajdzModelEmbeddingow('voyage', 'voyage-4'), null);
  assert.equal(znajdzModelEmbeddingow('ollama', 'mxbai-embed-large'), null);
});

test('śmieci i puste odrzucane bez wyjątku', () => {
  for (const [p, m] of [[null, null], ['', ''], [undefined, 'bge-m3'], ['ollama', ''], [42, 7], [{}, []]]) {
    assert.equal(znajdzModelEmbeddingow(p, m), null, `${JSON.stringify([p, m])}`);
  }
});

test('białe znaki wokół wartości nie psują dopasowania', () => {
  assert.ok(znajdzModelEmbeddingow('  ollama ', ' bge-m3  '));
});

test('opis dozwolonych par wymienia obie — odmowa ma mówić, co WOLNO', () => {
  const t = dozwoloneParyOpis();
  assert.match(t, /ollama\/bge-m3/);
  assert.match(t, /openrouter\/baai\/bge-m3/);
});
