// Fasada dostawcy wyszukiwania. Cała reszta aplikacji korzysta WYŁĄCZNIE stąd —
// podmiana wyszukiwarki (Tavily -> inna) to zmiana tylko w tym katalogu, bez
// ruszania narzędzia w lib/tools ani warstwy providerów.
import { tavilySearch } from "./tavily";

// Nazwa aktualnej wyszukiwarki (do komunikatów/opisów).
export const SEARCH_PROVIDER_NAME = "Tavily";
// Informacja o darmowym limicie (do opisu narzędzia w UI).
export const SEARCH_FREE_LIMIT_NOTE =
  "Ścieżka lokalna korzysta z wyszukiwarki Tavily — darmowy plan to ok. 1000 zapytań miesięcznie.";

// Czy klucz wyszukiwarki jest ustawiony (serwer). UI pyta o to przez endpoint.
export function isSearchConfigured() {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

// Jedno wejście do wyszukiwania. Zwraca { results:[{title,url,content}], answer }.
export async function searchWeb(query, opts = {}) {
  return tavilySearch(query, opts);
}
