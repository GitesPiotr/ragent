"use client";

import { createContext, useContext, useState } from "react";

// Kontekst udostepnia tresci wiedzy (wczytane serwerowo) oraz stan
// "ktore pojecie jest otwarte" - dzieki temu link "co to?" przy polu
// kreatora moze otworzyc wlasciwa karte w bazie wiedzy.
const KnowledgeContext = createContext(null);

export function KnowledgeProvider({ concepts, children }) {
  const [openId, setOpenId] = useState(null);

  // Otwiera konkretne pojecie (np. z linku "co to?").
  function openConcept(id) {
    setOpenId(id);
  }

  // Przelacza kartę (klik w naglowek karty).
  function toggleConcept(id) {
    setOpenId((current) => (current === id ? null : id));
  }

  return (
    <KnowledgeContext.Provider
      value={{ concepts, openId, openConcept, toggleConcept }}
    >
      {children}
    </KnowledgeContext.Provider>
  );
}

export function useKnowledge() {
  const ctx = useContext(KnowledgeContext);
  if (ctx === null) {
    throw new Error("useKnowledge musi być użyte wewnątrz KnowledgeProvider");
  }
  return ctx;
}
