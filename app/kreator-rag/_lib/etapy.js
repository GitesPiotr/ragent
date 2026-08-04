// Stan dwóch etapów kolekcji — CZYSTA FUNKCJA, bez React i bez fetch.
//
// =============================================================================
//  PO CO TO W OGÓLE ISTNIEJE
//
//  Do rundy 3 widok kolekcji pokazywał dwa paski postępu obok siebie —
//  wektory i pojęcia — i nic nie mówiło, że drugi jest opcjonalny. Użytkownik
//  naturalnie zakładał, że oba trzeba wypełnić, żeby agent działał.
//  NIEPRAWDA: agent korzysta WYŁĄCZNIE z wektorów. Pomiar 14/14 z rundy 10
//  integracji zrobiono na kolekcji, w której główny dokument miał 0/107 pojęć.
//
//  Reguła „kiedy etap jest ukończony" musi więc mieszkać w jednym miejscu
//  i dać się sprawdzić bez przeglądarki — bo to ona decyduje, czy użytkownik
//  zobaczy „gotowa dla agenta", czy dalej będzie czekał na coś, na co nie ma
//  powodu czekać.
// =============================================================================

export const STAN = {
  UKONCZONY: 'ukonczony',
  AKTYWNY: 'aktywny',
  ZABLOKOWANY: 'zablokowany',
};

// Dokument, który ma wektory. `status === 'ready'` ustawia embedNextBatch
// dopiero wtedy, gdy NIE ZOSTAŁ ani jeden fragment bez wektora — to jest
// pełna informacja, więc nie ma potrzeby liczyć wektorów po stronie UI.
export function zaindeksowany(d) {
  return !!d && d.status === 'ready' && d.chunkCount > 0;
}

// Dokument, który MA fragmenty, ale nie ma kompletu wektorów. `no_text`
// (skan) i `error` nie wchodzą: nie da się ich zaindeksować, więc nie mogą
// w nieskończoność blokować etapu 1. Wyszłoby na to, że jeden nieczytelny
// skan odbiera całej kolekcji napis „gotowa dla agenta", choć reszta działa.
export function czekaNaIndeksowanie(d) {
  return !!d && d.chunkCount > 0 && d.status !== 'ready';
}

// =============================================================================
//  KOMPLET POJĘĆ — TRZY STANY, NIE DWA
//
//  `postepPojec[docId]` to { done, total } dociągane z bazy przy wejściu na
//  stronę. Brak wpisu NIE JEST tym samym co „zero pojęć": znaczy, że jeszcze
//  nie pytaliśmy. Ta sama zasada co przy `nieoceniony` w jakości warstwy
//  tekstowej (11.1d) — reguła, która milczy, nie może wyglądać jak reguła,
//  która przepuściła.
//
//  `total === 0` to KOMPLET, nie brak. Kandydatów wyznacza próg wyrazów
//  w SQL (sql/session-7-concepts.sql), więc dokument złożony z samych krótkich
//  fragmentów nigdy nie dostanie ani jednego pojęcia i nie ma na co czekać.
// =============================================================================
export function pojeciaKompletne(docId, postepPojec) {
  const p = postepPojec && postepPojec[docId];
  if (!p || typeof p.total !== 'number') return null; // nie wiemy
  return p.done >= p.total;
}

// =============================================================================
//  ETAP 2 JEST UKOŃCZONY DOPIERO, GDY WSZYSTKIE ZINDEKSOWANE DOKUMENTY MAJĄ
//  KOMPLET POJĘĆ.
//
//  Nie „gdy są jakieś pojęcia". Kolekcja TEST ma 8 pojęć z 107 fragmentów
//  w głównym dokumencie — próg „cokolwiek" ogłaszałby ją ukończoną i graf
//  opisywałby stan w połowie przetwarzania jako końcowy. To ta sama pułapka,
//  przed którą ostrzega napis o oczekującym scalaniu duplikatów.
// =============================================================================
export function stanEtapow(dokumenty, postepPojec) {
  const lista = Array.isArray(dokumenty) ? dokumenty : [];
  const zaindeksowane = lista.filter(zaindeksowany);
  const czekajace = lista.filter(czekaNaIndeksowanie);

  const etap1Ukonczony = zaindeksowane.length > 0 && czekajace.length === 0;

  // Bez ani jednego zindeksowanego dokumentu etap 2 nie ma na czym pracować —
  // i nie wolno go ogłosić ukończonym przez pustą listę. `every` na pustym
  // zbiorze zwraca true, więc warunek liczności musi stać osobno.
  const bezPojec = zaindeksowane.filter((d) => pojeciaKompletne(d.id, postepPojec) !== true);
  const etap2Ukonczony = etap1Ukonczony && zaindeksowane.length > 0 && bezPojec.length === 0;

  return {
    zaindeksowane,
    czekajace,
    bezPojec,
    etap1: {
      ukonczony: etap1Ukonczony,
      stan: etap1Ukonczony ? STAN.UKONCZONY : STAN.AKTYWNY,
    },
    etap2: {
      ukonczony: etap2Ukonczony,
      // ZABLOKOWANY, dopóki etap 1 nie jest ukończony — punkt 3 rundy 3.
      // Nie chodzi o to, że pojęcia by się nie policzyły; chodzi o to, że
      // proponowanie kroku opcjonalnego przed wymaganym odwraca kolejność,
      // którą ten widok ma właśnie wyjaśnić.
      stan: !etap1Ukonczony
        ? STAN.ZABLOKOWANY
        : etap2Ukonczony
          ? STAN.UKONCZONY
          : STAN.AKTYWNY,
      dostepny: etap1Ukonczony,
    },
  };
}
