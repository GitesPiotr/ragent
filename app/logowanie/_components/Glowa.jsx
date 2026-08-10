"use client";

import { useEffect, useRef } from "react";
import { KRAWEDZIE, KROPKI, SZEW_X, TROJKATY, WEZLY } from "../_lib/siatka.js";
import {
  KRAWEDZ_MS,
  ROZPROSZENIE_MS,
  SPAW_MS,
  WEZEL_MS,
  zbudujHarmonogram,
} from "../_lib/harmonogram.js";
import { zbudujRozproszenie } from "../_lib/rozproszenie.js";
import {
  czyUsunacSpaw,
  nieprzezroczystoscHelmu,
  postep,
  zlagodzenie,
} from "../_lib/klatkaGlowy.js";
import { useKlatka } from "./ZegarSceny.jsx";
import styles from "../logowanie.module.css";

// GLOWA AGENTA — prawa polowa to render helmu, lewa to siatka punktow.
//
// ZERO IDENTYFIKATOROW. Prototyp trzyma sie #mesh, #scatter, #weld, #helmGrp
// i #flare, bo tak go czyta jego wlasny JavaScript. Identyfikator jest globalny
// na cala strone, wiec dwie zamontowane instancje deptalyby sobie po nogach —
// stylowanie idzie przez klasy modulu, a dostep z JS przez referencje.
//
// =============================================================================
//  KTO JEST WLASCICIELEM ELEMENTOW — i czym to sie rozni od prototypu.
//
//  Prototyp buduje 443 elementy SVG przez createElementNS przy wejsciu do
//  modulu (linie 324-337). Dokument przekazania (Problem 2) zakladal, ze
//  przeniesiemy to jeden do jednego: grupy zostana w JSX puste, a wypelni je
//  efekt. To bylo pisane, ZANIM etap A wyrenderowal te elementy w JSX.
//
//  Skoro juz tam sa, nie budujemy ich drugi raz. Efekt tylko je INDEKSUJE po
//  referencji do grupy i MUTUJE ATRYBUTY. Wychodzi lepiej niz w prototypie:
//  wlascicielem elementow jest React, my zmieniamy im wylacznie opacity
//  i transform.
//
//  WARUNEK, BEZ KTOREGO TO SIE SYPIE: GLOWA NIE MOZE MIEC STANU ANI PRZYJMOWAC
//  ZMIENIAJACYCH SIE PROPSOW. Kazde przerenderowanie odtworzy atrybuty z JSX
//  i skasuje to, co zapisala animacja — scena wrocilaby na klatke koncowa
//  w srodku przebiegu. Dzis komponent nie ma ani stanu, ani propsow i MA TAK
//  ZOSTAC. Gdyby kiedys musial je dostac, animacja przenosi sie do canvasu
//  (B7) albo elementy przechodza na wlasnosc efektu.
//
//  WYJATKIEM SA SPAWY. Sa przejsciowe: powstaja na wezle szwu, gdy jego
//  wejscie dojdzie do 90%, i znikaja po SPAW_MS (prototyp, linie 386-393).
//  Grupa spawow zostaje w JSX TRWALE PUSTA, a createElementNS jest tam jedynym
//  uzasadnionym uzyciem w calym komponencie.
//
//  USTAWIENIA PRODUKCYJNE POCHODZA Z applyPreset(), NIE Z DOMYSLEK. Prototyp
//  deklaruje dir='rtl' (linia 340) i helmMode='on' (357), ale linia 440 wola
//  applyPreset(), ktora w liniach 427-428 nadpisuje je na 'ltr' i 'end'. To,
//  co widac po otwarciu prototypu, to wiec kierunek "ltr" i tryb helmu "end".
//  showScat i showWeld zostaja prawdziwe, wiec ich warunki sa tu pominiete.
//
//  OKO JEST WYLACZONE. eyeOn = false przez caly przebieg (applyPreset wola
//  setEye(false)), wiec grupa rozblysku stoi na opacity 0, a wizjer wygaszony
//  trzyma sie 1. Rozblysk i puls wchodza w B5.
// =============================================================================

const NS = "http://www.w3.org/2000/svg";

// Prototyp rysuje rozproszenie z opacity oscylujacym miedzy 0,32 a 0,92
// (linia 375). Ta wartosc jest srednia i zostaje w JSX jako KLATKA DLA
// PRZEGLADARKI BEZ JAVASCRIPTU: dopoki efekt nie przejmie grupy, scena wyglada
// tak, jak wygladala po etapie A. Efekt podnosi grupe do 1 i od tego momentu
// oscylacja siedzi na poszczegolnych elementach, jak w prototypie.
const ROZPROSZENIE_SPOCZYNKOWE = 0.62;

// =============================================================================
//  rysujKlatke(scena, t, now, czasTrwania)
//
//  Odwzorowanie apply() z linii 362-397. Kolejnosc krokow jest ta sama: helm,
//  wizjer wygaszony, rozproszenie, wezly (z zapalaniem spawow), spawy,
//  krawedzie.
//
//  Funkcja stoi POZA komponentem i dostaje wszystko w `scena`. Dzieki temu
//  efekt indeksujacy nie zalezy od niczego, co zmienia sie miedzy renderami,
//  i moze miec uczciwie pusta tablice zaleznosci — bez wyciszania lintera.
// =============================================================================
function rysujKlatke(s, t, now, czasTrwania) {
  // --- helm, linie 364-367 (tryb "end") ---
  s.helm.setAttribute(
    "opacity",
    nieprzezroczystoscHelmu(t, s.harmonogram.ostatniSzew).toFixed(3),
  );

  // --- wizjer wygaszony, linie 368-370 ---
  // "wygaszony wizjer przygasa razem z helmem, inaczej swiecilby jasniej niz kask"
  s.eyeK += ((s.okoWlaczone ? 0 : 1) - s.eyeK) * 0.18;
  s.wizjer.setAttribute("opacity", s.eyeK.toFixed(3));

  // --- rozproszenie, linie 372-378 ---
  // Elementy wchodza kaskada co 40 ms, w kolejnosci indeksow.
  s.rozproszenie.forEach((r, i) => {
    const k = postep(t, i * 40, ROZPROSZENIE_MS);
    const dx = Math.sin(now / 2600 + r.ph) * r.am;
    const dy = Math.cos(now / 3100 + r.ph * 1.7) * r.am;
    const el = s.elementyRozproszenia[i];

    el.setAttribute(
      "opacity",
      (k * (0.62 + 0.3 * Math.sin(now / 1400 + r.ph))).toFixed(3),
    );
    el.setAttribute(
      "transform",
      `translate(${dx.toFixed(2)} ${dy.toFixed(2)})` +
        (r.rot
          ? ` rotate(${(Math.sin(now / 4200 + r.ph) * 7).toFixed(2)} ${r.x} ${r.y})`
          : ""),
    );
  });

  // --- wezly, linie 380-388 ---
  // Wezel wjezdza z przesuniecia (ox, oy) i z 35% rozmiaru do pelnego.
  WEZLY.forEach(([x, y], i) => {
    const h = s.harmonogram.wezly[i];
    const k = postep(t, h.t0, WEZEL_MS);
    const e = zlagodzenie(k);
    const sc = 0.35 + 0.65 * e;
    const el = s.kolka[i];

    el.setAttribute("opacity", k.toFixed(3));
    const dx = h.ox * (1 - e);
    const dy = h.oy * (1 - e);
    el.setAttribute(
      "transform",
      `translate(${(dx + x * (1 - sc)).toFixed(2)} ${(dy + y * (1 - sc)).toFixed(2)}) ` +
        `scale(${sc.toFixed(3)})`,
    );

    // Zapalenie spawu: wezel styka sie z helmem i wlasnie doszedl do 90%.
    if (x >= SZEW_X && !s.odpalone[i] && k >= 0.9) {
      s.odpalone[i] = true;
      const okrag = document.createElementNS(NS, "circle");
      okrag.setAttribute("cx", x);
      okrag.setAttribute("cy", y);
      okrag.setAttribute("r", 2);
      s.grupaSpawow.appendChild(okrag);
      s.spawy.push({ e: okrag, t0: t });
    }
  });

  // --- spawy, linie 390-393 ---
  // Petla w tyl, bo elementy wypadaja z tablicy w trakcie przechodzenia.
  //
  // NIEZMIENNIK: PO ZAKONCZENIU PRZEBIEGU GRUPA SPAWOW JEST PUSTA. Zawsze, bez
  // wyjatkow. Pilnuje tego czyUsunacSpaw, ktore poza warunkiem z prototypu
  // sprzata takze na koncu sceny — patrz jego naglowek. Bez tego ostatnie
  // jeden do dwoch okregow zostawaly na ekranie, bo usuwanie dzieje sie
  // w petli, a petla w tym momencie juz stoi.
  for (let i = s.spawy.length - 1; i >= 0; i -= 1) {
    const w = s.spawy[i];
    const k = (t - w.t0) / SPAW_MS;
    if (czyUsunacSpaw(t, w.t0, { zycie: SPAW_MS, czasTrwania })) {
      w.e.remove();
      s.spawy.splice(i, 1);
      continue;
    }
    w.e.setAttribute("r", (2 + 16 * zlagodzenie(k)).toFixed(2));
    w.e.setAttribute("opacity", ((1 - k) * 0.75).toFixed(3));
  }

  // --- krawedzie, linie 395-397 ---
  // Kreska rysuje sie od konca do konca przez stroke-dashoffset, a jasnosc
  // dochodzi trzy razy szybciej niz sama kreska.
  KRAWEDZIE.forEach((_, i) => {
    const k = postep(t, s.harmonogram.krawedzie[i].t0, KRAWEDZ_MS);
    const e = zlagodzenie(k);
    const el = s.kreski[i];
    el.setAttribute("opacity", Math.min(1, k * 3).toFixed(3));
    el.setAttribute("stroke-dashoffset", (s.dlugosci[i] * (1 - e)).toFixed(2));
  });
}

export function Glowa() {
  const refHelm = useRef(null);
  const refWizjer = useRef(null);
  const refRozproszenie = useRef(null);
  const refSiatka = useRef(null);
  const refSpawy = useRef(null);

  // CALY STAN ANIMACJI SIEDZI W ref, NIGDY NA POZIOMIE MODULU. W prototypie
  // scat, nodes, edges i welds sa tablicami modulowymi (linie 324, 331-332,
  // 352), wiec przy drugim montowaniu narastaja: 276 wezlow zamiast 138.
  // Tutaj kazda instancja komponentu ma swoj wlasny stan.
  const scenaRef = useRef(null);

  // EFEKT INDEKSUJACY MUSI STAC PRZED useKlatka. Efekty w komponencie biegna
  // w kolejnosci deklaracji, a subskrypcja potrafi wywolac klatke NATYCHMIAST
  // (silnik robi tak, gdy petla nie ma ruszyc — na przyklad przy ruchu
  // ograniczonym). Odwrotna kolejnosc znaczylaby klatke przed indeksowaniem.
  //
  // PRZEBLYSK KLATKI KONCOWEJ PRZY WEJSCIU — WIDOCZNY, SWIADOMY, DO B5.
  // useEffect biegnie PO pierwszym malowaniu, wiec kolejnosc jest taka:
  // przegladarka maluje prerenderowany HTML, czyli gotowa scene koncowa,
  // dopiero potem ten efekt ustawia klatke zerowa. Przez okolo jedna klatke
  // widac wiec cala glowe, zanim animacja ruszy od poczatku.
  //
  // NIE JEST TO PRZEOCZENIE i nie zalatwiamy tego przez useLayoutEffect: ten
  // biegnie przed malowaniem, ale trasa jest prerenderowana, wiec React
  // wypisywalby ostrzezenie przy kazdym budowaniu. Rozstrzygniecie nalezy do
  // B5, gdzie animacja ma grac RAZ NA SESJE: przy kolejnych wejsciach scena
  // ma zostac na klatce koncowej, czyli to, co dzis przeblyskuje, bedzie
  // wtedy stanem docelowym, a nie bledem do ukrycia.
  useEffect(() => {
    const grupaSiatki = refSiatka.current;
    const grupaRozproszenia = refRozproszenie.current;
    const grupaSpawow = refSpawy.current;

    // INDEKSOWANIE PO KOLEJNOSCI, NIE PO NAZWIE ZNACZNIKA. JSX renderuje
    // w grupie siatki najpierw 290 kresek, potem 138 kolek. Gdyby zamiast tego
    // czytac querySelectorAll('line'), dolozenie kiedykolwiek innego elementu
    // rozjechaloby indeksy po cichu i dalo animacje wygladajaca prawie dobrze.
    // Dlatego liczby sa sprawdzane, a niezgodnosc huka.
    const dzieci = grupaSiatki.children;
    const oczekiwane = KRAWEDZIE.length + WEZLY.length;
    if (dzieci.length !== oczekiwane) {
      throw new Error(
        `Grupa siatki ma ${dzieci.length} dzieci zamiast ${oczekiwane} ` +
          `(${KRAWEDZIE.length} kresek + ${WEZLY.length} kolek). Liczba i kolejnosc ` +
          "elementow w JSX sa czescia kontraktu animacji.",
      );
    }

    const kreski = Array.prototype.slice.call(dzieci, 0, KRAWEDZIE.length);
    const kolka = Array.prototype.slice.call(dzieci, KRAWEDZIE.length);

    if (kreski[0].tagName !== "line" || kolka[0].tagName !== "circle") {
      throw new Error(
        `Grupa siatki ma zla kolejnosc: dziecko 0 to ${kreski[0].tagName}, ` +
          `a dziecko ${KRAWEDZIE.length} to ${kolka[0].tagName}. ` +
          "Oczekiwane: najpierw line, potem circle.",
      );
    }

    const elementyRozproszenia = Array.prototype.slice.call(
      grupaRozproszenia.children,
    );
    if (elementyRozproszenia.length !== KROPKI.length + TROJKATY.length) {
      throw new Error(
        `Grupa rozproszenia ma ${elementyRozproszenia.length} dzieci zamiast ` +
          `${KROPKI.length + TROJKATY.length} (${KROPKI.length} kropek + ` +
          `${TROJKATY.length} wielokatow).`,
      );
    }

    // Harmonogram i losowe fazy licza sie RAZ na montowanie, nie co klatke.
    // Kierunek "ltr" — patrz uwaga o applyPreset w naglowku pliku.
    const harmonogram = zbudujHarmonogram(WEZLY, KRAWEDZIE, { kierunek: "ltr" });
    const rozproszenie = zbudujRozproszenie(KROPKI, TROJKATY);

    // Prototyp, linie 334 i 336: dlugosc krawedzi idzie w stroke-dasharray raz,
    // przy budowie. Co klatke zmienia sie tylko przesuniecie wzoru kreskowania.
    const dlugosci = KRAWEDZIE.map(([a, b]) =>
      Math.hypot(WEZLY[b][0] - WEZLY[a][0], WEZLY[b][1] - WEZLY[a][1]),
    );
    kreski.forEach((el, i) => {
      el.setAttribute("stroke-dasharray", dlugosci[i]);
    });

    // Grupa rozproszenia przechodzi na wlasnosc animacji — od tej chwili
    // oscylacja siedzi na jej dzieciach, a nie na niej samej.
    grupaRozproszenia.setAttribute("opacity", "1");

    const scena = {
      helm: refHelm.current,
      wizjer: refWizjer.current,
      grupaSpawow,
      harmonogram,
      rozproszenie,
      kreski,
      kolka,
      elementyRozproszenia,
      dlugosci,
      odpalone: new Array(WEZLY.length).fill(false),
      spawy: [],
      // Prototyp, linia 369: eyeK dochodzi wykladniczo do (eyeOn ? 0 : 1).
      // applyPreset ustawia eyeK = 1 i oko wylaczone, wiec wartosc stoi na 1.
      // Pole zostaje, bo B5 bedzie nim ruszal.
      eyeK: 1,
      okoWlaczone: false,
    };
    scenaRef.current = scena;

    // Pierwsza klatka od razu, zeby miedzy zamontowaniem a pierwszym rAF nie
    // zostala na ekranie klatka koncowa z prerenderowanego HTML-a.
    //
    // Dlugosci sceny w tym miejscu jeszcze nie znamy — poda ja zegar dopiero
    // w pierwszej prawdziwej klatce. Nieskonczonosc jest tu uczciwa: znaczy
    // "ta klatka nie jest koncem sceny", a jedyne, co z niej korzysta, to
    // domykanie spawow, ktorych na t = 0 nie ma ani jednego.
    rysujKlatke(scena, 0, 0, Number.POSITIVE_INFINITY);

    return () => {
      // SPRZATANIE. Bez usuniecia spawow drugie montowanie w Strict Mode
      // zastaloby okregi z pierwszego: te same elementy DOM przezywaja
      // podwojne montowanie, bo React ich nie odtwarza.
      for (const w of scena.spawy) w.e.remove();
      scena.spawy.length = 0;
      while (grupaSpawow.firstChild) {
        grupaSpawow.removeChild(grupaSpawow.firstChild);
      }
      scenaRef.current = null;
    };
  }, []);

  useKlatka((t, now, czasTrwania) => {
    const scena = scenaRef.current;
    // Klatka przed zindeksowaniem albo po sprzataniu nie ma czego rysowac.
    if (scena === null) return;
    rysujKlatke(scena, t, now, czasTrwania);
  });

  return (
    <div className={styles.glowa}>
      <div className={styles.glowaWnetrze}>
        <svg
          className={styles.glowaSvg}
          viewBox="0 0 624 649"
          preserveAspectRatio="xMidYMid meet"
          aria-label="Prawa polowa helmu robota, lewa z punktow i polaczen"
        >
          {/* preserveAspectRatio="none" jest bezpieczne mimo nazwy: proporcja
              zrodla 367/972 = 0,3776 i docelowa 230,84/611,39 = 0,3776 sa
              identyczne, wiec nic sie nie rozciaga. Tak samo wizjer:
              341/372 = 0,9167 wobec 149,93/163,56 = 0,9166. */}
          <g ref={refHelm}>
            <image
              href="/logowanie/helm.webp"
              x="324.26"
              y="-1"
              width="230.84"
              height="611.39"
              preserveAspectRatio="none"
            />
            <image
              ref={refWizjer}
              href="/logowanie/wizjer.webp"
              x="324.00"
              y="294.62"
              width="149.93"
              height="163.56"
              preserveAspectRatio="none"
            />
          </g>

          {/* Rozblysk wizjera. W spoczynku wygaszony — zapala sie dopiero przy
              logowaniu (B5). Dziewiec elips o malejacych promieniach daje
              miekkie halo bez filtra rozmycia. */}
          <g opacity="0" style={{ mixBlendMode: "screen" }}>
            {[86.0, 76.4, 66.9, 57.3, 47.8, 38.2, 28.7, 19.1, 9.6].map((rx, i) => (
              <ellipse
                key={rx}
                cx="373"
                cy="366"
                rx={rx}
                ry={[30.0, 26.7, 23.3, 20.0, 16.7, 13.3, 10.0, 6.7, 3.3][i]}
                fill="var(--visor)"
                opacity="0.100"
              />
            ))}
          </g>

          {/* KOLEJNOSC DZIECI JEST KONTRAKTEM: najpierw 11 kropek, potem
              4 wielokaty — tak samo jak w zbudujRozproszenie. */}
          <g
            ref={refRozproszenie}
            className={`${styles.rozproszenie} ${styles.poswiata}`}
            opacity={ROZPROSZENIE_SPOCZYNKOWE}
          >
            {KROPKI.map((d, i) => (
              <circle
                key={`k${i}`}
                cx={d.x}
                cy={d.y}
                r={d.r * 0.8}
                className={d.m ? styles.magenta : undefined}
              />
            ))}
            {TROJKATY.map((t, i) => (
              <polygon
                key={`t${i}`}
                points={t.pts.map((q) => q.join(",")).join(" ")}
                className={t.m ? styles.magenta : undefined}
              />
            ))}
          </g>

          {/* KOLEJNOSC DZIECI JEST KONTRAKTEM: najpierw 290 kresek, potem
              138 kolek. Efekt indeksuje po pozycji, nie po nazwie znacznika. */}
          <g ref={refSiatka} className={`${styles.siatka} ${styles.poswiata}`}>
            {KRAWEDZIE.map(([a, b, m], i) => (
              <line
                key={`e${i}`}
                x1={WEZLY[a][0]}
                y1={WEZLY[a][1]}
                x2={WEZLY[b][0]}
                y2={WEZLY[b][1]}
                className={m ? styles.magenta : undefined}
              />
            ))}
            {WEZLY.map(([x, y, m], i) => (
              <circle key={`w${i}`} cx={x} cy={y} className={m ? styles.magenta : undefined} />
            ))}
          </g>

          {/* Okregi spawow sa przejsciowe — powstaja i znikaja w trakcie
              przebiegu, wiec grupa jest w JSX TRWALE PUSTA i wypelnia ja efekt.
              To jedyne miejsce w tym pliku, gdzie createElementNS jest
              uzasadniony. */}
          <g ref={refSpawy} className={`${styles.spawy} ${styles.poswiata}`} />
        </svg>
      </div>
    </div>
  );
}
