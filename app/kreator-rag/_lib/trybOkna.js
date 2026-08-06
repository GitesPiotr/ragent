// =============================================================================
//  TRYB OKNA — ARYTMETYKA ROZMIARÓW, BEZ DOM-u I BEZ REACTA
//
//  DLACZEGO OSOBNY PLIK: tu siedzi jedna reguła, której złamanie nie objawia
//  się wyjątkiem, tylko płótnem rosnącym w nieskończoność albo oknem większym
//  niż ekran. Jedno i drugie da się sprawdzić testem wyłącznie wtedy, gdy
//  liczby powstają poza komponentem.
//
//  SPRZĘŻENIE ZWROTNE, KTÓREGO TU NIE MA — I DLACZEGO KONSTRUKCYJNIE:
//
//  Kuszące jest wzięcie wysokości płótna z `kontener.clientHeight`. To jest
//  pętla: płótno leży W kontenerze, więc jego wysokość współtworzy wysokość
//  kontenera; kontener mierzony po zmianie płótna oddaje wartość większą,
//  ta trafia z powrotem na płótno i przy każdym przeliczeniu mapa puchnie.
//
//  Dlatego wysokość pochodzi z `window.innerHeight` — z viewportu, który nie
//  wie nic o treści strony i którego żaden nasz styl nie zmieni. Funkcja niżej
//  nie przyjmuje ani elementu, ani niczego zmierzonego z układu: dostaje jedną
//  liczbę z okna i oddaje jedną liczbę na płótno. To jest zabezpieczenie
//  konstrukcyjne, nie obietnica — pilnuje go test.
//
//  SZEROKOŚCI TU NIE MA — I TO JEST POPRAWKA PO POMIARZE, NIE UPROSZCZENIE.
//
//  Pierwsza wersja liczyła też szerokość, jako `innerWidth - padding`. W oknie
//  1920x1032 dało to płótno 2360 px CSS przy `main` szerokim na 2161 — płótno
//  wystawało poza własny kontener o dwieście pikseli. Powód: popup dostaje
//  CAŁY layout aplikacji, razem z bocznym paskiem nawigacji szerokim na 220 px,
//  a viewport nic o tym pasku nie wie i wiedzieć nie może.
//
//  Szerokość zostaje więc przy CSS: płótno ma `width: 100%`, obudowa wypełnia
//  `main`, a `.strona-okno` zdejmuje `max-width`. Szerokość DALEJ pochodzi
//  z rozmiaru okna — tylko liczy ją układ, który jako jedyny zna pasek boczny.
//  Pętli to nie tworzy, bo `width: 100%` z definicji nie rozpycha rodzica:
//  dziecko dopasowuje się do rodzica, nigdy odwrotnie.
//
//  Z wysokością tej drogi nie ma — `height: 100%` w pionie nie ma się do czego
//  odnieść, dopóki żaden przodek nie ma ustalonej wysokości. Stąd asymetria.
// =============================================================================

// Chrom strony w trybie okna, LICZONY W PIONIE: padding góra/dół, belka nad
// płótnem oraz to, co MapaFragmentow rysuje POD nim — sterowanie i zastrzeżenie
// o kaskadzie (to drugie jest wymogiem rundy efektów i nie wolno mu wypaść poza
// ekran). Wartość ZMIERZONA w przeglądarce przy otwartym trybie okna, nie
// oszacowana; przy zmianie układu strony trzeba ją zmierzyć na nowo.
//
// STAŁA, CHOĆ CHROM ZALEŻY OD SZEROKOŚCI: zastrzeżenie pod mapą zawija się
// w tym węższym oknie na więcej wierszy i rezerwa robi się za mała. Świadomie
// nie mierzymy go z DOM-u — pomiar musiałby trafić do stanu, czyli setState
// w efekcie, a to reguła, którą ten projekt trzyma (react-hooks/set-state-in-effect).
// Cena pomyłki jest tu mała i JEDNOSTRONNA: przy wąskim oknie strona daje się
// przewinąć o kilkadziesiąt pikseli, mapa zostaje w całości widoczna.
export const REZERWA_PIONOWA = 338;

// Poniżej tej wartości mapa przestaje cokolwiek pokazywać: punkty zlewają się
// z marginesem (MARGINES = 28 po każdej stronie), a legenda zasłania płótno.
// Klamra jest po to, żeby w bardzo małym oknie mapa była niewygodna, a nie zepsuta.
export const MIN_WYSOKOSC_PLOTNA = 280;

// Okno mniejsze od tego nie ma sensu — otwieramy je PO TO, żeby mapa była większa.
export const MIN_SZEROKOSC_OKNA = 640;
export const MIN_WYSOKOSC_OKNA = 480;

// Nazwa okna: JEDNA NA KOLEKCJĘ. Drugie kliknięcie tego samego przycisku
// podnosi okno już otwarte zamiast otwierać bliźniaka, a mapy dwóch różnych
// kolekcji nie odbierają sobie nawzajem okna.
export function nazwaOkna(idKolekcji) {
  return `mapa-fragmentow-${idKolekcji}`;
}

// Adres mapy w trybie okna. Parametr `okno=1` jest JEDYNYM przełącznikiem —
// bez niego strona mapy zachowuje się dokładnie jak dotąd, więc istniejący
// odnośnik „Pełny ekran →" nic nie traci.
export function adresOknaMapy(idKolekcji) {
  return `/kreator-rag/kolekcje/${idKolekcji}/mapa?okno=1`;
}

// -----------------------------------------------------------------------------
//  WYSOKOŚĆ PŁÓTNA W TRYBIE OKNA
// -----------------------------------------------------------------------------

// Wejście to WYŁĄCZNIE wysokość viewportu. Świadomie nie ma tu parametru
// „zmierzona wysokość kontenera" — gdyby był, gwarancja z nagłówka pliku
// padłaby przy pierwszym wywołaniu.
export function wysokoscPlotnaWOknie(wysokoscOkna, opcje = {}) {
  const rezerwa = opcje.rezerwaPionowa ?? REZERWA_PIONOWA;
  const wys = liczbaLubZero(wysokoscOkna) - rezerwa;
  return Math.round(Math.max(MIN_WYSOKOSC_PLOTNA, wys));
}

// -----------------------------------------------------------------------------
//  ROZMIAR I POŁOŻENIE NOWEGO OKNA
// -----------------------------------------------------------------------------

// „Możliwie duże, ale mieszczące się na ekranie" to dokładnie obszar dostępny:
// availWidth/availHeight to rozmiar ekranu BEZ paska zadań i innych stałych
// elementów pulpitu, czyli największy prostokąt, w którym okno mieści się całe.
//
// availLeft/availTop (nie wszędzie obecne — stąd domyślne zero) przenoszą okno
// na właściwy monitor przy zestawie wielomonitorowym; bez nich okno lądowałoby
// na ekranie głównym niezależnie od tego, gdzie stoi przeglądarka.
export function rozmiarNowegoOkna(ekran = {}) {
  const dostepnaSzer = liczbaLubZero(ekran.availWidth);
  const dostepnaWys = liczbaLubZero(ekran.availHeight);

  const szerokosc = Math.round(Math.max(MIN_SZEROKOSC_OKNA, dostepnaSzer));
  const wysokosc = Math.round(Math.max(MIN_WYSOKOSC_OKNA, dostepnaWys));

  return {
    szerokosc,
    wysokosc,
    lewo: Math.round(liczbaLubZero(ekran.availLeft)),
    gora: Math.round(liczbaLubZero(ekran.availTop)),
  };
}

// Lista cech dla window.open. `popup=yes` to jedyny sposób, żeby dostać OKNO,
// a nie kartę — bez niego przeglądarki od dawna otwierają kartę i wymiary idą
// do kosza. `noopener` NIE MOŻE tu być: z nim window.open zwraca null zawsze,
// a wtedy nie odróżnilibyśmy sukcesu od blokady. Okno jest naszego pochodzenia
// i nie ma tu żadnej treści z zewnątrz, więc nie kupujemy tym ryzyka.
export function cechyOkna(rozmiar) {
  return [
    'popup=yes',
    `width=${rozmiar.szerokosc}`,
    `height=${rozmiar.wysokosc}`,
    `left=${rozmiar.lewo}`,
    `top=${rozmiar.gora}`,
  ].join(',');
}

// -----------------------------------------------------------------------------
//  BLOKADA POPUPÓW
// -----------------------------------------------------------------------------

// Zablokowany popup to NIE jest wyjątek — window.open po prostu oddaje null
// (Chrome, Firefox) albo obiekt natychmiast zamknięty (część blokerów i
// rozszerzeń). Nierozpoznanie tego drugiego przypadku dałoby dokładnie to,
// czego być nie może: kliknięcie, po którym nic się nie dzieje i nic nie mówi.
export function czyZablokowane(okno) {
  if (!okno) return true;
  if (typeof okno.closed === 'undefined') return true;
  return okno.closed === true;
}

// Otwarcie okna wraz z rozpoznaniem blokady. `otwieracz` wstrzykiwany, żeby
// dało się to sprawdzić testem bez przeglądarki.
//
// Zwraca `{ udane, okno }`. Decyzję, CO zrobić z odmową, podejmuje komponent —
// tutaj nie ma dostępu do żadnego sposobu powiedzenia o niej użytkownikowi.
export function otworzOknoMapy(idKolekcji, ekran, otwieracz) {
  const rozmiar = rozmiarNowegoOkna(ekran);
  const adres = adresOknaMapy(idKolekcji);

  let okno = null;
  try {
    okno = otwieracz(adres, nazwaOkna(idKolekcji), cechyOkna(rozmiar));
  } catch {
    // Niektóre blokery rzucają zamiast zwrócić null. Dla nas to ta sama sytuacja.
    return { udane: false, okno: null, adres };
  }

  if (czyZablokowane(okno)) return { udane: false, okno: null, adres };

  // Okno mogło już istnieć (ta sama nazwa) i leżeć pod spodem — bez tego
  // drugie kliknięcie wyglądałoby na nieskuteczne.
  try {
    okno.focus();
  } catch {
    // Brak prawa do focus() nie unieważnia otwarcia.
  }

  return { udane: true, okno, adres };
}

function liczbaLubZero(x) {
  return Number.isFinite(x) ? x : 0;
}
