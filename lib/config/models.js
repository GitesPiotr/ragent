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
  { id: "openrouter", label: "OpenRouter" },
  { id: "ollama", label: "Lokalny (Ollama)" },
];

// =============================================================================
//  NAZWA ZMIENNEJ SRODOWISKOWEJ Z KLUCZEM — PER DOSTAWCA, NIE PER MODEL.
//
//  Pole `requiresKey` nizej odpowiada na to samo pytanie, ale siedzi PRZY
//  MODELU — a listy OpenRoutera i Ollamy sa puste, wiec dla nich nie ma go
//  gdzie przeczytac. Pytanie „jakiego klucza wymaga ten dostawca" trzeba bylo
//  wiec odpowiadac osobno w kazdym miejscu, ktore je zadaje (trasa
//  /api/providers/status ma wlasna kopie trzech nazw).
//
//  Tu stoi jedna odpowiedz. `null` przy Ollamie NIE jest brakiem danych:
//  modele lokalne dzialaja bez klucza i to jest fakt o dostawcy.
//
//  TA MAPA NIE CZYTA `process.env` I NIE MOZE ZACZAC. Modul importuje kod
//  KLIENCKI (ModelSection.js), a klucze sa wylacznie serwerowe — tu sa same
//  NAZWY zmiennych, odczyt nalezy do wolajacego po stronie serwera.
// =============================================================================
export const KLUCZ_DOSTAWCY = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  ollama: null,
};

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
  // OpenRouter: lista pusta CELOWO, tak jak przy Ollamie — katalog jest
  // dynamiczny i przyjdzie z API OpenRoutera. Do tego czasu dostawca dziala,
  // ale model trzeba wpisac recznie (np. "anthropic/claude-haiku-4.5").
  openrouter: [],
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
//
// DOSTAWCY Z DYNAMICZNYM KATALOGIEM ODPOWIADAJA „TAK", I TO JEST SWIADOME.
// Dla nieznanego modelu ostatnia linia zwraca `false`, czyli temperatura
// NIE POLECI — po cichu, bez sladu w interfejsie. Przy statycznej liscie
// (Anthropic, OpenAI) to zachowanie jest poprawne: model spoza listy
// i tak nie istnieje. Przy Ollamie i OpenRouterze lista jest pusta albo
// budowana w locie, wiec KAZDY model bylby „nieznany" i agent ustawiony
// na temperature 0.2 odpowiadalby jak przy 1.0, a uzytkownik nie mialby
// jak sie o tym dowiedziec.
//
// Odrzucone zadanie z czytelnym bledem jest lepsze niz ustawienie, ktore
// wyglada na dzialajace i nie dziala.
export function modelSupportsTemperature(provider, modelId) {
  if (provider === "ollama") return true;
  if (provider === "openrouter") return true;
  return getModelInfo(provider, modelId)?.supportsTemperature ?? false;
}
