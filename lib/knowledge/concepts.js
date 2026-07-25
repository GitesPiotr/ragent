import { promises as fs } from "fs";
import path from "path";

// Pięć pojęć bazy wiedzy. _sources.md CELOWO pominięty (to raport źródeł
// dla twórcy, nie treść dla użytkownika).
export const KNOWLEDGE_CONCEPTS = [
  { id: "persona", file: "persona.md", title: "Osobowość (persona)" },
  { id: "model", file: "model.md", title: "Model (LLM)" },
  { id: "temperature", file: "temperature.md", title: "Temperatura" },
  { id: "rules", file: "rules.md", title: "Zasady" },
  { id: "tools", file: "tools.md", title: "Narzędzia" },
];

// Usuwa znaczniki robocze, ktorych laik nie powinien widziec:
//  - [DO UZUPEŁNIENIA: ...]
//  - [SPRZECZNOŚĆ ...]
// Pliki zrodlowe zostaja nietkniete - filtrujemy TYLKO przy wyswietlaniu.
function filterWorkingMarkers(md) {
  let out = md;

  // Wytnij znaczniki (moga byc wieloliniowe; [^\]] lapie tez nowe linie).
  out = out.replace(/\[(?:DO UZUPEŁNIENIA|SPRZECZNOŚĆ)[^\]]*?\]/g, "");

  // Usun puste punkty listy, ktore zostaly po wycieciu markera (np. samo "- ").
  out = out.replace(/^[ \t]*[-*][ \t]*$/gm, "");

  // Zredukuj nadmiarowe puste linie.
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}

// Czyta pliki wiedzy PO STRONIE SERWERA i zwraca gotowe do wyswietlenia pojecia.
// Bez cache - dzieki temu edycja pliku od razu widoczna po odswiezeniu.
export async function loadKnowledgeConcepts() {
  const dir = path.join(process.cwd(), "knowledge");

  const concepts = [];
  for (const c of KNOWLEDGE_CONCEPTS) {
    try {
      const raw = await fs.readFile(path.join(dir, c.file), "utf8");
      concepts.push({
        id: c.id,
        title: c.title,
        markdown: filterWorkingMarkers(raw),
      });
    } catch {
      concepts.push({
        id: c.id,
        title: c.title,
        markdown: "_(Treść tego pojęcia jest chwilowo niedostępna.)_",
      });
    }
  }

  return concepts;
}
