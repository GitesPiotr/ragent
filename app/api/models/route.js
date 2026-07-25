import { NextResponse } from "next/server";
import { fetchOllamaModels } from "@/lib/providers/ollama";
import { resolveOllamaUrl } from "@/lib/settings/serverSettings";

// Zwraca liste lokalnych modeli Ollamy (dynamicznie, po stronie serwera).
// Adres Ollamy moze przyjsc z ustawien przegladarki (?url=) — walidowany
// serwerowo (resolveOllamaUrl), z fallbackiem na OLLAMA_BASE_URL z env.
// Gdy Ollama nie dziala: { models: [], error: "Ollama nie jest uruchomiona" }
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const baseUrl = resolveOllamaUrl(searchParams.get("url"));
  const { models, error } = await fetchOllamaModels(baseUrl);
  return NextResponse.json({ models, error });
}
