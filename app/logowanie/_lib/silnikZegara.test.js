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

// Zbiera (t, now, czasTrwania) z kazdego wywolania.
function zbieracz() {
  const klatki = [];
  const fn = (t, now, czasTrwania) => klatki.push({ t, now, czasTrwania });
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
  const { p, silnik } = silnikZAtrapa({ pominPrzebieg: () => true });

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
//  TRZECI ARGUMENT KLATKI: czasTrwania
// =============================================================================

test('SUBSKRYBENT DOSTAJE czasTrwania JAKO TRZECI ARGUMENT klatki z pętli', () => {
  // Bez tego subskrybent musiałby wziąć długość sceny z importu i rozjechałby
  // się po cichu, gdy provider dostanie inną. Głowa domyka nią spawy na końcu
  // przebiegu, więc rozjazd to okręgi zostające na ekranie bez błędu.
  const { p, silnik } = silnikZAtrapa();
  const z = zbieracz();

  silnik.subskrybuj(z);
  silnik.start();
  p.klatka();
  p.klatka();

  assert.equal(z.klatki.length, 2);
  assert.deepEqual(z.klatki.map((k) => k.czasTrwania), [TRWANIE, TRWANIE]);
});

test('KLATKA JEDNORAZOWA dla spóźnionego subskrybenta też niesie czasTrwania', () => {
  const { p, silnik } = silnikZAtrapa();
  const pierwszy = zbieracz();

  silnik.subskrybuj(pierwszy);
  silnik.start();
  p.doKonca();

  const spozniony = zbieracz();
  silnik.subskrybuj(spozniony);

  assert.equal(spozniony.klatki.length, 1);
  assert.equal(spozniony.klatki[0].czasTrwania, TRWANIE);
  assert.equal(spozniony.klatki[0].t, TRWANIE);
});

test('klatka jednorazowa przy ruchu ograniczonym również niesie czasTrwania', () => {
  const { silnik } = silnikZAtrapa({ pominPrzebieg: () => true });
  const z = zbieracz();

  silnik.subskrybuj(z);
  silnik.start();

  assert.equal(z.klatki[0].czasTrwania, TRWANIE);
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
//  poZakonczeniu — DOKLADNIE RAZ NA PRZEBIEG
// =============================================================================

function silnikZLicznikiem(dodatki = {}) {
  const zakonczenia = [];
  const { p, silnik } = silnikZAtrapa({
    poZakonczeniu: () => zakonczenia.push(true),
    ...dodatki,
  });
  return { p, silnik, zakonczenia };
}

test('poZakonczeniu WOŁA SIĘ RAZ, gdy t dojdzie do czasTrwania', () => {
  const { p, silnik, zakonczenia } = silnikZLicznikiem();
  silnik.subskrybuj(zbieracz());
  silnik.start();

  assert.equal(zakonczenia.length, 0, "nie na starcie");
  p.klatka();
  assert.equal(zakonczenia.length, 0, "nie w trakcie");

  p.doKonca();
  assert.equal(zakonczenia.length, 1);
});

test('poZakonczeniu idzie PO ostatniej klatce, nie przed nią', () => {
  // Konsument stawia tam znacznik sesji, więc scena musi być już domalowana
  // do końca, kiedy to się dzieje.
  const kolejnosc = [];
  const p = atrapaPlanisty();
  const silnik = utworzSilnik({
    czasTrwania: TRWANIE,
    zaplanujKlatke: p.zaplanujKlatke,
    anulujKlatke: p.anulujKlatke,
    teraz: p.teraz,
    poZakonczeniu: () => kolejnosc.push("koniec"),
  });

  silnik.subskrybuj((t) => kolejnosc.push(`klatka ${t}`));
  silnik.start();
  p.doKonca();

  assert.equal(kolejnosc.at(-1), "koniec");
  assert.equal(kolejnosc.at(-2), `klatka ${TRWANIE}`);
});

test('poZakonczeniu NIE WOŁA SIĘ PONOWNIE przy klatkach podtrzymania', () => {
  const { p, silnik, zakonczenia } = silnikZLicznikiem();
  silnik.subskrybuj(zbieracz());
  silnik.start();
  p.doKonca();
  assert.equal(zakonczenia.length, 1);

  silnik.podtrzymaj();
  p.klatka();
  p.klatka();
  p.klatka();

  assert.equal(zakonczenia.length, 1, "podtrzymanie to nie kolejny przebieg");
});

test('poZakonczeniu NIE WOŁA SIĘ przy przebiegu POMINIĘTYM', () => {
  // Pominięty to nie zakończony. Inaczej znacznik sesji stawiałby się w kółko
  // przy każdym wejściu, które i tak nic nie zagrało.
  const { p, silnik, zakonczenia } = silnikZLicznikiem({ pominPrzebieg: () => true });
  silnik.subskrybuj(zbieracz());
  silnik.start();

  assert.equal(zakonczenia.length, 0);
  assert.equal(p.ileZaplanowanych(), 0);

  silnik.podtrzymaj();
  p.klatka();
  p.klatka();
  assert.equal(zakonczenia.length, 0, "także przy podtrzymaniu");
});

test('poZakonczeniu NIE WOŁA SIĘ, gdy silnik zatrzymano w POŁOWIE', () => {
  const { p, silnik, zakonczenia } = silnikZLicznikiem();
  silnik.subskrybuj(zbieracz());
  silnik.start();
  p.klatka();
  p.klatka();
  silnik.stop();

  assert.equal(zakonczenia.length, 0);
  assert.equal(p.klatka(), false);
});

test('DWA MONTOWANIA W TYM SAMYM DOKUMENCIE dają JEDEN przebieg', () => {
  // Odwzorowanie tego, co składa provider: predykat czyta znacznik żyjący
  // tyle, co dokument, a poZakonczeniu go stawia. Znacznik jest stawiany PO
  // przebiegu, nie przy montowaniu — inaczej pierwsze montowanie Strict Mode
  // zapisałoby go, drugie odczytało i animacja nie zagrałaby ani razu.
  let zagrane = false;
  const { p, silnik } = silnikZAtrapa({
    pominPrzebieg: () => zagrane,
    poZakonczeniu: () => {
      zagrane = true;
    },
  });
  const z = zbieracz();
  silnik.subskrybuj(z);

  // Pierwsze montowanie: pełny przebieg.
  silnik.start();
  assert.ok(p.ileZaplanowanych() > 0, "pierwsze wejście gra");
  const klatek = p.doKonca();
  assert.ok(klatek > 1);
  assert.equal(zagrane, true);

  // Drugie montowanie w tym samym dokumencie: od razu klatka końcowa.
  const przed = z.klatki.length;
  silnik.start();
  assert.equal(p.ileZaplanowanych(), 0, "drugie wejście nie planuje ani klatki");
  assert.equal(z.klatki.length - przed, 1, "dostaje jedną klatkę, końcową");
  assert.equal(z.klatki.at(-1).t, TRWANIE);
});

test('STRICT MODE: dwa start() PRZED zakończeniem nie gaszą animacji', () => {
  // Podwójne montowanie dzieje się ZANIM przebieg się skończy, więc znacznik
  // jeszcze nie stoi i drugi start gra normalnie. Gdyby znacznik stawiał się
  // przy montowaniu, drugi start zastałby go już postawionego.
  let zagrane = false;
  const { p, silnik } = silnikZAtrapa({
    pominPrzebieg: () => zagrane,
    poZakonczeniu: () => {
      zagrane = true;
    },
  });
  silnik.subskrybuj(zbieracz());

  silnik.start();
  p.klatka();
  silnik.stop();      // cleanup pierwszego montowania
  silnik.start();     // drugie montowanie

  assert.equal(zagrane, false, "znacznik jeszcze nie stoi");
  assert.ok(p.ileZaplanowanych() > 0, "animacja gra mimo podwójnego montowania");
  p.doKonca();
  assert.equal(zagrane, true);
});

test('DWA PRZEBIEGI to DWA zgłoszenia, po jednym na każdy', () => {
  const { p, silnik, zakonczenia } = silnikZLicznikiem();
  silnik.subskrybuj(zbieracz());

  silnik.start();
  p.doKonca();
  assert.equal(zakonczenia.length, 1);

  silnik.start();
  p.doKonca();
  assert.equal(zakonczenia.length, 2);
});

test('błąd w poZakonczeniu nie wywraca pętli ani nie wychodzi na zewnątrz', () => {
  const oryginalny = console.error;
  console.error = () => {};
  try {
    const p = atrapaPlanisty();
    const silnik = utworzSilnik({
      czasTrwania: TRWANIE,
      zaplanujKlatke: p.zaplanujKlatke,
      anulujKlatke: p.anulujKlatke,
      teraz: p.teraz,
      poZakonczeniu: () => {
        throw new Error("konsument poZakonczeniu padl");
      },
    });
    const z = zbieracz();
    silnik.subskrybuj(z);
    silnik.start();

    assert.doesNotThrow(() => p.doKonca());
    assert.equal(z.klatki.at(-1).t, TRWANIE);
  } finally {
    console.error = oryginalny;
  }
});

// =============================================================================
//  PODTRZYMANIE PETLI PO ZAKONCZENIU SCENY
// =============================================================================

test('PODTRZYMANIE TRZYMA PĘTLĘ PRZY ŻYCIU po zakończeniu sceny', () => {
  // Oko zapala się w chwili kliknięcia, czyli zwykle długo po animacji.
  const { p, silnik } = silnikZAtrapa();
  const z = zbieracz();

  silnik.subskrybuj(z);
  silnik.start();
  p.doKonca();
  assert.equal(p.ileZaplanowanych(), 0, "bez podtrzymania pętla stoi");

  silnik.podtrzymaj();
  assert.equal(p.ileZaplanowanych(), 1);

  p.klatka();
  p.klatka();
  assert.equal(p.ileZaplanowanych(), 1, "i planuje się dalej");
});

test('klatki podtrzymania NIE RUSZAJĄ SCENY: t stoi na końcu, now idzie dalej', () => {
  const { p, silnik } = silnikZAtrapa();
  const z = zbieracz();

  silnik.subskrybuj(z);
  silnik.start();
  p.doKonca();
  const ileDoKonca = z.klatki.length;

  silnik.podtrzymaj();
  p.klatka();
  p.klatka();
  p.klatka();

  const podtrzymane = z.klatki.slice(ileDoKonca);
  assert.equal(podtrzymane.length, 3);
  assert.deepEqual(podtrzymane.map((k) => k.t), [TRWANIE, TRWANIE, TRWANIE]);

  const czasy = podtrzymane.map((k) => k.now);
  assert.ok(czasy[1] > czasy[0] && czasy[2] > czasy[1], "now idzie do przodu");
});

test('ZWOLNIENIE UCHWYTU zatrzymuje pętlę po jednej klatce', () => {
  const { p, silnik } = silnikZAtrapa();
  const z = zbieracz();

  silnik.subskrybuj(z);
  silnik.start();
  p.doKonca();

  const zwolnij = silnik.podtrzymaj();
  p.klatka();
  zwolnij();

  // Zaplanowana klatka jeszcze wypada — na niej rysuje się stan po wygaszeniu.
  assert.equal(p.ileZaplanowanych(), 1);
  p.klatka();
  assert.equal(p.ileZaplanowanych(), 0, "i dopiero ona nie planuje następnej");
});

test('DWA UCHWYTY nie gaszą się nawzajem', () => {
  const { p, silnik } = silnikZAtrapa();
  silnik.subskrybuj(zbieracz());
  silnik.start();
  p.doKonca();

  const a = silnik.podtrzymaj();
  const b = silnik.podtrzymaj();
  a();
  p.klatka();
  assert.equal(p.ileZaplanowanych(), 1, "drugi uchwyt nadal trzyma");

  b();
  p.klatka();
  assert.equal(p.ileZaplanowanych(), 0);
});

test('zwolnienie tego samego uchwytu DWA RAZY nic nie psuje', () => {
  const { p, silnik } = silnikZAtrapa();
  silnik.subskrybuj(zbieracz());
  silnik.start();
  p.doKonca();

  const zwolnij = silnik.podtrzymaj();
  silnik.podtrzymaj();
  zwolnij();
  zwolnij();
  zwolnij();

  p.klatka();
  assert.equal(p.ileZaplanowanych(), 1, "drugi uchwyt przeżył potrójne zwolnienie pierwszego");
});

test('podtrzymanie BEZ SUBSKRYBENTÓW nie budzi pętli', () => {
  const { p, silnik } = silnikZAtrapa();
  silnik.start();
  silnik.podtrzymaj();
  assert.equal(p.ileZaplanowanych(), 0);
});

test('podtrzymanie w TRAKCIE sceny nie dokłada drugiej pętli', () => {
  const { p, silnik } = silnikZAtrapa();
  silnik.subskrybuj(zbieracz());
  silnik.start();
  p.klatka();
  assert.equal(p.ileZaplanowanych(), 1);

  silnik.podtrzymaj();
  assert.equal(p.ileZaplanowanych(), 1, "nadal jedna zaplanowana klatka");
});

test('stop() gasi pętlę także wtedy, gdy trzyma ją podtrzymanie', () => {
  const { p, silnik } = silnikZAtrapa();
  silnik.subskrybuj(zbieracz());
  silnik.start();
  p.doKonca();
  silnik.podtrzymaj();
  assert.equal(p.ileZaplanowanych(), 1);

  silnik.stop();
  assert.equal(p.ileZaplanowanych(), 0, "odmontowanie wygrywa z podtrzymaniem");
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
