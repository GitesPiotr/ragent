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
    // Pasek wiedzy dla osobowosci pokazuje DWA pojecia (persona + temperatura),
    // bo suwak temperatury mieszka w tej samej sekcji.
    conceptIds: ["persona", "temperature"],
    summary: "Kim jest agent i jak bardzo kreatywnie odpowiada",
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
    summary: "Twoje dokumenty, z których korzysta agent",
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

// Ktore parametry dodawalne maja byc widoczne od razu po wczytaniu agenta.
// Zasada: jesli agent ma juz dane danego parametru, karta jest widoczna.
export function initialAddedParameters(agent) {
  const added = [];
  if (Array.isArray(agent?.rules) && agent.rules.length > 0) added.push("rules");
  if (Array.isArray(agent?.qas) && agent.qas.length > 0) added.push("qa");
  if (agent?.knowledge_mode && agent.knowledge_mode !== "none")
    added.push("knowledgeBase");
  if (Array.isArray(agent?.tools) && agent.tools.length > 0) added.push("tools");

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
