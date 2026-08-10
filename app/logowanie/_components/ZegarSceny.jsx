"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { CALOSC_MS } from "../_lib/harmonogram.js";
import { utworzSilnik } from "../_lib/silnikZegara.js";

// =============================================================================
//  JEDEN ZEGAR NA CALA SCENE — powloka nad silnikiem z _lib/silnikZegara.js.
//
//  Ten plik nie ma wlasnej logiki cyklu zycia. Trzyma silnik w ref, podaje mu
//  prawdziwe funkcje przegladarki, wystawia kontekst i hook. Cala reszta —
//  warunek stopu, sprzatanie, idempotencja wobec Strict Mode, klatka dla
//  spoznionego subskrybenta — siedzi w silniku i jest przetestowana sucho.
//
//  Po commicie B2 NIC SIE NIE ANIMUJE: zaden komponent jeszcze nie subskrybuje,
//  a petla bez subskrybentow nie rusza. To jest celowe.
//
//  DWIE RZECZY, KTORE MUSZA ZOSTAC W TYM PLIKU:
//
//  1. SUBSKRYBENCI NIE PRZECHODZA PRZEZ STAN REACTA. Zegar tyka 60 razy na
//     sekunde; przepuszczony przez useState dalby 60 przerenderowan calego
//     poddrzewa na sekunde. Subskrybenci mutuja atrybuty SVG przez wlasne
//     referencje — React o tej animacji nie ma prawa wiedziec.
//
//  2. ZERO DOSTEPU DO window I document NA POZIOMIE MODULU. /logowanie jest
//     prerenderowane jako STATIC przy npm run build, wiec siegniecie po
//     document przy wejsciu do modulu wysypuje BUDOWANIE, nie tryb
//     deweloperski, czyli najpozniej, jak sie da. Funkcje podawane silnikowi
//     ponizej sa tworzone przy renderze, ale WOLANE dopiero z efektow —
//     ani requestAnimationFrame, ani matchMedia nie jest dotykane wczesniej.
// =============================================================================

const KontekstZegara = createContext(null);

// Prototyp, linie 441-442: to samo pytanie zadane w try/catch, z komentarzem
// "nie wolno przerwać startu pętli". Powod jest ten sam: matchMedia potrafi nie
// istniec w nietypowym srodowisku, a brak preferencji nie jest bledem.
function czyRuchOgraniczony() {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

// ZNACZNIK SESJI. Przezywa odswiezenie strony, ginie razem z karta — dokladnie
// tyle, ile trzeba, zeby animacja zagrala raz na wizyte, a nie przy kazdym
// wejsciu na ekran logowania.
const KLUCZ_SESJI = "ragent:animacja-logowania";

// KAZDY DOSTEP W try/catch. sessionStorage potrafi rzucic w trybie prywatnym
// i przy zablokowanych ciasteczkach. Wlasciwym zachowaniem jest wtedy ZAGRAC
// animacje, a nie wywalic ekran logowania: przy odczycie zwracamy falsz,
// przy zapisie milczymy.
function czyZagraneWTejSesji() {
  try {
    return window.sessionStorage.getItem(KLUCZ_SESJI) === "1";
  } catch {
    return false;
  }
}

function zapiszZagrane() {
  try {
    window.sessionStorage.setItem(KLUCZ_SESJI, "1");
  } catch {
    // Nie ma sie nad czym zatrzymywac: najgorsze, co z tego wyniknie, to
    // animacja zagrana drugi raz.
  }
}

export function ZegarScenyProvider({ czasTrwania = CALOSC_MS, children }) {
  // Silnik powstaje raz, przy pierwszym renderze — nie w efekcie, bo efekty
  // dzieci biegna PRZED efektem rodzica i subskrybenci musza miec sie do czego
  // podpiac.
  const silnikRef = useRef(null);
  if (silnikRef.current === null) {
    silnikRef.current = utworzSilnik({
      czasTrwania,
      zaplanujKlatke: (naKlatke) => requestAnimationFrame(naKlatke),
      anulujKlatke: (id) => cancelAnimationFrame(id),
      teraz: () => performance.now(),

      // DWA POWODY POMINIECIA PRZEBIEGU I NIE WOLNO ICH ZLEWAC W JEDEN.
      //
      //   RUCH OGRANICZONY — uzytkownik prosil system o mniej animacji.
      //   ZNACZNIK SESJI  — animacja juz w tej karcie zagrala.
      //
      // Dzis oba prowadza do tego samego: scena startuje od klatki koncowej.
      // Ale w B6 ruch ograniczony zdejmie TAKZE prog logowania,
      // a znacznik sesji nie ma z progiem nic wspolnego. Zlane w jedno pojecie
      // rozjada sie dokladnie wtedy.
      pominPrzebieg: () => czyRuchOgraniczony() || czyZagraneWTejSesji(),

      // ZNACZNIK STAWIAMY PO ZAKONCZENIU PRZEBIEGU, NIGDY PRZY MONTOWANIU.
      // Postawiony przy montowaniu zostalby zapisany przy PIERWSZYM montowaniu
      // Strict Mode i odczytany przy DRUGIM, wiec animacja nie zagralaby ani
      // razu w trybie deweloperskim. To nie jest teoretyczne: pomiary z B4
      // pokazaly, ze przy nawigacji klientowej licznik montowan rosnie o dwa
      // na kazde wejscie.
      poZakonczeniu: zapiszZagrane,
    });
  }

  useEffect(() => {
    const silnik = silnikRef.current;
    silnik.start();
    return () => silnik.stop();
  }, []);

  return (
    <KontekstZegara.Provider value={silnikRef.current}>
      {children}
    </KontekstZegara.Provider>
  );
}

// =============================================================================
//  useKlatka(naKlatke)
//
//  naKlatke dostaje (t, now, czasTrwania):
//
//    t            — czas sceny z zegara; z niego liczy sie postep
//    now          — surowy znacznik z rAF; z niego licza sie oscylacje
//                   rozproszenia (prototyp, linie 374-377). Prototyp potrzebuje
//                   obu, bo jedno stoi razem ze scena, a drugie tyka zawsze.
//    czasTrwania  — dlugosc calej sceny
//
//  TRZECI ARGUMENT WYGLADA NA NADMIAROWY I NIE JEST. Subskrybent, ktory wezmie
//  dlugosc sceny z importu zamiast od zegara, rozjedzie sie po cichu w chwili,
//  gdy provider dostanie inna dlugosc niz domyslna. Glowa uzywa jej do
//  domykania spawow na koncu przebiegu (czyUsunacSpaw), wiec rozjazd oznacza
//  okregi zostajace na ekranie — bez jednego bledu w konsoli. Zegar zna te
//  liczbe, wiec ma ja podac; nikt nie ma jej zgadywac.
// =============================================================================
// =============================================================================
//  usePodtrzymanieSceny()
//
//  Zwraca podtrzymaj() z silnika: uchwyt, ktory trzyma petle przy zyciu, gdy
//  scena juz sie skonczyla. Potrzebuja tego rzeczy, ktore dzieja sie PO
//  animacji i nie sa jej czescia — oko agenta i pierscien logowania.
//  Szczegoly i uzasadnienie, dlaczego nie ma tu drugiej petli rAF, przy samym
//  podtrzymaj() w _lib/silnikZegara.js.
// =============================================================================
export function usePodtrzymanieSceny() {
  const silnik = useContext(KontekstZegara);
  if (silnik === null) {
    throw new Error(
      "usePodtrzymanieSceny wymaga <ZegarScenyProvider> wyzej w drzewie.",
    );
  }
  return silnik.podtrzymaj;
}

export function useKlatka(naKlatke) {
  const silnik = useContext(KontekstZegara);

  // Uchwyt w ref, zeby zmiana tozsamosci funkcji — czyli kazdy render rodzica —
  // nie odpinala i nie przypinala subskrypcji.
  const uchwyt = useRef(naKlatke);
  uchwyt.current = naKlatke;

  if (silnik === null) {
    // Brak providera oznacza scene, ktora sie nie animuje i nigdzie tego nie
    // zglasza. Wolimy huk przy pierwszym renderze niz nieruchomy ekran, ktory
    // wyglada prawie dobrze.
    throw new Error(
      "useKlatka wymaga <ZegarScenyProvider> wyzej w drzewie (app/logowanie/page.js).",
    );
  }

  useEffect(() => {
    return silnik.subskrybuj((t, now, czasTrwania) =>
      uchwyt.current(t, now, czasTrwania),
    );
    // [silnik] TO NIE JEST ZASPOKOJENIE LINTERA. Silnik powstaje raz na
    // provider i mieszka w ref, wiec ta tablica z zalozenia nigdy nie odpina
    // subskrypcji — jest rownowazna pustej. Gdyby kiedys zaczela odpinac,
    // to znaczy, ze silnik przestal byc stabilny, i subskrypcja MA sie wtedy
    // przepiac na nowy. Wygaszenie reguly przez eslint-disable dawaloby cos
    // odwrotnego: nastepny odczyt dolozony do tego efektu przeszedlby bez
    // slowa, tak samo jak nieznany kierunek przechodzil w prototypie.
  }, [silnik]);
}
