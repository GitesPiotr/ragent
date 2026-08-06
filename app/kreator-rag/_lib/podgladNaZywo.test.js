import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  czyIndeksowanieTrwa,
  odciskDokumentow,
  czyListaSieZmienila,
  czyDomknac,
  czyPrzeliczonoBaze,
  STATUSY_W_TOKU,
  PULS_DOKUMENTOW,
} from './podgladNaZywo.js';

// Każda z tych reguł kosztowała przebieg pomiarowy na stu fragmentach.
// Test jest po to, żeby drugi raz nie trzeba było.

// --- czy indeksowanie trwa --------------------------------------------------------

test('dokument w toku z fragmentami znaczy „trwa"', () => {
  assert.equal(czyIndeksowanieTrwa([{ status: 'embedding', chunkCount: 30 }]), true);
  assert.equal(czyIndeksowanieTrwa([{ status: 'chunked', chunkCount: 118 }]), true);
});

test('same gotowe dokumenty to nie indeksowanie', () => {
  assert.equal(czyIndeksowanieTrwa([{ status: 'ready', chunkCount: 108 }]), false);
});

test('dokument w toku BEZ fragmentów jeszcze nie liczy się do „trwa"', () => {
  // Świeżo wgrany plik przed cięciem — nie ma czego pokazać na mapie.
  assert.equal(czyIndeksowanieTrwa([{ status: 'pending', chunkCount: 0 }]), false);
});

test('pusta lista i śmieci nie wywracają reguły', () => {
  assert.equal(czyIndeksowanieTrwa([]), false);
  assert.equal(czyIndeksowanieTrwa(null), false);
  assert.equal(czyIndeksowanieTrwa([null, undefined]), false);
});

test('wszystkie statusy w toku są rozpoznawane', () => {
  for (const s of STATUSY_W_TOKU) {
    assert.equal(czyIndeksowanieTrwa([{ status: s, chunkCount: 5 }]), true, s);
  }
});

// --- odcisk listy -----------------------------------------------------------------

test('ta sama lista daje ten sam odcisk — puls nie może przemontowywać efektów', () => {
  const a = [{ id: '1', status: 'ready', chunkCount: 108 }];
  const b = [{ id: '1', status: 'ready', chunkCount: 108 }];
  assert.equal(czyListaSieZmienila(a, b), false);
});

test('ZMIANA STATUSU jest widoczna — to na niej stoi domknięcie', () => {
  const a = [{ id: '1', status: 'embedding', chunkCount: 118 }];
  const b = [{ id: '1', status: 'ready', chunkCount: 118 }];
  assert.equal(czyListaSieZmienila(a, b), true);
});

test('NOWY DOKUMENT jest widoczny — to na nim stoi martwy start', () => {
  const a = [{ id: '1', status: 'ready', chunkCount: 108 }];
  const b = [...a, { id: '2', status: 'chunked', chunkCount: 118 }];
  assert.equal(czyListaSieZmienila(a, b), true);
});

test('przyrost fragmentów jest widoczny', () => {
  const a = [{ id: '1', status: 'embedding', chunkCount: 32 }];
  const b = [{ id: '1', status: 'embedding', chunkCount: 64 }];
  assert.equal(czyListaSieZmienila(a, b), true);
});

test('usunięcie dokumentu jest widoczne', () => {
  assert.equal(czyListaSieZmienila([{ id: '1', status: 'ready', chunkCount: 5 }], []), true);
});

test('odcisk pustej i nieistniejącej listy jest pusty, nie wybuchowy', () => {
  assert.equal(odciskDokumentow([]), '');
  assert.equal(odciskDokumentow(null), '');
});

// --- domknięcie -------------------------------------------------------------------

test('DOMKNIĘCIE ŁAPIE TYLKO PRZEJŚCIE true → false', () => {
  assert.equal(czyDomknac(true, false), true, 'koniec indeksowania — dociągamy całość');
  assert.equal(czyDomknac(false, true), false, 'początek — od tego jest odpytywanie');
  assert.equal(czyDomknac(true, true), false, 'trwa — nie dociągamy co render');
  assert.equal(czyDomknac(false, false), false, 'spokój — zwłaszcza przy pierwszym renderze');
});

test('brak poprzedniego stanu nie udaje domknięcia', () => {
  // Pierwszy render: `bylo` jest jeszcze niezainicjowane.
  assert.equal(czyDomknac(undefined, false), false);
  assert.equal(czyDomknac(null, false), false);
});

// --- przeliczenie bazy ------------------------------------------------------------

test('ZMIANA builtAt to przeliczenie bazy', () => {
  const a = { projectionBuilt: true, builtAt: '2026-08-06T11:00:00.000Z' };
  const b = { projectionBuilt: true, builtAt: '2026-08-06T11:46:03.614Z' };
  assert.equal(czyPrzeliczonoBaze(a, b), true);
});

test('ten sam builtAt to zwykły odczyt, nie przeliczenie', () => {
  const a = { projectionBuilt: true, builtAt: '2026-08-06T11:00:00.000Z' };
  assert.equal(czyPrzeliczonoBaze(a, { ...a }), false);
});

test('PIERWSZY ODCZYT NIE JEST PRZELICZENIEM — inaczej komunikat wyskakiwałby przy każdym wejściu', () => {
  const nowe = { projectionBuilt: true, builtAt: '2026-08-06T11:46:03.614Z' };
  assert.equal(czyPrzeliczonoBaze(null, nowe), false);
  assert.equal(czyPrzeliczonoBaze(undefined, nowe), false);
});

test('przejście z „brak bazy" w „baza jest" to zbudowanie, nie przeliczenie', () => {
  const a = { projectionBuilt: false, builtAt: null };
  const b = { projectionBuilt: true, builtAt: '2026-08-06T11:46:03.614Z' };
  assert.equal(czyPrzeliczonoBaze(a, b), false);
});

test('brak builtAt po którejkolwiek stronie nie wywraca reguły', () => {
  assert.equal(czyPrzeliczonoBaze({ projectionBuilt: true }, { projectionBuilt: true, builtAt: 'x' }), false);
  assert.equal(czyPrzeliczonoBaze({ projectionBuilt: true, builtAt: 'x' }, { projectionBuilt: true }), false);
});

// --- stałe ------------------------------------------------------------------------

test('puls listy jest rzadszy niż odpytywanie postępu — chodzi także w spoczynku', () => {
  assert.equal(PULS_DOKUMENTOW, 10000);
  assert.ok(PULS_DOKUMENTOW > 5000, 'inaczej spoczywająca mapa kosztuje więcej niż pracująca');
});
