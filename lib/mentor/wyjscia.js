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

// Wyjscia dla kroku, ktory nie ma wlasnego wiersza. Pusto — etap 1 oddaje
// dzisiejsze zachowanie 1:1, a kolejne etapy wypelniaja te miejsca.
const WYJSCIA_DOMYSLNE = [];

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

  return WYJSCIA_DOMYSLNE;
}
