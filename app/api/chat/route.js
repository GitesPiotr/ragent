import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sendChat } from "@/lib/providers";
import { createClient } from "@/lib/supabase/server";
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

  // Bledy dostawcy OpenAI (warstwa lib/providers/openai.js zamienia odpowiedzi
  // HTTP na wyjatki z kodem). Komunikaty sa juz po polsku — przepuszczamy je.
  if (error?.code === "openai_auth") {
    return { status: 401, message: error.message };
  }
  if (error?.code === "openai_model_not_found") {
    return { status: 400, message: error.message };
  }
  if (error?.code === "openai_rate_limit") {
    return { status: 429, message: error.message };
  }
  if (error?.code === "openai_bad_request") {
    return { status: 400, message: error.message };
  }
  if (error?.code === "openai_unavailable") {
    return { status: 503, message: error.message };
  }
  if (error?.code === "openai_error") {
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

  // =========================================================================
  //  TOZSAMOSC — WYLACZNIE Z SESJI, NIGDY Z CIALA ZADANIA
  //
  //  Do tej pory ta trasa nie wolala getUser() w ogole i polegala na proxy.js,
  //  ktory odcina zadania bez sesji na 401. To dalej dziala i zostaje — ale
  //  proxy odpowiada wylacznie na pytanie „czy ktokolwiek jest zalogowany",
  //  a narzedzia agenta potrzebuja odpowiedzi na „KTO". Bez tego narzedzie
  //  RAG nie ma jak ustalic, czyjej kolekcji szukac.
  //
  //  ZRODLEM TOZSAMOSCI JEST CIASTECZKO SESJI, nie cialo POST. Powod jest
  //  zapisany w lib/agent/knowledgeForAgent.js:44-52: caly obiekt `agent`
  //  przychodzi od klienta i knowledge_file_ids da sie spreparowac, a jedynym
  //  bezpiecznikiem jest RLS, ktory dokleja owner_id = auth.uid() po stronie
  //  bazy. Tego zalozenia NIE OSLABIAMY — dokladamy drugie, niezalezne.
  //
  //  getUser(), nie getSession(): getUser weryfikuje token po stronie Supabase,
  //  getSession ufa ciasteczku, ktore moglo zostac podrobione.
  // =========================================================================
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return NextResponse.json(
      { error: "Wymagane zalogowanie." },
      { status: 401 },
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
        // KONTEKST NARZEDZI — budowany TU, w jednym miejscu, i przekazywany
        // w dol przez sendChat. Dostawcy go NIE TWORZA: gdyby kazdy skladal
        // wlasny, dolozenie pola znaczyloby trzy zmiany zamiast jednej,
        // a rozjazd miedzy dostawcami bylby niewidoczny do pierwszej awarii.
        const ctx = {
          // Z SESJI, zweryfikowane przez getUser(). To jedyne pole w ctx,
          // na ktorym wolno oprzec decyzje o dostepie do danych.
          user: { id: user.id, email: user.email ?? null },

          // OD KLIENTA — NIEZAUFANE. Przychodzi w ciele POST i nikt go nie
          // porownuje z baza; da sie podmienic knowledge_file_ids, tools,
          // a nawet id. Wolno go uzywac WYLACZNIE do wyboru PODZBIORU tego,
          // co uzytkownik i tak ma prawo zobaczyc (ktore dokumenty przeszukac,
          // ktore narzedzia wlaczyc). NIGDY do autoryzacji — od tego jest
          // ctx.user i RLS.
          agent,

          // Zrodla odkladane przez narzedzia; trafiaja do UI polem `sources`.
          sources: [],
        };

        const { text, toolCalls, sources } = await sendChat({
          provider: agent.provider,
          model: agent.model,
          temperature: agent.temperature,
          system,
          messages,
          tools,
          onEvent: (ev) => write(ev),
          ctx,
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
