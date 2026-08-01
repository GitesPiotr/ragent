"use client";

import { useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import { updateAgentField, setLastEvent } from "@/lib/state/actions";
import {
  PARAMETERS,
  FIXED_PARAMETER_IDS,
  RAG_TOOL_ID,
  getParameter,
  initialAddedParameters,
  toolsWithoutRag,
} from "@/lib/creator/parameters";
import { ConceptBar } from "./ConceptBar";
import { PersonaSection } from "./sections/PersonaSection";
import { ModelSection } from "./sections/ModelSection";
import { TemperatureSection } from "./sections/TemperatureSection";
import { RulesSection } from "./sections/RulesSection";
import { ToolsSection } from "./sections/ToolsSection";
import { QaSection } from "./sections/QaSection";
import { IoSection } from "./sections/IoSection";
import { KnowledgeBaseSection } from "./sections/KnowledgeBaseSection";
import { RagSection } from "./sections/RagSection";
import { TestSection } from "./sections/TestSection";
import styles from "./MasterDetailCreator.module.css";

// Mapowanie id parametru -> komponent edytora.
const SECTION_COMPONENTS = {
  persona: PersonaSection,
  model: ModelSection,
  temperature: TemperatureSection,
  rules: RulesSection,
  tools: ToolsSection,
  knowledgeBase: KnowledgeBaseSection,
  rag: RagSection,
  qa: QaSection,
  io: IoSection,
  test: TestSection,
};

export function MasterDetailCreator({
  onSave,
  saveStatus = "idle",
  hasUnsavedChanges = false,
  saveError = null,
}) {
  const { state, dispatch } = useAppState();
  const agent = state.agent;

  // Ktore parametry DODAWALNE sa obecnie na liscie. Karty stale sa zawsze.
  // Start: te, dla ktorych agent ma juz dane w bazie (zasady / narzedzia).
  const [addedIds, setAddedIds] = useState(() => initialAddedParameters(agent));

  // Aktywny parametr w prawej kolumnie; null = ekran "Wybierz parametr".
  const [activeId, setActiveId] = useState("persona");

  // Edycja nazwy agenta w naglowku.
  const [editingName, setEditingName] = useState(false);

  // Karty stale na gorze, dodane w srodku, a "Test agenta" (pinBottom)
  // na samym koncu — jako podsumowanie calej konfiguracji.
  const topFixed = FIXED_PARAMETER_IDS.filter((id) => !getParameter(id)?.pinBottom);
  const bottomFixed = FIXED_PARAMETER_IDS.filter((id) => getParameter(id)?.pinBottom);
  const visibleIds = [...topFixed, ...addedIds, ...bottomFixed];
  const availableToAdd = PARAMETERS.filter(
    (p) => !p.fixed && !addedIds.includes(p.id),
  );

  function addParameter(id) {
    setAddedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setActiveId(id);
    dispatch(setLastEvent({ type: "parameter-added", parameter: id }));
  }

  function removeParameter(id) {
    setAddedIds((ids) => ids.filter((x) => x !== id));

    // Parametry z realnymi danymi czyscimy takze w stanie agenta,
    // zeby usuniecie karty bylo zgodne z tym, co pojdzie do bazy.
    if (id === "rules") dispatch(updateAgentField("rules", []));
    if (id === "qa") dispatch(updateAgentField("qas", []));

    // Narzedzia i RAG dziela JEDNA kolumne (agents.tools), ale maja OSOBNE
    // karty. Zdjecie jednej karty nie moze wiec czyscic calej kolumny —
    // wylaczyloby po cichu ustawienie z drugiej sekcji.
    if (id === "tools") {
      dispatch(
        updateAgentField(
          "tools",
          (agent.tools || []).filter((t) => t === RAG_TOOL_ID),
        ),
      );
    }
    if (id === "rag") {
      dispatch(updateAgentField("tools", toolsWithoutRag(agent.tools)));
      // Kolekcja bez wlaczonego wyszukiwania nie robi nic — zdejmujemy razem
      // z karta, zeby stan agenta zgadzal sie z tym, co widac.
      dispatch(updateAgentField("rag_collection_id", null));
    }
    if (id === "knowledgeBase") {
      // Karta znika -> agent przestaje korzystac z wiedzy.
      // Same pliki zostaja w magazynie konta — agent ich nie posiadal,
      // tylko wskazywal, wiec nie ma czego kasowac.
      dispatch(updateAgentField("knowledge_mode", "none"));
      dispatch(updateAgentField("knowledge_file_ids", []));
    }
    if (id === "io") {
      // Powrot do domyslnych: zwykly tekst na wyjsciu, tekst na wejsciu.
      dispatch(updateAgentField("output_format", "text"));
      dispatch(
        updateAgentField("input_settings", {
          accept_text: true,
          accept_files: false,
          accept_images: false,
        }),
      );
    }

    dispatch(setLastEvent({ type: "parameter-removed", parameter: id }));
    setActiveId((current) => (current === id ? "persona" : current));
  }

  const activeParam = activeId ? getParameter(activeId) : null;
  const ActiveSection = activeId ? SECTION_COMPONENTS[activeId] : null;

  return (
    <div className={styles.creator}>
      {/* --- NAGLOWEK: nazwa agenta + edycja + zapis --- */}
      <header className={styles.header}>
        <div className={styles.nameBlock}>
          {editingName ? (
            <input
              className={styles.nameInput}
              value={agent.name}
              autoFocus
              placeholder="Nazwa agenta"
              onChange={(e) =>
                dispatch(updateAgentField("name", e.target.value))
              }
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  setEditingName(false);
                }
              }}
            />
          ) : (
            <>
              <h1 className={styles.agentName}>
                {agent.name || "(agent bez nazwy)"}
              </h1>
              <button
                type="button"
                className={styles.editNameButton}
                aria-label="Edytuj nazwę agenta"
                title="Edytuj nazwę agenta"
                onClick={() => setEditingName(true)}
              >
                ✏️
              </button>
            </>
          )}
        </div>

        <div className={styles.headerActions}>
          <span className={styles.saveStatus}>
            {saveStatus === "saving" && (
              <span className={styles.statusSaving}>Zapisuję…</span>
            )}
            {saveStatus === "saved" && !hasUnsavedChanges && (
              <span className={styles.statusSaved}>✓ Zapisano</span>
            )}
            {saveStatus === "error" && (
              <span className={styles.statusError}>Błąd zapisu</span>
            )}
            {hasUnsavedChanges && saveStatus !== "saving" && (
              <span className={styles.statusDirty}>• Niezapisane zmiany</span>
            )}
          </span>

          <button
            type="button"
            className={styles.saveButton}
            onClick={onSave}
            disabled={saveStatus === "saving" || !hasUnsavedChanges}
          >
            {saveStatus === "saving" ? "Zapisuję…" : "Zapisz"}
          </button>
        </div>
      </header>

      {saveError && (
        <div className={styles.error} role="alert">
          <strong>Błąd zapisu:</strong> {saveError}
        </div>
      )}

      {/* --- UKLAD DWUKOLUMNOWY --- */}
      <div className={styles.columns}>
        {/* LEWA: karty parametrow */}
        <aside className={styles.master}>
          <span className={styles.masterLabel}>Parametry agenta</span>

          <div className={styles.cards}>
            {visibleIds.map((id) => {
              const param = getParameter(id);
              if (!param) return null;
              const isActive = activeId === id;

              return (
                <div
                  key={id}
                  className={`${styles.card} ${isActive ? styles.cardActive : ""}`}
                >
                  <button
                    type="button"
                    className={styles.cardButton}
                    onClick={() => setActiveId(id)}
                  >
                    <span className={styles.cardIcon} aria-hidden="true">
                      {param.icon}
                    </span>
                    <span className={styles.cardText}>
                      <span className={styles.cardLabel}>
                        {param.label}
                        {param.status === "preview" && (
                          <span className={styles.previewTag}>
                            w przygotowaniu
                          </span>
                        )}
                      </span>
                      <span className={styles.cardSummary}>
                        {param.summary}
                      </span>
                    </span>
                  </button>

                  {!param.fixed && (
                    <button
                      type="button"
                      className={styles.removeCard}
                      aria-label={`Usuń parametr: ${param.label}`}
                      title="Usuń ten parametr"
                      onClick={() => removeParameter(id)}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className={`${styles.addButton} ${
              activeId === null ? styles.addButtonActive : ""
            }`}
            onClick={() => setActiveId(null)}
            disabled={availableToAdd.length === 0}
          >
            + Dodaj parametr
          </button>

          {availableToAdd.length === 0 && (
            <span className={styles.allAdded}>
              Wszystkie parametry są już dodane.
            </span>
          )}
        </aside>

        {/* PRAWA: edytor aktywnego parametru albo lista wyboru */}
        <section className={styles.detail}>
          {activeId === null ? (
            <div>
              <h2 className={styles.pickerTitle}>Wybierz parametr</h2>
              <p className={styles.pickerHint}>
                Dodaj kolejny element konfiguracji agenta. Każdy z nich możesz
                później usunąć.
              </p>

              <div className={styles.pickerList}>
                {availableToAdd.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={styles.pickerItem}
                    onClick={() => addParameter(p.id)}
                  >
                    <span className={styles.pickerIcon} aria-hidden="true">
                      {p.icon}
                    </span>
                    <span className={styles.cardText}>
                      <span className={styles.cardLabel}>
                        {p.label}
                        {p.status === "preview" && (
                          <span className={styles.previewTag}>
                            w przygotowaniu
                          </span>
                        )}
                      </span>
                      <span className={styles.cardSummary}>{p.summary}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Pasek wiedzy nad KAZDYM edytorem parametru. */}
              <ConceptBar conceptIds={activeParam?.conceptIds ?? []} />
              {ActiveSection && <ActiveSection />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
