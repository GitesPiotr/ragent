import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sendChat } from "@/lib/providers";
import { fetchOllamaModels } from "@/lib/providers/ollama";
import { getModelsForProvider } from "@/lib/config/models";
import { loadKnowledge } from "@/lib/mentor/knowledge";
import { MENTOR_PROVIDER } from "@/lib/config/mentor";
import {
  resolveMentorModel,
  resolveOllamaUrl,
} from "@/lib/settings/serverSettings";
import {
  buildMentorSystem,
  buildGuidedProseSystem,
  buildGuidedProposalSystem,
  buildPersonaFeedbackSystem,
  GUIDED_PROPOSAL_SCHEMA,
} from "@/lib/mentor/prompt";

// MENTOR_PROVIDER / MENTOR_MODEL pochodza z lib/config/mentor.js — to JEDYNE
// miejsce, w ktorym ustawia sie model mentora (z nadpisaniem przez .env.local).
// Uzywane w obu trybach: reaktywnym i prowadzenia (proza + ekstrakcja).

// Czytelne, polskie komunikaty bledow (bez surowego stack trace).
function mapError(error) {
  if (error?.code === "no_api_key") {
    return { status: 500, message: error.message };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      status: 401,
      message:
        "Nieprawidłowy klucz API (ANTHROPIC_API_KEY). Sprawdź wartość w .env.local.",
    };
  }
  if (error instanceof Anthropic.BadRequestError) {
    const msg = String(error.message || "");
    if (/credit balance is too low|insufficient|billing/i.test(msg)) {
      return {
        status: 402,
        message: "Brak środków na koncie API Anthropic. Doładuj konto.",
      };
    }
    return { status: 400, message: `Nieprawidłowe zapytanie do API: ${msg}` };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      message: "Przekroczono limit zapytań. Spróbuj ponownie za chwilę.",
    };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      status: error.status || 500,
      message: `Błąd API: ${error.message || "nieznany błąd"}`,
    };
  }
  return {
    status: 500,
    message: error?.message || "Wystąpił nieoczekiwany błąd serwera.",
  };
}

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

  const { agent, messages, mode, personaDraft } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Brak wiadomości do mentora." },
      { status: 400 },
    );
  }

  // Ustawienia z przegladarki — walidowane serwerowo (nie ufamy klientowi).
  // Model mentora: tylko z listy Anthropic; inaczej fallback na env/stala.
  const mentorModel = resolveMentorModel(body?.mentorModel);
  const ollamaUrl = resolveOllamaUrl(body?.ollamaUrl);

  if (mode === "persona-feedback") {
    const draft = typeof personaDraft === "string" ? personaDraft.trim() : "";
    if (!draft) {
      return NextResponse.json(
        { error: "Brak opisu osobowości do oceny." },
        { status: 400 },
      );
    }
    return handlePersonaFeedback(agent || {}, messages, draft, mentorModel);
  }
  if (mode === "guided") {
    return handleGuided(agent || {}, messages, mentorModel, ollamaUrl);
  }
  return handleReactive(agent || {}, messages, mentorModel);
}

// --- KROK PERSONA, ŚCIEŻKA A ("Opisz sam") — tryb OCENIAJĄCY.
// JEDEN etap: czysta proza z feedbackiem. Propozycja do kreatora nie jest
// wyciagana modelem — to wprost tekst uzytkownika, wiec trafia do kreatora
// slowo w slowo (i oszczedzamy drugie wywolanie).
async function handlePersonaFeedback(agent, messages, draft, model) {
  try {
    const knowledge = await loadKnowledge();
    const system = buildPersonaFeedbackSystem(knowledge, agent, draft);

    const { text } = await sendChat({
      provider: MENTOR_PROVIDER,
      model,
      system,
      messages,
    });

    return NextResponse.json({
      message: text,
      step: "persona",
      proposal: { field: "persona", value: draft },
    });
  } catch (error) {
    const { status, message } = mapError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// --- Tryb reaktywny ("Zapytaj mentora") — BEZ ZMIAN wzgledem poprzedniej sesji.
async function handleReactive(agent, messages, model) {
  try {
    const knowledge = await loadKnowledge();
    const system = buildMentorSystem(knowledge, agent);

    const { text } = await sendChat({
      provider: MENTOR_PROVIDER,
      model,
      system,
      messages,
    });

    return NextResponse.json({ reply: text });
  } catch (error) {
    const { status, message } = mapError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// Buduje czytelna liste dostepnych modeli: Anthropic (models.js) + lokalne (Ollama).
async function buildAvailableModelsText(ollamaUrl) {
  const lines = [];

  lines.push("Anthropic:");
  for (const m of getModelsForProvider("anthropic")) {
    const temp = m.supportsTemperature
      ? "temperatura: tak"
      : "temperatura: NIE (model sam dobiera losowość)";
    lines.push(`- ${m.id} (${m.label}) — ${temp}`);
  }

  const { models: ollamaModels, error } = await fetchOllamaModels(ollamaUrl);
  if (ollamaModels.length > 0) {
    lines.push("Lokalne (Ollama):");
    for (const m of ollamaModels) {
      lines.push(`- ${m.id} (lokalny, Ollama) — temperatura: tak`);
    }
  } else {
    lines.push(
      `Lokalne (Ollama): niedostępne${error ? ` (${error})` : ""} — nie proponuj modeli lokalnych.`,
    );
  }

  return lines.join("\n");
}

// Zamienia surowa odpowiedz JSON mentora na znormalizowana propozycje pola.
function normalizeProposal(parsed) {
  const field = parsed.proposalField;
  if (!field || field === "none") return null;

  if (field === "temperature") {
    const value = parsed.proposalNumber;
    // Bezpiecznik: temperatura musi byc liczba w zakresie 0–1.
    if (typeof value !== "number" || value < 0 || value > 1) return null;
    return { field: "temperature", value };
  }
  if (field === "rules" || field === "tools") {
    return {
      field,
      value: Array.isArray(parsed.proposalList) ? parsed.proposalList : [],
    };
  }
  // persona, model — wartosc tekstowa.
  // Bezpiecznik: NIE stosujemy pustej propozycji (model bywa myli sie na
  // krokach pomijanych i podaje puste pole - to wyzerowaloby dane usera).
  const value = (parsed.proposalText || "").trim();
  if (!value) return null;
  return { field, value };
}

// --- Tryb prowadzenia ("Przeprowadź mnie krok po kroku") — DWA ETAPY.
// Etap 1: proza mentora BEZ structured output (nie psuje długiej prozy).
// Etap 2: sama propozycja pola ZE structured output (krótkie, czyste dane).
async function handleGuided(agent, messages, model, ollamaUrl) {
  try {
    const knowledge = await loadKnowledge();
    const availableModelsText = await buildAvailableModelsText(ollamaUrl);

    // --- Etap 1: czysta proza (zwykły tekst, jak tryb reaktywny) ---
    const proseSystem = buildGuidedProseSystem(
      knowledge,
      agent,
      availableModelsText,
    );
    const { text: prose } = await sendChat({
      provider: MENTOR_PROVIDER,
      model,
      system: proseSystem,
      messages,
    });

    // --- Etap 2: propozycja pola na podstawie prozy z etapu 1 ---
    // Dokładamy wypowiedź mentora jako turę assistant, a potem prosbę o ekstrakcję.
    const proposalSystem = buildGuidedProposalSystem(agent, availableModelsText);
    const proposalMessages = [
      ...messages,
      { role: "assistant", content: prose },
      {
        role: "user",
        content:
          "Na podstawie Twojej powyższej wypowiedzi zwróć strukturalną propozycję pola zgodnie ze schematem.",
      },
    ];

    const { text: proposalText } = await sendChat({
      provider: MENTOR_PROVIDER,
      model,
      system: proposalSystem,
      messages: proposalMessages,
      responseFormat: GUIDED_PROPOSAL_SCHEMA,
    });

    let parsed;
    try {
      parsed = JSON.parse(proposalText);
    } catch {
      // Nawet jesli ekstrakcja propozycji zawiedzie, oddajemy czysta proze.
      return NextResponse.json({ message: prose, step: null, proposal: null });
    }

    return NextResponse.json({
      message: prose,
      step: parsed.step || null,
      proposal: normalizeProposal(parsed),
    });
  } catch (error) {
    const { status, message } = mapError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
