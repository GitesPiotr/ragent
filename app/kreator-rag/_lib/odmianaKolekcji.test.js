import test from "node:test";
import assert from "node:assert/strict";

import { odmianaKolekcji } from "./odmianaKolekcji.js";

test("liczba pojedyncza", () => {
  assert.equal(odmianaKolekcji(1), "kolekcja");
});

test("2, 3, 4 — forma mnoga", () => {
  for (const n of [2, 3, 4]) assert.equal(odmianaKolekcji(n), "kolekcje", `dla ${n}`);
});

test("0 i 5–9 — dopełniacz", () => {
  for (const n of [0, 5, 6, 7, 8, 9]) assert.equal(odmianaKolekcji(n), "kolekcji", `dla ${n}`);
});

test("WYJĄTEK 12–14 zachowuje się jak 5, nie jak 2–4", () => {
  // Najczęstszy błąd w tej funkcji. Bez osobnego warunku „13" dałoby
  // „13 kolekcje", bo końcówka to 3.
  for (const n of [12, 13, 14]) assert.equal(odmianaKolekcji(n), "kolekcji", `dla ${n}`);
});

test("11 też jest dopełniaczem, mimo końcówki 1", () => {
  assert.equal(odmianaKolekcji(11), "kolekcji");
  assert.equal(odmianaKolekcji(21), "kolekcji");
  assert.equal(odmianaKolekcji(101), "kolekcji");
});

test("druga dziesiątka wraca do normalnej reguły", () => {
  for (const n of [22, 23, 24]) assert.equal(odmianaKolekcji(n), "kolekcje", `dla ${n}`);
  for (const n of [25, 26, 30, 31]) assert.equal(odmianaKolekcji(n), "kolekcji", `dla ${n}`);
});

test("pierwsze sto liczb — każda dostaje jedną z trzech form", () => {
  // Strażnik przed regresją: nie sprawdzamy tu poprawności każdej z osobna,
  // tylko że funkcja nie zwraca nigdy undefined ani czegoś spoza zbioru.
  const dopuszczalne = new Set(["kolekcja", "kolekcje", "kolekcji"]);
  for (let n = 0; n <= 100; n++) {
    assert.ok(dopuszczalne.has(odmianaKolekcji(n)), `dla ${n} zwrócono ${odmianaKolekcji(n)}`);
  }
});

test("setki i tysiące odmieniają się jak ich dwie ostatnie cyfry", () => {
  assert.equal(odmianaKolekcji(102), "kolekcje");
  assert.equal(odmianaKolekcji(112), "kolekcji");
  assert.equal(odmianaKolekcji(1002), "kolekcje");
  assert.equal(odmianaKolekcji(1013), "kolekcji");
});
