import { getCollection } from "@/lib/rag/collections.js";
import { searchCollection } from "@/lib/rag/search.js";

// Narzedzie: przeszukiwanie dokumentow agenta (RAG).
//
// =============================================================================
//  KTOREGO KLIENTA BAZY UZYWA TO NARZEDZIE — NAJWAZNIEJSZA DECYZJA TEGO PLIKU
//
//  Rdzen w lib/rag/ bierze klienta przez deps.client, a gdy go nie dostanie,
//  siega po getSupabaseClient() — czyli po klucz service_role. To by DZIALALO
//  i wlasnie dlatego jest grozne: service_role ma BYPASSRLS, wiec narzedzie
//  przeszukiwaloby kolekcje WSZYSTKICH kont, a jedynym zabezpieczeniem byloby
//  to, ze sami podajemy wlasciwe collectionId. Pomylka w jednej linii
//  zamienialaby sie w wyciek cudzych dokumentow, ktorego nic by nie zglosilo.
//
//  UZYWAMY WIEC KLIENTA Z SESJI, przekazanego przez ctx.db. Wtedy RLS dokleja
//  owner_id = auth.uid() do kazdego zapytania i nawet blad w wyliczeniu
//  collectionId konczy sie pustym wynikiem, a nie cudzymi danymi. Izolacja
//  stoi na bazie, nie na poprawnosci tego pliku.
//
//  DLACZEGO PRZEZ ctx, A NIE createClient() TUTAJ:
//  createClient() czyta ciasteczka przez cookies() z next/headers, a to dziala
//  wylacznie w kontekscie zadania. Narzedzie wykonuje sie w srodku petli
//  tool-use, juz po tym, jak trasa zwrocila strumien odpowiedzi — czyli poza
//  tym kontekstem albo na jego granicy. Klient tworzony JEDEN RAZ w trasie,
//  zanim strumien ruszy, i podany w ctx nie ma tego problemu.
//
//  Gdy ctx.db nie ma (wolania spoza trasy czatu), narzedzie ODMAWIA z czytelnym
//  tekstem. Swiadomie NIE robi cichego zjazdu na service_role — to byloby
//  dokladnie to obejscie RLS, ktoremu ten komentarz ma zapobiec.
// =============================================================================

const LIMIT_TRAFIEN = 5;
const MAKS_ZNAKOW_FRAGMENTU = 1200;

// Odpowiedzi narzedzia to TEKST DLA MODELU, nie dla czlowieka. Model ma z niego
// wywnioskowac, co powiedziec uzytkownikowi — dlatego kazdy komunikat mowi
// wprost, co sie stalo I co model ma z tym zrobic. "Brak wynikow" bez takiej
// wskazowki konczy sie tym, ze model zgaduje z wlasnej wiedzy i podaje to
// jako tresc dokumentu.
function powiedz(tekst) {
  return tekst;
}

export const ragSearch = {
  id: "rag_search",
  name: "rag_search",
  // =========================================================================
  //  OPIS JEST TU MECHANIZMEM, NIE DOKUMENTACJA — dwa zmierzone problemy
  //  rozwiazuje MODEL, na podstawie tego tekstu, a nie kod.
  //
  //  PROBLEM 1 — DRUGA WIADOMOSC TRAFIA W PROZNIE.
  //  Historia rozmowy idzie do modelu surowo (app/api/chat/route.js), bez
  //  kondensacji. Wyszukiwanie NIE WIDZI wczesniejszych wiadomosci, wiec
  //  "a ile wczesniej?" jako zapytanie do RAG nie znaczy nic. Przepisanie
  //  robi model, bo tylko on ma kontekst rozmowy — kod musialby ten kontekst
  //  odtworzyc, czyli zbudowac drugi model.
  //
  //  PROBLEM 2 — NIEDETERMINIZM WYWOLANIA (zmierzony w rundzie 8).
  //  "gdzie jest apteczka?" w jednym z trzech przebiegow NIE wywolalo
  //  narzedzia: model uznal z gory, ze to pytanie "poza zakresem dokumentow
  //  HR", i odpowiedzial bez szukania. Dla uzytkownika objaw jest identyczny
  //  jak "RAG nie dziala". Stad jawny zakaz oceniania z gory: model nie wie,
  //  co jest w dokumentach, dopoki nie sprawdzi.
  //
  //  RAMKA: opis jest wzmocniony CELOWO, ale nie bezgranicznie — ostatnie
  //  zdanie odcina rachunki i pogawedki, zeby narzedzie nie zaczelo byc
  //  wolane do wszystkiego. Przy zmianach tego tekstu sprawdz OBIE strony:
  //  czy krotkie pytanie o dokument nadal wola narzedzie I czy "ile to jest
  //  3847 razy 291" nadal go NIE wola.
  // =========================================================================
  description:
    "Przeszukuje dokumenty przypisane do tego agenta i zwraca dosłowne fragmenty " +
    "wraz z nazwą pliku, stroną i ścieżką nagłówków.\n" +
    "\n" +
    "KIEDY UŻYWAĆ: przy KAŻDYM pytaniu, na które odpowiedź MOŻE znajdować się " +
    "w dokumentach — o procedury, regulaminy, umowy, instrukcje, zasady, terminy, " +
    "wymiary, kwoty, miejsca, obowiązki i uprawnienia. Także wtedy, gdy pytanie jest " +
    "krótkie i potoczne („gdzie jest apteczka?”, „ile mam urlopu?”, „od której pracujemy?”).\n" +
    "\n" +
    "NIE OCENIAJ Z GÓRY, czy dokumenty zawierają odpowiedź — tego nie możesz wiedzieć " +
    "przed sprawdzeniem. Od stwierdzenia „nie ma tego w dokumentach” jest WYNIK " +
    "wyszukiwania, nie Twoje przypuszczenie. Odpowiedź „to wykracza poza zakres " +
    "dokumentów” bez wcześniejszego użycia tego narzędzia jest BŁĘDEM.\n" +
    "\n" +
    "PYTANIE MUSI BYĆ SAMODZIELNE — zrozumiałe bez historii rozmowy. Wyszukiwanie " +
    "nie widzi poprzednich wiadomości ani swoich wcześniejszych wyników. " +
    "Gdy użytkownik pyta skrótem albo nawiązuje do tego, co już padło, ODTWÓRZ pełne " +
    "pytanie z kontekstu rozmowy przed wysłaniem:\n" +
    "  • „a ile wcześniej?” po pytaniu o urlop po 10 latach\n" +
    "      → „wymiar urlopu wypoczynkowego przy stażu pracy krótszym niż 10 lat”\n" +
    "  • „a dla niepełnoetatowca?” po pytaniu o okres wypowiedzenia\n" +
    "      → „okres wypowiedzenia przy zatrudnieniu w niepełnym wymiarze czasu pracy”\n" +
    "  • „a gdzie druga?” po pytaniu o apteczkę\n" +
    "      → „gdzie znajduje się apteczka pierwszej pomocy w budynku”\n" +
    "Nigdy nie wysyłaj samego „a ile?”, „a co z tym?”, „i dalej?”.\n" +
    "\n" +
    "WYJĄTEK — SAMO ODWOŁANIE DO JEDNOSTKI REDAKCYJNEJ JEST PYTANIEM KOMPLETNYM. " +
    "„§ 45”, „art. 12”, „pkt 3”, „rozdział V”, „ust. 2” to PEŁNE pytania znaczące " +
    "„pokaż mi treść tej jednostki”. Przekaż je do narzędzia BEZ ZMIAN i BEZ pytania " +
    "użytkownika o doprecyzowanie — wyszukiwanie ma osobną ścieżkę pełnotekstową " +
    "zbudowaną właśnie pod takie zapytania i odnajdzie je po samym numerze. " +
    "Odpowiedź „nie wiem, o co pytasz” na „§ 45” jest BŁĘDEM.\n" +
    "\n" +
    "Różnica wobec reguły wyżej jest prosta: IDENTYFIKATOR wskazuje konkretne miejsce " +
    "w dokumencie i jest samowystarczalny, a ZAIMEK („a ile wcześniej?”, „a co z tym?”) " +
    "nie wskazuje niczego bez poprzedniej wiadomości. Numer przekaż dosłownie, " +
    "zaimek rozwiń.\n" +
    "\n" +
    "NIE UŻYWAJ do obliczeń matematycznych (od tego jest kalkulator), do pytań " +
    "o bieżące wydarzenia i dane z internetu, ani do zwykłej rozmowy nie dotyczącej " +
    "treści dokumentów.",
  input_schema: {
    type: "object",
    properties: {
      pytanie: {
        type: "string",
        description:
          "SAMODZIELNE pytanie w języku naturalnym — pełne zdanie, zrozumiałe bez " +
          "kontekstu rozmowy, z nazwanym wprost podmiotem, którego dotyczy. " +
          "Np. „ile wynosi okres wypowiedzenia po 3 latach pracy”. " +
          "Jeśli użytkownik zapytał skrótem („a ile wcześniej?”), wpisz tu pytanie " +
          "odtworzone z kontekstu, a nie jego dosłowne słowa.",
      },
    },
    required: ["pytanie"],
  },

  async execute({ pytanie }, ctx = {}) {
    const q = typeof pytanie === "string" ? pytanie.trim() : "";
    if (!q) {
      return powiedz(
        "Nie podano pytania do wyszukania. Sformułuj samodzielne pytanie i spróbuj ponownie.",
      );
    }

    // --- 1) TOZSAMOSC ---------------------------------------------------
    // Bez niej nie wiadomo, czyich dokumentow szukac. Zwracamy TEKST, nie
    // wyjatek: model ma sie z tego wycofac i odpowiedziec bez dokumentow,
    // a nie zobaczyc "Blad narzedzia" bez wyjasnienia.
    if (!ctx.user?.id) {
      return powiedz(
        "Nie udało się ustalić, czyje dokumenty przeszukać (brak sesji użytkownika). " +
          "Odpowiedz bez korzystania z dokumentów i zaznacz, że nie mogłeś ich sprawdzić.",
      );
    }
    if (!ctx.db) {
      return powiedz(
        "Wyszukiwanie w dokumentach jest w tej chwili niedostępne (brak połączenia z bazą). " +
          "Odpowiedz bez korzystania z dokumentów i zaznacz to wprost.",
      );
    }

    // --- 2) KTORA KOLEKCJA ----------------------------------------------
    // Agent WSKAZUJE JEDNA KOLEKCJE (agents.rag_collection_id, migracja 019),
    // a jej CALOSC jest zakresem wyszukiwania. Nie ma wyboru podzbioru
    // dokumentow: kolekcja JEST jednostka organizacyjna, wiec dzielenie jej
    // w kreatorze agenta znaczyloby, ze uzytkownik utrzymuje ten sam podzial
    // w dwoch miejscach naraz.
    //
    // rag_collection_id przychodzi z ctx.agent, czyli OD KLIENTA i niezaufane.
    // To jest w porzadku, bo sluzy WYLACZNIE do wyboru zakresu — o dostep
    // pyta RLS przez ctx.db. Podstawienie cudzego id konczy sie brakiem
    // wiersza, nie odczytem cudzych danych.
    const idKolekcji =
      typeof ctx.agent?.rag_collection_id === "string"
        ? ctx.agent.rag_collection_id.trim()
        : "";

    if (!idKolekcji) {
      return powiedz(
        "Ten agent nie ma wskazanej kolekcji dokumentow, wiec nie ma czego przeszukac. " +
          "Powiedz uzytkownikowi, ze nie masz przypisanej kolekcji, i zaproponuj, " +
          "zeby wybral ja w kreatorze agenta (sekcja „Narzedzia”, przy przelaczniku " +
          "„Przeszukiwanie dokumentow”).",
      );
    }

    try {
      // --- 3) KOLEKCJA ---------------------------------------------------
      // getCollection rzuca not_found, gdy kolekcji nie ma ALBO gdy nalezy
      // do innego konta — RLS nie rozroznia tych przypadkow i dobrze.
      // Ta sama sciezka obsluguje wiec wskazanie OSIEROCONE (kolekcja
      // skasowana w Kreatorze RAG, bo nie ma klucza obcego, ktory by tego
      // pilnowal — patrz supabase/019_agent_kolekcja.sql).
      let kolekcja;
      try {
        kolekcja = await getCollection(idKolekcji, { client: ctx.db });
      } catch (e) {
        if (e?.code === "not_found" || e?.code === "invalid_input") {
          return powiedz(
            "Kolekcja wskazana w konfiguracji tego agenta jest niedostepna — " +
              "zostala skasowana albo nie nalezy do tego konta. " +
              "Powiedz uzytkownikowi, ze trzeba wskazac kolekcje na nowo " +
              "w kreatorze agenta, i odpowiedz bez dokumentow.",
          );
        }
        throw e;
      }

      // --- 4) WYSZUKIWANIE ----------------------------------------------
      // documentIds: null — CALA KOLEKCJA. To jest ta sama semantyka, ktora
      // rdzen mial od poczatku (SPEC 3329-3339: null = cala kolekcja);
      // AIDEAS po prostu z zawezania nie korzysta.
      //
      // Dokumenty bez wektorow (status 'chunked') odpadaja SAME, po stronie
      // bazy: rag_search_chunks porownuje embeddingi, a fragment bez wektora
      // nie ma z czym. Nie trzeba ich filtrowac tutaj — i nie da sie tego
      // zrobic sensownie, skoro zakresem jest cala kolekcja.
      const wynik = await searchCollection(
        {
          collectionId: kolekcja.id,
          query: q,
          topK: LIMIT_TRAFIEN,
          documentIds: null,
        },
        { client: ctx.db },
      );

      const trafienia = wynik.hits || [];

      // --- 5) BRAK WYNIKOW ----------------------------------------------
      // Komunikat MUSI zamykac droge do zgadywania. Model, ktory uslyszy samo
      // "brak wynikow", chetnie odpowie z wiedzy ogolnej i poda to jako tresc
      // regulaminu — a to jest gorsze niz przyznanie sie do niewiedzy.
      //
      // Podajemy NAZWE KOLEKCJI, bo to jedyna wskazowka, ktora pozwala
      // uzytkownikowi rozroznic "nie ma tego w dokumentach" od "agent patrzy
      // w nie te dokumenty".
      if (wynik.noResults || trafienia.length === 0) {
        return powiedz(
          `W kolekcji „${kolekcja.name}” nie ma odpowiedzi na pytanie: „${q}”. ` +
            "NIE odpowiadaj z własnej wiedzy ogólnej i nie zgaduj. " +
            "Powiedz wprost, że w przeszukiwanych dokumentach nie ma tej informacji, " +
            "i podaj nazwę kolekcji, w której szukałeś.",
        );
      }

      // --- 6) ZRODLA DO UI ----------------------------------------------
      // PUSH, nigdy podmiana tablicy: dostawca trzyma do niej referencje
      // i przypisanie ctx.sources = [...] zerwaloby polaczenie, przez co
      // zrodla nie doszlyby do interfejsu (i nikt by tego nie zauwazyl).
      if (Array.isArray(ctx.sources)) {
        for (const h of trafienia) {
          ctx.sources.push({
            // Brak `url` jest zamierzony — fragment dokumentu nie ma adresu.
            // Render zrodel dostanie osobne traktowanie w rundzie 8; dzis
            // istniejacy kod pokazuje sam `title`, co jest czytelne.
            title: [h.fileName, h.headingPath, h.pageFrom ? `str. ${h.pageFrom}` : null]
              .filter(Boolean)
              .join(" · "),
            kind: "rag",
            documentId: h.documentId,
            chunkId: h.chunkId,
            score: h.score,
          });
        }
      }

      // --- 7) TEKST DLA MODELU ------------------------------------------
      // Kazdy fragment opisany tak, zeby model mogl go zacytowac z podaniem
      // miejsca. Tresc DOSLOWNA — streszczanie jej tutaj odbieraloby modelowi
      // material, na ktorym ma sie oprzec.
      const bloki = trafienia.map((h, i) => {
        const skad = [
          `plik: ${h.fileName}`,
          h.headingPath ? `sekcja: ${h.headingPath}` : null,
          h.pageFrom ? `strona: ${h.pageFrom}${h.pageTo && h.pageTo !== h.pageFrom ? `–${h.pageTo}` : ""}` : null,
        ]
          .filter(Boolean)
          .join(", ");

        const tresc =
          h.content.length > MAKS_ZNAKOW_FRAGMENTU
            ? h.content.slice(0, MAKS_ZNAKOW_FRAGMENTU) + "…"
            : h.content;

        return `[${i + 1}] (${skad})\n${tresc}`;
      });

      return powiedz(
        `Znaleziono ${trafienia.length} fragment(ów) dla pytania „${q}”. ` +
          "Odpowiedz WYŁĄCZNIE na ich podstawie i podaj, z którego pliku i której " +
          "sekcji pochodzi informacja. Jeśli fragmenty nie odpowiadają na pytanie, " +
          "powiedz to zamiast uzupełniać z własnej wiedzy.\n\n" +
          bloki.join("\n\n"),
      );
    } catch (e) {
      // Bledy rdzenia niosa kody domenowe (10.2). Zamieniamy je na tekst,
      // zeby model mogl sie wycofac — z zachowaniem tego, co dla niego istotne:
      // czy da sie sprobowac ponownie, czy nie ma po co.
      const kod = e?.code;
      if (kod === "ollama_unavailable") {
        return powiedz(
          "Wyszukiwanie w dokumentach nie działa, bo lokalny model embeddingów (Ollama) " +
            "nie odpowiada. Powiedz to użytkownikowi i odpowiedz bez dokumentów.",
        );
      }
      if (kod === "model_mismatch" || kod === "dim_mismatch") {
        return powiedz(
          "Wyszukiwanie w dokumentach jest niespójne z modelem, którym je zindeksowano " +
            `(${e.message}). Powiedz użytkownikowi, że dokumenty wymagają przeindeksowania.`,
        );
      }
      return powiedz(
        `Nie udało się przeszukać dokumentów: ${e?.message || "nieznany błąd"}. ` +
          "Odpowiedz bez korzystania z dokumentów i zaznacz, że nie mogłeś ich sprawdzić.",
      );
    }
  },
};
