import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sendChat } from "@/lib/providers";
// System prompt (persona + zasady + przyklady Q&A + format wyjscia)
// budowany w lib/agent/systemPrompt.js — jedno miejsce dla wszystkich
// parametrow kreatora, ktore wplywaja na zachowanie agenta.
import { buildSystemPrompt } from "@/lib/agent/systemPrompt";
import { loadKnowledgeFilesForAgent } from "@/lib/agent/knowledgeForAgent";
import { resolveKnowledgeLimit } from "@/lib/settings/serverSettings";

// Mapuje bledy na czytelne, polskie komunikaty i status HTTP.
// Nigdy nie zwracamy surowego stack trace do frontu.
function mapError(error) {
  if (error?.code === "no_api_key") {
    return { status: 500, message: error.message };
  }
  if (error?.code === "provider_not_implemented") {
    return { status: 501, message: error.message };
  }
  if (error?.code === "unknown_provider") {
    return { status: 400, message: error.message };
  }
  if (error?.code === "ollama_unavailable") {
    return { status: 503, message: error.message };
  }
  if (error?.code === "ollama_error") {
    return { status: 502, message: error.message };
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
        message:
          "Brak środków na koncie API Anthropic. Doładuj konto, aby kontynuować.",
      };
    }
    if (/model/i.test(msg)) {
      return {
        status: 400,
        message: "Wybrany model jest nieprawidłowy lub niedostępny.",
      };
    }
    return { status: 400, message: `Nieprawidłowe zapytanie do API: ${msg}` };
  }

  if (error instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      message:
        "Przekroczono limit zapytań lub brak środków. Spróbuj ponownie za chwilę.",
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

  const { agent, messages } = body || {};

  if (!agent || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Brak danych: wymagane pola 'agent' oraz 'messages'." },
      { status: 400 },
    );
  }

  const knowledgeFiles = await loadKnowledgeFilesForAgent(agent);
  // Limit znakow wiedzy z ustawien przegladarki — walidowany serwerowo.
  const knowledgeCharLimit = resolveKnowledgeLimit(body?.knowledgeCharLimit);
  const system = buildSystemPrompt(agent, { knowledgeFiles, knowledgeCharLimit });
  const tools = Array.isArray(agent.tools) ? agent.tools : [];

  // Strumien NDJSON: kolejne linie JSON to zdarzenia.
  //  - { type: "tool-call", tool }  -> narzedzie sie wykonuje (na zywo)
  //  - { type: "done", reply, toolCalls } -> koncowa odpowiedz
  //  - { type: "error", error } -> czytelny komunikat bledu
  // Dzieki temu klient widzi tool-running w czasie rzeczywistym.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        const { text, toolCalls, sources } = await sendChat({
          provider: agent.provider,
          model: agent.model,
          temperature: agent.temperature,
          system,
          messages,
          tools,
          onEvent: (ev) => write(ev),
        });
        write({
          type: "done",
          reply: text,
          toolCalls: toolCalls || [],
          sources: sources || [],
        });
      } catch (error) {
        const { message } = mapError(error);
        write({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
