// Nagłówki rankingowe OpenRoutera + strażnik ich poprawności.
//
// DLACZEGO OSOBNY PLIK, A NIE STAŁE W openrouter.js:
// żeby dało się je przetestować BEZ SIECI I BEZ BUNDLERA. `openrouter.js`
// importuje `@/lib/tools`, a alias `@/` rozwiązuje Next, nie goły runner
// `node --test` — test importujący tamten plik wywraca się na
// ERR_MODULE_NOT_FOUND, zanim dojdzie do sprawdzenia czegokolwiek.
// Ten moduł nie importuje niczego, więc test może go wziąć wprost.

// ================================================================================
//  X_TITLE MUSI BYĆ CZYSTYM ASCII — i to nie jest przesada stylistyczna.
//
//  Nagłówek HTTP przenosi BAJTY, nie tekst. `fetch` odrzuca wartość ze znakiem
//  spoza Latin-1 wyjątkiem TypeError („Invalid value”), który w openrouter.js
//  wpada w ten sam blok `catch` co awaria połączenia i wraca do użytkownika
//  jako „Nie można połączyć się z API OpenRouter. Sprawdź połączenie
//  z internetem.". Diagnoza idzie wtedy w stronę routera i firewalla,
//  a przyczyną jest jeden znak w stałej poniżej.
//
//  Zdarzyło się to raz. Dlatego wartości pilnuje TEST (openrouter.test.js),
//  a nie czyjeś oko: różnicy między "-" (U+002D) a "—" (U+2014) w przeglądzie
//  kodu po prostu nie widać.
// ================================================================================
export const OPENROUTER_TITLE = "AIdeas";
export const OPENROUTER_REFERER = "https://aideas.local";

// Czy wartość nadaje się na nagłówek HTTP — wyłącznie drukowalne ASCII
// (0x20-0x7E). Węziej niż wymaga sam protokół, i celowo: wszystko powyżej
// 0x7E jest albo błędem, albo czymś, czego i tak nie chcemy wysyłać.
export function czyBezpieczneDlaNaglowka(wartosc) {
  return typeof wartosc === "string" && /^[\x20-\x7E]*$/.test(wartosc);
}
