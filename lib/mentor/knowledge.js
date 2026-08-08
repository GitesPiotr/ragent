import { promises as fs } from "fs";
import path from "path";
import { KNOWLEDGE_CONCEPTS } from "@/lib/knowledge/concepts";

// =============================================================================
//  LISTA PLIKOW WIEDZY MENTORA WYCHODZI Z KNOWLEDGE_CONCEPTS — NIE Z KOPII
//
//  Do tej rundy stala tu WLASNA tablica piaciu nazw plikow. Wygladala na
//  drobiazg, a byla druga lista tego samego: gdy kreator dostal karty Bazy
//  wiedzy, RAG-a, Q&A, Wejscia/Wyjscia i Testu, tamta lista sie nie zmienila
//  — i mentor po prostu NIE WIEDZIAL o polowie aplikacji, ktorej uczy.
//  Objaw byl najgorszy z mozliwych: mentor nie milczal, tylko odpowiadal
//  z ogolnej wiedzy modelu.
//
//  Teraz zrodlo jest jedno. Dopisanie pojecia w lib/knowledge/concepts.js
//  dokłada je mentorowi tym samym ruchem, ktorym dokłada je paskowi
//  „Czym jest…?". Oba moduly sa SERWEROWE (concepts.js czyta fs), wiec
//  import jest bezpieczny — do przegladarki nic z tego nie trafia.
//
//  _sources.md dalej nie wchodzi: nie ma go w KNOWLEDGE_CONCEPTS, bo to
//  raport zrodel dla tworcy, a nie tresc dla uzytkownika.
//
//  RÓZNICA, KTOREJ TU SWIADOMIE NIE ZASYPUJEMY: loadKnowledgeConcepts
//  (concepts.js) przepuszcza tresc przez filterWorkingMarkers — wycina
//  znaczniki robocze [DO UZUPELNIENIA: …] i [SPRZECZNOSC …] — oraz obcina
//  naglowek „# Tytul", bo pasek wypisuje tytul sam. Mentor czyta te same
//  pliki SUROWO: znaczniki by zobaczyl, a naglowki sa mu potrzebne, zeby
//  rozroznic sklejone pojecia. Dzis zadnych znacznikow w plikach nie ma,
//  wiec roznica nie ma skutku — ujednolicenie zostaje na osobne zadanie.
// =============================================================================
const KNOWLEDGE_FILES = KNOWLEDGE_CONCEPTS.map((c) => c.file);

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
