// =============================================================================
//  EFEKTY MAPY — CZYSTE FUNKCJE CZASU, BEZ CANVASU I BEZ REACTA
//
//  DLACZEGO OSOBNY PLIK: reguły poniżej decydują o tym, CZY WIDOK KŁAMIE.
//  Reguła 12.9 jest wymogiem nadrzędnym, a jedyny sposób, żeby jej pilnować,
//  to móc ją sprawdzić testem — a nie klikaniem i patrzeniem. Rysowanie
//  zostaje w komponencie, decyzje o czasie i kryciu są tutaj.
//
//  GDZIE PRZEBIEGA GRANICA 12.9 (docs/rag-SPEC.md:1656-1668) — dwie osie,
//  nie jedna, i te funkcje siedzą po różnych ich stronach:
//
//   1. POŁOŻENIE. „Na mapie współrzędne są policzone z góry, więc jakikolwiek
//      ruch punktów byłby kłamstwem". ŻADNA funkcja w tym pliku nie zwraca
//      współrzędnej i nie ma jak jej zmienić — to jest zabezpieczenie
//      konstrukcyjne, nie obietnica.
//
//   2. MOMENT. „Zakazane: animacje sterowane licznikiem czasu". Tu jest
//      `opoznienieKaskady`, i ona TĘ REGUŁĘ NARUSZA — świadomie, decyzją
//      produktową, z zastrzeżeniem widocznym pod mapą. Powód w komentarzu
//      przy niej. Reszta funkcji steruje wyłącznie WYGASANIEM czegoś, co
//      już zaszło, i to jest przebieg, którego SPEC wprost wymaga
//      („krótkie podświetlenie nowej krawędzi", :1677).
// =============================================================================

// Odstęp między zapaleniem kolejnych punktów jednej partii.
export const ODSTEP_KASKADY = 40;

// Poświata świeżego punktu. 1500 ms zamiast dotychczasowych 600 dla samego
// wejścia — dłuższe wygasanie daje się zobaczyć przy partii, która schodzi
// w ułamku sekundy.
export const CZAS_POSWIATY = 1500;

// Ile razy większy jest punkt w chwili zapalenia. Wraca do 1,0 razem z kryciem.
export const PROMIEN_POSWIATY = 1.8;

// =============================================================================
//  KASKADA — I DLACZEGO POD MAPĄ MUSI STAĆ ZASTRZEŻENIE
//
//  SPRAWDZONE W KODZIE, NIE ZAŁOŻONE: obaj dostawcy embeddingów liczą PARTIAMI,
//  nie fragment po fragmencie. lib/rag/embedding.js:59-62 (Ollama) i :207-208
//  (OpenRouter) wołają to samo runBatched, a transport wysyła całą tablicę
//  jednym żądaniem (`body: JSON.stringify({ model, input: texts })`, :19-22)
//  i dostaje z powrotem komplet wektorów. Aplikacja NIE MA żadnego dowodu, że
//  model liczył je po kolei — nie mierzy czasu na fragment i nie dostaje
//  wyników częściowych.
//
//  Rozłożenie partii w czasie jest więc ZABIEGIEM DLA CZYTELNOŚCI, a nie
//  odwzorowaniem przebiegu. Dlatego pod mapą stoi zdanie, które mówi to
//  wprost — bo widok, którego całą racją bytu jest pokazywanie prawdy
//  o działaniu RAG-a, nie może milczeć o własnej ozdobie.
//
//  UCZCIWSZY WARIANT ISTNIEJE i jest zapisany, żeby nie zginął: zmniejszenie
//  RAG_EMBED_BATCH (np. 32 -> 8) sprawia, że partie NAPRAWDĘ przychodzą
//  częściej i mniejsze, rozłożenie w czasie pochodzi z pętli indeksowania,
//  a zastrzeżenie robi się zbędne. Koszt: cztery razy więcej żądań.
//  To zmiana wartości w środowisku, nie w kodzie.
// =============================================================================

// Znaczniki czasu zapalenia dla partii. Zwraca Map(id → czas), gdzie czas może
// być W PRZYSZŁOŚCI — punkt przed swoim znacznikiem jest po prostu niewidoczny.
//
// `kaskada: false` (prefers-reduced-motion) daje wszystkim ten sam czas, czyli
// zachowanie sprzed tej rundy: cała partia zapala się naraz.
export function znacznikiKaskady(idy, teraz, { odstep = ODSTEP_KASKADY, kaskada = true } = {}) {
  const out = new Map();
  const lista = Array.isArray(idy) ? idy : [];
  lista.forEach((id, i) => {
    out.set(id, kaskada ? teraz + i * odstep : teraz);
  });
  return out;
}

// Jak długo od `teraz` potrwa zapalanie całej partii. Potrzebne pętli klatek,
// żeby wiedziała, że ma jeszcze chodzić, mimo że nic się na razie nie rusza.
export function czasZapalania(ile, { odstep = ODSTEP_KASKADY, kaskada = true } = {}) {
  if (!kaskada || ile <= 1) return 0;
  return (ile - 1) * odstep;
}

// =============================================================================
//  FAZA PUNKTU — jedna funkcja zamiast trzech rozsypanych warunków
//
//  Zwraca komplet tego, co rysowanie musi wiedzieć o świeżym punkcie:
//    widoczny        — czy w ogóle go malować (przed znacznikiem: nie),
//    krycie          — 0..1, mnożone przez krycie podstawowe widoku,
//    mnoznikPromienia— 1,0 gdy wygasło, do PROMIEN_POSWIATY tuż po zapaleniu,
//    swiezy          — czy jeszcze trwa poświata (do decyzji o rysowaniu osobno).
//
//  KRZYWA JEST LINIOWA i to jest wybór, nie niedopatrzenie: poświata ma
//  informować, że „ten punkt właśnie doszedł", a nie zwracać na siebie uwagę
//  kształtem wygasania. Easing przydaje się przy RUCHU, gdzie oko czyta
//  przyspieszenie; przy samym kryciu dokłada tylko wrażenie „efektu".
// =============================================================================
export function fazaPunktu(znacznik, teraz, { czas = CZAS_POSWIATY, poswiata = true } = {}) {
  if (znacznik == null) {
    return { widoczny: true, krycie: 1, mnoznikPromienia: 1, swiezy: false };
  }
  const wiek = teraz - znacznik;

  // Przed swoim znacznikiem punkt jeszcze nie doszedł do głosu.
  if (wiek < 0) {
    return { widoczny: false, krycie: 0, mnoznikPromienia: 1, swiezy: true };
  }

  // Bez poświaty (reduced-motion) punkt zapala się od razu w pełni.
  if (!poswiata) {
    return { widoczny: true, krycie: 1, mnoznikPromienia: 1, swiezy: false };
  }

  const post = czas > 0 ? Math.min(1, wiek / czas) : 1;
  if (post >= 1) {
    return { widoczny: true, krycie: 1, mnoznikPromienia: 1, swiezy: false };
  }
  return {
    widoczny: true,
    krycie: post,
    mnoznikPromienia: 1 + (PROMIEN_POSWIATY - 1) * (1 - post),
    swiezy: true,
  };
}

// Czy cokolwiek z tej partii jeszcze się dzieje — pętla klatek pyta o to,
// żeby wiedzieć, kiedy wolno jej stanąć.
export function cokolwiekTrwa(znaczniki, teraz, { czas = CZAS_POSWIATY } = {}) {
  for (const t of znaczniki.values()) {
    if (teraz - t < czas) return true;
  }
  return false;
}

// =============================================================================
//  SMUGI — WYGASZANE RUCHEM, NIE CZASEM
//
//  To nie jest ozdoba na timerze i dlatego wolno jej istnieć przy 12.9: smuga
//  jest ŚLADEM RUCHU, KTÓRY NAPRAWDĘ ZACHODZI. Punkty przechodzą na nowe
//  pozycje, bo baza rzutowania została przeliczona i współrzędne SIĘ ZMIENIŁY
//  (SPEC:1678 wprost tego wymaga: „wszystkie punkty płynnie przechodzą").
//
//  KRYCIE Z DŁUGOŚCI ODCINKA, nie z upływu czasu. Konsekwencja jest dokładnie
//  ta, o którą chodzi: przy easeInOutQuad ruch wypłaszcza się na końcu, więc
//  odcinki maleją do zera i smugi znikają SAME, w tej samej klatce, w której
//  przestaje być co pokazywać. Nie ma osobnego czasu do strojenia ani stanu
//  do sprzątania — a przy punkcie, który się nie ruszył, smugi nie ma wcale.
//
//  `pelna` to długość w pikselach ekranu, przy której smuga ma pełne krycie.
//  6 px odpowiada mniej więcej przesunięciu na klatkę w środku przejścia
//  przy typowym przeliczeniu; niżej smuga cichnie, wyżej nie jaśnieje.
// =============================================================================
export function krycieSmugi(dlugosc, { pelna = 6, maks = 0.55 } = {}) {
  if (!(dlugosc > 0) || !(pelna > 0)) return 0;
  return Math.min(1, dlugosc / pelna) * maks;
}

// =============================================================================
//  PIERŚCIEŃ — jedyna rzecz w tym pliku, która niczego nie odwzorowuje
//
//  Nazywam to wprost: to ozdoba. Nie niesie informacji o danych, tylko mówi
//  „coś się właśnie stało z całym układem". Wolno jej istnieć, bo nie dotyka
//  ani położenia punktów, ani ich kolejności — a moment, w którym się pojawia,
//  jest prawdziwy: pochodzi z odpowiedzi pętli indeksowania (`recalculated`),
//  nie z timera.
//
//  Rozchodzi się od ŚRODKA ZBIORU, nie od środka płótna: przy przesuniętej
//  albo przybliżonej mapie środek okna nie ma nic wspólnego z danymi.
// =============================================================================
export function pierscien(post, { maksPromien = 1, krycieMaks = 0.5 } = {}) {
  if (!(post >= 0) || post >= 1) return null;
  return {
    promien: maksPromien * post,
    // Gaśnie szybciej niż rośnie — inaczej najjaśniejszy jest w chwili,
    // gdy jest największy, czyli wtedy, gdy przejście już się kończy.
    krycie: krycieMaks * (1 - post) * (1 - post),
  };
}

// Środek zbioru punktów w przestrzeni świata. `null` przy pustym wejściu —
// wołający ma wtedy pierścienia nie rysować, a nie malować go w (0,0).
export function srodekZbioru(punkty) {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const p of punkty) {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    sx += p.x;
    sy += p.y;
    n++;
  }
  return n === 0 ? null : { x: sx / n, y: sy / n };
}
