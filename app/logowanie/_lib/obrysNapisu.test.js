import { test } from "node:test";
import assert from "node:assert/strict";
import { sledzKontur, uproscLamana } from "./obrysNapisu.js";

// Bitmapa to zwykla tablica bajtow alfa, jeden bajt na piksel — dokladnie to,
// co komponent wyciaga raz z getImageData. Dzieki temu caly skan da sie
// sprawdzic na ksztalcie wpisanym recznie.
function bitmapa(W, H) {
  return new Uint8Array(W * H);
}
function prostokat(alfa, W, x0, y0, w, h, wartosc = 255) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) alfa[y * W + x] = wartosc;
  }
}

// =============================================================================
//  SLEDZENIE KONTURU
// =============================================================================

test('PROSTOKĄT 10x6 daje JEDNĄ pętlę o 28 punktach', () => {
  // Obwód prostokąta liczony po pikselach to 2*(10+6) - 4 = 28: rogi liczą się
  // raz. Wnętrze nie zaczyna własnej pętli, bo start jest tylko tam, gdzie nad
  // pikselem jest pusto.
  const W = 16;
  const H = 12;
  const alfa = bitmapa(W, H);
  prostokat(alfa, W, 2, 2, 10, 6);

  const petle = sledzKontur(alfa, W, H, 140, 8);

  assert.equal(petle.length, 1);
  assert.equal(petle[0].length, 28);
});

test('pętla biegnie po BRZEGU kształtu, nie po jego wnętrzu', () => {
  const W = 16;
  const H = 12;
  const alfa = bitmapa(W, H);
  prostokat(alfa, W, 2, 2, 10, 6);

  const [petla] = sledzKontur(alfa, W, H, 140, 8);
  const naBrzegu = petla.every(
    ([x, y]) => x === 2 || x === 11 || y === 2 || y === 7,
  );
  assert.ok(naBrzegu, "każdy punkt pętli leży na krawędzi prostokąta");

  // Żaden punkt nie powtarza się — to jest pojedyncze okrążenie.
  const unikalne = new Set(petla.map(([x, y]) => `${x},${y}`));
  assert.equal(unikalne.size, petla.length);
});

test('DWA ROZŁĄCZNE prostokąty dają DWIE pętle', () => {
  const W = 30;
  const H = 12;
  const alfa = bitmapa(W, H);
  prostokat(alfa, W, 2, 2, 8, 6);
  prostokat(alfa, W, 16, 2, 8, 6);

  const petle = sledzKontur(alfa, W, H, 140, 8);
  assert.equal(petle.length, 2);
  assert.deepEqual(petle.map((p) => p.length), [24, 24]);
});

test('PUSTA bitmapa daje zero pętli', () => {
  const W = 20;
  const H = 10;
  assert.deepEqual(sledzKontur(bitmapa(W, H), W, H, 140, 4), []);
});

test('próg alfa działa: piksele słabsze niż próg to nie tusz', () => {
  const W = 16;
  const H = 12;
  const alfa = bitmapa(W, H);
  prostokat(alfa, W, 2, 2, 10, 6, 100); // poniżej progu 140

  assert.deepEqual(sledzKontur(alfa, W, H, 140, 8), []);
  assert.equal(sledzKontur(alfa, W, H, 90, 8).length, 1, "przy niższym progu widać");
});

test('minDlugosc odsiewa drobiny — domyślnie 30, jak w prototypie', () => {
  const W = 16;
  const H = 12;
  const alfa = bitmapa(W, H);
  prostokat(alfa, W, 2, 2, 10, 6); // obwód 28, czyli poniżej 30

  assert.deepEqual(sledzKontur(alfa, W, H), [], "domyślny próg 30 to odsiewa");
  assert.equal(sledzKontur(alfa, W, H, 140, 8).length, 1);
});

test('KSZTAŁT DOTYKAJĄCY KRAWĘDZI nie wyprowadza punktów poza tablicę', () => {
  const W = 16;
  const H = 12;
  const alfa = bitmapa(W, H);
  prostokat(alfa, W, 5, 1, 11, 6); // sięga x = 15, czyli ostatniej kolumny

  const petle = sledzKontur(alfa, W, H, 140, 8);
  assert.ok(petle.length >= 1);

  for (const petla of petle) {
    for (const [x, y] of petla) {
      assert.ok(x >= 0 && x < W, `x poza zakresem: ${x}`);
      assert.ok(y >= 0 && y < H, `y poza zakresem: ${y}`);
    }
  }
});

// =============================================================================
//  UPRASZCZANIE LAMANEJ
// =============================================================================

test('LINIA PROSTA redukuje się do dwóch punktów', () => {
  const proste = Array.from({ length: 10 }, (_, i) => [i, 0]);
  assert.deepEqual(uproscLamana(proste, 1), [[0, 0], [9, 0]]);
});

test('ZAŁAMANIE PRZEŻYWA upraszczanie', () => {
  const l = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 3], [3, 6]];
  const wynik = uproscLamana(l, 1);
  assert.equal(wynik.length, 3);
  assert.deepEqual(wynik[0], [0, 0]);
  assert.deepEqual(wynik[1], [3, 0], "wierzchołek załamania zostaje");
  assert.deepEqual(wynik.at(-1), [3, 6]);
});

test('ROSNĄCE eps NIE ZWIĘKSZA liczby punktów', () => {
  const l = [];
  for (let i = 0; i < 60; i += 1) l.push([i, Math.round(Math.sin(i / 3) * 8)]);

  let poprzednia = Infinity;
  for (const eps of [0.1, 0.5, 1, 1.7, 3, 6, 12, 40]) {
    const ile = uproscLamana(l, eps).length;
    assert.ok(ile <= poprzednia, `eps ${eps}: ${ile} > ${poprzednia}`);
    assert.ok(ile >= 2, "zawsze zostają przynajmniej końce");
    poprzednia = ile;
  }
});

test('WEJŚCIE JEST PO WYWOŁANIU NIETKNIĘTE', () => {
  const l = [[0, 0], [1, 5], [2, 0], [3, 5], [4, 0]];
  const przed = structuredClone(l);
  uproscLamana(l, 1);
  assert.deepEqual(l, przed);
});

test('mniej niż trzy punkty wracają bez zmian, a nie jako undefined', () => {
  // Prototyp tego nie sprawdza, bo dostaje wyłącznie pętle dłuższe niż 30
  // punktów. Funkcja czysta może dostać cokolwiek.
  assert.deepEqual(uproscLamana([], 1), []);
  assert.deepEqual(uproscLamana([[1, 2]], 1), [[1, 2]]);
  assert.deepEqual(uproscLamana([[1, 2], [3, 4]], 1), [[1, 2], [3, 4]]);
});

// =============================================================================
//  ZLOZENIE OBU KROKOW — tak, jak sklada je komponent
// =============================================================================

test('kontur prostokąta po uproszczeniu zostaje czterema rogami', () => {
  const W = 40;
  const H = 24;
  const alfa = bitmapa(W, H);
  prostokat(alfa, W, 4, 4, 30, 14);

  const [petla] = sledzKontur(alfa, W, H, 140, 8);
  const uproszczona = uproscLamana(petla, 1.7);

  assert.ok(petla.length > 60, "surowy kontur to każdy piksel brzegu");
  assert.ok(
    uproszczona.length <= 6,
    `zostało ${uproszczona.length} punktów zamiast czterech rogów z domknięciem`,
  );
});
