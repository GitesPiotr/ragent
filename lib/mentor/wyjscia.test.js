import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wyjsciaDlaWiadomosci, RODZAJ } from './wyjscia.js';

const idy = (lista) => lista.map((w) => w.id);
const rodzaje = (lista) => lista.map((w) => w.rodzaj);

// --- propozycja zastosowana ---------------------------------------------------

test('po wpisaniu do kreatora nie ma juz zadnej decyzji', () => {
  const w = wyjsciaDlaWiadomosci({
    krok: 'rules',
    propozycja: { field: 'rules', value: ['a'] },
    zastosowana: true,
  });
  assert.deepEqual(w, []);
});

// --- ocena wlasnego opisu persony ---------------------------------------------

test('ocena wlasnego opisu daje trzy wyjscia', () => {
  const w = wyjsciaDlaWiadomosci({
    krok: 'persona',
    propozycja: { field: 'persona', value: 'moj opis', wlasny: true },
    personaPath: 'self',
    edycjaOpisu: false,
  });
  assert.deepEqual(idy(w), [
    'popraw-swoj-opis',
    'mentor-z-opisu',
    'akceptuj-swoj-opis',
  ]);
  assert.deepEqual(rodzaje(w), [RODZAJ.WPISZ, RODZAJ.POWIEDZ, RODZAJ.AKCEPTUJ]);
});

test('w trakcie poprawiania opisu wyjsc nie ma', () => {
  // Inaczej pole edycji i przyciski wyboru stalyby naraz.
  const w = wyjsciaDlaWiadomosci({
    krok: 'persona',
    propozycja: { field: 'persona', value: 'moj opis', wlasny: true },
    personaPath: 'self',
    edycjaOpisu: true,
  });
  assert.deepEqual(w, []);
});

test('ocena wlasnego opisu poza sciezka „opisz sam" nie pokazuje wyjsc', () => {
  const w = wyjsciaDlaWiadomosci({
    krok: 'persona',
    propozycja: { field: 'persona', value: 'x', wlasny: true },
    personaPath: 'propose',
  });
  assert.deepEqual(w, []);
});

// --- propozycje mentora --------------------------------------------------------

test('gotowa persona ma akceptacje i przejecie do edycji', () => {
  const w = wyjsciaDlaWiadomosci({
    krok: 'persona',
    propozycja: { field: 'persona', value: 'persona od mentora' },
  });
  assert.deepEqual(idy(w), ['akceptuj', 'przejmij-persone']);
  assert.equal(w[1].przejmijWartosc, true);
  assert.equal(w[1].pole, 'opis');
});

test('kazda inna propozycja ma na razie sama akceptacje', () => {
  // Etap 1 oddaje dzisiejsze zachowanie 1:1 — wiecej wyjsc dokłada etap 2.
  for (const field of ['model', 'temperature', 'rules', 'tools', 'knowledgeBase', 'rag']) {
    const w = wyjsciaDlaWiadomosci({ krok: field, propozycja: { field, value: 'x' } });
    assert.deepEqual(idy(w), ['akceptuj'], `pole ${field}`);
    assert.equal(w[0].rodzaj, RODZAJ.AKCEPTUJ);
  }
});

// --- start kroku persony -------------------------------------------------------

test('start kroku persony daje wybor sciezki', () => {
  const w = wyjsciaDlaWiadomosci({ krok: 'persona', personaPath: null });
  assert.deepEqual(idy(w), ['opisz-sam', 'popros-o-persone']);
});

test('wybor sciezki znika, gdy sciezka jest juz wybrana', () => {
  assert.deepEqual(wyjsciaDlaWiadomosci({ krok: 'persona', personaPath: 'self' }), []);
  assert.deepEqual(wyjsciaDlaWiadomosci({ krok: 'persona', personaPath: 'done' }), []);
});

// --- kroki bez wiersza w tabeli ------------------------------------------------

test('krok bez propozycji nie ma na razie wyjsc', () => {
  // Etap 3 wypelni te miejsca — tu pilnujemy, ze etap 1 niczego nie dodal.
  assert.deepEqual(wyjsciaDlaWiadomosci({ krok: 'knowledgeBase' }), []);
  assert.deepEqual(wyjsciaDlaWiadomosci({ krok: 'rules' }), []);
  assert.deepEqual(wyjsciaDlaWiadomosci({ krok: 'done' }), []);
});

test('brak argumentow nie wywraca funkcji', () => {
  assert.deepEqual(wyjsciaDlaWiadomosci(), []);
});
