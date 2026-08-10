import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUDOWA_MS,
  ODCINEK_MS,
  PRZELOT_MS,
  ROZBLYSK_MS,
  START_MS,
  ZANIK_MS,
  ZANIK_TRWA_MS,
  postepPunktu,
  rozblysk,
  zanik,
} from "./harmonogramZnaku.js";
import { CALOSC_MS, OGON_MS } from "./harmonogram.js";

// =============================================================================
//  STALE — wyprowadzone z czasow glowy, nie wpisane
// =============================================================================

test('czasy napisu wychodzą z czasów sceny: 700 / 3820 / 2400 / 520 / 2860 / 3060 / 420', () => {
  assert.equal(START_MS, 700);
  assert.equal(BUDOWA_MS, 3820);
  assert.equal(PRZELOT_MS, 2400);
  assert.equal(ODCINEK_MS, 520);
  assert.equal(ROZBLYSK_MS, 2860);
  assert.equal(ZANIK_MS, 3060);
  assert.equal(ZANIK_TRWA_MS, 420);
});

test('BUDOWA to NIE jest koniec sceny — różni się o ogon', () => {
  // Napis kończy się razem z domknięciem siatki, a scena trwa jeszcze OGON_MS.
  // Pomylenie tych dwóch liczb przesunęłoby zamianę obrysu na tekst o 400 ms.
  assert.equal(BUDOWA_MS, CALOSC_MS - OGON_MS);
  assert.notEqual(BUDOWA_MS, CALOSC_MS);
});

test('rozbłysk i zanik są liczone WZGLĘDEM startu napisu, nie sceny', () => {
  assert.equal(ROZBLYSK_MS + START_MS, BUDOWA_MS - 260);
  assert.equal(ZANIK_MS + START_MS, BUDOWA_MS - 60);
});

// =============================================================================
//  POSTEP PUNKTU
// =============================================================================

test('przed swoim czasem punkt zwraca null, a NIE zero', () => {
  // Prototyp rysuje przez `if(!at(A) || !at(B)) return`, więc null znaczy
  // „nie rysuj", a zero znaczyłoby „narysuj przezroczyste". To nie to samo.
  assert.equal(postepPunktu(0, 0.5), null);
  assert.equal(postepPunktu(1199, 0.5), null, "tuż przed startem punktu");
  assert.notEqual(postepPunktu(1201, 0.5), null);
});

test('PUNKT SKRAJNIE LEWY (k = 0) rusza pierwszy, skrajnie prawy (k = 1) ostatni', () => {
  const t = 100;
  assert.ok(postepPunktu(t, 0) > 0, "lewy już wchodzi");
  assert.equal(postepPunktu(t, 1), null, "prawy jeszcze nie");

  // Prawy startuje dopiero po całym przelocie.
  assert.equal(postepPunktu(PRZELOT_MS, 1), null);
  assert.ok(postepPunktu(PRZELOT_MS + 1, 1) > 0);
});

test('postęp punktu jest obcięty do jedynki i tam zostaje', () => {
  assert.equal(postepPunktu(ODCINEK_MS, 0), 1);
  assert.equal(postepPunktu(99999, 0), 1);
  assert.equal(postepPunktu(ODCINEK_MS / 2, 0), 0.5);
});

// =============================================================================
//  ZANIK
// =============================================================================

test('zanik: 0 do początku zamiany, 1 po jej końcu', () => {
  assert.equal(zanik(0), 0);
  assert.equal(zanik(ZANIK_MS), 0);
  assert.equal(zanik(ZANIK_MS + ZANIK_TRWA_MS / 2), 0.5);
  assert.equal(zanik(ZANIK_MS + ZANIK_TRWA_MS), 1);
  assert.equal(zanik(99999), 1, "obcięcie z góry");
});

// =============================================================================
//  ROZBLYSK
// =============================================================================

test('rozbłysk zeruje się POZA swoim oknem', () => {
  assert.equal(rozblysk(0), 0);
  assert.equal(rozblysk(ROZBLYSK_MS), 0, "na progu jeszcze zero");
  assert.equal(rozblysk(ZANIK_MS + 50), 0, "domknięty od góry");
  assert.equal(rozblysk(99999), 0);
});

test('ROZBŁYSK MA MAKSIMUM MIĘDZY ROZBLYSK_MS A ZANIK_MS', () => {
  // Iloczyn dwóch ramp: narastającej od ROZBLYSK_MS i opadającej do
  // ZANIK_MS + 50. Szczyt wypada w połowie między nimi.
  let najlepszyT = -1;
  let najlepsza = -1;
  for (let t = 2700; t <= 3200; t += 1) {
    const v = rozblysk(t);
    if (v > najlepsza) {
      najlepsza = v;
      najlepszyT = t;
    }
  }
  assert.ok(najlepsza > 0, "rozbłysk w ogóle się zapala");
  assert.ok(
    najlepszyT > ROZBLYSK_MS && najlepszyT < ZANIK_MS,
    `szczyt w ${najlepszyT}, poza oknem ${ROZBLYSK_MS}..${ZANIK_MS}`,
  );
  assert.ok(najlepsza > rozblysk(ROZBLYSK_MS + 1));
  assert.ok(najlepsza > rozblysk(ZANIK_MS));
});

test('rozbłysk nigdy nie wychodzi poza [0,1]', () => {
  for (let t = -500; t <= 5000; t += 7) {
    const v = rozblysk(t);
    assert.ok(v >= 0 && v <= 1, `rozbłysk(${t}) = ${v}`);
  }
});
