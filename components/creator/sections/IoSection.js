"use client";

import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import { OUTPUT_FORMATS } from "@/lib/data/agentMapping";
import styles from "./sections.module.css";

const FORMAT_LABELS = {
  text: {
    label: "Tekst",
    description: "Zwykła odpowiedź do czytania przez człowieka.",
  },
  markdown: {
    label: "Markdown",
    description: "Nagłówki, listy i pogrubienia — dobre do raportów.",
  },
  json: {
    label: "JSON",
    description: "Sztywna struktura do przetworzenia przez inny program.",
  },
};

const INPUT_OPTIONS = [
  {
    id: "accept_text",
    label: "Tekst",
    description: "Pytania i polecenia wpisywane w czacie.",
  },
  {
    id: "accept_files",
    label: "Pliki",
    description: "Dokumenty przekazywane do analizy (wymaga Bazy wiedzy).",
  },
  {
    id: "accept_images",
    label: "Obrazy",
    description: "Zrzuty ekranu i zdjęcia (zależnie od możliwości modelu).",
  },
];

export function IoSection() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;

  const outputFormat = agent.output_format || "text";
  const inputSettings = agent.input_settings || {};

  function changeField(field, value, action) {
    dispatch(updateAgentField(field, value));
    dispatch(setActivity("config-changed"));
    dispatch(setLastEvent({ type: "config-changed", field, action }));
  }

  function toggleInput(id) {
    changeField(
      "input_settings",
      { ...inputSettings, [id]: !inputSettings[id] },
      id,
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">↔️</span> Wejście / Wyjście
        </h2>
        <p className={styles.subtitle}>
          Co agent przyjmuje i w jakim formacie odpowiada. Format wyjścia trafia
          do instrukcji agenta i realnie zmienia jego odpowiedzi.
        </p>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Format odpowiedzi</span>
        <div className={styles.segmented}>
          {OUTPUT_FORMATS.map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.segment} ${
                outputFormat === id ? styles.segmentActive : ""
              }`}
              onClick={() => changeField("output_format", id, "output-format")}
            >
              {FORMAT_LABELS[id].label}
            </button>
          ))}
        </div>
        <span className={styles.hint} style={{ marginTop: 8 }}>
          {FORMAT_LABELS[outputFormat]?.description}
        </span>

        {outputFormat === "json" && (
          <div className={styles.note}>
            Agent będzie zwracał wyłącznie obiekt JSON — bez zdań wprowadzających
            i bez bloków kodu. Wygodne dla programów, mniej wygodne do czytania.
          </div>
        )}
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Co agent przyjmuje na wejściu</span>
        <span className={styles.hint}>
          Deklaracja zakresu — pliki i obrazy zadziałają w pełni, gdy dołożymy
          Bazę wiedzy i obsługę załączników.
        </span>

        {INPUT_OPTIONS.map((option) => {
          const enabled = inputSettings[option.id] === true;
          return (
            <div key={option.id} className={styles.toolRow}>
              <span className={styles.toolInfo}>
                <span className={styles.toolName}>{option.label}</span>
                <span className={styles.toolDesc}>{option.description}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`${option.label}: ${enabled ? "włączone" : "wyłączone"}`}
                className={`${styles.switch} ${enabled ? styles.switchOn : ""}`}
                onClick={() => toggleInput(option.id)}
              >
                <span className={styles.switchKnob} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
