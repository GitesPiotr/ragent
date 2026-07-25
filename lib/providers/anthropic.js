import Anthropic from "@anthropic-ai/sdk";
import { modelSupportsTemperature } from "@/lib/config/models";
import {
  getToolDefsForAnthropic,
  executeTool,
  MAX_TOOL_ITERATIONS,
} from "@/lib/tools";

// Wyszukiwanie w internecie to narzedzie SERWEROWE Anthropic. Aktualny typ (z
// dynamicznym filtrowaniem) obsluguja nowsze modele; starsze uzywaja wariantu
// podstawowego. Zweryfikowane wg dokumentacji/SDK Anthropic (nie z pamieci).
const WEB_SEARCH_DYNAMIC_MODELS = new Set([
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
]);

function webSearchToolDef(model) {
  const type = WEB_SEARCH_DYNAMIC_MODELS.has(model)
    ? "web_search_20260209"
    : "web_search_20250305";
  // name musi byc "web_search"; max_uses ogranicza liczbe wyszukan (koszt).
  return { type, name: "web_search", max_uses: 5 };
}

// Wyciaga tekst z blokow odpowiedzi (pomija bloki tool_use / thinking).
function extractText(content) {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// Zbiera zrodla z odpowiedzi: cytowania (rzeczywiscie uzyte) oraz — awaryjnie —
// pelna liste wynikow wyszukiwania. Deduplikacja po URL.
function collectSources(content, cited, results) {
  for (const block of content) {
    if (block.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        const url = c?.url;
        if (url && !cited.has(url)) {
          cited.set(url, { url, title: c.title || url });
        }
      }
    } else if (block.type === "web_search_tool_result") {
      const list = Array.isArray(block.content) ? block.content : [];
      for (const r of list) {
        if (r?.type === "web_search_result" && r.url && !results.has(r.url)) {
          results.set(r.url, { url: r.url, title: r.title || r.url });
        }
      }
    }
  }
}

// Implementacja gałęzi Anthropic z pętlą tool-use.
// Klucz API czytany WYŁĄCZNIE po stronie serwera (process.env).
//
// Parametry:
// - tools: tablica id narzedzi wlaczonych przez agenta (np. ["calculator"]
//          albo ["web_search"]). Puste -> zwykly czat.
// - onEvent: opcjonalny callback do raportowania zdarzen na zywo
//            (np. { type: "tool-call", tool: "calculator" }).
//
// Zwraca { text, toolCalls, sources }:
// - sources: [{ url, title }] — zrodla z wyszukiwania (jesli uzyto).
export async function sendChatAnthropic({
  model,
  temperature,
  system,
  messages,
  tools = [],
  onEvent,
  responseFormat,
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    const err = new Error(
      "Brak klucza API. Uzupełnij ANTHROPIC_API_KEY w pliku .env.local.",
    );
    err.code = "no_api_key";
    throw err;
  }

  const client = new Anthropic({ apiKey });

  // Narzedzia LOKALNE (calculator/datetime) — pelne definicje z input_schema.
  const toolDefs = getToolDefsForAnthropic(tools);
  // Narzedzie SERWEROWE dostawcy — dodawane osobno w formacie Anthropic.
  const webSearchOn = Array.isArray(tools) && tools.includes("web_search");

  const apiTools = [...toolDefs];
  if (webSearchOn) apiTools.push(webSearchToolDef(model));

  // Wspolne parametry kazdego wywolania.
  const baseParams = {
    model,
    max_tokens: 4096,
    system,
  };
  if (
    modelSupportsTemperature("anthropic", model) &&
    typeof temperature === "number"
  ) {
    baseParams.temperature = temperature;
  }
  // Narzedzia przekazujemy TYLKO gdy agent jakies wlaczyl (lokalne lub serwerowe).
  if (apiTools.length > 0) {
    baseParams.tools = apiTools;
  }
  // Structured outputs: wymuszenie odpowiedzi w formacie JSON wg schematu
  // (uzywane przez tryb prowadzenia mentora). Gdy brak - zachowanie bez zmian.
  if (responseFormat) {
    baseParams.output_config = { format: responseFormat };
  }

  // Kopia historii, ktora bedziemy rozszerzac o tury tool_use / tool_result.
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));

  const toolCalls = []; // do adnotacji w UI: co i z jakim wynikiem
  const citedSources = new Map(); // url -> { url, title } (cytowania)
  const resultSources = new Map(); // url -> { url, title } (wyniki wyszukiwania)
  let webSearchUsed = false;
  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      ...baseParams,
      messages: convo,
    });

    // Zbierz zrodla i wykrycie uzycia web_search z KAZDEJ odpowiedzi
    // (bloki server_tool_use / web_search_tool_result / cytowania w tekscie).
    collectSources(response.content, citedSources, resultSources);
    const usedWebSearchNow = response.content.some(
      (b) => b.type === "server_tool_use" && b.name === "web_search",
    );
    if (usedWebSearchNow && !webSearchUsed) {
      webSearchUsed = true;
      toolCalls.push({ tool: "web_search" });
      if (onEvent) onEvent({ type: "tool-call", tool: "web_search" });
    }

    // Model przekroczyl serwerowy limit rund narzedzi dostawcy -> wznawiamy.
    if (response.stop_reason === "pause_turn") {
      convo.push({ role: "assistant", content: response.content });
      continue;
    }

    // Model zakonczyl (albo nie ma narzedzi lokalnych) -> bierzemy tekst i konczymy.
    if (response.stop_reason !== "tool_use") {
      finalText = extractText(response.content);
      break;
    }

    // Model chce uzyc narzedzia LOKALNEGO. Zachowujemy PELNA tresc tury asystenta
    // (w tym bloki tool_use i ewentualne thinking) - wymog formatu.
    convo.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use",
    );

    const toolResults = [];
    for (const block of toolUseBlocks) {
      // Sygnal na zywo: narzedzie startuje.
      if (onEvent) onEvent({ type: "tool-call", tool: block.name });

      const result = await executeTool(block.name, block.input);
      toolCalls.push({ tool: block.name, input: block.input, result });

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: String(result),
      });
    }

    // Odsylamy wyniki narzedzi jako jedna tura uzytkownika.
    convo.push({ role: "user", content: toolResults });
  }

  // Zabezpieczenie: jesli wyczerpalismy limit iteracji bez koncowego tekstu,
  // wymuszamy jedna odpowiedz BEZ narzedzi, zeby uzytkownik cos dostal.
  if (!finalText) {
    const finalResponse = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      messages: convo,
    });
    finalText = extractText(finalResponse.content);
  }

  // Zrodla „uzyte": preferuj cytowania; gdy ich brak — wyniki wyszukiwania.
  const sources =
    citedSources.size > 0
      ? Array.from(citedSources.values())
      : Array.from(resultSources.values());

  return { text: finalText, toolCalls, sources };
}
