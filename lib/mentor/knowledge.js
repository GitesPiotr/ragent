import { promises as fs } from "fs";
import path from "path";

// Pliki wiedzy AIDEAS, ktore mentor wykorzystuje jako zrodlo prawdy.
// Kolejnosc = kolejnosc krokow kreatora. _sources.md pomijamy (to meta-zrodla).
const KNOWLEDGE_FILES = [
  "persona.md",
  "model.md",
  "temperature.md",
  "rules.md",
  "tools.md",
];

// Cache w module - wiedza jest statyczna, wystarczy wczytac raz.
let cachedKnowledge = null;

// Wczytuje pliki z ./knowledge (po stronie serwera) i scala w jeden blok.
export async function loadKnowledge() {
  if (cachedKnowledge) return cachedKnowledge;

  const dir = path.join(process.cwd(), "knowledge");
  const parts = [];

  for (const file of KNOWLEDGE_FILES) {
    try {
      const content = await fs.readFile(path.join(dir, file), "utf8");
      parts.push(content.trim());
    } catch {
      // Brakujacy plik pomijamy - mentor dziala dalej na tym, co jest.
    }
  }

  cachedKnowledge = parts.join("\n\n---\n\n");
  return cachedKnowledge;
}
