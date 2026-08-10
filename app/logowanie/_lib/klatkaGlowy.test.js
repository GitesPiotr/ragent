import { test } from "node:test";
import assert from "node:assert/strict";
import {
  czyUsunacSpaw,
  nieprzezroczystoscHelmu,
  postep,
  zlagodzenie,
} from "./klatkaGlowy.js";

// =============================================================================
//  ZLAGODZENIE
// =============================================================================

test('złagodzenie trzyma końce: 0 na 0 i 1 na 1', () => {
  assert.equal(zlagodzenie(0), 0);
  assert.equal(zlagodzenie(1), 1);
});

test('złagodzenie WYHAMOWUJE, czyli w połowie jest już wyżej niż w połowie', () => {
  // 1 - (1-0,5)^3 = 0,875. Gdyby ktoś odwrócił wzór na przyspieszanie,
  // wyszłoby 0,125 i animacja szarpałaby na końcu zamiast na początku.
  assert.equal(zlagodzenie(0.5), 0.875);
  assert.ok(zlagodzenie(0.25) > 0.25);
});

// =============================================================================
//  POSTEP
// =============================================================================

test('postęp jest obcięty do [0,1] z obu stron', () => {
  assert.equal(postep(0, 100, 400), 0, "przed startem");
  assert.equal(postep(5000, 100, 400), 1, "długo po końcu");
  assert.equal(postep(300, 100, 400), 0.5, "w połowie");
});

test('postęp na dokładnym progu startu wynosi 0, a na końcu 1', () => {
  assert.equal(postep(100, 100, 400), 0);
  assert.equal(postep(500, 100, 400), 1);
});

// =============================================================================
//  NIEPRZEZROCZYSTOSC HELMU
// =============================================================================

test('przed ostatnim szwem hełm siedzi na 0,22', () => {
  assert.equal(nieprzezroczystoscHelmu(0, 3000), 0.22);
  assert.equal(nieprzezroczystoscHelmu(2999.9, 3000), 0.22);
});

test('NA PROGU ostatniego szwu zaczyna się rozjaśnianie, nie kończy', () => {
  // t === ostatniSzew wpada już w drugą gałąź wzoru i daje dokładnie 0,22 —
  // czyli przejście jest ciągłe, bez skoku.
  assert.equal(nieprzezroczystoscHelmu(3000, 3000), 0.22);
});

test('po ostatnim szwie hełm dochodzi do pełnej widoczności przez 500 ms', () => {
  assert.ok(Math.abs(nieprzezroczystoscHelmu(3250, 3000) - 0.61) < 1e-9);
  assert.equal(nieprzezroczystoscHelmu(3500, 3000), 1);
});

test('OBCIĘCIE DO 1: długo po szwie hełm nie robi się jaśniejszy niż widoczny', () => {
  assert.equal(nieprzezroczystoscHelmu(9999, 3000), 1);
});

test('ostatniSzew === null ZNACZY BRAK CHOREOGRAFII: hełm od razu pełny', () => {
  // Dług z B1. Bez tej gałęzi null koerkowałby się do zera: `t < null` byłoby
  // fałszywe od pierwszej klatki, a (t - null)/500 dawałoby t/500, więc hełm
  // rozjaśniałby się natychmiast i nikt by tego nie zgłosił.
  assert.equal(nieprzezroczystoscHelmu(0, null), 1);
  assert.equal(nieprzezroczystoscHelmu(1500, null), 1);
  assert.equal(nieprzezroczystoscHelmu(99999, null), 1);
});

test('null NIE jest tym samym co zero — zero to szew na starcie sceny', () => {
  assert.equal(nieprzezroczystoscHelmu(0, null), 1);
  assert.equal(nieprzezroczystoscHelmu(0, 0), 0.22);
});

// =============================================================================
//  USUWANIE SPAWOW
// =============================================================================

const spaw = { zycie: 620, czasTrwania: 4220 };

test('spaw w trakcie życia ZOSTAJE', () => {
  assert.equal(czyUsunacSpaw(1000, 900, spaw), false);
  assert.equal(czyUsunacSpaw(1000, 1000, spaw), false, "dokładnie w chwili zapalenia");
  assert.equal(czyUsunacSpaw(1619, 1000, spaw), false, "tuż przed końcem życia");
});

test('GRANICA k = 1: spaw znika dokładnie po swoim życiu, nie klatkę później', () => {
  assert.equal(czyUsunacSpaw(1620, 1000, spaw), true);
  assert.equal(czyUsunacSpaw(1621, 1000, spaw), true);
});

test('k UJEMNE też usuwa — spaw z przyszłości nie ma prawa istnieć', () => {
  // Prototyp ma ten sam warunek (linia 391). Ujemne k oznacza, że zegar cofnął
  // się pod czas zapalenia, czyli scenę przewinięto albo policzono na nowo.
  assert.equal(czyUsunacSpaw(900, 1000, spaw), true);
});

test('SPAW W POŁOWIE ŻYCIA JEST USUWANY, GDY SCENA DOCHODZI DO KOŃCA', () => {
  // Sedno całej zmiany. Spaw zapalony w 3910 ms ma k = 0,5 na 4220 ms — czyli
  // w chwili, w której pętla staje. Bez drugiej gałęzi zostałby na ekranie
  // na zawsze, a klatka końcowa po odegraniu różniłaby się od klatki końcowej
  // po wskoczeniu na koniec. Na tym niezmienniku stoi B5.
  const t0 = 3910;
  assert.ok(Math.abs((4220 - t0) / spaw.zycie - 0.5) < 0.01, "kontrola: k ≈ 0,5");

  assert.equal(czyUsunacSpaw(4219, t0, spaw), false, "sekundę przed końcem jeszcze żyje");
  assert.equal(czyUsunacSpaw(4220, t0, spaw), true, "na końcu sceny znika");
});

test('po końcu sceny NIE MA spawu, który by przeżył — dla żadnego czasu zapalenia', () => {
  // Zamiatanie całego zakresu: dla każdego możliwego t0 wynik na czasTrwania
  // musi być prawdziwy. To jest niezmiennik „grupa spawów jest pusta".
  for (let t0 = 0; t0 <= spaw.czasTrwania; t0 += 10) {
    assert.equal(
      czyUsunacSpaw(spaw.czasTrwania, t0, spaw),
      true,
      `spaw zapalony w ${t0} przeżył koniec sceny`,
    );
  }
});

test('warunek NIE jest za ostry: przed końcem sceny spawy normalnie żyją', () => {
  // Gdyby druga gałąź gasiła je od razu, w trakcie przebiegu nie zapaliłby się
  // ani jeden okrąg i cały efekt zniknąłby po cichu.
  const zyjace = [];
  for (let t = 3500; t < spaw.czasTrwania; t += 20) {
    if (!czyUsunacSpaw(t, 3500, spaw)) zyjace.push(t);
  }
  assert.ok(zyjace.length > 0, "spaw zapalony w 3500 ms musi gdzieś żyć");
  assert.equal(zyjace[0], 3500);
});
