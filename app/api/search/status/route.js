import { NextResponse } from "next/server";
import { isSearchConfigured, SEARCH_PROVIDER_NAME } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Informuje UI kreatora, czy klucz wyszukiwarki jest ustawiony (bez zdradzania
// wartosci). Na tej podstawie przelacznik „Wyszukiwanie w internecie” jest
// aktywny albo wyszarzony dla modeli lokalnych (Ollama).
export async function GET() {
  return NextResponse.json({
    configured: isSearchConfigured(),
    provider: SEARCH_PROVIDER_NAME,
  });
}
