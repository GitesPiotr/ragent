export const initialState = {
  agent: {
    id: null,
    name: "",
    persona: "",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    temperature: 0.7,
    rules: [],
    tools: [],
    // Pary pytanie-odpowiedz (few-shot): { question, answer, enabled }
    qas: [],
    // Co agent przyjmuje na wejsciu.
    input_settings: {
      accept_text: true,
      accept_files: false,
      accept_images: false,
    },
    // Format odpowiedzi: "text" | "markdown" | "json"
    output_format: "text",
    // Baza wiedzy: "none" | "selected"
    knowledge_mode: "none",
    // Wskazane pliki Z MAGAZYNU KONTA, gdy knowledge_mode === "selected".
    // Agent ich nie posiada — te same id moga wskazywac inni agenci.
    knowledge_file_ids: [],
    // Projekt, do ktorego nalezy agent (tylko do odczytu — z bazy).
    project_id: null,
  },
  activity: "idle",
  lastEvent: null,
  library: [],
};
