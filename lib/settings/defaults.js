// JEDNO źródło prawdy dla ustawień aplikacji (na razie per-przeglądarka).
// Gdy dojdzie logowanie, przechowywanie przeniesiemy do bazy per użytkownik —
// zmiana ograniczy się do warstwy lib/settings (store.js / SettingsContext.js),
// a komponenty (czytające przez useSettings) zostaną bez zmian.

export const SETTINGS_STORAGE_KEY = "aideas:settings";
export const SETTINGS_VERSION = 1;

export const THEMES = ["light", "dark", "auto"];

// Rozsądny zakres limitu znaków wiedzy doklejanej do promptu (walidowany też
// po stronie serwera). Domyślnie 24000 — tyle było wcześniej na sztywno.
export const KNOWLEDGE_LIMIT_MIN = 2000;
export const KNOWLEDGE_LIMIT_MAX = 100000;
export const KNOWLEDGE_LIMIT_DEFAULT = 24000;

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

// Dostawcy dostępni jako DOMYŚLNY dostawca nowego agenta (statyczne listy modeli).
// Ollamę pomijamy tu celowo — jej modele są dynamiczne (per instalacja).
export const DEFAULT_AGENT_PROVIDERS = ["anthropic", "openai"];

export const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,

  // Połączenia
  ollamaUrl: DEFAULT_OLLAMA_URL,

  // Wygląd
  //
  // DOMYŚLNIE CIEMNY, NIE „auto" — decyzja produktowa, nie techniczna.
  // Aplikacja ma startować ciemna u każdego, kto sam nic nie wybrał, także
  // wtedy, gdy system prosi o jasny. „auto" zostaje w THEMES i w przełączniku
  // jako wybór świadomy, przestaje być tylko wartością zastaną.
  //
  // CZEGO TA ZMIANA NIE RUSZA: zapisanego wyboru. sanitizeSettings startuje od
  // DEFAULT_SETTINGS i nadpisuje motyw wartością z localStorage (store.js:70),
  // więc kto ma zapisane `light` albo `auto`, zostaje przy swoim.
  //
  // PUŁAPKA DLA CZYTAJĄCEGO ZA PÓŁ ROKU: writeSettings zapisuje CAŁY obiekt
  // ustawień, więc `theme: "auto"` leży w localStorage także u kogoś, kto
  // motywu nigdy nie dotknął, a zmienił cokolwiek innego. Taka osoba nowej
  // domyślki NIE dostanie. Odróżnienia „wybrał auto" od „nigdy nie wybierał"
  // dziś nie ma i bez osobnego pola albo bramki na SETTINGS_VERSION nie będzie.
  theme: "dark", // "light" | "dark" | "auto"
  showDebugPanel: false,

  // Mentor
  mentorModel: "claude-haiku-4-5",
  autoOpenMentor: false,

  // Domyślne nowego agenta
  defaultProvider: "anthropic",
  defaultModel: "claude-haiku-4-5",
  defaultTemperature: 0.7,
  knowledgeCharLimit: KNOWLEDGE_LIMIT_DEFAULT,
};
