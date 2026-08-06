"use client";

import { useSyncExternalStore } from "react";

// =============================================================================
//  prefers-reduced-motion DLA KODU, KTÓRY NIE JEST CSS-em
//
//  CSS radzi sobie sam — arkusz panelu ma już @media (prefers-reduced-motion:
//  reduce) i wyłącza nim puls kropki „na żywo". Ale animacja na płótnie żyje
//  w JavaScripcie: to pętla klatek i wartości `globalAlpha`, których żadna
//  reguła CSS nie dosięgnie. Stąd ten hak, bliźniak useMotyw.
//
//  useSyncExternalStore z tego samego powodu co tam: preferencja to stan
//  żyjący poza Reactem, a wariant z useState + useEffect wymagałby setState
//  w ciele efektu (react-hooks/set-state-in-effect).
//
//  SSR oddaje `false` — serwer nie zna preferencji przeglądarki, a zgadywanie
//  dałoby rozjazd przy hydratacji.
// =============================================================================

const ZAPYTANIE = "(prefers-reduced-motion: reduce)";

function odczytaj() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(ZAPYTANIE).matches;
}

function naSerwerze() {
  return false;
}

function subskrybuj(powiadom) {
  const mq = window.matchMedia(ZAPYTANIE);
  mq.addEventListener("change", powiadom);
  return () => mq.removeEventListener("change", powiadom);
}

// true = użytkownik prosi o mniej ruchu.
export function useRedukcjaRuchu() {
  return useSyncExternalStore(subskrybuj, odczytaj, naSerwerze);
}
