import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALOSC_MS,
  KIERUNKI,
  KRAWEDZ_MS,
  OGON_MS,
  ROZPROSZENIE_MS,
  ROZSYP_MS,
  SPAW_MS,
  WEZEL_MS,
  zbudujHarmonogram,
} from "./harmonogram.js";
import { KRAWEDZIE, SZEW_X, WEZLY } from "./siatka.js";

// Atrapy generatora. staly() to najprostszy przypadek, ciag() sprawdza
// KOLEJNOSC wywolan — kazde kolejne siegniecie po rand bierze nastepna
// wartosc z listy, wiec da sie pokazac, ktora liczba trafila gdzie.
const staly = (v) => () => v;
const ciag = (wartosci) => {
  let i = 0;
  return () => wartosci[i++ % wartosci.length];
};

// Dwa wezly na jednej wysokosci i jedna krawedz miedzy nimi. Tyle wystarczy,
// zeby zobaczyc kolejnosc wywolan; siatka z repozytorium byla by tu tylko
// halasem.
const DWA_WEZLY = [
  [100, 0, 0],
  [200, 0, 0],
];
const JEDNA_KRAWEDZ = [[0, 1, 0]];

// =============================================================================
//  STALE
// =============================================================================

test('CALOSC_MS jest LICZONE, nie wpisane — i wychodzi 4220', () => {
  assert.equal(CALOSC_MS, 4220);
  assert.equal(
    CALOSC_MS,
    ROZPROSZENIE_MS + ROZSYP_MS + WEZEL_MS + KRAWEDZ_MS + OGON_MS,
  );
});

test('SPAW_MS celowo NIE wchodzi do CALOSC_MS', () => {
  // Prototyp nie liczy go w DUR. Gdyby ktoś dopisał go do sumy, ten test
  // padnie razem z poprzednim i zmusi do zajrzenia do docs/prototyplogowania.html.
  assert.equal(SPAW_MS, 620);
  assert.notEqual(CALOSC_MS, 4220 + SPAW_MS);
});

// =============================================================================
//  DETERMINACJA: ten sam rand, ten sam wynik
// =============================================================================

test('rand = () => 0 daje pełną determinację: jitter 0, ox -38, oy -23', () => {
  const h = zbudujHarmonogram(WEZLY, KRAWEDZIE, { rand: staly(0) });

  for (const w of h.wezly) {
    assert.equal(w.ox, -38);
    assert.equal(w.oy, -23);
  }
  // Jitter zerowy: najwcześniejszy węzeł rusza dokładnie w ROZPROSZENIE_MS,
  // bez ani jednej milisekundy naddatku.
  assert.equal(Math.min(...h.wezly.map((w) => w.t0)), ROZPROSZENIE_MS);
});

test('rand = () => 0.5: jitter 70, ox -73, oy 0', () => {
  const h = zbudujHarmonogram(WEZLY, KRAWEDZIE, { rand: staly(0.5) });

  for (const w of h.wezly) {
    assert.equal(w.ox, -73);
    assert.equal(w.oy, 0);
  }
  assert.equal(Math.min(...h.wezly.map((w) => w.t0)), ROZPROSZENIE_MS + 70);
});

test('dwa wywołania z tym samym rand dają równe wyniki', () => {
  const wartosci = [0.13, 0.77, 0.41, 0.02, 0.95];
  const a = zbudujHarmonogram(WEZLY, KRAWEDZIE, { rand: ciag(wartosci) });
  const b = zbudujHarmonogram(WEZLY, KRAWEDZIE, { rand: ciag(wartosci) });
  assert.deepEqual(a, b);
});

// =============================================================================
//  KOLEJNOSC WYWOLAN rand — kontrakt, nie szczegol implementacji
// =============================================================================

test('NA WĘZEŁ TRZY WYWOŁANIA rand, w kolejności: jitter, ox, oy', () => {
  const s = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  const h = zbudujHarmonogram(DWA_WEZLY, JEDNA_KRAWEDZ, { rand: ciag(s) });

  // Węzeł 0 ma x = 100, czyli w "rtl" k = 1; węzeł 1 ma k = 0.
  assert.equal(h.wezly[0].t0, ROZPROSZENIE_MS + 1 * ROZSYP_MS + s[0] * 140);
  assert.equal(h.wezly[0].ox, -38 - s[1] * 70);
  assert.equal(h.wezly[0].oy, (s[2] - 0.5) * 46);

  assert.equal(h.wezly[1].t0, ROZPROSZENIE_MS + 0 * ROZSYP_MS + s[3] * 140);
  assert.equal(h.wezly[1].ox, -38 - s[4] * 70);
  assert.equal(h.wezly[1].oy, (s[5] - 0.5) * 46);
});

test('kierunek losowy dokłada CZWARTE wywołanie, na k, PRZED jitterem', () => {
  const s = [0.25, 0.5, 0.75, 0.9];
  const h = zbudujHarmonogram(DWA_WEZLY, JEDNA_KRAWEDZ, {
    kierunek: "rand",
    rand: ciag(s),
  });

  assert.equal(h.wezly[0].t0, ROZPROSZENIE_MS + s[0] * ROZSYP_MS + s[1] * 140);
  assert.equal(h.wezly[0].ox, -38 - s[2] * 70);
  assert.equal(h.wezly[0].oy, (s[3] - 0.5) * 46);
});

test('NIEZNANY kierunek RZUCA, zamiast po cichu losować', () => {
  // Odstępstwo od prototypu, świadome. Tam dir szedł z <select> o trzech
  // wartościach (linie 296-300), więc literówka nie miała skąd wejść i warunek
  // z linii 344 mógł traktować wszystko poza ltr/rtl jako losowanie. Tutaj
  // kierunek podaje kod, a ciche losowanie dałoby animację wyglądającą PRAWIE
  // dobrze — czyli błąd, który się nie zgłasza.
  // `undefined` na tej liście NIE MA — pominięty parametr wpada w domyślne
  // "rtl" i ma tak zostać. Sprawdza to osobny test niżej.
  for (const zly of ["rlt", "RTL", "", null, 0, {}]) {
    assert.throws(
      () => zbudujHarmonogram(DWA_WEZLY, JEDNA_KRAWEDZ, { kierunek: zly }),
      /Nieznany kierunek/,
    );
  }

  // Komunikat ma nieść OBIE informacje: co przyszło i co wolno.
  assert.throws(
    () => zbudujHarmonogram(DWA_WEZLY, JEDNA_KRAWEDZ, { kierunek: "rlt" }),
    (e) =>
      e.message.includes('"rlt"') &&
      KIERUNKI.every((k) => e.message.includes(k)),
  );
});

test('lista dopuszczalnych kierunków to dokładnie trzy wartości z prototypu', () => {
  assert.deepEqual(KIERUNKI, ["ltr", "rtl", "rand"]);
});

test('BRAK kierunku to nie to samo co zły kierunek — działa domyślne "rtl"', () => {
  // Pominięty parametr ma zadziałać jak dotąd, inaczej walidacja zjadłaby
  // wszystkie wywołania produkcyjne.
  const bez = zbudujHarmonogram(DWA_WEZLY, JEDNA_KRAWEDZ, { rand: staly(0.5) });
  const jawne = zbudujHarmonogram(DWA_WEZLY, JEDNA_KRAWEDZ, {
    kierunek: "rtl",
    rand: staly(0.5),
  });
  assert.deepEqual(bez, jawne);
});

// =============================================================================
//  ZAKRESY I KIERUNEK
// =============================================================================

test('każde t0 węzła mieści się w [700, 3240) dla dowolnego rand z [0,1)', () => {
  // Granice: 700 przy k = 0 i jitterze 0, a 3240 to 700 + 2400 + 140, czyli
  // wartość, do której jitter dobija, ale jej nie osiąga.
  const proby = [
    staly(0),
    staly(0.5),
    staly(0.999999),
    ciag([0, 0.1, 0.37, 0.5, 0.73, 0.99, 0.999999]),
  ];

  for (const rand of proby) {
    for (const kierunek of ["rtl", "ltr", "rand"]) {
      const h = zbudujHarmonogram(WEZLY, KRAWEDZIE, { kierunek, rand });
      for (const w of h.wezly) {
        assert.ok(w.t0 >= 700, `t0 ${w.t0} poniżej 700`);
        assert.ok(w.t0 < 3240, `t0 ${w.t0} nie mniejsze od 3240`);
      }
    }
  }
});

test('"rtl": węzeł o największym x rusza jako pierwszy', () => {
  const h = zbudujHarmonogram(WEZLY, KRAWEDZIE, { rand: staly(0.5) });
  const najwiekszyX = WEZLY.reduce(
    (best, w, i) => (w[0] > WEZLY[best][0] ? i : best),
    0,
  );
  assert.equal(h.wezly[najwiekszyX].t0, Math.min(...h.wezly.map((w) => w.t0)));
});

test('"ltr" odwraca tę relację — pierwszy rusza węzeł o najmniejszym x', () => {
  const h = zbudujHarmonogram(WEZLY, KRAWEDZIE, {
    kierunek: "ltr",
    rand: staly(0.5),
  });
  const najmniejszyX = WEZLY.reduce(
    (best, w, i) => (w[0] < WEZLY[best][0] ? i : best),
    0,
  );
  assert.equal(h.wezly[najmniejszyX].t0, Math.min(...h.wezly.map((w) => w.t0)));

  // Kontrola dla pary: przy tym samym rand oba kierunki dają lustrzane skrajne
  // węzły, więc nie może wyjść ten sam indeks.
  const rtl = zbudujHarmonogram(WEZLY, KRAWEDZIE, { rand: staly(0.5) });
  const najwiekszyX = WEZLY.reduce(
    (best, w, i) => (w[0] > WEZLY[best][0] ? i : best),
    0,
  );
  assert.notEqual(najmniejszyX, najwiekszyX);
  assert.ok(rtl.wezly[najmniejszyX].t0 > rtl.wezly[najwiekszyX].t0);
});

// =============================================================================
//  KRAWEDZIE
// =============================================================================

test('każda krawędź rusza nie wcześniej niż 231 ms po późniejszym ze swoich końców', () => {
  // 231 to WEZEL_MS * 0,55 z prototypu (linia 348).
  const h = zbudujHarmonogram(WEZLY, KRAWEDZIE, {
    rand: ciag([0.13, 0.77, 0.41, 0.02, 0.95]),
  });

  KRAWEDZIE.forEach(([a, b], i) => {
    const pozniejszy = Math.max(h.wezly[a].t0, h.wezly[b].t0);
    assert.ok(
      h.krawedzie[i].t0 - pozniejszy >= 231,
      `krawędź ${i}: odstęp ${h.krawedzie[i].t0 - pozniejszy}`,
    );
  });
});

// =============================================================================
//  OSTATNI SZEW
// =============================================================================

test('ostatniSzew liczy się WYŁĄCZNIE z 15 węzłów o x >= 306', () => {
  const h = zbudujHarmonogram(WEZLY, KRAWEDZIE, {
    rand: ciag([0.13, 0.77, 0.41, 0.02, 0.95]),
  });

  const szwy = WEZLY.map(([x], i) => (x >= SZEW_X ? h.wezly[i].t0 : null)).filter(
    (t) => t !== null,
  );
  assert.equal(szwy.length, 15);
  assert.equal(h.ostatniSzew, Math.max(...szwy) + WEZEL_MS);
});

test('BEZ ANI JEDNEGO SZWU ostatniSzew jest null, a reszta harmonogramu bez zmian', () => {
  // Próg SZEW_X jest importowany, nie wstrzykiwany, więc zamiast podnosić próg
  // ponad 316,4 przesuwam dane o tyle samo w drugą stronę. Przesunięcie
  // WSZYSTKICH x o stałą nie rusza k (lo i hi jadą razem z nimi), więc czasy
  // muszą wyjść co do znaku takie same — zmienia się tylko to, że żaden węzeł
  // nie sięga już szwu.
  const wartosci = [0.13, 0.77, 0.41, 0.02, 0.95];
  const przesuniete = WEZLY.map(([x, y, m]) => [x - 20, y, m]);

  const zSzwami = zbudujHarmonogram(WEZLY, KRAWEDZIE, { rand: ciag(wartosci) });
  const bezSzwow = zbudujHarmonogram(przesuniete, KRAWEDZIE, {
    rand: ciag(wartosci),
  });

  assert.ok(przesuniete.every(([x]) => x < SZEW_X));
  assert.equal(typeof zSzwami.ostatniSzew, "number");
  assert.equal(bezSzwow.ostatniSzew, null);
  assert.deepEqual(bezSzwow.wezly, zSzwami.wezly);
  assert.deepEqual(bezSzwow.krawedzie, zSzwami.krawedzie);
});

// =============================================================================
//  BRAK MUTACJI
// =============================================================================

test('WEZLY I KRAWEDZIE PO WYWOŁANIU SĄ NIETKNIĘTE', () => {
  // Prototyp dopisuje t0/ox/oy prosto do węzłów. Gdyby to wróciło, drugie
  // montowanie w Strict Mode dostałoby dane podeptane przez pierwsze.
  const wezlyPrzed = structuredClone(WEZLY);
  const krawedziePrzed = structuredClone(KRAWEDZIE);

  zbudujHarmonogram(WEZLY, KRAWEDZIE, { rand: staly(0.5) });

  assert.deepEqual(WEZLY, wezlyPrzed);
  assert.deepEqual(KRAWEDZIE, krawedziePrzed);
});
