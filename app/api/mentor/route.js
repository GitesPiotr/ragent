import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sendChat } from "@/lib/providers";
import { fetchOllamaModels } from "@/lib/providers/ollama";
import { modelSupportsTemperature } from "@/lib/config/models";
import { loadKnowledge } from "@/lib/mentor/knowledge";
import { MENTOR_PROVIDER } from "@/lib/config/mentor";
import { wczytajDopuszczone } from "@/lib/settings/dopuszczoneServer";
import {
  listaModeli,
  modeleOllamy,
  tekstDostepnychModeli,
} from "@/lib/settings/dopuszczoneModele";
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
  //
  // Lista dopuszczonych czytana RAZ, z bazy, i sluzy dwom rzeczom naraz:
  // walidacji modelu mentora (nizej) i budowie listy modeli w promptcie
  // (buildAvailableModelsText). Drugie zapytanie po te same dane byloby
  // drugim miejscem, w ktorym te dwie odpowiedzi moglyby sie rozjechac.
  //
  // `null` przy braku sesji/tabel — wtedy resolveMentorModel wraca do
  // sprawdzenia wzgledem statycznej listy Anthropic, czyli do zachowania
  // sprzed rundy 6.
  const dopuszczone = await wczytajDopuszczone();

  // Model mentora: tylko z modeli Anthropic dopuszczonych przez konto;
  // inaczej fallback na env/stala. DOSTAWCA mentora zostaje stala —
  // uzasadnienie w lib/settings/dopuszczoneModele.js (structured output).
  const mentorModel = resolveMentorModel(body?.mentorModel, dopuszczone);
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
    return handleGuided(agent || {}, messages, mentorModel, ollamaUrl, dopuszczone);
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

// =============================================================================
//  LISTA MODELI DO PROMPTU MENTORA — NAJDELIKATNIEJSZE MIEJSCE RUNDY 6.
//
//  Wynik NIE trafia do interfejsu, tylko do TRESCI promptu: mentor czyta te
//  linie i na ich podstawie proponuje uzytkownikowi model. Blad nie objawi sie
//  wyjatkiem ani pusta lista — objawi sie tym, ze mentor zaproponuje model,
//  ktorego konto nie ma wlaczonego, propozycja trafi do kreatora i rozmowa
//  z agentem skonczy sie bledem dopiero u dostawcy.
//
//  DLATEGO ZMIENIA SIE TYLKO ZRODLO POZYCJI, NIE ICH FORMAT. Sam sklad linii
//  siedzi w lib/settings/dopuszczoneModele.js i jest przypiety testem
//  porownujacym wynik ZNAK W ZNAK z tekstem sprzed tej rundy
//  („PRZED/PO: format linii nie zmienil sie co do znaku").
//
//  Co sie zmienilo merytorycznie — i tylko to:
//   • Anthropic: z MODELS_BY_PROVIDER -> z modeli Anthropic wlaczonych przez
//     konto (konto bez wyboru dostaje dalej MODELS_BY_PROVIDER),
//   • doszly grupy OpenAI i OpenRouter, ktorych ten tekst nie znal — mentor
//     nie mial jak zaproponowac modelu przez OpenRoutera, mimo ze agent
//     potrafil na nim dzialac od rundy 2,
//   • Ollama: lista z demona PRZECIETA z lista konta — bez tego mentor
//     proponowalby modele wylaczone w Ustawieniach.
// =============================================================================
async function buildAvailableModelsText(ollamaUrl, dopuszczone) {
  const { models: ollamaModels, error } = await fetchOllamaModels(ollamaUrl);

  const grupy = [
    { provider: "anthropic", modele: listaModeli(dopuszczone, "anthropic").modele },
    { provider: "openai", modele: listaModeli(dopuszczone, "openai").modele },
    { provider: "openrouter", modele: listaModeli(dopuszczone, "openrouter").modele },
    { provider: "ollama", modele: modeleOllamy(dopuszczone, ollamaModels).modele },
  ];

  // Powod „niedostepnosci" lokalnych rozroznia dwie sytuacje, bo mentor
  // dostaje to zdanie jako uzasadnienie: demon nie odpowiedzial (error)
  // wobec „odpowiedzial, ale nic nie jest wlaczone na koncie".
  const powodBrakuLokalnych =
    error ||
    (ollamaModels.length > 0
      ? "żaden model lokalny nie jest włączony na koncie"
      : null);

  return tekstDostepnychModeli(
    grupy,
    modelSupportsTemperature,
    powodBrakuLokalnych,
  );
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
async function handleGuided(agent, messages, model, ollamaUrl, dopuszczone) {
  try {
    const knowledge = await loadKnowledge();
    const availableModelsText = await buildAvailableModelsText(
      ollamaUrl,
      dopuszczone,
    );

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
