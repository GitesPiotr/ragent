import { test } from "node:test";
import assert from "node:assert/strict";
import { KRAWEDZIE, KROPKI, SZEW_X, TROJKATY, WEZLY } from "./siatka.js";

// =============================================================================
//  siatka.js JEST PLIKIEM GENEROWANYM (scripts/wytnij-siatke-logowania.mjs),
//  wiec zadaniem tego pliku NIE jest lapanie literowek — recznie tam nikt nie
//  pisze. Chodzi o zla REGENERACJE: podmieniony prototyp, przestawione pola
//  w krotce, ucieta tablica, indeksy liczone od jedynki. Kazdy z tych bledow
//  daje plik, ktory sie importuje i buduje, a scene psuje dopiero na ekranie.
//
//  Wartosci ponizej sa zmierzone na obecnych danych. Gdy ktoras przestanie sie
//  zgadzac po regeneracji, to nie znaczy automatycznie "test do poprawki" —
//  najpierw docs/prototyplogowania.html.
// =============================================================================

// =============================================================================
//  LICZEBNOSCI
// =============================================================================

test('siatka ma 138 węzłów, 290 krawędzi, 11 kropek i 4 trójkąty', () => {
  assert.equal(WEZLY.length, 138);
  assert.equal(KRAWEDZIE.length, 290);
  assert.equal(KROPKI.length, 11);
  assert.equal(TROJKATY.length, 4);
});

// =============================================================================
//  KSZTALT KROTEK
// =============================================================================

test('każda krotka w WEZLY i KRAWEDZIE ma dokładnie trzy elementy', () => {
  // Czwarty element albo dwa oznaczają, że skrypt wycinający dostał prototyp
  // o innym układzie pól — a wtedy x, y i flaga nie są już tam, gdzie były.
  for (const w of WEZLY) assert.equal(w.length, 3);
  for (const k of KRAWEDZIE) assert.equal(k.length, 3);
});

test('FLAGI MAGENTA SĄ BINARNE — zbiór wartości to dokładnie {0, 1}', () => {
  const wezlow = [...new Set(WEZLY.map((w) => w[2]))].sort();
  const krawedzi = [...new Set(KRAWEDZIE.map((k) => k[2]))].sort();
  assert.deepEqual(wezlow, [0, 1]);
  assert.deepEqual(krawedzi, [0, 1]);
});

// =============================================================================
//  WSPOLRZEDNE
// =============================================================================

test('współrzędne węzłów są skończonymi liczbami', () => {
  for (const [x, y] of WEZLY) {
    assert.ok(Number.isFinite(x), `x nie jest liczbą skończoną: ${x}`);
    assert.ok(Number.isFinite(y), `y nie jest liczbą skończoną: ${y}`);
  }
});

test('SIATKA MIEŚCI SIĘ W LEWEJ POŁOWIE GŁOWY: x w [122.2, 316.4], y w [100.1, 579.1]', () => {
  // viewBox to "0 0 624 649", a prawa połowa jest obrazem hełmu. Gdyby x doszło
  // w okolice 624, znaczyłoby to, że wycięto obie połowy albo inny prototyp.
  const xs = WEZLY.map((w) => w[0]);
  const ys = WEZLY.map((w) => w[1]);

  assert.equal(Math.min(...xs), 122.2);
  assert.equal(Math.max(...xs), 316.4);
  assert.equal(Math.min(...ys), 100.1);
  assert.equal(Math.max(...ys), 579.1);
});

// =============================================================================
//  INDEKSY KRAWEDZI
// =============================================================================

test('indeksy krawędzi są całkowite i mieszczą się w [0, 137]', () => {
  for (const [a, b] of KRAWEDZIE) {
    assert.ok(Number.isInteger(a), `a nie jest całkowite: ${a}`);
    assert.ok(Number.isInteger(b), `b nie jest całkowite: ${b}`);
    assert.ok(a >= 0 && a < WEZLY.length, `a poza zakresem: ${a}`);
    assert.ok(b >= 0 && b < WEZLY.length, `b poza zakresem: ${b}`);
  }
});

test('żadna krawędź nie jest pętlą (a !== b)', () => {
  const petle = KRAWEDZIE.filter(([a, b]) => a === b);
  assert.deepEqual(petle, []);
});

test('ŻADNEJ PARY NIE MA DWA RAZY, licząc bez względu na kolejność', () => {
  // Duplikat rysuje się dwa razy jedna na drugiej: kreska jest jaśniejsza od
  // sąsiadek, a przy animacji zapala się podwójnie.
  const pary = new Set(
    KRAWEDZIE.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`),
  );
  assert.equal(pary.size, KRAWEDZIE.length);
});

test('kolejność w parze jest kanoniczna: a < b w KAŻDEJ krawędzi', () => {
  // Bez tego test na duplikaty łapałby tylko część przypadków, a diff po
  // regeneracji pokazywałby przestawione pary jako zmiany.
  const odwrocone = KRAWEDZIE.filter(([a, b]) => a >= b);
  assert.deepEqual(odwrocone, []);
});

// =============================================================================
//  SZWY
// =============================================================================

test('SZEW_X to 306, a węzłów stykających się z hełmem jest dokładnie 15', () => {
  // Na szwach zapalają się okręgi spawów — liczba jest wprost widoczna
  // w animacji etapu B.
  assert.equal(SZEW_X, 306);
  assert.equal(WEZLY.filter(([x]) => x >= SZEW_X).length, 15);
});

// =============================================================================
//  ROZPROSZENIE
// =============================================================================

test('każda kropka ma dodatni promień i flagę typu boolean', () => {
  for (const d of KROPKI) {
    assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y));
    assert.ok(d.r > 0, `promień nie jest dodatni: ${d.r}`);
    assert.equal(typeof d.m, "boolean");
  }
});

test('każdy trójkąt ma co najmniej trzy punkty, a każdy punkt to para liczb', () => {
  // Faktyczne długości to dziś 6, 4, 6 i 5 — te "trójkąty" są wielokątami
  // i liczba wierzchołków NIE JEST niezmiennikiem, więc nie stoi tu na sztywno.
  // Niezmiennikiem jest to, że da się z nich zbudować <polygon>.
  for (const t of TROJKATY) {
    assert.ok(t.pts.length >= 3, `za mało punktów: ${t.pts.length}`);
    assert.equal(typeof t.m, "boolean");
    for (const p of t.pts) {
      assert.equal(p.length, 2);
      assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
    }
  }
});
