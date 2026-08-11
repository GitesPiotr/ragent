import { test } from "node:test";
import assert from "node:assert/strict";
import { czyRuchOgraniczony } from "./ruchOgraniczony.js";

// Podstawiamy globalne `window`, bo w node go nie ma — a to jest jedyny
// sposob, zeby sprawdzic obie galezie try/catch bez przegladarki.
function zWindow(matchMedia, fn) {
  const bylo = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const stare = globalThis.window;
  globalThis.window = matchMedia === undefined ? {} : { matchMedia };
  try {
    return fn();
  } finally {
    if (bylo) globalThis.window = stare;
    else delete globalThis.window;
  }
}

test('BEZ window (prerendering w Node) zwraca fałsz, a nie wyjątek', () => {
  assert.equal(typeof globalThis.window, "undefined", "kontrola: tu window nie ma");
  assert.equal(czyRuchOgraniczony(), false);
});

test('preferencja ustawiona → prawda', () => {
  const wynik = zWindow(() => ({ matches: true }), czyRuchOgraniczony);
  assert.equal(wynik, true);
});

test('preferencja nieustawiona → fałsz', () => {
  const wynik = zWindow(() => ({ matches: false }), czyRuchOgraniczony);
  assert.equal(wynik, false);
});

test('pyta DOKŁADNIE o prefers-reduced-motion: reduce', () => {
  // Literówka w zapytaniu nie jest błędem dla przeglądarki — po prostu nigdy
  // nie pasuje. Czyli animacja gra zawsze i nikt tego nie zgłasza.
  let zapytanie = null;
  zWindow((q) => {
    zapytanie = q;
    return { matches: true };
  }, czyRuchOgraniczony);
  assert.equal(zapytanie, "(prefers-reduced-motion: reduce)");
});

test('BRAK matchMedia w window → fałsz, czyli gramy animację', () => {
  const wynik = zWindow(undefined, czyRuchOgraniczony);
  assert.equal(wynik, false);
});

test('RZUCAJĄCE matchMedia nie przerywa startu — prototyp, linie 441-442', () => {
  // „nie wolno przerwać startu pętli". Brak odpowiedzi to nie jest awaria:
  // animacja niepotrzebnie zagrana jest mniejszą szkodą niż ekran, który się
  // nie wczytał.
  const wynik = zWindow(() => {
    throw new Error("matchMedia niedostępne");
  }, czyRuchOgraniczony);
  assert.equal(wynik, false);
});

test('matchMedia zwracające śmieć nie wywraca funkcji', () => {
  assert.equal(zWindow(() => null, czyRuchOgraniczony), false);
  assert.equal(zWindow(() => ({}), czyRuchOgraniczony), false);
});
