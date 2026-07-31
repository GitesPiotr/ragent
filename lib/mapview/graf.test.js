import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stopienPojec,
  pojecNaDokument,
  odmianaFragmentow,
  podpisLicznika,
  odmianaPojec,
  podpisPojec,
  powodBezKrawedzi,
  podpisyPrzygaszonych,
  skrocEtykiete,
} from './graf.js';
import {
  promien,
  grubosc,
  krok,
  stanWygaszania,
  rozstawNaOkregu,
  rozstawSpiralnie,
  pozycjeStartowe,
  pozycjaDokumentu,
  FIZYKA,
  PROG_RUCHU,
  PROG_MAKS,
} from './fizyka.js';

// =============================================================================
//  STOPIEŃ POJĘCIA — sens widoku
// =============================================================================

test('most to pojęcie sięgające DWÓCH dokumentów, nie mające dwóch krawędzi', () => {
  // Pułapka, przed którą chroni liczenie dokumentów zamiast krawędzi: jeden
  // dokument z wieloma wystąpieniami NIE jest mostem.
  const stopien = stopienPojec([
    { documentId: 'd1', conceptId: 'pracownik', weight: 3 },
    { documentId: 'd2', conceptId: 'pracownik', weight: 1 },
    { documentId: 'd1', conceptId: 'czynsz', weight: 7 },
  ]);
  assert.equal(stopien.get('pracownik'), 2, 'dwa dokumenty = most');
  assert.equal(stopien.get('czynsz'), 1, 'jeden dokument mimo wagi 7 = NIE most');
});

test('stan dzisiejszej kolekcji: żadne pojęcie nie jest mostem', () => {
  // Zmierzone na „Regulaminach" po wyciągnięciu z pięciu małych plików:
  // 42 pojęcia, 42 krawędzie, każda do jednego dokumentu. Ten test pilnuje,
  // żeby reguła nie zaczęła zgłaszać mostów tam, gdzie ich nie ma.
  const edges = [
    { documentId: 'd1', conceptId: 'urlop', weight: 2 },
    { documentId: 'd2', conceptId: 'hasło', weight: 1 },
    { documentId: 'd5', conceptId: 'stanowisko pracy', weight: 1 },
  ];
  assert.equal([...stopienPojec(edges).values()].filter((n) => n > 1).length, 0);
});

test('pusta lista krawędzi nie wywraca liczenia', () => {
  assert.equal(stopienPojec([]).size, 0);
  assert.equal(stopienPojec(undefined).size, 0);
  assert.equal(pojecNaDokument([]).size, 0);
});

test('dokument bez pojęć w ogóle nie pojawia się w mapie krawędzi', () => {
  // Kodeks i RODO mają dziś 0 pojęć. Widok musi je przygasić, a nie ukryć —
  // ukrycie 1014 fragmentów w widoku nazwanym „graf kolekcji" byłoby kłamstwem
  // dokładnie tej klasy, którą wyklucza 12.9.
  const licz = pojecNaDokument([{ documentId: 'd1', conceptId: 'urlop', weight: 1 }]);
  assert.equal(licz.get('d1'), 1);
  assert.equal(licz.get('kodeks'), undefined, 'brak wpisu = przygaszony, nie pominięty');
});

// =============================================================================
//  LICZNIK „pokazano 30 z 312" — testowany BEZ 312 fragmentów
//
//  DoD Sesji 9 wymaga tego napisu przy pojęciu z 300+ fragmentami. Takiego
//  pojęcia dziś nie ma (Kodeks nie ma wyciągniętych pojęć) i pojawi się dopiero
//  po pełnym przebiegu. Reguła nie zależy jednak od danych, więc sprawdza się ją
//  na liczbach — to jest odpowiedź na „pokaż, jak to testujesz jednostkowo".
// =============================================================================

test('DoD: 312 fragmentów przy limicie 30 daje „pokazano 30 z 312"', () => {
  assert.equal(podpisLicznika(30, 312), 'pokazano 30 z 312');
});

test('gdy widać wszystko, licznik NIE mówi „pokazano" — bo nic nie ukryto', () => {
  assert.equal(podpisLicznika(5, 5), '5 fragmentów');
  assert.equal(podpisLicznika(1, 1), '1 fragment');
  assert.equal(podpisLicznika(0, 0), 'brak fragmentów');
});

test('odmiana polska nie łamie się na 2–4 ani na nastkach', () => {
  assert.equal(odmianaFragmentow(1), 'fragment');
  assert.equal(odmianaFragmentow(2), 'fragmenty');
  assert.equal(odmianaFragmentow(4), 'fragmenty');
  assert.equal(odmianaFragmentow(5), 'fragmentów');
  // Nastki są wyjątkiem: 12 to „fragmentów", mimo że 2 to „fragmenty".
  assert.equal(odmianaFragmentow(12), 'fragmentów');
  assert.equal(odmianaFragmentow(13), 'fragmentów');
  assert.equal(odmianaFragmentow(14), 'fragmentów');
  assert.equal(odmianaFragmentow(22), 'fragmenty');
  assert.equal(odmianaFragmentow(112), 'fragmentów');
  assert.equal(odmianaFragmentow(122), 'fragmenty');
});

// --- trzy powody przygaszenia dokumentu (12.9) -------------------------------

test('trzy różne powody braku krawędzi dają trzy różne napisy', () => {
  // Stan zmierzony na Regulaminach: wszystkie trzy przypadki naraz.
  const documents = [
    { id: 'a', chunkCount: 3, conceptCount: 6 },   // ma pojęcia, próg je odsiał
    { id: 'b', chunkCount: 1, conceptCount: 2 },   // to samo
    { id: 'c', chunkCount: 504, conceptCount: 0 }, // RODO: nie policzone
    { id: 'd', chunkCount: 0, conceptCount: 0 },   // skan: brak tekstu
    { id: 'e', chunkCount: 510, conceptCount: 538 }, // Kodeks: ma krawędzie
  ];
  const zKrawedziami = new Set(['e']);
  const podpisy = podpisyPrzygaszonych(documents, (d) => zKrawedziami.has(d.id));

  assert.deepEqual(podpisy.map((p) => p.powod), ['prog', 'niepoliczone', 'bez-tekstu']);
  assert.deepEqual(podpisy.map((p) => p.ile), [2, 1, 1]);
  assert.match(podpisy[0].tekst, /obniż próg/, 'ten powód suwak odwraca');
  assert.match(podpisy[1].tekst, /żaden próg/, 'a tego nie — i musi to powiedzieć wprost');
});

test('dokument bez tekstu nie jest opisywany jako „brak pojęć przy tym progu"', () => {
  // Sedno poprawki: napis, który brzmi jak wyjaśnienie, a mówi nieprawdę,
  // jest gorszy niż brak napisu.
  assert.equal(powodBezKrawedzi({ chunkCount: 0, conceptCount: 0 }), 'bez-tekstu');
  assert.equal(powodBezKrawedzi({ chunkCount: 504, conceptCount: 0 }), 'niepoliczone');
  assert.equal(powodBezKrawedzi({ chunkCount: 3, conceptCount: 6 }), 'prog');
  // Brakujące pola nie mogą dać fałszywie optymistycznego „to tylko próg".
  assert.equal(powodBezKrawedzi({}), 'bez-tekstu');
  assert.equal(powodBezKrawedzi(null), 'bez-tekstu');
});

test('gdy każdy dokument ma krawędzie, legenda nie ma nic do tłumaczenia', () => {
  const podpisy = podpisyPrzygaszonych([{ id: 'a', chunkCount: 5, conceptCount: 3 }], () => true);
  assert.deepEqual(podpisy, []);
});

// --- licznik pojęć po filtrze (12.9, Sesja 10) -------------------------------

test('DoD Sesji 10: „pokazano 157 z 565 pojęć" — filtr nie udaje, że to wszystko', () => {
  assert.equal(podpisPojec(157, 565), 'pokazano 157 z 565 pojęć');
});

test('gdy próg nic nie ukrywa, licznik nie mówi „pokazano"', () => {
  assert.equal(podpisPojec(565, 565), '565 pojęć');
  assert.equal(podpisPojec(1, 1), '1 pojęcie');
  assert.equal(podpisPojec(0, 0), 'brak pojęć');
});

test('odmiana „pojęcia" nie łamie się na 2–4 ani na nastkach', () => {
  assert.equal(odmianaPojec(1), 'pojęcie');
  assert.equal(odmianaPojec(2), 'pojęcia');
  assert.equal(odmianaPojec(4), 'pojęcia');
  assert.equal(odmianaPojec(5), 'pojęć');
  assert.equal(odmianaPojec(12), 'pojęć', 'dwanaście pojęć, nie „dwanaście pojęcia"');
  assert.equal(odmianaPojec(14), 'pojęć');
  assert.equal(odmianaPojec(22), 'pojęcia');
  assert.equal(odmianaPojec(157), 'pojęć');
  assert.equal(odmianaPojec(565), 'pojęć');
  // Liczby zmierzone na Regulaminach: 103 pojęcia, 22 pojęcia, 24 pojęcia.
  assert.equal(odmianaPojec(103), 'pojęcia');
});

test('etykieta skraca się dopiero po przekroczeniu limitu', () => {
  assert.equal(skrocEtykiete('urlop'), 'urlop');
  assert.equal(skrocEtykiete('uwierzytelnienie dwuskładnikowe'), 'uwierzytelnienie dwus…');
  assert.equal(skrocEtykiete('  czas   pracy '), 'czas pracy');
  assert.equal(skrocEtykiete(null), '');
});

// =============================================================================
//  SKALOWANIE
// =============================================================================

test('PIERWIASTEK, nie liniowo: CSV z jednym fragmentem zostaje widoczny obok Kodeksu', () => {
  // Realne liczby z kolekcji: Kodeks 510, CSV 1.
  const duzy = promien(510, 510, 7, 22);
  const maly = promien(1, 510, 7, 22);
  assert.equal(duzy, 22);
  assert.ok(maly > 7.6, `CSV wyszedł ${maly.toFixed(2)} px — musi być widoczny`);

  // Liniowo CSV byłby 510× mniejszy od Kodeksu; pierwiastkiem różnica pól
  // spada do 510, a różnica promieni do ~22×. Sprawdzamy, że skala NIE jest liniowa.
  const liniowo = 7 + (22 - 7) * (1 / 510);
  assert.ok(maly > liniowo * 1.05, 'pierwiastek musi wynieść mały węzeł wyżej niż skala liniowa');
});

test('skalowanie znosi zero, wartości ujemne i maksimum równe zeru', () => {
  assert.equal(promien(0, 100, 4, 14), 4);
  assert.equal(promien(-5, 100, 4, 14), 4);
  assert.equal(promien(5, 0, 4, 14), 14, 'maks 0 → traktujemy jak 1, bez dzielenia przez zero');
  assert.equal(promien(999, 10, 4, 14), 14, 'powyżej maksimum przycinamy, nie wychodzimy poza rMax');
});

test('grubość krawędzi LINIOWA i normalizowana do maksimum — inaczej niż promień', () => {
  // Rozróżnienie wymiarów: promień koduje wielkość polem (2D, więc pierwiastek),
  // grubość linii jest jednowymiarowa (więc liniowo). Pomiar, który do tego
  // doprowadził: przy wagach 1–3 pierwiastek dawał rozpiętość 1,78 px na CAŁYM
  // zakresie danych — różnicy „pojęcie mocno kontra słabo związane" nie było widać.
  // Liniowo wychodzi 2,80 px (nie 4,2 — waga 0 nie tworzy krawędzi, więc dolnym
  // końcem zakresu jest 1, a nie 0).
  const dzis = [1, 2, 3].map((w) => grubosc(w, 3));
  assert.ok(dzis[2] - dzis[0] > 2.5, `rozpiętość ${(dzis[2] - dzis[0]).toFixed(2)} px przy wagach 1–3`);
  assert.ok(
    Math.abs((dzis[1] - dzis[0]) - (dzis[2] - dzis[1])) < 1e-9,
    'liniowa: równe przyrosty wagi dają równe przyrosty grubości'
  );

  // Normalizacja do maksimum załatwia obawę o „linię przez pół ekranu" po Kodeksie.
  assert.equal(grubosc(40, 40), 5);
  assert.ok(grubosc(1, 40) >= 0.8 && grubosc(1, 40) < 1);
  assert.equal(grubosc(0, 0), 0.8, 'brak wagi i brak maksimum nie dzieli przez zero');
});

// =============================================================================
//  FIZYKA
// =============================================================================

function wezel(id, typ, x, y) {
  return { id, typ, x, y, vx: 0, vy: 0 };
}

test('węzły połączone krawędzią zbliżają się do długości spoczynkowej sprężyny', () => {
  const wezly = [wezel('a', 'dokument', 100, 300), wezel('b', 'pojecie', 700, 300)];
  const krawedzie = [{ a: 0, b: 1 }];
  for (let i = 0; i < 600; i++) krok(wezly, krawedzie, { szer: 800, wys: 600 });
  const d = Math.hypot(wezly[1].x - wezly[0].x, wezly[1].y - wezly[0].y);
  // Odpychanie nie pozwala zejść dokładnie do 115 — sprawdzamy rząd wielkości.
  assert.ok(d > 60 && d < 260, `odległość po zbiegnięciu: ${d.toFixed(0)} px`);
});

test('węzły bez krawędzi ROZJEŻDŻAJĄ SIĘ, zamiast siedzieć na sobie', () => {
  const wezly = [wezel('a', 'pojecie', 400, 300), wezel('b', 'pojecie', 402, 300)];
  for (let i = 0; i < 200; i++) krok(wezly, [], { szer: 800, wys: 600 });
  const d = Math.hypot(wezly[1].x - wezly[0].x, wezly[1].y - wezly[0].y);
  assert.ok(d > 20, `dwa nakładające się węzły muszą się rozepchnąć, wyszło ${d.toFixed(1)} px`);
});

test('układ ZBIEGA — ruch spada, a nie drga w nieskończoność', () => {
  const wezly = [];
  for (let i = 0; i < 40; i++) {
    const { x, y } = rozstawSpiralnie(i, 40, 800, 600);
    wezly.push(wezel('n' + i, i < 5 ? 'dokument' : 'pojecie', x, y));
  }
  const krawedzie = [];
  for (let i = 5; i < 40; i++) krawedzie.push({ a: i % 5, b: i });

  let pomiar = krok(wezly, krawedzie, { szer: 800, wys: 600 });
  for (let i = 0; i < 49; i++) pomiar = krok(wezly, krawedzie, { szer: 800, wys: 600 });
  const wczesny = pomiar.ruch;
  for (let i = 0; i < 1500; i++) pomiar = krok(wezly, krawedzie, { szer: 800, wys: 600 });
  assert.ok(pomiar.ruch < wczesny, `ruch musi spadać: ${wczesny.toFixed(3)} → ${pomiar.ruch.toFixed(3)}`);
  assert.ok(pomiar.ruch < PROG_RUCHU, `po 1550 klatkach układ ma stać, ruch = ${pomiar.ruch.toFixed(4)}`);
});

// =============================================================================
//  SKALA — KRYTERIUM ODBIORU Z POMIARU (scripts/sym-fizyka-grafu.mjs, sekcja F)
//
//  Kształt wzięty z Regulaminów po Kodeksie: 8 dokumentów, 565 pojęć, z czego 550
//  ma dokładnie jedną krawędź, a jeden dokument trzyma 538 z nich. To NIE jest
//  sieć, to osiem gwiazd — i właśnie ten kształt wywracał układanie.
// =============================================================================
function grafGwiazdy(ilePojec, rozstaw, szer = 900, wys = 620) {
  const ile = 8 + ilePojec;
  const wezly = [];
  const dodaj = (id, typ, i) => {
    const { x, y } = rozstaw(i, ile, szer, wys);
    wezly.push(wezel(id, typ, x, y));
  };
  for (let i = 0; i < 8; i++) dodaj('dok' + i, 'dokument', i);
  for (let i = 0; i < ilePojec; i++) dodaj('poj' + i, 'pojecie', 8 + i);
  const krawedzie = [];
  for (let i = 0; i < ilePojec; i++) {
    // Pierwsze 15 to mosty (dwa dokumenty), resztę bierze jedna wielka gwiazda.
    krawedzie.push({ a: i < 15 ? i % 8 : i < 538 ? 0 : 1 + (i % 7), b: 8 + i });
    if (i < 15) krawedzie.push({ a: (i + 1) % 8, b: 8 + i });
  }
  return { wezly, krawedzie };
}

function doWyciszenia(wezly, krawedzie, opcje = {}, maksKlatek = 1200) {
  let spokojnych = 0;
  let pomiar = { ruch: 0, maks: 0 };
  for (let klatka = 1; klatka <= maksKlatek; klatka++) {
    pomiar = krok(wezly, krawedzie, { szer: 900, wys: 620, ...opcje });
    const stan = stanWygaszania(spokojnych, pomiar);
    spokojnych = stan.spokojnych;
    if (stan.wystygl) return { klatek: klatka, pomiar };
  }
  return { klatek: null, pomiar };
}

test('573 WĘZŁY WYCISZAJĄ SIĘ — pełna skala Kodeksu, nie tylko czterdzieści węzłów', () => {
  // Ten test pilnuje JEDNEJ rzeczy: że układ w ogóle się wycisza. Nie jest obietnicą
  // czasu — kształt gwiazd jest tu przybliżony, więc wychodzi 136 klatek, a na
  // prawdziwych Regulaminach zmierzono 1432 (24 s przy 60 fps, patrz
  // scripts/sym-skala-grafu.mjs). Limit jest luźny właśnie dlatego, żeby nikt nie
  // czytał go jako gwarancji wydajności; wyłapuje powrót do „nie wycisza się nigdy".
  const { wezly, krawedzie } = grafGwiazdy(565, rozstawSpiralnie);
  assert.equal(wezly.length, 573);
  const { klatek, pomiar } = doWyciszenia(wezly, krawedzie, {}, 2500);
  assert.ok(
    klatek !== null,
    `573 węzły muszą się wyciszyć; ruch=${pomiar.ruch.toPrecision(3)} maks=${pomiar.maks.toFixed(2)}`
  );
});

test('165 węzłów (próg 2) wycisza się — to jest domyślny widok po filtrze', () => {
  // Na prawdziwych danych: 236 klatek, 3,9 s. Tu kształt jest przybliżony.
  const { wezly, krawedzie } = grafGwiazdy(157, rozstawSpiralnie);
  const { klatek } = doWyciszenia(wezly, krawedzie, {}, 2500);
  assert.ok(klatek !== null, `wyszło ${klatek}`);
});

// =============================================================================
//  PRZYPADEK KONTROLNY — CZY KRYTERIUM DZIAŁA, CZY TYLKO PRZESTAŁO NARZEKAĆ
//
//  Przejście z prędkości na faktyczne przesunięcie jest zmianą DEFINICJI SUKCESU
//  w trakcie naprawiania sukcesu. Bez tego testu nie da się odróżnić „naprawiliśmy
//  układanie" od „kryterium przestało zgłaszać problem".
//
//  Reprodukujemy siłę sprzed naprawy przez `cfg` (dolna granica odległości 1 px,
//  czyli stan z komentarza w FIZYKA.minOdleglosc) plus rozstaw na okręgu ze stałą
//  24 — dokładnie ten układ, który użytkownik widział jako „obraz drga i skacze".
// =============================================================================
test('układ, który REALNIE DRGA, przy nowym kryterium dalej nie zbiega', () => {
  const okrag24 = (i, _ile, szer, wys) => rozstawNaOkregu(i, 24, szer, wys);
  const { wezly, krawedzie } = grafGwiazdy(565, okrag24);
  const stara = { ...FIZYKA, minOdleglosc: 1 };

  const { klatek, pomiar } = doWyciszenia(wezly, krawedzie, { cfg: stara }, 1500);
  assert.equal(klatek, null, 'drgający układ NIE MA prawa zostać uznany za zbiegnięty');
  // Zmierzone maksymalne przesunięcie: ~1000 px na klatkę. To nie jest „prawie stoi".
  assert.ok(
    pomiar.maks > 100,
    `drganie musi być widoczne w pomiarze, maks = ${pomiar.maks.toFixed(1)} px/klatkę`
  );
});

test('sama dolna granica odległości decyduje o zbieżności, rozstaw decyduje o CZASIE', () => {
  // Rozdzielenie dwóch napraw, które w tabeli odbioru zmieniają się razem.
  const stara = { ...FIZYKA, minOdleglosc: 1 };
  const okrag24 = (i, _ile, szer, wys) => rozstawNaOkregu(i, 24, szer, wys);

  const a = grafGwiazdy(565, rozstawSpiralnie);
  assert.equal(
    doWyciszenia(a.wezly, a.krawedzie, { cfg: stara }, 1500).klatek,
    null,
    'spirala BEZ dolnej granicy odległości nie wystarcza'
  );

  const b = grafGwiazdy(565, okrag24);
  const zOkregu = doWyciszenia(b.wezly, b.krawedzie, {}, 1500).klatek;
  const c = grafGwiazdy(565, rozstawSpiralnie);
  const zeSpirali = doWyciszenia(c.wezly, c.krawedzie, {}, 1500).klatek;
  assert.ok(zOkregu !== null, 'granica odległości sama ratuje zbieżność nawet ze złego rozstawu');
  assert.ok(
    zeSpirali < zOkregu,
    `spirala ma skracać układanie: ${zeSpirali} vs ${zOkregu} klatek z okręgu`
  );
});

test('żaden węzeł nie ucieka poza płótno', () => {
  const wezly = [];
  for (let i = 0; i < 30; i++) wezly.push(wezel('n' + i, 'pojecie', 400, 300));
  for (let i = 0; i < 300; i++) krok(wezly, [], { szer: 800, wys: 600 });
  for (const w of wezly) {
    assert.ok(w.x >= FIZYKA.margines && w.x <= 800 - FIZYKA.margines, `x poza płótnem: ${w.x}`);
    assert.ok(w.y >= FIZYKA.margines && w.y <= 600 - FIZYKA.margines, `y poza płótnem: ${w.y}`);
  }
});

test('węzeł trzymany kursorem NIE przesuwa się, ale nadal odpycha innych', () => {
  const wezly = [wezel('a', 'pojecie', 400, 300), wezel('b', 'pojecie', 410, 300)];
  wezly[0].trzymany = true;
  const przed = { x: wezly[0].x, y: wezly[0].y };
  for (let i = 0; i < 60; i++) krok(wezly, [], { szer: 800, wys: 600 });
  assert.equal(wezly[0].x, przed.x, 'trzymany stoi w osi X');
  assert.equal(wezly[0].y, przed.y, 'trzymany stoi w osi Y');
  assert.ok(wezly[1].x > 410, 'sąsiad musi zostać odepchnięty przez trzymanego');
});

test('pusta lista węzłów zwraca zerowy ruch zamiast NaN', () => {
  assert.deepEqual(krok([], [], { szer: 800, wys: 600 }), { ruch: 0, maks: 0 });
});

test('węzły o IDENTYCZNYCH współrzędnych rozchodzą się, a nie zostają w sobie', () => {
  // Przy dx = dy = 0 kierunek siły to 0/0, więc przed naprawą taka para nie odpychała
  // się WCALE. Tak powstawały 24 grudki: rozstaw na okręgu ze stałą 24 sadzał po ~24
  // węzły w jednym punkcie, a one zostawały tam na zawsze.
  const wezly = [wezel('a', 'pojecie', 400, 300), wezel('b', 'pojecie', 400, 300)];
  for (let i = 0; i < 200; i++) krok(wezly, [], { szer: 800, wys: 600 });
  const d = Math.hypot(wezly[1].x - wezly[0].x, wezly[1].y - wezly[0].y);
  assert.ok(d > 20, `węzły w tym samym punkcie muszą się rozepchnąć, wyszło ${d.toFixed(1)} px`);
});

test('rozepchnięcie zderzonych węzłów jest DETERMINISTYCZNE', () => {
  // Bez Math.random() (12.9): dwa przebiegi tych samych danych dają ten sam układ.
  const bieg = () => {
    const wezly = [];
    for (let i = 0; i < 12; i++) wezly.push(wezel('n' + i, 'pojecie', 400, 300));
    for (let i = 0; i < 120; i++) krok(wezly, [], { szer: 800, wys: 600 });
    return wezly.map((w) => [w.x, w.y]);
  };
  assert.deepEqual(bieg(), bieg());
});

test('przycięcie do płótna ZERUJE składową prędkości wpychającą w ścianę', () => {
  // Wcześniej pozycja stawała, a prędkość zostawała w węźle — przy odpychaniu rzędu
  // tysięcy pikseli na klatkę węzeł trzymał ją w nieskończoność i podbijał wynik
  // pomiaru, choć nie ruszał się z miejsca.
  const w = wezel('a', 'pojecie', 100, 300);
  w.vx = -500;
  krok([w], [], { szer: 800, wys: 600 });
  assert.equal(w.x, FIZYKA.margines, 'węzeł stoi na marginesie');
  assert.equal(w.vx, 0, 'prędkość wpychająca w ścianę musi zostać odebrana');
});

test('węzeł wciśnięty w ścianę NIE raportuje ruchu, którego nie wykonuje', () => {
  // Sedno zmiany kryterium: pomiar liczy PRZESUNIĘCIE po przycięciu, nie prędkość
  // przed nim. Przy 573 węzłach stara miara dawała 2,63 przy faktycznym przesunięciu
  // 0,078 px na klatkę — pętla animacji nie miała jak się zatrzymać.
  const w = wezel('a', 'pojecie', FIZYKA.margines, 300);
  w.vx = -9000;
  const pomiar = krok([w], [], { szer: 800, wys: 600 });
  assert.ok(
    pomiar.maks < 1,
    `węzeł stoi w ścianie, więc przesunięcie ma być zerowe, wyszło ${pomiar.maks}`
  );
});

test('krawędź wskazująca nieistniejący węzeł nie wywraca kroku', () => {
  const wezly = [wezel('a', 'pojecie', 100, 100)];
  assert.doesNotThrow(() => krok(wezly, [{ a: 0, b: 99 }], { szer: 800, wys: 600 }));
});

// --- wygaszanie --------------------------------------------------------------

const SPOKOJNA = { ruch: 0.001, maks: 0.05 };

test('JEDNA spokojna klatka NIE wygasza — układ potrafi chwilowo zwolnić', () => {
  const { spokojnych, wystygl } = stanWygaszania(0, SPOKOJNA);
  assert.equal(spokojnych, 1);
  assert.equal(wystygl, false);
});

test('seria spokojnych klatek wygasza, a ruch zeruje licznik', () => {
  let s = 0;
  for (let i = 0; i < 29; i++) s = stanWygaszania(s, SPOKOJNA).spokojnych;
  assert.equal(stanWygaszania(s, SPOKOJNA).wystygl, true, '30. spokojna klatka wygasza');

  // Dogrzanie: jedna klatka z ruchem kasuje dorobek.
  assert.equal(stanWygaszania(29, { ruch: 5, maks: 3 }).spokojnych, 0);
  assert.equal(stanWygaszania(29, { ruch: 5, maks: 3 }).wystygl, false);
});

test('JEDEN drgający węzeł nie da się ukryć w średniej z pięciuset spokojnych', () => {
  // Rachunek, dla którego istnieje PROG_MAKS. Przy 573 węzłach suma kwadratów
  // przesunięć musi zejść poniżej 11,46, żeby średnia zmieściła się pod 0,02.
  // Jeden węzeł drgający 3,3 px na klatkę — czyli 200 px/s, ruch doskonale widoczny —
  // daje sumę 10,89, więc SAMA ŚREDNIA uznałaby taki układ za zbiegnięty.
  const ruch = (3.3 * 3.3) / 573;
  assert.ok(ruch < PROG_RUCHU, 'założenie testu: średnia sama by to przepuściła');
  assert.equal(
    stanWygaszania(29, { ruch, maks: 3.3 }).wystygl,
    false,
    'drugi próg musi wyłapać jednego wariata wśród spokojnych'
  );
  // A węzeł poruszający się poniżej progu maksimum już nie blokuje wygaszania.
  assert.equal(stanWygaszania(29, { ruch, maks: PROG_MAKS - 0.01 }).wystygl, true);
});

test('rozstawienie startowe jest DETERMINISTYCZNE — bez Math.random()', () => {
  // Prototyp mapy używał Math.random() w buildBasis i 12.9 wytyka to wprost.
  // Tu układ końcowy ma wynikać z danych, nie z ziarna losowego: te same dane
  // muszą dać ten sam start przy każdym wejściu na stronę.
  const raz = rozstawSpiralnie(3, 10, 800, 600);
  const dwa = rozstawSpiralnie(3, 10, 800, 600);
  assert.deepEqual(raz, dwa);
  assert.notDeepEqual(rozstawSpiralnie(4, 10, 800, 600), raz);
});

test('spirala rozkłada węzły po POWIERZCHNI, nie po obwodzie', () => {
  // Sedno naprawy A: na okręgu 573 węzły mają 2,2 px odstępu i startują jeden
  // w drugim. Spirala musi dawać rosnące promienie, nie jeden promień dla wszystkich.
  const promienie = [];
  for (let i = 0; i < 573; i++) {
    const { x, y } = rozstawSpiralnie(i, 573, 900, 620);
    promienie.push(Math.hypot(x - 450, y - 310));
  }
  assert.ok(promienie[0] < 20, `pierwszy węzeł ma być przy środku, jest ${promienie[0].toFixed(1)}`);
  assert.ok(promienie[572] > 250, `ostatni ma być przy brzegu, jest ${promienie[572].toFixed(1)}`);

  // Żadne dwa węzły nie mogą wylądować w tym samym punkcie — to był warunek,
  // którego rozstaw na okręgu ze stałą 24 nie spełniał dla 573 węzłów.
  const punkty = new Set();
  for (let i = 0; i < 573; i++) {
    const { x, y } = rozstawSpiralnie(i, 573, 900, 620);
    punkty.add(`${x.toFixed(2)}|${y.toFixed(2)}`);
  }
  assert.equal(punkty.size, 573, 'każdy węzeł startuje w innym punkcie');
});

// =============================================================================
//  POWTARZALNOŚĆ UKŁADU (12.9)
//
//  Zgłoszone jako blokujące: dwa wejścia na tę samą kolekcję w tym samym trybie
//  dawały dwa różne układy. Przyczyną było dziedziczenie pozycji z układu zatrzymanego
//  w połowie drogi — przy przełączeniu trybu 23 węzły brały pozycje z niedokończonego
//  układu 165 węzłów, a „niedokończonego jak bardzo" zależało od tego, po ilu sekundach
//  człowiek kliknął.
//
//  TESTY PORÓWNUJĄ DWA PRZEBIEGI W TYM SAMYM PROCESIE, nigdy zaszytych współrzędnych.
//  Zaszyte liczby padłyby na innym sprzęcie i zostałyby usunięte jako uciążliwe —
//  czyli zniknęłoby dokładnie to, co miały chronić. Przy 165 węzłach zaburzenie
//  0,01 px rozjeżdża układ o 9,3 px, więc identyczność współrzędnych jest obietnicą
//  możliwą do utrzymania TYLKO w obrębie jednego procesu.
// =============================================================================

test('ZMIANA DANYCH nie dziedziczy pozycji — start od spirali', () => {
  const wezly = [wezel('a', 'dokument', 0, 0), wezel('b', 'pojecie', 0, 0)];
  const poprzednie = [
    { id: 'a', x: 111, y: 222, vx: 3, vy: 4 },
    { id: 'b', x: 333, y: 444, vx: 5, vy: 6 },
  ];
  const zmianaDanych = pozycjeStartowe(wezly, { poprzednie, dziedzicz: false, szer: 900, wys: 620 });
  const bezNiczego = pozycjeStartowe(wezly, { poprzednie: null, szer: 900, wys: 620 });
  assert.deepEqual(zmianaDanych, bezNiczego, 'poprzedni układ nie ma prawa nic narzucić');
  assert.equal(zmianaDanych[0].vx, 0, 'i nie przenosi prędkości');
});

test('TE SAME DANE dziedziczą pozycje — rozwinięcie pojęcia nie przestawia reszty', () => {
  // Sprawdzane na POJĘCIU, nie na dokumencie: dokumenty są przypięte do pierścienia
  // i dziedziczenia nie dotyczą (osobny test niżej).
  const wezly = [wezel('a', 'pojecie', 0, 0), wezel('nowy', 'fragment', 0, 0)];
  const poprzednie = [{ id: 'a', x: 111, y: 222, vx: 3, vy: 4 }];
  const start = pozycjeStartowe(wezly, { poprzednie, dziedzicz: true, szer: 900, wys: 620 });
  assert.deepEqual(start[0], { x: 111, y: 222, vx: 3, vy: 4 }, 'znany węzeł zostaje na miejscu');
  assert.notEqual(start[1].x, 0, 'nowy węzeł dostaje pozycję ze spirali');
  assert.equal(start[1].vx, 0);
});

test('PRZEŁĄCZENIE TRYBU po różnej liczbie klatek daje TEN SAM układ', () => {
  // Odtworzenie zgłoszonej usterki: wejście na stronę w trybie „próg 2", potem
  // klik w „tylko mosty" — raz po 30 klatkach, raz po 200. Przed naprawą oba
  // przebiegi kończyły w innych miejscach (zmierzone: do 471 px różnicy).
  const pelny = grafGwiazdy(157, rozstawSpiralnie);
  const podzbior = (zrodlo) => {
    // „Tylko mosty" to inny ZBIÓR węzłów: dokumenty plus 15 pojęć-mostów.
    const wybrane = zrodlo.wezly.filter((w, i) => w.typ === 'dokument' || i < 8 + 15);
    return wybrane.map((w) => ({ ...w }));
  };

  const przebieg = (poIluKlatkach) => {
    const start = grafGwiazdy(157, rozstawSpiralnie);
    const poz = pozycjeStartowe(start.wezly, { szer: 900, wys: 620 });
    for (let i = 0; i < start.wezly.length; i++) Object.assign(start.wezly[i], poz[i]);
    for (let k = 0; k < poIluKlatkach; k++) {
      krok(start.wezly, start.krawedzie, { szer: 900, wys: 620 });
    }
    // Przebudowa na INNY zbiór węzłów = zmiana danych, więc bez dziedziczenia.
    const po = podzbior(start);
    const start2 = pozycjeStartowe(po, {
      poprzednie: start.wezly,
      dziedzicz: false,
      szer: 900,
      wys: 620,
    });
    for (let i = 0; i < po.length; i++) Object.assign(po[i], start2[i]);
    const krawedzie = [];
    for (let i = 8; i < po.length; i++) krawedzie.push({ a: i % 8, b: i });
    let s2 = 0;
    for (let k = 0; k < 1500; k++) {
      const pomiar = krok(po, krawedzie, { szer: 900, wys: 620 });
      const stan = stanWygaszania(s2, pomiar);
      s2 = stan.spokojnych;
      if (stan.wystygl) break;
    }
    return po.map((w) => [Math.round(w.x * 100), Math.round(w.y * 100)]);
  };

  // Momenty po obu stronach granicy wyciszenia (~200 klatek przy 165 węzłach) —
  // pierwsza wersja reguły („dziedzicz z wyciszonego") padała dokładnie tutaj.
  assert.deepEqual(przebieg(30), przebieg(200), 'klik po 30 i po 200 klatkach = ten sam układ');
  assert.deepEqual(przebieg(5), przebieg(600), 'także przez granicę wyciszenia');
});

test('DWA WEJŚCIA na tę samą kolekcję dają identyczny układ końcowy', () => {
  // Najprostsza forma obietnicy z 12.9: współrzędne są konsekwencją danych.
  const przebieg = () => {
    const g = grafGwiazdy(157, rozstawSpiralnie);
    const poz = pozycjeStartowe(g.wezly, { szer: 743, wys: 620 });
    for (let i = 0; i < g.wezly.length; i++) Object.assign(g.wezly[i], poz[i]);
    doWyciszenia(g.wezly, g.krawedzie, { szer: 743 }, 2500);
    return g.wezly.map((w) => [w.x, w.y]);
  };
  assert.deepEqual(przebieg(), przebieg());
});

// =============================================================================
//  PRZYPIĘTE DOKUMENTY — rama nazwana ramą
// =============================================================================

test('dokumenty dostają pozycje z PIERŚCIENIA i są przypięte, nie ze spirali', () => {
  const wezly = [
    wezel('d1', 'dokument', 0, 0),
    wezel('d2', 'dokument', 0, 0),
    wezel('p1', 'pojecie', 0, 0),
  ];
  const start = pozycjeStartowe(wezly, { szer: 864, wys: 620 });
  assert.equal(start[0].trzymany, true, 'dokument jest przypięty');
  assert.equal(start[1].trzymany, true);
  assert.ok(!start[2].trzymany, 'pojęcie NIE jest przypięte — ono ma się układać');

  // Dwa dokumenty na pierścieniu leżą po przeciwnych stronach środka.
  const srodek = { x: 864 / 2, y: 620 / 2 };
  const r1 = Math.hypot(start[0].x - srodek.x, start[0].y - srodek.y);
  const r2 = Math.hypot(start[1].x - srodek.x, start[1].y - srodek.y);
  assert.ok(Math.abs(r1 - r2) < 0.001, 'oba na tym samym promieniu');
  assert.ok(Math.abs(start[0].y - start[1].y) > 100, 'i po przeciwnych stronach');
});

test('pozycje dokumentów NIE ZALEŻĄ od poprzedniego układu ani od dziedziczenia', () => {
  // To jest sedno obietnicy: pozycja dokumentu jest funkcją danych, nie historii.
  const wezly = [wezel('d1', 'dokument', 0, 0), wezel('p1', 'pojecie', 0, 0)];
  const bzdurne = [{ id: 'd1', x: 5, y: 5, vx: 99, vy: 99 }];
  const bez = pozycjeStartowe(wezly, { szer: 864, wys: 620 });
  const zeStarym = pozycjeStartowe(wezly, {
    poprzednie: bzdurne,
    dziedzicz: true,
    szer: 864,
    wys: 620,
  });
  assert.deepEqual(zeStarym[0], bez[0], 'dokument wraca na pierścień nawet przy dziedziczeniu');
});

test('pierścień jest deterministyczny i zaczyna się na godzinie dwunastej', () => {
  const a = pozycjaDokumentu(0, 8, 864, 620);
  assert.deepEqual(a, pozycjaDokumentu(0, 8, 864, 620));
  assert.ok(Math.abs(a.x - 864 / 2) < 0.001, 'pierwszy dokument dokładnie nad środkiem');
  assert.ok(a.y < 620 / 2, 'i powyżej środka');
});

test('przypięty dokument STOI, ale nadal odpycha pojęcia', () => {
  // Realizacja przez istniejący mechanizm `trzymany` — żadna siła się nie zmienia.
  const dok = wezel('d1', 'dokument', 400, 300);
  dok.trzymany = true;
  const poj = wezel('p1', 'pojecie', 410, 300);
  const przed = { x: dok.x, y: dok.y };
  for (let i = 0; i < 60; i++) krok([dok, poj], [], { szer: 864, wys: 620 });
  assert.equal(dok.x, przed.x, 'dokument stoi w osi X');
  assert.equal(dok.y, przed.y, 'i w osi Y');
  assert.ok(poj.x > 410, 'pojęcie zostało odepchnięte');
});

test('ruch przypiętych dokumentów NIE WCHODZI do pomiaru wygaszania', () => {
  // Dzięki temu zniknęła niemonotoniczność: przy ≥5 i przy mostach to węzeł
  // DOKUMENTU trzymał wygaszanie (zmierzone: 27% i 43% całego ruchu na 8 węzłach).
  const dok = wezel('d1', 'dokument', 100, 300);
  dok.trzymany = true;
  dok.vx = 500;
  const pomiar = krok([dok], [], { szer: 864, wys: 620 });
  assert.equal(pomiar.ruch, 0, 'przypięty węzeł nie wnosi ruchu');
  assert.equal(pomiar.maks, 0);
});

test('rozstaw na okręgu ZOSTAJE jako punkt odniesienia testu regresyjnego', () => {
  // Ta funkcja nie jest już używana przez widok. Test pilnuje, żeby nie zniknęła
  // przy porządkach: bez niej nie da się odtworzyć układu, który realnie drga,
  // a więc nie da się sprawdzić, czy kryterium zbieżności cokolwiek wykrywa.
  const punkty = new Set();
  for (let i = 0; i < 573; i++) {
    const { x, y } = rozstawNaOkregu(i, 24, 900, 620);
    punkty.add(`${x.toFixed(2)}|${y.toFixed(2)}`);
  }
  assert.equal(punkty.size, 24, '573 węzły na 24 punktach — tak wyglądał start przed naprawą');
});
