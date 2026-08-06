'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useIndeksowanie } from '@/app/kreator-rag/_hooks/useIndeksowanie.js';
import { komunikatBledu } from '@/app/kreator-rag/_lib/bledy.js';
import { useMotyw } from '@/lib/hooks/useMotyw.js';
import { useRedukcjaRuchu } from '@/lib/hooks/useRedukcjaRuchu.js';
import { useRozmiarOkna } from '@/lib/hooks/useRozmiarOkna.js';
import { wysokoscPlotnaWOknie, otworzOknoMapy, adresOknaMapy } from '@/app/kreator-rag/_lib/trybOkna.js';
import {
  czyIndeksowanieTrwa,
  czyListaSieZmienila,
  czyDomknac,
  czyPrzeliczonoBaze,
  PULS_DOKUMENTOW,
  STATUSY_W_TOKU,
} from '@/app/kreator-rag/_lib/podgladNaZywo.js';
import {
  znacznikiKaskady,
  czasZapalania,
  fazaPunktu,
  cokolwiekTrwa,
  krycieSmugi,
  pierscien,
  srodekZbioru,
  CZAS_POSWIATY,
} from '@/app/kreator-rag/_lib/efektyMapy.js';
import { paletaDlaMotywu, koloryDokumentow } from '@/app/kreator-rag/_lib/paletaPlotna.js';
import { buildEdges, grupujPoKolorze, indeksKrawedzi, sredniKolor } from '@/lib/mapview/edges.js';
import styles from '../kreator-rag.module.css';
import {
  przygotujKlatke3d,
  kubelekGlebi,
  computeNeighbors3d,
  krawedzie3d,
} from '@/lib/mapview/przestrzen3d.js';

// Mapa fragmentów: punkty (Sesja 6) + połączenia i widok 3D (Sesja 6b).
// Do danych wyłącznie przez fetch. Importy z lib/mapview/ to czysta geometria bez
// window — świadomie POZA lib/rag/, żeby rdzeń kopiowany do AIDEAS nie wiózł widoku.
//
// UCZCIWOŚĆ (12.9) — co wolno, a czego nie:
//  • ZAKAZANE: ruch punktów udający proces. Współrzędne są policzone przez PCA przed
//    narysowaniem, więc punkty nie mają prawa "lecieć" ani "układać się".
//  • DOZWOLONE: obrót kamery w 3D (12.8) — punkty nie zmieniają położenia względem
//    siebie, zmienia się punkt patrzenia. To transformacja widoku, nie animacja danych.
//  • DOZWOLONE: krótkie podświetlenie nowej krawędzi — oznacza zdarzenie, które
//    naprawdę zaszło (fragment dostał współrzędne w pętli indeksowania z 10.3).
//  • DOZWOLONE: przejście na nowe pozycje po przeliczeniu bazy (12.4).
// W trybie 2D bez indeksowania strona nie rysuje NIC w tle — rysunek odpalają zdarzenia.

// =============================================================================
//  PALETA PŁÓTNA — DLACZEGO TUTAJ, A NIE W CSS
//
//  Canvas NIE CZYTA zmiennych CSS. Nie ma w nim kaskady ani dziedziczenia:
//  `ctx.fillStyle` przyjmuje wyłącznie gotową wartość, więc `var(--tekst)`
//  byłoby napisem bez znaczenia. Sprawdzone: w całym app/kreator-rag/ nie ma
//  ani jednego `getComputedStyle`, czyli nic nie mostkuje CSS do płótna.
//
//  Konsekwencja, którą trzeba znać przy zmianie motywu: zmiana zmiennych
//  w .panel (kreator-rag.module.css) przemaluje panele, przyciski i dymki,
//  ale NIE RUSZY ani jednego piksela mapy. Te dwa zestawy trzeba zmieniać razem.
//
//  Wartości odpowiadają rampie Zinc używanej w reszcie AIDEAS — to samo #3f3f46
//  na tekst i #a1a1aa na przygaszenie co w sections.module.css.
// =============================================================================
// Tlo mapy maluje CSS (.mapa-obudowa) — plotno zostaje przezroczyste,
// dlatego nie ma tu pola `tlo`.
//
// PALETY JAKO STAŁEJ TU JUŻ NIE MA. Kolory przychodzą ze zmiennych CSS w .panel,
// czytane przez paletaPlotna() — jedno źródło dla obu motywów i dla obu płócien.
// Fragment bez znanego dokumentu bierze --plotno-fallback; ta wartość musi się
// zgadzać z ZASTEPCZY w lib/mapview/edges.js, inaczej ten sam fragment ma dwa
// różne szare (patrz raport rundy 2 — edges.js zostaje przy wartości jasnej
// świadomie, bo krawędź sieroty ma być tłem, nie treścią).

const WYSOKOSC = 560;
const WYSOKOSC_OSADZONA = 400;
const MARGINES = 28;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
const ZOOM_PODPISY = 3;
const CZAS_PRZEJSCIA = 700;
const CZAS_PODSWIETLENIA = 1200; // gaśnięcie podświetlenia nowej krawędzi
// Wejście nowego punktu: rozjaśnienie z przezroczystości NA SWOIM MIEJSCU (12.9).
// Świadomie NIE odsłaniamy partii po kolei — kolejność liczenia jest prawdziwa, ale
// moment odsłonięcia byłby wymyślony, a użytkownik widzi tylko moment.
const WEJSCIE_PUNKTU = 600;
const ODSTEP_ODSWIEZANIA = 5000; // odpytywanie AWARYJNE — patrz komentarz przy efekcie
// Czujnik znacznika „na żywo". Zmierzone w rundzie 4: przy partii 32 fragmentów
// kolejne odpowiedzi /embed przychodzą co ~15 s (Ollama) i ~5 s (OpenRouter).
// 45 s to trzykrotność tego wolniejszego przypadku — na tyle dużo, żeby znacznik
// nie mrugał między partiami, i na tyle mało, żeby po „Przerwij" zgasł, zanim
// ktokolwiek zdąży uznać nieruchomą mapę za wieszającą się.
const CZUJNIK_ZYWEJ_MAPY = 45000;
const KUBELKI_GLEBI = 10;
const OBROT_NA_KLATKE = 0.0016;

// STATUSY_W_TOKU mieszkają w _lib/podgladNaZywo.js razem z regułami, które ich
// używają. Tu był drugi egzemplarz tej listy — dwie kopie rozjechałyby się przy
// pierwszym nowym statusie, a to właśnie one decydują, czy podgląd w ogóle ruszy.

// MapaFragmentow — cała mapa (dane, rysowanie, interakcja) w JEDNYM komponencie,
// używanym w dwóch miejscach: na pełnej stronie /kolekcje/[id]/mapa i osadzona
// w prawej kolumnie strony kolekcji. Tamta strona jest już tylko otoczką z nagłówkiem.
//
// `osadzona` przełącza CAŁY tryb wbudowany, bo te cztery rzeczy zawsze idą razem:
//   • ciaśniejszy układ i niższe płótno,
//   • bez własnego przycisku „Indeksuj" — na stronie kolekcji są przyciski przy dokumentach,
//   • bez odpytywania awaryjnego — nowe punkty karmi rodzic przez `onApi().naPartie`,
//     a dwa niezależne źródła tego samego stanu to prosta droga do rozjazdu,
//   • wczytanie odroczone do chwili, gdy panel wjedzie w widok.
//
// `onApi` dostaje `{ naPartie, odswiez }`. `naPartie` to DOKŁADNIE ten sam handler,
// którego mapa używa dla własnej pętli — obsługa `newChunks` i `recalculated` istnieje
// w jednym egzemplarzu, niezależnie od tego, kto uruchomił indeksowanie.
export default function MapaFragmentow({ collectionId, osadzona = false, trybOkna = false, onApi }) {
  const id = collectionId;

  // TRYB OKNA — TRZECI ROZMIAR PŁÓTNA, obok osadzonego i pełnej strony.
  //
  // Bez tego przycisk otwierałby okno na cały ekran, w którym mapa dalej ma
  // 1180x560, bo tyle wynosi max-width `.strona-szeroka` i stała WYSOKOSC —
  // czyli okno byłoby większe, a mapa nie.
  //
  // Wysokość liczy wysokoscPlotnaWOknie() z SAMEGO VIEWPORTU. Powód, dla którego
  // nie ma tu żadnego clientHeight, stoi w komentarzu otwierającym trybOkna.js:
  // płótno leży w kontenerze, więc mierzenie kontenera po to, by ustawić
  // płótno, jest pętlą, w której mapa rośnie przy każdym przeliczeniu.
  //
  // SZEROKOŚCI TU NIE USTAWIAMY WCALE. Pierwsza wersja podawała ją obudowie
  // jako `innerWidth - padding` i płótno wystawało poza `main` o szerokość
  // bocznego paska nawigacji, którego viewport nie widzi (pomiar w trybOkna.js).
  // Zostaje `width: 100%` z arkusza: szerokość dalej pochodzi z rozmiaru okna,
  // tylko liczy ją układ, który jako jedyny wie o pasku.
  const rozmiarOkna = useRozmiarOkna();
  const wysokoscPlotna = trybOkna
    ? wysokoscPlotnaWOknie(rozmiarOkna.wysokosc)
    : osadzona
      ? WYSOKOSC_OSADZONA
      : WYSOKOSC;

  const [dane, setDane] = useState(null);
  const [dokumenty, setDokumenty] = useState([]);
  const [kolekcja, setKolekcja] = useState(null);
  const [ladowanie, setLadowanie] = useState(true);
  const [blad, setBlad] = useState(null);
  const [budowanie, setBudowanie] = useState(false);
  const [komunikat, setKomunikat] = useState(null);
  const [dymek, setDymek] = useState(null);
  const [skala, setSkala] = useState(1);
  const [przeciaganie, setPrzeciaganie] = useState(false);
  const [pytanie, setPytanie] = useState('');
  const [szukanie, setSzukanie] = useState(false);
  const [trafienia, setTrafienia] = useState(null);

  // Odmowa otwarcia okna przez przeglądarkę. Osobny stan, bo NIE jest błędem
  // mapy i nie może wylądować w `blad` — mapa działa, tylko nie dostała okna.
  const [oknoZablokowane, setOknoZablokowane] = useState(false);

  // --- Sesja 6b ---
  const [tryb, setTryb] = useState('punkty'); // 'punkty' | 'polaczenia'
  const [widok, setWidok] = useState('2d'); // '2d' | '3d' — domyślnie 2D (12.8)
  const [autoObrot, setAutoObrot] = useState(true);
  const [licz3d, setLicz3d] = useState(false);

  // =============================================================================
  //  MOTYW PŁÓTNA — ODCZYT ZDARZENIOWY, NIE KLATKOWY
  //
  //  `getComputedStyle` wymusza obliczenie stylu. W pętli rysowania byłoby to
  //  60 wywołań na sekundę, przy dwóch płótnach 120 — i to za każdym razem po tę
  //  samą wartość. Dlatego odczyt jest ZA BRAMKĄ NA MOTYWIE: pierwsze wywołanie
  //  po zmianie przelicza, każde kolejne oddaje to, co już policzone.
  //
  //  DLACZEGO LENIWIE, A NIE W EFEKCIE DO STANU: paleta jest potrzebna w trzech
  //  miejscach o różnym czasie życia — w memo krawędzi, w efekcie budującym
  //  ścieżki i w samych funkcjach rysujących. Trzymana w stanie wymuszałaby
  //  `setState` w efekcie (kaskadowy render) i tak czy owak byłaby o jeden
  //  render spóźniona względem `motyw`. Bramka daje wartość ZAWSZE zgodną
  //  z motywem w chwili użycia, bez ani jednego dodatkowego renderu.
  // =============================================================================
  const motyw = useMotyw();
  // PODZIAL ROZSTRZYGNIETY PRZEZ WLASCICIELA PRODUKTU, wbrew mojej rekomendacji
  // i dlatego zapisany: przy prefers-reduced-motion gasna KASKADA I POSWIATA,
  // a zostaja SMUGI I PIERSCIEN. Argument wlasciciela: kaskada i poswiata sa
  // ozdoba, a smugi i pierscien niosa informacje o zdarzeniu.
  // Moj kontrargument, dla nastepnej osoby: smugi i pierscien sa CZYSTYM RUCHEM
  // (rozchodzacy sie okrag, ciagnace sie odcinki), czyli ta klasa bodzca, ktorej
  // ta preferencja dotyczy, a informacja o przeliczeniu dochodzi niezaleznie
  // komunikatem tekstowym (setKomunikat przy `recalculated`).
  const mniejRuchu = useRedukcjaRuchu();
  const korzenRef = useRef(null);

  // Element do odczytu szukany przez `document`, a NIE przez ref: bramka bywa
  // wolana z `useMemo`, a czytanie refa w renderze to `react-hooks/refs`.
  // `.panel` niesie zmienne i opakowuje cala zakladke (layout.js), wiec jest
  // pod reka niezaleznie od tego, ktory widok akurat stoi na ekranie.
  const paleta = useCallback(
    () => paletaDlaMotywu(motyw, typeof document === 'undefined' ? null : document.querySelector('.' + styles.panel)),
    [motyw]
  );

  const canvasRef = useRef(null);
  const widokRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const obrotRef = useRef({ yaw: 0.6, pitch: 0.35 });
  const pozycjeRef = useRef(new Map());
  const daneRef = useRef(null);
  const trybRef = useRef('punkty');
  const widokTypRef = useRef('2d');
  const trafieniaRef = useRef(null);
  const hoverRef = useRef(null);
  const animRef = useRef(0);
  const petlaRef = useRef(0);
  const przeciagRef = useRef(null);
  const swiezeRef = useRef(new Map()); // id fragmentu → czas pojawienia się
  // Stan PRZEJSCIA po przeliczeniu bazy. Zapisywany w petli klatek (nigdy
  // w renderze), zerowany razem z koncem przejscia — nie ma wlasnego czasu zycia.
  const smugiRef = useRef(null);   // Map(id → {x0,y0,x1,y1}) w przestrzeni swiata
  const pierscienRef = useRef(null); // { srodek: {x,y}, post }
  // Indeks krawędzi trzymany w ref, NIE czytany z domknięcia: `rysuj` jest zapamiętane
  // z pustą listą zależności (żeby nie odtwarzać go przy każdym renderze), więc widziałoby
  // wartość z pierwszego renderu — czyli pusty indeks i mapę bez połączeń.
  const indeksRef = useRef(new Map());
  const sciezki2dRef = useRef(null); // Map(kolor → Path2D) w przestrzeni świata
  const dane3dRef = useRef(null); // { sasiedzi, krawedzie } — TYLKO w pamięci

  const indeksujeSie = czyIndeksowanieTrwa(dokumenty);

  // --- pobranie danych ------------------------------------------------------------
  //
  // neighbors=1 na TEJ stronie świadomie: sąsiedztwo jest jej treścią (tryb połączeń
  // i podświetlanie po najechaniu działają w obu trybach). Domyślna wartość w API
  // zostaje `false`, żeby inni odbiorcy — np. AIDEAS — nie płacili za to przy każdym
  // wejściu (sekcja 9).

  const pobierz = useCallback(async (cicho, { sasiedzi = true } = {}) => {
    if (!cicho) setBlad(null);
    try {
      const zapytanie = sasiedzi ? '/map?neighbors=1' : '/map';
      const [rk, rm, rd] = await Promise.all([
        fetch(`/api/rag/collections/${id}`, { cache: 'no-store' }),
        fetch(`/api/rag/collections/${id}${zapytanie}`, { cache: 'no-store' }),
        fetch(`/api/rag/collections/${id}/documents`, { cache: 'no-store' }),
      ]);
      const jk = await rk.json();
      const jm = await rm.json();
      const jd = await rd.json();
      if (jk.error) { setBlad(komunikatBledu(jk.error)); return; }
      if (jm.error) { setBlad(komunikatBledu(jm.error)); return; }
      setKolekcja(jk.collection);
      setDokumenty(jd.error ? [] : jd.documents || []);

      const poprzednie = daneRef.current;

      // Odczyt bez neighbors=1 nie ma prawa wymazać sąsiedztwa, które już mamy —
      // inaczej jedno tanie odświeżenie zgasiłoby cały tryb połączeń.
      if (!sasiedzi && poprzednie && poprzednie.projectionBuilt && jm.projectionBuilt) {
        const znane = new Map();
        for (const c of poprzednie.chunks) if (c.neighbors) znane.set(c.id, c.neighbors);
        jm.chunks = jm.chunks.map((c) => (c.neighbors ? c : { ...c, neighbors: znane.get(c.id) || [] }));
      }

      // Fragmenty, które pojawiły się od poprzedniego odczytu, dostają krótkie
      // podświetlenie. To NIE jest ozdobnik na timerze: znaczy "ten fragment właśnie
      // dostał współrzędne", czyli zdarzenie z pętli indeksowania (10.3).
      // TOŻSAMOŚĆ PUNKTU TO `id` FRAGMENTU — i to jedyny sensowny klucz. Współrzędne
      // odpadają, bo przy przeliczeniu bazy zmieniają się wszystkie naraz i każdy punkt
      // wyglądałby na nowy; pozycja w tablicy też, bo kolejność zależy od zapytania.
      // `id` jest kluczem głównym rag_chunks i nie zmienia się przez całe życie fragmentu.
      //
      // WARUNEK NIE WYMAGA JUŻ `poprzednie.projectionBuilt` — i to jest naprawa.
      // Wcześniej odczyt, w którym baza dopiero powstawała (poprzednio jej nie było,
      // teraz jest), nie nadawał czasu urodzenia NIKOMU. A to jest dokładnie ta chwila,
      // w której mapa pojawia się na ekranie: wszystkie punkty są wtedy nowe dla widza
      // i właśnie wtedy nie błyskał żaden. Pierwsze wczytanie strony jest nadal
      // wyłączone, bo tam `poprzednie` jest null — i słusznie, bo wtedy nic nie „doszło".
      if (poprzednie && jm.projectionBuilt) {
        const stare = new Set(poprzednie.chunks.map((c) => c.id));
        const teraz = performance.now();
        // WSZYSTKIE NARAZ, BEZ KASKADY — i to jest różnica względem `dolaczFragmenty`.
        // Tam znamy partię, więc rozłożenie jej w czasie mówi coś prawdziwego o tym,
        // ile fragmentów przyszło jednym żądaniem. Tutaj mamy tylko RÓŻNICĘ MIĘDZY
        // DWOMA ODCZYTAMI, która może obejmować pół partii albo dwie i pół. Kaskada
        // twierdziłaby o kolejności, której nie znamy (12.9). Poświata twierdzi
        // wyłącznie „te są nowe" i tyle jest prawdą.
        for (const c of jm.chunks) if (!stare.has(c.id)) swiezeRef.current.set(c.id, teraz);
      }

      // PRZELICZENIE BAZY POZNAJEMY PO builtAt, NIE PO `recalculated`. To drugie
      // wraca w odpowiedzi /embed WYŁĄCZNIE do pętli, która prowadzi indeksowanie —
      // mapa oglądana z drugiego okna nie prowadzi jej i nie miała skąd wziąć
      // komunikatu. Zmierzone przed poprawką: nie pojawił się ani razu.
      if (czyPrzeliczonoBaze(poprzednie, jm)) {
        setKomunikat('Baza rzutowania została przeliczona — mapa przechodzi na nowe pozycje.');
      }

      setDane(jm);
    } catch (err) {
      if (!cicho) setBlad('Nie udało się pobrać mapy: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    } finally {
      setLadowanie(false);
    }
  }, [id]);

  // Wczytanie ODROCZONE dla osadzenia: na wąskim ekranie mapa ląduje pod listą
  // dokumentów, więc kto do niej nie zjedzie, nie płaci za pełny odczyt kolekcji.
  // Na szerokim ekranie panel jest widoczny od razu i obserwator odpala się natychmiast.
  // (`korzenRef` stoi wyżej — jest też elementem, z którego czytana jest paleta.)
  const [widoczna, setWidoczna] = useState(!osadzona);

  useEffect(() => {
    if (widoczna || !korzenRef.current) return;
    const obs = new IntersectionObserver(
      (wpisy) => {
        if (wpisy.some((w) => w.isIntersecting)) setWidoczna(true);
      },
      { rootMargin: '200px' }
    );
    obs.observe(korzenRef.current);
    return () => obs.disconnect();
  }, [widoczna]);

  useEffect(() => {
    if (!widoczna) return;
    // Osadzona mapa startuje w trybie Punkty, a sąsiedztwo to ~0,6 MB z 1,6 MB odczytu.
    // Dociągamy je dopiero, gdy naprawdę będzie potrzebne (efekt niżej).
    pobierz(false, { sasiedzi: !osadzona });
  }, [widoczna, pobierz, osadzona]);

  // Sąsiedztwo NA ŻĄDANIE. Tryb Połączenia i podświetlanie po najechaniu (12.6 każe temu
  // działać w obu trybach) potrzebują `neighbors`, których osadzona mapa nie wczytała.
  const maSasiadow = Boolean(dane && dane.chunks.length && dane.chunks[0].neighbors);
  useEffect(() => {
    if (!dane || !dane.projectionBuilt || maSasiadow || tryb !== 'polaczenia') return;
    pobierz(true);
  }, [tryb, dane, maSasiadow, pobierz]);


  // --- żywa mapa: punkty z ODPOWIEDZI pętli, nie z odpytywania ---------------------
  //
  // Sedno DoD Sesji 6b. POST /embed zwraca `newChunks` — fragmenty, które ta partia
  // właśnie zrzutowała (12.4: "każda kolejna partia dostaje współrzędne od razu").
  // Doklejamy je do stanu i oznaczamy jako świeże, żeby dostały krótkie podświetlenie.
  //
  // UCZCIWOŚĆ (12.9): nowy punkt od PIERWSZEJ klatki jest na swoich współrzędnych
  // i tylko rozjaśnia się z przezroczystości. Nie leci z losowej pozycji, nie "szuka
  // miejsca" — miejsce policzył PCA przed narysowaniem.
  const dolaczFragmenty = useCallback((nowe, dokumentyZOdpowiedzi) => {
    if (!nowe || !nowe.length) return;
    const teraz = performance.now();
    setDane((d) => {
      if (!d || !d.projectionBuilt) return d;
      const znane = new Set(d.chunks.map((c) => c.id));
      const doDodania = nowe.filter((c) => !znane.has(c.id));
      if (!doDodania.length) return d;
      // KASKADA: znacznik zapalenia rozsuniety w czasie. Punkt przed swoim
      // znacznikiem NIE JEST rysowany wcale — patrz fazaPunktu(). Wspolrzedne ma
      // od poczatku i sie nie zmieniaja; rozsuwa sie wylacznie moment odsloniecia.
      const znaczniki = znacznikiKaskady(doDodania.map((c) => c.id), teraz, { kaskada: !mniejRuchu });
      for (const [cid, t] of znaczniki) swiezeRef.current.set(cid, t);
      // LISTA DOKUMENTÓW IDZIE RAZEM Z PUNKTAMI — inaczej są szare.
      //
      // Kolor bierze się z POZYCJI dokumentu na tej liście (koloryDokumentow), a nie
      // z samego `documentId`, który nowe punkty miały od zawsze. Dopóki lista
      // pochodziła z ostatniego pełnego odczytu, świeżo wgranego dokumentu w niej
      // nie było i `kolory.get(...)` oddawało undefined → kolor zastępczy.
      //
      // Podmieniamy CAŁĄ listę, nie doklejamy pojedynczego wpisu: kolor zależy od
      // indeksu w kolejności `created_at`, więc dopisanie na koniec przemalowałoby
      // dokumenty, gdyby doszedł taki o wcześniejszej dacie. Serwer przysyła listę
      // policzoną tym samym zapytaniem co getMapData, więc indeksy się zgadzają.
      const dokumenty = dokumentyZOdpowiedzi && dokumentyZOdpowiedzi.length ? dokumentyZOdpowiedzi : d.documents;

      return {
        ...d,
        documents: dokumenty,
        chunks: d.chunks.concat(doDodania),
        chunkCount: d.chunkCount + doDodania.length,
      };
    });
  }, [mniejRuchu]);

  // =============================================================================
  //  LICZNIK PONIŻEJ PROGU — ODCZYT, KTÓREGO DO RUNDY 4 NIE BYŁO
  //
  //  ZMIERZONE PRZED ZMIANĄ: przy świeżej kolekcji na 193 fragmenty licznik
  //  „0 / 50" stał nieruchomo przez 102 sekundy, podczas gdy pasek indeksowania
  //  doszedł do 160/193. Potem mapa pojawiała się jednym skokiem od razu w całości.
  //
  //  DLACZEGO TAK BYŁO — i dlaczego to NIE jest usterka `naPartie`:
  //  poniżej progu rzutowania w ogóle nie ma, więc `projectPendingChunks`
  //  (documents.js, gałąź „nie finished") nie ma czym rzutować i odsyła pustą
  //  listę. Do mapy nie przychodzi nic, a `dolaczFragmenty` i tak odrzuciłoby
  //  wszystko na `!d.projectionBuilt`. Kanał działa dokładnie tam, gdzie ma
  //  działać — po prostu poniżej progu nie ma współrzędnych do wysłania.
  //
  //  Czego więc brakowało: nie punktów, tylko LICZBY. Fragment bez współrzędnych
  //  wciąż jest fragmentem z wektorem i ma się liczyć do progu. Dlatego poniżej
  //  progu odświeżamy sam licznik — jednym lekkim odczytem `/map`, który w tym
  //  stanie zwraca `chunks: []` (getMapData, gałąź `!projection`), więc kosztuje
  //  tyle co zapytanie o liczbę. Nie wołamy `pobierz`, bo ono ciągnie jeszcze
  //  kolekcję i listę dokumentów, których licznik nie potrzebuje.
  //
  //  REGUŁA 12.9 NIETKNIĘTA: ta ścieżka rusza WYŁĄCZNIE `chunkCount`
  //  i `projectionBuilt`. Nie dopisuje ani jednego punktu i nie dotyka
  //  współrzędnych — poniżej progu żadnych współrzędnych po prostu nie ma.
  // =============================================================================
  const odswiezLicznik = useCallback(async () => {
    try {
      const r = await fetch(`/api/rag/collections/${id}/map`, { cache: 'no-store' });
      const j = await r.json();
      if (j.error || j.projectionBuilt) return; // próg przekroczony — zajmie się tym `recalculated`
      setDane((d) => (d && !d.projectionBuilt ? { ...d, chunkCount: j.chunkCount } : d));
    } catch {
      // Licznik jest odczytem pomocniczym. Gdy padnie, indeksowanie idzie dalej,
      // a następna partia spróbuje ponownie.
    }
  }, [id]);

  // Znacznik „na żywo" gaśnie sam, gdyby ostatnia partia nigdy nie przyszła.
  // Dzieje się tak po „Przerwij": pętla staje bez odpowiedzi z `finished: true`,
  // więc bez tego pilnowania napis wisiałby nad nieruchomą mapą w nieskończoność.
  const zegarZywoRef = useRef(0);
  const [naZywo, setNaZywo] = useState(false);

  useEffect(() => () => clearTimeout(zegarZywoRef.current), []);

  const onPartia = useCallback(
    (json) => {
      // Partia przyszła — indeksowanie trwa. `finished` gasi znacznik od razu,
      // bez czekania na czujnik.
      clearTimeout(zegarZywoRef.current);
      if (json.finished) {
        setNaZywo(false);
      } else {
        setNaZywo(true);
        zegarZywoRef.current = setTimeout(() => setNaZywo(false), CZUJNIK_ZYWEJ_MAPY);
      }

      // Przeliczenie bazy (12.4, przyrost > 30%) rusza WSZYSTKIE współrzędne, więc
      // przyrostowa lista nie wystarcza — dociągamy całość raz, a efekt useEffect niżej
      // animuje przejście na nowe pozycje, tak jak przy „Przelicz bazę".
      if (json.recalculated) {
        // Komunikat NIE JEST tu ustawiany — stawia go `pobierz` po zmianie `builtAt`,
        // w jednym miejscu dla obu ścieżek. Wcześniej stał tylko tutaj i dlatego
        // widziała go wyłącznie strona prowadząca indeksowanie.
        pobierz(true);
        return;
      }
      if (json.newChunks && json.newChunks.length) {
        dolaczFragmenty(json.newChunks, json.documents);
        return;
      }
      // Brak współrzędnych w tej partii znaczy „jeszcze poniżej progu" — wtedy
      // aktualny jest sam licznik.
      odswiezLicznik();
    },
    [dolaczFragmenty, pobierz, odswiezLicznik]
  );

  // Kanał dla rodzica: gdy indeksowanie rusza z listy dokumentów, odpowiedzi /embed
  // trafiają do tego samego `onPartia`, którego używa własna pętla mapy. Obsługa
  // newChunks i recalculated istnieje w jednym egzemplarzu.
  useEffect(() => {
    if (onApi) onApi({ naPartie: onPartia, odswiez: pobierz });
  }, [onApi, onPartia, pobierz]);

  const { postep, indeksujKolejno, przerwijWszystko, wczytajPostep } = useIndeksowanie({ onPartia });

  const doIndeksowania = dokumenty.filter((d) => d.status === 'chunked' && d.chunkCount > 0);
  const postepTutaj = Object.values(postep).find((p) => p && p.running) || null;

  // Postęp dokumentów przerwanych w połowie — żeby pasek na mapie startował od stanu
  // bazy (np. 4/7), a nie od zera. Ta sama zasada co na stronie kolekcji.
  useEffect(() => {
    wczytajPostep(dokumenty.filter((d) => d.status === 'embedding' && d.chunkCount > 0).map((d) => d.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dokumenty.length]);

  async function indeksujZMapy() {
    // Kolejno, nie równolegle — jedna Ollama liczy jedną partię (patrz hook).
    await indeksujKolejno(doIndeksowania.map((d) => d.id));
    await pobierz(true);
  }

  // Odpytywanie AWARYJNE: tylko na wypadek indeksowania uruchomionego z innej karty.
  // Trzy świadome decyzje względem pierwszej wersji, która ciągnęła całą kolekcję
  // z sąsiadami co 2 s (przy 3091 fragmentach ~2 MB na odczyt, ~1,7 GB na przebieg):
  //  • najpierw pytamy o SAM POSTĘP (GET /embed to kilkaset bajtów) i dopiero zmiana
  //    licznika uzasadnia odczyt mapy,
  //  • odczyt mapy leci BEZ neighbors=1 — sąsiedztwo nowych punktów w normalnej pracy
  //    przychodzi z /embed, a tu jest tylko ścieżka zapasowa,
  //  • co 5 s, nie co 2 s.
  // Gdy pętla działa na TEJ stronie, ten efekt nie robi nic — `postepTutaj` je wyłącza.
  useEffect(() => {
    // Osadzona mapa NIGDY nie odpytuje: karmi ją rodzic przez onApi().naPartie.
    // Dwa niezależne źródła tego samego stanu to prosta droga do rozjazdu.
    if (osadzona || !indeksujeSie || postepTutaj) return;
    const wToku = dokumenty.filter((d) => STATUSY_W_TOKU.includes(d.status) && d.chunkCount > 0);
    if (!wToku.length) return;

    let ostatnieDone = null;
    const t = setInterval(async () => {
      try {
        const stany = await Promise.all(
          wToku.map(async (d) => {
            const r = await fetch(`/api/rag/documents/${d.id}/embed`, { cache: 'no-store' });
            const j = await r.json();
            return j.error ? 0 : j.done || 0;
          })
        );
        const suma = stany.reduce((a, b) => a + b, 0);
        // Z SĄSIEDZTWEM — i to jest odwrócenie wcześniejszej decyzji, z podanym powodem.
        //
        // Tanie odpytywanie (bez neighbors=1) miało oszczędzać ~0,6 MB na odczyt, ale
        // kosztowało coś, czego nie przewidziałem: nowe punkty przychodziły z PUSTĄ listą
        // sąsiadów (patrz scalanie wyżej — `znane.get(c.id) || []`). Bez sąsiadów
        // buildEdges nie tworzy dla nich ani jednej krawędzi, więc w oknie liczba
        // połączeń stała w miejscu przez cały przebieg, a podświetlenie świeżej krawędzi
        // nie miało czego rysować: `indeksRef.get(cid)` oddawało pustą listę.
        //
        // Oszczędność dotyczyła ścieżki, która JEST otwarta po to, żeby patrzeć na
        // przyrost połączeń. Płacimy za odczyt, bo bez tego widok nie pokazuje tego,
        // po co istnieje.
        if (ostatnieDone !== null && suma !== ostatnieDone) await pobierz(true, { sasiedzi: true });
        ostatnieDone = suma;
      } catch {
        // cicho — to ścieżka zapasowa, nie ma prawa zasypać użytkownika błędami
      }
    }, ODSTEP_ODSWIEZANIA);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indeksujeSie, postepTutaj, dokumenty.length, pobierz]);

  // =============================================================================
  //  PULS LISTY DOKUMENTÓW — WYJŚCIE Z MARTWEGO STARTU
  //
  //  ZMIERZONE PRZED POPRAWKĄ: okno mapy otwarte PRZED wgraniem dokumentu nie
  //  zauważało niczego przez 110 s, mimo czterech partii i przeliczenia bazy.
  //  Nagłówek stał na 120 fragmentach, płótno nie przerysowało się ani razu,
  //  znacznik „trwa indeksowanie" nie zaświecił.
  //
  //  Przyczyną była PĘTLA W WARUNKACH, nie błąd w żadnym z nich z osobna:
  //  odpytywanie postępu startowało tylko przy `indeksujeSie`, `indeksujeSie`
  //  liczyło się z listy dokumentów, a listę odświeżało wyłącznie to samo
  //  odpytywanie. Żeby zauważyć nowy dokument, trzeba było już go znać.
  //
  //  Ten puls jest z tej pętli wyjęty: nie pyta o `indeksujeSie` i chodzi także
  //  w spoczynku. Dlatego pyta o SAMĄ LISTĘ dokumentów (kilkaset bajtów), a nie
  //  o mapę, i robi to co 10 s, nie co 5 — koszt ponosi każdy otwarty widok mapy,
  //  więc ma być mały. Opóźnienie zauważenia i tak ginie przy pierwszej partii,
  //  która idzie kilkanaście sekund.
  //
  //  ODCISK, NIE PODSTAWIANIE TABLICY: bez porównania każdy puls wstawiałby nowy
  //  obiekt i przemontowywał efekty zależne od `dokumenty`, w tym odpytywanie
  //  postępu — czyli puls psułby to, czemu ma służyć.
  //
  //  Osadzona mapa nie pulsuje: karmi ją rodzic, a dwa źródła tego samego stanu
  //  to ta sama pułapka, o której mowa przy odpytywaniu wyżej.
  // =============================================================================
  useEffect(() => {
    if (osadzona || postepTutaj) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/rag/collections/${id}/documents`, { cache: 'no-store' });
        const j = await r.json();
        if (j.error) return;
        const lista = j.documents || [];
        setDokumenty((biezace) => (czyListaSieZmienila(biezace, lista) ? lista : biezace));
      } catch {
        // Puls pomocniczy — cisza, następny cykl spróbuje ponownie.
      }
    }, PULS_DOKUMENTOW);
    return () => clearInterval(t);
  }, [osadzona, postepTutaj, id]);

  // =============================================================================
  //  DOMKNIĘCIE — OSTATNIA PARTIA I PRZELICZONA BAZA
  //
  //  ZMIERZONE PRZED POPRAWKĄ: 30 s po zakończeniu indeksowania okno pokazywało
  //  446 fragmentów zamiast 460 i mapę sprzed przeliczenia bazy. Powód: gdy
  //  ostatnia partia wpadła do bazy, status dokumentu zmieniał się na „ready",
  //  `indeksujeSie` stawało się fałszem i efekt odpytywania GASŁ, zanim zdążył
  //  odczytać to, co właśnie się pojawiło. Widok zostawał na przedostatnim stanie.
  //
  //  Ten jeden odczyt idzie Z SĄSIEDZTWEM, w przeciwieństwie do odpytywania
  //  w trakcie. Tam `neighbors=1` jest świadomie pomijane, bo to najdroższa część
  //  odczytu i w trakcie nie ma sensu ciągnąć jej co pięć sekund — skutkiem było
  //  jednak to, że po zakończeniu krawędzie zostawały niekompletne (zmierzone:
  //  673 połączenia przed i po całym przebiegu, mimo 110 nowych fragmentów).
  //  Domknięcie jest miejscem, w którym wolno zapłacić raz i mieć komplet.
  // =============================================================================
  const bylIndeksowanyRef = useRef(false);
  useEffect(() => {
    if (osadzona) return;
    const bylo = bylIndeksowanyRef.current;
    bylIndeksowanyRef.current = indeksujeSie;
    if (czyDomknac(bylo, indeksujeSie)) pobierz(true, { sasiedzi: true });
  }, [indeksujeSie, osadzona, pobierz]);

  // =============================================================================
  //  OKNO TEŻ BUDUJE RZUTOWANIE (wariant A)
  //
  //  Zdanie „osie powstają raz, z całego zbioru" jest słuszne co do intencji, ale
  //  widok osadzony i tak buduje przy końcu dokumentu — więc dotąd mieliśmy wariant
  //  najgorszy z możliwych: jeden widok rysuje mapę, drugi w tej samej chwili
  //  pokazuje „Rzutowanie policzy się po zakończeniu indeksowania". Zgodność obu
  //  widoków jest ważniejsza niż oszczędność jednego przeliczenia.
  //
  //  RÓWNOLEGŁEJ BUDOWY PILNUJE BAZA, nie ten warunek. `budowanieRef` odsiewa tylko
  //  drugie wywołanie z TEJ SAMEJ karty; dwa różne okna zatrzymuje dopiero zapis
  //  warunkowy w buildCollectionProjection (patrz komentarz „STRAŻNIK" w map.js).
  //  Odpowiedź `ubiegnietoNas` znaczy „mapa jest, ale zbudował ją ktoś inny" —
  //  wtedy wystarczy odczyt.
  const budowanieRef = useRef(false);
  useEffect(() => {
    if (osadzona || !dane || dane.projectionBuilt || !dane.canBuild || !indeksujeSie) return;
    if (budowanieRef.current) return;
    budowanieRef.current = true;
    (async () => {
      try {
        await fetch(`/api/rag/collections/${id}/map/build`, { method: 'POST' });
        await pobierz(true, { sasiedzi: true });
      } catch {
        // Budowa z okna jest ścieżką pomocniczą — przy porażce zostaje przycisk.
      } finally {
        budowanieRef.current = false;
      }
    })();
  }, [osadzona, dane, indeksujeSie, id, pobierz]);

  // --- krawędzie 2D: liczone RAZ na zmianę danych, nie na klatkę (12.6) ------------

  // `paleta` w zaleznosciach, bo kolor krawedzi to SREDNIA kolorow obu koncow —
  // przy zmianie motywu trzeba przeliczyc, nie da sie przetlumaczyc gotowego hexa.
  const krawedzie = useMemo(() => {
    if (!dane || !dane.projectionBuilt) return [];
    const kolory = koloryDokumentow(dane.documents, paleta());
    return buildEdges(dane.chunks, kolory);
  }, [dane, paleta]);

  const indeks = useMemo(() => indeksKrawedzi(krawedzie), [krawedzie]);

  // --- transformacja świata na ekran (12.1) ---------------------------------------

  const transformacja = useCallback((canvas) => {
    const d = daneRef.current;
    const vp = d && d.viewport;
    if (!vp) return null;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const s0 = Math.min((W - 2 * MARGINES) / (vp.xMax - vp.xMin), (H - 2 * MARGINES) / (vp.yMax - vp.yMin));
    const cx = (vp.xMin + vp.xMax) / 2;
    const cy = (vp.yMin + vp.yMax) / 2;
    const { zoom, panX, panY } = widokRef.current;
    const k = s0 * zoom;
    return {
      W, H, vp, s0, cx, cy, zoom, k,
      przytnijX: (x) => Math.min(vp.xMax, Math.max(vp.xMin, x)),
      przytnijY: (y) => Math.min(vp.yMax, Math.max(vp.yMin, y)),
      doEkranu(x, y) {
        return [
          W / 2 + (Math.min(vp.xMax, Math.max(vp.xMin, x)) - cx) * k + panX,
          H / 2 - (Math.min(vp.yMax, Math.max(vp.yMin, y)) - cy) * k + panY,
        ];
      },
      doSwiata(sx, sy) {
        return [(sx - W / 2 - panX) / k + cx, -(sy - H / 2 - panY) / k + cy];
      },
    };
  }, []);

  // Ścieżki krawędzi budowane w przestrzeni ŚWIATA i przechowywane między klatkami.
  // To jest sedno wydajności: przy 3091 fragmentach mamy ~7000 krawędzi, a prototyp
  // rysuje każdą osobno (beginPath/stroke), czyli 7000 wywołań rysowania na klatkę.
  // Po zgrupowaniu po kolorze zostaje kilkadziesiąt wywołań stroke() — reszta to
  // transformacja canvasa, którą robi GPU.
  useEffect(() => {
    if (!dane || !dane.projectionBuilt || krawedzie.length === 0) {
      sciezki2dRef.current = null;
      return;
    }
    const vp = dane.viewport;
    const przytnij = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const poz = new Map(dane.chunks.map((c) => [c.id, c]));
    const grupy = grupujPoKolorze(krawedzie);
    const sciezki = new Map();
    for (const [kolor, lista] of grupy) {
      const p = new Path2D();
      for (const e of lista) {
        const a = poz.get(e.a);
        const b = poz.get(e.b);
        if (!a || !b) continue;
        p.moveTo(przytnij(a.x, vp.xMin, vp.xMax), przytnij(a.y, vp.yMin, vp.yMax));
        p.lineTo(przytnij(b.x, vp.xMin, vp.xMax), przytnij(b.y, vp.yMin, vp.yMax));
      }
      sciezki.set(kolor, p);
    }
    sciezki2dRef.current = sciezki;
  }, [dane, krawedzie]);

  // --- sąsiedztwo 3D: liczone W PRZEGLĄDARCE, trzymane w pamięci -------------------
  //
  // DoD wprost: przełączenie widoku NIE MOŻE zapisać niczego do bazy. Kolumna
  // rag_chunks.neighbors trzyma wyłącznie sąsiedztwo 2D. Tutaj nie ma i nie będzie
  // żadnego fetcha metodą POST — wynik żyje w dane3dRef i ginie z zamknięciem strony.

  useEffect(() => {
    if (widok !== '3d' || !dane || !dane.projectionBuilt) return;
    if (dane3dRef.current && dane3dRef.current.dlaDanych === dane) return;

    setLicz3d(true);
    // Ustępujemy przeglądarce jedną klatkę, żeby zdążyła pokazać stan "liczę".
    const t = setTimeout(() => {
      const punkty = dane.chunks.map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z }));
      const sasiedzi = computeNeighbors3d(punkty, 3);
      const kolorFragmentu = new Map();
      const P = paleta();
      const kolory = koloryDokumentow(dane.documents, P);
      for (const c of dane.chunks) kolorFragmentu.set(c.id, kolory.get(c.documentId) || P.fallback);
      const kraw = krawedzie3d(sasiedzi, kolorFragmentu, sredniKolor);
      dane3dRef.current = { dlaDanych: dane, sasiedzi, krawedzie: kraw, indeks: indeksKrawedzi(kraw) };
      setLicz3d(false);
      rysuj();
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widok, dane]);

  // --- rysowanie ------------------------------------------------------------------

  const rysuj = useCallback(() => {
    const canvas = canvasRef.current;
    const d = daneRef.current;
    if (!canvas || !d || !d.projectionBuilt) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (widokTypRef.current === '3d') rysuj3d(ctx, canvas, d, dpr, W, H);
    else rysuj2d(ctx, canvas, d, dpr, W, H);
    // `paleta` W ZALEZNOSCIACH — I TO NIE JEST PORZADKOWANIE LISTY.
    //
    // Bez niej `rysuj` domyka rysuj2d/rysuj3d z PIERWSZEGO renderu, a te domykaja
    // `paleta` zwiazana z pierwszym motywem. Skutek: po przelaczeniu motywu
    // przemalowywalo sie wszystko OPROCZ PUNKTOW — tlo, panele i legenda ida przez
    // CSS, krawedzie przez efekt sciezek (jego cialo powstaje na nowo co render),
    // a same punkty zostawaly w starej palecie.
    //
    // Zmiana tozsamosci `rysuj` przy zmianie motywu jest tania: wszystkie efekty,
    // ktore od niego zaleza, wolaja go wylacznie po to, zeby przerysowac.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paleta]);

  // Wpis zyje TAK DLUGO, JAK NAJDLUZSZY Z DWOCH EFEKTOW, ktore z niego korzystaja:
  // poswiata punktu (CZAS_POSWIATY) trwa dluzej niz podswietlenie krawedzi
  // (CZAS_PODSWIETLENIA), wiec kasowanie po tym krotszym urywaloby poswiate
  // w polowie. Kazdy efekt liczy swoj wlasny wiek osobno.
  const CZAS_SWIEZOSCI = Math.max(CZAS_PODSWIETLENIA, CZAS_POSWIATY);

  // Punkt, ktory nigdy nie byl swiezy albo dawno wygasl — zdecydowana wiekszosc.
  // Stala, zeby nie budowac tego obiektu szescset razy na klatke.
  const FAZA_ZWYKLA = { widoczny: true, krycie: 1, mnoznikPromienia: 1, swiezy: false };

  function swiezeAktywne(teraz) {
    const m = swiezeRef.current;
    if (m.size === 0) return null;
    const zywe = new Set();
    for (const [cid, t] of m) {
      if (teraz - t < CZAS_SWIEZOSCI) zywe.add(cid);
      else m.delete(cid);
    }
    return zywe.size ? zywe : null;
  }

  function rysuj2d(ctx, canvas, d, dpr, W, H) {
    const t = transformacja(canvas);
    if (!t) return;

    // Jeden odczyt palety na klatke — i tylko wtedy, gdy motyw sie zmienil.
    const P = paleta();
    const mniejRuchuRys = mniejRuchu;
    const kolory = koloryDokumentow(d.documents, P);
    const pozycje = pozycjeRef.current;
    const zazn = trafieniaRef.current;
    const hover = hoverRef.current;
    const teraz = performance.now();
    const swieze = swiezeAktywne(teraz);
    const poZid = new Map(d.chunks.map((c) => [c.id, c]));
    const r = Math.max(1.4, 2.2 * Math.sqrt(t.zoom));

    // 1) Krawędzie — jedno wywołanie stroke() na kolor, pod transformacją canvasa.
    if (trybRef.current === 'polaczenia' && sciezki2dRef.current) {
      ctx.save();
      ctx.setTransform(
        dpr * t.k, 0, 0, -dpr * t.k,
        dpr * (W / 2 + widokRef.current.panX - t.k * t.cx),
        dpr * (H / 2 + widokRef.current.panY + t.k * t.cy)
      );
      // Grubość dzielona przez skalę, bo transformacja rozciągnęłaby też linię.
      ctx.lineWidth = 0.7 / t.k;
      // 0,07/0,16 bylo dobrane pod ciemne tlo. Na bialym linia z alfa 0,07 nie istnieje.
      ctx.globalAlpha = hover || zazn ? 0.18 : 0.32;
      for (const [kolor, sciezka] of sciezki2dRef.current) {
        ctx.strokeStyle = kolor;
        ctx.stroke(sciezka);
      }
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // 2) Połączenia na żądanie: sąsiedzi punktu pod kursorem, mocniejszą linią (12.6).
    //    Działa w OBU trybach — to najczytelniejszy sposób pokazania, że sąsiedztwo
    //    nie jest przypadkowe.
    if (hover) {
      const lista = indeksRef.current.get(hover) || [];
      ctx.lineWidth = Math.max(1.1, 1.4 * Math.sqrt(t.zoom));
      ctx.globalAlpha = 0.9;
      for (const e of lista) {
        const a = pozycje.get(e.a);
        const b = pozycje.get(e.b);
        if (!a || !b) continue;
        const [ax, ay] = t.doEkranu(a.x, a.y);
        const [bx, by] = t.doEkranu(b.x, b.y);
        ctx.strokeStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // 2b) SMUGI I PIERŚCIEŃ — wyłącznie w trakcie przejścia po przeliczeniu bazy.
    //
    //  DLACZEGO TO NIE ŁAMIE 12.9: smuga jest ŚLADEM RUCHU, KTÓRY NAPRAWDĘ ZACHODZI.
    //  Punkty przechodzą na nowe pozycje, bo baza rzutowania została przeliczona
    //  i współrzędne SIĘ ZMIENIŁY — SPEC:1678 tego wprost wymaga. Poza przejściem
    //  `smugiRef` jest pusty, więc przy zwykłym dokładaniu partii nie ma ani jednej
    //  smugi: tam nic się nie rusza i nie ma czego śledzić.
    if (smugiRef.current) {
      const grupySmug = new Map();
      for (const [cid, sm] of smugiRef.current) {
        const c = poZid.get(cid);
        if (!c) continue;
        const [x0, y0] = t.doEkranu(sm.x0, sm.y0);
        const [x1, y1] = t.doEkranu(sm.x1, sm.y1);
        const kr = krycieSmugi(Math.hypot(x1 - x0, y1 - y0));
        if (kr <= 0) continue;
        const kolor = kolory.get(c.documentId) || P.fallback;
        // Grupujemy po kolorze ORAZ po kryciu zaokrąglonym do setnych: bez tego
        // każdy odcinek wymagałby własnego stroke(), czyli sześciuset na klatkę.
        const klucz = kolor + '|' + kr.toFixed(2);
        let g = grupySmug.get(klucz);
        if (!g) { g = { kolor, kr, sciezka: new Path2D() }; grupySmug.set(klucz, g); }
        g.sciezka.moveTo(x0, y0);
        g.sciezka.lineTo(x1, y1);
      }
      ctx.lineWidth = Math.max(1, r * 0.9);
      ctx.lineCap = 'round';
      for (const g of grupySmug.values()) {
        ctx.globalAlpha = g.kr;
        ctx.strokeStyle = g.kolor;
        ctx.stroke(g.sciezka);
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    }

    if (pierscienRef.current) {
      const { srodek, post } = pierscienRef.current;
      // Największy promień = przekątna widoku, żeby okrąg zdążył wyjść poza kadr.
      const p = pierscien(post, { maksPromien: Math.hypot(W, H) / 2 });
      if (p) {
        const [cx, cy] = t.doEkranu(srodek.x, srodek.y);
        ctx.globalAlpha = p.krycie;
        ctx.strokeStyle = P.wyroznienie;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, p.promien, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // 3) Świeże krawędzie — podświetlenie gasnące, tylko dla fragmentów, które
    //    faktycznie właśnie doszły.
    if (swieze) {
      ctx.lineWidth = 1.6;
      for (const cid of swieze) {
        const wiek = (teraz - swiezeRef.current.get(cid)) / CZAS_PODSWIETLENIA;
        ctx.globalAlpha = Math.max(0, 1 - wiek) * 0.95;
        for (const e of indeksRef.current.get(cid) || []) {
          const a = pozycje.get(e.a);
          const b = pozycje.get(e.b);
          if (!a || !b) continue;
          const [ax, ay] = t.doEkranu(a.x, a.y);
          const [bx, by] = t.doEkranu(b.x, b.y);
          ctx.strokeStyle = P.wyroznienie;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // 4) Punkty — jedna ścieżka na kolor dokumentu, jedno fill() na grupę.
    //    3091 osobnych wywołań rysowania zamieniamy na dziewięć.
    const sasiedziHover = hover ? new Set((indeksRef.current.get(hover) || []).flatMap((e) => [e.a, e.b])) : null;
    const grupy = new Map();
    const widoczne = [];
    const wchodzace = [];
    for (const c of d.chunks) {
      const p = pozycje.get(c.id);
      if (!p) continue;
      const [sx, sy] = t.doEkranu(p.x, p.y);
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
      const wyrozniony = (zazn && zazn.has(c.id)) || (sasiedziHover && sasiedziHover.has(c.id));
      widoczne.push({ c, sx, sy, wyrozniony });
      if (wyrozniony) continue;

      // Punkt świeży rysujemy OSOBNO — grupa po kolorze ma jedną alfę dla całej
      // ścieżki, więc nie da się w niej rozjaśnić ani powiększyć pojedynczego punktu.
      // Takich punktów jest najwyżej tyle, ile liczy partia (32), więc koszt jest żaden.
      // To jest zarazem cała odpowiedź na wydajność: poświata NIE dotyka pozostałych
      // pięciuset kilkudziesięciu punktów, które idą wspólną ścieżką jak dotąd.
      const faza = swieze && swieze.has(c.id)
        ? fazaPunktu(swiezeRef.current.get(c.id), teraz, { poswiata: !mniejRuchuRys })
        : FAZA_ZWYKLA;
      // Przed swoim znacznikiem punkt nie jest rysowany W OGÓLE — nie jako ledwie
      // widoczna plamka, tylko nie ma go. Współrzędne ma od początku (12.9), zmienia
      // się wyłącznie moment odsłonięcia.
      if (!faza.widoczny) continue;
      if (faza.swiezy) {
        wchodzace.push({ c, sx, sy, alfa: faza.krycie, r: r * faza.mnoznikPromienia });
        continue;
      }

      const kolor = kolory.get(c.documentId) || P.fallback;
      let g = grupy.get(kolor);
      if (!g) { g = new Path2D(); grupy.set(kolor, g); }
      g.moveTo(sx + r, sy);
      g.arc(sx, sy, r, 0, Math.PI * 2);
    }

    // PRZYGASZENIE, NIE KASOWANIE. 0,12 na bialym tle zbiegalo 107 punktow do bieli —
    // po wyszukaniu widac bylo jedno trafienie i pusta plansze, czyli utrate danych,
    // nie skupienie uwagi. 0,28 zostawia punkt widocznym jako punkt, a trafienie
    // i tak jest trzykrotnie mocniejsze i ma obrys.
    const alfaPodstawowa = zazn || hover ? 0.28 : 0.9;
    ctx.globalAlpha = alfaPodstawowa;
    for (const [kolor, sciezka] of grupy) {
      ctx.fillStyle = kolor;
      ctx.fill(sciezka);
    }

    // POŚWIATA: od PIERWSZEJ klatki na swoich współrzędnych — większy i bledszy,
    // schodzący do docelowego rozmiaru i docelowej jasności. Nie leci z losowej
    // pozycji i nie "szuka miejsca", bo miejsce policzył PCA przed narysowaniem (12.9).
    // Zmienia się WYŁĄCZNIE jasność i rozmiar, a żadne z nich nie mówi nic
    // o odległości znaczeniowej — tę niesie sama pozycja i ta stoi nieruchomo.
    for (const { c, sx, sy, alfa, r: rp } of wchodzace) {
      ctx.globalAlpha = alfa * alfaPodstawowa;
      ctx.fillStyle = kolory.get(c.documentId) || P.fallback;
      ctx.beginPath();
      ctx.arc(sx, sy, rp, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const { c, sx, sy, wyrozniony } of widoczne) {
      if (!wyrozniony) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = kolory.get(c.documentId) || P.fallback;
      ctx.fill();
      // Przy 1x bylo to 1 px wokol kolka o promieniu ~2,2 px — obrys ginal.
      ctx.lineWidth = Math.max(1.8, 1.8 * Math.sqrt(t.zoom));
      ctx.strokeStyle = P.wyroznienie;
      ctx.stroke();
    }

    // 5) Skrócone podpisy powyżej ~3× (12.7), z kontrolą zajętości.
    if (t.zoom >= ZOOM_PODPISY) rysujPodpisy(ctx, d, widoczne, r, P);
  }

  function rysujPodpisy(ctx, d, widoczne, r, P) {
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = P.podpis;
    const zajete = new Set();
    const nazwy = new Map(d.documents.map((doc) => [doc.id, doc.name]));
    for (const { c, sx, sy } of widoczne) {
      const klucz = Math.floor(sx / 90) + ':' + Math.floor(sy / 16);
      if (zajete.has(klucz)) continue;
      zajete.add(klucz);
      const nazwa = (nazwy.get(c.documentId) || '').replace(/\.[a-z0-9]+$/i, '');
      ctx.fillText(nazwa.slice(0, 16) + (c.pageFrom != null ? ` s.${c.pageFrom}` : ''), sx + r + 3, sy + 3);
    }
  }

  // --- widok 3D (12.8) ------------------------------------------------------------

  function rysuj3d(ctx, canvas, d, dpr, W, H) {
    const trzy = dane3dRef.current;
    const P = paleta();
    const kolory = koloryDokumentow(d.documents, P);
    const zazn = trafieniaRef.current;
    const hover = hoverRef.current;
    // Te same dwie wartości co w rysuj2d — do rundy „efekty w 3D" widok przestrzenny
    // w ogóle ich nie czytał, więc kaskada, poświata i świeże krawędzie kończyły się
    // na przełączniku 2D/3D. To nie była decyzja: SPEC 12.8 nie wspomina o efektach
    // ani zakazująco, ani nakazująco, a komentarz przy pętli klatek traktował obrót
    // 3D i gasnące podświetlenia jako dwa osobne powody animacji, nie jako parę.
    const teraz = performance.now();
    const swieze = swiezeAktywne(teraz);
    const { yaw, pitch } = obrotRef.current;
    const vp = d.viewport;

    // Normalizacja do sześcianu jednostkowego, żeby obrót nie zależał od tego,
    // jak szeroki wyszedł viewport w jednostkach PCA.
    const rozpietosc = Math.max(vp.xMax - vp.xMin, vp.yMax - vp.yMin, (vp.zMax - vp.zMin) || 1e-6);
    const cx = (vp.xMin + vp.xMax) / 2;
    const cy = (vp.yMin + vp.yMax) / 2;
    const cz = ((vp.zMin || 0) + (vp.zMax || 0)) / 2;

    const punkty = [];
    for (const c of d.chunks) {
      punkty.push({
        id: c.id,
        documentId: c.documentId,
        pageFrom: c.pageFrom,
        preview: c.preview,
        headingPath: c.headingPath,
        x: (c.x - cx) / rozpietosc,
        y: (c.y - cy) / rozpietosc,
        z: ((c.z || 0) - cz) / rozpietosc,
      });
    }

    const klatka = przygotujKlatke3d(punkty, { yaw, pitch, dystans: 3, rozciagniecieZ: 1.6 });
    if (klatka.length === 0) return;

    const zoom = widokRef.current.zoom;
    const s = Math.min(W, H) * 0.42 * zoom;
    const doEkranu = (p) => [W / 2 + p.px * s + widokRef.current.panX, H / 2 - p.py * s + widokRef.current.panY];

    let minK = Infinity;
    let maxK = -Infinity;
    for (const p of klatka) {
      if (p.skalaGlebi < minK) minK = p.skalaGlebi;
      if (p.skalaGlebi > maxK) maxK = p.skalaGlebi;
    }

    // Krawędzie 3D — liczone z sąsiedztwa policzonego w pamięci przy przełączeniu
    // widoku, nie z kolumny neighbors (ta trzyma sąsiedztwo 2D).
    if (trybRef.current === 'polaczenia' && trzy) {
      const ekran = new Map(klatka.map((p) => [p.id, doEkranu(p)]));
      const grupy = grupujPoKolorze(trzy.krawedzie);
      ctx.lineWidth = 0.6;
      ctx.globalAlpha = hover || zazn ? 0.15 : 0.28;
      for (const [kolor, lista] of grupy) {
        const sciezka = new Path2D();
        for (const e of lista) {
          const a = ekran.get(e.a);
          const b = ekran.get(e.b);
          if (!a || !b) continue;
          sciezka.moveTo(a[0], a[1]);
          sciezka.lineTo(b[0], b[1]);
        }
        ctx.strokeStyle = kolor;
        ctx.stroke(sciezka);
      }
      ctx.globalAlpha = 1;
    }

    const indeks3d = trzy ? trzy.indeks : new Map();
    const sasiedziHover = hover ? new Set((indeks3d.get(hover) || []).flatMap((e) => [e.a, e.b])) : null;

    if (hover && trzy) {
      const ekran = new Map(klatka.map((p) => [p.id, doEkranu(p)]));
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.95;
      for (const e of indeks3d.get(hover) || []) {
        const a = ekran.get(e.a);
        const b = ekran.get(e.b);
        if (!a || !b) continue;
        ctx.strokeStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ŚWIEŻE KRAWĘDZIE — odpowiednik bloku z rysuj2d, ale na indeksie 3D.
    // Sąsiedztwo przestrzenne liczone jest osobno przy przełączeniu widoku
    // (dane3dRef), bo w trzech wymiarach najbliżsi bywają inni niż w dwóch (12.8) —
    // dlatego NIE można tu użyć `indeksRef`, który trzyma sąsiedztwo 2D.
    // Rysowane PRZED punktami, tak jak wszystkie pozostałe krawędzie: linia ma
    // podkreślać punkt, nie leżeć na nim.
    if (swieze && trzy) {
      const ekran = new Map(klatka.map((p) => [p.id, doEkranu(p)]));
      ctx.lineWidth = 1.6;
      for (const cid of swieze) {
        const wiek = (teraz - swiezeRef.current.get(cid)) / CZAS_PODSWIETLENIA;
        const krycie = Math.max(0, 1 - wiek) * 0.95;
        if (krycie <= 0) continue;
        ctx.globalAlpha = krycie;
        ctx.strokeStyle = P.wyroznienie;
        for (const e of indeks3d.get(cid) || []) {
          const a = ekran.get(e.a);
          const b = ekran.get(e.b);
          if (!a || !b) continue;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Punkty rysowane OD NAJDALSZEGO (klatka jest już posortowana), w kubełkach
    // głębi: dalsze mniejsze i bledsze. Kubełkowanie zbija 3091 wypełnień do
    // kilkudziesięciu, zachowując efekt głębi wymagany przez 12.8.
    const kubelki = new Map();
    const wyroznione = [];
    // Świeże punkty trzymamy OSOBNO, ale Z NUMEREM KUBEŁKA — nie po to, żeby je
    // wyjąć z porządku głębi, tylko żeby wróciły do niego przy rysowaniu (niżej).
    const swiezeWKubelkach = new Map();
    for (const p of klatka) {
      const [sx, sy] = doEkranu(p);
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

      // KASKADA — dokładnie ta sama reguła co w 2D: punkt przed swoim znacznikiem
      // nie jest rysowany w ogóle. Sprawdzamy PRZED przydziałem do kubełka, żeby
      // niezapalony punkt nie trafił do wspólnej ścieżki, z której nie da się go już
      // wyjąć. Współrzędne ma od początku — rozsuwa się wyłącznie moment odsłonięcia.
      const faza = swieze && swieze.has(p.id)
        ? fazaPunktu(swiezeRef.current.get(p.id), teraz, { poswiata: !mniejRuchu })
        : FAZA_ZWYKLA;
      if (!faza.widoczny) continue;

      const wyrozniony = (zazn && zazn.has(p.id)) || (sasiedziHover && sasiedziHover.has(p.id));
      if (wyrozniony) { wyroznione.push({ p, sx, sy }); continue; }
      const b = kubelekGlebi(p.skalaGlebi, minK, maxK, KUBELKI_GLEBI);
      const kolor = kolory.get(p.documentId) || P.fallback;
      const r = (0.9 + 1.9 * (b / (KUBELKI_GLEBI - 1))) * Math.sqrt(zoom);

      if (faza.swiezy) {
        // Poświata zmienia alfę i promień, a w 3D alfa NIESIE GŁĘBIĘ — jedna wspólna
        // wartość na całą ścieżkę kubełka. Świeży punkt musi więc iść własnym
        // wypełnieniem. Takich punktów jest najwyżej tyle, ile liczy partia.
        if (!swiezeWKubelkach.has(b)) swiezeWKubelkach.set(b, []);
        swiezeWKubelkach.get(b).push({ sx, sy, kolor, r: r * faza.mnoznikPromienia, krycie: faza.krycie });
        continue;
      }

      const klucz = b + '|' + kolor;
      let g = kubelki.get(klucz);
      if (!g) { g = { bucket: b, kolor, sciezka: new Path2D() }; kubelki.set(klucz, g); }
      g.sciezka.moveTo(sx + r, sy);
      g.sciezka.arc(sx, sy, r, 0, Math.PI * 2);
    }

    const przygaszenie = zazn || hover ? 0.32 : 1;
    const alfaGlebi = (bucket) => (0.45 + 0.5 * (bucket / (KUBELKI_GLEBI - 1))) * przygaszenie;
    const posortowane = [...kubelki.values()].sort((a, b) => a.bucket - b.bucket);

    // ZASŁANIANIE ROZWIĄZANE PORZĄDKIEM, NIE WYJĄTKIEM.
    //
    // Świeży punkt nie jest rysowany „na wierzchu wszystkiego" — wraca dokładnie tam,
    // gdzie należy według swojej głębi: po kubełkach dalszych od siebie, a przed
    // bliższymi. Punkt bliski z poświatą zasłoni skupisko za sobą (bo naprawdę jest
    // przed nim), ale punkt daleki NIE przebije się przez chmurę stojącą bliżej
    // kamery. Bez tego przeplatania świeży punkt w głębi wyglądałby jak dziura
    // wypalona w skupisku, które powinno go zasłaniać.
    let ostatni = -1;
    for (const g of posortowane) {
      // Najdalszy kubelek mial 0,28 — na bialym tle znikal. Podnosimy dol zakresu,
      // zachowujac rozpietosc, ktora robi glebie (12.8).
      ctx.globalAlpha = alfaGlebi(g.bucket);
      ctx.fillStyle = g.kolor;
      ctx.fill(g.sciezka);

      for (let b = ostatni + 1; b <= g.bucket; b += 1) rysujSwiezeZKubelka(b);
      ostatni = g.bucket;
    }
    // Kubełki, w których stoją WYŁĄCZNIE świeże punkty, nie mają własnej ścieżki,
    // więc pętla wyżej by ich nie dotknęła.
    for (let b = ostatni + 1; b < KUBELKI_GLEBI; b += 1) rysujSwiezeZKubelka(b);
    ctx.globalAlpha = 1;

    function rysujSwiezeZKubelka(bucket) {
      const lista = swiezeWKubelkach.get(bucket);
      if (!lista) return;
      // GŁĘBIA MNOŻY POŚWIATĘ, NIE ZASTĘPUJE JEJ. Punkt daleki jest bledszy, więc
      // jego błysk też musi być bledszy — inaczej świeże punkty w głębi świeciłyby
      // mocniej, niż same są widoczne, i alfa przestałaby znaczyć odległość (12.8).
      // Cena: błysk w najdalszym kubełku jest wyraźnie słabszy niż na pierwszym planie.
      // To świadomy wybór — 3D jest widokiem pokazowym, a zafałszowana głębia
      // kosztowałaby więcej niż subtelniejszy efekt.
      for (const s of lista) {
        ctx.globalAlpha = alfaGlebi(bucket) * s.krycie;
        ctx.fillStyle = s.kolor;
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const { p, sx, sy } of wyroznione) {
      const r = 3.4 * Math.sqrt(zoom);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = kolory.get(p.documentId) || P.fallback;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = P.wyroznienie;
      ctx.stroke();
    }
  }

  // --- wejście danych: przejście tylko wtedy, gdy współrzędne FAKTYCZNIE się zmieniły

  useEffect(() => {
    daneRef.current = dane;
    if (!dane || !dane.projectionBuilt) { pozycjeRef.current = new Map(); return; }

    const cel = new Map(dane.chunks.map((c) => [c.id, { x: c.x, y: c.y }]));
    const stare = pozycjeRef.current;
    let ruszone = 0;
    for (const [cid, p] of cel) {
      const s = stare.get(cid);
      if (s && (s.x !== p.x || s.y !== p.y)) ruszone++;
    }

    if (stare.size === 0 || ruszone === 0) {
      pozycjeRef.current = cel;
      rysuj();
      return;
    }

    const od = new Map();
    for (const [cid, p] of cel) od.set(cid, stare.get(cid) || p);
    const start = performance.now();
    const srodek = srodekZbioru(cel.values());
    cancelAnimationFrame(animRef.current);

    // `ePrev` to CALY stan potrzebny smugom: jedna liczba. Smuga to odcinek miedzy
    // pozycja dla poprzedniego kroku easingu a pozycja dla biezacego, wiec gasnie
    // RUCHEM — przy easeInOutQuad ruch wyplaszcza sie na koncu, odcinki maleja do
    // zera i smugi znikaja w tej samej klatce, w ktorej nie ma juz czego pokazywac.
    let ePrev = 0;
    const krok = (teraz) => {
      const post = Math.min(1, (teraz - start) / CZAS_PRZEJSCIA);
      const e = post < 0.5 ? 2 * post * post : 1 - Math.pow(-2 * post + 2, 2) / 2;
      const biezace = new Map();
      // SMUGI I PIERSCIEN ZOSTAJA TAKZE PRZY prefers-reduced-motion — decyzja
      // wlasciciela produktu, uzasadnienie i moj kontrargument przy `mniejRuchu`.
      const smugi = new Map();
      for (const [cid, p] of cel) {
        const o = od.get(cid);
        const x = o.x + (p.x - o.x) * e;
        const y = o.y + (p.y - o.y) * e;
        biezace.set(cid, { x, y });
        const x0 = o.x + (p.x - o.x) * ePrev;
        const y0 = o.y + (p.y - o.y) * ePrev;
        if (x0 !== x || y0 !== y) smugi.set(cid, { x0, y0, x1: x, y1: y });
      }
      ePrev = e;
      pozycjeRef.current = biezace;
      smugiRef.current = smugi.size ? smugi : null;
      pierscienRef.current = srodek ? { srodek, post } : null;
      rysuj();
      if (post < 1) {
        animRef.current = requestAnimationFrame(krok);
      } else {
        // Sprzatanie razem z koncem ruchu, nie po osobnym czasie.
        smugiRef.current = null;
        pierscienRef.current = null;
        rysuj();
      }
    };
    animRef.current = requestAnimationFrame(krok);
    return () => {
      cancelAnimationFrame(animRef.current);
      smugiRef.current = null;
      pierscienRef.current = null;
    };
  }, [dane, rysuj]);

  // PRZEMALOWANIE PO ZMIANIE MOTYWU — WYMUSZONE JAWNIE.
  //
  // Bez tego płótno czekałoby na najbliższe zdarzenie, które i tak woła rysuj():
  // ruch myszy, zmianę trybu, przyjście partii. W 2D pętla klatek stoi
  // (patrz efekt niżej — chodzi tylko przy obrocie 3D i gasnących podświetleniach),
  // więc mapa zostawałaby w starych kolorach dopóki ktoś jej nie dotknie. Tło pod
  // płótnem przechodzi natychmiast, bo maluje je CSS — rozjazd byłby widoczny
  // od razu jako jasne punkty na ciemnym tle.
  useEffect(() => { rysuj(); }, [motyw, rysuj]);

  useEffect(() => { trafieniaRef.current = trafienia; rysuj(); }, [trafienia, rysuj]);
  useEffect(() => { trybRef.current = tryb; rysuj(); }, [tryb, rysuj]);
  useEffect(() => { widokTypRef.current = widok; rysuj(); }, [widok, rysuj]);
  useEffect(() => { indeksRef.current = indeks; rysuj(); }, [indeks, rysuj]);

  useEffect(() => {
    const onResize = () => rysuj();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [rysuj]);

  // PRZERYSOWANIE PO ZMIANIE WYMIARÓW PŁÓTNA — I DLACZEGO POWYŻSZY `resize` NIE WYSTARCZA.
  //
  // Nasłuch `resize` woła rysuj() NATYCHMIAST, czyli jeszcze przed renderem, w
  // którym React podstawi nową wysokość na atrybut `style`. Ta klatka rysuje
  // się więc w STARYCH wymiarach, a po podstawieniu nowych nikt już nie woła
  // rysuj() ponownie — płótno zostawało rozciągnięte, z obrazem policzonym dla
  // poprzedniego rozmiaru. Dopiero ten efekt zamyka kolejność: najpierw wymiar
  // w DOM-ie, potem rysowanie.
  //
  // Poza trybem okna wysokość jest stała, więc efekt wykonuje się raz.
  useEffect(() => {
    rysuj();
  }, [wysokoscPlotna, rysuj]);

  // Pętla klatek TYLKO wtedy, gdy jest co animować: obrót kamery w 3D (12.8, ruch
  // punktu patrzenia, nie danych) albo gasnące podświetlenia nowych krawędzi.
  // W spoczynku w 2D nie chodzi nic.
  useEffect(() => {
    // `cokolwiekTrwa` zamiast samego `size > 0`: przy kaskadzie w mapie siedza tez
    // znaczniki Z PRZYSZLOSCI (punkty jeszcze niezapalone). Sam rozmiar nie odroznia
    // ich od wpisow, ktore juz wygasly, a czekaja na przyciecie w najblizszym
    // rysowaniu — a to wlasnie ta petla je rysuje.
    const potrzebna =
      (widok === '3d' && autoObrot && !przeciaganie) ||
      cokolwiekTrwa(swiezeRef.current, performance.now());
    if (!potrzebna) return;
    let zywe = true;
    const krok = () => {
      if (!zywe) return;
      const obraca = widok === '3d' && autoObrot && !przeciaganie;
      if (obraca) obrotRef.current.yaw += OBROT_NA_KLATKE;
      rysuj();
      // Pętla zatrzymuje się SAMA, gdy nie ma już czego animować. Bez tego kręciłaby się
      // po zgaśnięciu ostatniego podświetlenia aż do najbliższej zmiany stanu — czyli
      // przez cały czas indeksowania, w 2D, bez powodu.
      if (!obraca && !cokolwiekTrwa(swiezeRef.current, performance.now())) return;
      petlaRef.current = requestAnimationFrame(krok);
    };
    petlaRef.current = requestAnimationFrame(krok);
    return () => { zywe = false; cancelAnimationFrame(petlaRef.current); };
  }, [widok, autoObrot, przeciaganie, rysuj, dane]);

  // --- interakcja -----------------------------------------------------------------

  function pozycjaWCanvas(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function onWheel(e) {
    const canvas = canvasRef.current;
    e.preventDefault();
    const [mx, my] = pozycjaWCanvas(e);
    const stary = widokRef.current.zoom;
    const nowy = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, stary * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));

    if (widok === '2d') {
      const t = transformacja(canvas);
      if (!t) return;
      const [wx, wy] = t.doSwiata(mx, my);
      widokRef.current.zoom = nowy;
      widokRef.current.panX = mx - t.W / 2 - (wx - t.cx) * t.s0 * nowy;
      widokRef.current.panY = my - t.H / 2 + (wy - t.cy) * t.s0 * nowy;
    } else {
      widokRef.current.zoom = nowy;
    }
    setSkala(nowy);
    rysuj();
  }

  function onMouseDown(e) {
    const [mx, my] = pozycjaWCanvas(e);
    przeciagRef.current = {
      mx, my,
      panX: widokRef.current.panX,
      panY: widokRef.current.panY,
      yaw: obrotRef.current.yaw,
      pitch: obrotRef.current.pitch,
    };
    setPrzeciaganie(true);
  }

  function onMouseMove(e) {
    const [mx, my] = pozycjaWCanvas(e);

    if (przeciagRef.current) {
      const dx = mx - przeciagRef.current.mx;
      const dy = my - przeciagRef.current.my;
      if (widok === '3d') {
        // W 3D przeciąganie OBRACA kamerę (12.8). Pochylenie ograniczone,
        // żeby nie dało się przekręcić sceny "do góry nogami".
        obrotRef.current.yaw = przeciagRef.current.yaw + dx * 0.008;
        obrotRef.current.pitch = Math.max(-1.4, Math.min(1.4, przeciagRef.current.pitch + dy * 0.008));
      } else {
        widokRef.current.panX = przeciagRef.current.panX + dx;
        widokRef.current.panY = przeciagRef.current.panY + dy;
      }
      rysuj();
      return;
    }

    const d = daneRef.current;
    const canvas = canvasRef.current;
    if (!d || !d.projectionBuilt || !canvas) return;

    let naj = null;
    let najD = 64;

    if (widok === '2d') {
      const t = transformacja(canvas);
      if (!t) return;
      for (const c of d.chunks) {
        const p = pozycjeRef.current.get(c.id);
        if (!p) continue;
        const [sx, sy] = t.doEkranu(p.x, p.y);
        const dd = (sx - mx) ** 2 + (sy - my) ** 2;
        if (dd < najD) { najD = dd; naj = { c, sx, sy, W: t.W }; }
      }
    } else {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const vp = d.viewport;
      const rozpietosc = Math.max(vp.xMax - vp.xMin, vp.yMax - vp.yMin, (vp.zMax - vp.zMin) || 1e-6);
      const cx = (vp.xMin + vp.xMax) / 2;
      const cy = (vp.yMin + vp.yMax) / 2;
      const cz = ((vp.zMin || 0) + (vp.zMax || 0)) / 2;
      const punkty = d.chunks.map((c) => ({
        id: c.id, c,
        x: (c.x - cx) / rozpietosc,
        y: (c.y - cy) / rozpietosc,
        z: ((c.z || 0) - cz) / rozpietosc,
      }));
      const klatka = przygotujKlatke3d(punkty, {
        yaw: obrotRef.current.yaw, pitch: obrotRef.current.pitch, dystans: 3, rozciagniecieZ: 1.6,
      });
      const s = Math.min(W, H) * 0.42 * widokRef.current.zoom;
      for (const p of klatka) {
        const sx = W / 2 + p.px * s + widokRef.current.panX;
        const sy = H / 2 - p.py * s + widokRef.current.panY;
        const dd = (sx - mx) ** 2 + (sy - my) ** 2;
        if (dd < najD) { najD = dd; naj = { c: p.c, sx, sy, W }; }
      }
    }

    const poprzedni = hoverRef.current;
    hoverRef.current = naj ? naj.c.id : null;

    if (!naj) {
      if (poprzedni) rysuj();
      setDymek(null);
      return;
    }

    const doc = d.documents.find((x) => x.id === naj.c.documentId);
    const kolorDoc = koloryDokumentow(d.documents, paleta()).get(naj.c.documentId);
    const liczbaPolaczen = (widok === '3d' && dane3dRef.current ? dane3dRef.current.indeks : indeks).get(naj.c.id);
    setDymek({
      x: Math.min(naj.sx + 14, naj.W - 350),
      y: Math.max(8, naj.sy - 10),
      nazwa: doc ? doc.name : '—',
      kolor: kolorDoc || paleta().fallback,
      heading: naj.c.headingPath,
      strona: naj.c.pageFrom,
      preview: naj.c.preview,
      polaczenia: liczbaPolaczen ? liczbaPolaczen.length : 0,
    });
    if (poprzedni !== hoverRef.current) rysuj();
  }

  function onMouseUp() { przeciagRef.current = null; setPrzeciaganie(false); }
  function onMouseLeave() {
    przeciagRef.current = null;
    setPrzeciaganie(false);
    setDymek(null);
    hoverRef.current = null;
    rysuj();
  }

  function reset() {
    widokRef.current = { zoom: 1, panX: 0, panY: 0 };
    obrotRef.current = { yaw: 0.6, pitch: 0.35 };
    setSkala(1);
    rysuj();
  }

  function onDoubleClick(e) {
    const [mx, my] = pozycjaWCanvas(e);
    const canvas = canvasRef.current;
    const d = daneRef.current;
    if (!d) return;
    if (widok === '2d') {
      const t = transformacja(canvas);
      if (!t) return;
      for (const c of d.chunks) {
        const p = pozycjeRef.current.get(c.id);
        if (!p) continue;
        const [sx, sy] = t.doEkranu(p.x, p.y);
        if ((sx - mx) ** 2 + (sy - my) ** 2 < 64) return;
      }
    }
    reset();
  }

  // --- budowa i wyszukiwanie ------------------------------------------------------

  async function zbuduj() {
    setBudowanie(true);
    setKomunikat('Liczę bazę rzutowania…');
    setBlad(null);
    try {
      const res = await fetch(`/api/rag/collections/${id}/map/build`, { method: 'POST' });
      const json = await res.json();
      if (json.error) { setBlad(komunikatBledu(json.error)); setKomunikat(null); return; }
      const t = json.timings || {};
      setKomunikat(
        `${json.rebuilt ? 'Baza przeliczona' : 'Mapa zbudowana'} z ${json.chunkCount} fragmentów ` +
        `(odczyt ${(t.odczyt / 1000).toFixed(1)} s · PCA ${(t.pca / 1000).toFixed(1)} s · ` +
        `sąsiedzi ${t.sasiedzi} ms · zapis ${(t.zapis / 1000).toFixed(1)} s).`
      );
      dane3dRef.current = null;
      await pobierz(false);
    } catch (err) {
      setBlad('Budowa nie powiodła się: ' + (err && err.message ? err.message : 'nieznany błąd.'));
      setKomunikat(null);
    } finally {
      setBudowanie(false);
    }
  }

  async function szukaj(e) {
    e.preventDefault();
    const q = pytanie.trim();
    if (!q) { setTrafienia(null); return; }
    setSzukanie(true);
    setBlad(null);
    try {
      const res = await fetch(`/api/rag/collections/${id}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, topK: 30 }),
      });
      const json = await res.json();
      if (json.error) { setBlad(komunikatBledu(json.error)); return; }
      setTrafienia(new Set((json.hits || []).map((h) => h.chunkId)));
    } catch (err) {
      setBlad('Wyszukiwanie nie powiodło się: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    } finally {
      setSzukanie(false);
    }
  }

  // Otwarcie mapy w OSOBNYM OKNIE. Handler jest tu, a nie w otoczce strony, bo
  // belka z odnośnikami należy do komponentu i to ona ma oba wyjścia obok siebie.
  function otworzWOknie() {
    const wynik = otworzOknoMapy(id, window.screen || {}, (a, n, c) => window.open(a, n, c));
    // ODMOWA NIE MOŻE BYĆ CICHA. Blokery popupów są domyślnie włączone i to jest
    // najzwyklejszy przypadek, nie awaria — więc zamiast martwego kliknięcia
    // pokazujemy zdanie z zapasowym odnośnikiem otwierającym mapę w nowej karcie
    // (nawigacja z <a target="_blank"> nie jest popupem i przez blokadę przechodzi).
    setOknoZablokowane(!wynik.udane);
  }

  const gotowa = dane && dane.projectionBuilt;

  return (
    <div className={styles['mapa-komponent'] + (osadzona ? ' ' + styles.osadzona : '')} ref={korzenRef}>
      {osadzona ? (
        <div className={styles["mapa-belka"]}>
          <strong>Mapa fragmentów</strong>
          {/* ZNACZNIK „NA ŻYWO" — przy nagłówku, nie na płótnie.
              Do rundy 4 osadzona mapa nie mówiła nic o tym, że coś się właśnie
              dzieje: pełna strona miała zdanie „trwa indeksowanie" w podtytule,
              a wersja osadzona — czyli ta, na którą się patrzy podczas
              indeksowania — nie miała odpowiednika. Kropka pulsuje, ale to
              element BELKI, nie punkt mapy: reguła 12.9 dotyczy fragmentów
              na płótnie i zostaje nietknięta. */}
          {naZywo ? (
            <span className={styles["znacznik-nazywo"]}>
              <span className={styles["kropka-zywa"]} />na żywo
            </span>
          ) : null}
          {dane ? <span className={styles.zrodlo}>{dane.chunkCount} z wektorem{gotowa ? ` · ${krawedzie.length} połączeń` : ''}</span> : null}
          <Link href={`/kreator-rag/kolekcje/${id}/mapa`} className={styles["mapa-pelny"]}>Pełny ekran →</Link>
          {/* DRUGIE WYJŚCIE, NIE ZAMIAST PIERWSZEGO. „Pełny ekran →" prowadzi pod
              adres BEZ ?okno=1 i zostaje dokładnie tym, czym był — nawigacją w tej
              samej karcie. Tutaj dochodzi osobne okno, bo to inna intencja: mapa
              obok aplikacji, a nie zamiast niej. */}
          <button
            type="button"
            className={styles["mapa-okno"]}
            onClick={otworzWOknie}
            title="Otwiera mapę w osobnym oknie, dopasowanym do rozmiaru ekranu"
          >
            Otwórz w oknie ↗
          </button>
        </div>
      ) : dane ? (
        <p className={styles.podtytul}>
          fragmentów z wektorem: <code>{dane.chunkCount}</code>
          {gotowa ? <> · połączeń znaczeniowych: <code>{krawedzie.length}</code></> : null}
          {gotowa && dane.builtAt ? <> · baza z {new Date(dane.builtAt).toLocaleString('pl-PL')}</> : null}
          {indeksujeSie ? <> · <span style={{ color: 'var(--nieznane)' }}>trwa indeksowanie — mapa odświeża się sama</span></> : null}
        </p>
      ) : null}

      {/* ODMOWA OTWARCIA OKNA — WIDOCZNA, Z DROGĄ WYJŚCIA.
          Przeglądarka blokuje popupy domyślnie i cofnięcie tego wymaga wejścia
          w ustawienia witryny, więc samo „zablokowano" zostawiłoby użytkownika
          bez ruchu. Odnośnik obok robi to samo w nowej karcie i przez blokadę
          przechodzi, bo zwykła nawigacja popupem nie jest. */}
      {oknoZablokowane ? (
        <div className={styles.karta}>
          <p className={styles.komunikat} style={{ color: 'var(--nieznane)' }}>
            Przeglądarka zablokowała otwarcie osobnego okna. Zezwól tej stronie na
            wyskakujące okna albo{' '}
            <a href={adresOknaMapy(id)} target="_blank" rel="noopener noreferrer">
              otwórz mapę w nowej karcie
            </a>.
          </p>
        </div>
      ) : null}

      {/* Rozjazd bazy rzutowania po USUNIĘCIU fragmentów (12.4). Indeksowanie naprawia
          się samo — dorzucenie fragmentów przekracza próg i baza się przelicza. Ubytek
          nie ma takiego mechanizmu, bo usuwanie celowo nie odpala PCA (blokowałoby
          skasowanie dużego dokumentu). Dlatego jedyne, co możemy zrobić, to powiedzieć
          o tym wprost i dać przycisk. */}
      {gotowa && dane.nieaktualna && !indeksujeSie ? (
        <div className={styles.karta}>
          <p className={styles.komunikat} style={{ color: 'var(--nieznane)' }}>
            Układ mapy pochodzi z <code>{dane.builtFrom}</code> fragmentów, a kolekcja ma ich
            teraz <code>{dane.chunkCount}</code>. Osie policzono z danych, które od tego czasu
            mocno się zmieniły — punkty mogą leżeć niereprezentatywnie. Przelicz mapę, żeby
            układ znów odpowiadał zawartości.
          </p>
        </div>
      ) : null}

      {blad ? <div className={styles.karta}><p className={styles.komunikat} style={{ color: 'var(--blad)' }}>{blad}</p></div> : null}
      {komunikat ? <div className={styles.karta}><p className={styles.komunikat}>{komunikat}</p></div> : null}

      {gotowa && !osadzona ? (
        <form onSubmit={szukaj} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
          <input
            type="text"
            value={pytanie}
            onChange={(e) => setPytanie(e.target.value)}
            placeholder="podświetl trafienia na mapie, np. ile dni urlopu"
            style={{ marginBottom: 0, flex: 1 }}
          />
          <button type="submit" disabled={szukanie || !pytanie.trim()} style={{ marginBottom: 0 }}>
            {szukanie ? 'Szukam…' : 'Podświetl'}
          </button>
          {trafienia ? (
            <button type="button" style={{ marginBottom: 0 }} onClick={() => { setTrafienia(null); setPytanie(''); }}>
              Wyczyść
            </button>
          ) : null}
        </form>
      ) : null}

      <div className={styles["mapa-obudowa"]}>
        {!widoczna ? (
          <div className={styles["mapa-stan"]} style={{ height: wysokoscPlotna }}><p className={styles.pusto}>Mapa wczyta się, gdy tu dojedziesz.</p></div>
        ) : ladowanie ? (
          <div className={styles["mapa-stan"]}><p className={styles.pusto}>Ładowanie…</p></div>
        ) : !dane ? (
          <div className={styles["mapa-stan"]}><p className={styles.pusto}>Brak danych.</p></div>
        ) : !gotowa ? (
          <div className={styles["mapa-stan"]}>
            {/* =====================================================================
                UŁAMEK TYLKO PONIŻEJ PROGU.

                Odkąd licznik żyje (runda 4), widać stan, którego wcześniej nikt
                nie oglądał: próg zostaje przekroczony w TRAKCIE dokumentu, ale
                rzutowanie powstaje dopiero na jego KOŃCU
                (documents.js woła refreshProjectionAfterIndexing przy `finished`).
                Między jednym a drugim licznik pokazywał „192 / 50" — ułamek,
                którego mianownik już nic nie znaczy, i który sugeruje, że coś
                poszło źle. Zmierzone na 193 fragmentach: taki stan trwał 40 sekund.

                Dlatego po przekroczeniu progu ułamek znika, a zostaje sama liczba
                i zdanie o tym, na co się czeka.
                ================================================================= */}
            {dane.chunkCount < dane.minChunks ? (
              <>
                <div className={styles["mapa-licznik"]}>{dane.chunkCount} / {dane.minChunks}</div>
                {/* WYJAŚNIENIE MÓWI, CZEGO SIĘ SPODZIEWAĆ, nie tylko czego brakuje.
                    Bez drugiego zdania użytkownik patrzący na rosnący licznik
                    spodziewałby się, że punkty zaczną dochodzić po jednym.
                    Nie zaczną — i lepiej, żeby wiedział o tym wcześniej. */}
                <p className={styles.komunikat} style={{ margin: 0 }}>
                  Mapa pojawi się po przekroczeniu progu {dane.minChunks} fragmentów z wektorem —
                  i od razu w całości, nie punkt po punkcie. Rzutowanie liczy osie z całego
                  zbioru naraz; z garstki fragmentów wyszłyby osie, które myliłyby bardziej,
                  niż pomagały.
                </p>
              </>
            ) : (
              <>
                <div className={styles["mapa-licznik"]}>{dane.chunkCount}</div>
                <p className={styles.komunikat} style={{ margin: 0 }}>
                  Próg przekroczony. Rzutowanie policzy się po zakończeniu indeksowania
                  dokumentu — osie powstają raz, z całego zbioru, więc mapa czeka na komplet.
                </p>
              </>
            )}
            {dane.canBuild ? (
              <button onClick={zbuduj} disabled={budowanie} style={{ marginBottom: 0 }}>
                {budowanie ? 'Buduję…' : 'Zbuduj mapę'}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className={styles["mapa-panel"]}>
              {/* PROBKA BIERZE ZMIENNA CSS WPROST, a nie kolor z odpowiedzi: przegladarka
                  przelicza `var()` sama przy zmianie motywu, wiec legenda nie moze sie
                  rozjechac z plotnem ani spoznic o jeden render. Indeks liczony tak samo
                  jak w kolorDokumentu() — patrz koloryDokumentow(). */}
              {dane.documents.map((d, i) => (
                <div className={styles["legenda-wpis"]} key={d.id}>
                  <span className={styles.probka} style={{ background: `var(--dokument-${i % 10})` }} />
                  <span>{d.name}</span>
                </div>
              ))}
            </div>

            <div className={styles["mapa-sterowanie"]}>
              <div className={styles.przelacznik}>
                <button className={tryb === 'punkty' ? styles.wybrany : ''} onClick={() => setTryb('punkty')}>Punkty</button>
                <button className={tryb === 'polaczenia' ? styles.wybrany : ''} onClick={() => setTryb('polaczenia')}>Połączenia</button>
              </div>
              <div className={styles.przelacznik}>
                <button className={widok === '2d' ? styles.wybrany : ''} onClick={() => setWidok('2d')}>2D</button>
                <button className={widok === '3d' ? styles.wybrany : ''} onClick={() => setWidok('3d')}>3D</button>
              </div>
              {widok === '3d' ? (
                <button onClick={() => setAutoObrot((v) => !v)}>{autoObrot ? 'Zatrzymaj obrót' : 'Obracaj'}</button>
              ) : null}
              <span className={styles["mapa-skala"]}>{skala.toFixed(1)}×</span>
              <button onClick={reset}>Reset</button>
              {!osadzona ? (
                <button onClick={zbuduj} disabled={budowanie}>{budowanie ? 'Liczę…' : 'Przelicz bazę'}</button>
              ) : null}

              {/* Indeksowanie STĄD — bez tego "połączenia na żywo" wymagały dwóch kart:
                  pętli na stronie kolekcji i mapy obok. Ta sama pętla z 10.3.
                  W osadzeniu tych przycisków nie ma: obok, w liście dokumentów,
                  stoją własne „Indeksuj" i to one karmią mapę przez onApi. */}
              {osadzona ? null : postepTutaj ? (
                <button onClick={przerwijWszystko}>Przerwij</button>
              ) : doIndeksowania.length ? (
                <button onClick={indeksujZMapy}>
                  Indeksuj ({doIndeksowania.length})
                </button>
              ) : null}
            </div>

            {postepTutaj ? (
              <div className={styles["mapa-postep"]}>
                <div className={styles.pasek}>
                  <div
                    className={styles["pasek-wypelnienie"]}
                    style={{ width: postepTutaj.total ? `${Math.round((postepTutaj.done / postepTutaj.total) * 100)}%` : '0%' }}
                  />
                </div>
                <span>
                  {postepTutaj.error
                    ? <span style={{ color: 'var(--blad)' }}>{postepTutaj.error}</span>
                    : `indeksowanie: ${postepTutaj.done} / ${postepTutaj.total}`}
                </span>
              </div>
            ) : null}

            {licz3d ? (
              <div className={styles["mapa-info-3d"]}>Liczę sąsiedztwo w trzech wymiarach…</div>
            ) : null}

            <canvas
              ref={canvasRef}
              className={styles['mapa-plotno'] + (przeciaganie ? ' ' + styles.chwyt : '')}
              style={{ height: wysokoscPlotna }}
              onWheel={onWheel}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
              onDoubleClick={onDoubleClick}
            />

            {dymek ? (
              <div className={styles["mapa-dymek"]} style={{ left: dymek.x, top: dymek.y }}>
                <div className={styles.zrodlo}>
                  <span className={styles.probka} style={{ background: dymek.kolor, display: 'inline-block', marginRight: 6 }} />
                  {dymek.nazwa}
                  {dymek.strona != null ? ` · str. ${dymek.strona}` : ''}
                  {dymek.heading ? ` · ${dymek.heading}` : ''}
                </div>
                <div>{dymek.preview}…</div>
                <div className={styles.zrodlo} style={{ marginTop: 6, marginBottom: 0 }}>
                  połączenia znaczeniowe: {dymek.polaczenia}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Zastrzeżenie o uproszczeniu rzutu jest wymogiem 12.9, nie ozdobnikiem — ale
          w wąskim panelu zajęłoby więcej miejsca niż sama mapa. W osadzeniu zostaje
          jedno zdanie z tym, co najłatwiej źle odczytać, a całość jest na pełnym ekranie. */}
      {osadzona ? (
        <p className={styles.zastrzezenie}>
          Odległości na ekranie są poglądowe — to rzut z {kolekcja ? kolekcja.embedDim : '1024'} wymiarów.
          Linie to <strong>połączenia znaczeniowe</strong>, nie „k najbliższych sąsiadów".
        </p>
      ) : (
        <p className={styles.zastrzezenie}>
          Rzut z {kolekcja ? kolekcja.embedDim : '1024'} wymiarów na płaszczyznę jest uproszczeniem — odległości na
          ekranie są poglądowe. Linie to <strong>połączenia znaczeniowe</strong>, a nie „k najbliższych sąsiadów":
          sąsiedztwo liczone w trakcie indeksowania jest niesymetryczne, więc fragment może mieć bliższego sąsiada
          i o tym nie wiedzieć aż do przeliczenia bazy. Sąsiedztwo liczone jest w rzucie, nie w pełnym wymiarze —
          prawdziwe podobieństwo pokazuje wyszukiwanie. Punkty nie układają się w czasie: współrzędne są policzone
          przed narysowaniem, a skupiska nie powstają, tylko wychodzą z rzutowania.
        </p>
      )}

      {/* =====================================================================
          ZASTRZEŻENIE O KASKADZIE — WIDOCZNE, NIE TYLKO W KOMENTARZU.

          Sprawdzone w kodzie u OBU dostawców: liczą partiami, nie fragment po
          fragmencie. lib/rag/embedding.js:59-62 (Ollama) i :207-208 (OpenRouter)
          wołają to samo runBatched, a transport wysyła całą tablicę jednym
          żądaniem i dostaje komplet wektorów. Aplikacja nie ma więc ŻADNEGO
          dowodu, że model liczył je po kolei.

          Widok, którego całą racją bytu jest pokazywanie prawdy o działaniu
          RAG-a, nie może milczeć o własnej ozdobie. Stoi przy zastrzeżeniu
          o rzucie, bo to ta sama klasa informacji: „na co patrzysz i czego
          to nie znaczy".
          ===================================================================== */}
      <p className={styles.zastrzezenie}>
        <strong>Kaskada rozkłada partię w czasie — to sposób pokazania, nie pomiar.</strong>{' '}
        Fragmenty wracają jednym żądaniem (partia po <code>RAG_EMBED_BATCH</code>, domyślnie 32),
        więc kolejność i tempo zapalania są nasze, a nie modelu. Prawdziwe jest to,
        ile fragmentów doszło i gdzie leżą.
      </p>

      {gotowa && !osadzona ? (
        <p className={styles.komunikat}>
          {widok === '2d'
            ? 'Kółko przybliża (0,5×–8×, wyśrodkowane na kursorze), przeciąganie przesuwa, dwuklik w tło resetuje.'
            : 'Przeciąganie obraca kamerę, kółko przybliża. Widok 3D jest pokazowy — punkty zasłaniają się nawzajem, a głębia myli się z odległością; do pracy lepszy jest 2D.'}
          {' '}Najechanie na punkt podświetla jego połączenia. Skala i obrót nie zmieniają współrzędnych w bazie —
          zmienia je wyłącznie przeliczenie bazy.
        </p>
      ) : null}
    </div>
  );
}
