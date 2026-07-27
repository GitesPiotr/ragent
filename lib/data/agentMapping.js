// Mapowanie miedzy wierszem tabeli `agents` a obiektem state.agent.
//
// Kolumny w bazie nazwane sa DOKLADNIE tak jak pola w state.agent
// (persona, provider, model, temperature, rules, tools), wiec mapowanie
// jest 1:1. Ten modul pilnuje jedynie TYPOW i wartosci domyslnych —
// baza moze zwrocic null albo numeric jako string, a kreator wymaga
// konkretnych typow (string / number / tablica).

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_TEMPERATURE = 0.7;

export const OUTPUT_FORMATS = ["text", "markdown", "json"];
const DEFAULT_OUTPUT_FORMAT = "text";
const DEFAULT_INPUT_SETTINGS = {
  accept_text: true,
  accept_files: false,
  accept_images: false,
};

// Pary Q&A: przepuszczamy tylko poprawne wpisy (pytanie i odpowiedz niepuste).
function toQaList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      question: typeof item?.question === "string" ? item.question.trim() : "",
      answer: typeof item?.answer === "string" ? item.answer.trim() : "",
      // Brak pola enabled traktujemy jako "wlaczone" (zgodnie ze zdrowym rozsadkiem).
      enabled: item?.enabled !== false,
    }))
    .filter((qa) => qa.question && qa.answer);
}

function toInputSettings(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    accept_text: v.accept_text !== false,
    accept_files: v.accept_files === true,
    accept_images: v.accept_images === true,
  };
}

function toOutputFormat(value) {
  return OUTPUT_FORMATS.includes(value) ? value : DEFAULT_OUTPUT_FORMAT;
}

// Bez "all". Tryb "wszystkie pliki" znikl razem z odpieciem plikow od
// projektow: w magazynie konta znaczylby "wszystko, co mam", a zakres wiedzy
// agenta rosnalby sam przy kazdym uploadzie. Migracja 014 zamrozila
// istniejacych agentow na "selected", 015 zabrania tej wartosci w bazie.
//
// Gdyby mimo wszystko trafila sie tu wartosc "all", wpadnie w domyslne
// "none" — agent nie przeczyta nic, zamiast przeczytac caly magazyn.
// Kierunek wybrany swiadomie: mniej wiedzy jest odwracalne jednym
// klinieciem, nadmiar wiedzy w prompcie nie jest widoczny wcale.
export const KNOWLEDGE_MODES = ["none", "selected"];

function toKnowledgeMode(value) {
  return KNOWLEDGE_MODES.includes(value) ? value : "none";
}

function toNumber(value, fallback) {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim());
}

// Wiersz z Supabase -> ksztalt oczekiwany przez kreator (state.agent).
export function dbAgentToState(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name ?? "",
    persona: row.persona ?? "",
    provider: row.provider || DEFAULT_PROVIDER,
    model: row.model ?? "",
    // Suwak wola .toFixed(1), wiec temperatura MUSI byc liczba.
    temperature: toNumber(row.temperature, DEFAULT_TEMPERATURE),
    rules: toStringArray(row.rules),
    tools: toStringArray(row.tools),
    qas: toQaList(row.qas),
    input_settings: toInputSettings(row.input_settings),
    output_format: toOutputFormat(row.output_format),
    knowledge_mode: toKnowledgeMode(row.knowledge_mode),
    knowledge_file_ids: toStringArray(row.knowledge_file_ids),
    // Tylko do odczytu, NIE trafia do patcha zapisu. Agent nadal nalezy do
    // projektu — ale wiedzy to juz NIE dotyczy: pliki naleza do konta i agent
    // wskazuje je po id, bez posrednictwa projektu.
    project_id: row.project_id ?? null,
  };
}

// state.agent -> patch do zapisania w Supabase.
// Rzuca czytelnym bledem, gdy dane sa nieprawidlowe.
export function stateAgentToDbPatch(agent) {
  const a = agent || {};

  const name = (a.name || "").trim();
  if (!name) {
    throw new Error("Nazwa agenta nie może być pusta — uzupełnij ją przed zapisem.");
  }

  const temperature = toNumber(a.temperature, DEFAULT_TEMPERATURE);

  return {
    name,
    persona: (a.persona || "").trim() || null,
    provider: a.provider || DEFAULT_PROVIDER,
    model: a.model || DEFAULT_MODEL,
    // Baza ma check (0..1) — przycinamy, zeby nie dostac bledu z Postgresa.
    temperature: Math.min(1, Math.max(0, temperature)),
    rules: toStringArray(a.rules),
    tools: toStringArray(a.tools),
    qas: toQaList(a.qas),
    input_settings: toInputSettings(a.input_settings),
    output_format: toOutputFormat(a.output_format),
    knowledge_mode: toKnowledgeMode(a.knowledge_mode),
    knowledge_file_ids: toStringArray(a.knowledge_file_ids),
  };
}

// Porownanie konfiguracji — do wykrywania niezapisanych zmian.
// Porownujemy tylko pola, ktore realnie zapisujemy.
export function isSameConfig(a, b) {
  if (!a || !b) return false;
  return (
    (a.name || "") === (b.name || "") &&
    (a.persona || "") === (b.persona || "") &&
    (a.provider || "") === (b.provider || "") &&
    (a.model || "") === (b.model || "") &&
    toNumber(a.temperature, -1) === toNumber(b.temperature, -1) &&
    JSON.stringify(toStringArray(a.rules)) ===
      JSON.stringify(toStringArray(b.rules)) &&
    JSON.stringify(toStringArray(a.tools)) ===
      JSON.stringify(toStringArray(b.tools)) &&
    JSON.stringify(toQaList(a.qas)) === JSON.stringify(toQaList(b.qas)) &&
    JSON.stringify(toInputSettings(a.input_settings)) ===
      JSON.stringify(toInputSettings(b.input_settings)) &&
    toOutputFormat(a.output_format) === toOutputFormat(b.output_format) &&
    toKnowledgeMode(a.knowledge_mode) === toKnowledgeMode(b.knowledge_mode) &&
    JSON.stringify(toStringArray(a.knowledge_file_ids)) ===
      JSON.stringify(toStringArray(b.knowledge_file_ids))
  );
}
