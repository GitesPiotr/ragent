// Lista dostepnych modeli per dostawca.
// Trzymana osobno, zeby latwo bylo aktualizowac oferte modeli
// bez dotykania kodu formularza ani warstwy proxy.
//
// UWAGA: wartosci wg stanu na lipiec 2026, zweryfikowane wzgledem API.
//
// supportsTemperature = czy dany model przyjmuje parametr `temperature`.
//   - Nowe modele Anthropic (Opus 4.8, Sonnet 5) NIE przyjmuja temperature
//     i zwracaja blad 400, jesli zostanie wyslana -> false.
//   - Haiku 4.5 nadal obsluguje temperature -> true.
//   - Modele OpenAI (GPT) przyjmuja temperature -> true.
//   Ta flaga jest jedynym zrodlem prawdy: suwak w UI i warstwa proxy
//   czytaja z niej, zeby dodanie nowego modelu bylo zmiana tylko tutaj.
//
// verified = czy dany model zostal FAKTYCZNIE sprawdzony w tej aplikacji
//   (realne wywolanie API, ktore zwrocilo odpowiedz).
//   - Modele Anthropic: sprawdzone w dzialajacej aplikacji -> true.
//   - Modele OpenAI: podlaczone „na slepo", bez klucza i bez ani jednego
//     realnego wywolania -> false. UI pokazuje przy nich ostrzezenie.
//     Po pierwszym udanym wywolaniu wystarczy zmienic te flage na true.
//
// requiresKey = nazwa zmiennej srodowiskowej z kluczem dla danego dostawcy.
//   UI podpowiada ja uzytkownikowi, gdy klucza brakuje.

export const PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Lokalny (Ollama)" },
];

export const MODELS_BY_PROVIDER = {
  anthropic: [
    {
      id: "claude-opus-4-8",
      label: "Claude Opus 4.8 (najmocniejszy)",
      supportsTemperature: false,
      verified: true,
      requiresKey: "ANTHROPIC_API_KEY",
    },
    {
      id: "claude-sonnet-5",
      label: "Claude Sonnet 5 (zbalansowany)",
      supportsTemperature: false,
      verified: true,
      requiresKey: "ANTHROPIC_API_KEY",
    },
    {
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5 (szybki, tani)",
      supportsTemperature: true,
      verified: true,
      requiresKey: "ANTHROPIC_API_KEY",
    },
  ],
  // UWAGA: identyfikatory modeli OpenAI NIE zostaly zweryfikowane wzgledem
  // API (brak klucza). Jesli sa nieaktualne, pierwsze wywolanie zwroci blad
  // „model nie istnieje" z czytelnym komunikatem — poprawka to zmiana `id` tutaj.
  openai: [
    {
      id: "gpt-5.6-sol",
      label: "GPT-5.6 Sol (najmocniejszy)",
      supportsTemperature: true,
      verified: false,
      requiresKey: "OPENAI_API_KEY",
    },
    {
      id: "gpt-5.6-terra",
      label: "GPT-5.6 Terra (zbalansowany)",
      supportsTemperature: true,
      verified: false,
      requiresKey: "OPENAI_API_KEY",
    },
    {
      id: "gpt-5.6-luna",
      label: "GPT-5.6 Luna (szybki, tani)",
      supportsTemperature: true,
      verified: false,
      requiresKey: "OPENAI_API_KEY",
    },
  ],
  // Ollama: lista NIE jest wpisana na sztywno - modele pochodzia dynamicznie
  // z lokalnej instalacji Ollamy (endpoint /api/models -> /api/tags Ollamy).
  ollama: [],
};

// Pomocnik: zwraca liste modeli dla danego providera (pusta, jesli nieznany).
export function getModelsForProvider(provider) {
  return MODELS_BY_PROVIDER[provider] ?? [];
}

// Pomocnik: zwraca obiekt konkretnego modelu (albo null).
export function getModelInfo(provider, modelId) {
  return getModelsForProvider(provider).find((m) => m.id === modelId) ?? null;
}

// Pomocnik: czy dany model przyjmuje parametr temperature.
export function modelSupportsTemperature(provider, modelId) {
  // Lokalne modele Ollamy wspieraja temperature niezaleznie od modelu.
  if (provider === "ollama") return true;
  return getModelInfo(provider, modelId)?.supportsTemperature ?? false;
}
