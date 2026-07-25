"use client";

import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import styles from "./sections.module.css";

export function PersonaSection() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;

  function changeField(field, value) {
    dispatch(updateAgentField(field, value));
    dispatch(setActivity("config-changed"));
    dispatch(setLastEvent({ type: "config-changed", field }));
  }

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">🎭</span> Osobowość
        </h2>
        <p className={styles.subtitle}>
          Opisz, kim jest agent i jak ma się komunikować. To jego instrukcja
          bazowa — najważniejszy parametr w całym kreatorze.
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="persona-text">
          Opis osobowości (system prompt)
        </label>
        <span className={styles.hint}>
          Ujmij cztery elementy: rolę, styl komunikacji, zakres odpowiedzialności
          i cechy charakterystyczne.
        </span>
        <textarea
          id="persona-text"
          className={styles.textarea}
          value={agent.persona}
          placeholder="np. Jesteś asystentem ds. ofert handlowych. Piszesz zwięźle i rzeczowo, po polsku, unikasz żargonu. Odpowiadasz na pytania o produkty i terminy, ale nie negocjujesz cen. Jesteś dokładny i zawsze proponujesz następny krok."
          onChange={(e) => changeField("persona", e.target.value)}
        />
        <span className={styles.counter}>
          {(agent.persona || "").length} znaków
        </span>
      </div>
    </div>
  );
}
