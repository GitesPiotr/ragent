import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAKS_DT_MS,
  krokZegara,
  stanKoncowy,
  stanPoczatkowy,
} from "./zegar.js";

// Dlugosc sceny podawana wprost, zeby test nie zalezal od CALOSC_MS
// z harmonogramu — to dwie osobne umowy i nie mialyby prawa sie zwiazac.
const TRWANIE = 1000;
const opcje = { czasTrwania: TRWANIE };

// =============================================================================
//  PIERWSZA KLATKA
// =============================================================================

test('pierwsze wywołanie ustawia znacznik i NIE przesuwa t', () => {
  const po = krokZegara(stanPoczatkowy(), 12345, opcje);
  assert.equal(po.t, 0);
  assert.equal(po.ostatniZnacznik, 12345);
  assert.equal(po.gra, true);
});

test('znacznik 0 jest znacznikiem, nie brakiem znacznika', () => {
  // Prototyp rozstrzyga to przez falsy (`if(!last)last=now`), więc now === 0
  // wpada u niego w gałąź „pierwsza klatka" po raz drugi. Tutaj warunkiem jest
  // jawne === null, więc kolejny krok po znaczniku 0 liczy dt normalnie.
  const pierwszy = krokZegara(stanPoczatkowy(), 0, opcje);
  assert.equal(pierwszy.ostatniZnacznik, 0);

  const drugi = krokZegara(pierwszy, 16, opcje);
  assert.equal(drugi.t, 16);
});

// =============================================================================
//  OGRANICZENIE dt Z GORY I Z DOLU
// =============================================================================

test('dt jest ograniczone Z GÓRY: skok znacznika o 5000 ms przesuwa t o 60', () => {
  const start = krokZegara(stanPoczatkowy(), 1000, opcje);
  const po = krokZegara(start, 6000, opcje);
  assert.equal(po.t, MAKS_DT_MS);
  assert.equal(po.t, 60);
});

test('dt jest ograniczone Z DOŁU: znacznik cofnięty w tył NIE cofa t', () => {
  // Odstępstwo od prototypu — tam Math.min(60, now - last) bez dolnej granicy
  // przyjęłoby wartość ujemną.
  const start = krokZegara(stanPoczatkowy(), 1000, opcje);
  const doPrzodu = krokZegara(start, 1030, opcje);
  assert.equal(doPrzodu.t, 30);

  const wTyl = krokZegara(doPrzodu, 900, opcje);
  assert.equal(wTyl.t, 30);
  assert.equal(wTyl.ostatniZnacznik, 900);
});

// =============================================================================
//  PAUZA
// =============================================================================

test('PODCZAS PAUZY t stoi, ale znacznik się aktualizuje', () => {
  const wPauzie = { t: 400, ostatniZnacznik: 1000, gra: false };

  const po = krokZegara(wPauzie, 1016, opcje);
  assert.equal(po.t, 400);
  assert.equal(po.gra, false);
  assert.equal(po.ostatniZnacznik, 1016);
});

test('wznowienie po DŁUGIEJ pauzie przesuwa t najwyżej o MAKS_DT_MS', () => {
  // Sedno: gdyby znacznik stał w miejscu przez całą pauzę, wznowienie liczyłoby
  // dt od jej początku. Tutaj każdy krok pauzy przesuwa znacznik, więc po
  // wznowieniu różnica jest różnicą jednej klatki.
  let stan = { t: 400, ostatniZnacznik: 1000, gra: false };

  for (let now = 1016; now <= 9000; now += 16) {
    stan = krokZegara(stan, now, opcje);
  }
  assert.equal(stan.t, 400);

  const wznowiony = krokZegara({ ...stan, gra: true }, stan.ostatniZnacznik + 16, opcje);
  assert.equal(wznowiony.t, 416);
  assert.ok(wznowiony.t - 400 <= MAKS_DT_MS);
});

// =============================================================================
//  ZATRZYMANIE NA KONCU
// =============================================================================

test('t zatrzymuje się DOKŁADNIE na czasTrwania i ustawia gra na false', () => {
  const tuzPrzed = { t: TRWANIE - 10, ostatniZnacznik: 1000, gra: true };

  const po = krokZegara(tuzPrzed, 1050, opcje);
  assert.equal(po.t, TRWANIE);
  assert.equal(po.gra, false);
});

test('po zatrzymaniu kolejne kroki nie zmieniają nic poza znacznikiem', () => {
  let stan = krokZegara({ t: TRWANIE - 10, ostatniZnacznik: 1000, gra: true }, 1050, opcje);
  assert.equal(stan.gra, false);

  for (const now of [1066, 1082, 5000]) {
    stan = krokZegara(stan, now, opcje);
    assert.equal(stan.t, TRWANIE);
    assert.equal(stan.gra, false);
    assert.equal(stan.ostatniZnacznik, now);
  }
});

test('PRZEJŚCIE KROKAMI PO 16 ms KOŃCZY SIĘ DOKŁADNIE NA czasTrwania', () => {
  // 1000 nie dzieli się przez 16, więc ostatni krok przeskoczyłby koniec —
  // i to jest właśnie ten przypadek, w którym twarde zatrzymanie robi robotę.
  let stan = stanPoczatkowy();
  let now = 0;

  for (let i = 0; i < 500 && stan.gra; i += 1) {
    now += 16;
    stan = krokZegara(stan, now, opcje);
  }

  assert.equal(stan.t, TRWANIE);
  assert.equal(stan.gra, false);
  assert.ok(stan.t <= TRWANIE);
});

// =============================================================================
//  CZYSTOSC I STANY GOTOWE
// =============================================================================

test('WEJŚCIOWY OBIEKT STANU JEST PO WYWOŁANIU NIETKNIĘTY', () => {
  const stan = { t: 120, ostatniZnacznik: 1000, gra: true };
  const przed = structuredClone(stan);

  const po = krokZegara(stan, 1016, opcje);

  assert.deepEqual(stan, przed);
  assert.notEqual(po, stan);
  assert.equal(po.t, 136);
});

test('stanKoncowy daje t równe czasTrwania i gra false', () => {
  const stan = stanKoncowy(TRWANIE);
  assert.equal(stan.t, TRWANIE);
  assert.equal(stan.gra, false);
  assert.equal(stan.ostatniZnacznik, null);
});

test('stanPoczatkowy daje zerowy czas, brak znacznika i grającą scenę', () => {
  assert.deepEqual(stanPoczatkowy(), { t: 0, ostatniZnacznik: null, gra: true });
});
