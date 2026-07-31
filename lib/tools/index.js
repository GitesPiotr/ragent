import { calculator } from "./calculator";
import { datetime } from "./datetime";
import { webSearch } from "./web_search";
import { webSearchLocal } from "./web_search_local";

// Rejestr narzedzi. Dodanie kolejnego narzedzia = dopisanie jednego
// obiektu tutaj (i pliku z definicja).
//
// UWAGA — „Wyszukiwanie w internecie” to JEDEN przelacznik w UI (id "web_search"),
// ale DWA mechanizmy pod spodem, wybierane po providerze agenta:
//   - anthropic -> webSearch (providerSide, server tool Anthropic),
//   - ollama    -> webSearchLocal (nasze narzedzie, przez lib/search).
export const TOOLS = {
  [calculator.id]: calculator,
  [datetime.id]: datetime,
  [webSearch.id]: webSearch,
  [webSearchLocal.id]: webSearchLocal,
};

// Wspolny limit rund tool-use dla WSZYSTKICH dostawcow (Anthropic, Ollama…),
// zeby nie wpasc w nieskonczona petle. Jedno zrodlo prawdy.
export const MAX_TOOL_ITERATIONS = 5;

// Narzedzia WYKONYWANE LOKALNIE (maja execute/input_schema) i DOZWOLONE dla
// danego dostawcy. Pomijamy narzedzia dostawcy (providerSide, np. web_search)
// oraz narzedzia wymagajace innego dostawcy (requiresProvider). Dzieki temu
// np. web_search (requiresProvider: "anthropic") nigdy nie trafi do Ollamy.
function enabledLocalTools(enabledIds = [], provider) {
  return enabledIds
    .map((id) => TOOLS[id])
    .filter(Boolean)
    .filter((t) => !t.providerSide)
    .filter((t) => !t.requiresProvider || t.requiresProvider === provider);
}

// Definicje narzedzi lokalnych w formacie Anthropic (name/description/input_schema).
export function getToolDefsForAnthropic(enabledIds = []) {
  return enabledLocalTools(enabledIds, "anthropic").map(
    ({ name, description, input_schema }) => ({
      name,
      description,
      input_schema,
    }),
  );
}

// Format narzedzia "function calling" — wspolny dla Ollamy i OpenAI.
// Oba API oczekuja dokladnie tego samego ksztaltu, wiec jedna funkcja
// obsluguje obu dostawcow (Anthropic ma wlasny format: name/input_schema).
function toFunctionDef({ name, description, input_schema }) {
  return {
    type: "function",
    function: { name, description, parameters: input_schema },
  };
}

// Definicje narzedzi lokalnych w formacie Ollamy. Dodatkowo: jesli wlaczony jest
// przelacznik "web_search", dla Ollamy dokladamy LOKALNE narzedzie wyszukiwania
// (web_search_local) — to samo jedno ustawienie, inny mechanizm niz Anthropic.
export function getToolDefsForOllama(enabledIds = []) {
  const defs = enabledLocalTools(enabledIds, "ollama").map(toFunctionDef);
  if (enabledIds.includes("web_search")) {
    defs.push(toFunctionDef(webSearchLocal));
  }
  return defs;
}

// Definicje narzedzi lokalnych w formacie OpenAI (identycznym co Ollama).
// Zakres: calculator + datetime. Wyszukiwanie w internecie NIE trafia tutaj —
// web_search wymaga Anthropic (server tool), a web_search_local wymaga Ollamy;
// enabledLocalTools odfiltrowuje oba po requiresProvider. UI (ToolsSection)
// wyszarza wtedy przelacznik wyszukiwania z czytelna notka.
export function getToolDefsForOpenAI(enabledIds = []) {
  return enabledLocalTools(enabledIds, "openai").map(toFunctionDef);
}

// Czy dany identyfikator to narzedzie wykonywane po stronie dostawcy.
export function isProviderTool(id) {
  return Boolean(TOOLS[id]?.providerSide);
}

// Dostawca wymagany przez narzedzie (np. web_search -> "anthropic") albo null.
export function toolRequiresProvider(id) {
  return TOOLS[id]?.requiresProvider || null;
}

// Wykonuje narzedzie po nazwie. Bledy zwracamy jako tekst wyniku,
// zeby model mogl sie z nich wycofac zamiast wywracac cala petle.
//
// ctx — kontekst zadania { user, agent, sources }, skladany w jednym miejscu
// (app/api/chat/route.js) i przepuszczany przez lib/providers/index.js do
// wszystkich trzech dostawcow. PELNY OPIS KONTRAKTU: lib/tools/calculator.js.
//
// Domyslka {} zostaje dla wolan spoza trasy czatu — narzedzie, ktore potrzebuje
// ctx.user, ma sprawdzic jego obecnosc i zwrocic czytelny tekst, a nie zakladac.
export async function executeTool(name, input, ctx = {}) {
  const tool = TOOLS[name];
  if (!tool) {
    return `Nieznane narzędzie: ${name}`;
  }
  // Bezpiecznik: narzedzia dostawcy wykonuje Anthropic po swojej stronie —
  // nigdy nie uruchamiamy ich lokalnie.
  if (tool.providerSide) {
    return `Narzędzie ${name} jest wykonywane po stronie dostawcy i nie powinno być uruchamiane lokalnie.`;
  }
  try {
    return await tool.execute(input || {}, ctx);
  } catch (e) {
    return `Błąd narzędzia ${name}: ${e.message}`;
  }
}
