import { getCollectionByExternalRef } from "@/lib/rag/collections.js";
import { findDocumentsByExternalRefs } from "@/lib/rag/documents.js";
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
  description:
    "Przeszukuje dokumenty przypisane do tego agenta i zwraca dosłowne fragmenty " +
    "wraz z nazwą pliku, stroną i ścieżką nagłówków. " +
    "UŻYWAJ ZAWSZE, gdy pytanie dotyczy treści dokumentów, procedur, regulaminów, " +
    "umów, instrukcji lub konkretnych zapisów — zamiast odpowiadać z własnej wiedzy. " +
    "WAŻNE: przekaż pytanie SAMODZIELNE, zrozumiałe bez historii rozmowy. " +
    "Wyszukiwanie nie widzi wcześniejszych wiadomości, więc „a ile w drugim roku?” " +
    "trafia w próżnię — napisz „ile dni urlopu przysługuje w drugim roku pracy”. " +
    "Jeśli pytanie użytkownika odwołuje się do czegoś powiedzianego wcześniej, " +
    "rozwiń je w pełne zdanie przed wysłaniem.",
  input_schema: {
    type: "object",
    properties: {
      pytanie: {
        type: "string",
        description:
          "Samodzielne pytanie w języku naturalnym, zrozumiałe bez kontekstu rozmowy. " +
          "Np. „ile wynosi okres wypowiedzenia po 3 latach pracy”.",
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

    // --- 2) KTORE DOKUMENTY ---------------------------------------------
    // PUSTA LISTA ZNACZY "NIE SZUKAJ", NIE "SZUKAJ WE WSZYSTKIM".
    //
    // To rozstrzygniecie AIDEAS, nie zmiana w rdzeniu: searchCollection nadal
    // traktuje documentIds === null jako "cala kolekcja" (SPEC 3329-3339)
    // i tej semantyki nie ruszamy. Tutaj po prostu NIE WOLAMY wyszukiwania,
    // gdy agent nie ma wskazanych plikow — inaczej agent bez zadnego pliku
    // przeszukiwalby caly magazyn konta, czyli dokladnie to, czego wybor
    // "tylko wskazane" ma zabraniac.
    const idsPlikow = Array.isArray(ctx.agent?.knowledge_file_ids)
      ? ctx.agent.knowledge_file_ids.filter((x) => typeof x === "string" && x)
      : [];

    if (idsPlikow.length === 0) {
      return powiedz(
        "Ten agent nie ma wskazanych żadnych dokumentów, więc nie ma czego przeszukać. " +
          "Powiedz użytkownikowi, że nie masz przypisanych dokumentów, i zaproponuj, " +
          "żeby wybrał je w kreatorze agenta (sekcja „Baza wiedzy”).",
      );
    }

    try {
      // --- 3) KOLEKCJA KONTA -------------------------------------------
      const kolekcja = await getCollectionByExternalRef(ctx.user.id, {
        client: ctx.db,
      });
      if (!kolekcja) {
        return powiedz(
          "Żaden dokument tego konta nie został jeszcze zindeksowany do wyszukiwania. " +
            "Powiedz użytkownikowi, że dokumenty trzeba najpierw zindeksować w zakładce " +
            "„Baza wiedzy” przyciskiem „Zindeksuj do RAG”.",
        );
      }

      // --- 4) PLIKI AIDEAS -> DOKUMENTY RAG -----------------------------
      const dokumenty = await findDocumentsByExternalRefs(kolekcja.id, idsPlikow, {
        client: ctx.db,
      });

      // Do wyszukiwania biora sie WYLACZNIE dokumenty z policzonymi wektorami.
      // Dokument 'chunked' jest pociety, ale niezaindeksowany — wyszukiwarka
      // go nie widzi, wiec milczace wliczenie go do listy dawaloby wrazenie,
      // ze plik zostal przeszukany.
      const gotowe = dokumenty.filter((d) => d.status === "ready");
      const niegotowe = dokumenty.filter((d) => d.status !== "ready");
      const brakujace = idsPlikow.length - dokumenty.length;

      if (gotowe.length === 0) {
        const powody = [];
        if (brakujace > 0) {
          powody.push(
            `${brakujace} z ${idsPlikow.length} wskazanych plików nie zostało zindeksowanych`,
          );
        }
        if (niegotowe.length > 0) {
          powody.push(
            `${niegotowe.length} jest pocięte, ale nie ma jeszcze policzonych wektorów`,
          );
        }
        return powiedz(
          "Żaden ze wskazanych dokumentów nie jest gotowy do przeszukania" +
            (powody.length ? ` (${powody.join("; ")})` : "") +
            ". Powiedz użytkownikowi, że dokumenty trzeba zindeksować w zakładce " +
            "„Baza wiedzy”, i odpowiedz bez korzystania z nich.",
        );
      }

      // --- 5) WYSZUKIWANIE ----------------------------------------------
      const wynik = await searchCollection(
        {
          collectionId: kolekcja.id,
          query: q,
          topK: LIMIT_TRAFIEN,
          documentIds: gotowe.map((d) => d.id),
        },
        { client: ctx.db },
      );

      const trafienia = wynik.hits || [];

      // --- 6) BRAK WYNIKOW ----------------------------------------------
      // Komunikat MUSI zamykac droge do zgadywania. Model, ktory uslyszy samo
      // "brak wynikow", chetnie odpowie z wiedzy ogolnej i poda to jako tresc
      // regulaminu — a to jest gorsze niz przyznanie sie do niewiedzy.
      if (wynik.noResults || trafienia.length === 0) {
        return powiedz(
          `W dokumentach agenta nie ma odpowiedzi na pytanie: „${q}”. ` +
            "NIE odpowiadaj z własnej wiedzy ogólnej i nie zgaduj. " +
            "Powiedz wprost, że w dostępnych dokumentach nie ma tej informacji." +
            (niegotowe.length || brakujace > 0
              ? " Możesz dodać, że część wskazanych plików nie jest jeszcze zindeksowana."
              : ""),
        );
      }

      // --- 7) ZRODLA DO UI ----------------------------------------------
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

      // --- 8) TEKST DLA MODELU ------------------------------------------
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
