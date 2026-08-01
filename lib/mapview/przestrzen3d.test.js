import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  obrocPunkt,
  wspolczynnikPerspektywy,
  przygotujKlatke3d,
  kubelekGlebi,
  computeNeighbors3d,
  krawedzie3d,
} from './przestrzen3d.js';
import { sredniKolor } from './edges.js';

const blisko = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- obrót -----------------------------------------------------------------------

test('obrót o zero nic nie zmienia', () => {
  assert.deepEqual(obrocPunkt(1, 2, 3, 0, 0), [1, 2, 3]);
});

test('obrót o 90° wokół osi Y zamienia X i Z', () => {
  const [x, y, z] = obrocPunkt(1, 0, 0, Math.PI / 2, 0);
  assert.ok(blisko(x, 0, 1e-12));
  assert.equal(y, 0);
  assert.ok(blisko(z, -1, 1e-12));
});

test('obrót zachowuje długość wektora (to obrót, nie skalowanie)', () => {
  const [x, y, z] = obrocPunkt(0.3, -0.5, 0.2, 0.7, -0.4);
  const przed = Math.sqrt(0.3 ** 2 + 0.5 ** 2 + 0.2 ** 2);
  const po = Math.sqrt(x * x + y * y + z * z);
  assert.ok(blisko(przed, po, 1e-12));
});

test('obrót jest deterministyczny — ten sam kąt daje ten sam obraz', () => {
  assert.deepEqual(obrocPunkt(0.4, 0.1, -0.2, 1.1, 0.3), obrocPunkt(0.4, 0.1, -0.2, 1.1, 0.3));
});

// --- perspektywa (12.8: bez niej chmura wygląda płasko) ---------------------------

test('punkt bliżej kamery dostaje większy współczynnik', () => {
  const blisze = wspolczynnikPerspektywy(0.5, 3);
  const dalsze = wspolczynnikPerspektywy(-0.5, 3);
  assert.ok(blisze > dalsze, 'brak perspektywy — chmura będzie płaska');
});

test('punkt w płaszczyźnie kamery jest odrzucany, nie dzieli przez zero', () => {
  assert.equal(wspolczynnikPerspektywy(3, 3), null);
  assert.equal(wspolczynnikPerspektywy(5, 3), null);
});

test('punkt w środku układu ma współczynnik 1', () => {
  assert.equal(wspolczynnikPerspektywy(0, 3), 1);
});

// --- klatka 3D: sortowanie po głębi ----------------------------------------------

test('przygotujKlatke3d sortuje od najdalszego do najbliższego', () => {
  const punkty = [
    { id: 'blisko', x: 0, y: 0, z: 0.5 },
    { id: 'daleko', x: 0, y: 0, z: -0.5 },
    { id: 'srodek', x: 0, y: 0, z: 0 },
  ];
  const klatka = przygotujKlatke3d(punkty, { yaw: 0, pitch: 0 });
  assert.deepEqual(klatka.map((p) => p.id), ['daleko', 'srodek', 'blisko']);
});

test('klatka zachowuje wszystkie pola punktu (id, kolor dokumentu itd.)', () => {
  const klatka = przygotujKlatke3d([{ id: 'a', x: 0.1, y: 0.2, z: 0, documentId: 'd1' }], { yaw: 0.3, pitch: 0.2 });
  assert.equal(klatka[0].documentId, 'd1');
  assert.equal(klatka[0].id, 'a');
  assert.ok(Number.isFinite(klatka[0].px));
  assert.ok(Number.isFinite(klatka[0].py));
});

test('punkt za kamerą wypada z klatki zamiast odbijać obraz', () => {
  const klatka = przygotujKlatke3d([{ id: 'za', x: 0, y: 0, z: 10 }], { yaw: 0, pitch: 0, dystans: 3 });
  assert.equal(klatka.length, 0);
});

// --- kubełki głębi (wydajność rysowania) -----------------------------------------

test('kubelekGlebi rozkłada zakres na przedziały, skrajne przycina', () => {
  assert.equal(kubelekGlebi(1, 1, 2, 10), 0);
  assert.equal(kubelekGlebi(2, 1, 2, 10), 9);
  assert.equal(kubelekGlebi(1.5, 1, 2, 10), 5);
  assert.equal(kubelekGlebi(99, 1, 2, 10), 9);
});

test('zdegenerowany zakres głębi nie wywraca kubełkowania', () => {
  assert.equal(kubelekGlebi(1, 1, 1, 10), 0);
});

// --- sąsiedztwo 3D ---------------------------------------------------------------

test('computeNeighbors3d liczy w TRZECH wymiarach, nie w dwóch', () => {
  // W rzucie 2D "b" i "c" są tak samo blisko "a"; różni je dopiero oś Z.
  const punkty = [
    { id: 'a', x: 0, y: 0, z: 0 },
    { id: 'b', x: 1, y: 0, z: 0 },
    { id: 'c', x: 1, y: 0, z: 5 },
  ];
  const s = computeNeighbors3d(punkty, 1);
  assert.equal(s.get('a')[0].id, 'b');
  assert.equal(s.get('a')[0].dist3d, 1);
});

test('odległość 3D liczona poprawnie (3-4-5 w przestrzeni)', () => {
  const s = computeNeighbors3d(
    [
      { id: 'a', x: 0, y: 0, z: 0 },
      { id: 'b', x: 2, y: 3, z: 6 },
    ],
    1
  );
  assert.equal(s.get('a')[0].dist3d, 7);
});

test('sąsiad 3D bywa INNY niż 2D — to jest powód, dla którego liczymy go osobno', () => {
  const punkty = [
    { id: 'a', x: 0, y: 0, z: 0 },
    { id: 'plaski', x: 0.9, y: 0, z: 9 },
    { id: 'przestrzenny', x: 1.2, y: 0, z: 0.1 },
  ];
  const s3 = computeNeighbors3d(punkty, 1);
  assert.equal(s3.get('a')[0].id, 'przestrzenny', 'w 3D wygrywa punkt bliski w każdej osi');
});

test('nie wlicza samego siebie i respektuje k', () => {
  const punkty = [
    { id: 'a', x: 0, y: 0, z: 0 },
    { id: 'b', x: 1, y: 0, z: 0 },
    { id: 'c', x: 2, y: 0, z: 0 },
    { id: 'd', x: 3, y: 0, z: 0 },
  ];
  const s = computeNeighbors3d(punkty, 2);
  assert.equal(s.get('a').length, 2);
  assert.deepEqual(s.get('a').map((n) => n.id), ['b', 'c']);
});

test('klucz odległości nazywa się dist3d — NIE dist2d i NIE score', () => {
  const s = computeNeighbors3d([{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1, y: 1, z: 1 }], 1);
  const sasiad = s.get('a')[0];
  assert.ok('dist3d' in sasiad);
  assert.equal('dist2d' in sasiad, false);
  assert.equal('score' in sasiad, false);
});

// --- krawędzie 3D ----------------------------------------------------------------

test('krawedzie3d deduplikuje tak samo jak wersja 2D', () => {
  const mapa = new Map([
    ['a', [{ id: 'b', dist3d: 1 }]],
    ['b', [{ id: 'a', dist3d: 1 }]],
  ]);
  const kolory = new Map([['a', '#2563eb'], ['b', '#2563eb']]);
  const e = krawedzie3d(mapa, kolory, sredniKolor);
  assert.equal(e.length, 1);
  assert.equal(e[0].color, '#2563eb');
});

test('krawędzie 3D nie udają sąsiedztwa 2D — niosą dist3d', () => {
  const mapa = new Map([['a', [{ id: 'b', dist3d: 2.5 }]]]);
  const e = krawedzie3d(mapa, new Map(), sredniKolor);
  assert.equal(e[0].dist3d, 2.5);
  assert.equal('dist2d' in e[0], false);
});
