import { sendChatAnthropic } from "./anthropic";
import { sendChatOllama } from "./ollama";

// Cienka abstrakcja nad dostawcami modeli.
// Na podstawie `provider` wybiera implementacje.
// Dodanie OpenAI w przyszlosci = dopisanie jednej galezi ponizej,
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

    case "openai": {
      // Sesja 3 obejmuje tylko Anthropic. Jawny placeholder z czytelnym bledem.
      const err = new Error(
        "OpenAI jeszcze niepodłączone (Sesja 3 obejmuje tylko Anthropic).",
      );
      err.code = "provider_not_implemented";
      throw err;
    }

    default: {
      const err = new Error(`Nieznany dostawca: ${provider}`);
      err.code = "unknown_provider";
      throw err;
    }
  }
}
