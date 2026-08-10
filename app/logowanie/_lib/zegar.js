// =============================================================================
//  ZEGAR SCENY — sama arytmetyka czasu, zero DOM-u i zero Reacta.
//
//  Odwzorowanie stanu z linii 357 prototypu (t, playing, last) i kroku petli
//  z linii 407-408. Prototyp trzyma to w zmiennych na poziomie modulu i mutuje
//  w miejscu; tutaj stan jest zwyklym obiektem, a krok czysta funkcja, ktora
//  zwraca nowy. Dzieki temu da sie go przetestowac bez przegladarki i bez
//  jednej klatki animacji.
// =============================================================================

// prototyp, linia 407: Math.min(60, now - last).
//
// PO CO TO JEST, bo z samej liczby nie widac: znacznik rAF nie tyka, gdy
// zakladka jest w tle albo watek stoi zablokowany. Po powrocie roznica
// znacznikow potrafi wyniesc sekundy i scena przeskoczylaby kawal animacji
// w jednej klatce — zamiast animacji byloby ciecie. 60 ms to okolo czterech
// klatek przy 60 fps: tyle wolno nadrobic naraz.
export const MAKS_DT_MS = 60;

export function stanPoczatkowy() {
  return { t: 0, ostatniZnacznik: null, gra: true };
}

export function stanKoncowy(czasTrwania) {
  return { t: czasTrwania, ostatniZnacznik: null, gra: false };
}

// =============================================================================
//  krokZegara(stan, now, { czasTrwania })
//
//  Zwraca NOWY stan. Wejscia nie rusza — inaczej podwojne montowanie w Strict
//  Mode kazalo by dwom petlom mutowac ten sam obiekt.
//
//  PIERWSZA KLATKA nie przesuwa czasu, tylko zapisuje znacznik. Prototyp robi
//  to samo przez `if(!last)last=now`, czyli przez falsy — co lapie takze
//  now === 0. Tutaj warunkiem jest jawne `=== null`, bo znacznik 0 jest
//  poprawnym znacznikiem, a nie brakiem znacznika.
//
//  PODCZAS PAUZY CZAS STOI, ALE ZNACZNIK I TAK SIE AKTUALIZUJE. To jest
//  nieoczywiste i wazne: gdyby znacznik stal w miejscu, wznowienie policzyloby
//  dt rowne calej dlugosci pauzy i scena skoczylaby do przodu. Ograniczenie do
//  MAKS_DT_MS zamaskowaloby to czesciowo — przeskok bylby o 60 ms zamiast
//  o cala pauze — ale nadal bylby to przeskok, ktorego nikt nie zamawial.
//
//  ODSTEPSTWO OD PROTOTYPU: prototyp liczy Math.min(60, now - last) BEZ dolnej
//  granicy. Ujemna roznica znacznikow cofnelaby czas sceny. W przegladarce
//  performance.now() jest monotoniczny, wiec tam nie moglo do tego dojsc —
//  ale krokZegara jest funkcja czysta, wolana takze z testu i z dowolnego
//  zrodla czasu, wiec dolna granica 0 jest jawna czescia kontraktu.
// =============================================================================
export function krokZegara(stan, now, { czasTrwania }) {
  if (stan.ostatniZnacznik === null) {
    return { ...stan, ostatniZnacznik: now };
  }

  const dt = Math.min(MAKS_DT_MS, Math.max(0, now - stan.ostatniZnacznik));

  if (!stan.gra) {
    return { ...stan, ostatniZnacznik: now };
  }

  const t = stan.t + dt;

  // Zatrzymanie jest twarde: t nie ma prawa przekroczyc czasTrwania ani
  // o milisekunde, bo konsumenci licza z niego postep t/czasTrwania i wartosc
  // powyzej jedynki wyszlaby poza zakres przezroczystosci i dlugosci kreski.
  if (t >= czasTrwania) {
    return { t: czasTrwania, ostatniZnacznik: now, gra: false };
  }

  return { t, ostatniZnacznik: now, gra: true };
}
