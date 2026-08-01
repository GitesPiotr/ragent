// JAKOŚĆ WARSTWY TEKSTOWEJ — czy ekstrakcja dała użyteczny tekst (11.1d).
//
// Czysty JS: bez bazy, bez sieci, bez plików. Wejściem jest string, wyjściem liczby.
// Dzięki temu cała reguła daje się przetestować na zapisanych próbkach.
//
// =============================================================================
//  DLACZEGO DWA SYGNAŁY, A NIE INNE PROGI NA JEDNYM
//
//  Sam udział znaków diakrytycznych mierzy POLSKOŚĆ, nie jakość. Poprawny angielski
//  ma 0,0% i wygląda identycznie jak okaleczony polski (1,4%). Zmierzone: 4 fałszywe
//  alarmy na 8 przypadków — angielski, niemiecki, czeski i łotewski, wszystkie
//  poprawne, wszystkie oskarżone. Wykrywanie języka po ZNAKACH zawodzi tak samo:
//  „ä ö ü" nie odróżnia niemieckiego od estońskiego.
//
//  DRUGI SYGNAŁ: polskie słowa funkcyjne POZBAWIONE DIAKRYTYKÓW. „i", „w", „na",
//  „do", „oraz", „przez" nie mają czego stracić przy uszkodzeniu kodowania, więc
//  przeżywają je NIETKNIĘTE i mierzą „to jest polszczyzna" niezależnie od tego, czy
//  warstwa znaków ocalała. Rozpoznawanie po SŁOWACH jest przy okazji odporne na to,
//  na czym poległo rozpoznawanie po znakach: „der/die/und" wobec „ja/on/ning".
//
//  Zmierzone na 13 dokumentach (scripts/wer-miara-okaleczenia.mjs):
//     słowa funkcyjne : polski 18,0–24,8%  ·  nie polski 0,0–6,9%   przerwa 11,1 pkt
//     diakrytyki      : poprawny 3,9–6,6%  ·  okaleczony 1,4%       przerwa  2,5 pkt
//  Progi leżą w ŚRODKACH przerw. Nie były dobierane pod wynik.
// =============================================================================

// Poniżej tylu słów nie orzekamy NICZEGO. `03-pracownicy.csv` (tabela imion
// i stanowisk) ma zero słów funkcyjnych, bo nie jest prozą — i to on omal nie
// skreślił tej miary, gdy potraktowano go jako przypadek pozytywny zamiast jako
// wstrzymanie.
export const MIN_SLOW = 100;
export const PROG_FUNKCYJNYCH = 8; // % — poniżej: to nie polszczyzna, reguła milczy
export const PROG_DIAKRYTYKOW = 2.5; // % — poniżej, PRZY polszczyźnie: uszkodzenie

const POLSKIE_ZNAKI = /[ąćęłńóśźż]/gi;

// WYŁĄCZNIE słowa bez znaków diakrytycznych — na tym polega cała idea. Każde z nich
// wygląda tak samo w tekście poprawnym i w okaleczonym. (Dlatego NIE MA tu „się",
// „są", „może", „także", „też" — wszystkie mają diakrytyk i zniknęłyby razem z nim.)
export const SLOWA_FUNKCYJNE_PL = new Set([
  'i', 'w', 'na', 'do', 'z', 'ze', 'o', 'od', 'po', 'oraz', 'lub', 'przez', 'dla',
  'jest', 'nie', 'to', 'a', 'ale', 'przy', 'bez', 'pod', 'nad', 'jak', 'tym', 'ten',
  'ta', 'te', 'tego', 'tych', 'ich', 'jego', 'jej', 'tylko', 'jednak', 'ma', 'co',
  'gdy', 'albo', 'tak', 'dwa', 'trzy',
]);

// Do NAZWANIA języka, gdy reguła milczy — informacja dla użytkownika, nie decyzja.
const FUNKCYJNE_INNE = {
  angielski: ['the', 'and', 'of', 'to', 'in', 'for', 'is', 'that', 'with', 'as', 'be', 'are', 'this', 'shall', 'or', 'by'],
  niemiecki: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'den', 'von', 'mit', 'auf', 'ein', 'eine', 'zu', 'dem', 'des'],
  łotewski: ['un', 'ir', 'lai', 'no', 'ar', 'kas', 'vai', 'ja', 'uz', 'nav', 'ka'],
  litewski: ['yra', 'kad', 'su', 'ar', 'bei', 'kaip', 'tik', 'nuo'],
  estoński: ['ja', 'on', 'ei', 'ning', 'kui', 'see', 'et', 'ka', 'siis'],
};

/** Cztery stany. „nieoceniony" NIE jest odmianą „w porządku" (12.9). */
export const STANY = {
  OK: 'polski-ok',
  OKALECZONY: 'okaleczony',
  OBCY: 'nie-polski',
  NIEOCENIONY: 'nieoceniony',
};

function procent(ile, zIlu) {
  return zIlu ? Math.round((ile / zIlu) * 1000) / 10 : 0;
}

/**
 * Mierzy jakość warstwy tekstowej. Zwraca LICZBY, nie tylko werdykt —
 * przy zmianie progów ponowna ocena ma kosztować jedno zapytanie, a nie ponowną
 * ekstrakcję całego korpusu.
 */
export function zmierzJakoscTekstu(tekst) {
  const t = typeof tekst === 'string' ? tekst : '';
  const liter = (t.match(/\p{L}/gu) || []).length;
  const slowa = t.toLowerCase().match(/\p{L}+/gu) || [];
  const diakrytyki = procent((t.match(POLSKIE_ZNAKI) || []).length, liter);
  const funkcyjnePl = procent(slowa.filter((s) => SLOWA_FUNKCYJNE_PL.has(s)).length, slowa.length);

  let jezykObcy = null;
  let udzialObcego = 0;
  for (const [jezyk, lista] of Object.entries(FUNKCYJNE_INNE)) {
    const zbior = new Set(lista);
    const u = procent(slowa.filter((s) => zbior.has(s)).length, slowa.length);
    if (u > udzialObcego) {
      udzialObcego = u;
      jezykObcy = jezyk;
    }
  }

  let werdykt;
  if (slowa.length < MIN_SLOW) werdykt = STANY.NIEOCENIONY;
  else if (funkcyjnePl < PROG_FUNKCYJNYCH) werdykt = STANY.OBCY;
  else werdykt = diakrytyki < PROG_DIAKRYTYKOW ? STANY.OKALECZONY : STANY.OK;

  return {
    werdykt,
    slow: slowa.length,
    funkcyjnePl,
    diakrytyki,
    jezykObcy: werdykt === STANY.OBCY ? jezykObcy : null,
    udzialObcego: werdykt === STANY.OBCY ? udzialObcego : 0,
    zmierzono: new Date().toISOString(),
  };
}

/**
 * Zdanie dla użytkownika. OSTRZEŻENIE tylko dla okaleczonego — dokument
 * obcojęzyczny jest obcojęzyczny zgodnie z prawdą i nic z tym nie jest nie tak.
 */
export function opiszJakosc(j) {
  if (!j || !j.werdykt) return null;
  switch (j.werdykt) {
    case STANY.OKALECZONY:
      return {
        waga: 'ostrzezenie',
        tekst: `Ten plik nie ma użytecznej warstwy tekstowej — tylko ${j.diakrytyki}% znaków to polskie znaki diakrytyczne (poprawny tekst ma 4–7%). Wyszukiwanie będzie działać gorzej. Wgraj wersję z poprawną warstwą tekstową.`,
      };
    case STANY.OBCY:
      // OBIE LICZBY, KAŻDA PODPISANA SWOIM JĘZYKIEM. Poprzednia wersja pisała
      // „4.8% słów funkcyjnych" mając na myśli słowa ŁOTEWSKIE, a czytało się to
      // jako miarę polską (która wynosi 6,5%) — czyli widok mówił co innego niż
      // pomiar, przy identycznych danych. Nazwa liczby jest częścią liczby.
      return {
        waga: 'informacja',
        tekst: j.jezykObcy
          ? `Dokument nie jest po polsku: ${j.funkcyjnePl}% słów funkcyjnych polskich (próg ${PROG_FUNKCYJNYCH}%), ${j.udzialObcego}% słów funkcyjnych języka ${j.jezykObcy}. Reguła jakości go nie ocenia.`
          : `Dokument nie jest po polsku: ${j.funkcyjnePl}% słów funkcyjnych polskich (próg ${PROG_FUNKCYJNYCH}%). Reguła jakości go nie ocenia.`,
      };
    case STANY.NIEOCENIONY:
      return {
        waga: 'informacja',
        tekst: `Za mało tekstu ciągłego, żeby ocenić jakość (${j.slow} słów, potrzeba ${MIN_SLOW}). To NIE znaczy, że dokument jest w porządku — znaczy, że nie wiadomo.`,
      };
    default:
      return null;
  }
}
