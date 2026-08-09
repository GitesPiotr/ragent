// PIĘĆ ZASAD PRZYGOTOWANIA DOKUMENTU + LISTA KONTROLNA.
//
// Treść merytoryczna samouczka, wyjęta z komponentu, żeby dała się przetestować
// i żeby zmiana słowa nie wymagała dotykania warstwy widoku.
//
// Każda zasada ma parę próbek `zle` / `dobrze` — to one niosą naukę, opis tylko
// je tłumaczy. Próbki są WYMYŚLONE, tak jak dane demo.
//
// Kolejność JEST znacząca: pierwsza zasada jest domyślnie rozwinięta i to ona
// dostaje etykietę „najważniejsze". Nagłówki są najważniejsze, bo to jedyna
// rzecz, którą aplikacja dokleja do fragmentu przy indeksowaniu
// (lib/rag/documents.js:590-592).

export const ZASADY = [
  {
    id: "naglowki",
    nazwa: "Dodaj nagłówki sekcji",
    skrot: "najważniejsze",
    opis:
      "Przy wyszukiwaniu do każdego fragmentu doklejana jest ścieżka nagłówków, z których " +
      "pochodzi — na przykład „Regulamin pracy › Rozdział 3 › Urlopy”. Dzięki temu fragment " +
      "niesie kontekst, nawet gdy sam w sobie jest krótki, a pytanie o numer paragrafu ma się " +
      "o co zaczepić. W samej odpowiedzi treść zostaje czysta, bez doklejonego nagłówka.",
    zle: "Dodatek za sobotę wynosi 87 zł.\nW niedzielę nie przysługuje.\nWniosek składa się na KW-3.",
    dobrze:
      "## § 18. Dodatki za dni wolne\nDodatek za sobotę wynosi 87 zł.\nW niedzielę nie przysługuje.\n\n" +
      "## § 19. Tryb składania wniosku\nWniosek składa się na KW-3.",
  },
  {
    id: "style",
    nazwa: "W Wordzie używaj stylów, nie pogrubienia",
    skrot: "",
    opis:
      "To najczęstszy błąd w plikach .docx. Aplikacja rozpozna nagłówek tylko wtedy, gdy " +
      "w Wordzie jest oznaczony stylem „Nagłówek 1”, „Nagłówek 2” i tak dalej. Tekst ręcznie " +
      "pogrubiony i powiększony wygląda dla człowieka identycznie, ale dla aplikacji jest zwykłym " +
      "akapitem — i cała korzyść z poprzedniej zasady przepada. Styl ustawia się na wstążce " +
      "Narzędzia główne, w galerii stylów.",
    zle: "W Wordzie:\n\n§ 18. Dodatki   ← pogrubione, 16 pt\n                  styl: Normalny\n\nAplikacja widzi zwykły akapit.",
    dobrze:
      "W Wordzie:\n\n§ 18. Dodatki   ← styl: Nagłówek 2\n\nAplikacja widzi nagłówek\ni dokleja go do fragmentów.",
  },
  {
    id: "jeden-temat",
    nazwa: "Jedna sekcja, jeden temat",
    skrot: "",
    opis:
      "Fragment powstaje z ciągłego kawałka tekstu, mniej więcej 900 znaków. Jeśli w jednym " +
      "akapicie mieszasz urlopy, dodatki i procedurę odwołania, każde wyszukiwanie będzie zwracać " +
      "ten sam przeładowany kawałek — pasujący do wszystkiego i pomocny w niczym.",
    zle:
      "Pracownik ma 26 dni urlopu, a za sobotę\ndostaje 87 zł, natomiast odwołanie składa\n" +
      "się w ciągu 14 dni na formularzu KW-3,\nchyba że przełożony postanowi inaczej.",
    dobrze:
      "## Urlop\nPracownikowi przysługuje 26 dni urlopu.\n\n## Dodatek za soboty\n" +
      "Za pracę w sobotę: 87 zł za dzień.\n\n## Odwołanie\nTermin: 14 dni. Formularz: KW-3.",
  },
  {
    id: "skroty",
    nazwa: "Rozwiń zaimki i odwołania",
    skrot: "",
    opis:
      "Fragment jest czytany bez sąsiadów. „Wynosi ona 41 zł” nie znaczy nic, jeśli słowo, " +
      "do którego odnosi się „ona”, zostało w poprzednim fragmencie. Powtórzenie rzeczownika " +
      "wygląda niezgrabnie w tekście dla człowieka i ratuje odpowiedź dla agenta. To samo dotyczy " +
      "odwołań w rodzaju „jak wyżej” albo „zgodnie z poprzednim punktem”.",
    zle: "Stawka bazowa to 87 zł.\nW przypadku pracy nocnej wynosi ona 41 zł\ni jest naliczana jak wyżej.",
    dobrze:
      "Stawka bazowa za sobotę to 87 zł.\nStawka za pracę nocną to 41 zł\n" +
      "i jest naliczana według tych samych zasad\nco stawka bazowa.",
  },
  {
    id: "nazwy",
    nazwa: "Nazwij plik tym, co w nim jest",
    skrot: "",
    opis:
      "Nazwa pliku trafia wprost do odpowiedzi agenta jako źródło — obok nazwy sekcji i numeru " +
      "strony. Użytkownik zobaczy dokładnie to, co wpisałeś. Możliwość sprawdzenia źródła jest " +
      "połową wartości RAG-u, a „dokument (3) kopia final” nie mówi nikomu nic.",
    zle: "skan_2024 (3) — kopia FINAL v2.pdf\n\nCytat u agenta:\n„skan_2024 (3) — kopia FINAL v2.pdf, s. 4”",
    dobrze:
      "regulamin-pracy-zdalnej-2026.pdf\n\nCytat u agenta:\n„regulamin-pracy-zdalnej-2026.pdf ›\n § 18. Dodatki, s. 4”",
  },
];

// Lista kontrolna. Każda pozycja odpowiada jednej zasadzie albo jednemu
// ograniczeniu opisanemu wyżej — nie ma tu nic, czego samouczek nie tłumaczy.
export const KONTROLNA = [
  "Tekst w pliku da się zaznaczyć myszą i skopiować — to nie skan",
  "Plik ma jedno z rozszerzeń: .md, .docx, .pdf, .txt, .csv",
  "Dokument ma nagłówki sekcji, a w Wordzie są to prawdziwe style",
  "Każda sekcja dotyczy jednego tematu",
  "Nazwa pliku mówi, co jest w środku — zobaczysz ją w cytacie",
];

// Formaty w tabeli. `pewnosc` steruje kolorem znacznika i jest ODDZIELONA od
// jego napisu, bo .csv ma nagłówki „inaczej", nie „pewnie" — kolor ten sam,
// słowo inne.
//
// `naglowki` TO LISTA CZĘŚCI, nie zwykły napis. Zwykły ciąg znaków (tekst) albo
// { kod: "…" } dla fragmentu składanego krojem maszynowym. Powód jest
// merytoryczny, nie estetyczny: ta kolumna mówi, PO CZYM aplikacja rozpoznaje
// nagłówek, więc dosłowność zapisu jest treścią. „po znakach # i ##" złożone
// tym samym krojem co zdanie obok gubi informację, że chodzi o dokładnie te
// znaki na początku linii.
export const FORMATY_OPIS = [
  {
    ext: ".md",
    czytanie: "Najlepszy wybór. Struktura zapisana wprost w tekście.",
    pewnosc: "pewne",
    etykieta: "Pewne",
    naglowki: ["po znakach ", { kod: "#" }, " i ", { kod: "##" }],
  },
  {
    ext: ".docx",
    czytanie: "Bardzo dobry, jeśli dokument korzysta ze stylów Worda.",
    pewnosc: "pewne",
    etykieta: "Pewne",
    naglowki: ["ale tylko style „Nagłówek 1/2/3”, nie pogrubiony tekst"],
  },
  {
    ext: ".pdf",
    czytanie: "Dobry, o ile plik ma warstwę tekstową. Skan nie zadziała.",
    pewnosc: "zgadywane",
    etykieta: "Zgadywane",
    naglowki: ["z wyglądu linii; § i „Rozdział” pomagają"],
  },
  {
    ext: ".txt",
    czytanie: "Czytany bez problemu, dzielony po pustych liniach.",
    pewnosc: "brak",
    etykieta: "Brak",
    naglowki: ["format nie ma jak ich zapisać"],
  },
  {
    ext: ".csv",
    czytanie: "Czytany wiersz po wierszu, jako tabela.",
    pewnosc: "pewne",
    etykieta: "Inaczej",
    naglowki: ["pierwszy wiersz to nazwy kolumn, powtarzane przy każdym fragmencie"],
  },
];

// Rozszerzenia, których aplikacja NIE przyjmie. Lista jest przykładowa, nie
// wyczerpująca — dyspozytor odrzuca wszystko spoza FORMATY z lib/rag/extract.js.
export const NIEOBSLUGIWANE = [".xlsx", ".pptx", ".doc", ".odt", ".rtf", ".jpg", ".png", ".zip"];
