// =============================================================================
//  PIERSCIEN PASKOW — liczby, zero DOM-u.
//
//  Prototyp, linie 664-701 (RAGentRing). Geometria kresek siedzi w JSX
//  komponentu, bo jest stala; tutaj zostaje to, co zmienia sie w trakcie
//  logowania.
// =============================================================================

// Prototyp, linia 666: N = 48.
export const KRESEK = 48;

// =============================================================================
//  PROG LOGOWANIA — 2000 ms, wartosc z prototypu (cfg.minMs, linia 726).
//
//  BYLO TU 600 I ZOSTALO COFNIETE. Odstepstwo bylo swiadome: prototyp trzyma
//  pierscien w ruchu minimum dwie sekundy nawet wtedy, gdy Supabase odpowie
//  w 200 ms, wiec skrocenie progu oszczedzalo okolo 1,2 sekundy przy KAZDYM
//  logowaniu. Zmierzone 629 ms okazalo sie jednak za krotkie, zeby przebieg
//  pierscienia byl w ogole widoczny — a animacja, ktorej nie widac, nie placi
//  za swoja cene. Zostaje wartosc zrodlowa.
//
//  PROG JEST DOLNA GRANICA, NIE DODATKIEM. Pierscien i uwierzytelnienie ida
//  ROWNOLEGLE przez Promise.all (prototyp, linie 786-790), wiec logowanie trwa
//  tyle, ile dluzsze z dwojga: przy odpowiedzi w 200 ms czekamy 2000 ms, przy
//  odpowiedzi w 2500 ms — 2500 ms, a nie 4500. Zmierzone przy progu 600:
//  narzut ponad prog wynosil 29 ms.
//
//  Dlaczego prog w ogole istnieje: bez niego pierscien mrugnalby i zniknal,
//  a przy bledzie uzytkownik nie zdazylby zobaczyc, ze cokolwiek sie stalo.
// =============================================================================
export const PROG_LOGOWANIA_MS = 2000;

// =============================================================================
//  ileSwiecacych(postep, kresek)
//
//  Prototyp, linie 682-685: `bars[i].classList.toggle('on', i/N < p)` przy
//  postepie obcietym do [0,1]. Zapisane tak samo, warunek po warunku, zamiast
//  przez zaokraglenie — rownowaznik z Math.ceil rozni sie na wartosciach,
//  gdzie p*N wypada dokladnie na calkowitej, a to sa akurat te wartosci,
//  ktore widac na ekranie.
// =============================================================================
export function ileSwiecacych(postep, kresek = KRESEK) {
  const p = Math.max(0, Math.min(1, postep));
  let ile = 0;
  for (let i = 0; i < kresek; i += 1) {
    if (i / kresek < p) ile += 1;
  }
  return ile;
}
