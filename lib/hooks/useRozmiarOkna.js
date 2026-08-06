"use client";

import { useSyncExternalStore } from "react";

// =============================================================================
//  ROZMIAR VIEWPORTU JAKO ŹRÓDŁO WYMIARÓW PŁÓTNA
//
//  Trzeci brat useMotyw i useRedukcjaRuchu, z tego samego powodu: rozmiar okna
//  to stan żyjący POZA Reactem, a wariant z useState + useEffect wymagałby
//  setState w ciele efektu (react-hooks/set-state-in-effect).
//
//  DLACZEGO window, A NIE ELEMENT: patrz komentarz otwierający
//  app/kreator-rag/_lib/trybOkna.js. W skrócie — płótno leży w kontenerze,
//  więc mierzenie kontenera po to, żeby ustawić płótno, jest pętlą. Viewport
//  nie wie nic o treści strony i żaden nasz styl go nie ruszy.
//
//  SNAPSHOT MUSI BYĆ STABILNY REFERENCYJNIE. useSyncExternalStore porównuje
//  wynik getSnapshot przez Object.is i przy nowym obiekcie za każdym wywołaniem
//  wpada w nieskończoną pętlę renderów. Dlatego trzymamy ostatnią parę i
//  oddajemy DOKŁADNIE ten sam obiekt, dopóki liczby się nie zmieniły.
//
//  SSR oddaje zera — serwer nie ma viewportu, a zgadywanie dałoby rozjazd przy
//  hydratacji. wymiaryPlotnaWOknie() zamienia zera na klamrę minimalną, więc
//  pierwsza klatka ma sensowne płótno, a nie płótno o wymiarze ujemnym.
// =============================================================================

const NA_SERWERZE = Object.freeze({ szerokosc: 0, wysokosc: 0 });

let ostatni = NA_SERWERZE;

function odczytaj() {
  if (typeof window === "undefined") return NA_SERWERZE;
  const szerokosc = window.innerWidth;
  const wysokosc = window.innerHeight;
  if (ostatni.szerokosc === szerokosc && ostatni.wysokosc === wysokosc) return ostatni;
  ostatni = { szerokosc, wysokosc };
  return ostatni;
}

function naSerwerze() {
  return NA_SERWERZE;
}

function subskrybuj(powiadom) {
  window.addEventListener("resize", powiadom);
  // Obrót telefonu bywa zgłaszany osobno i nie zawsze razem z `resize`.
  window.addEventListener("orientationchange", powiadom);
  return () => {
    window.removeEventListener("resize", powiadom);
    window.removeEventListener("orientationchange", powiadom);
  };
}

// { szerokosc, wysokosc } — window.innerWidth/innerHeight, odświeżane przy zmianie.
export function useRozmiarOkna() {
  return useSyncExternalStore(subskrybuj, odczytaj, naSerwerze);
}
