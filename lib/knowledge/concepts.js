import { promises as fs } from "fs";
import path from "path";

// Pojęcia bazy wiedzy — JEDYNE zrodlo prawdy o tym, co jest w ./knowledge.
// _sources.md CELOWO pominięty (to raport źródeł dla twórcy, nie treść dla
// użytkownika).
//
// Ta lista ma DWOCH ODBIORCOW i oba czytaja ja stad:
//   1. pasek „Czym jest…?" w kreatorze (loadKnowledgeConcepts ponizej),
//   2. mentor — lib/mentor/knowledge.js sklada z tych samych plikow swoj
//      blok wiedzy. Wczesniej trzymal WLASNA liste tych samych nazw i przez
//      to nie widzial polowy kreatora.
//
// Kolejnosc = kolejnosc kart kreatora (lib/creator/parameters.js), wiec
// mentor czyta wiedze w tej samej kolejnosci, w ktorej uzytkownik widzi
// karty na ekranie.
export const KNOWLEDGE_CONCEPTS = [
  { id: "persona", file: "persona.md", title: "Osobowość (persona)" },
  { id: "model", file: "model.md", title: "Model (LLM)" },
  { id: "temperature", file: "temperature.md", title: "Temperatura" },
  { id: "rules", file: "rules.md", title: "Zasady" },
  { id: "knowledgeBase", file: "knowledgeBase.md", title: "Baza wiedzy agenta" },
  { id: "rag", file: "rag.md", title: "RAG (wyszukiwanie w dokumentach)" },
  { id: "qa", file: "qa.md", title: "Pytania i odpowiedzi (Q&A)" },
  { id: "tools", file: "tools.md", title: "Narzędzia" },
  { id: "io", file: "io.md", title: "Wejście i wyjście" },
  { id: "test", file: "test.md", title: "Test agenta" },
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

// =============================================================================
//  NAGLOWEK "# Tytul" WYCINAMY PRZY WYSWIETLANIU — I TYLKO PRZY NIM.
//
//  Kazdy plik wiedzy zaczyna sie od "# Tytul" i tak ma zostac: mentor dostaje
//  te pliki SKLEJONE w jeden blok (lib/mentor/knowledge.js), wiec bez naglowka
//  nie widzialby, gdzie konczy sie jedno pojecie, a zaczyna drugie.
//
//  Pasek „Czym jest…?" ma jednak wlasny tytul w przycisku („Czym jest
//  Narzedzia?"), wiec ten sam tytul w tresci pojawialby sie DRUGI RAZ, linie
//  nizej. Dlatego pierwszy naglowek pierwszego poziomu odcinamy tutaj —
//  w warstwie wyswietlania, nie w pliku.
// =============================================================================
function stripLeadingTitle(md) {
  return md.replace(/^\s*#\s+.*\r?\n+/, "");
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
        markdown: stripLeadingTitle(filterWorkingMarkers(raw)),
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
