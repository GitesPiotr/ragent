// =============================================================================
//  RUCH OGRANICZONY — jedno pytanie, zadawane z czterech miejsc.
//
//  Prototyp pyta o to raz, przy starcie, i przeskakuje na koniec TYLKO glowa
//  (linie 441-442). U nas obejmuje to cala scene, napis, pierscien i oko,
//  wiec pytanie musi miec jedna odpowiedz i jedno miejsce.
//
//  Prototypowy try/catch zostaje razem z jego komentarzem „nie wolno przerwac
//  startu petli": matchMedia potrafi nie istniec w nietypowym srodowisku,
//  a brak preferencji nie jest bledem. Zwracamy wtedy falsz, czyli gramy
//  animacje — bo animacja niepotrzebnie zagrana jest mniejsza szkoda niz
//  ekran, ktory sie nie wczytal.
//
//  =========================================================================
//  NIE NASLUCHUJEMY ZMIAN PREFERENCJI. To jest decyzja, nie przeoczenie.
//
//  matchMedia daje addEventListener('change'), wiec dalo by sie reagowac na
//  przestawienie preferencji w systemie albo w DevTools bez przeladowania.
//  Nie robimy tego z trzech powodow:
//
//  1. Nasluch to kolejne zrodlo stanu, ktore trzeba odpiac w kazdej funkcji
//     czyszczacej — a mamy juz cztery miejsca, ktore o to pytaja. Kazde
//     z nich musialoby pilnowac wlasnej subskrypcji.
//  2. Przelaczenie W TRAKCIE przebiegu nie ma dobrej odpowiedzi. Przeskok na
//     klatke koncowa w polowie animacji jest sam w sobie gwaltownym ruchem,
//     czyli dokladnie tym, przed czym ta preferencja ma chronic.
//  3. Przypadek jest rzadki: uzytkownik przestawia to raz, w ustawieniach
//     systemu, a nie w trakcie ogladania ekranu logowania.
//
//  Co z tego wynika w praktyce: preferencja jest czytana przy KAZDYM
//  zamontowaniu sceny i przy KAZDYM logowaniu. Przestawienie jej i wejscie
//  na ekran ponownie — albo samo klikniecie „Zaloguj" — dziala od razu.
//  Nie dziala tylko przestawienie w trakcie patrzenia na juz zamontowana
//  scene, i to jest cena, ktora swiadomie placimy.
//  =========================================================================
export function czyRuchOgraniczony() {
  try {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    // Porownanie do `true`, a nie samo zwrocenie `.matches`: zapytanie bez
    // tego pola oddaloby `undefined`, ktore w warunku zachowuje sie jak falsz,
    // ale w porownaniu i w tescie juz nie. Funkcja ma zwracac wartosc logiczna,
    // nie „cos, co da sie potraktowac jak falsz".
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}
