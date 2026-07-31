// Układanie grafu siłowe (Sesja 9) — CZYSTE funkcje, bez canvasu i bez window.
// Ten sam podział co w Sesji 6b: geometria mieszka w lib/mapview/, rysowanie w app/.
//
// DLACZEGO RUCH JEST TU DOZWOLONY, A NA MAPIE NIE (por. 12.9): na mapie z Sesji 6
// współrzędne są policzone z góry przez PCA, więc jakikolwiek ruch węzła byłby
// animacją udającą pracę, której nie ma. Tutaj węzły NAPRAWDĘ szukają swoich
// pozycji — ruch JEST działaniem algorytmu. Stąd też wygaszanie: kiedy układ
// zbiegnie, ruch przestaje cokolwiek znaczyć i musi ustać, inaczej wracamy
// do ozdobnika, którego zakazuje 12.9.

// Współczynniki przeniesione z prototypu rag-graf-pro.html — wygląd bierzemy stamtąd
// (12.9 zakazuje wyłącznie jego SEKWENCJI BUDOWY, nie parametrów układania).
export const FIZYKA = {
  tlumienie: 0.86,
  doSrodka: 0.0016,
  // Odpychanie zależy od rodzaju: dokumenty mają rozpychać się najmocniej, żeby
  // gwiazdy pojęć wokół nich się nie zlewały. Fragmenty (promienie po kliknięciu)
  // odpychają najsłabiej — mają leżeć ciasno przy swoim pojęciu.
  odpychanie: { dokument: 2700, pojecie: 1600, fragment: 540 },
  zasiegKw: 46000, // dalej niż ~215 px odpychania nie liczymy — to ono kosztuje O(n²)
  // DOLNA GRANICA ODLEGŁOŚCI w odpychaniu, w pikselach. Dopisana po pomiarze skali
  // (scripts/sym-fizyka-grafu.mjs, sekcja B) i to ona jest największą pojedynczą
  // dźwignią zbieżności — nie liczba par.
  //
  // Bez niej d² było przycinane do 1 px², czyli siła sięgała 1600 px na klatkę,
  // a tłumienie 0,86 nasyca prędkość na 1/(1−0,86) ≈ 7,1× siły — ~11 400 px/klatkę.
  // Zmierzony szczyt energii przy 573 węzłach: 1,9 × 10⁸. Przy granicy 16 px ta sama
  // konfiguracja schodzi do 134, a po komplecie napraw zbiega w 105 klatkach.
  //
  // 16 px, nie więcej: węzeł pojęcia ma promień do 14 px, więc poniżej tej odległości
  // węzły i tak się nakładają i dokładna wartość siły przestaje cokolwiek opisywać.
  minOdleglosc: 16,
  dlugoscSprezyny: { pojecie: 115, fragment: 64 },
  sztywnosc: 0.0075,
  margines: 26,
};

// Ile spokojnych klatek uznajemy za zbiegnięcie. Jedna nie wystarcza: układ potrafi
// na moment zwolnić, przechodząc przez pozycję pośrednią.
export const SPOKOJNYCH_DO_WYGASZENIA = 30;

// =============================================================================
//  DWA PROGI ZBIEŻNOŚCI, BO ŚREDNIA DAJE SIĘ ROZCIEŃCZYĆ
//
//  PROG_RUCHU to średni kwadrat przesunięcia — ta sama liczba i ta sama kalibracja
//  co wcześniej, zmienia się tylko MIERZONA WIELKOŚĆ (patrz `krok`).
//
//  PROG_MAKS istnieje, bo przy 573 węzłach średnia przestaje być uczciwa. Rachunek
//  jest konkretny: żeby zmieścić się pod średnią 0,02 przy n = 573, suma kwadratów
//  przesunięć musi być poniżej 11,5 — a JEDEN węzeł drgający 3,4 px na klatkę
//  (200 px/s, ruch doskonale widoczny) daje dokładnie tyle. Bez drugiego progu
//  pięciuset spokojnych węzłów wystarczy, żeby ukryć jednego wariata.
//
//  0,5 px/klatkę = 30 px/s. Zmierzone na Regulaminach: przy 165 węzłach ten próg
//  nie kosztuje nic (236 klatek wobec 233 bez niego), przy 573 kosztuje 1432 klatki
//  wobec 115. Zostaje przy 0,5, bo płacimy tym wyłącznie w widoku bez filtra,
//  a dostajemy układ bliższy spoczynku (dryf po zamrożeniu 319 px wobec 510).
//
//  UCZCIWE NAZWANIE TEGO, CO TO ZNACZY: „wyciszenie" NIE JEST równowagą. Zmierzone:
//  gdyby po wygaszeniu pozwolić fizyce chodzić dalej 2000 klatek, węzły przesunęłyby
//  się jeszcze do 319 px (573 węzły) i do 109 px (165). Największa gwiazda ma 538
//  liści na okręgu, na którym mieści się ich kilkadziesiąt, więc pełnej równowagi
//  tam NIE MA — jest wolne pełzanie bez końca. Dlatego widok mówi „układanie
//  zatrzymane", a nie „układ zbiegł": zatrzymanie jest prawdą, zbiegnięcie nie.
// =============================================================================
export const PROG_RUCHU = 0.02;
export const PROG_MAKS = 0.5;

// Kąt złoty — do rozstawiania po dysku i do rozpychania węzłów, które wpadły
// dokładnie w siebie. Deterministyczny, więc nie narusza zakazu Math.random() z 12.9.
const KAT_ZLOTY = Math.PI * (3 - Math.sqrt(5));

// Siła rozpychająca węzły o IDENTYCZNYCH współrzędnych. Przy dx = dy = 0 kierunek
// wychodzi 0/0, więc bez tego przypadku taka para nie odpycha się WCALE i zostaje
// w sobie na zawsze — tak powstawały 24 grudki opisane w pomiarze (sekcja A).
const ROZEPCHNIECIE = 0.5;

// =============================================================================
//  SKALOWANIE PIERWIASTKIEM, NIE LINIOWO
//
//  Kodeks ma 510 fragmentów, CSV z pracownikami ma 1. Liniowo pierwszy byłby
//  510× większy od drugiego — przy sensownym rozmiarze Kodeksu CSV zniknąłby
//  poniżej piksela. Pierwiastek sprowadza tę różnicę do 22×, więc oba są widoczne,
//  a większy nadal jest wyraźnie większy.
// =============================================================================
export function promien(wartosc, maks, rMin, rMax) {
  const v = Math.max(0, Number(wartosc) || 0);
  const m = Math.max(1, Number(maks) || 1);
  return rMin + (rMax - rMin) * Math.sqrt(Math.min(v, m) / m);
}

// Grubość krawędzi: NORMALIZOWANA DO MAKSIMUM W GRAFIE, ale LINIOWO — nie
// pierwiastkiem jak promienie węzłów. Rozróżnienie jest celowe i wynika z wymiaru:
//
//   • promień węzła koduje wielkość przez POLE, które rośnie z kwadratem promienia,
//     więc liniowy promień zawyżałby różnicę — stąd pierwiastek,
//   • grubość linii jest wielkością JEDNOWYMIAROWĄ, więc liniowa grubość jest
//     wiernym odwzorowaniem wagi, a pierwiastek by ją spłaszczył.
//
// Zmierzone na dzisiejszych danych (wagi 1–3, bo waga 0 nie tworzy krawędzi):
// pierwiastek daje rozpiętość 1,78 px na całym zakresie, liniowo 2,80 px — czyli
// 57% więcej różnicy tam, gdzie jej potrzeba. Normalizacja do maksimum załatwia
// obawę o „linię przez pół ekranu" po Kodeksie — waga 40 przy maksimum 40 to nadal
// 5 px, bo skalujemy względem grafu, a nie do wartości bezwzględnej.
export function grubosc(waga, wagaMaks, gMin = 0.8, gMax = 5) {
  const w = Math.max(0, Number(waga) || 0);
  const m = Math.max(1, Number(wagaMaks) || 1);
  return gMin + (gMax - gMin) * (Math.min(w, m) / m);
}

// =============================================================================
//  JEDEN KROK SYMULACJI
//
//  Węzły są mutowane w miejscu (x, y, vx, vy) — kopiowanie tablicy 60 obiektów
//  60 razy na sekundę byłoby czystym marnotrawstwem. Funkcja pozostaje czysta
//  w tym sensie, który się liczy: nie dotyka DOM-u, canvasu ani czasu, więc test
//  może ją wywołać w pętli i sprawdzić, co się stało.
//
//  Zwraca { ruch, maks } — ŚREDNI KWADRAT i MAKSIMUM FAKTYCZNEGO PRZESUNIĘCIA
//  pozycji, liczone PO przycięciu do płótna. Na tej podstawie wywołujący decyduje
//  o wygaszeniu.
//
//  DLACZEGO PRZESUNIĘCIE, A NIE PRĘDKOŚĆ (zmiana po pomiarze, sekcja E):
//  wcześniej funkcja zwracała średni kwadrat prędkości doliczany PRZED przycięciem
//  pozycji do płótna. Węzeł wciśnięty w brzeg wnosił więc do wyniku ruch, którego
//  nie wykonywał: pozycja stała, a prędkość wchodziła do sumy co klatkę. Przy 573
//  węzłach dawało to wynik 2,63 przy faktycznym przesunięciu 0,078 px na klatkę
//  i medianie 0,011 — układ stał, a warunek wygaszania odmawiał to przyznać
//  i pętla animacji chodziła bez końca. To jest dokładnie ten rodzaj ruchu bez
//  znaczenia, którego zakazuje 12.9.
//
//  Uczciwość tej zmiany trzyma PRZYPADEK KONTROLNY w graf.test.js: układ, który
//  realnie drga, musi przy nowym kryterium dalej wychodzić na niezbiegnięty —
//  inaczej kryterium nie zaczęłoby działać, tylko przestałoby narzekać.
// =============================================================================
export function krok(wezly, krawedzie, { szer, wys, cfg = FIZYKA } = {}) {
  const n = wezly.length;
  if (!n) return { ruch: 0, maks: 0 };
  const minD2 = cfg.minOdleglosc * cfg.minOdleglosc;

  for (let i = 0; i < n; i++) {
    const a = wezly[i];
    for (let j = i + 1; j < n; j++) {
      const b = wezly[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < minD2) d2 = minD2;
      if (d2 > cfg.zasiegKw) continue;
      const sila =
        Math.max(
          cfg.odpychanie[a.typ] || cfg.odpychanie.fragment,
          cfg.odpychanie[b.typ] || cfg.odpychanie.fragment
        ) / d2;
      const d = Math.sqrt(d2);
      // Para w DOKŁADNIE tym samym punkcie: kierunek jest 0/0, więc dostaje kierunek
      // z kąta złotego razy indeks — deterministycznie (te same dane dają ten sam
      // układ), a każda taka para rozchodzi się w inną stronę, więc grudka nie
      // rozjeżdża się jednym pasem.
      const zderzenie = dx === 0 && dy === 0;
      const kat = i * KAT_ZLOTY;
      const fx = zderzenie ? Math.cos(kat) * ROZEPCHNIECIE : (dx / d) * sila;
      const fy = zderzenie ? Math.sin(kat) * ROZEPCHNIECIE : (dy / d) * sila;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
    a.vx += (szer / 2 - a.x) * cfg.doSrodka;
    a.vy += (wys / 2 - a.y) * cfg.doSrodka;
  }

  for (const e of krawedzie) {
    const a = wezly[e.a];
    const b = wezly[e.b];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const spoczynek =
      a.typ === 'fragment' || b.typ === 'fragment'
        ? cfg.dlugoscSprezyny.fragment
        : cfg.dlugoscSprezyny.pojecie;
    const f = (d - spoczynek) * cfg.sztywnosc;
    a.vx += (dx / d) * f;
    a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f;
    b.vy -= (dy / d) * f;
  }

  let suma = 0;
  let maksKw = 0;
  for (const w of wezly) {
    if (w.trzymany) {
      // Węzeł pod kursorem stoi tam, gdzie go trzymamy — ale reszta ma na niego
      // reagować, więc bierze udział w odpychaniu powyżej. Zerujemy tylko prędkość.
      // Jego przesunięcie NIE wchodzi do pomiaru: to ruch myszy, nie układania.
      w.vx = 0;
      w.vy = 0;
      continue;
    }
    const x0 = w.x;
    const y0 = w.y;
    w.vx *= cfg.tlumienie;
    w.vy *= cfg.tlumienie;
    w.x += w.vx;
    w.y += w.vy;

    // Przycięcie do płótna ZERUJE SKŁADOWĄ PRĘDKOŚCI, która wpycha węzeł w ścianę.
    // Wcześniej pozycja stała, a prędkość zostawała — węzeł wciśnięty w brzeg trzymał
    // swoje ~11 000 px/klatkę w nieskończoność, bo tłumienie 0,86 nie miało jak tego
    // odebrać wobec siły dopychającej co klatkę. Zmierzone: przy 165 węzłach zbija
    // wynik z 2,29 do 0,065 (sekcja C pomiaru).
    const m = cfg.margines;
    if (w.x < m) {
      w.x = m;
      w.vx = 0;
    } else if (w.x > szer - m) {
      w.x = szer - m;
      w.vx = 0;
    }
    if (w.y < m) {
      w.y = m;
      w.vy = 0;
    } else if (w.y > wys - m) {
      w.y = wys - m;
      w.vy = 0;
    }

    const p2 = (w.x - x0) * (w.x - x0) + (w.y - y0) * (w.y - y0);
    suma += p2;
    if (p2 > maksKw) maksKw = p2;
  }
  return { ruch: suma / n, maks: Math.sqrt(maksKw) };
}

// Licznik wygaszania. Osobna czysta funkcja, żeby dało się przetestować regułę
// „wygasa dopiero po serii spokojnych klatek" bez uruchamiania pętli animacji.
//
// Bierze CAŁY wynik `krok`, nie jedną liczbę: klatka jest spokojna, gdy oba progi
// są spełnione — średnia mówi „układ się ułożył", maksimum pilnuje, żeby nie ukryć
// w tej średniej jednego drgającego węzła (uzasadnienie przy PROG_MAKS).
export function stanWygaszania(spokojnych, pomiar, progi = {}) {
  const progRuchu = progi.ruch === undefined ? PROG_RUCHU : progi.ruch;
  const progMaks = progi.maks === undefined ? PROG_MAKS : progi.maks;
  const potrzeba = progi.potrzeba === undefined ? SPOKOJNYCH_DO_WYGASZENIA : progi.potrzeba;
  const spokojna = pomiar.ruch < progRuchu && pomiar.maks < progMaks;
  const nowe = spokojna ? spokojnych + 1 : 0;
  return { spokojnych: nowe, wystygl: nowe >= potrzeba };
}

// =============================================================================
//  ROZSTAWIENIE STARTOWE PO DYSKU (spirala Fermata, kąt złoty)
//
//  Deterministyczne, bo losowość dawałaby inny układ przy każdym wejściu na stronę
//  TYCH SAMYCH danych — dokładnie ten rodzaj nieuczciwości, który 12.9 wytyka
//  prototypowi mapy (Math.random() w buildBasis).
//
//  DLACZEGO DYSK, A NIE OKRĄG (zmiana po pomiarze, sekcja A): na okręgu o promieniu
//  198 px mieści się 1245 px obwodu. Przy 573 węzłach wypada 2,2 px na węzeł, czyli
//  wszystkie startują jeden w drugim, przy sile odpychania rzędu tysięcy pikseli
//  na klatkę. Poprzednia wersja brała liczbę węzłów jako argument `ile`, ale widok
//  wołał ją ze stałą 24, więc 573 węzły lądowały na 24 punktach po ~24 w jednym
//  miejscu. Spirala rozkłada je równomiernie po POWIERZCHNI: pierwiastek z i/ile
//  daje stałą gęstość, kąt złoty — brak pasów i pierścieni.
// =============================================================================
export function rozstawSpiralnie(i, ile, szer, wys) {
  const promienStartu = Math.min(szer, wys) * 0.44;
  const r = promienStartu * Math.sqrt((i + 0.5) / Math.max(1, ile));
  const kat = i * KAT_ZLOTY;
  return { x: szer / 2 + Math.cos(kat) * r, y: wys / 2 + Math.sin(kat) * r };
}

// =============================================================================
//  POZYCJE STARTOWE — „DZIEDZICZ TYLKO Z UKŁADU WYCISZONEGO"
//
//  Tu mieszkała przyczyna braku powtarzalności, więc reguła musi być w lib i mieć
//  test, a nie być warunkiem w komponencie.
//
//  CO SIĘ DZIAŁO: przebudowa dziedziczyła pozycje wszystkich węzłów, które już były
//  na ekranie. Przy TYCH SAMYCH danych to nieszkodliwe — symulacja wraca na swój tor
//  i kończy w tym samym miejscu (zmierzone). Ale przełączenie progu albo trybu to INNY
//  ZBIÓR WĘZŁÓW: 23 węzły dziedziczyły pozycje z układu 165 węzłów zatrzymanego tam,
//  gdzie akurat był, gdy człowiek kliknął. Zmierzone na Regulaminach: sześć różnych
//  układów z tych samych danych, węzły odjeżdżały do 471 px.
//
//  REGUŁA: dziedziczymy pozycje TYLKO wtedy, gdy przebudowa dotyczy TYCH SAMYCH
//  DANYCH — czyli przy rozwinięciu albo zwinięciu pojęcia. Zmiana progu lub trybu
//  zawsze startuje od spirali.
//
//  DLACZEGO NIE „TYLKO Z UKŁADU WYCISZONEGO", czyli pierwsza wersja tej reguły:
//  wyglądała dobrze, ale zostawiała OSIĄGALNĄ dziurę i test ją wyłapał. Przy 165
//  węzłach układ wycisza się w ~200 klatkach, więc klik po 30 klatkach (0,5 s) trafiał
//  w gałąź „od spirali", a po 200 (3,3 s) w gałąź „dziedzicz" — dwa różne układy
//  z tych samych danych, dokładnie ta usterka, którą reguła miała usunąć. Granica
//  wyciszenia nie jest właściwym rozróżnieniem, bo sama leży w czasie.
//
//  Właściwym rozróżnieniem jest ŹRÓDŁO WĘZŁÓW, i to potwierdza pomiar
//  (scripts/diag-powtarzalnosc.mjs): przebudowa przy tych samych danych zbiega do
//  TEGO SAMEGO układu niezależnie od tego, po ilu klatkach nastąpiła, a przebudowa
//  na inny zbiór węzłów rozjeżdżała się do 471 px. Dziedziczenie jest więc bezpieczne
//  dokładnie tam, gdzie zależy nam na ciągłości (rozwinięcie pojęcia nie ma
//  przestawiać reszty grafu), i niebezpieczne tam, gdzie na ciągłości nie zależy.
//
//  CZEGO TO NIE OBEJMUJE, powiedziane wprost: rozwinięcie pojęcia dokłada do 30
//  węzłów fragmentów w trakcie układania, więc układ Z ROZWINIĘTYM pojęciem zależy
//  od chwili kliknięcia. Powtarzalność obiecujemy dla wejścia na stronę oraz dla
//  zmiany progu i trybu — nie dla stanu z rozwiniętym pojęciem.
// =============================================================================
export function pozycjeStartowe(wezly, { poprzednie = null, dziedzicz = false, szer, wys } = {}) {
  // Jedyne miejsce, w którym decyduje się dziedziczenie.
  const stare =
    dziedzicz && poprzednie && poprzednie.length
      ? new Map(poprzednie.map((w) => [w.id, w]))
      : null;

  const ile = wezly.length;
  const ileDokumentow = wezly.filter((w) => w.typ === 'dokument').length;
  let nrDokumentu = 0;

  return wezly.map((w, i) => {
    // DOKUMENTY NIE PODLEGAJĄ FIZYCE — pozycja z pierścienia, zawsze, niezależnie
    // od dziedziczenia. Uzasadnienie przy pozycjaDokumentu.
    if (w.typ === 'dokument') {
      const p = pozycjaDokumentu(nrDokumentu++, ileDokumentow, szer, wys);
      return { ...p, vx: 0, vy: 0, trzymany: true };
    }
    const p = stare ? stare.get(w.id) : null;
    if (p) return { x: p.x, y: p.y, vx: p.vx, vy: p.vy };
    return { ...rozstawSpiralnie(i, ile, szer, wys), vx: 0, vy: 0 };
  });
}

// =============================================================================
//  PIERŚCIEŃ DOKUMENTÓW — RAMA NAZWANA RAMĄ
//
//  Dokumenty stoją na stałych pozycjach i nie biorą udziału w układaniu; krążą
//  wokół nich pojęcia. Trzy powody, każdy zmierzony:
//
//  1. PODPISY. Para „01-regulamin-pracy.md" ↔ „D20250277Lj.pdf" kończyła 52–55 px
//     od siebie w KAŻDYM przebiegu, przy każdym momencie kliknięcia, a podpisy
//     potrzebują ~90 px. Na pierścieniu ośmiu dokumentów przy szerokości 864 px
//     wypada ~175 px między sąsiadami.
//  2. ZBIEŻNOŚĆ. W trybach rzadkich to WĘZEŁ DOKUMENTU trzymał wygaszanie
//     (przy ≥5 „06-skan-zaswiadczenie.pdf", przy mostach „05-instrukcja-bhp.pdf"),
//     a osiem dokumentów odpowiadało za 27% i 43% całego ruchu, będąc 8 z 48 i 8 z 23
//     węzłów. Stąd niemonotoniczność: 94 węzły 168 klatek, ale 48 węzłów 577.
//  3. POWTARZALNOŚĆ. Pozycje dokumentów są teraz funkcją danych z definicji.
//
//  DLACZEGO TO JEST UCZCIWSZE, NIE MNIEJ (12.9): pozycja, która rozjeżdżała się
//  o 471 px między przebiegami, wyglądała na znaczącą, a nie niosła ŻADNEJ informacji.
//  Pierścień w kolejności `created_at` — tej samej, z której wynika już kolor —
//  mówi wprost: położenie dokumentu to rama, nie pomiar. Znaczenie niosą pojęcia
//  wokół niego i złote mosty pomiędzy.
//
//  Realizacja przez ISTNIEJĄCY mechanizm `trzymany`: węzeł stoi, ale nadal odpycha
//  pojęcia. Żadna siła się nie zmienia — to jest ta sama ścieżka, którą chodzi węzeł
//  trzymany kursorem, i ma już swój test.
//
//  Pierwszy dokument na godzinie dwunastej, dalej zgodnie z ruchem wskazówek —
//  żeby orientacja pierścienia też była jednoznaczna, a nie zależna od implementacji.
// =============================================================================
// Udział promienia pierścienia w krótszym wymiarze płótna. DOBRANY POMIAREM
// (scripts/sym-pierscien.mjs), nie z gustu — promień wymienia odstęp podpisów
// dokumentów na tłok pojęć przy progu 1:
//
//   udział   odstęp dokumentów   nakładek pojęć przy ≥1   klatek przy ≥2
//   0,18            85 px                181                  387
//   0,24           114 px                195                  322
//   0,30           142 px                230                  404
//   0,36           171 px                258                  341
//   0,42           199 px                303                  471
//
// 0,24 to najmniejszy promień, który daje podpisom dokumentów zapas nad wymaganymi
// ~90 px (114 px), a jednocześnie najmniej ściska pojęcia i najszybciej wycisza
// widok domyślny. Ceną jest dłuższe układanie przy progu 1 (19 s wobec 14 s) —
// płacimy tym w trybie, który i tak jest nieczytelny i nie jest domyślny.
export const PIERSCIEN_UDZIAL = 0.24;

export function pozycjaDokumentu(i, ile, szer, wys, udzial = PIERSCIEN_UDZIAL) {
  const kat = (i / Math.max(1, ile)) * Math.PI * 2 - Math.PI / 2;
  const r = Math.min(szer, wys) * udzial;
  return { x: szer / 2 + Math.cos(kat) * r, y: wys / 2 + Math.sin(kat) * r };
}

// Rozstawienie na okręgu — PUNKT ODNIESIENIA, nie kod widoku. Zostaje wyłącznie
// dlatego, że test regresyjny w graf.test.js i skrypt sym-fizyka-grafu.mjs muszą
// umieć odtworzyć układ, który NAPRAWDĘ drga: bez niego nie da się sprawdzić, czy
// nowe kryterium zbieżności wykrywa drganie, czy tylko przestało narzekać.
// Widok używa rozstawSpiralnie.
export function rozstawNaOkregu(i, ile, szer, wys) {
  const kat = (i / Math.max(1, ile)) * Math.PI * 2;
  const promienStartu = Math.min(szer, wys) * 0.32;
  return {
    x: szer / 2 + Math.cos(kat) * promienStartu,
    y: wys / 2 + Math.sin(kat) * promienStartu,
  };
}
