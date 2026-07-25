import { NextResponse } from "next/server";
import { buildPromptParts } from "@/lib/agent/systemPrompt";
import { loadKnowledgeFilesForAgent } from "@/lib/agent/knowledgeForAgent";
import { resolveKnowledgeLimit } from "@/lib/settings/serverSettings";

export const runtime = "nodejs";

// Podglad finalnego system promptu dla "Testu agenta".
//
// Celowo uzywa DOKLADNIE tych samych funkcji co /api/chat
// (loadKnowledgeFilesForAgent + buildPromptParts), zeby podglad nie mogl
// rozjechac sie z tym, co naprawde dostaje model.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Nieprawidłowy format zapytania (oczekiwano JSON)." },
      { status: 400 },
    );
  }

  const { agent } = body || {};
  if (!agent) {
    return NextResponse.json(
      { error: "Brak danych agenta." },
      { status: 400 },
    );
  }

  try {
    const knowledgeFiles = await loadKnowledgeFilesForAgent(agent);
    const knowledgeCharLimit = resolveKnowledgeLimit(body?.knowledgeCharLimit);
    const parts = buildPromptParts(agent, { knowledgeFiles, knowledgeCharLimit });

    // Nie odsylamy calej tresci wiedzy do przegladarki — w podgladzie
    // pokazujemy skrot (nazwy plikow + liczba znakow). Reszta czesci
    // idzie w calosci, bo to krotkie instrukcje.
    const safeParts = parts.map((p) =>
      p.id === "knowledge"
        ? { ...p, text: null, chars: p.text.length }
        : { ...p, chars: p.text.length },
    );

    const fullLength = parts.reduce((sum, p) => sum + p.text.length, 0) +
      Math.max(0, parts.length - 1) * 2; // separatory "\n\n"

    return NextResponse.json({ parts: safeParts, fullLength });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Nie udało się zbudować podglądu promptu." },
      { status: 500 },
    );
  }
}
