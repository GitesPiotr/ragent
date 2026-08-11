"use client";

import { useEffect, useRef } from "react";
import {
  START_MS,
  postepPunktu,
  rozblysk,
  zanik,
} from "../_lib/harmonogramZnaku.js";
import { sledzKontur, uproscLamana } from "../_lib/obrysNapisu.js";
import { czyRuchOgraniczony } from "../_lib/ruchOgraniczony.js";
import { zlagodzenie } from "../_lib/klatkaGlowy.js";
import { useKlatka } from "./ZegarSceny.jsx";
import styles from "../logowanie.module.css";

// NAPIS „RAGent" pod glowa.
//
// Podzial po trzeciej literze niesie znaczenie, nie jest ozdoba: „RAG" dostaje
// kolor wyszukiwania, „ent" biel czlonu neutralnego — ta sama zasada, co
// w calym wygladzie (kolor znaczy maszyne).
//
// =============================================================================
//  CO SIE TU DZIEJE. Prototyp (linie 448-654) odbija napis na niewidocznym
//  plotnie, wyciaga z niego kontur liter skanem Moore'a, upraszcza go
//  Douglas-Peuckerem i rysuje jako siatke punktow, ktora przelatuje z lewej na
//  prawo — a na koncu rozplywa sie w prawdziwy tekst. Warstwa tekstowa siedzi
//  w JSX przez caly czas i tylko zmienia przezroczystosc.
//
//  TEN SAM KONTRAKT CO W GLOWIE: KOMPONENT NIE MOZE MIEC STANU ANI
//  ZMIENIAJACYCH SIE PROPSOW. Mutujemy atrybuty plotna i styl napisu, ktorych
//  wlascicielem jest React — kazde przerenderowanie odtworzy je z JSX i skasuje
//  to, co zapisala animacja. Dzis komponent nie ma ani stanu, ani propsow
//  i ma tak zostac.
//
//  PROTOTYPOWA FUNKCJA label() JEST NIEPOTRZEBNA: prototyp buduje napis przez
//  innerHTML, bo nie ma JSX. U nas RAG<span>ent</span> stoi wprost w drzewie.
// =============================================================================

const SLOWO = "RAGent";
// Ile pierwszych liter idzie bez akcentu: „RAG" | „ent". Prototyp, linia 452.
const PODZIAL = 3;
// Prototyp, linia 535: tolerancja upraszczania konturu.
const EPS = 1.7;
// Prototyp, linia 608: promien punktu obrysu.
const PROMIEN = 1.5;
// Prototyp, linia 645: ponizej tej szerokosci kolumna jest schowana albo
// jeszcze nie ma ukladu — nie ma czego mierzyc.
const MIN_SZEROKOSC = 10;
// Prototyp, linia 650: zapas, gdyby czcionka nie doszla.
const ZAPAS_CZCIONKI_MS = 1500;
// Ile czekamy od OSTATNIEGO zdarzenia zmiany rozmiaru, zanim przeliczymy obrys.
const ZWLOKA_ROZMIARU_MS = 150;

// =============================================================================
//  POMIAR — odbicie napisu na niewidocznym plotnie i wyciagniecie z niego
//  konturu. Prototyp, linie 485-511 i 556-572.
//
//  To jest DLUGIE ZADANIE: fillText, getImageData na okolo 117 000 pikselach,
//  skan Moore'a i Douglas-Peucker, wszystko synchronicznie. Dlatego wola sie
//  je poza oknem pierwszego malowania — patrz efekt nizej.
// =============================================================================
function zmierzIZbuduj(s) {
  const r = s.korzen.getBoundingClientRect();
  s.W = Math.round(r.width);
  s.H = Math.round(r.height);

  s.plotno.style.width = `${s.W}px`;
  s.plotno.style.height = `${s.H}px`;
  s.plotno.width = Math.round(s.W * s.dpr);
  s.plotno.height = Math.round(s.H * s.dpr);
  s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);

  const cs = getComputedStyle(s.slowo);
  const wr = s.slowo.getBoundingClientRect();
  const cx = wr.left - r.left + wr.width / 2;
  const cy = wr.top - r.top + wr.height / 2;

  const poza = document.createElement("canvas");
  poza.width = s.W;
  poza.height = s.H;
  const o = poza.getContext("2d", { willReadFrequently: true });
  o.font = `${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`;
  o.textAlign = "center";
  o.textBaseline = "alphabetic";

  const m = o.measureText(SLOWO);
  // Srodek plamy tekstu ma trafic w srodek pola — stad zgodnosc z warstwa
  // tekstowa, ktora lezy dokladnie pod spodem. Prototyp, linie 503-504.
  const linia = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  o.fillStyle = "#fff";
  o.fillText(SLOWO, cx, linia);

  // Kanal alfa jako jeden bajt na piksel. Skan konturu dostaje przez to zwykla
  // tablice liczb, wiec daje sie sprawdzic bez przegladarki (obrysNapisu.js).
  const dane = o.getImageData(0, 0, s.W, s.H).data;
  const alfa = new Uint8Array(s.W * s.H);
  for (let i = 0; i < alfa.length; i += 1) alfa[i] = dane[i * 4 + 3];

  // Granica miedzy „RAG" a „ent" liczona w pikselach, nie w literach.
  const granicaAkcentu =
    cx - m.width / 2 + o.measureText(SLOWO.slice(0, PODZIAL)).width;

  const petleSurowe = sledzKontur(alfa, s.W, s.H);
  const petle = petleSurowe.map((petla) => uproscLamana(petla, EPS));

  const punkty = [];
  const odcinki = [];
  for (const uproszczona of petle) {
    const baza = punkty.length;
    for (const [x, y] of uproszczona) punkty.push({ x, y });
    for (let i = 0; i < uproszczona.length; i += 1) {
      const a = baza + i;
      const b = baza + ((i + 1) % uproszczona.length);
      if (a !== b) odcinki.push({ a, b });
    }
  }

  const xs = punkty.map((p) => p.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  for (const p of punkty) {
    p.akcent = p.x > granicaAkcentu;
    // Pozycja pozioma 0..1 to kolejnosc rysowania. Prototyp, linia 570.
    p.k = (p.x - lo) / (hi - lo || 1);
  }

  // KOLORY CZYTANE RAZ, NIE W PETLI — patrz komentarz przy rysujZnak.
  //
  // UWAGA NA NAZWY. Prototyp czyta --line (linia 592), ale w aplikacji ta
  // zmienna nazywa sie --siatka: przemianowana w A3, bo globalne --line to
  // kolor kazdej ramki. Przepisane doslownie zeszloby po cichu do wartosci
  // zapasowej #35DCFF, ktora jest prawie tym samym kolorem — nikt by nie
  // zauwazyl. Pozostale dwie nazwy sie nie zmienily.
  const st = getComputedStyle(s.korzen);
  const kolory = {
    obrys: st.getPropertyValue("--siatka").trim() || "#35DCFF",
    akcent: st.getPropertyValue("--mag").trim() || "#F3FBFF",
    zwykly: st.getPropertyValue("--node").trim() || "#7FE9FF",
  };

  s.punkty = punkty;
  s.odcinki = odcinki;
  s.kolory = kolory;
}

// =============================================================================
//  KLATKA — prototyp, linie 575-611.
//
//  ANI JEDNEGO getComputedStyle W TEJ FUNKCJI. Prototyp czyta stad kolory trzy
//  razy: raz na obrys (linia 592) i DWA RAZY NA KAZDY PUNKT (linie 606-607),
//  czyli kilkaset wymuszonych odczytow stylu w kazdej klatce. Dokument
//  przekazania wymienia to jako osobna pozycje w tabeli wydajnosci. Kolory sa
//  odczytane raz, przy pomiarze, i siedza w stanie.
// =============================================================================
function rysujZnak(s, tz) {
  const { ctx } = s;
  ctx.clearRect(0, 0, s.W, s.H);

  const znikanie = zanik(tz);
  const obrys = 1 - znikanie;
  s.slowo.style.opacity = znikanie.toFixed(3);
  if (obrys <= 0) return;

  const fl = rozblysk(tz);

  ctx.lineWidth = 1;
  ctx.strokeStyle = s.kolory.obrys;
  ctx.globalAlpha = (0.9 + fl * 0.9) * obrys;
  ctx.beginPath();
  for (const e of s.odcinki) {
    const A = s.punkty[e.a];
    const B = s.punkty[e.b];
    // Odcinek pojawia sie dopiero, gdy OBA jego konce juz weszly.
    if (!postepPunktu(tz, A.k) || !postepPunktu(tz, B.k)) continue;
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
  }
  ctx.stroke();

  for (const p of s.punkty) {
    const k = postepPunktu(tz, p.k);
    if (!k) continue;
    ctx.globalAlpha = zlagodzenie(k) * obrys * (0.95 + fl * 0.4);
    ctx.fillStyle = p.akcent ? s.kolory.akcent : s.kolory.zwykly;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PROMIEN, 0, 6.29);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function ZnakRAGent() {
  const refKorzen = useRef(null);
  const refPlotno = useRef(null);
  const refSlowo = useRef(null);
  const stanRef = useRef(null);

  // Efekt przygotowujacy stoi PRZED useKlatka, bo efekty biegna w kolejnosci
  // deklaracji, a subskrypcja potrafi wywolac klatke natychmiast.
  useEffect(() => {
    const korzen = refKorzen.current;
    const plotno = refPlotno.current;
    const slowo = refSlowo.current;

    const stan = {
      korzen,
      plotno,
      slowo,
      ctx: plotno.getContext("2d"),
      dpr: Math.min(2, window.devicePixelRatio || 1),
      W: 0,
      H: 0,
      punkty: [],
      odcinki: [],
      kolory: null,
      gotowy: false,

      // RUCH OGRANICZONY: NIE ODKLADAMY POMIARU, TYLKO GO NIE ROBIMY.
      //
      // Obrys sluzy wylacznie animacji — przy ruchu ograniczonym nie zostanie
      // narysowana ani jedna jego klatka, wiec caly pomiar bylby praca za nic:
      // fillText, getImageData na 92 690 pikselach, skan Moore'a
      // i Douglas-Peucker, zmierzone 4-19 ms. Odlozenie ich przez
      // requestIdleCallback nadal by je wykonalo, tylko pozniej.
      //
      // Sciezki wyswietlania nie trzeba pisac drugi raz: `gotowy` zostaje
      // falszywe, a zabezpieczenie z B4 — pomyslane na obrys, ktory jeszcze
      // sie nie policzyl — pokazuje wtedy sam napis w pelni widoczny. Tu jest
      // to nie awaryjne wyjscie, tylko stan docelowy.
      pomijamy: czyRuchOgraniczony(),
    };
    stanRef.current = stan;

    // UNIEWAZNIANIE. Tu Strict Mode uderza najmocniej: obietnica czcionki
    // i odlozone zadanie rozwiazuja sie PO odmontowaniu i nie maja prawa
    // dotknac plotna, ktore juz nie nalezy do tej instancji.
    let zywy = true;
    let idPrzestoju = 0;
    let idOdroczenia = 0;
    let idZapasu = 0;
    let idRozmiaru = 0;

    const zmierz = () => {
      if (!zywy) return;
      const szerokosc = Math.round(korzen.getBoundingClientRect().width);
      if (szerokosc < MIN_SZEROKOSC) {
        // Prototyp, linia 645: kolumna schowana albo jeszcze bez ukladu.
        idOdroczenia = setTimeout(zmierz, 200);
        return;
      }
      try {
        zmierzIZbuduj(stan);
        stan.gotowy = true;
      } catch (e) {
        // Prototyp, linia 647. Brak obrysu to brak animacji napisu, a nie
        // rozwalony ekran logowania.
        console.error("[napis] pomiar nie wyszedl:", e);
      }
    };

    // POMIAR POZA OKNEM PIERWSZEGO MALOWANIA. useEffect biegnie juz po
    // malowaniu, ale sam pomiar to nadal jedno dlugie zadanie, ktore liczy sie
    // do Total Blocking Time — czyli do tego, czy da sie od razu pisac w polu
    // e-mail. Ustepujemy watek: requestIdleCallback, a gdy go nie ma (Safari),
    // zwykly setTimeout.
    //
    // ZMIERZONE, nie oszacowane. Caly pomiar to 4-9 ms po rozgrzaniu i 18,6 ms
    // na zimno, przy plotnie 598x155 (92 690 pikseli). Rozklad kosztu jest inny,
    // niz zakladal dokument przekazania: najdrozszy jest getImageData
    // (3-10 ms), nie skan Moore'a (0,6-4,4 ms). requestIdleCallback wystarcza
    // z duzym zapasem — nie ma po co ciac pomiaru na kawalki. Zabezpieczenie
    // na niegotowy obrys zostaje mimo to, bo w karcie w tle Chrome odklada
    // bezczynnosc i gotowosc rosnie do okolo 1900 ms.
    //
    // Douglas-Peucker zbija 1803 piksele konturu do 125 punktow w 9 petlach,
    // czyli o 93 procent. Te 125 punktow i 125 odcinkow to caly koszt klatki
    // napisu — liczba potrzebna przy ocenie kryterium B7.
    const odlozPomiar = () => {
      if (!zywy || stan.gotowy || stan.pomijamy) return;
      if (typeof window.requestIdleCallback === "function") {
        idPrzestoju = window.requestIdleCallback(zmierz, { timeout: 1000 });
      } else {
        idOdroczenia = setTimeout(zmierz, 0);
      }
    };

    // Prototyp, linie 649-650: pomiar po dojsciu czcionki, z zapasem na wypadek,
    // gdyby nie doszla. Obie sciezki sprawdzaja `zywy`.
    const czcionki = document.fonts ? document.fonts.ready : Promise.resolve();
    czcionki.then(() => odlozPomiar());
    idZapasu = setTimeout(odlozPomiar, ZAPAS_CZCIONKI_MS);

    // ZMIANA ROZMIARU OKNA. Prototyp zeruje P przy KAZDYM zdarzeniu (linia 643),
    // a przeliczenie robi w klatce (linia 637) — czyli przeciaganie krawedzi
    // okna liczy obrys kilkadziesiat razy na sekunde, w goracej sciezce.
    // To jest punkt 14 z dokumentu przekazania, opisany jako najgorszy
    // przypadek. Tutaj: przeliczamy TYLKO gdy szerokosc faktycznie sie
    // zmienila i dopiero po ciszy.
    const naZmianeRozmiaru = () => {
      clearTimeout(idRozmiaru);
      idRozmiaru = setTimeout(() => {
        if (!zywy || stan.pomijamy) return;
        const szerokosc = Math.round(korzen.getBoundingClientRect().width);
        if (szerokosc === stan.W) return; // prototyp: W !== now
        stan.gotowy = false;
        stan.punkty = [];
        stan.odcinki = [];
        odlozPomiar();
      }, ZWLOKA_ROZMIARU_MS);
    };
    window.addEventListener("resize", naZmianeRozmiaru);

    return () => {
      zywy = false;
      window.removeEventListener("resize", naZmianeRozmiaru);
      clearTimeout(idOdroczenia);
      clearTimeout(idZapasu);
      clearTimeout(idRozmiaru);
      if (idPrzestoju && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idPrzestoju);
      }
      stanRef.current = null;
    };
  }, []);

  useKlatka((t) => {
    const s = stanRef.current;
    if (s === null) return;

    // ZABEZPIECZENIE: zegar doszedl do startu, a obrysu jeszcze nie ma.
    // Pokazujemy SAM NAPIS, w pelni widoczny, i nie ruszamy plotna. Lepiej
    // stracic animacje napisu niz zablokowac watek liczeniem konturu w chwili,
    // w ktorej uzytkownik chce zaczac pisac w polu e-mail.
    if (!s.gotowy) {
      s.slowo.style.opacity = "1";
      return;
    }

    // Czas napisu to czas sceny minus przesuniecie startu. Prototyp, linia 638.
    const tz = t - START_MS;
    if (tz < 0) {
      s.ctx.clearRect(0, 0, s.W, s.H);
      s.slowo.style.opacity = "0";
      return;
    }
    rysujZnak(s, tz);
  });

  return (
    <div className={styles.znak} ref={refKorzen}>
      {/* Plotno lezy POD napisem i jest czysto dekoracyjne. Do konca przebiegu
          zostaje puste, a warstwa tekstowa dochodzi do pelnej widocznosci —
          czyli klatka koncowa to dokladnie to, co widac bez JavaScriptu. */}
      <canvas ref={refPlotno} className={styles.znakPlotno} aria-hidden="true" />
      <div className={styles.znakSlowo} ref={refSlowo}>
        RAG<span className={styles.znakAkcent}>ent</span>
      </div>
    </div>
  );
}
