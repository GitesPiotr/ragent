import { test } from "node:test";
import assert from "node:assert/strict";
import { utworzSilnik } from "./silnikZegara.js";

const TRWANIE = 100;

// ATRAPA PLANISTY. Kolejka zaplanowanych wywolan plus reczny zegar — to samo,
// co robi requestAnimationFrame, tylko krok po kroku i bez przegladarki.
// Identyfikatory zaczynaja sie od 1, bo silnik traktuje 0 jako "brak klatki".
function atrapaPlanisty() {
  const kolejka = new Map();
  let nastepnyId = 1;
  let czas = 0;
  const anulowane = [];

  return {
    zaplanujKlatke(naKlatke) {
      const id = nastepnyId;
      nastepnyId += 1;
      kolejka.set(id, naKlatke);
      return id;
    },
    anulujKlatke(id) {
      anulowane.push(id);
      kolejka.delete(id);
    },
    teraz: () => czas,

    ileZaplanowanych: () => kolejka.size,
    ileAnulowanych: () => anulowane.length,

    // Przejezdza jedna zaplanowana klatke, przesuwajac zegar o dt.
    // Zwraca false, gdy nie bylo czego przejechac.
    klatka(dt = 16) {
      const pierwszy = kolejka.entries().next();
      if (pierwszy.done) return false;
      const [id, naKlatke] = pierwszy.value;
      kolejka.delete(id);
      czas += dt;
      naKlatke(czas);
      return true;
    },

    // Przejezdza tyle klatek, ile silnik zaplanuje, ale nie wiecej niz limit.
    doKonca(dt = 16, limit = 200) {
      let ile = 0;
      while (ile < limit && this.klatka(dt)) ile += 1;
      return ile;
    },
  };
}

function silnikZAtrapa(dodatki = {}) {
  const p = atrapaPlanisty();
  const silnik = utworzSilnik({
    czasTrwania: TRWANIE,
    zaplanujKlatke: p.zaplanujKlatke,
    anulujKlatke: p.anulujKlatke,
    teraz: p.teraz,
    ...dodatki,
  });
  return { p, silnik };
}

// Zbiera (t, now) z kazdego wywolania.
function zbieracz() {
  const klatki = [];
  const fn = (t, now) => klatki.push({ t, now });
  fn.klatki = klatki;
  return fn;
}

// =============================================================================
//  START I BUDZENIE PETLI
// =============================================================================

test('start BEZ subskrybentów nie planuje ani jednej klatki', () => {
  const { p, silnik } = silnikZAtrapa();
  silnik.start();
  assert.equal(p.ileZaplanowanych(), 0);
});

test('SUBSKRYBENT PODPIĘTY PÓŹNIEJ BUDZI PĘTLĘ', () => {
  // To jest przypadek pierścienia montowanego warunkowo w B5: start() przeleciał
  // przy pustym zbiorze, więc warunek „są subskrybenci" był wtedy fałszywy.
  const { p, silnik } = silnikZAtrapa();
  silnik.start();
  assert.equal(p.ileZaplanowanych(), 0);

  const z = zbieracz();
  silnik.subskrybuj(z);
  assert.equal(p.ileZaplanowanych(), 1);

  p.klatka(); // pierwsza klatka ustawia znacznik, t zostaje 0
  p.klatka();
  assert.deepEqual(z.klatki.map((k) => k.t), [0, 16]);
});

test('subskrypcja PRZED startem nie dostaje klatki natychmiast — poda ją start()', () => {
  // Normalne montowanie: efekty dzieci biegną przed efektem rodzica.
  const { p, silnik } = silnikZAtrapa();
  const z = zbieracz();

  silnik.subskrybuj(z);
  assert.equal(z.klatki.length, 0);
  assert.equal(p.ileZaplanowanych(), 0);

  silnik.start();
  assert.equal(p.ileZaplanowanych(), 1);
});

// =============================================================================
//  KLATKA NATYCHMIASTOWA, GDY PETLA NIE MA RUSZYC
// =============================================================================

test('SUBSKRYBENT PODPIĘTY DO SCENY ZAKOŃCZONEJ dostaje jedną klatkę końcową, a pętla NIE rusza', () => {
  const { p, silnik } = silnikZAtrapa();
  const pierwszy = zbieracz();

  silnik.subskrybuj(pierwszy);
  silnik.start();
  p.doKonca();

  assert.equal(pierwszy.klatki.at(-1).t, TRWANIE);
  assert.equal(p.ileZaplanowanych(), 0);

  const spozniony = zbieracz();
  silnik.subskrybuj(spozniony);

  assert.equal(spozniony.klatki.length, 1);
  assert.equal(spozniony.klatki[0].t, TRWANIE);
  assert.equal(p.ileZaplanowanych(), 0);
});

test('PRZY RUCHU OGRANICZONYM subskrybent dostaje jedną klatkę końcową, przed startem i po nim', () => {
  const { p, silnik } = silnikZAtrapa({ ruchOgraniczony: () => true });

  const wczesny = zbieracz();
  silnik.subskrybuj(wczesny);
  silnik.start();

  assert.deepEqual(wczesny.klatki.map((k) => k.t), [TRWANIE]);
  assert.equal(p.ileZaplanowanych(), 0);

  const pozny = zbieracz();
  silnik.subskrybuj(pozny);

  assert.deepEqual(pozny.klatki.map((k) => k.t), [TRWANIE]);
  assert.equal(p.ileZaplanowanych(), 0);
});

// =============================================================================
//  WARUNEK STOPU
// =============================================================================

test('PĘTLA PRZESTAJE SIĘ PLANOWAĆ DOKŁADNIE WTEDY, gdy t dojdzie do czasTrwania', () => {
  const { p, silnik } = silnikZAtrapa();
  const z = zbieracz();

  silnik.subskrybuj(z);
  silnik.start();
  const ile = p.doKonca();

  const czasy = z.klatki.map((k) => k.t);
  assert.equal(czasy.at(-1), TRWANIE);
  assert.equal(czasy.filter((t) => t === TRWANIE).length, 1, "koniec nadany raz");
  assert.ok(czasy.every((t) => t <= TRWANIE));
  assert.equal(p.ileZaplanowanych(), 0);
  assert.ok(ile > 1);
});

test('ODPIĘCIE OSTATNIEGO SUBSKRYBENTA zatrzymuje planowanie', () => {
  const { p, silnik } = silnikZAtrapa();
  const z = zbieracz();

  const odepnij = silnik.subskrybuj(z);
  silnik.start();
  p.klatka();
  assert.equal(p.ileZaplanowanych(), 1);

  odepnij();
  assert.equal(p.ileZaplanowanych(), 0);
  assert.equal(p.klatka(), false, "nie ma juz czego przejechac");
});

test('odpięcie JEDNEGO z dwóch subskrybentów nie rusza pętli', () => {
  const { p, silnik } = silnikZAtrapa();
  const a = zbieracz();
  const b = zbieracz();

  const odepnijA = silnik.subskrybuj(a);
  silnik.subskrybuj(b);
  silnik.start();
  p.klatka();

  odepnijA();
  assert.equal(p.ileZaplanowanych(), 1);

  p.klatka();
  assert.equal(a.klatki.length, 1);
  assert.equal(b.klatki.length, 2);
});

// =============================================================================
//  SPRZATANIE I STRICT MODE
// =============================================================================

test('ZATRZYMANIE W POŁOWIE przebiegu woła anulujKlatke i nie planuje już nic', () => {
  const { p, silnik } = silnikZAtrapa();
  const z = zbieracz();

  silnik.subskrybuj(z);
  silnik.start();
  p.klatka();
  p.klatka();
  assert.ok(z.klatki.at(-1).t < TRWANIE, "jesteśmy w połowie, nie na końcu");

  const anulowanychPrzed = p.ileAnulowanych();
  silnik.stop();

  assert.equal(p.ileAnulowanych(), anulowanychPrzed + 1);
  assert.equal(p.ileZaplanowanych(), 0);
  assert.equal(p.klatka(), false);
});

test('DWA STARTY POD RZĄD DAJĄ JEDNĄ PĘTLĘ, nie dwie — to jest Strict Mode', () => {
  const { p, silnik } = silnikZAtrapa();
  const z = zbieracz();

  silnik.subskrybuj(z);
  silnik.start();
  silnik.start();

  assert.equal(p.ileZaplanowanych(), 1);
  assert.equal(p.ileAnulowanych(), 1, "drugi start anulował klatkę pierwszego");

  // Gdyby chodziły dwie pętle, ten sam czas byłby mutowany dwa razy na klatkę.
  p.klatka();
  p.klatka(16);
  assert.deepEqual(z.klatki.map((k) => k.t), [0, 16]);
});

test('pełny cykl montowanie → odmontowanie → montowanie zostawia jedną pętlę', () => {
  const { p, silnik } = silnikZAtrapa();
  const z = zbieracz();

  const odepnij = silnik.subskrybuj(z);
  silnik.start();
  silnik.stop();
  odepnij();

  const z2 = zbieracz();
  silnik.subskrybuj(z2);
  silnik.start();

  assert.equal(p.ileZaplanowanych(), 1);
});

// =============================================================================
//  BLAD SUBSKRYBENTA
// =============================================================================

test('BŁĄD JEDNEGO SUBSKRYBENTA NIE ZATRZYMUJE PĘTLI ANI POZOSTAŁYCH', () => {
  // Najważniejszy test w tym pliku. W prototypie btn z linii 413 jest używany
  // w frame() poza try/catch, więc jeden błąd zatrzymywał rAF na amen.
  const { p, silnik } = silnikZAtrapa();
  const bledy = [];
  const oryginalny = console.error;
  console.error = (...a) => bledy.push(a);

  try {
    const psuty = () => {
      throw new Error("subskrybent padl");
    };
    const zdrowy = zbieracz();

    silnik.subskrybuj(psuty);
    silnik.subskrybuj(zdrowy);
    silnik.start();

    p.klatka();
    p.klatka();
    p.klatka();

    assert.deepEqual(zdrowy.klatki.map((k) => k.t), [0, 16, 32]);
    assert.equal(p.ileZaplanowanych(), 1, "pętla planuje się dalej");
    assert.equal(bledy.length, 3, "każdy błąd trafił do konsoli");
  } finally {
    console.error = oryginalny;
  }
});

test('błąd subskrybenta podpiętego do sceny zakończonej też nie wychodzi na zewnątrz', () => {
  const { p, silnik } = silnikZAtrapa();
  const oryginalny = console.error;
  console.error = () => {};

  try {
    const z = zbieracz();
    silnik.subskrybuj(z);
    silnik.start();
    p.doKonca();

    assert.doesNotThrow(() =>
      silnik.subskrybuj(() => {
        throw new Error("padl przy klatce koncowej");
      }),
    );
  } finally {
    console.error = oryginalny;
  }
});
