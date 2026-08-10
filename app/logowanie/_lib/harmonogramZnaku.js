import {
  KRAWEDZ_MS,
  ROZPROSZENIE_MS,
  ROZSYP_MS,
  WEZEL_MS,
} from "./harmonogram.js";

// =============================================================================
//  HARMONOGRAM NAPISU — czasy obrysu „RAGent", same liczby.
//
//  Prototyp, linie 458-465. Wszystko jest tam WYPROWADZONE z czasow glowy,
//  a nie wpisane, i tak zostaje: obrys jedzie od lewej do prawej dokladnie tak
//  dlugo, jak narasta siatka, a rozblysk i zamiana na tekst wypadaja razem
//  z domknieciem helmu. Prototyp czyta te liczby z window.HEAD_TIMING —
//  u nas wchodza importem, wiec nie ma jak sie rozjechac.
// =============================================================================

// prototyp: START = T.SCAT_IN. Obrys rusza po wejsciu rozproszenia.
export const START_MS = ROZPROSZENIE_MS;

// prototyp: BUILD = SCAT_IN+SPREAD+NODE_IN+EDGE_IN. Moment domkniecia siatki.
// To NIE jest CALOSC_MS: tam dochodzi jeszcze OGON_MS, ktorego napis nie widzi.
export const BUDOWA_MS = ROZPROSZENIE_MS + ROZSYP_MS + WEZEL_MS + KRAWEDZ_MS;

// prototyp: DRAW = T.SPREAD. Ten sam przelot z lewej na prawo co siatka.
export const PRZELOT_MS = ROZSYP_MS;

// prototyp: SEGMENT = Math.round(260*T.SPREAD/1200). Ile trwa wejscie
// pojedynczego punktu obrysu. 260 i 1200 to proporcja z prototypu — przy
// SPREAD = 2400 wychodzi dokladnie dwa razy 260.
export const ODCINEK_MS = Math.round((260 * ROZSYP_MS) / 1200);

// prototyp: FLASH = BUILD-260-START. Rozblysk tuz przed rozplynieciem.
// Czasy ponizej sa liczone WZGLEDEM STARTU NAPISU, nie sceny — dlatego
// odejmuje sie START.
export const ROZBLYSK_MS = BUDOWA_MS - 260 - START_MS;

// prototyp: FADE = BUILD-60-START. Poczatek zamiany obrysu na tekst.
export const ZANIK_MS = BUDOWA_MS - 60 - START_MS;

// prototyp: FADE_MS = 420. Ile trwa sama zamiana.
export const ZANIK_TRWA_MS = 420;

const obetnij = (v, a, b) => Math.max(a, Math.min(b, v));

// =============================================================================
//  Trzy funkcje z goracej sciezki, wyjete zeby dalo sie je sprawdzic.
// =============================================================================

// Prototyp, linie 578-581 (funkcja at wewnatrz frame). k to pozycja pozioma
// punktu w zakresie 0..1, czyli jego kolejnosc w przelocie.
//
// ZWRACA null, A NIE ZERO, PRZED STARTEM PUNKTU. Prototyp opiera na tym rysowanie
// (`if(!at(A) || !at(B)) return`), wiec roznica miedzy zerem a null jest tu
// roznica miedzy "nie rysuj" a "narysuj przezroczyste".
export function postepPunktu(t, k) {
  const post = obetnij((t - k * PRZELOT_MS) / ODCINEK_MS, 0, 1);
  return post <= 0 ? null : post;
}

// Prototyp, linia 583. 0 — widac obrys, 1 — widac tekst.
export function zanik(t) {
  return obetnij((t - ZANIK_MS) / ZANIK_TRWA_MS, 0, 1);
}

// Prototyp, linia 589. Iloczyn dwoch ramp: jedna narasta od ROZBLYSK_MS,
// druga opada do ZANIK_MS + 50. Poza tym oknem wychodzi zero.
export function rozblysk(t) {
  return (
    obetnij((t - ROZBLYSK_MS) / 220, 0, 1) *
    obetnij((ZANIK_MS + 50 - t) / 220, 0, 1)
  );
}
