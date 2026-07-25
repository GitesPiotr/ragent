"use client";

import { useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import styles from "./sections.module.css";

// Pary pytanie-odpowiedz. Wlaczone pary trafiaja do system promptu agenta
// jako few-shot (patrz lib/agent/systemPrompt.js), wiec realnie zmieniaja
// jego odpowiedzi w czacie.
export function QaSection() {
  const { state, dispatch } = useAppState();
  const qas = Array.isArray(state.agent.qas) ? state.agent.qas : [];

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  function changeQas(next, action) {
    dispatch(updateAgentField("qas", next));
    dispatch(setActivity("config-changed"));
    dispatch(setLastEvent({ type: "config-changed", field: "qas", action }));
  }

  function addPair() {
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) return;

    changeQas([...qas, { question: q, answer: a, enabled: true }], "add-qa");
    setQuestion("");
    setAnswer("");
  }

  function removePair(index) {
    changeQas(
      qas.filter((_, i) => i !== index),
      "remove-qa",
    );
  }

  function toggleEnabled(index) {
    changeQas(
      qas.map((qa, i) =>
        i === index ? { ...qa, enabled: qa.enabled === false } : qa,
      ),
      "toggle-qa",
    );
  }

  const enabledCount = qas.filter((qa) => qa.enabled !== false).length;

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">💬</span> Pytania i odpowiedzi
        </h2>
        <p className={styles.subtitle}>
          Gotowe pary pytanie–odpowiedź uczą agenta reakcji przez przykład.
          Włączone pary trafiają do jego instrukcji i wpływają na odpowiedzi w
          czacie.
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="qa-question">
          Pytanie
        </label>
        <input
          id="qa-question"
          className={styles.input}
          type="text"
          value={question}
          placeholder="np. Jaki jest czas realizacji zamówienia?"
          onChange={(e) => setQuestion(e.target.value)}
        />

        <label
          className={styles.label}
          htmlFor="qa-answer"
          style={{ marginTop: 10 }}
        >
          Wzorcowa odpowiedź
        </label>
        <span className={styles.hint}>
          Napisz ją dokładnie tak, jak ma brzmieć agent — to jest wzorzec, który
          skopiuje.
        </span>
        <textarea
          id="qa-answer"
          className={styles.textarea}
          style={{ minHeight: 110 }}
          value={answer}
          placeholder="np. Standardowo 3–5 dni roboczych. Przy zamówieniach powyżej 100 sztuk potwierdzam termin indywidualnie."
          onChange={(e) => setAnswer(e.target.value)}
        />

        <button
          type="button"
          className={styles.button}
          style={{ alignSelf: "flex-start", marginTop: 10 }}
          onClick={addPair}
          disabled={!question.trim() || !answer.trim()}
        >
          Dodaj parę
        </button>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>
          Dodane pary ({qas.length}
          {qas.length > 0 ? `, aktywne: ${enabledCount}` : ""})
        </span>

        {qas.length === 0 ? (
          <div className={styles.empty}>
            Brak par — dodaj pierwszą powyżej. Dobry start to 5–10 najczęstszych
            pytań.
          </div>
        ) : (
          <div className={styles.list}>
            {qas.map((qa, index) => {
              const enabled = qa.enabled !== false;
              return (
                <div
                  key={index}
                  className={styles.qaPair}
                  style={enabled ? undefined : { opacity: 0.55 }}
                >
                  <div className={styles.qaRow}>
                    <label className={styles.qaToggle}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleEnabled(index)}
                      />
                      {enabled ? "Aktywna" : "Wyłączona"}
                    </label>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => removePair(index)}
                    >
                      Usuń
                    </button>
                  </div>

                  <span className={styles.qaLabel}>Pytanie</span>
                  <p className={styles.qaText}>{qa.question}</p>

                  <span className={styles.qaLabel}>Odpowiedź</span>
                  <p className={styles.qaText}>{qa.answer}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
