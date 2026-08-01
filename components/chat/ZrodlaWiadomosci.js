"use client";

// LISTA ŹRÓDEŁ POD ODPOWIEDZIĄ AGENTA — jeden komponent dla obu okien czatu.
//
// =============================================================================
//  DLACZEGO WSPÓLNY KOMPONENT, A NIE DWIE POPRAWIONE KOPIE
//
//  Bo duplikuje się DECYZJA, a nie wygląd. Rozpoznanie rodzaju źródła i wybór
//  między klikalnym linkiem a martwym tekstem to logika, która musi być taka
//  sama w obu oknach — inaczej to samo źródło wygląda inaczej zależnie od tego,
//  gdzie rozmawiasz, i nikt tego nie zauważy do czasu zgłoszenia.
//
//  Ta duplikacja już raz kosztowała: TOOL_LABELS istnieje w TRZECH miejscach
//  (AgentChat, ConversationChat, MentorPanel) i dopisanie narzędzia RAG
//  wymagało pamiętania o każdym z nich osobno.
//
//  ZARZUT PRZECIW — „wspólny komponent musi przyjąć klasy z dwóch różnych
//  modułów CSS" — jest prawdziwy, ale to jedyna rzecz, która się tu naprawdę
//  różni. Nazwy klas przychodzą więc PARAMETREM, a każde okno zachowuje swój
//  arkusz. Komponent nie wie nic o wyglądzie, hosty nie wiedzą nic o rodzajach
//  źródeł. Odwrotny podział — wspólny CSS, osobna logika — byłby gorszy:
//  ujednolicałby to, co ma prawo się różnić, i rozdzielał to, co musi być
//  wspólne.
// =============================================================================

// Źródło webowe ma `url`. Fragment dokumentu go NIE MA — i to jest jedyny
// pewny rozróżnik, bo `kind: "rag"` dokłada narzędzie RAG, a starsze wiadomości
// zapisane w bazie przed rundą 8 tego pola nie mają wcale.
// Sprawdzamy więc URL, a `kind` traktujemy jako potwierdzenie, nie warunek.
function jestLinkiem(z) {
  return Boolean(z && typeof z.url === "string" && z.url);
}

export function ZrodlaWiadomosci({ zrodla, klasy = {} }) {
  if (!Array.isArray(zrodla) || zrodla.length === 0) return null;

  const { wrap, title, link, doc } = klasy;

  return (
    <span className={wrap}>
      <span className={title}>Źródła:</span>
      {zrodla.map((z, i) =>
        jestLinkiem(z) ? (
          <a
            key={i}
            className={link}
            href={z.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {z.title || z.url}
          </a>
        ) : (
          // BEZ <a href>. Fragment dokumentu nie ma adresu, więc kotwica bez
          // href renderowałaby się jako tekst wyglądający na link, którego nie
          // da się kliknąć — czyli martwy link. Tytuł niesie już komplet:
          // nazwa pliku · ścieżka nagłówków · strona (składane w lib/tools/
          // rag_search.js). `doc` domyślnie spada na `link`, żeby okno bez
          // osobnej klasy nadal wyglądało spójnie.
          <span key={i} className={doc || link} title={z.title || ""}>
            {z.title || "fragment dokumentu"}
          </span>
        ),
      )}
    </span>
  );
}
