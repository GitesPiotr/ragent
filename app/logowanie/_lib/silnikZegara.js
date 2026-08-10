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
//  pominPrzebieg jest FUNKCJA, nie wartoscia: pyta sie o to dopiero w start(),
//  bo matchMedia wolno wolac w efekcie, a silnik powstaje przy renderze.
//  Predykat NIE ROZSTRZYGA, DLACZEGO przebieg jest pomijany — powody sa
//  rozne i nie wolno ich zlewac. Sklada je provider, patrz ZegarSceny.jsx.
//
//  poZakonczeniu wola sie DOKLADNIE RAZ NA PRZEBIEG, w chwili gdy t dojdzie
//  do czasTrwania, PO nadaniu ostatniej klatki. Nie wola sie przy klatkach
//  podtrzymania, przy przebiegu pominietym (pominiety to nie zakonczony) ani
//  po zatrzymaniu w polowie. Konsument stawia tam znacznik sesji, wiec kazde
//  dodatkowe wywolanie bylo by falszywym „animacja juz byla".
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
  pominPrzebieg = () => false,
  poZakonczeniu = () => {},
}) {
  const subskrybenci = new Set();
  let stan = null;
  let idKlatki = 0;
  let podtrzymania = 0;
  let zglaszoneZakonczenie = false;

  // BLAD W JEDNYM SUBSKRYBENCIE NIE MOZE ZATRZYMAC PETLI ANI POZOSTALYCH.
  // W prototypie apply() i RAGentMark.at() sa opakowane w try/catch (409-410),
  // ale btn z linii 413 juz nie — i to on zatrzymalby rAF na amen.
  // Trzeci argument, czasTrwania, idzie do subskrybenta razem z czasem sceny.
  // Silnik i tak go zna, wiec podanie go nic nie kosztuje — a subskrybent,
  // ktory wzialby dlugosc sceny z importu, rozjechalby sie po cichu w chwili,
  // gdy provider dostanie inna. Patrz komentarz przy useKlatka.
  const wolaj = (naKlatke, t, now) => {
    try {
      naKlatke(t, now, czasTrwania);
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
    stan !== null && subskrybenci.size > 0 && (stan.gra || podtrzymania > 0);

  const klatka = (now) => {
    idKlatki = 0;
    const graloPrzed = stan.gra;
    stan = krokZegara(stan, now, { czasTrwania });

    rozglos(stan.t, now);

    // DOKLADNIE RAZ NA PRZEBIEG. `gra` idzie z prawdy w falsz tylko w tej
    // jednej klatce, w ktorej t dobija do czasTrwania — nigdy z powrotem.
    // Zgloszenie idzie PO ostatniej klatce, zeby scena byla juz narysowana
    // do konca, kiedy konsument postawi swoj znacznik.
    if (graloPrzed && !stan.gra && !zglaszoneZakonczenie) {
      zglaszoneZakonczenie = true;
      try {
        poZakonczeniu();
      } catch (e) {
        console.error("[zegar sceny]", e);
      }
    }

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
      zglaszoneZakonczenie = false;
      // PRZEBIEG POMINIETY TO NIE JEST PRZEBIEG ZAKONCZONY: startujemy od razu
      // od stanu koncowego, `gra` jest od poczatku falszywe, wiec przejscia
      // nie ma i poZakonczeniu sie nie odezwie. Inaczej znacznik sesji
      // stawialby sie w kolko przy kazdym wejsciu, ktore i tak nic nie gralo.
      stan = pominPrzebieg() ? stanKoncowy(czasTrwania) : stanPoczatkowy();

      if (petlaMaChodzic()) {
        zaplanuj();
      } else if (subskrybenci.size > 0) {
        // Petla nie ruszy (przebieg pominiety), a subskrybenci juz czekaja —
        // patrz regula przy subskrybuj().
        rozglos(stan.t, teraz());
      }
    },

    // Wolane z funkcji czyszczacej efektu. Odmontowanie w polowie animacji ma
    // zostawic zero chodzacych petli.
    stop() {
      anuluj();
    },

    // =========================================================================
    //  podtrzymaj() — trzyma petle przy zyciu, gdy scena juz sie skonczyla.
    //
    //  PO CO, skoro B2 caly byl o tym, zeby petla staje: bo nie kazdy ruch na
    //  ekranie jest czescia przebiegu sceny. Oko agenta zapala sie w chwili
    //  klikniecia „Zaloguj", czyli zwykle DLUGO po zakonczeniu animacji, a jego
    //  puls i wygaszanie wizjera licza sie z `now`, klatka po klatce. Bez
    //  podtrzymania nie mialyby z czego sie policzyc.
    //
    //  Klatki podtrzymania sa bezpieczne, bo krokZegara przy `gra === false`
    //  ZAMRAZA t i tylko przesuwa znacznik: subskrybenci dostaja caly czas czas
    //  konca sceny i swiezy `now`. Scena nie rusza sie o milisekunde.
    //
    //  Zwraca funkcje zwalniajaca. Uchwyty sie licza, wiec dwa niezalezne
    //  powody podtrzymania nie gasza sie nawzajem, a zwolnienie tego samego
    //  uchwytu dwa razy nic nie psuje.
    //
    //  DLACZEGO LICZONE UCHWYTY, A NIE DRUGA PETLA rAF — zeby nikt tego za pol
    //  roku nie „uproscil". Naturalne pierwsze rozwiazanie brzmi: pierscien
    //  logowania dostaje wlasny requestAnimationFrame, bo ma wlasny czas
    //  i wlasny koniec. Prototyp tak wlasnie robi (linie 687-696) i to jest
    //  Problem 3 z dokumentu przekazania: dwa niezalezne zadania klatek
    //  chodzace rownolegle. To, ze obie petle bylyby NASZE i przetestowane,
    //  nic tu nie zmienia — przegladarka dostaje dwa zadania zamiast jednego,
    //  a scena i pierscien moga rozjechac sie w czasie.
    //
    //  Drugi powod jest mocniejszy: silnik obcina dt do MAKS_DT_MS, co jest
    //  sluszne dla plynnosci sceny i BLEDNE dla progu logowania. Prog jest
    //  obietnica o czasie zegarowym. Gdyby pierscien jechal na wlasnym
    //  silniku, przelaczenie karty w trakcie logowania zatrzymaloby jego czas,
    //  a Promise.all czekaloby na niego mimo gotowej odpowiedzi z serwera.
    //  Dlatego pierscien liczy postep z `now`, ktory kazdy subskrybent i tak
    //  dostaje, a podtrzymanie tylko pilnuje, zeby te klatki w ogole byly.
    // =========================================================================
    podtrzymaj() {
      podtrzymania += 1;
      zaplanuj();

      let zwolnione = false;
      return () => {
        if (zwolnione) return;
        zwolnione = true;
        podtrzymania -= 1;
        // Zaplanowana juz klatka wypadnie jeszcze raz i dopiero ona zobaczy,
        // ze nie ma po co planowac nastepnej. Jedna klatka nadmiarowa jest
        // tu wskazana: to na niej rysuje sie stan po wygaszeniu.
      };
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
