// Ekstrakcja wg sekcji 8.1: zwraca BLOKI, nie płaski tekst.
// Blok: { type: 'heading'|'paragraph'|'list', level?: 1..6, text: string, page: number|null }
// Czysty JS. unpdf/mammoth ładowane DYNAMICZNIE, żeby import tego pliku nie wymagał ich,
// dopóki nie tniemy PDF/DOCX (testy chunkera działają bez tych bibliotek).

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function bytesToString(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

// --- .txt: paragrafy dzielone pustymi liniami (8.1) --------------------------
export function extractTxt(text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: 'paragraph', text: p, page: null }));
}

// --- .md: nagłówki po #, listy po -/*/1., reszta paragrafy (8.1) -------------
export function extractMd(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      const t = para.join(' ').trim();
      if (t) blocks.push({ type: 'paragraph', text: t, page: null });
      para = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const t = h[2].trim();
      if (t) blocks.push({ type: 'heading', level: h[1].length, text: t, page: null });
      continue;
    }
    if (line === '') {
      flush();
      continue;
    }
    const li = line.match(/^([-*+]|\d+\.)\s+(.*)$/);
    if (li) {
      flush();
      const t = li[2].trim();
      if (t) blocks.push({ type: 'list', text: t, page: null });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

// --- .csv: tryb WIERSZOWY (8.1) ----------------------------------------------
// Każdy blok = powtórzony wiersz nagłówka + tyle wierszy, ile mieści się w SIZE.
// NIE jeden wielki blok cięty twardo.
function csvRecords(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const records = [];
  let buf = '';
  for (const line of lines) {
    buf = buf === '' ? line : buf + '\n' + line;
    const quotes = (buf.match(/"/g) || []).length;
    if (quotes % 2 === 0) {
      records.push(buf);
      buf = '';
    }
  }
  if (buf !== '') records.push(buf);
  return records.filter((r) => r.trim().length > 0);
}

export function extractCsv(text, size) {
  const records = csvRecords(text);
  if (records.length === 0) return [];
  const header = records[0];
  const dataRows = records.slice(1);

  const blocks = [];
  let curRows = [];
  const flush = () => {
    if (curRows.length === 0) return;
    blocks.push({ type: 'paragraph', text: [header, ...curRows].join('\n'), page: null });
    curRows = [];
  };

  for (const row of dataRows) {
    if (curRows.length > 0) {
      const candidate = [header, ...curRows, row].join('\n');
      if (candidate.length > size) flush();
    }
    curRows.push(row);
  }
  flush();

  if (blocks.length === 0) blocks.push({ type: 'paragraph', text: header, page: null });
  return blocks;
}

// --- PDF (unpdf): podział na strony; nagłówek heurystycznie -------------------
function isHeadingLine(line) {
  return line.length <= 70 && !/[.,;:]$/.test(line) && /[0-9A-Za-zÀ-ž]/.test(line);
}

// =============================================================================
//  10.a.2 — odsiewanie fałszywych nagłówków
//
//  Heurystyka z 8.1 ("krótka linia bez kropki na końcu") łapie dwie rzeczy, które
//  nagłówkami nie są, a trafiają wprost do heading_path — czyli do tekstu, który
//  agent w AIDEAS wypisze jako źródło:
//    A. ŻYWE PAGINY — stopki i nagłówki strony, np. stopka Dziennika Urzędowego
//       w RODO albo "©Kancelaria Sejmu s. 1/186" w Kodeksie pracy.
//    B. URWANE ZDANIA — zawinięty wiersz akapitu, który przypadkiem zmieścił się
//       w limicie i nie skończył kropką.
// =============================================================================

// Dokument krótszy niż tyle stron NIE podlega regule powtarzalności: przy trzech
// stronach prawdziwy nagłówek rozdziału potrafi wypaść na dwóch z nich i zostałby
// wzięty za paginę.
const PAGINA_MIN_STRON = 5;
// Krawędź strony: tyle pierwszych i tyle ostatnich linii.
const PAGINA_GORA = 2;
const PAGINA_DOL = 3;
// Musi wystąpić na WIĘCEJ niż tylu stronach…
const PAGINA_UDZIAL_STRON = 0.5;
// …i tyle jego wystąpień musi leżeć przy krawędzi.
const PAGINA_UDZIAL_BRZEG = 0.7;

// Klucz porównania kandydatów. Trzy normalizacje, każda z konkretnego powodu
// zmierzonego na realnych plikach:
//  • cyfry → "#", bo pagina niesie numer strony ("s. 1/186", "L 119/5"),
//  • BIAŁE ZNAKI USUNIĘTE, bo stopka RODO ma dwa warianty odstępów na stronach
//    parzystych i nieparzystych ("4.5.2016 L 119/1Dziennik…" vs "4.5.2016L 119/2
//    Dziennik…"). Bez tego każdy wariant trafia na DOKŁADNIE połowę stron i próg
//    "ponad połowa" nie łapie żadnego — reguła wyglądałaby na działającą, a nie
//    usuwałaby niczego,
//  • małe litery, bo paginy bywają składane kapitalikami niekonsekwentnie.
export function kluczPaginy(line) {
  return String(line).replace(/\d+/g, '#').replace(/\s+/g, '').toLowerCase();
}

// OSŁONA: nagłówek strukturalny NIGDY nie jest usuwany jako pagina, niezależnie od
// powtarzalności i pozycji.
//
// Kryterium pozycji uratowało "Artykuł N" w RODO, bo tam artykuły stoją w toku tekstu
// (8% wystąpień przy krawędzi). Ale w dokumencie, gdzie każdy rozdział zaczyna się od
// NOWEJ STRONY z tytułem u góry, "Rozdział 1", "Rozdział 2"… po normalizacji cyfr dają
// jeden klucz, powtarzalny I zawsze przy górnej krawędzi — czyli reguła skasowałaby
// prawdziwe nagłówki. Regulaminy i instrukcje bywają tak składane; w korpusie tego nie ma.
//
// Osłona jest tania właśnie dlatego, że klucz zrównuje wyłącznie różnice w cyfrach:
// żywa pagina powtarzająca PEŁNY tytuł rozdziału ("Rozdział 3 — Urlopy" kontra
// "Rozdział 4 — Płace") różni się słowami, więc nigdy nie zderza się w jeden klucz
// i tak czy inaczej nie podlegała regule. Chronimy tu tylko formy typu marker + numer.
const NAGLOWEK_STRUKTURALNY =
  /^(?:§+\s*\d|(?:rozdzia[łl]|dzia[łl]|artyku[łl]|art\.|cz[ęe][śs][ćc]|za[łl][ąa]cznik|sekcja|tytu[łl]|ksi[ęe]ga|podrozdzia[łl])\s*(?:nr\s*)?[IVXLCDM\d])/i;

export function naglowekStrukturalny(linia) {
  return NAGLOWEK_STRUKTURALNY.test(String(linia).trim());
}

// Wykrywa żywe paginy w całym dokumencie. Wymaga statystyki WSZYSTKICH stron,
// dlatego ekstrakcja PDF idzie dwoma przebiegami.
//
// DLACZEGO SAMA POWTARZALNOŚĆ NIE WYSTARCZA: w RODO wszystkie "Artykuł 1".."Artykuł 99"
// po normalizacji cyfr zlewają się w jeden klucz obecny na 51 z 88 stron — czyli reguła
// oparta wyłącznie na powtarzalności skasowałaby dokładnie te nagłówki, o które chodzi.
// Rozróżnia je POZYCJA: stopka leży przy krawędzi w 92% wystąpień, "Artykuł N" w 8%.
//
// strony: [[linia, …], …]  →  { klucze: Set<string>, raport: [{ przyklad, wystapien, stron }] }
export function wykryjZywePaginy(strony) {
  const pusty = { klucze: new Set(), raport: [] };
  if (!Array.isArray(strony) || strony.length < PAGINA_MIN_STRON) return pusty;

  const licznik = new Map();
  strony.forEach((linie, i) => {
    linie.forEach((linia, j) => {
      // Liczymy WYŁĄCZNIE kandydatów na nagłówek. Zwykły wiersz tekstu, który
      // przypadkiem dałby ten sam klucz, nie ma prawa nikogo skazać.
      if (!isHeadingLine(linia)) return;
      // Nagłówek strukturalny nie trafia nawet do statystyki — nie ma go jak skazać.
      if (naglowekStrukturalny(linia)) return;
      const k = kluczPaginy(linia);
      let e = licznik.get(k);
      if (!e) {
        e = { strony: new Set(), wystapien: 0, brzeg: 0, przyklad: linia };
        licznik.set(k, e);
      }
      e.strony.add(i);
      e.wystapien++;
      if (j < PAGINA_GORA || j >= linie.length - PAGINA_DOL) e.brzeg++;
    });
  });

  const klucze = new Set();
  const raport = [];
  for (const [k, e] of licznik) {
    if (e.strony.size <= strony.length * PAGINA_UDZIAL_STRON) continue;
    if (e.brzeg / e.wystapien < PAGINA_UDZIAL_BRZEG) continue;
    klucze.add(k);
    raport.push({ przyklad: e.przyklad, wystapien: e.wystapien, stron: e.strony.size });
  }
  raport.sort((a, b) => b.wystapien - a.wystapien);
  return { klucze, raport };
}

// Zakończenia, po których zdanie NIE MOŻE się skończyć — linia kończąca się przyimkiem
// albo spójnikiem jest gramatycznie urwana, więc nie jest nagłówkiem.
const URWANE_KONCOWKI = new Set([
  'i', 'a', 'o', 'u', 'w', 'we', 'z', 'ze', 'na', 'do', 'od', 'po', 'za', 'ku', 'bez',
  'nad', 'pod', 'przed', 'przez', 'przy', 'dla', 'oraz', 'lub', 'albo', 'ani', 'że',
  'aby', 'niż', 'czy', 'ale', 'lecz', 'jak', 'gdy', 'jeśli', 'jeżeli', 'wraz', 'wobec',
]);

// Wzorzec C: kandydat ujęty W CAŁOŚCI w nawias to adnotacja, nie tytuł sekcji.
// "(Tekst mający znaczenie dla EOG)" z czołówki RODO stało się ścieżką dla 231 z 504
// fragmentów — całej preambuły, która własnych śródtytułów nie ma. To ta sama klasa
// co żywa pagina: element aparatu wydawniczego, nie treść rozdziału.
//
// Adnotacja jest DEGRADOWANA do akapitu, nie usuwana. Kasujemy wyłącznie żywe paginy,
// bo tamte powtarzają się na każdej stronie; ta linia występuje raz i jest tekstem
// dokumentu. Nawias kwadratowy obejmujemy tak samo — "[przypis redakcyjny]"
// z ludzie-bezdomni.pdf to dokładnie ten sam przypadek.
const ADNOTACJA_W_NAWIASIE = /^[([][^()[\]]*[)\]]$/;

export function adnotacjaWNawiasie(linia) {
  return ADNOTACJA_W_NAWIASIE.test(String(linia).trim());
}

// Znacznik pozycji listy: "a)", "3)", "-", "•". Taka linia zaczyna się małą literą
// albo cyfrą, ale NIE jest kontynuacją zdania — jest własną pozycją wyliczenia.
//
// ŚWIADOMIE bez wariantu "a." — kolidował z polskimi skrótami, przez co linia
// "r. poz. 25." w Kodeksie pracy uchodziła za pozycję listy i chroniła przed
// odrzuceniem poprzedzający ją śmieć "1423, 1661, z 2026".
const POZYCJA_LISTY = /^(?:[a-ząćęłńóśźż]\)|\d+\)|[-*•–—])\s/;

// Wiersz, który jest DALSZYM CIĄGIEM poprzedniego: zaczyna się małą literą albo
// liczbą przechodzącą w małą literę ("6 miesięcy może raz w roku…"). Ten drugi
// wariant jest konieczny, bo w Kodeksie pracy zawinięte otwarcia artykułów
// ("Art. 293. § 1. Pracownik zatrudniony u danego pracodawcy co najmniej")
// kontynuują się właśnie liczbą. Numerowany nagłówek "1. Zasady ogólne" ma po
// cyfrze kropkę, nie spację, więc się tu nie łapie.
const KONTYNUACJA = /^(?:[a-ząćęłńóśźż]|\d+\s+[a-ząćęłńóśźż])/;

// Wzorzec B: kandydat, który jest w rzeczywistości zawiniętym wierszem akapitu.
// `poprzednia` i `nastepna` to sąsiednie wiersze na tej samej stronie; `poprzednia`
// jest null po nagłówku i na starcie strony (zdanie nie ciągnie się przez nagłówek).
//
// Cztery niezależne sygnały, każdy sam w sobie wystarczający:
//  1. zaczyna się małą literą — nagłówek tak nie wygląda; łapie też punkty wyliczeń
//     w rodzaju "a) w prawie Unii; lub", które nagłówkami też nie są,
//  2. kończy się przyimkiem albo spójnikiem — zdanie jest urwane w pół,
//  3. kontynuuje poprzedni wiersz: poprzedni był długi i nie skończył się znakiem
//     końca zdania, więc ten jest jego dalszym ciągiem,
//  4. jest kontynuowany przez NASTĘPNY wiersz zaczynający się małą literą. Bez tego
//     sygnału umyka pierwszy wiersz akapitu stojący tuż po nagłówku — wtedy sygnał 3
//     nie ma czego badać, bo poprzednik został wyzerowany. Dokładnie tak wpadło
//     "W przypadku zauważenia dymu, iskrzenia lub nietypowego zapachu należy"
//     w 05-instrukcja-bhp.pdf. Pozycja listy jest tu wyjątkiem: po nagłówku
//     "Definicje" może stać "a) …" i nie znaczy to, że nagłówka nie było.
export function urwaneZdanie(linia, poprzednia, nastepna) {
  const s = String(linia).trim();
  if (!s) return false;

  if (/^[a-ząćęłńóśźż]/.test(s)) return true;

  const ostatnie = (s.match(/[\wąćęłńóśźżÀ-ž]+$/u) || [''])[0].toLowerCase();
  if (URWANE_KONCOWKI.has(ostatnie)) return true;

  // Poprzedni wiersz musi być na tyle długi, żeby wyglądał na pełną linię akapitu.
  // Krótki poprzednik to często sam nagłówek albo pozycja listy i nie świadczy o niczym.
  if (poprzednia && poprzednia.length >= 40 && !/[.!?:;]$/.test(poprzednia.trim())) return true;

  const n = nastepna ? String(nastepna).trim() : '';
  if (n && KONTYNUACJA.test(n) && !POZYCJA_LISTY.test(n)) return true;

  return false;
}

// =============================================================================
//  10.a.5 — STRAŻNIK POKRYCIA RODZINY NUMERACYJNEJ
//
//  Reguła B (urwane zdania) odrzuca kandydata, który wygląda na urwany. Problem
//  w tym, że nagłówek ZAPOWIADAJĄCY treść wygląda na urwany, bo jest urwany —
//  zdanie leci dalej w następnej linii. Nagłówek, który nie zapowiada niczego,
//  jest domknięty. Gdy marker sekcji stoi w tej samej linii co treść, kryterium
//  domkniętości przepuszcza WYŁĄCZNIE puste etykiety.
//
//  Zmierzone na Kodeksie pracy (D20250277Lj.pdf): z 702 krótkich linii otwartych
//  markerem "Art. N." / "§ N." przeżyły 102 — i 98 z nich to artykuły uchylone.
//  W efekcie 229 z 519 fragmentów (44%) dostawało ścieżkę "Art. 35. (uchylony)"
//  nad treścią artykułu NASTĘPNEGO. To gorsze niż śmieć: "©Kancelaria Sejmu"
//  było widocznym śmieciem, "Art. 35." wygląda wiarygodnie i wysyła pod zły przepis.
//
//  REGUŁA: jeżeli nagłówki danej rodziny numeracyjnej pokrywają znikomy ułamek
//  jej wystąpień w dokumencie, detekcja tej rodziny jest zepsuta — nie ufamy jej
//  wcale i degradujemy WSZYSTKIE jej nagłówki do akapitów. Ścieżka spada wtedy
//  o poziom wyżej (tytuł rozdziału). Lepiej prawda na grubszym poziomie niż fałsz
//  na dokładnym: "Urlopy wypoczynkowe" + numer strony wystarcza, żeby znaleźć przepis.
//
//  Degradacja NIE RUSZA TEKSTU. Nagłówki i akapity trafiają do extracted_text tak
//  samo (buildExtractedText łączy wszystkie bloki "\n\n"), więc zmienia się wyłącznie
//  grupowanie w runy i heading_path. Na Kodeksie: extracted_text bajt w bajt taki sam,
//  fragmentów 519 → 510.
// =============================================================================

// Prefiks numeracyjny, świadomie BEZ listy słów: opcjonalne słowo z wielkiej litery
// (albo §), liczba arabska lub rzymska, opcjonalna kropka/nawias. Łapie "Art. 36.",
// "§ 1.", "Artykuł 5", "Section 3", "1.", "IV." jednym wzorcem. RODZINA to
// znormalizowane słowo: "art", "§", "artykuł", "" dla gołej liczby.
//
// Kropka po słowie jest OPCJONALNA, bo "Artykuł 17" z RODO jej nie ma. Bez tego
// strażnik w ogóle nie widziałby najzdrowszej rodziny w korpusie i nie mógłby
// potwierdzić, że jest zdrowa — a milczenie z niewiedzy wygląda tak samo jak zgoda.
// Negatywny lookahead rozstrzyga kolizję liczb rzymskich ze słowem: bez niego
// "IV. Postanowienia" rozpada się na słowo "I" + numer "V", a "V. Coś" na sam
// numer "V" — ta sama numeracja trafiałaby do dwóch różnych rodzin i zaniżała
// pokrycie obu. Token złożony wyłącznie z IVXLCDM i zakończony spacją to liczba,
// nie słowo. ("Dział III" przechodzi: po "D" stoi "z", więc to nie liczba.)
//
// JEDNOLITEROWA liczba rzymska (I, V, X, L, C, D, M) musi mieć kropkę albo nawias,
// żeby w ogóle uchodzić za numerator. Bez tego zdanie otwarte polskim spójnikiem
// „I …" czyta się jako numer I i zasila mianownik pokrycia szumem — w „Ludziach
// bezdomnych" tak wpadły 4 linie. „I. Wstęp" i „V. Zakres" przechodzą bez zmian.
// Kropka nie odróżnia inicjału od numeru sekcji, więc „M. SCHULZ" (podpis pod RODO)
// zostaje znanym osadem — jedno wystąpienie na 402 i bez wpływu na wynik.
const PREFIKS_NUMERACYJNY =
  /^(§+|(?![IVXLCDM]+\.?(?:\s|$))[\p{Lu}][\p{L}]{0,11}\.?)?\s*(\d+[a-z]?|[IVXLCDM]{2,7}|[IVXLCDM](?=\s*[.)]))\s*[.)]?(?=\s|$)/u;

export function rozbijPrefiksNumeracyjny(linia) {
  const m = String(linia || '').match(PREFIKS_NUMERACYJNY);
  if (!m) return null;
  return {
    rodzina: (m[1] || '').replace(/\.$/, '').toLowerCase(),
    numer: m[2].toLowerCase(),
    pelny: m[0].trim(),
  };
}

// Rodzina musi mieć co najmniej tyle wystąpień, żeby w ogóle podlegać ocenie —
// przy trzech wystąpieniach "pokrycie" jest szumem, nie statystyką.
const POKRYCIE_MIN_WYSTAPIEN = 10;
// Poniżej tego ułamka uznajemy detekcję rodziny za zepsutą.
// Zmierzone: Kodeks art 13,2% · § 5,3% · goła liczba 1,6% (wszystkie zepsute),
// RODO artykuł ~90% (zdrowa). Próg 0,5 leży w bardzo szerokiej przerwie między nimi.
const POKRYCIE_PROG = 0.5;

// Ile razy każda rodzina otwiera linię w CAŁYM dokumencie (mianownik pokrycia).
export function statystykaRodzinNumeracyjnych(strony) {
  const stat = new Map();
  for (const linie of strony || []) {
    for (const l of linie) {
      const p = rozbijPrefiksNumeracyjny(l);
      if (!p) continue;
      stat.set(p.rodzina, (stat.get(p.rodzina) || 0) + 1);
    }
  }
  return stat;
}

// Degraduje do akapitu nagłówki rodzin o znikomym pokryciu. Zwraca raport
// (dla diagnostyki przy dokumencie); `blocks` modyfikowane w miejscu.
export function odsiejNiepewneRodziny(blocks, strony) {
  const stat = statystykaRodzinNumeracyjnych(strony);

  const wykryte = new Map();
  for (const b of blocks) {
    if (b.type !== 'heading') continue;
    const p = rozbijPrefiksNumeracyjny(b.text);
    if (!p) continue;
    wykryte.set(p.rodzina, (wykryte.get(p.rodzina) || 0) + 1);
  }

  const niepewne = new Set();
  const raport = [];
  for (const [rodzina, n] of wykryte) {
    const wystapien = stat.get(rodzina) || 0;
    if (wystapien < POKRYCIE_MIN_WYSTAPIEN) continue;
    const pokrycie = n / wystapien;
    if (pokrycie >= POKRYCIE_PROG) continue;
    niepewne.add(rodzina);
    raport.push({ rodzina: rodzina || '(goła liczba)', naglowkow: n, wystapien, pokrycie });
  }

  if (niepewne.size) {
    for (const b of blocks) {
      if (b.type !== 'heading') continue;
      const p = rozbijPrefiksNumeracyjny(b.text);
      if (p && niepewne.has(p.rodzina)) b.type = 'paragraph';
    }
  }

  raport.sort((a, b) => a.pokrycie - b.pokrycie);
  return raport;
}

// =============================================================================
//  POZIOMY NAGŁÓWKÓW — para "etykieta + tytuł"
//
//  chunk.js nadawał wszystkim nagłówkom z PDF poziom 1, a nagłówek zdejmuje ze stosu
//  każdy o poziomie >= swojemu. W RODO "Artykuł 36" i "Uprzednie konsultacje" to dwie
//  osobne linie nagłówkowe, więc tytuł natychmiast ZRZUCAŁ numer. Skutek: numer
//  artykułu wyparowywał z cytowania — tylko 53 z 503 fragmentów RODO miały
//  w heading_path jakąkolwiek cyfrę. Agent cytował "RODO › Uprzednie konsultacje"
//  zamiast "RODO › Artykuł 36 › Uprzednie konsultacje".
//
//  REGUŁA: nagłówek stojący bezpośrednio po GOŁYM MARKERZE jest jego tytułem, więc
//  schodzi o poziom głębiej. Goły marker ("Artykuł 36", "Rozdział IV") lokalizuje,
//  ale nic nie mówi — sam z siebie nie jest tytułem sekcji, tylko jej etykietą.
//
//  DLACZEGO NIE "KAŻDY NAGŁÓWEK PO NAGŁÓWKU": wersja szeroka zagnieżdża sąsiadów
//  z dwóch różnych sekcji. Zmierzone na Kodeksie: dawała ścieżki w rodzaju
//  "Rozdział II › DZIAŁ ÓSMY › Uprawnienia…", czyli twierdziła, że Dział VIII leży
//  w Rozdziale II. Realne sprzeczności ścieżki z treścią rosły z 0 do 1, a w prozie
//  ("Ludzie bezdomni") łączyła kolejne przypisy w fałszywe hierarchie — 188 ścieżek
//  zmienionych zamiast 10. Warunek "marker, po którym stoi NIE-marker" zawęża regułę
//  do jedynego układu, w którym zagnieżdżenie jest naprawdę uzasadnione.
// =============================================================================

// Jak h1..h6 — głębiej ścieżka przestaje cokolwiek komunikować.
const MAX_POZIOM_NAGLOWKA = 6;

export function golyMarker(tekst) {
  const p = rozbijPrefiksNumeracyjny(tekst);
  if (!p) return false;
  return String(tekst || '').trim().slice(p.pelny.length).trim() === '';
}

// Poziom nagłówka na podstawie POPRZEDNIEGO bloku. `poprzedni` to ostatni już
// wypuszczony blok (albo null na starcie dokumentu).
export function poziomNaglowka(linia, poprzedni) {
  if (!poprzedni || poprzedni.type !== 'heading') return 1;
  if (!golyMarker(poprzedni.text) || golyMarker(linia)) return 1;
  return Math.min((poprzedni.level || 1) + 1, MAX_POZIOM_NAGLOWKA);
}

async function extractPdf(bytes) {
  let unpdf;
  try {
    unpdf = await import('unpdf');
  } catch {
    throw fail('internal', 'Biblioteka unpdf nie jest zainstalowana. Uruchom: npm install unpdf');
  }
  const pdf = await unpdf.getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await unpdf.extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];

  // PRZEBIEG 1 — same linie. Reguła żywej paginy potrzebuje statystyki całego
  // dokumentu, więc bloków nie da się budować w locie jak dotąd.
  const strony = pages.map((p) =>
    String(p || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  );

  const { klucze, raport } = wykryjZywePaginy(strony);

  // PRZEBIEG 2 — budowa bloków. Żywe paginy są USUWANE tutaj, czyli PRZED złożeniem
  // extracted_text w chunk.js. To warunek zachowania niezmiennika 8.4: content
  // fragmentu jest wycinkiem extracted_text, więc obie strony muszą powstać z tej
  // samej, już odsianej listy bloków.
  const blocks = [];
  for (let p = 0; p < strony.length; p++) {
    const pageNo = p + 1;
    let para = [];
    let poprzedniaTresc = null;
    const flush = () => {
      if (para.length) {
        blocks.push({ type: 'paragraph', text: para.join(' ').trim(), page: pageNo });
        para = [];
      }
    };
    const linie = strony[p];
    for (let i = 0; i < linie.length; i++) {
      const line = linie[i];
      if (isHeadingLine(line)) {
        // Żywa pagina — wypada z dokumentu w całości (nie staje się treścią,
        // bo doklejałaby stopkę do fragmentu na każdym łamaniu strony).
        if (klucze.has(kluczPaginy(line))) continue;

        // Urwane zdanie i adnotacja w nawiasie — to PRAWDZIWA treść, tylko źle
        // zaklasyfikowana. Wraca do akapitu, nigdy nie jest usuwana.
        if (!urwaneZdanie(line, poprzedniaTresc, linie[i + 1]) && !adnotacjaWNawiasie(line)) {
          flush();
          blocks.push({
            type: 'heading',
            level: poziomNaglowka(line, blocks[blocks.length - 1]),
            text: line,
            page: pageNo,
          });
          poprzedniaTresc = null; // zdanie nie ciągnie się przez nagłówek
          continue;
        }
      }
      para.push(line);
      poprzedniaTresc = line;
    }
    flush();
  }

  // PRZEBIEG 3 — strażnik pokrycia (10.a.5). Musi iść PO zbudowaniu bloków, bo
  // liczy, ile nagłówków danej rodziny faktycznie przeżyło reguły z 10.a.2.
  // Nie dotyka tekstu, więc extracted_text i niezmiennik 8.4 są nienaruszone.
  const niepewneRodziny = odsiejNiepewneRodziny(blocks, strony);

  return {
    blocks,
    pageCount: totalPages || pages.length,
    usunietePaginy: raport,
    niepewneRodziny,
  };
}

// --- DOCX (mammoth → HTML): h1..h6 → heading, p/li → paragraph/list ----------
async function extractDocx(bytes) {
  let mammoth;
  try {
    mammoth = (await import('mammoth')).default;
  } catch {
    throw fail('internal', 'Biblioteka mammoth nie jest zainstalowana. Uruchom: npm install mammoth');
  }
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  const blocks = [];
  const re = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const inner = decodeEntities(stripTags(m[2])).replace(/\s+/g, ' ').trim();
    if (!inner) continue;
    if (tag[0] === 'h') {
      blocks.push({ type: 'heading', level: parseInt(tag[1], 10), text: inner, page: null });
    } else {
      blocks.push({ type: tag === 'li' ? 'list' : 'paragraph', text: inner, page: null });
    }
  }
  return { blocks, pageCount: null };
}

// Formaty v1 (redline 7). JEDNA LISTA, DWÓCH ODBIORCÓW.
//
// Dyspozytor niżej i samouczek „Jak przygotować dokumenty" muszą mówić to samo.
// Dopóki lista była wpisana w trzech miejscach naraz (warunki, komunikat błędu,
// tekst instrukcji), rozejście się ich było kwestią czasu — a objawiłoby się
// tak, że instrukcja obiecuje format, którego aplikacja nie przyjmie.
//
// Kolejność jest znacząca: w tej kolejności formaty pokazuje interfejs
// i komunikat o nieobsługiwanym pliku.
export const FORMATY = ['pdf', 'docx', 'txt', 'md', 'csv'];

// Aliasy rozszerzeń: inna końcówka, ten sam czytnik. ŚWIADOMIE NIE MA ICH
// w FORMATY — nie ogłaszamy ich w interfejsie ani w instrukcji, żeby nie mnożyć
// wariantów w głowie użytkownika, ale przyjmujemy plik, który tak się nazywa.
export const ALIASY_ROZSZERZEN = { markdown: 'md', text: 'txt' };

export async function extractBlocks(file, cfg) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const format = ALIASY_ROZSZERZEN[ext] || ext;
  const bytes = file.bytes;

  if (!FORMATY.includes(format)) {
    throw fail(
      'invalid_input',
      `Nieobsługiwany format pliku: .${ext}. Obsługiwane: ${FORMATY.join(', ')}.`
    );
  }

  // usunietePaginy zwraca tylko PDF — pozostałe formaty nie mają pojęcia strony.
  if (format === 'pdf') return extractPdf(bytes);
  if (format === 'docx') return extractDocx(bytes);
  if (format === 'csv') return { blocks: extractCsv(bytesToString(bytes), cfg.size), pageCount: null };
  if (format === 'md') return { blocks: extractMd(bytesToString(bytes)), pageCount: null };
  if (format === 'txt') return { blocks: extractTxt(bytesToString(bytes)), pageCount: null };

  // Nieosiągalne przy zgodnej FORMATY. Zostaje jako bezpiecznik: dopisanie
  // formatu do listy BEZ czytnika ma się skończyć jawnym błędem, a nie cichym
  // potraktowaniem pliku jako zwykłego tekstu.
  throw fail('internal', `Format .${format} jest na liście, ale nie ma czytnika.`);
}
