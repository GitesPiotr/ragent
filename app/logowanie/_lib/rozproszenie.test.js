import { test } from "node:test";
import assert from "node:assert/strict";
import { zbudujRozproszenie } from "./rozproszenie.js";
import { KROPKI, TROJKATY } from "./siatka.js";

const staly = (v) => () => v;
const ciag = (wartosci) => {
  let i = 0;
  return () => wartosci[i++ % wartosci.length];
};

test('rozproszenie ma 15 elementów: 11 kropek, potem 4 wielokąty', () => {
  const r = zbudujRozproszenie(KROPKI, TROJKATY, { rand: staly(0.5) });
  assert.equal(r.length, 15);
  assert.equal(r.length, KROPKI.length + TROJKATY.length);
});

test('KOLEJNOŚĆ: najpierw wszystkie kropki, dopiero potem wielokąty', () => {
  // Kolejność jest kontraktem, bo komponent indeksuje po niej dzieci grupy SVG:
  // JSX renderuje 11 <circle>, potem 4 <polygon>. Przestawienie tutaj rozjechałoby
  // fazę oscylacji z elementem i nikt by tego nie zgłosił.
  const r = zbudujRozproszenie(KROPKI, TROJKATY, { rand: staly(0.5) });

  KROPKI.forEach((d, i) => {
    assert.equal(r[i].x, d.x);
    assert.equal(r[i].y, d.y);
  });
  assert.equal(r.length - TROJKATY.length, KROPKI.length);
});

test('rot jest prawdziwe WYŁĄCZNIE dla wielokątów', () => {
  const r = zbudujRozproszenie(KROPKI, TROJKATY, { rand: staly(0.5) });
  const zRot = r.filter((e) => e.rot);
  assert.equal(zRot.length, TROJKATY.length);
  assert.deepEqual(r.slice(0, KROPKI.length).map((e) => e.rot), Array(11).fill(false));
});

test('wielokąt oscyluje wokół ŚRODKA CIĘŻKOŚCI swoich punktów', () => {
  // Pierwszy wielokąt ma sześć punktów; liczę średnią ręcznie, żeby test nie
  // powtarzał wzoru z kodu.
  const pierwszy = TROJKATY[0].pts;
  assert.equal(pierwszy.length, 6);

  const sx = (145 + 134 + 131.5 + 144 + 146.5 + 147.5) / 6;
  const sy = (287.5 + 286.5 + 284 + 270.5 + 272 + 285) / 6;

  const r = zbudujRozproszenie(KROPKI, TROJKATY, { rand: staly(0.5) });
  const wielokat = r[KROPKI.length];

  assert.ok(Math.abs(wielokat.x - sx) < 1e-9, `${wielokat.x} vs ${sx}`);
  assert.ok(Math.abs(wielokat.y - sy) < 1e-9, `${wielokat.y} vs ${sy}`);
});

test('NA ELEMENT DWA WYWOŁANIA rand, w kolejności: ph, potem am', () => {
  const s = [0.1, 0.2, 0.3, 0.4];
  const r = zbudujRozproszenie(KROPKI.slice(0, 2), [], { rand: ciag(s) });

  assert.equal(r[0].ph, s[0] * 6.28);
  assert.equal(r[0].am, 0.6 + s[1] * 0.9);
  assert.equal(r[1].ph, s[2] * 6.28);
  assert.equal(r[1].am, 0.6 + s[3] * 0.9);
});

test('WIELOKĄT MA INNY WZÓR NA am NIŻ KROPKA i to nie jest przeoczenie', () => {
  const r = zbudujRozproszenie(KROPKI.slice(0, 1), TROJKATY.slice(0, 1), {
    rand: staly(1),
  });
  assert.equal(r[0].am, 0.6 + 0.9);
  assert.equal(r[1].am, 0.5 + 0.8);
});

test('DETERMINACJA: ten sam rand daje ten sam wynik', () => {
  const wartosci = [0.13, 0.77, 0.41, 0.02, 0.95];
  const a = zbudujRozproszenie(KROPKI, TROJKATY, { rand: ciag(wartosci) });
  const b = zbudujRozproszenie(KROPKI, TROJKATY, { rand: ciag(wartosci) });
  assert.deepEqual(a, b);
});

test('ph i am mieszczą się w swoich przedziałach dla dowolnego rand z [0,1)', () => {
  for (const rand of [staly(0), staly(0.999999), ciag([0, 0.37, 0.5, 0.99])]) {
    for (const e of zbudujRozproszenie(KROPKI, TROJKATY, { rand })) {
      assert.ok(e.ph >= 0 && e.ph < 6.28);
      assert.ok(e.am > 0);
      assert.ok(e.rot ? e.am < 1.3 : e.am < 1.5);
    }
  }
});

test('KROPKI I TROJKATY PO WYWOŁANIU SĄ NIETKNIĘTE', () => {
  const kropkiPrzed = structuredClone(KROPKI);
  const trojkatyPrzed = structuredClone(TROJKATY);

  zbudujRozproszenie(KROPKI, TROJKATY, { rand: staly(0.5) });

  assert.deepEqual(KROPKI, kropkiPrzed);
  assert.deepEqual(TROJKATY, trojkatyPrzed);
});
