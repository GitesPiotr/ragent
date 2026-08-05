// Wyszukiwanie hybrydowe: wektory + pełny tekst (sekcja 11.2).
//
// PO CO: wyszukiwanie wektorowe nie radzi sobie z DOKŁADNYMI IDENTYFIKATORAMI.
// Zmierzone na kolekcji „Regulaminy": „art. 36" dawało najlepsze trafienie 0,5303
// z RODO zamiast z Kodeksu pracy, a „art. 9999" (numer nieistniejący) zwracał
// przypis o dyrektywach EWG ze score 0,4516 — POWYŻEJ progu 0,45.
//
// PROGU TO NIE NAPRAWI. Najsłabsze poprawne trafienie w korpusie ma 0,4581, a śmieci
// przy zapytaniach identyfikatorowych stoją wyżej („U S T A W A z dnia 26 czerwca
// 1974 r." 0,5079, „Rozdział I" 0,4899). Każdy próg, który wycina śmieć, wycina
// wcześniej poprawną odpowiedź. Potrzebny jest DRUGI SYGNAŁ, nie inna granica.
//
// Ten moduł jest czysty: żadnych zapytań do bazy, żadnego embedowania. Dzięki temu
// cała logika fuzji, progu i noResults da się przetestować bez Postgresa i Ollamy.

// Ułamek miejsc w wynikach, ponad który grupa tekstowa nie wyjdzie.
//
// TO NIE JEST STAŁA STROJONA POD WYNIK — to zabezpieczenie przed tym, żeby ścieżka
// tekstowa zabrała CAŁĄ odpowiedź, gdy nie ma racji. Bez niego, przy zapytaniu
// „ile dni urlopu w 2024 roku", token „2024" daje 21 dopasowań (przypisy typu
// „U. z 2024 r. poz. 834, 1089, 1222"), które zajmują wszystkie pięć miejsc, a
// właściwy Art. 152 — o score 0,5606, czyli najmocniejszy sensowny wynik —
// WYPADA Z WYNIKÓW CAŁKOWICIE. Nie zostaje przy tym żaden sygnał, że coś przepadło.
//
// Wartość „połowa" nie została dobrana pomiarem: wynika z kształtu problemu.
// Dopasowanie dokładne ma pierwszeństwo, ale nie może wyprzeć całej odpowiedzi.
//
// KTO TO CZYTA I MA OCHOTĘ USUNĄĆ: powyższy pomiar jest powodem, dla którego istnieje.
export const UDZIAL_GRUPY_TEKSTOWEJ = 0.5;

// Ilu kandydatów wektorowych bierzemy do fuzji.
//
// MUSI być znacznie więcej niż topK: cel bywa głęboko w rankingu wektorowym i to
// właśnie GRUPOWANIE (dopasowania dokładne przed tematycznymi, patrz polaczTrafienia)
// ma go wyciągnąć. Zmierzone pozycje przed fuzją — „co mówi art. 36 kodeksu pracy" 8,
// „art. 36" 31, „art. 154" 58. Przy topK=5 żaden z nich nie miałby szansy się pojawić.
//
// UWAGA TERMINOLOGICZNA: wcześniej stało tu „wzmocnienie", co opisywało mechanizm
// PODBIJANIA SCORE O STAŁĄ. Ten mechanizm został usunięty (uzasadnienie przy
// polaczTrafienia) i zastąpiony jawnym grupowaniem — score jest surową wartością
// wektorową i nic go nie modyfikuje. Słowo poprawione, żeby komentarz nie opisywał
// kodu, którego nie ma: sprawdzenie tego kosztowało osobną rundę integracji.
export const GLEBOKOSC_FUZJI = 200;

// IDENTYFIKATOR = token zawierający cyfrę.
//
// Świadomie BEZ wiedzy o „artykułach", „paragrafach" i o języku polskim — reguła ma
// działać tak samo dla „Section 3", „ISO 9001" czy numeru faktury. Wystarczy, że coś
// wygląda na oznaczenie, a nie na słowo.
//
// To ta reguła sprawia, że `noResults` jest bezpieczne Z KONSTRUKCJI, a nie z pomiaru:
// „jak upiec sernik" nie ma cyfry, więc ścieżka tekstowa w ogóle się nie uruchamia
// i zachowanie jest bit w bit dzisiejsze. Bez tego warunku słownik `simple` (jedyny
// dostępny — polskiego nie ma na tej instancji) przepuszczałby „jak" jako pełnoprawny
// token, bo nie zna stop-słów.
// =============================================================================
//  TA FUNKCJA WYCINA IDENTYFIKATORY, ALE ICH NIE TOKENIZUJE. I to jest cała
//  poprawka — poprzednia wersja robiła jedno i drugie, a drugie robiła inaczej
//  niż Postgres.
//
//  CO BYŁO ZŁE. Wzorzec `\p{L}*\d[\p{L}\d]*` nie przechodził przez myślnik, więc
//  „P-01" oddawał `01`. Tymczasem parser Postgresa tnie ten sam napis na DWA
//  lexemy: `'p'` i `'-01'` — z myślnikiem PRZYKLEJONYM do liczby, bo czyta ją jako
//  liczbę ze znakiem. Odczytane wprost z kolumny content_tsv (jest STORED, więc to
//  nie jest rekonstrukcja, tylko zawartość bazy):
//
//    „Parametr P-01 określa histerezę…"  ->  'p':4 '-01':5 'parametr':3 …
//    „numer katalogowy 45-0002"          ->  '45':9 '-0002':10 …
//    „w wersji KMX-410/Q"                ->  'kmx':42 '-410':43 '/q':44 …
//    „6.1 Histereza"                     ->  '6.1':1   (KROPKA TEŻ ŁĄCZY)
//
//  Lexemu `'01'` nie ma tam w ogóle. Zapytanie o `01` nie miało jak w nic trafić —
//  i nie trafiało: rag_search_chunks_text z p_query="01" oddawało 0 wierszy,
//  a z p_query="P-01" pięć. Ten sam fragment, ta sama funkcja, ta sama kolekcja.
//
//  DLACZEGO ODDAJEMY ORYGINALNY NAPIS, A NIE ODTWARZAMY TOKENÓW W JS:
//
//  Odtwarzanie znaczy przepisanie reguł parsera Postgresa do JavaScriptu —
//  numhword, hword_numpart, liczba ze znakiem, float, wersja, ścieżka z ukośnikiem.
//  Każda reguła przepisana źle wraca jako CICHE ZERO WYNIKÓW, bo mija się z tym, co
//  leży w bazie. Ta usterka jest dowodem, że to nie jest ryzyko teoretyczne: jeden
//  dokument dał dwa różne znaki łączące (myślnik i kropkę), a trzeci — ukośnik —
//  siedzi w „KMX-410/Q". Nie ma powodu sądzić, że lista jest kompletna.
//
//  Napis oryginalny idzie do `plainto_tsquery('simple', …)`, czyli DO TEGO SAMEGO
//  parsera i tego samego słownika, przez który przeszła treść dokumentu
//  w `to_tsvector('simple', …)`. Obie strony tną tak samo, jakiekolwiek by te reguły
//  nie były. Symetria bierze się z konstrukcji, a nie z tego, że ktoś ją odgadł —
//  i dlatego ta klasa błędu nie ma jak wrócić.
//
//  ZOSTAJE DECYZJA, KTÓRA NAPRAWDĘ JEST NASZA: co jest identyfikatorem, a co
//  zwykłym słowem. To polityka („ma zawierać cyfrę"), nie parsowanie — i tylko ona
//  jest tutaj.
//
//  ZNAKI ŁĄCZĄCE `- . /` MUSZĄ STAĆ MIĘDZY ZNAKAMI ALFANUMERYCZNYMI. Dzięki temu
//  kropka kończąca zdanie nie wchodzi do identyfikatora („sprawdź P-01." -> „P-01"),
//  a „art. 36" dalej daje `36`, bo po kropce stoi spacja i ciąg się urywa.
//
//  CO SIĘ PRZEZ TO ZAOSTRZA — uczciwie: „20-25" leci teraz jako JEDEN identyfikator
//  ('20' & '-25'), a nie jako dwa ('20' & '25'). Fragment „od 20 do 25" przestaje
//  pasować. Jest to zgodne z sensem tej ścieżki — pytano o napis dokładny — ale
//  jest zmianą i dlatego stoi tu zapisana.
// =============================================================================
const WZORZEC_IDENTYFIKATORA = /[\p{L}\d]+(?:[-./][\p{L}\d]+)*/gu;

export function identyfikatoryZapytania(zapytanie) {
  const kandydaci = String(zapytanie || '').match(WZORZEC_IDENTYFIKATORA) || [];
  const widziane = new Set();
  const out = [];
  for (const t of kandydaci) {
    // Bramka „musi zawierać cyfrę" — jedyna decyzja tej funkcji.
    if (!/\d/.test(t)) continue;
    // Klucz porównania małymi literami, ale ODDAJEMY NAPIS ORYGINALNY: „P-01"
    // i „p-01" to jeden identyfikator, a słownik `simple` i tak sprowadzi go
    // do małych liter po stronie Postgresa.
    const k = t.toLowerCase();
    if (widziane.has(k)) continue;
    widziane.add(k);
    out.push(t);
  }
  return out;
}

// =============================================================================
//  ODSIEW POWTÓRZONYCH FRAGMENTÓW (11.1k)
//
//  PO CO: EPAR powtarza tę samą treść w charakterystyce, ulotce i oznakowaniu.
//  „Ile lenalidomidu jest w jednej kapsułce" ma 14 fragmentów w odległości 0,02 od
//  pierwszego — agent dostaje pięć wyników, z których kilka to ta sama treść, czyli
//  zmarnowane miejsce w kontekście zamiast pięciu różnych informacji.
//
//  DLACZEGO PORÓWNANIE TEKSTU, A NIE PODOBIEŃSTWO WEKTORÓW — to jest wynik pomiaru
//  (scripts/wer-blizniaki.mjs, 1575 par z 34 pytań), nie uproszczenie:
//
//    • pary różniące się WYŁĄCZNIE liczbą sięgają 0,9911
//      („Zalecana dawka początkowa lenalidomidu wynosi 10 mg" wobec „25 mg"),
//    • każdy dopuszczalny próg musi więc leżeć POWYŻEJ 0,9911,
//    • a powyżej tej wartości 26 z 27 odsiewanych par ma tekst IDENTYCZNY CO DO ZNAKU.
//
//  Czyli próg wektorowy w bezpiecznym zakresie robi dokładnie to, co porównanie
//  tekstu — tyle że z możliwością pomyłki o dawkę. Porównanie tekstu nie ma progu
//  do strojenia i nie może skasować „10 mg" dlatego, że wybrano już „25 mg".
//
//  NORMALIZACJA jest celowo minimalna: białe znaki i wielkość liter. Cyfry, jednostki
//  i interpunkcja ZOSTAJĄ — inaczej „5 mg" i „50 mg" zlałyby się w jedno.
// =============================================================================
export function kluczTresci(tekst) {
  return String(tekst || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Zwraca { hits, odsiane }. `odsiane` wychodzi na zewnątrz, żeby usunięcie było
// WIDOCZNE, a nie ciche — to ta sama zasada co licznik „pokazano 121 z 993".
//
// ZACHOWANY FRAGMENT NIESIE POCHODZENIE ODSIANYCH (`takzeW`). Powód dotyczy CYTOWAŃ,
// nie statystyki: gdy ta sama treść stoi w DWÓCH RÓŻNYCH dokumentach — regulaminie
// z 2023 i z 2024, instrukcji w dwóch wersjach — ciche wyrzucenie jednego znaczy, że
// agent zacytuje jedną wersję i nikt się nie dowie o drugiej. Zbieżność dwóch
// dokumentów CO DO ZNAKU bywa sama w sobie informacją, a przy wersjach dokumentu
// bywa informacją ważniejszą niż sama treść.
export function odsiejPowtorki(hits, { wlaczony = true } = {}) {
  if (!wlaczony) return { hits, odsiane: 0 };

  // Grupujemy po treści, zachowując pozycję PIERWSZEGO wystąpienia — miejsce w wynikach
  // ma zostać takie, jakie wyznaczyła fuzja, niezależnie od tego, którego przedstawiciela
  // grupy wybierzemy.
  const grupy = new Map();
  const kolejnosc = [];
  for (const h of hits) {
    const k = kluczTresci(h.content);
    // Pusty fragment nie ma czego powtarzać — nie zlepiamy takich w jeden.
    if (!k) {
      kolejnosc.push({ k: null, h });
      continue;
    }
    if (!grupy.has(k)) {
      grupy.set(k, []);
      kolejnosc.push({ k, h: null });
    }
    grupy.get(k).push(h);
  }

  let odsiane = 0;
  const zostaje = [];
  for (const wpis of kolejnosc) {
    if (wpis.k === null) {
      zostaje.push(wpis.h);
      continue;
    }
    const grupa = grupy.get(wpis.k);
    // NAJWYŻSZY WYNIK, a przy remisie `chunkId` — ta sama zasada rozstrzygania remisów
    // co przy ziarnach w normalizacji pojęć i przy sortowaniu fragmentów w grafie.
    // Bez klucza rozstrzygającego ta sama kolekcja zwracałaby raz jeden, raz drugi
    // fragment przy identycznym score.
    const posort = [...grupa].sort(
      (a, b) => b.score - a.score || String(a.chunkId).localeCompare(String(b.chunkId))
    );
    const wybrany = posort[0];
    const reszta = posort.slice(1);
    odsiane += reszta.length;
    zostaje.push(
      reszta.length
        ? {
            ...wybrany,
            takzeW: reszta.map((r) => ({
              chunkId: r.chunkId,
              documentId: r.documentId,
              fileName: r.fileName,
              pageFrom: r.pageFrom,
              // TEN SAM plik czy INNY — to jest właściwe pytanie przy cytowaniu.
              innyDokument: r.documentId !== wybrany.documentId,
            })),
          }
        : wybrany
    );
  }
  return { hits: zostaje, odsiane };
}

// Łączy obie ścieżki w jedną listę trafień.
//
// PORZĄDEK JEST JAWNY, NIE WYLICZONY: najpierw dopasowania dokładne (malejąco po
// score), potem trafienia tematyczne (malejąco po score). Grupa tekstowa nie
// przekracza UDZIAL_GRUPY_TEKSTOWEJ miejsc.
//
// Poprzednia wersja podbijała score o stałą i sortowała po wartości wzmocnionej.
// Odrzucone, bo stała musiała być dobierana tak, żeby cel „akurat" przeskoczył szum —
// przy „art. 154" przeskakiwał o 0,0009. Reguła jawna daje ten sam efekt bez
// balansowania na krawędzi i daje się wypowiedzieć jednym zdaniem.
//
// KONTRAKT `score` SIĘ NIE ZMIENIA (sekcja 11): to nadal podobieństwo wektorowe
// w [0,1], porównywane z progiem. Grupowanie działa na kolejność i na wpuszczenie.
// Kolejność NIE jest przez to monotoniczna po score — w obrębie grupy tak, między
// grupami nie. UI oznacza dopasowania dokładne, żeby nie wyglądało to na usterkę.
//
// wektorowe : [{ chunkId, …, score }] — posortowane malejąco, GŁĘBOKO (patrz wyżej)
// tekstowe  : [{ chunkId, textRank }] albo NULL, gdy ścieżka tekstowa nie była pytana.
//             Rozróżnienie null / [] jest nośnikiem reguły negatywnej — patrz niżej.
export function polaczTrafienia({
  wektorowe = [],
  tekstowe = null,
  prog,
  limit,
  udzialTekstowy = UDZIAL_GRUPY_TEKSTOWEJ,
  dedup = true,
} = {}) {
  const sciezkaTekstowaPytana = Array.isArray(tekstowe);

  // --- REGUŁA NEGATYWNA -------------------------------------------------------
  // Zapytanie wskazało konkretny identyfikator, a pełny tekst nie znalazł go NIGDZIE.
  // Wtedy podobieństwo tematyczne nie jest odpowiedzią — użytkownik pytał o rzecz
  // dokładną, a tej rzeczy w dokumentach nie ma. Zmierzony przypadek: „art. 9999"
  // zwracał dziś przypis o dyrektywach EWG ze score 0,4516, czyli powyżej progu.
  //
  // Warunek jest celowo ostry: WYŁĄCZNIE zero trafień tekstowych. Jedno wystarczy,
  // żeby wrócić do normalnego trybu — bo to znaczy, że identyfikator jednak istnieje,
  // a o kolejność zadba już GRUPOWANIE niżej (dopasowania dokładne idą przed
  // tematycznymi). Wcześniej stało tu „wzmocnienie" — nazwa usuniętego mechanizmu
  // podbijania score; patrz nota przy GLEBOKOSC_FUZJI.
  if (sciezkaTekstowaPytana && tekstowe.length === 0) {
    return { hits: [], noResults: true, regulaNegatywna: true, odsiane: 0 };
  }

  const rangaTekstowa = new Map();
  if (sciezkaTekstowaPytana) {
    for (const t of tekstowe) rangaTekstowa.set(t.chunkId, Number(t.textRank) || 0);
  }

  const polaczone = wektorowe.map((h) => {
    const wTekscie = rangaTekstowa.has(h.chunkId);
    return {
      ...h,
      tekstRank: wTekscie ? rangaTekstowa.get(h.chunkId) : null,
      trafionePrzez: !wTekscie ? 'wektor' : h.score >= prog ? 'oba' : 'tekst',
    };
  });

  // WPUSZCZENIE: próg wektorowy ALBO dopasowanie tekstowe. Drugi warunek jest
  // konieczny — cel „art. 36" ma score 0,4462, czyli poniżej progu, i bez tego
  // nigdy by się nie pokazał, choć zawiera dokładnie ten numer, o który pytano.
  const wpuszczone = polaczone.filter((h) => h.score >= prog || h.trafionePrzez !== 'wektor');

  // Stabilny remis: przy równym score decyduje chunkId, nie kolejność z bazy.
  const wgScore = (a, b) => b.score - a.score || String(a.chunkId).localeCompare(String(b.chunkId));

  const dokladne = wpuszczone.filter((h) => h.trafionePrzez !== 'wektor').sort(wgScore);
  const tematyczne = wpuszczone.filter((h) => h.trafionePrzez === 'wektor').sort(wgScore);

  const maxDokladnych = Math.max(1, Math.ceil(limit * udzialTekstowy));
  const uporzadkowane = [...dokladne.slice(0, maxDokladnych), ...tematyczne, ...dokladne.slice(maxDokladnych)];

  // ODSIEW PRZED PRZYCIĘCIEM DO `limit` — i to jest cała różnica. Gdyby szedł po
  // przycięciu, usunięte powtórki zostawiałyby DZIURY: użytkownik prosił o pięć
  // wyników i dostawał trzy. Odsiewając wcześniej, kolejne kandydaty wchodzą na
  // zwolnione miejsca i `topK` jest dotrzymane, dopóki starcza kandydatów.
  const { hits: bezPowtorek, odsiane } = odsiejPowtorki(uporzadkowane, { wlaczony: dedup });
  const hits = bezPowtorek.slice(0, limit);

  return { hits, noResults: hits.length === 0, regulaNegatywna: false, odsiane };
}
