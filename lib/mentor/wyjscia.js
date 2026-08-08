// =============================================================================
//  WYJŚCIA POD WYPOWIEDZIĄ MENTORA — JEDNO MIEJSCE NA PYTANIE „CO MOGĘ TERAZ
//  ZROBIĆ".
//
//  Mentor stwierdzal cos i zostawial uzytkownika z tym. Przy zasadach pytal
//  „Akceptujesz, czy chcialbys cos zmienic?", a pod spodem stal JEDEN przycisk.
//  Przy bazie wiedzy stwierdzal — slusznie — ze zaden plik nie pasuje, i na tym
//  konczyl; uzytkownik musial sam wpasc na to, co napisac. Przy personie bylo
//  to rozwiazane trzema przyciskami, ale JAKO WYJATEK: dwa osobne mechanizmy
//  obok karty propozycji.
//
//  Ten modul zastepuje jedno i drugie. Panel pyta o sytuacje, dostaje liste
//  wyjsc i renderuje ja jednym kodem.
//
// =============================================================================
//  DLACZEGO TABELA W KODZIE, A NIE WYJSCIA GENEROWANE PRZEZ MODEL
//
//  Wyjscie wymyslone przez model to obietnica, za ktora nic nie stoi — ta sama
//  klasa usterki, ktora ta aplikacja zamykala juz trzy razy: nazwy modeli
//  w model.md, opis przyciskow w ocenie persony, „wgraj dokumenty w tej
//  karcie". Skoro mentorowi ZABRONILISMY opisywac interfejs, nie moze go tez
//  ukladac.
//
//  Tabela w kodzie daje trzy rzeczy, ktorych model nie da: wyjscia nie moga
//  zniknac, nie moga zostac wymyslone, a kazde robi dokladnie to, co obiecuje,
//  bo mapuje sie na akcje w panelu.
//
//  CENA: sztywnosc. Ta tabela jest LUSTREM GUIDED_STEPS (lib/mentor/prompt.js)
//  — dokladajac krok prowadzenia, dolóż mu wiersz tutaj. Bez wiersza krok
//  dostanie wyjscia domyslne, a nie zadne: patrz `WYJSCIA_DOMYSLNE`.
// =============================================================================

// SLOWNIK RODZAJOW — caly, jaki jest potrzebny. Trzy pozycje i ani jednej
// wiecej, bo kazda musi miec implementacje w panelu:
//
//   akceptuj — zastosuj propozycje (istniejaca sciezka acceptProposal),
//   powiedz  — wyslij za uzytkownika ukryta ture o zadanej tresci,
//   wpisz    — postaw ognisko na polu tekstowym (rozmowa albo opis persony).
//
// `powiedz` jest bezpieczne z definicji: to skrot do napisania tego samego
// recznie. Nie obiecuje niczego o interfejsie i nie moze „nie zadzialac" —
// najgorszy przypadek to zwykla odpowiedz mentora.
export const RODZAJ = {
  AKCEPTUJ: "akceptuj",
  POWIEDZ: "powiedz",
  WPISZ: "wpisz",
};

// Styl przycisku decyduje TABELA, a nie rodzaj akcji — bo ta sama akcja
// wyglada inaczej w roznych sytuacjach. „Akceptuje obecny opis" stoi w rzedzie
// rownorzednych wyborow (kafel z opisem), a „Zaakceptuj i wpisz do kreatora"
// pod karta propozycji jest oczywista droga glowna.
export const STYL = {
  KAFEL: "kafel", // tytul + zdanie opisu, wybor rownorzedny
  GLOWNY: "glowny", // wyrozniony przycisk
  POBOCZNY: "poboczny", // przycisk drugoplanowy
};

const AKCEPTUJ_PROPOZYCJE = {
  id: "akceptuj",
  rodzaj: RODZAJ.AKCEPTUJ,
  tytul: "Zaakceptuj i wpisz do kreatora",
  styl: STYL.GLOWNY,
};

// =============================================================================
//  KROK BEZ PROPOZYCJI — TU MENTOR ZOSTAWIAL UZYTKOWNIKA Z NICZYM.
//
//  Przy bazie wiedzy mentor stwierdzil — slusznie — ze zaden z wgranych plikow
//  nie pasuje do tego agenta. I na tym skonczyl. Uzytkownik musial sam wpasc
//  na to, zeby napisac „zaznacz cennik, chce zobaczyc jak to dziala".
//
//  BEZ PROPOZYCJI NA EKRANIE NIE MA CZEGO AKCEPTOWAC, wiec wszystkie wyjscia
//  sa tu wypowiedziami (POWIEDZ) — mentor musi najpierw cokolwiek zaproponowac.
//  To jest ta sama etykieta „Nie wiem — zdecyduj za mnie", ktora przy istniejacej
//  propozycji AKCEPTUJE (patrz nizej): ten sam napis, dwie rozne sytuacje,
//  dwie rozne akcje. Po to jest tabela sytuacji, a nie mapa po kroku.
// =============================================================================
//  ZASADA NAZW: WYJSCIE MOWI, CO SIE STANIE — NIE, ZE NIC SIE NIE STANIE.
//
//  „Pomijam ten krok" nie niesie zadnej informacji dla kogos, kto nie wie, co
//  pomija — a to jest dokladnie ta osoba, dla ktorej mentor istnieje. Przy
//  modelu pominiecie znaczy „zostaje domyslny, ktorego nie wybieralem"; ta
//  nazwa ma to powiedziec. Dlatego kazdy krok ma wlasny wiersz i wlasne nazwy,
//  dobrane do KONSEKWENCJI, a nie jedna wspolna formulka.
//
//  Gdzie konsekwencja jest ciezka, wyjscia „pomijam" NIE MA W OGOLE: zasady sa
//  jedyna rzecza, ktora naprawde ksztaltuje zachowanie agenta, wiec przejscie
//  dalej bez nich nie moze byc rownie latwe jak przy narzedziach.
const ZDECYDUJ_ZA_MNIE_ROZMOWA = {
  id: "zdecyduj-za-mnie",
  rodzaj: RODZAJ.POWIEDZ,
  tresc:
    "Nie wiem, co tu wybrać — zdecyduj za mnie: zaproponuj konkretną wartość i krótko wyjaśnij, dlaczego akurat taka.",
  tytul: "Nie wiem — zdecyduj za mnie",
  styl: STYL.POBOCZNY,
};

const POMIN_KROK = {
  id: "pomijam-krok",
  rodzaj: RODZAJ.POWIEDZ,
  tresc: "Pomijamy ten krok — przejdźmy dalej.",
  tytul: "Pomijam ten krok",
  styl: STYL.POBOCZNY,
};

// Wiersze dla krokow bez propozycji. Kazdy dobrany do tego, co pominiecie
// NAPRAWDE robi z agentem — patrz zasada nazw powyzej.
const BEZ_PROPOZYCJI = {
  knowledgeBase: [
    {
      id: "zaznacz-mimo-wszystko",
      rodzaj: RODZAJ.POWIEDZ,
      tresc:
        "Zaznacz mimo wszystko któryś z moich plików — chcę zobaczyć, jak to działa. Wybierz ten, który pasuje najbardziej, i powiedz, czego się po nim spodziewać.",
      tytul: "Zaznacz mimo wszystko",
      styl: STYL.POBOCZNY,
    },
    {
      id: "pomijam-pliki",
      rodzaj: RODZAJ.POWIEDZ,
      tresc:
        "Pomijamy bazę wiedzy — wgram właściwe pliki później. Przejdźmy dalej.",
      tytul: "Pomijam — wgram właściwe pliki później",
      styl: STYL.POBOCZNY,
    },
  ],
  rag: [
    ZDECYDUJ_ZA_MNIE_ROZMOWA,
    {
      id: "pomijam-rag",
      rodzaj: RODZAJ.POWIEDZ,
      tresc:
        "Pomijamy wyszukiwanie w dokumentach — ten agent go nie potrzebuje. Przejdźmy dalej.",
      tytul: "Pomijam wyszukiwanie w dokumentach",
      styl: STYL.POBOCZNY,
    },
  ],

  // Narzedzia: pominiecie jest normalne — agent bez nich dziala, tylko nie
  // policzy i nie sprawdzi daty. Nazwa mowi wiec o AGENCIE, nie o kroku.
  tools: [
    ZDECYDUJ_ZA_MNIE_ROZMOWA,
    {
      id: "bez-narzedzi",
      rodzaj: RODZAJ.POWIEDZ,
      tresc:
        "Ten agent obejdzie się bez narzędzi — nie włączamy żadnego. Przejdźmy dalej.",
      tytul: "Agent obejdzie się bez narzędzi",
      styl: STYL.POBOCZNY,
    },
  ],

  // MODEL: „pomijam" znaczylo tu „zostaje domyslny, ktorego nie wybieralem"
  // — a tego z nazwy „Pomijam ten krok" nie dalo sie odczytac.
  model: [
    ZDECYDUJ_ZA_MNIE_ROZMOWA,
    {
      id: "zostaw-domyslny-model",
      rodzaj: RODZAJ.POWIEDZ,
      tresc:
        "Zostawiamy model, który agent ma teraz ustawiony — nie zmieniamy go. Przejdźmy dalej.",
      tytul: "Zostaw domyślny model",
      styl: STYL.POBOCZNY,
    },
  ],

  // TEMPERATURA zawsze jakas jest (suwak ma wartosc), wiec „pomijam" znaczy
  // „zostaw to, co stoi". Nazwa mowi wprost, ze wartosc zostaje.
  temperature: [
    ZDECYDUJ_ZA_MNIE_ROZMOWA,
    {
      id: "zostaw-temperature",
      rodzaj: RODZAJ.POWIEDZ,
      tresc:
        "Zostawiamy temperaturę taką, jaka jest teraz ustawiona. Przejdźmy dalej.",
      tytul: "Zostaw obecne ustawienie",
      styl: STYL.POBOCZNY,
    },
  ],

  // ZASADY — JEDYNY KROK BEZ WYJSCIA „POMIJAM", i to jest swiadome.
  // Persona mowi, KIM agent jest; zasady mowia, CZEGO MU NIE WOLNO — to one
  // realnie ksztaltuja jego zachowanie w rozmowie. Przejscie dalej bez nich
  // ma kosztowac tyle samo, co przy kazdym innym kroku: jedno zdanie w polu
  // rozmowy. Nie ma powodu robic z tego jednego klikniecia.
  rules: [ZDECYDUJ_ZA_MNIE_ROZMOWA],
};

// Krok bez wlasnego wiersza: dwa uniwersalne wyjscia. „Nie wiem" jest tu
// wazniejsze — to droga dla kogos, kto nie potrafi sformulowac odpowiedzi.
const WYJSCIA_DOMYSLNE = [ZDECYDUJ_ZA_MNIE_ROZMOWA, POMIN_KROK];

// =============================================================================
//  SYTUACJA, NIE KROK. Wyjscia zaleza od PARY (krok, czy jest propozycja):
//  „baza wiedzy z propozycja" i „baza wiedzy bez propozycji" to dwie rozne
//  sytuacje i wymagaja innych wyjsc. Dlatego nie ma tu mapy po samym kroku.
//
//  `personaPath` i `edycjaOpisu` wchodza jako czesc sytuacji, bo krok persony
//  ma wlasny podprzebieg (opisz sam / popros o propozycje / popraw). Panel
//  trzyma ten stan; ta funkcja tylko o niego pyta.
// =============================================================================
export function wyjsciaDlaWiadomosci({
  krok = null,
  propozycja = null,
  zastosowana = false,
  personaPath = null,
  edycjaOpisu = false,
  // Czy wybrany model w ogole PRZYJMUJE reczna temperature. Panel liczy to
  // z modelSupportsTemperature — tutaj wchodzi gotowa odpowiedz, zeby modul
  // zostal czysty i testowalny bez katalogu modeli.
  temperaturaDostepna = true,
} = {}) {
  // Propozycja juz wpisana do kreatora — zostaje plakietka „✓ Wpisano",
  // a decyzji nie ma juz zadnej do podjecia.
  if (zastosowana) return [];

  // --- OCENA WLASNEGO OPISU PERSONY -----------------------------------------
  // `wlasny` znaczy, ze „propozycja" to tekst samego uzytkownika (trasa
  // persona-feedback). Wyjscia pokazujemy tylko wtedy, gdy user NIE jest
  // w trybie poprawiania — inaczej pole edycji i przyciski staly by naraz.
  if (propozycja?.wlasny) {
    if (personaPath !== "self" || edycjaOpisu) return [];
    return [
      {
        id: "popraw-swoj-opis",
        rodzaj: RODZAJ.WPISZ,
        pole: "opis",
        tytul: "Popraw swój opis samodzielnie",
        opis: "Wrócisz do swojego tekstu i poprosisz o kolejną ocenę.",
        styl: STYL.KAFEL,
      },
      {
        id: "mentor-z-opisu",
        rodzaj: RODZAJ.POWIEDZ,
        tresc:
          "Na podstawie mojego opisu i Twoich dotychczasowych uwag napisz gotową osobowość — nie pytaj mnie już o nic, tylko zaproponuj pełny opis.",
        przelaczNaPropozycje: true,
        tytul: "Mentor zaproponuje osobowość na podstawie mojego opisu",
        opis: "Napisze gotowy opis, korzystając z Twojego tekstu i wszystkich swoich uwag.",
        styl: STYL.KAFEL,
      },
      {
        id: "akceptuj-swoj-opis",
        rodzaj: RODZAJ.AKCEPTUJ,
        tytul: "Akceptuję obecny opis",
        opis: "Wpisze Twój tekst do kreatora i przejdzie do następnego kroku.",
        styl: STYL.KAFEL,
      },
    ];
  }

  // --- GOTOWA PERSONA OD MENTORA --------------------------------------------
  // Nie jest do wziecia albo odrzucenia w calosci: mozna ja przejac do pola
  // edycji i przerobic od razu.
  if (propozycja?.field === "persona") {
    return [
      AKCEPTUJ_PROPOZYCJE,
      {
        id: "przejmij-persone",
        rodzaj: RODZAJ.WPISZ,
        pole: "opis",
        przejmijWartosc: true,
        tytul: "Popraw ten opis samodzielnie",
        styl: STYL.POBOCZNY,
      },
      {
        id: "inna-wersja-persony",
        rodzaj: RODZAJ.POWIEDZ,
        tresc:
          "Napisz inną wersję tego opisu — ta mi nie pasuje. Nie pytaj mnie o nic, po prostu zaproponuj inaczej.",
        tytul: "Napisz inną wersję",
        styl: STYL.POBOCZNY,
      },
    ];
  }

  // --- KAZDA INNA PROPOZYCJA -------------------------------------------------
  //
  // TRZY WYJSCIA, NIE JEDNO. Mentor konczyl krok zdaniem „akceptujesz, czy
  // chcialbys cos zmienic?", a pod spodem stal SAM przycisk akceptacji — druga
  // polowa pytania nie miala odpowiedzi. Wpisanie zmiany bylo mozliwe (jest
  // pole tekstowe), ale trzeba bylo na to wpasc.
  //
  // „Nie wiem — zdecyduj za mnie" jest tu najwazniejsza pozycja i nie jest
  // wygoda: to wyjscie dla kogos, kto NIE POTRAFI sformulowac odpowiedzi, czyli
  // dla tego, po kogo mentor w ogole istnieje. Bez niego jedyna droga dalej
  // wymaga wiedzy, ktorej ta osoba nie ma — a to jest ten sam slepy zaulek,
  // ktory zamknelismy przy personie.
  if (propozycja) {
    return [
      AKCEPTUJ_PROPOZYCJE,
      {
        id: "chce-zmienic",
        rodzaj: RODZAJ.WPISZ,
        pole: "rozmowa",
        tytul: "Chcę to zmienić",
        styl: STYL.POBOCZNY,
      },
      {
        // „ZDECYDUJ ZA MNIE" TO AKCJA, NIE WYPOWIEDZ — i to jest cala roznica
        // miedzy dzialajacym przyciskiem a takim, ktory tylko brzmi.
        //
        // Wczesniej wysylal zdanie i liczyl, ze mentor zrobi reszte. Mentor nie
        // moze: wartosc wpisuje wylacznie acceptProposal. Skutek byl taki, ze
        // mentor odpowiadal „juz zrobione", uzasadnial — i wystawial DRUGA,
        // identyczna karte tego samego pola, bo nic nie zostalo zapisane.
        // Trzeba bylo kliknac drugi raz, zeby ruszyc dalej.
        //
        // Decyzja w tej aplikacji ZNACZY „wartosc w kreatorze". Skoro propozycja
        // stoi juz na ekranie, „zdecyduj za mnie" znaczy „przyjmij swoj wybor"
        // — wiec akceptujemy, a osobna tresc tury prosi tylko o uzasadnienie
        // i przejscie dalej. Po tej zmianie zdanie „juz zrobione" staje sie
        // PRAWDA, bo tura leci z agentem, ktory ma juz te wartosc.
        //
        // UWAGA NA ETAP 3: bez propozycji na ekranie nie ma czego akceptowac
        // — tam ten sam napis musi zostac wypowiedzia (RODZAJ.POWIEDZ), bo
        // mentor musi najpierw cokolwiek zaproponowac.
        id: "zdecyduj-za-mnie",
        rodzaj: RODZAJ.AKCEPTUJ,
        tresc:
          "Nie wiem, co tu wybrać — przyjmuję Twój wybór. Wyjaśnij krótko, dlaczego akurat tak, i przejdźmy dalej.",
        tytul: "Nie wiem — zdecyduj za mnie",
        styl: STYL.POBOCZNY,
      },
    ];
  }

  // --- START KROKU PERSONY (nie ma jeszcze czego oceniac ani akceptowac) -----
  if (krok === "persona" && personaPath === null) {
    return [
      {
        id: "opisz-sam",
        rodzaj: RODZAJ.WPISZ,
        pole: "opis",
        tytul: "Opisz sam",
        opis: "Napisz własny opis — mentor da Ci feedback.",
        styl: STYL.KAFEL,
      },
      {
        id: "popros-o-persone",
        rodzaj: RODZAJ.POWIEDZ,
        tresc: "Poproszę o propozycję osobowości — zaproponuj mi ją.",
        przelaczNaPropozycje: true,
        tytul: "Poproś mentora o propozycję",
        opis: "Mentor dopyta o kontekst i napisze personę za Ciebie.",
        styl: STYL.KAFEL,
      },
    ];
  }

  // --- KROK PERSONY PO WYBORZE SCIEZKI, ale bez propozycji na ekranie -------
  // Uzytkownik jest w trakcie pisania opisu albo czeka na propozycje mentora.
  // Wyjscia by tu przeszkadzaly: pole edycji i przyciski wyboru staly by naraz.
  if (krok === "persona") return [];

  // BRAK KROKU I KONIEC PROWADZENIA — dwa przypadki, w ktorych uniwersalne
  // wyjscia byly by falszem:
  //  • `null` znaczy „ekstraktor nie podal kroku" (np. zwrocil zly JSON).
  //    Nie wiemy wtedy, co uzytkownik mialby pominac — a „Pomijam ten krok"
  //    obiecywaloby wiedze, ktorej nie mamy.
  //  • "done" to koniec: pod ostatnia wypowiedzia stoi juz blok „Agent gotowy",
  //    a „Nie wiem, zdecyduj za mnie" nie ma o czym decydowac.
  if (!krok || krok === "done") return [];

  // TEMPERATURA, KTOREJ MODEL NIE PRZYJMUJE — NIE MA TU ZADNEJ DECYZJI.
  // Prompt kaze mentorowi pominac ten krok w jednej wypowiedzi („model sam
  // dobiera losowosc") i od razu przejsc dalej. Gdyby ekstraktor oznaczyl te
  // wypowiedz jako krok „temperature", pod wyjasnieniem „tu nie ma czego
  // ustawiac" stanelyby przyciski „Nie wiem — zdecyduj za mnie" i „Zostaw
  // obecne ustawienie". Oba dotyczylyby suwaka, ktory dla tego modelu nic
  // nie robi — czyli obiecywalyby decyzje tam, gdzie zadnej nie ma.
  if (krok === "temperature" && !temperaturaDostepna) return [];

  // --- KROK BEZ PROPOZYCJI ---------------------------------------------------
  // Wiersz wlasny albo dwa uniwersalne wyjscia. Zaden krok nie konczy sie juz
  // sama wypowiedzia mentora bez mozliwosci odpowiedzi.
  return BEZ_PROPOZYCJI[krok] || WYJSCIA_DOMYSLNE;
}
