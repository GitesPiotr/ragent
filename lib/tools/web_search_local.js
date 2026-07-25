import { searchWeb, SEARCH_FREE_LIMIT_NOTE } from "@/lib/search";

// Narzedzie: Wyszukiwanie w internecie — WERSJA LOKALNA (dla modeli Ollama).
//
// W przeciwienstwie do web_search (Anthropic, providerSide) — to narzedzie
// wykonuje NASZ serwer: odpytuje wyszukiwarke (lib/search) i zwraca zwiezla
// liste wynikow (tytul + fragment + URL), latwa do zacytowania przez maly model.
// Trafia do petli tool-use Ollamy pod tym samym przelacznikiem "web_search".
//
// requiresProvider: "ollama" — wersja lokalna; do Anthropic idzie server tool.
export const webSearchLocal = {
  id: "web_search_local",
  name: "web_search_local",
  requiresProvider: "ollama",
  label: "Wyszukiwanie w internecie (lokalne)",
  description:
    "Wyszukuje w internecie i zwraca aktualne wyniki (tytuł, fragment, URL). " +
    "Używaj, gdy pytanie dotyczy bieżących lub zmiennych informacji, których " +
    "nie znasz z pamięci. ZAWSZE cytuj źródła (tytuł + link) zwrócone przez to " +
    "narzędzie. " +
    SEARCH_FREE_LIMIT_NOTE,
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Zwięzłe zapytanie do wyszukiwarki (kilka słów kluczowych).",
      },
    },
    required: ["query"],
  },
  // ctx.sources (jesli podane) — tu doklejamy URL-e do wyswietlenia w UI.
  async execute({ query } = {}, ctx = {}) {
    const q = (query || "").trim();
    if (!q) return "Błąd: nie podano zapytania do wyszukania.";

    let data;
    try {
      data = await searchWeb(q, { maxResults: 5 });
    } catch (e) {
      // Czytelny komunikat wraca do modelu jako wynik narzedzia — bez crasha.
      return e?.message || "Nie udało się wykonać wyszukiwania w internecie.";
    }

    const results = data.results || [];
    if (results.length === 0) {
      return `Brak wyników wyszukiwania dla zapytania: „${q}”.`;
    }

    // Zrodla dla UI (klikalne linki) — ten sam kanal co przy Anthropic.
    if (Array.isArray(ctx.sources)) {
      for (const r of results) {
        if (r.url) ctx.sources.push({ url: r.url, title: r.title || r.url });
      }
    }

    // Zwiezly, latwy do zacytowania tekst dla modelu: [n] tytul / fragment / URL.
    return results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}\nŹródło: ${r.url}`)
      .join("\n\n");
  },
};
