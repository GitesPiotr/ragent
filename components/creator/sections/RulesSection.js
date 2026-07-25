"use client";

import { useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import styles from "./sections.module.css";

export function RulesSection() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;
  const [draft, setDraft] = useState("");

  function changeRules(next, action) {
    dispatch(updateAgentField("rules", next));
    dispatch(setActivity("config-changed"));
    dispatch(setLastEvent({ type: "config-changed", field: "rules", action }));
  }

  function addRule() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    changeRules([...agent.rules, trimmed], "add-rule");
    setDraft("");
  }

  function removeRule(index) {
    changeRules(
      agent.rules.filter((_, i) => i !== index),
      "remove-rule",
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">📋</span> Zasady
        </h2>
        <p className={styles.subtitle}>
          Krótkie reguły, których agent ma zawsze przestrzegać. Działają jak
          twarde granice nałożone na osobowość.
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="rule-draft">
          Nowa zasada
        </label>
        <div className={styles.addRow}>
          <input
            id="rule-draft"
            className={styles.input}
            type="text"
            value={draft}
            placeholder="np. Zawsze odpowiadaj po polsku"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRule();
              }
            }}
          />
          <button
            type="button"
            className={styles.button}
            onClick={addRule}
            disabled={!draft.trim()}
          >
            Dodaj
          </button>
        </div>

        {agent.rules.length === 0 ? (
          <div className={styles.empty}>
            Brak zasad — dodaj pierwszą powyżej.
          </div>
        ) : (
          <div className={styles.list}>
            {agent.rules.map((rule, index) => (
              <div key={index} className={styles.listItem}>
                <span>{rule}</span>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeRule(index)}
                >
                  Usuń
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
