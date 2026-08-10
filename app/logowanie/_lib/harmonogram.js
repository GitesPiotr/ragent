import { SZEW_X } from "./siatka.js";

// =============================================================================
//  HARMONOGRAM PRZEBIEGU GLOWY — same liczby, zero DOM-u.
//
//  Odwzorowanie schedule() z docs/prototyplogowania.html (linie 341-351).
//  Prototyp liczy czasy i dopisuje je PROSTO do obiektow wezlow, ktore sam
//  wczesniej zlepil z elementami SVG. Tutaj zostaje sama arytmetyka: wchodza
//  dane siatki, wychodzi nowa struktura z czasami. Nic sie nie importuje
//  "przy okazji" — modul nie dotyka dokumentu i nie ma efektow ubocznych,
//  wiec przechodzi przez prerendering w Node.
// =============================================================================

// --- STALE PRZEBIEGU ---
//
// Wszystkie z jednej linii prototypu (339):
//   const NODE_IN=420,EDGE_IN=300,SPREAD=2400,SCAT_IN=700,WELD=620;
// Przy kazdej stoi oryginalna nazwa, zeby dalo sie wrocic do zrodla.

// prototyp: SCAT_IN. Rozproszenie wchodzi pierwsze; siatka rusza dopiero po nim.
export const ROZPROSZENIE_MS = 700;

// prototyp: SPREAD. Rozpietosc startow wezlow: wezel o k = 0 rusza od razu
// po rozproszeniu, wezel o k = 1 o tyle pozniej.
export const ROZSYP_MS = 2400;

// prototyp: NODE_IN. Wejscie pojedynczego wezla.
export const WEZEL_MS = 420;

// prototyp: EDGE_IN. Narysowanie pojedynczej krawedzi.
export const KRAWEDZ_MS = 300;

// prototyp: WELD. Zycie okregu spawu na szwie.
export const SPAW_MS = 620;

// prototyp: literal 400 w DUR (linia 353). Ogon po ostatniej krawedzi.
export const OGON_MS = 400;

// prototyp: DUR() z linii 353, czyli SCAT_IN+SPREAD+NODE_IN+EDGE_IN+400.
//
// LICZONE, NIE WPISANE. Wpisane 4220 rozjechaloby sie po cichu, gdyby ktos
// ruszyl skladnik — a rozjazd widac dopiero na oko, w postaci ucietej albo
// wiszacej animacji.
//
// SPAW_MS W TEJ SUMIE NIE MA i to nie jest przeoczenie: prototyp go do DUR
// nie wlicza, bo spawy zapalaja sie w trakcie przebiegu i dogasaja pod ogonem,
// a nie po nim.
export const CALOSC_MS =
  ROZPROSZENIE_MS + ROZSYP_MS + WEZEL_MS + KRAWEDZ_MS + OGON_MS;

// Trzy wartosci z listy rozwijanej prototypu (linie 296-300):
//   <option value="rtl">, <option value="ltr">, <option value="rand">
export const KIERUNKI = ["ltr", "rtl", "rand"];

// =============================================================================
//  zbudujHarmonogram(wezly, krawedzie, { kierunek, rand })
//
//  Trzy rzeczy, ktore w prototypie sa ukryte, a tutaj sa jawne:
//
//  1. LOSOWOSC WCHODZI PARAMETREM, nie przez Math.random w srodku. Funkcja
//     jest przez to czysta wzgledem swoich argumentow: ten sam rand daje ten
//     sam wynik. Test podaje atrape, produkcja nie podaje nic i dostaje
//     prawdziwy Math.random. GENERATORA NIE ZIARNUJEMY — rozsyp ma byc za
//     kazdym razem inny, a to jest wlasciwosc wizualna, ktorej nie zamieniamy
//     na wygode testu.
//
//  2. KOLEJNOSC WYWOLAN rand JEST CZESCIA KONTRAKTU. Na wezel przypadaja trzy
//     wywolania, dokladnie w tej kolejnosci: jitter (t0), ox, oy. Przy
//     kierunku innym niz "ltr" i "rtl" dochodzi czwarte, na k, PRZED jitterem.
//     Zmiana kolejnosci daje inny wynik przy tej samej atrapie i wywroci
//     testy — tak ma byc, bo to jedyne miejsce, w ktorym ta umowa jest
//     zapisana.
//
//  3. FUNKCJA NICZEGO NIE MUTUJE. Prototyp dopisuje t0/ox/oy prosto do wezlow
//     (n.t0 = ...). Tutaj wynikiem jest nowa struktura, a wejscie zostaje
//     nietkniete. Inaczej drugie montowanie w Strict Mode dostaloby dane juz
//     podeptane przez pierwsze.
//
//  NIEZNANY KIERUNEK RZUCA — I JEST TO ODSTEPSTWO OD PROTOTYPU. Prototyp
//  (linia 344) rozstrzyga kierunek trojargumentowym warunkiem: cokolwiek nie
//  jest "ltr" ani "rtl", losuje. Tam bylo to bezpieczne, bo dir przychodzil
//  z <select> o trzech ustalonych wartosciach (linie 296-300) i literowka nie
//  miala skad wejsc. Tutaj kierunek jest zwyklym parametrem podawanym z kodu,
//  a cicha zamiana na losowanie daje animacje, ktora wyglada PRAWIE dobrze —
//  czyli blad, ktory sam sie nie zglasza. Dlatego lista jest jawna, a wartosc
//  spoza niej huka od razu, przed policzeniem czegokolwiek.
//
//  Zwraca { wezly: [{ t0, ox, oy }], krawedzie: [{ t0 }], ostatniSzew }.
//  Oba porzadki sa takie same jak na wejsciu — wynik indeksuje sie tymi
//  samymi indeksami co WEZLY i KRAWEDZIE.
//
//  ostatniSzew to moment, w ktorym zapala sie OSTATNI spaw; helm czeka na
//  niego z rozjasnieniem. Gdy zaden wezel nie siega szwu, jest null zamiast
//  liczby — prototyp policzylby tu Math.max() z pustej listy, czyli
//  -Infinity, i podstawil to do przezroczystosci helmu.
// =============================================================================
export function zbudujHarmonogram(
  wezly,
  krawedzie,
  { kierunek = "rtl", rand = Math.random } = {},
) {
  if (!KIERUNKI.includes(kierunek)) {
    throw new Error(
      `Nieznany kierunek "${kierunek}". Dopuszczalne: ${KIERUNKI.join(", ")}.`,
    );
  }

  const xs = wezly.map(([x]) => x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);

  const wynikWezlow = wezly.map(([x]) => {
    // Prototyp, linia 344: "ltr" liczy od lewej, "rtl" od prawej, "rand"
    // rozsypuje wezly losowo.
    const postep = (x - lo) / (hi - lo);
    const k =
      kierunek === "ltr" ? postep : kierunek === "rtl" ? 1 - postep : rand();

    // Prototyp, linie 345-346. Trzy wywolania rand, kolejnosc jak w punkcie 2.
    const t0 = ROZPROSZENIE_MS + k * ROZSYP_MS + rand() * 140;
    const ox = -38 - rand() * 70;
    const oy = (rand() - 0.5) * 46;

    return { t0, ox, oy };
  });

  // Prototyp, linia 348: krawedz rusza po tym z dwoch koncow, ktory startuje
  // POZNIEJ — inaczej rysowalaby sie do wezla, ktorego jeszcze nie ma.
  const wynikKrawedzi = krawedzie.map(([a, b]) => ({
    t0: Math.max(wynikWezlow[a].t0, wynikWezlow[b].t0) + WEZEL_MS * 0.55,
  }));

  // Prototyp, linia 349. Szew to wezel stykajacy sie z helmem, czyli x >= SZEW_X.
  const czasySzwow = wezly
    .map(([x], i) => (x >= SZEW_X ? wynikWezlow[i].t0 : null))
    .filter((t) => t !== null);
  const ostatniSzew = czasySzwow.length
    ? Math.max(...czasySzwow) + WEZEL_MS
    : null;

  return { wezly: wynikWezlow, krawedzie: wynikKrawedzi, ostatniSzew };
}
