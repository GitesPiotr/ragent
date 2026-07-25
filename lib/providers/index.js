import { sendChatAnthropic } from "./anthropic";
import { sendChatOllama } from "./ollama";
import { sendChatOpenAI } from "./openai";

// Cienka abstrakcja nad dostawcami modeli.
// Na podstawie `provider` wybiera implementacje.
// Dodanie kolejnego dostawcy = dopisanie jednej galezi ponizej,
// bez ruszania reszty aplikacji.
export async function sendChat({
  provider,
  model,
  temperature,
  system,
  messages,
  tools = [],
  onEvent,
  responseFormat,
}) {
  switch (provider) {
    case "anthropic":
      // Tool-use (Sesja 4) dziala tylko dla Anthropic.
      return sendChatAnthropic({
        model,
        temperature,
        system,
        messages,
        tools,
        onEvent,
        responseFormat,
      });

    case "ollama":
      // Ollama z petla tool-use (calculator/datetime). web_search jest
      // odfiltrowany w warstwie tools (providerSide) i tu nie trafia.
      return sendChatOllama({
        model,
        temperature,
        system,
        messages,
        tools,
        onEvent,
      });

    case "openai":
      // Petla tool-use (calculator/datetime). Wyszukiwanie w internecie NIE
      // dziala dla OpenAI — jest odfiltrowane w warstwie tools (requiresProvider).
      //
      // UWAGA: implementacja NIEPRZETESTOWANA na zywym API (powstala bez klucza).
      // Brak OPENAI_API_KEY konczy sie czytelnym komunikatem, nie crashem.
      return sendChatOpenAI({
        model,
        temperature,
        system,
        messages,
        tools,
        onEvent,
        responseFormat,
      });

    default: {
      const err = new Error(`Nieznany dostawca: ${provider}`);
      err.code = "unknown_provider";
      throw err;
    }
  }
}
