// Narzedzie: Wyszukiwanie w internecie.
//
// UWAGA — to narzedzie dziala INACZEJ niz calculator/datetime:
//  - calculator i datetime wykonuje NASZ serwer (maja execute + input_schema),
//  - web_search to narzedzie SERWEROWE dostawcy (Anthropic). Przekazujemy jego
//    definicje w wywolaniu API, a Anthropic wykonuje wyszukiwanie po swojej
//    stronie i zwraca wynik wraz z cytowaniami. Nasza petla tool-use NIE moze
//    probowac wykonac go lokalnie — rozpoznaje je po fladze providerSide i
//    pomija w executeTool. Definicje tool-a (aktualny typ) dodaje warstwa
//    lib/providers/anthropic.js.
//
// Dziala tylko z modelami Anthropic (Claude) — stad requiresProvider.
export const webSearch = {
  id: "web_search",
  name: "web_search",
  // Wykonywane po stronie dostawcy — petla tool-use go NIE uruchamia.
  providerSide: true,
  requiresProvider: "anthropic",
  label: "Wyszukiwanie w internecie",
  description:
    "Wyszukiwanie w internecie po stronie Anthropic (Claude). Agent sięga po " +
    "aktualne informacje z sieci i podaje źródła. Uwaga: każde wyszukanie to " +
    "dodatkowa opłata u dostawcy — włączaj świadomie, nie każdemu agentowi.",
  // Brak input_schema/execute — narzedzia dostawcy nie definiujemy jak wlasnych.
};
