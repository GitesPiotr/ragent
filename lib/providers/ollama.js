// Implementacja gałęzi Ollama (lokalne modele LLM).
// Ollama dziala lokalnie i NIE wymaga klucza API.
// Adres bazowy mozna nadpisac zmienna OLLAMA_BASE_URL (domyslnie localhost:11434).
import {
  executeTool,
  getToolDefsForOllama,
  MAX_TOOL_ITERATIONS,
} from "@/lib/tools";

export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434";

// Pobiera liste modeli faktycznie pobranych w lokalnej Ollamie (/api/tags).
// Zwraca { models: [{ id, label }], error }. Gdy Ollama nie dziala,
// zwraca pusta liste + czytelny komunikat (NIE rzuca wyjatku).
export async function fetchOllamaModels(baseUrl = OLLAMA_BASE_URL) {
  const url = (baseUrl || OLLAMA_BASE_URL).replace(/\/+$/, "");
  try {
    const res = await fetch(`${url}/api/tags`, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        models: [],
        error: `Ollama odpowiedziała błędem (HTTP ${res.status}).`,
      };
    }

    const data = await res.json();
    // Format Ollamy: { models: [{ name, model, ... }] } - uzywamy `name` jako id.
    const models = (data.models || []).map((m) => ({
      id: m.name,
      label: m.name,
    }));

    return { models, error: null };
  } catch {
    // Najczestszy przypadek: Ollama nie jest uruchomiona (connection refused).
    return { models: [], error: "Ollama nie jest uruchomiona" };
  }
}

// Jedno wywolanie /api/chat Ollamy (bez strumienia). `tools` opcjonalne.
// Bledy sieci/serwera zamieniamy na czytelne wyjatki z kodem.
async function ollamaChat({ model, temperature, messages, tools }) {
  const body = {
    model,
    stream: false,
    messages,
  };
  if (typeof temperature === "number") body.options = { temperature };
  if (Array.isArray(tools) && tools.length > 0) body.tools = tools;

  let res;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    const err = new Error(
      "Nie można połączyć się z Ollamą. Upewnij się, że jest uruchomiona (http://localhost:11434).",
    );
    err.code = "ollama_unavailable";
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Model bez obslugi narzedzi: Ollama zwraca np. „<model> does not support tools”.
    if (
      Array.isArray(tools) &&
      tools.length > 0 &&
      /tool/i.test(text) &&
      /support/i.test(text)
    ) {
      const err = new Error(
        "Ten model lokalny nie obsługuje narzędzi. Wyłącz narzędzia dla tego agenta " +
          "albo wybierz model z ich obsługą (np. qwen2.5, llama3.1).",
      );
      err.code = "ollama_no_tools";
      throw err;
    }
    const err = new Error(
      `Ollama zwróciła błąd (HTTP ${res.status}). ${text}`.trim(),
    );
    err.code = "ollama_error";
    throw err;
  }

  return res.json();
}

// Wysyla czat do lokalnego modelu Ollamy (/api/chat) z PETLA TOOL-USE i sprowadza
// odpowiedz do tego samego ksztaltu co pozostale galezie: { text, toolCalls, sources }.
//
// Format narzedzi Ollamy (zweryfikowany wg dokumentacji Ollamy):
//   - request:  tools: [{ type:"function", function:{ name, description, parameters } }]
//   - response: message.tool_calls: [{ function:{ name, arguments: <obiekt> } }]
//   - wynik:    { role:"tool", content:"<wynik>", tool_name:"<nazwa>" }
//
// Narzedzia LOKALNE (calculator/datetime) wykonuje executeTool — ta sama funkcja
// co dla Anthropic. web_search (providerSide) jest odfiltrowany i NIE trafia tu.
export async function sendChatOllama({
  model,
  temperature,
  system,
  messages,
  tools = [],
  onEvent,
}) {
  // Definicje narzedzi dozwolonych dla Ollamy (bez providerSide/innego dostawcy).
  const toolDefs = getToolDefsForOllama(tools);

  // System prompt idzie jako wiadomosc z rola "system".
  const convo = [];
  if (system) convo.push({ role: "system", content: system });
  for (const m of messages) convo.push({ role: m.role, content: m.content });

  const toolCalls = []; // adnotacje dla UI (badge „użyto: …”)
  // Kontekst wspoldzielony przez wywolania narzedzi — web_search_local doklada
  // tu URL-e, ktore trafiaja do UI tym samym polem `sources` co przy Anthropic.
  const ctx = { sources: [] };
  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await ollamaChat({
      model,
      temperature,
      messages: convo,
      tools: toolDefs,
    });

    const msg = data?.message || {};
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    // Brak wywolan narzedzi -> mamy koncowa odpowiedz tekstowa.
    if (calls.length === 0) {
      finalText = msg.content ?? "";
      break;
    }

    // Model chce uzyc narzedzi. Doklejamy PELNA ture asystenta (z tool_calls),
    // a potem wyniki narzedzi — tak wymaga format Ollamy.
    convo.push(msg);

    for (const call of calls) {
      const name = call?.function?.name;
      let args = call?.function?.arguments;
      // arguments zwykle to obiekt; niektore modele oddaja string JSON.
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }

      // Ten sam sygnal co Anthropic -> UI (badge + activity) dziala bez zmian.
      if (onEvent) onEvent({ type: "tool-call", tool: name });

      const result = await executeTool(name, args || {}, ctx);
      toolCalls.push({ tool: name, input: args, result });

      convo.push({ role: "tool", content: String(result), tool_name: name });
    }
  }

  // Zabezpieczenie: wyczerpano limit iteracji bez koncowego tekstu -> jedno
  // wywolanie BEZ narzedzi, zeby wymusic odpowiedz tekstowa (jak w Anthropic).
  if (!finalText) {
    const data = await ollamaChat({ model, temperature, messages: convo });
    finalText = data?.message?.content ?? "";
  }

  // Zrodla z lokalnego wyszukiwania (URL-e) — ten sam ksztalt co przy Anthropic.
  return { text: finalText, toolCalls, sources: ctx.sources };
}
