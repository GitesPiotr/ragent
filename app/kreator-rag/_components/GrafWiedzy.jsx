'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { komunikatBledu } from '@/app/kreator-rag/_lib/bledy.js';
import { FIZYKA, krok, promien, grubosc, stanWygaszania, pozycjeStartowe } from '@/lib/mapview/fizyka.js';
import { kluczZadania, czyPrzyjac } from '@/lib/mapview/zadania.js';
import styles from '../kreator-rag.module.css';
import {
  stopienPojec,
  pojecNaDokument,
  podpisLicznika,
  podpisPojec,
  podpisyPrzygaszonych,
  skrocEtykiete,
} from '@/lib/mapview/graf.js';

// Graf wiedzy (Sesja 9): dokumenty i pojęcia jako węzły, krawędź = „to pojęcie
// występuje w tym dokumencie". Fragmenty pojawiają się dopiero po kliknięciu
// pojęcia, jako promienie z klikniętego węzła.
//
// UCZCIWOŚĆ (12.9) — ruch jest tu DOZWOLONY i to jest inna sytuacja niż na mapie:
// tam współrzędne liczy PCA przed narysowaniem, więc ruch punktu byłby animacją
// udającą pracę. Tutaj węzły naprawdę szukają swoich pozycji — ruch JEST działaniem
// algorytmu układania. Konsekwentnie: gdy układ zbiegnie, ruch przestaje cokolwiek
// znaczyć i pętla się zatrzymuje. Rusza z powrotem tylko wtedy, gdy naprawdę jest
// co przeliczyć: po przeciągnięciu węzła, po zmianie danych, po rozwinięciu pojęcia.
//
// CZEGO NIE BIERZEMY Z PROTOTYPU rag-graf-pro.html (tabela w 12.9): jego SEKWENCJI
// BUDOWY. Tamten pokazuje fragmenty jako węzły i buduje graf w trakcie indeksowania.
// Wygląd — węzły, krawędzie, poświaty, podświetlenia — bierzemy stamtąd.

const WYSOKOSC = 620;
const R_DOKUMENT = [7, 22];
const R_POJECIE = [4, 14];
const R_FRAGMENT = 3.2;
const LIMIT_FRAGMENTOW = 30;

// =============================================================================
//  PRÓG WYSTĄPIEŃ — DOMYŚLNIE 2, I TO JEST LICZBA Z POMIARU
//
//  Zmierzone na Regulaminach po Kodeksie (scripts/sym-skala-grafu.mjs):
//
//    próg   pojęć   węzłów   odstęp   wyciszenie
//    ≥ 1     565      573     29 px   1432 klatki (24 s), podpisy zachodzą
//    ≥ 2     157      165     54 px    236 klatek (3,9 s)
//    ≥ 3      86       94     72 px    168 klatek (2,8 s)
//    ≥ 5      40       48    100 px    577 klatek (9,6 s)
//
//  Dwójka nie wynika z kosztu fizyki — po naprawach zbiega nawet 573 węzły.
//  Wynika z CZYTELNOŚCI: przy 29 px na węzeł podpisy zachodzą na siebie, bo sam
//  węzeł pojęcia ma do 28 px średnicy. Wyżej niż 2 nie idziemy domyślnie, bo
//  próg 3 zaczyna odsiewać pojęcia, które w jednym dokumencie coś znaczą.
//
//  --- PRZEMIERZONE 29.07.2026 PO RODO I PO NORMALIZACJI: DOMYŚLNIE 4 ---------
//
//  Korpus urósł 565 → 993 pojęcia (8 dokumentów, RODO + Kodeks pracy), więc tamten
//  pomiar przestał obowiązywać. Powtórka na prawdziwej szerokości płótna
//  (scripts/sym-czytelnosc-po-rodo.mjs, 864×620):
//
//    próg   pojęć   zlane pary   mediana   podpis↔węzeł   podpis↔podpis
//    ≥ 1     993          962     23 px            225    49
//    ≥ 2     276           44     37 px             61    24
//    ≥ 3     164            3     44 px             24    24
//    ≥ 4     121            0     47 px             26    19
//    ≥ 5      93            0     50 px              9    24
//    ≥ 6      86            0     51 px             19    17
//
//  KRYTERIUM BYŁO USTALONE PRZED POZNANIEM WYNIKU: próg to punkt, w którym jedyna
//  rozdzielająca miara się nasyca. Przy 565 pojęciach wypadało 3, teraz wypada 4.
//  Zostanie przy 3 „bo tylko trzy zlane pary" byłoby zmianą kryterium w chwili, gdy
//  zero przesunęło się o jedno oczko — czyli dopasowaniem reguły do wyniku.
//
//  KOSZT, ŻEBY NIE WYGLĄDAŁ NA DARMOWY: 121 pojęć zamiast 164, o 43 mniej w widoku,
//  a na trójce zlane pary to zaledwie 3 z 164 węzłów (1,8%). Płacimy realną cenę za
//  trzymanie się kryterium. Łagodzi to suwak i reguła „most omija próg" — wszystkie
//  51 mostów widać na KAŻDYM progu.
//
//  ZOSTAŁA JEDNA MIARA ZDOLNA COKOLWIEK ROZDZIELIĆ. Po normalizacji podpis↔węzeł
//  przestał być monotoniczny (61 → 24 → 26 → 9 → 19); podpis↔podpis nie był nim już
//  wcześniej (24 → 24 → 19 → 24 → 17). Obie wahają się w granicach błędu przybliżenia
//  szerokości tekstu (0,55 znaku), więc wybór na ich podstawie byłby wyborem szumu.
//  DLA NASTĘPNEJ OSOBY PRZEMIERZAJĄCEJ PRÓG: jeśli rozmyje się także „zlane pary",
//  nie ma na czym oprzeć wyboru — i wtedy trzeba to POWIEDZIEĆ, a nie wybrać
//  najładniejszą liczbę.
//
//  DLACZEGO NIE „TYLKO MOSTY" JAKO DOMYŚLNE: przeciwwskazanie jest konkretne —
//  kolekcja bez mostów otwierałaby się jako sam zbiór dokumentów bez ani jednego
//  pojęcia, a taki stan miały Regulaminy przed Kodeksem (diag-mosty.mjs powstał
//  właśnie po to pytanie). Domyślny widok, który dla całej klasy kolekcji nie
//  pokazuje nic, wygląda na usterkę. „Tylko mosty" jest jedno kliknięcie dalej.
// =============================================================================
const PROG_DOMYSLNY = 4;
const PROG_MAKS_SUWAKA = 10;
// Suwak ma dawać wrażenie natychmiastowe, ale nie wołać serwera na każdy piksel.
const ZWLOKA_SUWAKA = 250;

// Most = pojęcie sięgające dwóch lub więcej dokumentów. Rysowane złotem z poświatą
// i ZAWSZE z podpisem; pozostałe pojęcia biorą kolor swojego dokumentu i pokazują
// podpis dopiero pod kursorem.
//
// DLACZEGO KOLOR, A NIE ROZMIAR: rozmiar koduje już `mentionCount`. Dołożenie do
// niego stopnia węzła zrobiłoby z dwóch zmiennych jedną nieczytelną — nie dałoby
// się odróżnić „pojęcie częste w jednym pliku" od „pojęcie rzadkie, ale wspólne",
// a to drugie jest właśnie tym, po co ten widok istnieje.
const ZLOTO = '#fbbf24';
const ZLOTO_JASNE = '#fde68a';
const PRZYGASZONY = '#5a6272';

export default function GrafWiedzy({ collectionId }) {
  const [dane, setDane] = useState(null);
  const [blad, setBlad] = useState(null);
  const [wybrane, setWybrane] = useState(null); // { conceptId, label, chunks, total }
  const [wczytujeFragmenty, setWczytujeFragmenty] = useState(false);
  const [dymek, setDymek] = useState(null);
  const [wystygl, setWystygl] = useState(false);
  // Dwie wartości progu: `progSuwaka` rusza się pod palcem, `progDanych` jest tym,
  // dla którego naprawdę poszło zapytanie. Bez tego rozdziału każdy piksel ruchu
  // suwaka byłby jednym odczytem 565 pojęć.
  const [progSuwaka, setProgSuwaka] = useState(PROG_DOMYSLNY);
  const [progDanych, setProgDanych] = useState(PROG_DOMYSLNY);
  const [tylkoMosty, setTylkoMosty] = useState(false);
  const [wczytuje, setWczytuje] = useState(true);
  // Szerokość płótna JAKO STAN, mierzona raz — nie czytana w każdej klatce.
  // Druga przyczyna braku powtarzalności: pętla brała `canvas.clientWidth || 900`
  // sześćdziesiąt razy na sekundę, a przed ułożeniem strony clientWidth wynosi 0,
  // więc wchodziło zapasowe 900 zamiast prawdziwych ~700. Ile klatek zdążyło polecieć
  // na złej szerokości, zależało od tego, jak szybko przeglądarka policzyła układ —
  // a szerokość wchodzi i w siłę do środka, i w położenie ścian. Zmierzone: sześć
  // różnych układów, węzeł odjeżdżał do 65 px.
  const [szerokosc, setSzerokosc] = useState(0);

  const canvasRef = useRef(null);
  const obudowaRef = useRef(null);
  // Cały stan symulacji żyje w ref, nie w useState: pętla animacji dotyka go
  // 60 razy na sekundę, a każdy setState wywoływałby przerysowanie Reacta.
  const symRef = useRef({ wezly: [], krawedzie: [], wgId: new Map(), spokojnych: 0, pomiar: { ruch: 0, maks: 0 } });
  const rafRef = useRef(0);
  // Tożsamość danych, na których zbudowano poprzedni układ. Dziedziczenie pozycji
  // wolno TYLKO w obrębie tych samych danych (rozwinięcie pojęcia) — przy zmianie
  // progu albo trybu startujemy od spirali, inaczej układ zależy od tego, po ilu
  // sekundach człowiek kliknął. Uzasadnienie i pomiar: komentarz przy pozycjeStartowe.
  const daneUkladuRef = useRef(null);
  // Numer i klucz ostatniego wysłanego pytania o dane. Odpowiedź niepasująca do nich
  // jest ODRZUCANA, nie rysowana — uzasadnienie i testy w lib/mapview/zadania.js.
  const zadanieRef = useRef({ nr: 0, klucz: '' });
  const przerwijRef = useRef(null);
  const myszRef = useRef({ x: 0, y: 0, nad: null, trzyma: null });

  // Szerokość mierzymy przy wejściu i przy PRAWDZIWEJ zmianie rozmiaru, nie w klatce.
  // Zmiana szerokości jest zmianą wejścia układu, więc pociąga przebudowę — tak samo
  // jak zmiana danych. Zaokrąglamy do piksela: subpikselowe drgnięcia układu strony
  // nie mają prawa przebudowywać grafu.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zmierz = () => {
      const w = Math.round(canvas.clientWidth);
      if (w > 0) setSzerokosc((poprzednia) => (poprzednia === w ? poprzednia : w));
    };
    zmierz();
    const obs = new ResizeObserver(zmierz);
    obs.observe(canvas);
    return () => obs.disconnect();
  }, []);

  // Zwłoka suwaka: dopiero gdy palec stanie, próg staje się progiem danych.
  useEffect(() => {
    if (progSuwaka === progDanych) return;
    const t = setTimeout(() => setProgDanych(progSuwaka), ZWLOKA_SUWAKA);
    return () => clearTimeout(t);
  }, [progSuwaka, progDanych]);

  // --- dane -----------------------------------------------------------------
  // Filtr jedzie do RDZENIA jako parametr odczytu, nie do rysowania. Przeglądarka
  // dostaje 157 pojęć, a nie 565 z czego 408 ukrytych — inaczej cały zysk zniknąłby,
  // bo fizyka liczyłaby i tak wszystkie (lib/rag/graph.js opisuje to szerzej).
  const wczytaj = useCallback(async () => {
    // Znacznik TEGO pytania. Wszystko poniżej sprawdza go przed dotknięciem stanu,
    // żeby spóźniona odpowiedź nie mogła nadpisać świeższej (usterka: interfejs
    // w trybie „tylko mosty" z danymi progu 2 i napisem „układanie zatrzymane").
    const klucz = kluczZadania({ minMentions: progDanych, tylkoMosty });
    const znacznik = { nr: zadanieRef.current.nr + 1, klucz };
    zadanieRef.current = znacznik;

    // Przerwanie poprzedniego odczytu: tania oszczędność, ale NIE zabezpieczenie —
    // przerwanie może nie zdążyć, dlatego prawdziwym warunkiem jest `czyPrzyjac`.
    if (przerwijRef.current) przerwijRef.current.abort();
    const przerwanie = new AbortController();
    przerwijRef.current = przerwanie;

    setWczytuje(true);
    try {
      const pytanie = tylkoMosty ? 'tylkoMosty=1' : `minMentions=${progDanych}`;
      const res = await fetch(`/api/rag/collections/${collectionId}/graph?${pytanie}`, {
        cache: 'no-store',
        signal: przerwanie.signal,
      });
      const json = await res.json();
      if (!czyPrzyjac(znacznik, zadanieRef.current)) return;
      if (json.error) {
        setBlad(komunikatBledu(json.error));
        return;
      }
      setBlad(null);
      setDane(json);
      // Rozwinięte pojęcie mogło właśnie wypaść przez próg. Jego fragmenty muszą
      // zniknąć razem z nim, inaczej zostałyby na płótnie jako sieroty bez węzła,
      // z którego wyszły.
      setWybrane((w) => (w && !json.concepts.some((c) => c.id === w.conceptId) ? null : w));
    } catch (e) {
      // Przerwany odczyt to nie awaria — to my go przerwaliśmy, bo pytanie się zmieniło.
      if (e && e.name === 'AbortError') return;
      if (!czyPrzyjac(znacznik, zadanieRef.current)) return;
      setBlad('Nie udało się pobrać grafu: ' + (e && e.message));
    } finally {
      // Napis „wczytywanie…" gasi TYLKO odpowiedź na aktualne pytanie. Inaczej
      // spóźniona odpowiedź ogłaszałaby gotowość widoku, który nadal czeka na dane.
      if (czyPrzyjac(znacznik, zadanieRef.current)) setWczytuje(false);
    }
  }, [collectionId, progDanych, tylkoMosty]);

  useEffect(() => {
    wczytaj();
  }, [wczytaj]);

  const stopnie = useMemo(() => stopienPojec(dane ? dane.edges : []), [dane]);
  const pojecDokumentu = useMemo(() => pojecNaDokument(dane ? dane.edges : []), [dane]);
  const mosty = useMemo(() => [...stopnie.values()].filter((n) => n > 1).length, [stopnie]);

  // --- budowa węzłów --------------------------------------------------------
  // Przebudowa TYLKO przy zmianie danych albo rozwinięcia. Nie w każdej klatce —
  // inaczej węzły traciłyby wypracowane pozycje i graf drgałby w miejscu.
  useEffect(() => {
    if (!dane) return;
    // Czekamy na PRAWDZIWĄ szerokość. Budowanie układu na zapasowej wartości, a potem
    // liczenie fizyki na innej, było jedną z dwóch przyczyn braku powtarzalności.
    if (!szerokosc) return;
    const szer = szerokosc;
    const wys = WYSOKOSC;

    const poprzednie = symRef.current.wezly;
    // Te same dane = ta sama odpowiedź serwera (tożsamość obiektu) ORAZ ta sama
    // szerokość płótna. Zmiana szerokości jest zmianą geometrii, więc też re-startuje.
    const teSameDane =
      daneUkladuRef.current !== null &&
      daneUkladuRef.current.dane === dane &&
      daneUkladuRef.current.szer === szerokosc;
    const wezly = [];
    const wgId = new Map();

    const maksFragmentow = Math.max(1, ...dane.documents.map((d) => d.chunkCount));
    const maksWystapien = Math.max(1, ...dane.concepts.map((c) => c.mentionCount));
    const kolorDokumentu = new Map(dane.documents.map((d) => [d.id, d.color]));

    // Węzły powstają najpierw BEZ pozycji — współrzędne nadaje jedna funkcja z lib
    // (pozycjeStartowe), żeby reguła „dziedzicz tylko z układu wyciszonego" miała
    // jedno miejsce i test, a nie była warunkiem rozsypanym po komponencie.
    const dodaj = (w) => {
      wgId.set(w.id, wezly.length);
      wezly.push(w);
      return w;
    };

    for (const d of dane.documents) {
      dodaj({
        id: 'dok:' + d.id,
        typ: 'dokument',
        etykieta: d.name,
        kolor: d.color,
        r: promien(d.chunkCount, maksFragmentow, R_DOKUMENT[0], R_DOKUMENT[1]),
        // Dokument bez pojęć zostaje w grafie, ale przygaszony. Ukrycie 510
        // fragmentów Kodeksu w widoku nazwanym „graf kolekcji" byłoby kłamstwem
        // tej samej klasy, którą wyklucza 12.9.
        pusty: !pojecDokumentu.get(d.id),
        opis: `${d.chunkCount} fragmentów · ${pojecDokumentu.get(d.id) || 0} pojęć`,
      });
    }

    for (const c of dane.concepts) {
      const stopien = stopnie.get(c.id) || 0;
      const most = stopien > 1;
      // Pojęcie należące do jednego dokumentu dziedziczy jego kolor — od razu widać,
      // z którego pliku pochodzi. Most dostaje złoto, bo nie należy do żadnego.
      const wlasciciel = most
        ? null
        : (dane.edges.find((e) => e.conceptId === c.id) || {}).documentId;
      dodaj({
        id: 'poj:' + c.id,
        conceptId: c.id,
        typ: 'pojecie',
        etykieta: c.label,
        kolor: most ? ZLOTO : kolorDokumentu.get(wlasciciel) || PRZYGASZONY,
        most,
        r: promien(c.mentionCount, maksWystapien, R_POJECIE[0], R_POJECIE[1]),
        opis: `${c.mentionCount} wystąpień · ${stopien} ${stopien === 1 ? 'dokument' : 'dokumenty'}`,
      });
    }

    const krawedzie = [];
    const maksWagi = Math.max(1, ...dane.edges.map((e) => e.weight));
    for (const e of dane.edges) {
      const a = wgId.get('dok:' + e.documentId);
      const b = wgId.get('poj:' + e.conceptId);
      if (a === undefined || b === undefined) continue;
      krawedzie.push({ a, b, w: grubosc(e.weight, maksWagi), waga: e.weight, kolor: wezly[a].kolor });
    }

    // Promienie rozwiniętego pojęcia. Tylko JEDNO pojęcie naraz — dzięki temu
    // liczba węzłów nie przekracza dokumenty + pojęcia + 30, niezależnie od tego,
    // jak popularne pojęcie kliknięto.
    if (wybrane && wybrane.chunks) {
      const srodek = wgId.get('poj:' + wybrane.conceptId);
      for (const f of wybrane.chunks) {
        const idx = wezly.length;
        dodaj({
          id: 'frg:' + f.chunkId,
          typ: 'fragment',
          etykieta: f.headingPath || f.fileName || '',
          kolor: kolorDokumentu.get(f.documentId) || PRZYGASZONY,
          r: R_FRAGMENT,
          opis: (f.content || '').replace(/\s+/g, ' ').slice(0, 160),
          plik: f.fileName,
        });
        if (srodek !== undefined) krawedzie.push({ a: srodek, b: idx, w: 0.7, waga: 1, kolor: wezly[idx].kolor });
      }
    }

    // WSPÓŁRZĘDNE NA KOŃCU, gdy znana jest już pełna lista węzłów: gęstość spirali
    // zależy od tego, ile ich jest, a przy rozwiniętym pojęciu dochodzi do 30 fragmentów.
    const start = pozycjeStartowe(wezly, {
      poprzednie,
      dziedzicz: teSameDane,
      szer,
      wys,
    });
    for (let i = 0; i < wezly.length; i++) Object.assign(wezly[i], start[i]);
    daneUkladuRef.current = { dane, szer: szerokosc };

    // Szerokość zapamiętana RAZEM z układem: pętla ma liczyć fizykę na tej samej
    // szerokości, na której rozstawiła węzły.
    symRef.current = { wezly, krawedzie, wgId, szer, spokojnych: 0, pomiar: { ruch: 1, maks: 1 } };
    setWystygl(false);
  }, [dane, wybrane, stopnie, pojecDokumentu, szerokosc]);

  // --- rysowanie ------------------------------------------------------------
  const rysuj = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const szer = canvas.clientWidth;
    const wys = WYSOKOSC;
    if (canvas.width !== szer * dpr || canvas.height !== wys * dpr) {
      canvas.width = szer * dpr;
      canvas.height = wys * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tlo = ctx.createRadialGradient(szer / 2, wys * 0.45, 0, szer / 2, wys * 0.45, szer * 0.75);
    tlo.addColorStop(0, '#151327');
    tlo.addColorStop(1, '#0b0a10');
    ctx.fillStyle = tlo;
    ctx.fillRect(0, 0, szer, wys);

    ctx.strokeStyle = 'rgba(255,255,255,.028)';
    ctx.lineWidth = 1;
    for (let x = 0; x < szer; x += 38) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, wys);
      ctx.stroke();
    }
    for (let y = 0; y < wys; y += 38) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(szer, y);
      ctx.stroke();
    }

    const { wezly, krawedzie } = symRef.current;
    if (!wezly.length) {
      ctx.fillStyle = 'rgba(255,255,255,.24)';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Brak pojęć w tej kolekcji — graf nie ma czego pokazać', szer / 2, wys / 2);
      return;
    }

    const nad = myszRef.current.nad;
    // Podświetlenie sąsiedztwa: pod kursorem widać, co jest z czym połączone.
    const sasiedzi = new Set();
    if (nad !== null && nad !== undefined) {
      sasiedzi.add(nad);
      for (const e of krawedzie) {
        if (e.a === nad) sasiedzi.add(e.b);
        if (e.b === nad) sasiedzi.add(e.a);
      }
    }

    ctx.lineCap = 'round';
    for (const e of krawedzie) {
      const a = wezly[e.a];
      const b = wezly[e.b];
      if (!a || !b) continue;
      const podswietlona = sasiedzi.size ? sasiedzi.has(e.a) && sasiedzi.has(e.b) : true;
      ctx.globalAlpha = sasiedzi.size ? (podswietlona ? 0.95 : 0.05) : 0.3;
      ctx.strokeStyle = e.kolor;
      ctx.lineWidth = e.w;
      if (podswietlona && sasiedzi.size) {
        ctx.shadowColor = e.kolor;
        ctx.shadowBlur = 9;
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    // PODPISY ZBIERAMY, RYSUJEMY NA KOŃCU. Wcześniej każdy podpis lądował na płótnie
    // razem ze swoim węzłem, więc kolejne romby i szprychy gwiazdy Kodeksu rysowały się
    // NA NIM — „CELEX_32016R0679_PL_TXT" i „06-skan-zaswiadczenie.pdf" znikały pod
    // chmurą. Zmierzone: 27 kolizji podpisu z węzłem przy progu 2 i 79 przy progu 1.
    // Kolizji geometrycznych to nie usuwa (węzeł nadal tam jest) — usuwa ZASŁANIANIE.
    const podpisy = [];

    for (let i = 0; i < wezly.length; i++) {
      const w = wezly[i];
      const widoczny = sasiedzi.size ? sasiedzi.has(i) : true;
      ctx.globalAlpha = widoczny ? (w.pusty ? 0.42 : 1) : 0.12;

      if (w.typ === 'dokument') {
        const s = w.r;
        ctx.shadowColor = w.kolor;
        ctx.shadowBlur = w.pusty ? 0 : 16;
        ctx.fillStyle = w.pusty ? PRZYGASZONY : w.kolor;
        ctx.beginPath();
        ctx.roundRect(w.x - s, w.y - s, s * 2, s * 2, 4);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Podpis zostaje POD węzłem. Przesuwanie go promieniście na zewnątrz pierścienia
        // wydawało się oczywistą poprawą („gwiazdy rosną do środka, zewnątrz jest pusto")
        // i ZOSTAŁO ZMIERZONE JAKO NEUTRALNE ALBO GORSZE: 79 → 83 kolizji przy progu 1,
        // 27 → 29 przy progu 2. Rozumowanie było błędne, bo pojęcia rozkładają się także
        // NA ZEWNĄTRZ pierścienia. Wariant zostaje w scripts/sym-pierscien.mjs za flagą,
        // żeby nikt nie próbował go po raz drugi bez pomiaru.
        podpisy.push({
          tekst: skrocEtykiete(w.etykieta, 26),
          x: w.x,
          y: w.y + s + 14,
          font: '700 10.5px system-ui, sans-serif',
          kolor: 'rgba(255,255,255,.92)',
          waga: 2, // dokumenty na samej górze
          // PODPIS PEŁNĄ KRYCIA, nawet gdy węzeł jest przygaszony. Przygaszenie ma
          // mówić „ten dokument nie ma pojęć" — i mówi to KOLOREM WĘZŁA oraz legendą.
          // Przygaszona NAZWA PLIKU nie jest łagodniejszym sygnałem, tylko sygnałem
          // straconym: „CELEX_32016R0679_PL_TXT" i „06-skan-zaswiadczenie.pdf" były
          // nieczytelne nad jasną chmurą rombów właśnie z tego powodu, nie z kolejności
          // rysowania. Wygaszenie z podświetlenia sąsiedztwa (0,12) zostaje — to jest
          // celowe skupienie uwagi, nie stan danych.
          alfa: widoczny ? 1 : 0.12,
        });
      } else if (w.typ === 'pojecie') {
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.rotate(Math.PI / 4);
        ctx.shadowColor = w.most ? ZLOTO : w.kolor;
        ctx.shadowBlur = w.most ? 18 : 5;
        ctx.fillStyle = myszRef.current.nad === i ? ZLOTO_JASNE : w.kolor;
        ctx.fillRect(-w.r, -w.r, w.r * 2, w.r * 2);
        ctx.restore();
        ctx.shadowBlur = 0;
        // Most jest podpisany ZAWSZE — po to jest widok. Reszta dopiero pod kursorem
        // albo gdy jest rozwinięta, inaczej czterdzieści etykiet zachodzi na siebie.
        const podpisz = w.most || myszRef.current.nad === i || (wybrane && wybrane.conceptId === w.conceptId);
        if (podpisz && widoczny) {
          podpisy.push({
            tekst: skrocEtykiete(w.etykieta),
            x: w.x,
            y: w.y - w.r - 7,
            font: (w.most ? '700 ' : '600 ') + '10px system-ui, sans-serif',
            kolor: w.most ? 'rgba(253,230,138,.95)' : 'rgba(230,232,236,.9)',
            waga: 1,
            alfa: widoczny ? 1 : 0.12,
          });
        }
      } else {
        ctx.shadowColor = w.kolor;
        ctx.shadowBlur = myszRef.current.nad === i ? 12 : 4;
        ctx.fillStyle = w.kolor;
        ctx.beginPath();
        ctx.arc(w.x, w.y, myszRef.current.nad === i ? w.r * 1.6 : w.r, 0, 6.3);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;

    // WARSTWA PODPISÓW — na samym końcu, dokumenty na wierzchu pojęć.
    // Obwódka w kolorze tła zamiast prostokątnego tła: prostokąt zasłoniłby węzły
    // i krawędzie, czyli dane. Obrys zostawia je widoczne, a tekst czyta się
    // na każdym tle — to ta sama zasada co „przygasić, nie ukryć" przy dokumentach
    // bez pojęć.
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const p of podpisy.sort((a, b) => a.waga - b.waga)) {
      ctx.globalAlpha = p.alfa;
      ctx.font = p.font;
      ctx.strokeStyle = 'rgba(8,8,12,.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(p.tekst, p.x, p.y);
      ctx.fillStyle = p.kolor;
      ctx.fillText(p.tekst, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }, [wybrane]);

  // --- pętla ----------------------------------------------------------------
  // Zatrzymuje się po zbiegnięciu układu. To nie jest oszczędność procesora
  // (choć nią też jest) — ruch po zbiegnięciu nie oznaczałby już żadnej pracy.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let zyje = true;

    const klatka = () => {
      if (!zyje) return;
      const sym = symRef.current;
      // Szerokość Z UKŁADU, nie z DOM-u. Czytanie clientWidth w klatce było przyczyną
      // rozjazdu: dopóki strona się nie ułoży, zwraca 0 i wchodzi zapasowa wartość.
      const szer = sym.szer || 0;
      if (!szer) {
        rysuj();
        rafRef.current = requestAnimationFrame(klatka);
        return;
      }
      if (!sym.wystygl) {
        const pomiar = krok(sym.wezly, sym.krawedzie, { szer, wys: WYSOKOSC });
        const stan = stanWygaszania(sym.spokojnych, pomiar);
        sym.spokojnych = stan.spokojnych;
        sym.pomiar = pomiar;
        if (stan.wystygl) {
          sym.wystygl = true;
          setWystygl(true);
        }
      }
      rysuj();
      rafRef.current = requestAnimationFrame(klatka);
    };
    rafRef.current = requestAnimationFrame(klatka);
    return () => {
      zyje = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [rysuj]);

  const dogrzej = useCallback(() => {
    symRef.current.wystygl = false;
    symRef.current.spokojnych = 0;
    setWystygl(false);
  }, []);

  // --- interakcja -----------------------------------------------------------
  const wezelPod = useCallback((x, y) => {
    const { wezly } = symRef.current;
    for (let i = wezly.length - 1; i >= 0; i--) {
      const w = wezly[i];
      const zapas = Math.max(w.r, 6) + 4;
      if (Math.abs(w.x - x) <= zapas && Math.abs(w.y - y) <= zapas) return i;
    }
    return null;
  }, []);

  const naRuch = useCallback(
    (e) => {
      const prost = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - prost.left;
      const y = e.clientY - prost.top;
      myszRef.current.x = x;
      myszRef.current.y = y;

      const trzyma = myszRef.current.trzyma;
      if (trzyma !== null && trzyma !== undefined) {
        const w = symRef.current.wezly[trzyma];
        if (w) {
          // Przeciągnięcie o więcej niż kilka pikseli to PRZESTAWIANIE, nie klik.
          // Bez tego rozróżnienia każde poprawienie układu kończyłoby się
          // rozwinięciem albo zwinięciem pojęcia, którego nikt nie chciał kliknąć.
          if (Math.hypot(x - w.x, y - w.y) > 3) myszRef.current.przesunieto = true;
          w.x = x;
          w.y = y;
          dogrzej();
        }
        return;
      }

      const i = wezelPod(x, y);
      myszRef.current.nad = i;
      const w = i === null ? null : symRef.current.wezly[i];
      setDymek(
        w
          ? { x, y, tytul: w.etykieta, opis: w.opis, plik: w.plik, typ: w.typ }
          : null
      );
    },
    [wezelPod, dogrzej]
  );

  const rozwin = useCallback(
    async (conceptId, label) => {
      if (wybrane && wybrane.conceptId === conceptId) {
        setWybrane(null);
        return;
      }
      setWczytujeFragmenty(true);
      try {
        const res = await fetch(
          `/api/rag/collections/${collectionId}/concepts/${conceptId}/chunks?limit=${LIMIT_FRAGMENTOW}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (json.error) {
          setBlad(komunikatBledu(json.error));
          return;
        }
        setWybrane({ conceptId, label, chunks: json.chunks, total: json.total });
      } catch (e) {
        setBlad('Nie udało się pobrać fragmentów: ' + (e && e.message));
      } finally {
        setWczytujeFragmenty(false);
      }
    },
    [collectionId, wybrane]
  );

  const naDol = useCallback(
    (e) => {
      const prost = e.currentTarget.getBoundingClientRect();
      const i = wezelPod(e.clientX - prost.left, e.clientY - prost.top);
      if (i === null) return;
      const w = symRef.current.wezly[i];
      w.trzymany = true;
      myszRef.current.trzyma = i;
      myszRef.current.przesunieto = false;
    },
    [wezelPod]
  );

  const naGore = useCallback(() => {
    const i = myszRef.current.trzyma;
    const przesunieto = myszRef.current.przesunieto;
    myszRef.current.trzyma = null;
    myszRef.current.przesunieto = false;
    if (i === null || i === undefined) return;
    const w = symRef.current.wezly[i];
    // Dokument zostaje PRZYPIĘTY także po przeciągnięciu — inaczej jedno pociągnięcie
    // wypuszczałoby go w fizykę i wracałby problem, którego pierścień ma nie mieć.
    // Przeciągnięty stoi tam, gdzie go postawiono, do następnego wejścia na stronę.
    if (w) w.trzymany = w.typ === 'dokument';
    dogrzej();
    if (!przesunieto && w && w.typ === 'pojecie') rozwin(w.conceptId, w.etykieta);
  }, [dogrzej, rozwin]);

  // --- widok ----------------------------------------------------------------
  const totals = dane && dane.totals ? dane.totals : null;
  // Dokumenty bez krawędzi, POGRUPOWANE PO POWODZIE. Trzy różne powody dostają trzy
  // różne zdania, bo jedno wspólne („brak pojęć przy tym progu") jest nieprawdziwe
  // dla dokumentu, który nie ma policzonych pojęć w ogóle — reguła i jej uzasadnienie
  // siedzą w podpisyPrzygaszonych() w lib/mapview/graf.js, razem z testem.
  const przygaszone = dane
    ? podpisyPrzygaszonych(dane.documents, (d) => pojecDokumentu.get(d.id))
    : [];

  return (
    <div>
      {/* Legenda STOI OBOK płótna, nie na nim. Nałożona przykrywała węzły —
          „03-pracownicy.csv" był przez nią przycięty do „3-pracownicy.csv" —
          a widok, który zasłania własne dane, sam sobie przeczy. */}
      <div className={styles["graf-uklad"]}>
        <div className={styles["graf-legenda"]}>
        <div className={styles["mapa-panel"]}>
          <strong style={{ fontSize: 12 }}>
            {dane
              ? `${dane.documents.length} dokumentów · ${dane.edges.length} powiązań`
              : 'wczytywanie…'}
          </strong>

          {/* LICZNIK 12.9 — ta sama zasada co „pokazano 30 z 312" przy fragmentach.
              Filtr ukrywa 408 z 565 pojęć i widok nie ma prawa tego przemilczeć. */}
          {totals ? (
            <strong style={{ fontSize: 12, color: totals.shown < totals.concepts ? ZLOTO_JASNE : undefined }}>
              {podpisPojec(totals.shown, totals.concepts)}
            </strong>
          ) : null}

          <span className={styles["legenda-wpis"]}>
            <span className={styles.probka} style={{ background: ZLOTO, transform: 'rotate(45deg)' }} />
            {mosty
              ? `${mosty} pojęć wspólnych (≥2 dokumenty)`
              : 'brak pojęć wspólnych — każde należy do jednego pliku'}
          </span>

          {/* Obietnica, którą trzyma rdzeń: most omija próg. Bez tego napisu suwak
              wyglądałby jak coś, co może ukryć właśnie to, po co ten widok jest. */}
          <span className={styles["legenda-wpis"]} style={{ fontSize: 11 }}>
            mosty widoczne zawsze, niezależnie od progu
          </span>

          {/* STAN POŚREDNI POTOKU — napis, nie ukrycie danych. Liczby zostają widoczne
              i przestają udawać końcowe. Powód w sql/session-normalizacja-znacznik.sql:
              po dołożeniu RODO graf ogłaszał „1066 pojęć, 43 mosty" przy stu
              niescalonych duplikatach w bazie, bo krok scalania został pominięty,
              a nic tego nie sygnalizowało. */}
          {dane && dane.normalizacjaOczekuje ? (
            <span className={styles["legenda-wpis"]} style={{ fontSize: 11, alignItems: 'flex-start', color: ZLOTO_JASNE }}>
              <span className={styles.probka} style={{ background: ZLOTO_JASNE, marginTop: 3 }} />
              <span>
                pojęcia policzone, scalanie duplikatów oczekuje —
                <span style={{ display: 'block' }}>liczba pojęć i mostów może się jeszcze zmienić</span>
              </span>
            </span>
          ) : null}

          {przygaszone.length ? (
            <span className={styles["legenda-wpis"]} style={{ fontSize: 11, alignItems: 'flex-start' }}>
              <span className={styles.probka} style={{ background: PRZYGASZONY, marginTop: 3 }} />
              <span>
                przygaszone dokumenty — nie usterka:
                {przygaszone.map((p) => (
                  <span key={p.powod} style={{ display: 'block' }}>
                    {p.tekst}
                  </span>
                ))}
              </span>
            </span>
          ) : null}

          {/* „Zatrzymane", nie „zbiegło" — zmierzone, że przy pełnych 573 węzłach układ
              po wygaszeniu wciąż by pełzał (do 319 px przez 2000 klatek). Największa
              gwiazda ma 538 liści na okręgu, na którym mieszczą się dziesiątki, więc
              równowagi tam nie ma. Napis „układ zbiegł" byłby na wyrost. */}
          <span className={styles["legenda-wpis"]} style={{ fontSize: 11 }}>
            {wczytuje
              ? 'wczytywanie danych…'
              : wystygl
                ? 'układanie zatrzymane — ruch poniżej progu widoczności'
                : 'układanie w toku…'}
          </span>
          <span className={styles["legenda-wpis"]} style={{ fontSize: 11 }}>
            kliknij pojęcie, żeby zobaczyć jego fragmenty
          </span>
          </div>
        </div>

        <div className={styles["mapa-obudowa"]} ref={obudowaRef}>
          <div className={styles["mapa-sterowanie"]}>
          <div className={styles.przelacznik}>
            <button
              className={tylkoMosty ? '' : styles.wybrany}
              onClick={() => setTylkoMosty(false)}
              title="Pojęcia od progu wystąpień w górę, plus wszystkie mosty"
            >
              Próg
            </button>
            <button
              className={tylkoMosty ? styles.wybrany : ''}
              onClick={() => setTylkoMosty(true)}
              title="Wyłącznie pojęcia sięgające dwóch lub więcej dokumentów"
            >
              Tylko mosty
            </button>
          </div>
          {!tylkoMosty ? (
            <label className={styles["graf-suwak"]} title="Minimalna liczba wystąpień pojęcia">
              <span>≥ {progSuwaka}×</span>
              <input
                type="range"
                min="1"
                max={PROG_MAKS_SUWAKA}
                step="1"
                value={progSuwaka}
                onChange={(e) => setProgSuwaka(Number(e.target.value))}
              />
            </label>
          ) : null}
        </div>

        <canvas
          ref={canvasRef}
          className={styles["mapa-plotno"]}
          style={{ height: WYSOKOSC }}
          onMouseMove={naRuch}
          onMouseDown={naDol}
          onMouseUp={naGore}
          onMouseLeave={() => {
            myszRef.current.nad = null;
            myszRef.current.trzyma = null;
            setDymek(null);
          }}
        />

        {dymek ? (
          <div
            className={styles["mapa-dymek"]}
            style={{
              left: Math.min(dymek.x + 14, (obudowaRef.current?.clientWidth || 900) - 320),
              top: Math.min(dymek.y + 14, WYSOKOSC - 90),
            }}
          >
            {dymek.plik ? <div className={styles.zrodlo}>{dymek.plik}</div> : null}
            <strong>{dymek.tytul}</strong>
            <div style={{ color: 'var(--przygaszony)', marginTop: 3 }}>{dymek.opis}</div>
          </div>
          ) : null}
        </div>
      </div>

      {blad ? <p className={`${styles.komunikat} ${styles["blad-formularza"]}`}>{blad}</p> : null}

      {wybrane ? (
        <div className={styles.karta} style={{ marginTop: 14 }}>
          <div className={styles["naglowek-karty"]}>
            <span>
              Fragmenty pojęcia <strong>{wybrane.label}</strong>
            </span>
            <span className={styles.meta}>{podpisLicznika(wybrane.chunks.length, wybrane.total)}</span>
          </div>
          {wybrane.chunks.map((f) => (
            <div className={styles.trafienie} key={f.chunkId}>
              <div className={styles["trafienie-naglowek"]}>
                <span className={styles["trafienie-plik"]}>
                  {f.fileName}
                  {f.headingPath ? ` › ${f.headingPath}` : ''}
                  {f.pageFrom ? ` · s. ${f.pageFrom}` : ''}
                </span>
              </div>
              <div className={styles["trafienie-tresc"]}>{f.content}</div>
            </div>
          ))}
        </div>
      ) : wczytujeFragmenty ? (
        <p className={styles.komunikat}>Wczytuję fragmenty…</p>
      ) : null}
    </div>
  );
}
