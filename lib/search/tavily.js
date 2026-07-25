// Dostawca wyszukiwania: Tavily (https://tavily.com).
// API zweryfikowane wg dokumentacji Tavily (docs.tavily.com):
//   POST https://api.tavily.com/search
//   Nagłówek:  Authorization: Bearer tvly-...
//   Body:      { query, max_results, search_depth, include_answer }
//   Odpowiedź: { query, answer?, results: [{ title, url, content, score }] }
//   Błędy:     401 (zły/brak klucza), 429 (limit zapytań), 432 (limit planu)
//              — każdy w kształcie { detail: { error } }.
//
// Klucz TYLKO po stronie serwera (process.env.TAVILY_API_KEY, bez NEXT_PUBLIC_).
const TAVILY_URL = "https://api.tavily.com/search";
// Skracamy fragment kazdego wyniku, zeby nie zalac kontekstu malego modelu.
const MAX_CONTENT_CHARS = 320;

// Zwraca znormalizowany ksztalt: { results: [{ title, url, content }], answer }.
// Bledy rzuca z czytelnym komunikatem PL i kodem (search_no_key/limit/...).
export async function tavilySearch(query, { maxResults = 5 } = {}) {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) {
    const err = new Error(
      "Brak klucza wyszukiwarki. Ustaw TAVILY_API_KEY w pliku .env.local i zrestartuj serwer, aby włączyć wyszukiwanie dla modeli lokalnych.",
    );
    err.code = "search_no_key";
    throw err;
  }

  let res;
  try {
    res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
      }),
    });
  } catch {
    const err = new Error(
      "Nie udało się połączyć z wyszukiwarką. Sprawdź połączenie z internetem.",
    );
    err.code = "search_unavailable";
    throw err;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail?.error || "";
    if (res.status === 401) {
      const err = new Error(
        "Nieprawidłowy klucz wyszukiwarki (TAVILY_API_KEY). Sprawdź wartość w .env.local.",
      );
      err.code = "search_no_key";
      throw err;
    }
    if (res.status === 429 || res.status === 432) {
      const err = new Error(
        "Przekroczono limit darmowego planu wyszukiwarki. Spróbuj ponownie później albo zwiększ plan.",
      );
      err.code = "search_limit";
      throw err;
    }
    const err = new Error(
      `Wyszukiwarka zwróciła błąd (HTTP ${res.status}). ${detail}`.trim(),
    );
    err.code = "search_error";
    throw err;
  }

  const data = await res.json();
  const results = (data.results || [])
    .slice(0, maxResults)
    .filter((r) => r && r.url)
    .map((r) => ({
      title: r.title || r.url,
      url: r.url,
      content: (r.content || "").trim().slice(0, MAX_CONTENT_CHARS),
    }));

  return { results, answer: data.answer || null };
}
