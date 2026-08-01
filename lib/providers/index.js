import { sendChatAnthropic } from "./anthropic";
import { sendChatOllama } from "./ollama";
import { sendChatOpenAI } from "./openai";
import { sendChatOpenRouter } from "./openrouter";

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
  // KONTEKST NARZEDZI — { user, agent, sources }. Sklada go WOLAJACY
  // (app/api/chat/route.js), a ta warstwa tylko przepuszcza go w dol.
  // Domyslka istnieje dla wolan bez narzedzi (mentor), zeby dostawcy zawsze
  // mieli gdzie odlozyc `sources` i nie musieli sprawdzac, czy ctx istnieje.
  ctx = { sources: [] },
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
        ctx,
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
        ctx,
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
        ctx,
      });

    case "openrouter":
      // Brama do modeli wielu dostawcow pod jednym kluczem. API zgodne z OpenAI,
      // wiec petla tool-use ma ten sam ksztalt — ale implementacja jest OSOBNA,
      // nie parametryzacja openai.js: rozni sie adresem, naglowkami rankingowymi,
      // obsluga 402 (brak srodkow) i tym, ze temperatura idzie zawsze, gdy
      // podano (katalog jest dynamiczny, wiec kazdy model bylby „nieznany").
      //
      // Wyszukiwanie w internecie NIE dziala: web_search wymaga Anthropic
      // (server tool), web_search_local wymaga Ollamy — oba odfiltrowuje
      // warstwa tools po requiresProvider, a UI wyszarza przelacznik.
      return sendChatOpenRouter({
        model,
        temperature,
        system,
        messages,
        tools,
        onEvent,
        responseFormat,
        ctx,
      });

    default: {
      const err = new Error(`Nieznany dostawca: ${provider}`);
      err.code = "unknown_provider";
      throw err;
    }
  }
}
