"use client";

import { useEffect, useRef } from "react";
import { KRESEK, ileSwiecacych } from "../_lib/pierscien.js";
import { czyRuchOgraniczony } from "../_lib/ruchOgraniczony.js";
import { useKlatka, usePodtrzymanieSceny } from "./ZegarSceny.jsx";
import { useSterowanieScena } from "./SterowanieScena.jsx";
import styles from "../logowanie.module.css";

// PIERSCIEN PASKOW wokol formularza. Wypelnia sie w trakcie logowania.
//
// Geometria to czysta matematyka — zero DOM-u, zero losowosci — wiec kreski
// powstaja w JSX i przechodza przez prerendering bez zadnego efektu. Prototyp
// buduje je przez createElementNS przy wejsciu do modulu (linie 671-679); tutaj
// nie ma po co, a przy podwojnym montowaniu Strict Mode tamten zapis dalby
// 96 kresek zamiast 48.
//
// =============================================================================
//  TEN SAM KONTRAKT CO GLOWA I ZNAK: KOMPONENT NIE MA STANU ANI ZMIENIAJACYCH
//  SIE PROPSOW.
//
//  Do B4 pierscien przyjmowal props `postep` i rozdawal klasy w JSX. Przy
//  animacji znaczyloby to przerenderowanie 48 elementow w KAZDEJ klatce —
//  szescdziesiat razy na sekunde przez caly czas logowania. Teraz klasy
//  przelacza IMPERATYWNIE efekt, przez referencje do grupy, a React o tej
//  animacji nie wie.
//
//  W JSX wszystkie 48 kresek jest WYGASZONYCH i tak zostaje: to jest zarazem
//  stan spoczynkowy i klatka dla przegladarki bez JavaScriptu.
// =============================================================================

// R1 wyznacza WOLNE POLE w srodku, w ktorym siedzi formularz — stad promien
// 164 przy plotnie 400. Zmiana R1 wymaga sprawdzenia, czy pola nadal sie
// miesza (szerokosc formularza jest liczona w cqi od szerokosci pierscienia).
const R1 = 164;
const R2 = 192;
const SRODEK = 200;

// Start na godzinie 12, dalej zgodnie z ruchem wskazowek.
const KRESKI = Array.from({ length: KRESEK }, (_, i) => {
  const kat = ((-90 + (i * 360) / KRESEK) * Math.PI) / 180;
  return {
    x1: (SRODEK + Math.cos(kat) * R1).toFixed(2),
    y1: (SRODEK + Math.sin(kat) * R1).toFixed(2),
    x2: (SRODEK + Math.cos(kat) * R2).toFixed(2),
    y2: (SRODEK + Math.sin(kat) * R2).toFixed(2),
  };
});

export function Pierscien({ children }) {
  const refGrupa = useRef(null);
  const stanRef = useRef(null);
  const sterowanie = useSterowanieScena();
  const podtrzymaj = usePodtrzymanieSceny();

  // Efekt indeksujacy przed useKlatka — subskrypcja potrafi wywolac klatke
  // natychmiast, a wtedy kreski musza byc juz policzone.
  useEffect(() => {
    const grupa = refGrupa.current;
    const kreski = Array.prototype.slice.call(grupa.children);

    if (kreski.length !== KRESEK) {
      throw new Error(
        `Pierscien ma ${kreski.length} kresek zamiast ${KRESEK}. Liczba kresek ` +
          "jest czescia kontraktu animacji logowania.",
      );
    }

    const stan = {
      kreski,
      swiecacych: 0,
      biegnie: false,
      t0: 0,
      ms: 0,
      zwolnij: null,
      zakoncz: null,
      budzik: 0,
    };
    stanRef.current = stan;

    const ustaw = (postep) => {
      const ile = ileSwiecacych(postep);
      // Zapis tylko wtedy, gdy cos sie zmienilo: przy 48 kreskach rozlozonych
      // na caly prog wiekszosc klatek nie zmienia ani jednej klasy.
      if (ile === stan.swiecacych) return;
      const od = Math.min(ile, stan.swiecacych);
      const doo = Math.max(ile, stan.swiecacych);
      for (let i = od; i < doo; i += 1) {
        stan.kreski[i].classList.toggle(styles.kreskaWlaczona, i < ile);
      }
      stan.swiecacych = ile;
    };

    const zakoncz = () => {
      stan.biegnie = false;
      if (stan.budzik) {
        clearTimeout(stan.budzik);
        stan.budzik = 0;
      }
      if (stan.zwolnij) {
        stan.zwolnij();
        stan.zwolnij = null;
      }
      const gotowe = stan.zakoncz;
      stan.zakoncz = null;
      if (gotowe) gotowe();
    };

    const obsluga = {
      // Prototyp, linie 687-696, ale bez wlasnej petli rAF: postep liczy sie
      // z `now`, ktory kazda klatka i tak przynosi. Uzasadnienie przy
      // podtrzymaj() w _lib/silnikZegara.js.
      uruchom(ms) {
        // =====================================================================
        //  RUCH OGRANICZONY ZDEJMUJE PROG. To jest ta roznica, dla ktorej w B5
        //  nie zlalismy w jedno dwoch powodow pominiecia przebiegu: znacznik
        //  sesji progu NIE zdejmuje (animacja juz byla, ale czekanie zostaje),
        //  ruch ograniczony zdejmuje.
        //
        //  Logowanie rozstrzyga sie wtedy natychmiast po odpowiedzi serwera —
        //  bez dwoch sekund czekania na przebieg, ktorego i tak nie bedzie.
        //
        //  KRESKI SKOKOWO, WSZYSTKIE NARAZ, a nie „wcale". Przy zerowym progu
        //  nie ma czego animowac: przebieg trwalby tyle, co odpowiedz serwera,
        //  wiec kreski mrugnelyby i zgasly. Zamiast tego pierscien zapala sie
        //  caly w jednej klatce i tak zostaje do konca logowania — statyczny
        //  wskaznik pracy zamiast ruchu. Uzytkownik nadal widzi, ze cos sie
        //  dzieje; nie widzi tylko, jak to sie dzieje.
        //
        //  Preferencja jest czytana TU, przy kazdym logowaniu, a nie raz przy
        //  montowaniu — patrz komentarz w _lib/ruchOgraniczony.js.
        // =====================================================================
        if (czyRuchOgraniczony()) {
          if (stan.biegnie) zakoncz();
          ustaw(1);
          return Promise.resolve();
        }

        return new Promise((gotowe) => {
          // Ponowne uruchomienie w trakcie biegu domyka poprzednia obietnice,
          // zeby nikt nie zostal z wiszacym `await`.
          if (stan.biegnie) zakoncz();
          stan.biegnie = true;
          stan.ms = ms;
          stan.t0 = performance.now();
          stan.zakoncz = gotowe;
          ustaw(0);
          if (stan.zwolnij === null) stan.zwolnij = podtrzymaj();

          // PROG ROZSTRZYGA ZEGAR, NIE KLATKI — i to nie jest zapas, tylko
          // warunek poprawnosci.
          //
          // Klatki rysuja pierscien, ale nie moga decydowac o tym, KIEDY prog
          // minie. requestAnimationFrame nie chodzi w karcie w tle: gdyby
          // obietnica czekala na klatke z postepem >= 1, przelaczenie karty
          // zaraz po kliknieciu zatrzymaloby logowanie na zawsze, mimo gotowej
          // odpowiedzi serwera. Zmierzone: w karcie w tle formularz zostawal
          // na „Logowanie…" bez konca.
          //
          // Prototyp tego nie widzi, bo jego petla nigdy nie staje i nikt tam
          // nie przelacza kart. Prog jest obietnica o czasie, ktory czeka
          // uzytkownik — wiec mierzy go zegar.
          stan.budzik = setTimeout(() => {
            stan.budzik = 0;
            ustaw(1);
            zakoncz();
          }, ms);
        });
      },
      zeruj() {
        if (stan.biegnie) zakoncz();
        ustaw(0);
      },
    };

    const wyrejestruj = sterowanie.pierscien.zarejestruj(obsluga);
    stan.ustaw = ustaw;
    stan.zakonczBieg = zakoncz;

    return () => {
      wyrejestruj();
      zakoncz();
      stanRef.current = null;
    };
  }, [sterowanie, podtrzymaj]);

  useKlatka((t, now) => {
    const stan = stanRef.current;
    if (stan === null || !stan.biegnie) return;

    // CZAS ZEGAROWY, nie czas sceny. Prog logowania jest obietnica o tym, ile
    // uzytkownik czeka, a nie o tym, ile klatek zdazyla narysowac scena.
    const postep = (now - stan.t0) / stan.ms;
    stan.ustaw(postep);
    if (postep >= 1) stan.zakonczBieg();
  });

  return (
    <div className={styles.pierscien}>
      <svg className={styles.pierscienSvg} viewBox="0 0 400 400" aria-hidden="true">
        <g ref={refGrupa}>
          {KRESKI.map((k, i) => (
            <line
              key={i}
              x1={k.x1}
              y1={k.y1}
              x2={k.x2}
              y2={k.y2}
              className={styles.kreska}
            />
          ))}
        </g>
      </svg>
      {children}
    </div>
  );
}
