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
//  PROG LOGOWANIA — 600 ms zamiast 2000 z prototypu.
//
//  Prototyp trzyma pierscien w ruchu minimum dwie sekundy (cfg.minMs, uzyte
//  w linii 786), nawet gdy Supabase odpowie w 200 ms. To 1,8 sekundy sztucznej
//  zwloki przy KAZDYM logowaniu — podatek placony codziennie, zeby animacja
//  zdazyla sie pokazac.
//
//  PROG JEST DOLNA GRANICA, NIE DODATKIEM. Prototyp puszcza pierscien
//  i uwierzytelnienie ROWNOLEGLE przez Promise.all (linie 786-790), wiec
//  logowanie trwa tyle, ile dluzsze z dwojga. Przy odpowiedzi w 200 ms czekamy
//  600 ms, przy odpowiedzi w 900 ms — 900 ms, a nie 1500.
//
//  Dlaczego prog w ogole zostaje: bez niego pierscien mrugnalby i zniknal,
//  a przy bledzie uzytkownik nie zdazylby zobaczyc, ze cokolwiek sie stalo.
// =============================================================================
export const PROG_LOGOWANIA_MS = 600;

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
