import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rozstrzygnij, zPrzypisania, ZRODLO } from './przypisaniaModeli.js';

const PRZYPISANIA = {
  agent_domyslny: { provider: 'openrouter', model_id: 'anthropic/claude-haiku-4.5' },
  rag_pojecia: { provider: 'ollama', model_id: 'mistral-nemo:latest' },
  mentor: null,
};

// --- kolejnosc ----------------------------------------------------------------

test('przypisanie wygrywa z dotychczasowym zrodlem i ze stala', () => {
  const w = rozstrzygnij([
    { zrodlo: ZRODLO.PRZYPISANIE, provider: 'openrouter', model: 'openrouter/fusion' },
    { zrodlo: ZRODLO.USTAWIENIA, provider: 'anthropic', model: 'claude-haiku-4-5' },
    { zrodlo: ZRODLO.STALA, provider: 'anthropic', model: 'claude-opus-4-8' },
  ]);
  assert.deepEqual(w, { provider: 'openrouter', model: 'openrouter/fusion', zrodlo: 'przypisanie' });
});

test('PRZYPISANIE null ODSYLA DO KODU, nie ustawia null', () => {
  // Sedno decyzji z rundy 4. Gdyby null byl wartoscia, wyczyszczenie
  // przypisania zabieraloby model zamiast wracac do domyslki.
  assert.equal(zPrzypisania(PRZYPISANIA, 'mentor'), null);
  const w = rozstrzygnij([
    zPrzypisania(PRZYPISANIA, 'mentor'),
    { zrodlo: ZRODLO.USTAWIENIA, provider: 'anthropic', model: 'claude-haiku-4-5' },
  ]);
  assert.equal(w.model, 'claude-haiku-4-5');
  assert.equal(w.zrodlo, 'ustawienia');
});

test('brak roli w ogole zachowuje sie jak null', () => {
  assert.equal(zPrzypisania({}, 'mentor'), null);
  assert.equal(zPrzypisania(null, 'mentor'), null);
  assert.equal(zPrzypisania(undefined, 'agent_domyslny'), null);
});

test('gdy odpada tylko przypisanie, schodzimy o JEDEN szczebel', () => {
  // Nie od razu do stalej — inaczej jedno zle przypisanie kasowaloby
  // ustawienie, ktore uzytkownik ma zapisane i widzi w interfejsie.
  const w = rozstrzygnij([
    { zrodlo: ZRODLO.PRZYPISANIE, provider: 'openrouter', model: 'zly' },
    { zrodlo: ZRODLO.USTAWIENIA, provider: 'anthropic', model: 'claude-haiku-4-5' },
    { zrodlo: ZRODLO.STALA, provider: 'anthropic', model: 'claude-opus-4-8' },
  ], (p, m) => m !== 'zly');
  assert.equal(w.model, 'claude-haiku-4-5');
  assert.equal(w.zrodlo, 'ustawienia');
});

test('gdy odpadaja dwa pierwsze, zostaje stala', () => {
  const w = rozstrzygnij([
    { zrodlo: ZRODLO.PRZYPISANIE, provider: 'x', model: 'zly' },
    { zrodlo: ZRODLO.USTAWIENIA, provider: 'x', model: 'tez-zly' },
    { zrodlo: ZRODLO.STALA, provider: 'anthropic', model: 'claude-haiku-4-5' },
  ], (p, m) => !/zly/.test(m));
  assert.deepEqual(w, { provider: 'anthropic', model: 'claude-haiku-4-5', zrodlo: 'stala' });
});

// --- kompletnosc pary ---------------------------------------------------------

test('para niepelna jest pomijana, nie uzupelniana', () => {
  // Sam model bez dostawcy nie mowi, dokad wyslac zadanie; sam dostawca
  // bez modelu nie mowi, o co poprosic.
  const w = rozstrzygnij([
    { zrodlo: ZRODLO.PRZYPISANIE, provider: 'openrouter', model: '' },
    { zrodlo: ZRODLO.USTAWIENIA, provider: '', model: 'claude-haiku-4-5' },
    { zrodlo: ZRODLO.STALA, provider: 'anthropic', model: 'claude-opus-4-8' },
  ]);
  assert.equal(w.zrodlo, 'stala');
});

test('biale znaki sa przycinane, ale sama spacja to nie model', () => {
  const w = rozstrzygnij([
    { zrodlo: ZRODLO.PRZYPISANIE, provider: '  openrouter ', model: ' openrouter/fusion ' },
  ]);
  assert.deepEqual(w, { provider: 'openrouter', model: 'openrouter/fusion', zrodlo: 'przypisanie' });
  assert.equal(rozstrzygnij([{ zrodlo: 'x', provider: 'a', model: '   ' }]).zrodlo, 'brak');
});

test('nic nie pasuje — zwracamy BRAK, nie wyjatek i nie polowe pary', () => {
  assert.deepEqual(rozstrzygnij([]), { provider: null, model: null, zrodlo: 'brak' });
  assert.deepEqual(rozstrzygnij(null), { provider: null, model: null, zrodlo: 'brak' });
  assert.deepEqual(
    rozstrzygnij([{ zrodlo: 'x', provider: 'a', model: 'b' }], () => false),
    { provider: null, model: null, zrodlo: 'brak' },
  );
});

// --- odczyt z wiersza bazy ----------------------------------------------------

test('wiersz bazy czyta model_id, ale przyjmuje tez model', () => {
  assert.deepEqual(zPrzypisania(PRZYPISANIA, 'agent_domyslny'), {
    zrodlo: 'przypisanie', provider: 'openrouter', model: 'anthropic/claude-haiku-4.5',
  });
  assert.deepEqual(zPrzypisania({ r: { provider: 'ollama', model: 'x' } }, 'r'), {
    zrodlo: 'przypisanie', provider: 'ollama', model: 'x',
  });
});

test('walidator dostaje przyciete wartosci, nie surowe', () => {
  const widziane = [];
  rozstrzygnij([{ zrodlo: 'x', provider: ' ollama ', model: ' mistral ' }], (p, m) => {
    widziane.push([p, m]);
    return true;
  });
  assert.deepEqual(widziane, [['ollama', 'mistral']]);
});

// --- zrodlo w wyniku ----------------------------------------------------------

test('zrodlo wraca razem z wynikiem — bez tego nie da sie wyjasnic wyboru', () => {
  for (const z of [ZRODLO.PRZYPISANIE, ZRODLO.USTAWIENIA, ZRODLO.STALA]) {
    assert.equal(rozstrzygnij([{ zrodlo: z, provider: 'a', model: 'b' }]).zrodlo, z);
  }
});
