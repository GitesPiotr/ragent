"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useKnowledge } from "@/lib/knowledge/KnowledgeContext";
import styles from "./ConceptBar.module.css";

// Zwijany pasek "Czym jest...?" nad edytorem KAZDEGO parametru.
// Domyslnie ZWINIETY — wiedza jest pod reka, ale nie zaslania pracy.
//
// Zrodlo tresci: JEDNO — pliki ./knowledge wczytane serwerowo (kontekst
// KnowledgeProvider, lista w lib/knowledge/concepts.js). Wczesniej byly dwa:
// piec pojec bez wlasnego pliku mieszkalo w lib/knowledge/extraConcepts.js.
// Dostaly pliki, wiec modul zniknal — a razem z nim ryzyko, ze te same
// pojecia rozjada sie miedzy dwoma egzemplarzami prawdy.
export function ConceptBar({ conceptIds = [] }) {
  const { concepts } = useKnowledge();
  const [openId, setOpenId] = useState(null);

  // Zachowujemy kolejnosc z parametru, nie z listy pojec.
  const resolved = conceptIds
    .map((id) => concepts.find((c) => c.id === id) ?? null)
    .filter(Boolean);

  if (resolved.length === 0) return null;

  return (
    <div className={styles.bars}>
      {resolved.map((concept) => {
        const isOpen = openId === concept.id;
        return (
          <div key={concept.id} className={styles.bar}>
            <button
              type="button"
              className={styles.trigger}
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : concept.id)}
            >
              <span className={styles.triggerLabel}>
                <span className={styles.icon} aria-hidden="true">
                  💡
                </span>
                Czym jest {concept.title}?
              </span>
              <span className={styles.chevron}>{isOpen ? "−" : "+"}</span>
            </button>

            {isOpen && (
              <div className={styles.body}>
                <ReactMarkdown>{concept.markdown}</ReactMarkdown>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
