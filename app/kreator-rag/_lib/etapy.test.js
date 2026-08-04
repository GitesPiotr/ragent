import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stanEtapow, pojeciaKompletne, zaindeksowany, czekaNaIndeksowanie, STAN } from './etapy.js';

// Skróty do budowania dokumentów — czytelniej niż literał obiektu w każdym teście.
const gotowy = (id, chunkCount = 10) => ({ id, status: 'ready', chunkCount });
const pociety = (id, chunkCount = 10) => ({ id, status: 'chunked', chunkCount });
const skan = (id) => ({ id, status: 'no_text', chunkCount: 0 });
const zepsuty = (id, chunkCount = 0) => ({ id, status: 'error', chunkCount });

const komplet = (id, n = 10) => ({ [id]: { done: n, total: n } });

// =============================================================================
//  ETAP 1
// =============================================================================

test('pusta kolekcja: etap 1 aktywny, nie ukończony', () => {
  const s = stanEtapow([], {});
  assert.equal(s.etap1.ukonczony, false);
  assert.equal(s.etap1.stan, STAN.AKTYWNY);
});

test('jeden dokument z wektorami → etap 1 ukończony', () => {
  const s = stanEtapow([gotowy('d1')], {});
  assert.equal(s.etap1.ukonczony, true);
  assert.equal(s.etap1.stan, STAN.UKONCZONY);
});

test('DOKUMENT POCIĘTY BEZ WEKTORÓW BLOKUJE ETAP 1', () => {
  // Sedno: wyszukiwanie takiego dokumentu NIE WIDZI, więc kolekcja nie jest
  // gotowa dla agenta, choć jeden plik już się policzył.
  const s = stanEtapow([gotowy('d1'), pociety('d2')], {});
  assert.equal(s.etap1.ukonczony, false);
  assert.deepEqual(s.czekajace.map((d) => d.id), ['d2']);
});

test('dokument w trakcie (embedding) też blokuje', () => {
  const s = stanEtapow([{ id: 'd1', status: 'embedding', chunkCount: 40 }], {});
  assert.equal(s.etap1.ukonczony, false);
});

test('SKAN NIE BLOKUJE — nie da się go zaindeksować', () => {
  // Bez tego jeden nieczytelny PDF odbierałby całej kolekcji napis
  // „gotowa dla agenta" na zawsze.
  const s = stanEtapow([gotowy('d1'), skan('d2')], {});
  assert.equal(s.etap1.ukonczony, true);
});

test('dokument w błędzie, bez fragmentów, też nie blokuje', () => {
  const s = stanEtapow([gotowy('d1'), zepsuty('d2')], {});
  assert.equal(s.etap1.ukonczony, true);
});

test('sama kolekcja skanów NIE jest gotowa — nie ma ani jednego wektora', () => {
  const s = stanEtapow([skan('d1'), skan('d2')], {});
  assert.equal(s.etap1.ukonczony, false);
});

// =============================================================================
//  ETAP 2
// =============================================================================

test('etap 2 ZABLOKOWANY, dopóki etap 1 nie jest ukończony', () => {
  const s = stanEtapow([pociety('d1')], {});
  assert.equal(s.etap2.stan, STAN.ZABLOKOWANY);
  assert.equal(s.etap2.dostepny, false);
});

test('etap 2 odblokowuje się razem z ukończeniem etapu 1', () => {
  const s = stanEtapow([gotowy('d1')], {});
  assert.equal(s.etap2.dostepny, true);
  assert.equal(s.etap2.stan, STAN.AKTYWNY);
});

test('KOMPLET POJĘĆ WE WSZYSTKICH, nie „jakiekolwiek pojęcia"', () => {
  // Kolekcja TEST: 8 pojęć ze 107 fragmentów. Próg „cokolwiek" ogłaszałby ją
  // ukończoną, a graf opisywałby stan w połowie przetwarzania jako końcowy.
  const s = stanEtapow([gotowy('d1', 107)], { d1: { done: 8, total: 107 } });
  assert.equal(s.etap2.ukonczony, false);
  assert.equal(s.etap2.stan, STAN.AKTYWNY);
  assert.deepEqual(s.bezPojec.map((d) => d.id), ['d1']);
});

test('wszystkie zindeksowane z kompletem → etap 2 ukończony', () => {
  const s = stanEtapow([gotowy('d1'), gotowy('d2')], { ...komplet('d1'), ...komplet('d2') });
  assert.equal(s.etap2.ukonczony, true);
  assert.equal(s.etap2.stan, STAN.UKONCZONY);
});

test('JEDEN DOKUMENT BEZ POJĘĆ WYSTARCZY, ŻEBY ETAP 2 NIE BYŁ UKOŃCZONY', () => {
  const s = stanEtapow([gotowy('d1'), gotowy('d2')], komplet('d1'));
  assert.equal(s.etap2.ukonczony, false);
  assert.deepEqual(s.bezPojec.map((d) => d.id), ['d2']);
});

test('total 0 to KOMPLET, nie brak — dokument bez kandydatów', () => {
  // Kandydatów wyznacza próg wyrazów w SQL. Dokument z samych krótkich
  // fragmentów nigdy nie dostanie pojęcia i nie ma na co czekać.
  assert.equal(pojeciaKompletne('d1', { d1: { done: 0, total: 0 } }), true);
  const s = stanEtapow([gotowy('d1')], { d1: { done: 0, total: 0 } });
  assert.equal(s.etap2.ukonczony, true);
});

test('BRAK WPISU TO „NIE WIEM", NIE „ZERO"', () => {
  // Reguła, która milczy, nie może wyglądać jak reguła, która przepuściła.
  assert.equal(pojeciaKompletne('d1', {}), null);
  const s = stanEtapow([gotowy('d1')], {});
  assert.equal(s.etap2.ukonczony, false, 'niewiedza nie ogłasza ukończenia');
});

test('skan nie wchodzi do etapu 2 — nie ma fragmentów do opisania', () => {
  const s = stanEtapow([gotowy('d1'), skan('d2')], komplet('d1'));
  assert.equal(s.etap2.ukonczony, true);
  assert.deepEqual(s.zaindeksowane.map((d) => d.id), ['d1']);
});

// =============================================================================
//  PREDYKATY OSOBNO
// =============================================================================

test('zaindeksowany wymaga ready ORAZ fragmentów', () => {
  assert.equal(zaindeksowany({ status: 'ready', chunkCount: 3 }), true);
  assert.equal(zaindeksowany({ status: 'ready', chunkCount: 0 }), false);
  assert.equal(zaindeksowany({ status: 'chunked', chunkCount: 3 }), false);
  assert.equal(zaindeksowany(null), false);
});

test('czekaNaIndeksowanie wymaga fragmentów', () => {
  assert.equal(czekaNaIndeksowanie({ status: 'chunked', chunkCount: 3 }), true);
  assert.equal(czekaNaIndeksowanie({ status: 'no_text', chunkCount: 0 }), false);
  assert.equal(czekaNaIndeksowanie({ status: 'ready', chunkCount: 3 }), false);
});
