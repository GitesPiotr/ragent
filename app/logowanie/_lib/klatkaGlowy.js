// =============================================================================
//  KLATKA GLOWY — trzy male funkcje wyjete z goracej sciezki.
//
//  Reszta rysowania to zapisy atrybutow SVG, ktorych bez przegladarki sprawdzic
//  sie nie da. To, co da sie policzyc bez DOM-u, siedzi tutaj i ma testy —
//  bo akurat tu mieszkaja pomylki, ktorych oko nie zlapie: obciecie zakresu,
//  prog zapalenia, dzielenie przez zero.
// =============================================================================

// Prototyp, linia 360: ease=k=>1-Math.pow(1-k,3).
// Szescienne wyhamowanie: szybko rusza, miekko dochodzi.
export function zlagodzenie(k) {
  return 1 - Math.pow(1 - k, 3);
}

// Prototyp liczy to samo w czterech miejscach (linie 373, 381, 395):
// Math.max(0,Math.min(1,(t-t0)/czas)). Element jeszcze nie wszedl -> 0,
// juz wszedl -> 1, w trakcie -> ulamek.
export function postep(t, t0, czas) {
  return Math.max(0, Math.min(1, (t - t0) / czas));
}

// =============================================================================
//  nieprzezroczystoscHelmu(t, ostatniSzew) — tryb "end" z linii 366:
//    t < lastSeam ? .22 : Math.min(1, .22 + .78*(t-lastSeam)/500)
//
//  Helm siedzi przygaszony na 0,22, dopoki nie zapali sie ostatni spaw, i przez
//  kolejne 500 ms dochodzi do pelnej widocznosci. To jest cala choreografia
//  odslaniania: siatka najpierw sie zrasta, dopiero potem helm sie ujawnia.
//
//  TU SPLACAMY DLUG Z B1. zbudujHarmonogram zwraca ostatniSzew rowny null, gdy
//  ZADEN wezel nie siega szwu — swiadomie, zamiast -Infinity z Math.max([]),
//  ktore prototyp podstawilby wprost do przezroczystosci. Ale null przepuszczony
//  dalej jest niewiele lepszy: w JavaScripcie koerkuje sie w dzialaniu do zera,
//  wiec `t < null` jest falszywe od pierwszej klatki, a (t - null)/500 daje
//  t/500 — helm zaczalby sie rozjasniac natychmiast i cala choreografia
//  odslaniania przestalaby istniec po cichu.
//
//  Dlatego null jest obsluzony JAWNIE: brak szwow znaczy brak choreografii,
//  wiec helm jest od razu w pelni widoczny. Nie ma czego odslaniac.
// =============================================================================
export function nieprzezroczystoscHelmu(t, ostatniSzew) {
  if (ostatniSzew === null) return 1;
  if (t < ostatniSzew) return 0.22;
  return Math.min(1, 0.22 + (0.78 * (t - ostatniSzew)) / 500);
}

// =============================================================================
//  czyUsunacSpaw(t, t0Spawu, { zycie, czasTrwania })
//
//  Prototyp, linia 391: usuwa okrag, gdy postep wyszedl poza [0,1). Druga
//  galaz — koniec sceny — jest NOWA i jest calym sensem tej funkcji.
//
//  Spaw zapala sie, gdy wezel szwu dojdzie do 90% wejscia. Przy kierunku "ltr"
//  wezly szwu maja najwieksze x, wiec startuja jako ostatnie: zapalaja sie
//  okolo 3600 ms i zylyby do okolo 4220 ms, czyli DOKLADNIE tam, gdzie konczy
//  sie scena. Bez tego warunku ostatnie jeden do dwoch okregow nie zostaja
//  usuniete NIGDY — usuwanie dzieje sie w petli, a petla wlasnie stanela.
//  Zmierzone: po przebiegu zostawalo 1 albo 2, zaleznie od losowego jittera.
//
//  Prototyp ma te sama resztke i tylko ja maskuje: jego petla kreci sie dalej,
//  ale t stoi zamrozone na DUR(), wiec k sie nie zmienia i okrag wisi na
//  przezroczystosci rzedu dwoch setnych. Niewidoczny, ale obecny.
//
//  DLACZEGO TO JEST WAZNE, A NIE KOSMETYCZNE: w B5 wchodzi animacja raz na
//  sesje. Pierwsze wejscie gra pelne 4220 ms, kolejne wchodza od razu na
//  klatce koncowej. TE DWIE DROGI MUSZA DAC IDENTYCZNY OBRAZ. Spawy zostajace
//  po odegraniu, a nieobecne po wskoczeniu na koniec, robia z klatki koncowej
//  dwie rozne klatki — zaleznie od tego, czy uzytkownik odswiezyl strone.
//  Caly B5 stoi na tym niezmienniku.
//
//  Progu zapalania nie ruszamy: to wartosc zmierzona w prototypie.
// =============================================================================
export function czyUsunacSpaw(t, t0Spawu, { zycie, czasTrwania }) {
  const k = (t - t0Spawu) / zycie;
  return k >= 1 || k < 0 || t >= czasTrwania;
}
