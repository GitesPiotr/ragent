"use client";

import { useSyncExternalStore } from "react";

// =============================================================================
//  MOTYW EFEKTYWNY DLA KODU, KTÓRY NIE JEST CSS-em
//
//  PO CO TO ISTNIEJE: canvas nie ma kaskady. `ctx.fillStyle` przyjmuje gotową
//  wartość, więc `var(--tekst)` byłoby dla niego napisem bez znaczenia. Płótno
//  mapy i grafu musi więc DOWIEDZIEĆ SIĘ, jaki motyw obowiązuje, i przemalować
//  się samo. To jest jedyny most między motywem a JavaScriptem w tej aplikacji.
//
//  DLACZEGO NIE `useSettings().settings.theme`: tamto oddaje PREFERENCJĘ
//  („light" | „dark" | „auto"), a nie motyw EFEKTYWNY. Przy „auto" z tej
//  wartości nie da się wyprowadzić, czy malować jasno, czy ciemno.
//  („auto" przestało być domyślne — domyślny jest „dark", patrz
//  lib/settings/defaults.js — ale pozostaje wyborem do zaznaczenia,
//  więc ta ścieżka jest tak samo potrzebna jak wcześniej.)
//
//  DWA ŹRÓDŁA, BO JEDNO NIE WYSTARCZA:
//   • atrybut `data-theme` na <html> — ustawia go applyTheme przy wymuszeniu
//     (lib/settings/SettingsContext.js:28),
//   • `prefers-color-scheme` — bo przy „auto" applyTheme atrybut ZDEJMUJE
//     (SettingsContext.js:30) i głos oddaje systemowi.
//  Bez drugiego źródła płótno zostawałoby jasne u każdego, kto nigdy nie
//  dotknął przełącznika, a system ma ciemny. Reguła rozstrzygania jest
//  dokładnie ta z CSS: atrybut wygrywa, jego brak oddaje głos systemowi.
//
//  DLACZEGO useSyncExternalStore, A NIE useState + useEffect: motyw to stan
//  ŻYJĄCY POZA REACTEM (atrybut w DOM plus preferencja przeglądarki), czyli
//  podręcznikowy przypadek dla tego haka. Wariant z `useState` wymagałby
//  `setState` w ciele efektu przy pierwszym odczycie — czyli kaskadowego
//  renderu i błędu `react-hooks/set-state-in-effect`, którego w tym repo
//  jest już dwanaście i nie dokładamy trzynastego.
//
//  SSR: `getServerSnapshot` oddaje JASNY. Serwer nie zna ani atrybutu, ani
//  preferencji przeglądarki, a zgadywanie dałoby rozjazd przy hydratacji.
//  Pierwsza klatka po stronie klienta bierze już wartość prawdziwą.
// =============================================================================

export const MOTYW = { JASNY: "jasny", CIEMNY: "ciemny" };

// Odczyt jest TANI I SYNCHRONICZNY — czyta atrybut i gotowe dopasowanie media
// query. React woła go przy każdym renderze, więc nie wolno tu nic liczyć.
function odczytaj() {
  if (typeof document === "undefined") return MOTYW.JASNY;
  const atrybut = document.documentElement.getAttribute("data-theme");
  if (atrybut === "dark") return MOTYW.CIEMNY;
  if (atrybut === "light") return MOTYW.JASNY;
  // Brak atrybutu = „auto". Głos ma system.
  if (typeof window === "undefined" || !window.matchMedia) return MOTYW.JASNY;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? MOTYW.CIEMNY
    : MOTYW.JASNY;
}

function naSerwerze() {
  return MOTYW.JASNY;
}

// Subskrypcja obu źródeł naraz. React woła to raz i dostaje jedną funkcję
// sprzątającą — obie subskrypcje zdejmowane są razem, więc nie da się
// zostawić jednej wiszącej.
function subskrybuj(powiadom) {
  const obserwator = new MutationObserver(powiadom);
  obserwator.observe(document.documentElement, {
    attributes: true,
    // WYŁĄCZNIE ten jeden atrybut. Bez filtra obserwator budziłby się przy
    // każdej zmianie klasy na <html> — a Next.js rusza tam swoje.
    attributeFilter: ["data-theme"],
  });

  const zapytanie = window.matchMedia("(prefers-color-scheme: dark)");
  zapytanie.addEventListener("change", powiadom);

  return () => {
    obserwator.disconnect();
    zapytanie.removeEventListener("change", powiadom);
  };
}

// Zwraca MOTYW.JASNY albo MOTYW.CIEMNY. Zmiana wartości przerenderuje
// komponent — to na niej wiesza się przemalowanie płótna.
export function useMotyw() {
  return useSyncExternalStore(subskrybuj, odczytaj, naSerwerze);
}
