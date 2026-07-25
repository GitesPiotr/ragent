// Narzedzie: data/czas.
// Zwraca biezaca date i godzine lokalnie (strefa serwera), bez zewnetrznych API.
export const datetime = {
  id: "datetime",
  name: "datetime",
  description:
    "Zwraca aktualną datę i godzinę (czas lokalny serwera). Używaj, gdy pytanie " +
    "dotyczy bieżącej daty, dnia tygodnia lub aktualnego czasu.",
  input_schema: {
    type: "object",
    properties: {},
  },
  execute() {
    const now = new Date();
    const formatted = now.toLocaleString("pl-PL", {
      dateStyle: "full",
      timeStyle: "medium",
    });
    return `${formatted} (ISO: ${now.toISOString()})`;
  },
};
