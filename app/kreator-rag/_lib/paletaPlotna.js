// =============================================================================
//  PALETA PŁÓTNA — ODCZYTANA Z CSS, NIE ZDUPLIKOWANA W JS
//
//  Do rundy 1 kolory płótna żyły w stałej PALETA w MapaFragmentow.jsx
//  i GrafWiedzy.jsx — w DWÓCH kopiach, co do znaku identycznych. Dołożenie
//  motywu ciemnego zrobiłoby z tego cztery zestawy do utrzymania. Runda 1
//  wystawiła je jako zmienne CSS w .panel (kreator-rag.module.css), ta funkcja
//  je stamtąd czyta.
//
//  ŹRÓDŁO PRAWDY JEST W CSS, i to nie z wygody: zmienne i tak muszą tam być,
//  bo maluje z nich tło pod płótnem (.mapa-obudowa). Trzymanie drugiego
//  zestawu w JS znaczyłoby, że tło i punkty mają dwa różne źródła jednego
//  motywu — czyli dokładnie ten rozjazd, który ta runda usuwa.
//
//  ODCZYT JEST ZDARZENIOWY, NIE KLATKOWY. getComputedStyle wymusza obliczenie
//  stylu i potrafi kosztować ułamek milisekundy — w pętli rysowania byłoby to
//  60 wywołań na sekundę za każdym płótnem. Wołający ma to wywołać RAZ, przy
//  zmianie motywu, i trzymać wynik (patrz efekt przy `useMotyw` w obu
//  komponentach).
// =============================================================================

// Nazwy tokenów płótna. Kolejność bez znaczenia — trzymane listą, żeby dodanie
// koloru było jedną linią tutaj, a nie trzema w trzech plikach.
const TOKENY = {
  siatka: "--plotno-siatka",
  podpis: "--plotno-podpis",
  wyroznienie: "--plotno-wyroznienie",
  obrysPodpisu: "--plotno-obrys-podpisu",
  przygaszony: "--plotno-przygaszony",
  most: "--plotno-most",
  fallback: "--plotno-fallback",
};

export const LICZBA_DOKUMENTOW = 10;

// ZAPASOWA = wartości jasne, te same co w .panel. Wchodzi, gdy odczyt nie ma
// z czego skorzystać: przed zamontowaniem, w teście bez DOM, albo gdyby ktoś
// usunął zmienną z arkusza. Lepszy jasny punkt na jasnym tle niż `fillStyle`
// ustawiony pustym napisem, który canvas cicho zignoruje i pomaluje na czarno.
export const ZAPASOWA = {
  siatka: "rgba(24, 24, 27, 0.05)",
  podpis: "#3f3f46",
  wyroznienie: "#18181b",
  obrysPodpisu: "rgba(255, 255, 255, 0.85)",
  przygaszony: "#a1a1aa",
  most: "#b45309",
  fallback: "#71717a",
  dokumenty: [
    "#2563eb", "#166534", "#c026d3", "#0891b2", "#db2777",
    "#4d7c0f", "#5b21b6", "#0d9488", "#dc2626", "#475569",
  ],
};

// =============================================================================
//  BRAMKA NA MOTYWIE — PAMIĘĆ NA POZIOMIE MODUŁU, NIE W REFIE KOMPONENTU
//
//  Paleta jest potrzebna także w `useMemo` (kolor krawędzi to ŚREDNIA kolorów
//  obu końców, więc przy zmianie motywu trzeba ją przeliczyć, a nie przetłumaczyć
//  gotowy hex). Pamięć trzymana w `useRef` znaczyłaby czytanie refa w trakcie
//  renderu — czyli `react-hooks/refs`. Pamięć modułowa nie ma tego problemu
//  i przy okazji jest WSPÓLNA dla mapy i grafu: oba płótna siedzą w tym samym
//  `.panel`, więc czytałyby te same wartości dwa razy.
//
//  Klucz to sam motyw. Zmiana motywu daje inny klucz, więc odczyt leci raz
//  na motyw, a nie raz na klatkę — o to w całej tej bramce chodzi.
//
//  BRAK ELEMENTU NIE TRAFIA DO PAMIĘCI. Przed zamontowaniem nie ma z czego
//  czytać; zapisanie wtedy zestawu zapasowego zamroziłoby go dla tego motywu
//  na resztę życia strony.
// =============================================================================
const pamiec = new Map();

export function paletaDlaMotywu(motyw, element) {
  if (!element) return ZAPASOWA;
  const klucz = String(motyw);
  if (!pamiec.has(klucz)) pamiec.set(klucz, paletaPlotna(element));
  return pamiec.get(klucz);
}

// Wyłącznie dla testów i diagnostyki: pozwala wymusić ponowny odczyt.
export function zapomnijPalety() {
  pamiec.clear();
}

// element: dowolny węzeł WEWNĄTRZ .panel — zmienne dziedziczą się w dół, więc
// wystarczy korzeń komponentu mapy albo grafu.
export function paletaPlotna(element) {
  if (!element || typeof window === "undefined" || !window.getComputedStyle) {
    return ZAPASOWA;
  }
  const styl = window.getComputedStyle(element);
  const czytaj = (nazwa, zapas) => {
    const v = styl.getPropertyValue(nazwa).trim();
    return v || zapas;
  };

  const out = {};
  for (const [pole, zmienna] of Object.entries(TOKENY)) {
    out[pole] = czytaj(zmienna, ZAPASOWA[pole]);
  }
  out.dokumenty = [];
  for (let i = 0; i < LICZBA_DOKUMENTOW; i++) {
    out.dokumenty.push(czytaj(`--dokument-${i}`, ZAPASOWA.dokumenty[i]));
  }
  return out;
}

// =============================================================================
//  KOLOR DOKUMENTU — NADPISANIE PO INDEKSIE, BEZ RUSZANIA RDZENIA
//
//  ROZSTRZYGNIĘCIE, KTÓRE STOI ZA TĄ FUNKCJĄ: `lib/rag/map.js` przypisuje
//  kolory po indeksie dokumentu (kolorDokumentu(i), map.js:87) i wysyła je
//  w `documents[].color`. Sekcja 3 SPEC mówi, że rdzeń nie zna Reacta ani
//  przeglądarki — a motyw jest pojęciem interfejsu. Dołożenie tam parametru
//  `motyw` wpuściłoby wiedzę o AIDEAS do warstwy, która ma jej nie mieć;
//  trzymanie tam DRUGIEJ tablicy dawałoby trzecie miejsce z tą samą paletą,
//  obok CSS i obok tej funkcji.
//
//  Dlatego rdzeń zostaje NIETKNIĘTY, a kolor podmienia interfejs — po tym
//  samym indeksie, którego użył serwer.
//
//  INDEKS BIERZE SIĘ Z POZYCJI W TABLICY i to jest jedyne miejsce, które o tym
//  wie. Kontrakt: `getMapData` buduje `documents` przez .map((d, i) => …)
//  po zapytaniu posortowanym `created_at ascending` (lib/rag/map.js:430-439),
//  a `lib/rag/graph.js:140` robi to samo. Pozycja w tablicy JEST więc
//  indeksem koloru. Gdyby któraś z tych stron zaczęła sortować inaczej,
//  dokumenty zmieniłyby kolory przy przełączeniu motywu — dlatego parzystość
//  obu palet pilnuje test (paletaPlotna.test.js).
//
//  MODULO JAK W RDZENIU: kolorDokumentu robi `index % PALETA.length`, więc
//  przy jedenastym dokumencie kolory zaczynają się powtarzać. Tutaj musi być
//  tak samo, inaczej jedenasty dokument miałby inny kolor w każdym motywie.
// =============================================================================
export function koloryDokumentow(documents, paleta) {
  const lista = (paleta && paleta.dokumenty) || ZAPASOWA.dokumenty;
  const mapa = new Map();
  (documents || []).forEach((d, i) => {
    // `d.color` jako ostatnia deska ratunku: gdyby lista z CSS była krótsza,
    // niż zakłada LICZBA_DOKUMENTOW, wolimy kolor z serwera niż `undefined`.
    mapa.set(d.id, lista[i % lista.length] || d.color);
  });
  return mapa;
}
