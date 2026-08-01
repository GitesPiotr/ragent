// Rejestr parametrow kreatora (uklad master-detail).
// JEDNO zrodlo prawdy: co jest karta stala, co dodawalna, jakie pojecie
// z bazy wiedzy podpiac pod pasek "Czym jest...?" i co jest juz gotowe.
//
// status:
//   "ready"   - sekcja w pelni dziala i zapisuje sie do Supabase
//   "preview" - rama wizualna bez mechanizmu; karta dostaje wtedy plakietke
//               "w przygotowaniu". OBECNIE wszystkie sekcje sa "ready" —
//               ten status zostaje dla przyszlych, jeszcze niegotowych sekcji.

export const PARAMETERS = [
  {
    id: "persona",
    label: "Osobowość",
    icon: "🎭",
    fixed: true,
    status: "ready",
    conceptIds: ["persona"],
    summary: "Kim jest agent i jak się komunikuje",
  },
  {
    id: "model",
    label: "Model AI",
    icon: "🧠",
    fixed: true,
    status: "ready",
    conceptIds: ["model"],
    summary: "Silnik, który generuje odpowiedzi",
  },
  {
    // Karta STALA i celowo umieszczona zaraz po modelu: to, czy temperature
    // w ogole da sie ustawic, zalezy od wybranego modelu. Kolejnosc kart
    // stalych bierze sie WPROST z kolejnosci w tej tablicy (patrz
    // MasterDetailCreator: FIXED_PARAMETER_IDS zachowuje kolejnosc).
    id: "temperature",
    label: "Temperatura",
    icon: "🌡️",
    fixed: true,
    status: "ready",
    conceptIds: ["temperature"],
    summary: "Jak bardzo kreatywnie agent odpowiada",
  },
  {
    id: "rules",
    label: "Zasady",
    icon: "📋",
    fixed: false,
    status: "ready",
    conceptIds: ["rules"],
    summary: "Reguły, których agent zawsze przestrzega",
  },
  {
    id: "knowledgeBase",
    label: "Baza wiedzy",
    icon: "📚",
    fixed: false,
    status: "ready",
    conceptIds: ["knowledgeBase"],
    summary: "Dokumenty z magazynu, które ma czytać ten agent",
  },
  {
    // RAG stoi PRZY Bazie wiedzy, bo to drugie zrodlo wiedzy agenta —
    // nie narzedzie pokroju kalkulatora. Roznica miedzy nimi jest jedna
    // i trzeba ja widziec obok siebie: Baza wiedzy DOKLEJA cale pliki
    // do instrukcji, RAG WYSZUKUJE w kolekcji pasujace fragmenty.
    id: "rag",
    label: "RAG",
    icon: "🔎",
    fixed: false,
    status: "ready",
    conceptIds: ["rag"],
    summary: "Wyszukiwanie w kolekcjach dokumentów",
  },
  {
    id: "qa",
    label: "Pytania i odpowiedzi",
    icon: "💬",
    fixed: false,
    status: "ready",
    conceptIds: ["qa"],
    summary: "Gotowe pary pytanie–odpowiedź",
  },
  {
    id: "tools",
    label: "Narzędzia",
    icon: "🛠️",
    fixed: false,
    status: "ready",
    conceptIds: ["tools"],
    summary: "Co agent może wywołać w trakcie rozmowy",
  },
  {
    id: "test",
    label: "Test agenta",
    icon: "🧪",
    fixed: true,
    // Przypieta na DOL listy — to podsumowanie calej konfiguracji,
    // wiec naturalnie zamyka liste parametrow.
    pinBottom: true,
    status: "ready",
    conceptIds: ["test"],
    summary: "Rozmowa z agentem i podgląd jego instrukcji",
  },
  {
    id: "io",
    label: "Wejście / Wyjście",
    icon: "↔️",
    fixed: false,
    status: "ready",
    conceptIds: ["io"],
    summary: "Co przyjmuje i w jakim formacie odpowiada",
  },
];

export function getParameter(id) {
  return PARAMETERS.find((p) => p.id === id) ?? null;
}

// Karty stale sa zawsze na liscie i nie da sie ich usunac.
export const FIXED_PARAMETER_IDS = PARAMETERS.filter((p) => p.fixed).map(
  (p) => p.id,
);

// Narzedzie RAG mieszka we WLASNEJ karcie ("rag"), a nie w "Narzedziach".
// Ta stala trzyma te wiedze w jednym miejscu, zeby obie sekcje liczyly
// swoja zawartosc tak samo.
export const RAG_TOOL_ID = "rag_search";

// Narzedzia widoczne w karcie "Narzedzia" — czyli wszystkie poza RAG-iem.
export function toolsWithoutRag(tools) {
  return Array.isArray(tools) ? tools.filter((t) => t !== RAG_TOOL_ID) : [];
}

// Ktore parametry dodawalne maja byc widoczne od razu po wczytaniu agenta.
// Zasada: jesli agent ma juz dane danego parametru, karta jest widoczna.
// Kolejnosc pushowania odpowiada kolejnosci w PARAMETERS — karty ustawiaja
// sie wtedy na liscie tak samo, jak w oknie "+ Dodaj parametr".
export function initialAddedParameters(agent) {
  const added = [];
  if (Array.isArray(agent?.rules) && agent.rules.length > 0) added.push("rules");
  if (agent?.knowledge_mode && agent.knowledge_mode !== "none")
    added.push("knowledgeBase");

  // Karta RAG nalezy sie takze agentowi, ktory ma wskazana kolekcje przy
  // wylaczonym narzedziu — inaczej zapisane ustawienie znikneloby z oczu.
  const maTools = Array.isArray(agent?.tools);
  if ((maTools && agent.tools.includes(RAG_TOOL_ID)) || agent?.rag_collection_id)
    added.push("rag");

  if (Array.isArray(agent?.qas) && agent.qas.length > 0) added.push("qa");

  // Samo rag_search NIE otwiera karty "Narzedzia" — byłaby pusta.
  if (toolsWithoutRag(agent?.tools).length > 0) added.push("tools");

  // Wejscie/Wyjscie pokazujemy, gdy ustawienia odbiegaja od domyslnych.
  const io = agent?.input_settings || {};
  const ioTouched =
    (agent?.output_format && agent.output_format !== "text") ||
    io.accept_files === true ||
    io.accept_images === true ||
    io.accept_text === false;
  if (ioTouched) added.push("io");

  return added;
}
