import { krokZegara, stanKoncowy, stanPoczatkowy } from "./zegar.js";

// =============================================================================
//  SILNIK ZEGARA SCENY — cykl zycia petli klatek, bez ani jednego odwolania
//  do przegladarki.
//
//  Prototyp ma jedna petle rAF (linie 406-412) i trzy moduly rozmawiajace przez
//  window: frame() siega po window.RAGentMark, RAGentMark czyta window.HEAD_TIMING
//  przy wejsciu do modulu. Decyduje o tym kolejnosc znacznikow <script>,
//  a w bundlerze kolejnosc importow — czyli przypadek. Tutaj jest jeden silnik
//  i subskrypcja.
//
//  PLANISTA KLATEK WCHODZI PARAMETREM, tak samo jak rand w harmonogram.js
//  i z tego samego powodu. To NIE jest zamiana wlasciwosci na wygode testu —
//  nic sie nie zmienia w tym, co robi produkcja. To wyjecie zaleznosci od
//  przegladarki z ciala funkcji do jej sygnatury: produkcja podaje
//  requestAnimationFrame, cancelAnimationFrame i performance.now, test podaje
//  atrape z recznym zegarem i kolejka. Bez tego cykl zycia petli — czyli
//  jedyne miejsce, w ktorym mieszkaja bledy podwojnego montowania — nie dalby
//  sie sprawdzic inaczej niz okiem w przegladarce.
//
//  zaplanujKlatke MA ZWRACAC WARTOSC PRAWDZIWA. Silnik trzyma 0 jako "brak
//  zaplanowanej klatki", wiec planista zwracajacy 0 jako poprawny identyfikator
//  wywrocilby warunek. requestAnimationFrame zaczyna numerowac od 1, wiec
//  w produkcji to nie moze wystapic — zalozenie dotyczy wylacznie wlasnych
//  planistow podstawianych w testach. Nie sprawdzamy tego jawnie, bo byloby
//  to sprawdzanie w goracej sciezce dla przypadku, ktory nie istnieje poza
//  naszym wlasnym kodem testowym.
//
//  ruchOgraniczony jest FUNKCJA, nie wartoscia: matchMedia wolno wolac dopiero
//  w efekcie (trasa jest prerenderowana jako STATIC), a silnik powstaje przy
//  renderze. Predykat pozwala odlozyc to pytanie do start().
//
//  czasTrwania jest odczytywane RAZ, przy tworzeniu silnika. Dlugosc sceny jest
//  stala; gdyby kiedys przestala byc, trzeba bedzie tworzyc silnik na nowo,
//  a nie podmieniac mu liczbe pod reka w trakcie przebiegu.
// =============================================================================
export function utworzSilnik({
  czasTrwania,
  zaplanujKlatke,
  anulujKlatke,
  teraz,
  ruchOgraniczony = () => false,
}) {
  const subskrybenci = new Set();
  let stan = null;
  let idKlatki = 0;

  // BLAD W JEDNYM SUBSKRYBENCIE NIE MOZE ZATRZYMAC PETLI ANI POZOSTALYCH.
  // W prototypie apply() i RAGentMark.at() sa opakowane w try/catch (409-410),
  // ale btn z linii 413 juz nie — i to on zatrzymalby rAF na amen.
  const wolaj = (naKlatke, t, now) => {
    try {
      naKlatke(t, now);
    } catch (e) {
      console.error("[zegar sceny]", e);
    }
  };

  const rozglos = (t, now) => {
    for (const naKlatke of subskrybenci) wolaj(naKlatke, t, now);
  };

  // Petla ma chodzic tylko wtedy, gdy jest komu i po co liczyc. Prototyp
  // planuje kolejna klatke bezwarunkowo (linia 411, komentarz "wznowienie
  // zawsze, choćby wyżej coś padło"), co w Reakcie znaczy: kazde montowanie
  // zostawia petle na zawsze.
  const petlaMaChodzic = () =>
    stan !== null && stan.gra && subskrybenci.size > 0;

  const klatka = (now) => {
    idKlatki = 0;
    stan = krokZegara(stan, now, { czasTrwania });
    rozglos(stan.t, now);
    zaplanuj();
  };

  const zaplanuj = () => {
    if (idKlatki) return; // klatka juz czeka
    if (!petlaMaChodzic()) return;
    idKlatki = zaplanujKlatke(klatka);
  };

  const anuluj = () => {
    if (idKlatki) {
      anulujKlatke(idKlatki);
      idKlatki = 0;
    }
  };

  return {
    // Wolane z efektu providera. IDEMPOTENTNE WOBEC STRICT MODE: React 19
    // montuje, odmontowuje i montuje ponownie, wiec start() najpierw anuluje
    // ewentualna wczesniejsza klatke. Dwa starty daja JEDNA petle, nie dwie
    // mutujace ten sam czas.
    start() {
      anuluj();
      stan = ruchOgraniczony() ? stanKoncowy(czasTrwania) : stanPoczatkowy();

      if (petlaMaChodzic()) {
        zaplanuj();
      } else if (subskrybenci.size > 0) {
        // Petla nie ruszy (ruch ograniczony), a subskrybenci juz czekaja —
        // patrz regula przy subskrybuj().
        rozglos(stan.t, teraz());
      }
    },

    // Wolane z funkcji czyszczacej efektu. Odmontowanie w polowie animacji ma
    // zostawic zero chodzacych petli.
    stop() {
      anuluj();
    },

    subskrybuj(naKlatke) {
      subskrybenci.add(naKlatke);

      // KIEDY PETLA NIE MA RUSZYC, NOWY SUBSKRYBENT DOSTAJE JEDNA KLATKE
      // NATYCHMIAST. Podpadaja pod to trzy przypadki: ruch ograniczony, scena
      // juz zakonczona (gra === false przy t === czasTrwania) i kazdy inny
      // stan, w ktorym zaplanuj() i tak nic by nie zaplanowal.
      //
      // POWOD: bez tego komponent montujacy sie warunkowo — a taki bedzie
      // pierscien w B5 — zostaje na stanie sprzed animacji i NIE ZGLASZA tego
      // niczym. Scena stoi, konsola czysta, testy zielone. To ten sam rodzaj
      // cichego bledu co nieznany kierunek w harmonogramie.
      //
      // Wyjatkiem jest stan === null, czyli subskrypcja przed start(): nie ma
      // jeszcze czego rysowac, a klatke poda start(). Tak wlasnie dzieje sie
      // przy normalnym montowaniu, bo efekty dzieci biegna przed efektem
      // rodzica.
      if (petlaMaChodzic()) {
        zaplanuj();
      } else if (stan !== null) {
        wolaj(naKlatke, stan.t, teraz());
      }

      return () => {
        subskrybenci.delete(naKlatke);
        // Bez tego zaplanowana juz klatka wypadlaby jeszcze raz, w pustke.
        // Nikt by tego nie zobaczyl, ale petla ma stawac wtedy, kiedy sie ja
        // wylacza, a nie klatke pozniej.
        if (subskrybenci.size === 0) anuluj();
      };
    },
  };
}
