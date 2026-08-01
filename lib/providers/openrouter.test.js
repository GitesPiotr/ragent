import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENROUTER_TITLE,
  OPENROUTER_REFERER,
  czyBezpieczneDlaNaglowka,
} from './openrouter-naglowki.js';

// =============================================================================
//  NAGŁÓWKI RANKINGOWE MUSZĄ BYĆ CZYSTYM ASCII
//
//  Nie jest to czystka stylistyczna. Nagłówek HTTP przenosi bajty: `fetch`
//  odrzuca wartość ze znakiem spoza zakresu Latin-1 wyjątkiem TypeError, który
//  w lib/providers/openrouter.js wpada w ten sam blok catch co awaria sieci
//  i wraca do użytkownika jako „Nie można połączyć się z API OpenRouter".
//  Diagnoza idzie wtedy w stronę routera, a winą jest jeden znak w stałej.
//
//  Różnicy między "-" (U+002D) a "—" (U+2014) NIE WIDAĆ w przeglądzie kodu,
//  dlatego pilnuje jej test, a nie czyjeś oko.
// =============================================================================

test('X-Title jest czystym ASCII', () => {
  assert.ok(
    czyBezpieczneDlaNaglowka(OPENROUTER_TITLE),
    `X-Title zawiera znak spoza drukowalnego ASCII: ${JSON.stringify(OPENROUTER_TITLE)}`,
  );
});

test('HTTP-Referer jest czystym ASCII', () => {
  assert.ok(
    czyBezpieczneDlaNaglowka(OPENROUTER_REFERER),
    `HTTP-Referer zawiera znak spoza drukowalnego ASCII: ${JSON.stringify(OPENROUTER_REFERER)}`,
  );
});

test('nagłówki nie są puste', () => {
  assert.ok(OPENROUTER_TITLE.length > 0);
  assert.ok(OPENROUTER_REFERER.length > 0);
});

// Sam strażnik też musi działać — inaczej dwa testy wyżej przechodziłyby zawsze.
test('strażnik wykrywa znaki spoza ASCII', () => {
  assert.equal(czyBezpieczneDlaNaglowka('AIdeas'), true);
  assert.equal(czyBezpieczneDlaNaglowka('AIdeas - kreator'), true, 'myślnik ASCII wolno');
  assert.equal(czyBezpieczneDlaNaglowka('AIdeas — kreator'), false, 'myślnik typograficzny NIE');
  assert.equal(czyBezpieczneDlaNaglowka('Kreator Agentów'), false, 'polski ogonek NIE');
  // NBSP i EM DASH budowane z KODU ZNAKU, nie wpisane doslownie: obu nie da
  // sie odroznic wzrokowo od zwyklej spacji i myslnika, wiec wpisane wprost
  // zniknelyby przy pierwszym "porzadkowaniu" bialych znakow, a test
  // przestalby sprawdzac to, po co powstal — po cichu.
  const NBSP = String.fromCharCode(0x00a0);
  const EM_DASH = String.fromCharCode(0x2014);
  assert.equal(czyBezpieczneDlaNaglowka('AIdeas' + NBSP + 'kreator'), false, 'twarda spacja NIE');
  assert.equal(czyBezpieczneDlaNaglowka('AIdeas' + EM_DASH + 'kreator'), false, 'em dash NIE');
});

test('strażnik odrzuca wartości, które nie są napisem', () => {
  assert.equal(czyBezpieczneDlaNaglowka(null), false);
  assert.equal(czyBezpieczneDlaNaglowka(undefined), false);
  assert.equal(czyBezpieczneDlaNaglowka(42), false);
});
