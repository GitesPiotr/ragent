"use client";

import { useSearchParams } from "next/navigation";
import { Sidebar } from "./Sidebar";

// =============================================================================
//  SIDEBAR POZA TRYBEM OKNA
//
//  Tryb okna (?okno=1) to jedyny przypadek, w którym nawigacja obszaru roboczego
//  nie ma po co istnieć: okno otwiera się PO TO, żeby oglądać mapę, a 220 px na
//  linki, do których się z niego nie sięga, zabiera je mapie. Na dokładkę
//  przycisk „Wyloguj się" wypada wtedy poza dolną krawędź i widać go przyciętego.
//
//  DLACZEGO TO NIE JEST WARUNEK W LAYOUCIE — pytanie zadane wprost, więc i
//  odpowiedź wprost: layouty nie re-renderują się przy nawigacji i NIE MAJĄ
//  dostępu do search params. Dokumentacja mówi to jednym zdaniem
//  (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
//  layout.md:180): „Layouts do not rerender on navigation, so they cannot access
//  search params which would otherwise become stale". Layout /kreator-rag jest
//  komponentem serwerowym i tego parametru po prostu nie zobaczy.
//
//  ODRZUCONE WARIANTY, ŻEBY NIE WRACAŁY:
//   • cały layout na 'use client' — działa, ale bariera Suspense obejmuje wtedy
//     CAŁY layout na wszystkich podstronach /kreator-rag, a trzy z nich są
//     statyczne (/kreator-rag, /kolekcje, /diagnostyka). Płacą wszystkie,
//     korzysta jedna.
//   • grupa routingu — grupy rozróżniają ŚCIEŻKĘ, nie query. Wymagałaby
//     porzucenia ?okno=1 na rzecz osobnej trasy.
//   • CSS :has() — działa, ale sprzęga arkusz layoutu z atrybutem strony
//     i zostawia Sidebar w drzewie: robi wtedy zbędny fetch po e-mail
//     w oknie, które służy wyłącznie do oglądania mapy.
//
//  ZERO MIGNIĘCIA — ZMIERZONE, NIE ZAŁOŻONE. Trasa mapy jest dynamiczna (ƒ),
//  więc useSearchParams działa już na serwerze: HTML dla ?okno=1 nie zawiera
//  ani <h1>, ani okruszków, a wersja bez parametru zawiera oba. Sidebar znika
//  więc w HTML-u, nie po hydratacji.
// =============================================================================

export function SidebarObszaru() {
  return useSearchParams().get("okno") === "1" ? null : <Sidebar />;
}
