// Implementacja gałęzi OpenRouter — brama do wielu dostawców pod jednym kluczem.
//
// API jest ZGODNE Z OPENAI (/v1/chat/completions, ten sam kształt żądania,
// odpowiedzi i function callingu), więc kształt tego pliku pochodzi z
// lib/providers/openai.js. Zgodność nie jest jednak tożsamością i dwie rzeczy
// zostały tu ROZSTRZYGNIĘTE INACZEJ — uzasadnienie przy każdej.
//
// ================================================================================
//  CO ZOSTAŁO POTWIERDZONE NA ŻYWYM API, A CO NIE
//
//  Ten plik NIE jest kopią openai.js także dlatego, że tamten nigdy nie wykonał
//  ani jednego realnego wywołania (jego własny nagłówek, wiersze 1-10, oraz
//  /api/providers/status → openai.configured === false). Przeniesienie go w
//  całości oznaczałoby przeniesienie cudzych domysłów i podpisanie się pod nimi.
//
//  POTWIERDZONE realnym wywołaniem przez /api/chat (runda 2):
//    • adres, komplet nagłówków i uwierzytelnienie Bearer — odpowiedź 200,
//    • `max_tokens` jako nazwa limitu tokenów — żądanie przeszło bez błędu,
//    • kształt odpowiedzi: choices[0].message.content,
//    • pętla tool-use: tool_calls z argumentami jako STRING JSON, wynik
//      odsyłany rolą "tool" z tool_call_id, druga runda zwraca tekst końcowy.
//      Sprawdzone na kalkulatorze ORAZ na rag_search (pełna ścieżka do
//      lib/rag/, ze źródłami i numerem paragrafu w odpowiedzi),
//    • `temperature` trafia do ciała żądania — dowód wprost: wartość 5
//      wraca błędem „Expected temperature to be at most 2, received 5",
//      czyli API ją czyta, a nie ignoruje,
//    • gałąź 400 (`openrouter_bad_request`) — zmierzona dwukrotnie:
//      zły identyfikator modelu i temperatura spoza zakresu,
//    • gałąź 404 (`openrouter_model_not_found`) — zmierzona na modelach,
//      które są w katalogu, ale konto nie ma do nich dostępu.
//
//  NIESPODZIANKA WARTA ZAPAMIĘTANIA PRZED KATALOGIEM (runda 3):
//    OpenRouter zwraca 400, a NIE 404, gdy identyfikator modelu jest
//    niepoprawny składniowo („… is not a valid model ID”). 404 dotyczy
//    modeli istniejących, do których nie ma dostępu. Obie gałęzie są więc
//    potrzebne i znaczą co innego.
//
//  NIEPOTWIERDZONE (nie dało się wywołać bez psucia konfiguracji):
//    • mapowanie 401 (zły klucz) i 402 (brak środków) — kształt ciała błędu
//      z dokumentacji OpenRouter, nie ze zmierzonej odpowiedzi,
//    • 429 (limit zapytań) — nie udało się wywołać,
//    • `response_format` (structured outputs) — dziś nieużywane, bo jedyny
//      wołający z tym parametrem to mentor, przypięty do Anthropic
//      (MENTOR_PROVIDER w lib/config/mentor.js).
// ================================================================================
import {
  getToolDefsForOpenRouter,
  executeTool,
  MAX_TOOL_ITERATIONS,
} from "@/lib/tools";
import {
  OPENROUTER_TITLE,
  OPENROUTER_REFERER,
} from "./openrouter-naglowki.js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const MAX_OUTPUT_TOKENS = 4096;

// Naglowki rankingowe (HTTP-Referer, X-Title) i strażnik ich poprawności siedzą
// w osobnym module — patrz komentarz w openrouter-naglowki.js. Krótko: X-Title
// spoza ASCII wywraca `fetch` wyjątkiem nie do odróżnienia od awarii sieci,
// a testowalność tego wymaga pliku bez aliasów `@/`.

// Zamienia odpowiedź błędu OpenRoutera na wyjątek z czytelnym komunikatem.
// Kody (`err.code`) mapuje na statusy HTTP app/api/chat/route.js.
//
// PRZENIESIONE Z openai.js ŚWIADOMIE, ale nie w całości: doszedł 402
// (brak środków), którego OpenAI nie zwraca, a który u bramy płatnej jest
// najczęstszą przyczyną nagłego przerwania działania. Komunikaty mówią
// o OpenRouterze, nie o OpenAI — użytkownik ma wiedzieć, gdzie zajrzeć.
function errorFromResponse(status, bodyText) {
  const message = extractApiMessage(bodyText);

  if (status === 401) {
    const err = new Error(
      "Nieprawidłowy klucz API OpenRouter (OPENROUTER_API_KEY). Sprawdź wartość w .env.local.",
    );
    err.code = "openrouter_auth";
    return err;
  }
  if (status === 402) {
    const err = new Error(
      "Brak środków na koncie OpenRouter. Doładuj konto albo wybierz tańszy model.",
    );
    err.code = "openrouter_no_credits";
    return err;
  }
  if (status === 404) {
    const err = new Error(
      "Wybrany model nie istnieje w OpenRouterze lub nie masz do niego dostępu. " +
        "Sprawdź identyfikator modelu (np. anthropic/claude-haiku-4.5).",
    );
    err.code = "openrouter_model_not_found";
    return err;
  }
  if (status === 429) {
    const err = new Error(
      "Przekroczono limit zapytań OpenRoutera. Spróbuj ponownie za chwilę.",
    );
    err.code = "openrouter_rate_limit";
    return err;
  }
  if (status === 400) {
    const err = new Error(`Nieprawidłowe zapytanie do API OpenRouter: ${message}`);
    err.code = "openrouter_bad_request";
    return err;
  }

  const err = new Error(`Błąd API OpenRouter (HTTP ${status}). ${message}`.trim());
  err.code = "openrouter_error";
  return err;
}

// Wyciąga czytelny opis błędu z odpowiedzi ({ error: { message } }).
function extractApiMessage(bodyText) {
  try {
    const data = JSON.parse(bodyText);
    return data?.error?.message || bodyText.slice(0, 300);
  } catch {
    return (bodyText || "").slice(0, 300);
  }
}

// Jedno wywołanie /v1/chat/completions.
async function openrouterChat({ apiKey, body }) {
  let res;
  try {
    res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": OPENROUTER_REFERER,
        "X-Title": OPENROUTER_TITLE,
      },
      body: JSON.stringify(body),
    });
  } catch {
    const err = new Error(
      "Nie można połączyć się z API OpenRouter. Sprawdź połączenie z internetem.",
    );
    err.code = "openrouter_unavailable";
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw errorFromResponse(res.status, text);
  }

  return res.json();
}

// Parsuje argumenty narzędzia. Tak jak OpenAI, OpenRouter oddaje je jako STRING
// z JSON-em — POTWIERDZONE na żywym wywołaniu kalkulatora. Defensywnie
// przyjmujemy też obiekt, bo za bramą stoją modele różnych dostawców.
function parseToolArguments(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string") return {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

// Implementacja gałęzi OpenRouter z pętlą tool-use.
// Klucz API czytany WYŁĄCZNIE po stronie serwera (process.env).
//
// Parametry i zwrotka są IDENTYCZNE jak w pozostałych trzech dostawcach, żeby
// lib/providers/index.js i trasy API nie musiały wiedzieć, kto obsługuje żądanie.
//
// Zwraca { text, toolCalls, sources }:
// - sources: WYŁĄCZNIE z ctx, czyli od narzędzi wykonywanych lokalnie.
//   OpenRouter nie zwraca cytowań — wyszukiwanie w internecie jest dostępne
//   tylko dla Anthropic (server tool) i Ollamy (nasze narzędzie lokalne).
export async function sendChatOpenRouter({
  model,
  temperature,
  system,
  messages,
  tools = [],
  onEvent,
  responseFormat,
  // Kontekst narzędzi { user, agent, db, sources } — składa go app/api/chat/route.js.
  ctx = { sources: [] },
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    const err = new Error(
      "Klucz OpenRouter nie jest skonfigurowany — dodaj OPENROUTER_API_KEY w .env.local",
    );
    // Ten sam kod co u pozostałych dostawców: app/api/chat/route.js już go mapuje.
    err.code = "no_api_key";
    throw err;
  }

  const toolDefs = getToolDefsForOpenRouter(tools);

  // System prompt jako pierwsza wiadomość roli "system".
  const convo = [];
  if (system) convo.push({ role: "system", content: system });
  for (const m of messages) convo.push({ role: m.role, content: m.content });

  const baseParams = { model, max_tokens: MAX_OUTPUT_TOKENS };

  // ================================================================================
  //  DLACZEGO NIE MA TU FALLBACKU max_completion_tokens → max_tokens
  //
  //  openai.js:117-139 ma dwustopniową próbę: wysyła nowszą nazwę parametru,
  //  a przy błędzie 400 wskazującym na nazwę ponawia ze starszą. To rozwiązanie
  //  DOMYSŁU — jego autor nie miał klucza i sam oznaczył je NIEZWERYFIKOWANE.
  //
  //  Tutaj domysłu nie ma: OpenRouter dokumentuje `max_tokens` i realne
  //  wywołanie z tą nazwą przeszło (odpowiedź 200, treść niepusta). Kopiowanie
  //  gałęzi ponawiającej znaczyłoby przeniesienie martwego kodu, który przy
  //  pierwszej awarii 400 zrobiłby dodatkowe, niepotrzebne żądanie i zamazał
  //  prawdziwą przyczynę błędu.
  // ================================================================================

  // TEMPERATURA IDZIE ZAWSZE, GDY JĄ PODANO.
  //
  // U pozostałych dostawców decyduje modelSupportsTemperature(), które dla
  // nieznanego modelu zwraca false (lib/config/models.js:100). Katalog
  // OpenRoutera jest DYNAMICZNY — statyczna lista jest pusta do rundy 3 —
  // więc każdy model byłby „nieznany" i temperatura znikałaby po cichu.
  // Model, który jej nie przyjmuje, odrzuci żądanie z czytelnym błędem;
  // to jest lepsze niż agent ustawiony na 0.2 odpowiadający jak przy 1.0
  // bez śladu w interfejsie. Ta sama zasada co przy Ollamie (models.js:99).
  if (typeof temperature === "number") {
    baseParams.temperature = temperature;
  }

  if (toolDefs.length > 0) {
    baseParams.tools = toolDefs;
  }
  // NIEPOTWIERDZONE — patrz nagłówek pliku. Zaimplementowane dla zgodności
  // sygnatury sendChat; dziś nie ma wołającego, który by to przekazał.
  if (responseFormat) {
    baseParams.response_format = toOpenRouterResponseFormat(responseFormat);
  }

  const toolCalls = [];
  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await openrouterChat({
      apiKey,
      body: { ...baseParams, messages: convo },
    });

    const choice = data?.choices?.[0];
    const msg = choice?.message || {};
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    // Brak wywołań narzędzi → mamy końcową odpowiedź tekstową.
    if (calls.length === 0) {
      finalText = msg.content ?? "";
      break;
    }

    // Model chce użyć narzędzi. Zachowujemy PEŁNĄ turę asystenta (z tool_calls).
    convo.push(msg);

    for (const call of calls) {
      const name = call?.function?.name;
      const args = parseToolArguments(call?.function?.arguments);

      // Ten sam kształt zdarzenia co u pozostałych → UI działa bez zmian.
      if (onEvent) onEvent({ type: "tool-call", tool: name });

      const result = await executeTool(name, args, ctx);
      toolCalls.push({ tool: name, input: args, result });

      convo.push({
        role: "tool",
        tool_call_id: call?.id,
        content: String(result),
      });
    }
  }

  // Zabezpieczenie: wyczerpano limit iteracji bez tekstu → jedno wywołanie
  // BEZ narzędzi, żeby użytkownik cokolwiek dostał.
  if (!finalText) {
    const params = { ...baseParams, messages: convo };
    delete params.tools;
    const data = await openrouterChat({ apiKey, body: params });
    finalText = data?.choices?.[0]?.message?.content ?? "";
  }

  return {
    text: finalText,
    toolCalls,
    sources: Array.isArray(ctx.sources) ? ctx.sources : [],
  };
}

// Schemat structured output z kształtu Anthropic ({ type, schema }) na kształt
// OpenAI/OpenRouter ({ type, json_schema: { name, schema, strict } }).
// NIEPOTWIERDZONE — patrz nagłówek pliku.
function toOpenRouterResponseFormat(responseFormat) {
  if (responseFormat?.type !== "json_schema" || !responseFormat.schema) {
    return responseFormat;
  }
  return {
    type: "json_schema",
    json_schema: {
      name: responseFormat.name || "response",
      schema: responseFormat.schema,
      strict: true,
    },
  };
}
