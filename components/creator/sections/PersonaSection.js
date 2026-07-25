"use client";

import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import { modelSupportsTemperature } from "@/lib/config/models";
import styles from "./sections.module.css";

// Opis charakteru danej temperatury (ten sam podzial co w starym kreatorze).
function temperatureHint(value) {
  if (value <= 0.3) return "Precyzja — raporty, analizy, fakty";
  if (value <= 0.6) return "Równowaga — materiały robocze, rekomendacje";
  return "Kreatywność — burze mózgów, treści twórcze";
}

export function PersonaSection() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;

  // Nie kazdy model przyjmuje temperature (Opus 4.8 / Sonnet 5 dobieraja ja same).
  const tempSupported = modelSupportsTemperature(agent.provider, agent.model);

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

      <div className={styles.field}>
        <label className={styles.label} htmlFor="persona-temperature">
          Temperatura (kreatywność odpowiedzi)
        </label>
        <span className={styles.hint}>
          Niska = przewidywalnie i pod fakty. Wysoka = swobodnie i twórczo.
        </span>

        <div className={styles.sliderRow}>
          <input
            id="persona-temperature"
            className={styles.slider}
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={agent.temperature}
            disabled={!tempSupported}
            onChange={(e) =>
              changeField("temperature", parseFloat(e.target.value))
            }
          />
          <span className={styles.sliderValue}>
            {Number(agent.temperature).toFixed(1)}
          </span>
        </div>

        {tempSupported ? (
          <span className={styles.tempHint}>
            {temperatureHint(agent.temperature)}
          </span>
        ) : (
          <div className={styles.note}>
            Model <strong>{agent.model}</strong> sam dobiera poziom losowości i
            nie pozwala ustawiać temperatury ręcznie. Suwak jest nieaktywny —
            to normalne, nie błąd.
          </div>
        )}
      </div>
    </div>
  );
}
