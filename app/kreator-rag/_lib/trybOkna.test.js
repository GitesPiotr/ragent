import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wysokoscPlotnaWOknie,
  rozmiarNowegoOkna,
  cechyOkna,
  czyZablokowane,
  otworzOknoMapy,
  adresOknaMapy,
  nazwaOkna,
  REZERWA_PIONOWA,
  MIN_WYSOKOSC_PLOTNA,
  MIN_SZEROKOSC_OKNA,
  MIN_WYSOKOSC_OKNA,
} from './trybOkna.js';
import * as trybOkna from './trybOkna.js';

// --- wysokość płótna --------------------------------------------------------------

test('płótno bierze wysokość z okna, nie ze stałej 560', () => {
  const w = wysokoscPlotnaWOknie(1080);
  assert.equal(w, 1080 - REZERWA_PIONOWA);
  // Sedno całej rundy: w wysokim oknie płótno MUSI być wyższe niż na stronie.
  assert.ok(w > 560, 'inaczej okno jest tej samej wysokości co strona');
});

test('niższe okno = niższe płótno, co do piksela', () => {
  assert.equal(wysokoscPlotnaWOknie(1080) - wysokoscPlotnaWOknie(800), 280);
});

test('KLAMRA: bardzo niskie okno daje płótno niewygodne, ale nie ujemne', () => {
  assert.equal(wysokoscPlotnaWOknie(120), MIN_WYSOKOSC_PLOTNA);
});

test('brak wysokości (SSR, okno jeszcze nieznane) nie daje NaN', () => {
  assert.equal(wysokoscPlotnaWOknie(undefined), MIN_WYSOKOSC_PLOTNA);
  assert.equal(wysokoscPlotnaWOknie(null), MIN_WYSOKOSC_PLOTNA);
  assert.ok(Number.isFinite(wysokoscPlotnaWOknie(0)));
});

test('wysokość jest całkowita — ułamek piksela na canvasie daje rozmycie', () => {
  const w = wysokoscPlotnaWOknie(767.3);
  assert.equal(w, Math.round(767.3 - REZERWA_PIONOWA));
  assert.equal(w % 1, 0);
});

// --- brak sprzężenia zwrotnego ----------------------------------------------------

test('BRAK SPRZĘŻENIA: ten sam viewport daje ZAWSZE ten sam wynik', () => {
  // Gdyby wysokość pochodziła z kontenera, każde podstawienie wyniku z powrotem
  // dawałoby wartość większą od poprzedniej i płótno rosłoby bez końca. Tutaj
  // funkcja nie ma jak zobaczyć poprzedniego wyniku, więc pętla jest niemożliwa.
  const pierwszy = wysokoscPlotnaWOknie(900);
  for (let i = 0; i < 50; i += 1) {
    assert.equal(wysokoscPlotnaWOknie(900), pierwszy, `rozjazd na iteracji ${i}`);
  }
});

test('BRAK SPRZĘŻENIA: nic zmierzonego z układu nie zmienia wyniku', () => {
  const bez = wysokoscPlotnaWOknie(900);
  assert.equal(wysokoscPlotnaWOknie(900, { clientHeight: 99999 }), bez);
});

test('SZEROKOŚCI NIE LICZYMY W JS — należy do CSS', () => {
  // Regresja po pomiarze: wersja z `innerWidth - padding` dawała płótno szersze
  // od `main` o szerokość bocznego paska nawigacji, którego viewport nie widzi.
  // Gdyby taka funkcja tu wróciła, ten test ma o tym powiedzieć.
  assert.equal(typeof trybOkna.wymiaryPlotnaWOknie, 'undefined');
  assert.equal(typeof trybOkna.REZERWA_POZIOMA, 'undefined');
  assert.equal(typeof wysokoscPlotnaWOknie(900), 'number', 'wynik to sama wysokość');
});

test('rezerwę da się nadpisać, ale wynik dalej zależy tylko od wejścia', () => {
  assert.equal(wysokoscPlotnaWOknie(800, { rezerwaPionowa: 100 }), 700);
});

// --- rozmiar nowego okna ----------------------------------------------------------

test('nowe okno bierze CAŁY dostępny obszar ekranu', () => {
  const r = rozmiarNowegoOkna({ availWidth: 1920, availHeight: 1040 });
  assert.equal(r.szerokosc, 1920);
  assert.equal(r.wysokosc, 1040);
});

test('okno nigdy nie jest większe niż obszar dostępny', () => {
  // availHeight < screen.height, bo pasek zadań zabiera swoje. Okno na
  // screen.height wystawałoby poza ekran i dolna krawędź mapy byłaby nie do zobaczenia.
  const r = rozmiarNowegoOkna({ availWidth: 1920, availHeight: 1040 });
  assert.ok(r.wysokosc <= 1040);
  assert.ok(r.szerokosc <= 1920);
});

test('availLeft/availTop kierują okno na właściwy monitor', () => {
  const r = rozmiarNowegoOkna({ availWidth: 1920, availHeight: 1040, availLeft: -1920, availTop: 0 });
  assert.equal(r.lewo, -1920);
  assert.equal(r.gora, 0);
});

test('brak availLeft/availTop (starsze przeglądarki) to zero, nie NaN', () => {
  const r = rozmiarNowegoOkna({ availWidth: 1440, availHeight: 900 });
  assert.equal(r.lewo, 0);
  assert.equal(r.gora, 0);
});

test('KLAMRA: absurdalnie mały ekran nie daje okna wielkości znaczka', () => {
  const r = rozmiarNowegoOkna({ availWidth: 100, availHeight: 80 });
  assert.equal(r.szerokosc, MIN_SZEROKOSC_OKNA);
  assert.equal(r.wysokosc, MIN_WYSOKOSC_OKNA);
});

test('pusty obiekt ekranu nie wywraca otwierania', () => {
  const r = rozmiarNowegoOkna();
  assert.ok(Number.isFinite(r.szerokosc) && Number.isFinite(r.wysokosc));
});

test('cechy zawierają popup=yes — bez tego przeglądarka otworzy KARTĘ i zignoruje wymiary', () => {
  const c = cechyOkna({ szerokosc: 1920, wysokosc: 1040, lewo: 0, gora: 0 });
  assert.ok(c.includes('popup=yes'));
  assert.ok(c.includes('width=1920'));
  assert.ok(c.includes('height=1040'));
});

test('cechy NIE zawierają noopener — z nim window.open zwraca null i blokada staje się nierozpoznawalna', () => {
  const c = cechyOkna({ szerokosc: 800, wysokosc: 600, lewo: 0, gora: 0 });
  assert.ok(!c.includes('noopener'));
});

// --- blokada popupów --------------------------------------------------------------

test('null z window.open to blokada', () => {
  assert.equal(czyZablokowane(null), true);
  assert.equal(czyZablokowane(undefined), true);
});

test('okno natychmiast zamknięte to też blokada (część blokerów tak robi)', () => {
  assert.equal(czyZablokowane({ closed: true }), true);
});

test('obiekt bez pola closed to blokada — nie mamy czym potwierdzić sukcesu', () => {
  assert.equal(czyZablokowane({}), true);
});

test('normalne okno przechodzi', () => {
  assert.equal(czyZablokowane({ closed: false }), false);
});

test('BLOKADA NIE JEST CICHA: otworzOknoMapy mówi wprost, że się nie udało', () => {
  const wynik = otworzOknoMapy('abc', { availWidth: 1920, availHeight: 1040 }, () => null);
  assert.equal(wynik.udane, false);
  assert.equal(wynik.okno, null);
  // Adres wraca nawet przy odmowie — to on zasila zapasowy odnośnik „nowa karta".
  assert.equal(wynik.adres, adresOknaMapy('abc'));
});

test('bloker rzucający wyjątkiem daje ten sam wynik co null, nie wywrotkę', () => {
  const wynik = otworzOknoMapy('abc', {}, () => {
    throw new Error('blocked by extension');
  });
  assert.equal(wynik.udane, false);
  assert.ok(wynik.adres);
});

test('udane otwarcie zwraca okno i podnosi je na wierzch', () => {
  let podniesione = 0;
  const okno = { closed: false, focus: () => { podniesione += 1; } };
  const wynik = otworzOknoMapy('abc', { availWidth: 1920, availHeight: 1040 }, () => okno);
  assert.equal(wynik.udane, true);
  assert.equal(wynik.okno, okno);
  assert.equal(podniesione, 1, 'drugie kliknięcie ma podnieść okno, nie wyglądać na nieskuteczne');
});

test('brak prawa do focus() nie unieważnia otwarcia', () => {
  const okno = { closed: false, focus: () => { throw new Error('cross-origin'); } };
  const wynik = otworzOknoMapy('abc', {}, () => okno);
  assert.equal(wynik.udane, true);
});

test('otwieracz dostaje adres z ?okno=1, nazwę na kolekcję i cechy z wymiarami', () => {
  let zapisane = null;
  otworzOknoMapy('kol-7', { availWidth: 1600, availHeight: 900 }, (a, n, c) => {
    zapisane = { a, n, c };
    return { closed: false, focus() {} };
  });
  assert.equal(zapisane.a, '/kreator-rag/kolekcje/kol-7/mapa?okno=1');
  assert.equal(zapisane.n, nazwaOkna('kol-7'));
  assert.ok(zapisane.c.includes('width=1600'));
});

// --- adres ------------------------------------------------------------------------

test('PARAMETR JEST JEDYNYM PRZEŁĄCZNIKIEM: adres bez ?okno=1 zostaje nietknięty', () => {
  // „Pełny ekran →" prowadzi pod adres BEZ parametru i ma zachowywać się jak dotąd.
  const zOknem = adresOknaMapy('xyz');
  assert.ok(zOknem.endsWith('?okno=1'));
  assert.equal(zOknem.replace('?okno=1', ''), '/kreator-rag/kolekcje/xyz/mapa');
});

test('okno jest jedno na kolekcję, ale różne kolekcje się nie przepychają', () => {
  assert.equal(nazwaOkna('a'), nazwaOkna('a'));
  assert.notEqual(nazwaOkna('a'), nazwaOkna('b'));
});
