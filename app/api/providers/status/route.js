import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Informuje UI kreatora, czy klucze dostawcow sa ustawione — BEZ zdradzania
// ich wartosci (zwracamy wylacznie true/false). Na tej podstawie sekcja
// „Model AI" pokazuje ostrzezenie przy modelach, ktorych nie da sie uruchomic.
//
// Ten sam wzorzec co /api/search/status.
export async function GET() {
  return NextResponse.json({
    anthropic: { configured: Boolean(process.env.ANTHROPIC_API_KEY) },
    openai: { configured: Boolean(process.env.OPENAI_API_KEY) },
    openrouter: { configured: Boolean(process.env.OPENROUTER_API_KEY) },
  });
}
