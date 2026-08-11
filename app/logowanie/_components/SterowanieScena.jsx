"use client";

import { createContext, useContext, useRef } from "react";
import { usePodtrzymanieSceny } from "./ZegarSceny.jsx";

// =============================================================================
//  STEROWANIE SCENA — stan, ktory nie jest czasem.
//
//  Zegar mierzy czas i nic wiecej. Tutaj mieszka to, czym formularz logowania
//  steruje sceną: oko agenta i pierscien paskow. Prototyp robi to przez
//  window.HeadMesh i window.RAGentRing (linie 746, 785-786), czyli przez
//  globalne singletony — u nas idzie to przez kontekst.
//
//  WARTOSC KONTEKSTU JEST ZWYKLYM OBIEKTEM W ref, NIE STANEM REACTA. Gdyby
//  zapalenie oka szlo przez useState, przerenderowaloby cale poddrzewo sceny —
//  a Glowa, ZnakRAGent i Pierscien maja umowe, ze sie NIE przerenderowuja,
//  bo animacja mutuje im atrybuty, ktore React odtworzylby z JSX. Konsumenci
//  czytaja stad wartosci wewnatrz swoich klatek, nie przy renderowaniu.
// =============================================================================

const KontekstSterowania = createContext(null);

function utworzSterowanie(podtrzymaj) {
  // --- OKO ---
  let okoWlaczone = false;
  let pulsOd = -Infinity;
  let zwolnijKlatki = null;

  // --- PIERSCIEN ---
  // Wypelnia to komponent pierscienia przy montowaniu; do tego czasu sterowanie
  // istnieje, ale nie ma czym ruszac.
  let obslugaPierscienia = null;

  return {
    oko: {
      wlaczone: () => okoWlaczone,
      pulsOd: () => pulsOd,

      // Prototyp, linia 785: oko zapala sie OD RAZU po kliknieciu, nie po
      // odpowiedzi serwera. Puls liczy sie od tej chwili (linia 423).
      //
      // Zapalenie musi OBUDZIC petle. Klikniecie wypada zwykle dlugo po
      // zakonczeniu sceny, kiedy petla juz stoi — bez podtrzymania oko
      // zapalilo by sie w jednej klatce i nigdy nie zgaslo.
      zapal(teraz) {
        okoWlaczone = true;
        pulsOd = teraz;
        if (zwolnijKlatki === null) zwolnijKlatki = podtrzymaj();
      },

      // Prototyp, linia 746: przy niepowodzeniu oko gasnie.
      //
      // UCHWYTU TU NIE ZWALNIAMY. Wygaszanie wizjera jest wykladnicze
      // (eyeK dochodzi do jedynki przez kilkanascie klatek), wiec zatrzymanie
      // petli w tej chwili zostawiloby wizjer zapalony na zawsze — ta sama
      // klasa resztki, co spawy zostajace po przebiegu w B3. Uchwyt oddaje
      // dopiero Glowa, kiedy zobaczy, ze nie ma juz czego wygaszac.
      //
      // ZGASZENIE TEZ ZAMAWIA KLATKE. Przy zwyklym ruchu uchwyt jest juz
      // wziety z zapal() i to nic nie zmienia. Przy ruchu ograniczonym Glowa
      // oddaje go po JEDNEJ klatce, bo nie ma czego wygaszac — wiec w chwili
      // zgaszenia nikt by nie trzymal petli i wizjer zostalby zapalony
      // na zawsze. Ta sama klasa resztki, co spawy w B3.
      //
      // TO JUZ TRZECI RAZ TEN SAM WZORZEC W ETAPIE B: spawy zostajace po
      // przebiegu (B3), wizjer zatrzymany w polowie wygaszania (B5) i to.
      // Regula, ktora z tego wychodzi: KTO BIERZE UCHWYT, ODDAJE GO DOPIERO
      // PO SKONCZENIU SPRZATANIA, NIE PO OSTATNIEJ ZMIANIE WARTOSCI. Zmiana
      // wartosci jest poczatkiem dochodzenia do stanu spoczynkowego, nie
      // jego koncem.
      zgas() {
        okoWlaczone = false;
        if (zwolnijKlatki === null) zwolnijKlatki = podtrzymaj();
      },

      // Wola Glowa: „wizjer wrocil do spoczynku, nie potrzebuje wiecej klatek".
      oddajKlatki() {
        if (zwolnijKlatki !== null) {
          zwolnijKlatki();
          zwolnijKlatki = null;
        }
      },
    },

    pierscien: {
      // Rejestracja z komponentu pierscienia. Zwraca funkcje wyrejestrowujaca,
      // zeby odmontowanie nie zostawialo uchwytu do nieistniejacego DOM-u.
      zarejestruj(obsluga) {
        obslugaPierscienia = obsluga;
        return () => {
          if (obslugaPierscienia === obsluga) obslugaPierscienia = null;
        };
      },

      // Prototyp, linia 786: RAGentRing.run(cfg.minMs). Zwraca obietnice, zeby
      // dalo sie ja wpuscic do Promise.all razem z uwierzytelnieniem.
      // Gdy pierscienia nie ma (schowany, jeszcze niezamontowany), obietnica
      // spelnia sie od razu: brak animacji nie moze blokowac logowania.
      async uruchom(ms) {
        if (obslugaPierscienia === null) return;
        await obslugaPierscienia.uruchom(ms);
      },

      zeruj() {
        if (obslugaPierscienia !== null) obslugaPierscienia.zeruj();
      },
    },
  };
}

export function SterowanieScenaProvider({ children }) {
  const podtrzymaj = usePodtrzymanieSceny();

  const ref = useRef(null);
  if (ref.current === null) ref.current = utworzSterowanie(podtrzymaj);

  return (
    <KontekstSterowania.Provider value={ref.current}>
      {children}
    </KontekstSterowania.Provider>
  );
}

export function useSterowanieScena() {
  const sterowanie = useContext(KontekstSterowania);
  if (sterowanie === null) {
    throw new Error(
      "useSterowanieScena wymaga <SterowanieScenaProvider> wyzej w drzewie (app/logowanie/page.js).",
    );
  }
  return sterowanie;
}
