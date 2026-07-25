"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useKnowledge } from "@/lib/knowledge/KnowledgeContext";
import { getExtraConcept } from "@/lib/knowledge/extraConcepts";
import styles from "./ConceptBar.module.css";

// Zwijany pasek "Czym jest...?" nad edytorem KAZDEGO parametru.
// Domyslnie ZWINIETY — wiedza jest pod reka, ale nie zaslania pracy.
//
// Zrodlo tresci:
//  1. pliki ./knowledge wczytane serwerowo (kontekst KnowledgeProvider),
//  2. lib/knowledge/extraConcepts.js dla pojec bez wlasnego pliku.
export function ConceptBar({ conceptIds = [] }) {
  const { concepts } = useKnowledge();
  const [openId, setOpenId] = useState(null);

  // Sklejamy pojecia z obu zrodel, zachowujac kolejnosc z parametru.
  const resolved = conceptIds
    .map(
      (id) => concepts.find((c) => c.id === id) ?? getExtraConcept(id) ?? null,
    )
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
