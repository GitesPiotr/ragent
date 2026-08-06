// =============================================================================
//  PODGLĄD NA ŻYWO — REGUŁY DECYDUJĄCE, KIEDY MAPA MA SIĘGNĄĆ PO DANE
//
//  DLACZEGO OSOBNY PLIK: te trzy pytania rozstrzygały się dotąd w warunkach
//  rozsianych po komponencie i żadnego z nich nie dało się sprawdzić inaczej
//  niż indeksowaniem stu fragmentów z zegarkiem w ręku. Zmierzone zachowanie
//  sprzed poprawki jest opisane przy każdej funkcji, żeby regres był widoczny.
//
//  CO BYŁO ZEPSUTE — POMIAR, NIE DOMYSŁ (przebieg na 110-118 fragmentach):
//
//   A. MARTWY START. Okno otwarte PRZED wgraniem dokumentu nie zauważało
//      niczego przez 110 s: nagłówek stał na 120 fragmentach, płótno nie
//      przerysowało się ani razu, znacznik „trwa indeksowanie" nie zaświecił.
//      Przyczyna była pętlą: odpytywanie startowało tylko gdy `indeksujeSie`,
//      a `indeksujeSie` liczyło się z listy dokumentów, którą odświeżało
//      WYŁĄCZNIE to samo odpytywanie. Żeby zauważyć nowy dokument, trzeba było
//      już go znać. Stąd `czyOdswiezycListe` — puls niezależny od tego warunku.
//
//   B. GUBIONY KONIEC. Gdy indeksowanie się kończyło, `indeksujeSie` stawało
//      się fałszem i efekt gasł RAZEM z nim — ostatnia partia zostawała
//      nieodczytana. Zmierzone: 30 s po zakończeniu okno pokazywało 446
//      fragmentów zamiast 460. Stąd `czyDomknac`.
//
//   C. KOMUNIKAT O PRZELICZENIU BAZY NIE POJAWIAŁ SIĘ NIGDY. Szedł z pola
//      `recalculated`, a to wraca w odpowiedzi /embed WYŁĄCZNIE do pętli, która
//      prowadzi indeksowanie. Obserwator jej nie prowadzi, więc nie miał go
//      skąd wziąć. Stąd `czyPrzeliczonoBaze` — po `builtAt`, który widać
//      w każdym odczycie mapy.
//
//  KASKADY NA ŚCIEŻCE ODPYTYWANIA CELOWO NIE MA. Kaskada rozkłada w czasie
//  PARTIĘ — zbiór, o którym wiemy, że powstał jednym żądaniem. Odpytywanie nie
//  widzi partii, tylko RÓŻNICĘ MIĘDZY DWOMA ODCZYTAMI, która może obejmować pół
//  partii albo dwie i pół. Rozłożenie tej różnicy w czasie byłoby twierdzeniem
//  o kolejności, której nie znamy — czyli dokładnie tym, czego zabrania reguła
//  12.9. Poświata zostaje, bo mówi „te punkty są nowe" i nic ponadto: żadnej
//  kolejności, żadnego tempa. Nadaje ją `pobierz` wszystkim naraz.
// =============================================================================

// Statusy, przy których dokument jeszcze się przetwarza. Kopia z komponentu
// świadoma i jednokierunkowa: tam zostaje źródło, tutaj jest po to, żeby reguły
// dało się sprawdzić bez Reacta.
export const STATUSY_W_TOKU = ['pending', 'extracting', 'chunking', 'chunked', 'embedding'];

// Puls listy dokumentów. 10 s, nie 5 jak odpytywanie postępu: ten puls chodzi
// TAKŻE w spoczynku, więc płaci za niego każdy otwarty widok mapy, a opóźnienie
// zauważenia nowego dokumentu i tak ginie przy pierwszej partii, która idzie
// kilkanaście sekund.
export const PULS_DOKUMENTOW = 10000;

// -----------------------------------------------------------------------------

// Czy któryś dokument jest w trakcie przetwarzania. `chunkCount > 0` odsiewa
// dokumenty świeżo wgrane, jeszcze bez fragmentów — nie ma tam czego pokazywać.
export function czyIndeksowanieTrwa(dokumenty) {
  if (!Array.isArray(dokumenty)) return false;
  return dokumenty.some((d) => d && STATUSY_W_TOKU.includes(d.status) && d.chunkCount > 0);
}

// Odcisk listy dokumentów — zmiana tego napisu znaczy „lista jest inna".
// Bierzemy id, status i liczbę fragmentów, bo tylko te trzy rzeczy zmieniają
// zachowanie mapy. Bez odcisku każdy puls podstawiałby nową tablicę i przemontowywał
// efekty, które od niej zależą.
export function odciskDokumentow(dokumenty) {
  if (!Array.isArray(dokumenty)) return '';
  return dokumenty.map((d) => `${d?.id}:${d?.status}:${d?.chunkCount}`).join('|');
}

export function czyListaSieZmienila(biezaca, nowa) {
  return odciskDokumentow(biezaca) !== odciskDokumentow(nowa);
}

// -----------------------------------------------------------------------------

// DOMKNIĘCIE: przejście z „coś się dzieje" w „już nie". Wyłącznie to jedno
// przejście — nie „trwa" i nie „nie trwa", bo wtedy dociągalibyśmy mapę albo
// bez końca, albo od pierwszego renderu.
export function czyDomknac(bylo, jest) {
  return bylo === true && jest === false;
}

// Baza rzutowania przeliczona — poznajemy po ZMIANIE builtAt między odczytami.
// Pierwszy odczyt nigdy nie jest przeliczeniem: nie ma z czym porównać, a bez
// tego zastrzeżenia komunikat wyskakiwałby przy każdym wejściu na mapę.
export function czyPrzeliczonoBaze(poprzednie, nowe) {
  if (!poprzednie || !nowe) return false;
  if (!poprzednie.projectionBuilt || !nowe.projectionBuilt) return false;
  if (!poprzednie.builtAt || !nowe.builtAt) return false;
  return poprzednie.builtAt !== nowe.builtAt;
}
