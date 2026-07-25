// Implementacja gałęzi OpenAI (modele GPT).
//
// UWAGA — KOD NIEPRZETESTOWANY NA ŻYWO. Powstał bez dostępu do klucza OpenAI:
// pętla tool-use i ścieżka „brak klucza" są sprawdzone testami offline (atrapa
// fetch), ale ŻADNE realne wywołanie API nigdy się nie odbyło. Miejsca, których
// nie dało się zweryfikować, są oznaczone komentarzem NIEZWERYFIKOWANE.
//
// Wzorzec skopiowany z lib/providers/anthropic.js (sygnatura, kształt pętli,
// onEvent, bezpiecznik iteracji) i przetłumaczony na API OpenAI. Bez SDK —
// czysty fetch, tak samo jak lib/providers/ollama.js.
import { modelSupportsTemperature } from "@/lib/config/models";
import {
  getToolDefsForOpenAI,
  executeTool,
  MAX_TOOL_ITERATIONS,
} from "@/lib/tools";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Limit dlugosci odpowiedzi — odpowiednik max_tokens z Anthropic.
const MAX_OUTPUT_TOKENS = 4096;

// NIEZWERYFIKOWANE: nowsze modele OpenAI wymagaja `max_completion_tokens`,
// starsze przyjmuja wylacznie `max_tokens`. Nie mamy jak sprawdzic, ktora
// nazwa obowiazuje dla modeli z lib/config/models.js, wiec wysylamy nowsza,
// a przy bledzie 400 wskazujacym na ten parametr ponawiamy raz ze starsza.
const TOKEN_PARAM_NEW = "max_completion_tokens";
const TOKEN_PARAM_OLD = "max_tokens";

// Zamienia odpowiedz bledu OpenAI na wyjatek z czytelnym polskim komunikatem.
// Kody (`err.code`) sa mapowane na statusy HTTP w app/api/chat/route.js.
function errorFromResponse(status, bodyText) {
  const message = extractApiMessage(bodyText);

  if (status === 401) {
    const err = new Error(
      "Nieprawidłowy klucz API OpenAI (OPENAI_API_KEY). Sprawdź wartość w .env.local.",
    );
    err.code = "openai_auth";
    return err;
  }
  if (status === 404) {
    const err = new Error(
      "Wybrany model OpenAI nie istnieje lub nie masz do niego dostępu. " +
        "Sprawdź listę modeli na swoim koncie OpenAI.",
    );
    err.code = "openai_model_not_found";
    return err;
  }
  if (status === 429) {
    const err = new Error(
      "Przekroczono limit zapytań OpenAI lub brak środków na koncie. " +
        "Spróbuj ponownie za chwilę.",
    );
    err.code = "openai_rate_limit";
    return err;
  }
  if (status === 400) {
    const err = new Error(`Nieprawidłowe zapytanie do API OpenAI: ${message}`);
    err.code = "openai_bad_request";
    return err;
  }

  const err = new Error(
    `Błąd API OpenAI (HTTP ${status}). ${message}`.trim(),
  );
  err.code = "openai_error";
  return err;
}

// Wyciaga czytelny opis bledu z odpowiedzi ({ error: { message } }).
// Gdy odpowiedz nie jest JSON-em, oddaje surowy tekst (przyciety).
function extractApiMessage(bodyText) {
  try {
    const data = JSON.parse(bodyText);
    return data?.error?.message || bodyText.slice(0, 300);
  } catch {
    return (bodyText || "").slice(0, 300);
  }
}

// Czy blad 400 dotyczy nazwy parametru limitu tokenow (patrz TOKEN_PARAM_*).
function isTokenParamError(bodyText) {
  return /max_completion_tokens|max_tokens/i.test(bodyText || "");
}

// Jedno wywolanie /v1/chat/completions. Bledy sieci/serwera zamieniamy na
// czytelne wyjatki z kodem — tak samo jak ollamaChat w ollama.js.
async function openaiChat({ apiKey, body }) {
  let res;
  try {
    res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    const err = new Error(
      "Nie można połączyć się z API OpenAI. Sprawdź połączenie z internetem.",
    );
    err.code = "openai_unavailable";
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw errorFromResponse(res.status, text);
  }

  return res.json();
}

// Wywolanie z jednorazowa proba naprawy nazwy parametru limitu tokenow.
async function openaiChatWithTokenFallback({ apiKey, body, tokenParam }) {
  try {
    return await openaiChat({
      apiKey,
      body: { ...body, [tokenParam.current]: MAX_OUTPUT_TOKENS },
    });
  } catch (error) {
    const retryable =
      error?.code === "openai_bad_request" &&
      tokenParam.current === TOKEN_PARAM_NEW &&
      isTokenParamError(error.message);

    if (!retryable) throw error;

    // Przelaczamy na starsza nazwe NA STALE dla tej rozmowy, zeby kolejne
    // rundy petli tool-use nie powtarzaly nieudanej proby.
    tokenParam.current = TOKEN_PARAM_OLD;
    return openaiChat({
      apiKey,
      body: { ...body, [TOKEN_PARAM_OLD]: MAX_OUTPUT_TOKENS },
    });
  }
}

// Parsuje argumenty narzedzia. OpenAI oddaje je jako STRING z JSON-em
// (w odroznieniu od Anthropic, gdzie input to gotowy obiekt).
// Defensywnie — jak w ollama.js — akceptujemy tez obiekt.
function parseToolArguments(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string") return {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

// Implementacja gałęzi OpenAI z pętlą tool-use.
// Klucz API czytany WYŁĄCZNIE po stronie serwera (process.env).
//
// Parametry i zwrotka są IDENTYCZNE jak w sendChatAnthropic, żeby warstwa
// lib/providers/index.js i trasy API nie musiały wiedzieć, który dostawca
// obsługuje żądanie.
//
// Zwraca { text, toolCalls, sources }:
// - sources: zawsze [] — OpenAI w tym trybie nie zwraca cytowań (wyszukiwanie
//   w internecie jest dostępne tylko dla Anthropic i Ollamy).
export async function sendChatOpenAI({
  model,
  temperature,
  system,
  messages,
  tools = [],
  onEvent,
  responseFormat,
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const err = new Error(
      "Klucz OpenAI nie jest skonfigurowany — dodaj OPENAI_API_KEY w .env.local",
    );
    // Ten sam kod co w anthropic.js: app/api/chat/route.js juz go mapuje
    // i przepuszcza komunikat w calosci do uzytkownika.
    err.code = "no_api_key";
    throw err;
  }

  // Narzedzia LOKALNE (calculator/datetime) w formacie function calling.
  // OpenAI nie ma u nas odpowiednika narzedzia serwerowego (web_search).
  const toolDefs = getToolDefsForOpenAI(tools);

  // System prompt idzie jako pierwsza wiadomosc z rola "system"
  // (Anthropic ma na to osobny parametr).
  const convo = [];
  if (system) convo.push({ role: "system", content: system });
  for (const m of messages) convo.push({ role: m.role, content: m.content });

  // Wspolne parametry kazdego wywolania.
  const baseParams = { model };
  if (
    modelSupportsTemperature("openai", model) &&
    typeof temperature === "number"
  ) {
    baseParams.temperature = temperature;
  }
  // Narzedzia przekazujemy TYLKO gdy agent jakies wlaczyl.
  if (toolDefs.length > 0) {
    baseParams.tools = toolDefs;
  }
  // Structured outputs. NIEZWERYFIKOWANE i obecnie NIEUZYWANE: responseFormat
  // przekazuje wylacznie mentor, a ten jest na stale na Anthropic
  // (MENTOR_PROVIDER w lib/config/mentor.js). Zaimplementowane dla zgodnosci
  // sygnatury sendChat. Anthropic: output_config.format -> OpenAI: response_format.
  if (responseFormat) {
    baseParams.response_format = toOpenAIResponseFormat(responseFormat);
  }

  // Nazwa parametru limitu tokenow — wspoldzielona przez wszystkie rundy.
  const tokenParam = { current: TOKEN_PARAM_NEW };

  const toolCalls = []; // do adnotacji w UI: co i z jakim wynikiem
  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await openaiChatWithTokenFallback({
      apiKey,
      body: { ...baseParams, messages: convo },
      tokenParam,
    });

    const choice = data?.choices?.[0];
    const msg = choice?.message || {};
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    // Brak wywolan narzedzi -> mamy koncowa odpowiedz tekstowa.
    // (finish_reason === "tool_calls" jest rownowazne calls.length > 0;
    //  sprawdzamy tablice, bo to twardsza gwarancja niz pole tekstowe.)
    if (calls.length === 0) {
      finalText = msg.content ?? "";
      break;
    }

    // Model chce uzyc narzedzi. Zachowujemy PELNA ture asystenta (z tool_calls)
    // — wymog formatu, tak samo jak przy Anthropic i Ollamie.
    convo.push(msg);

    // Wyniki narzedzi ida jako OSOBNE wiadomosci roli "tool", kazda
    // z tool_call_id (Anthropic pakuje je w jedna ture user z tool_result).
    for (const call of calls) {
      const name = call?.function?.name;
      const args = parseToolArguments(call?.function?.arguments);

      // Sygnal na zywo: narzedzie startuje. Ten sam ksztalt zdarzenia co
      // pozostali dostawcy -> UI (badge + activity) dziala bez zmian.
      if (onEvent) onEvent({ type: "tool-call", tool: name });

      const result = await executeTool(name, args);
      toolCalls.push({ tool: name, input: args, result });

      convo.push({
        role: "tool",
        tool_call_id: call?.id,
        content: String(result),
      });
    }
  }

  // Zabezpieczenie: jesli wyczerpalismy limit iteracji bez koncowego tekstu,
  // wymuszamy jedna odpowiedz BEZ narzedzi, zeby uzytkownik cos dostal.
  if (!finalText) {
    const params = { ...baseParams, messages: convo };
    delete params.tools;
    const data = await openaiChatWithTokenFallback({
      apiKey,
      body: params,
      tokenParam,
    });
    finalText = data?.choices?.[0]?.message?.content ?? "";
  }

  return { text: finalText, toolCalls, sources: [] };
}

// Tlumaczy schemat structured output z ksztaltu uzywanego przez Anthropic
// (lib/mentor/prompt.js: { type: "json_schema", schema }) na ksztalt OpenAI
// ({ type: "json_schema", json_schema: { name, schema, strict } }).
// NIEZWERYFIKOWANE — patrz komentarz przy responseFormat powyzej.
function toOpenAIResponseFormat(responseFormat) {
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
