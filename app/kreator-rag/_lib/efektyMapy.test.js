import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  znacznikiKaskady,
  czasZapalania,
  fazaPunktu,
  cokolwiekTrwa,
  krycieSmugi,
  pierscien,
  srodekZbioru,
  ODSTEP_KASKADY,
  CZAS_POSWIATY,
  PROMIEN_POSWIATY,
} from './efektyMapy.js';

// Reguła 12.9 jest wymogiem nadrzędnym, a jej złamanie nie objawia się
// wyjątkiem ani pustą listą — objawia się widokiem, który kłamie o danych.
// Dlatego jest sprawdzana testem, a nie oglądaniem.

// --- kaskada -------------------------------------------------------------------

test('kaskada rozkłada partię co stały odstęp, zaczynając od teraz', () => {
  const z = znacznikiKaskady(['a', 'b', 'c'], 1000);
  assert.equal(z.get('a'), 1000);
  assert.equal(z.get('b'), 1000 + ODSTEP_KASKADY);
  assert.equal(z.get('c'), 1000 + 2 * ODSTEP_KASKADY);
});

test('bez kaskady cała partia dostaje TEN SAM czas', () => {
  // To jest zachowanie sprzed tej rundy i zarazem tryb prefers-reduced-motion.
  const z = znacznikiKaskady(['a', 'b', 'c'], 1000, { kaskada: false });
  assert.deepEqual([...z.values()], [1000, 1000, 1000]);
});

test('czas zapalania partii liczy się od LICZBY punktów, nie od czasu poświaty', () => {
  assert.equal(czasZapalania(32), 31 * ODSTEP_KASKADY);
  assert.equal(czasZapalania(1), 0, 'jeden punkt nie ma czego rozkładać');
  assert.equal(czasZapalania(0), 0);
  assert.equal(czasZapalania(32, { kaskada: false }), 0);
});

test('pusta partia nie wywraca znaczników', () => {
  assert.equal(znacznikiKaskady([], 1000).size, 0);
  assert.equal(znacznikiKaskady(null, 1000).size, 0);
});

// --- faza punktu ----------------------------------------------------------------

test('punkt PRZED swoim znacznikiem jest niewidoczny, nie przezroczysty', () => {
  // Różnica jest istotna: niewidoczny punkt nie trafia do żadnej ścieżki
  // rysowania, więc nie da się go zobaczyć jako ledwie widocznej plamki.
  const f = fazaPunktu(1000, 900);
  assert.equal(f.widoczny, false);
  assert.equal(f.krycie, 0);
  assert.equal(f.swiezy, true, 'wciąż go czekamy, więc pętla ma chodzić');
});

test('punkt w chwili zapalenia jest największy i ledwo widoczny', () => {
  const f = fazaPunktu(1000, 1000);
  assert.equal(f.widoczny, true);
  assert.equal(f.krycie, 0);
  assert.equal(f.mnoznikPromienia, PROMIEN_POSWIATY);
});

test('poświata dochodzi do docelowej jasności i docelowego rozmiaru', () => {
  const f = fazaPunktu(1000, 1000 + CZAS_POSWIATY);
  assert.equal(f.krycie, 1);
  assert.equal(f.mnoznikPromienia, 1);
  assert.equal(f.swiezy, false, 'po wygaśnięciu punkt wraca do wspólnej ścieżki');
});

test('w połowie poświaty krycie i promień są w połowie drogi', () => {
  const f = fazaPunktu(1000, 1000 + CZAS_POSWIATY / 2);
  assert.equal(f.krycie, 0.5);
  assert.equal(f.mnoznikPromienia, 1 + (PROMIEN_POSWIATY - 1) * 0.5);
});

test('bez poświaty punkt zapala się od razu w pełni', () => {
  const f = fazaPunktu(1000, 1000, { poswiata: false });
  assert.equal(f.krycie, 1);
  assert.equal(f.mnoznikPromienia, 1);
  assert.equal(f.swiezy, false);
});

test('punkt BEZ znacznika jest zwykłym punktem', () => {
  // Zdecydowana większość punktów na mapie — nigdy nie były świeże albo
  // dawno wygasły. Nie mogą płacić za mechanizm poświaty.
  const f = fazaPunktu(null, 5000);
  assert.equal(f.widoczny, true);
  assert.equal(f.krycie, 1);
  assert.equal(f.swiezy, false);
});

test('pętla wie, że ma chodzić, dopóki cokolwiek czeka albo gaśnie', () => {
  const z = new Map([['a', 1000], ['b', 1200]]);
  assert.equal(cokolwiekTrwa(z, 1100), true, 'b jeszcze nie zapalone');
  assert.equal(cokolwiekTrwa(z, 1200 + CZAS_POSWIATY - 1), true);
  assert.equal(cokolwiekTrwa(z, 1200 + CZAS_POSWIATY), false, 'ostatni wygasł');
  assert.equal(cokolwiekTrwa(new Map(), 0), false);
});

// --- smugi ----------------------------------------------------------------------

test('smuga gaśnie RUCHEM: brak przesunięcia to brak smugi', () => {
  // Sedno rozwiązania. Gdy tween się kończy, odcinki maleją do zera i smugi
  // znikają w tej samej klatce — bez osobnego czasu i bez stanu do sprzątania.
  assert.equal(krycieSmugi(0), 0);
  assert.equal(krycieSmugi(-3), 0, 'ujemna długość to błąd wołającego, nie efekt');
});

test('krycie smugi rośnie z długością odcinka i nasyca się', () => {
  const male = krycieSmugi(1);
  const srednie = krycieSmugi(3);
  const duze = krycieSmugi(6);
  const ogromne = krycieSmugi(60);
  assert.ok(male < srednie && srednie < duze);
  assert.equal(duze, ogromne, 'powyżej progu smuga nie jaśnieje dalej');
  assert.ok(ogromne <= 0.55, 'smuga nie może przykryć punktu');
});

// --- pierścień ------------------------------------------------------------------

test('pierścień rośnie, gaśnie i znika razem z przejściem', () => {
  const start = pierscien(0.01);
  const srodek = pierscien(0.5);
  assert.ok(start.promien < srodek.promien, 'promień rośnie z postępem');
  assert.ok(start.krycie > srodek.krycie, 'krycie maleje szybciej niż rośnie promień');
  assert.equal(pierscien(1), null, 'po przejściu nie ma czego rysować');
  assert.equal(pierscien(1.5), null);
});

// --- środek zbioru --------------------------------------------------------------

test('pierścień wychodzi ze środka DANYCH, nie ze środka okna', () => {
  // Przy przesuniętej albo przybliżonej mapie środek płótna nie ma nic
  // wspólnego z tym, gdzie leżą punkty.
  const s = srodekZbioru([{ x: 0, y: 0 }, { x: 4, y: 8 }]);
  assert.deepEqual(s, { x: 2, y: 4 });
});

test('środek pustego zbioru to null, a nie punkt zero', () => {
  assert.equal(srodekZbioru([]), null);
  assert.equal(srodekZbioru([{ x: null, y: 3 }]), null, 'wpisy bez współrzędnych pomijane');
});

// --- 12.9: zabezpieczenie konstrukcyjne -----------------------------------------

test('ŻADNA funkcja efektów nie zwraca współrzędnej punktu', () => {
  // To jest test reguły, nie implementacji. Dopóki ten plik nie umie oddać
  // pozycji fragmentu, nie ma jak nią poruszyć — a to jest dokładnie ten
  // zakaz, który 12.9 stawia mapie (SPEC:1660).
  const pola = (o) => (o && typeof o === 'object' ? Object.keys(o) : []);
  const zakazane = ['x', 'y', 'z', 'cx', 'cy'];

  const wyniki = [
    fazaPunktu(1000, 1100),
    fazaPunktu(null, 0),
    pierscien(0.5),
    { krycie: krycieSmugi(4) },
  ];
  for (const w of wyniki) {
    for (const p of pola(w)) {
      assert.equal(zakazane.includes(p), false, `pole "${p}" wygląda na współrzędną`);
    }
  }
  // srodekZbioru JEST wyjątkiem i to jest świadome: oddaje środek CZYTANY
  // z danych, nigdy do nich nie wraca — pierścień go tylko rysuje.
  assert.deepEqual(pola(srodekZbioru([{ x: 1, y: 1 }])), ['x', 'y']);
});
