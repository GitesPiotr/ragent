// Pomocniki widoku grafu (Sesja 9) — czysty JS, bez canvasu i bez window.
// Reguły „co jest mostem" i „co pisze licznik" są tutaj, żeby dało się je
// sprawdzić testem, a nie oglądaniem ekranu.

// =============================================================================
//  STOPIEŃ POJĘCIA — do ilu RÓŻNYCH dokumentów sięga
//
//  To jest sens całego widoku: pojęcie o stopniu ≥2 pokazuje, że dwa dokumenty
//  mówią o tym samym. Liczba krawędzi NIE wystarcza jako miara — getGraphData
//  daje jedną krawędź na parę (dokument, pojęcie), ale gdyby kiedyś dawał po
//  jednej na fragment, licząc krawędzie dostalibyśmy „most" tam, gdzie jest
//  jeden dokument z trzema wystąpieniami. Liczymy dokumenty, nie krawędzie.
// =============================================================================
export function stopienPojec(edges) {
  const wg = new Map();
  for (const e of edges || []) {
    if (!wg.has(e.conceptId)) wg.set(e.conceptId, new Set());
    wg.get(e.conceptId).add(e.documentId);
  }
  const out = new Map();
  for (const [id, dokumenty] of wg) out.set(id, dokumenty.size);
  return out;
}

// Ile pojęć dotyka danego dokumentu — do przygaszania dokumentów bez pojęć.
export function pojecNaDokument(edges) {
  const out = new Map();
  for (const e of edges || []) out.set(e.documentId, (out.get(e.documentId) || 0) + 1);
  return out;
}

// =============================================================================
//  ODMIANA I LICZNIK „pokazano 30 z 312"
//
//  Wymóg z 12.9: przy pojęciu z 312 fragmentami UI nie ma udawać, że pokazane
//  trzydzieści to wszystko. Reguła jest czysta i testowalna BEZ 312 fragmentów
//  w bazie — dlatego jest osobną funkcją, a nie wyrażeniem w JSX.
// =============================================================================
export function odmianaFragmentow(n) {
  const abs = Math.abs(n);
  if (abs === 1) return 'fragment';
  const dwie = abs % 100;
  if (dwie >= 12 && dwie <= 14) return 'fragmentów';
  const jedna = abs % 10;
  if (jedna >= 2 && jedna <= 4) return 'fragmenty';
  return 'fragmentów';
}

export function podpisLicznika(pokazano, total) {
  const p = Math.max(0, Number(pokazano) || 0);
  const t = Math.max(0, Number(total) || 0);
  if (t === 0) return 'brak fragmentów';
  if (p < t) return `pokazano ${p} z ${t}`;
  return `${t} ${odmianaFragmentow(t)}`;
}

// =============================================================================
//  LICZNIK „pokazano 157 z 565 pojęć" (12.9, Sesja 10)
//
//  Ta sama zasada co przy limicie 30 fragmentów i z tego samego powodu: filtr
//  progu ukrywa 408 z 565 pojęć, a widok nie ma prawa udawać, że pokazane 157
//  to wszystko. Osobna funkcja, bo reguła odmiany jest testowalna bez bazy.
// =============================================================================
export function odmianaPojec(n) {
  const abs = Math.abs(n);
  if (abs === 1) return 'pojęcie';
  const dwie = abs % 100;
  if (dwie >= 12 && dwie <= 14) return 'pojęć';
  const jedna = abs % 10;
  if (jedna >= 2 && jedna <= 4) return 'pojęcia';
  return 'pojęć';
}

export function podpisPojec(pokazano, total) {
  const p = Math.max(0, Number(pokazano) || 0);
  const t = Math.max(0, Number(total) || 0);
  if (t === 0) return 'brak pojęć';
  if (p < t) return `pokazano ${p} z ${t} ${odmianaPojec(t)}`;
  return `${t} ${odmianaPojec(t)}`;
}

// =============================================================================
//  DLACZEGO DOKUMENT WISI BEZ KRAWĘDZI — TRZY RÓŻNE POWODY, TRZY RÓŻNE NAPISY
//
//  Zbicie ich w jeden napis („brak pojęć przy tym progu") daje zdanie, które dla
//  połowy przygaszonych dokumentów jest NIEPRAWDZIWE i sugeruje, że obniżenie progu
//  je przywróci. Napis, który brzmi jak wyjaśnienie, a mówi nieprawdę, jest gorszy
//  niż brak napisu — to ten sam wymóg 12.9, z którego wynika licznik „pokazano 30 z 312".
//
//  Zmierzone na Regulaminach; wszystkie trzy przypadki są tam naraz:
//    'prog'      02-polityka (6 pojęć), 03-pracownicy.csv (2) — próg je odsiał,
//    'niepoliczone'  CELEX/RODO: 504 fragmenty, zero policzonych pojęć,
//    'bez-tekstu'    06-skan-zaswiadczenie.pdf: zero fragmentów (no_text).
// =============================================================================
export function powodBezKrawedzi(dokument) {
  const d = dokument || {};
  if (!(Number(d.chunkCount) > 0)) return 'bez-tekstu';
  if (!(Number(d.conceptCount) > 0)) return 'niepoliczone';
  return 'prog';
}

// Grupuje przygaszone dokumenty po powodzie i zwraca gotowe zdania. Pusta tablica,
// gdy każdy dokument ma krawędzie — legenda nie ma wtedy nic do tłumaczenia.
export function podpisyPrzygaszonych(documents, maKrawedzie) {
  const wg = new Map();
  for (const d of documents || []) {
    if (maKrawedzie && maKrawedzie(d)) continue;
    const powod = powodBezKrawedzi(d);
    wg.set(powod, (wg.get(powod) || 0) + 1);
  }
  const opis = {
    prog: 'brak pojęć powyżej progu — obniż próg, żeby wróciły',
    niepoliczone: 'pojęcia jeszcze nie policzone — żaden próg ich nie przywróci',
    'bez-tekstu': 'brak tekstu do przetworzenia',
  };
  // Kolejność stała: od powodu, który da się odwrócić suwakiem, do tego, którego nie.
  return ['prog', 'niepoliczone', 'bez-tekstu']
    .filter((p) => wg.has(p))
    .map((p) => ({ powod: p, ile: wg.get(p), tekst: `${wg.get(p)} × ${opis[p]}` }));
}

// Skrócenie etykiety do rysowania. Bez tego „uwierzytelnienie dwuskładnikowe"
// i „kopia zapasowa bazy danych" zachodzą na sąsiadów i graf robi się nieczytelny.
export function skrocEtykiete(tekst, maks = 22) {
  const s = String(tekst == null ? '' : tekst).replace(/\s+/g, ' ').trim();
  return s.length <= maks ? s : s.slice(0, maks - 1) + '…';
}
