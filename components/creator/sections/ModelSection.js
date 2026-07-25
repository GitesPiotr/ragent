"use client";

import { useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import { PROVIDERS, getModelsForProvider } from "@/lib/config/models";
import { useSettings } from "@/lib/settings/SettingsContext";
import styles from "./sections.module.css";

export function ModelSection() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;
  const { settings } = useSettings();

  // Dynamiczna lista modeli Ollamy (status: idle|loading|ready|empty|error).
  const [ollama, setOllama] = useState({
    status: "idle",
    models: [],
    error: null,
  });

  function changeField(field, value) {
    dispatch(updateAgentField(field, value));
    dispatch(setActivity("config-changed"));
    dispatch(setLastEvent({ type: "config-changed", field }));
  }

  // Pobiera modele z /api/models (ktory pyta Ollame). Wolane z event handlerow,
  // nie z useEffect — dzieki temu setState jest legalny.
  async function refreshOllamaModels() {
    setOllama({ status: "loading", models: [], error: null });
    try {
      const res = await fetch(
        `/api/models?url=${encodeURIComponent(settings.ollamaUrl)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      const list = data.models || [];

      if (data.error) {
        setOllama({ status: "error", models: [], error: data.error });
        return;
      }
      if (list.length === 0) {
        setOllama({ status: "empty", models: [], error: null });
        return;
      }

      setOllama({ status: "ready", models: list, error: null });

      // Jesli obecny model nie nalezy do listy — ustaw pierwszy z niej.
      if (!list.some((m) => m.id === agent.model)) {
        changeField("model", list[0].id);
      }
    } catch {
      setOllama({
        status: "error",
        models: [],
        error: "Nie można pobrać listy modeli Ollamy.",
      });
    }
  }

  // Zmiana dostawcy resetuje model, zeby nie zostawic modelu poprzedniego providera.
  function changeProvider(nextProvider) {
    changeField("provider", nextProvider);

    if (nextProvider === "ollama") {
      dispatch(updateAgentField("model", ""));
      refreshOllamaModels();
      return;
    }

    const first = getModelsForProvider(nextProvider)[0]?.id ?? "";
    dispatch(updateAgentField("model", first));
  }

  const staticModels = getModelsForProvider(agent.provider);
  const isOllama = agent.provider === "ollama";
  const visibleModels = isOllama ? ollama.models : staticModels;

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">🧠</span> Model AI
        </h2>
        <p className={styles.subtitle}>
          Silnik, który generuje odpowiedzi. Mocniejszy model rozumie więcej,
          szybszy odpowiada taniej.
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="model-provider">
          Dostawca
        </label>
        <select
          id="model-provider"
          className={styles.select}
          value={agent.provider}
          onChange={(e) => changeProvider(e.target.value)}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Model</span>

        {isOllama && ollama.status === "loading" && (
          <span className={styles.hint}>Ładowanie lokalnych modeli…</span>
        )}

        {isOllama && (ollama.status === "error" || ollama.status === "empty") && (
          <div className={styles.note}>
            {ollama.status === "empty"
              ? "Nie znaleziono żadnych modeli. Pobierz model (np. „ollama pull llama3.1”) i odśwież listę."
              : "Uruchom Ollamę i pobierz model, aby korzystać z modeli lokalnych."}
            {ollama.error ? ` (${ollama.error})` : ""}
          </div>
        )}

        {isOllama && ollama.status === "idle" && (
          <div className={styles.note}>
            Kliknij „Odśwież listę modeli”, aby pobrać modele z lokalnej Ollamy.
          </div>
        )}

        <div className={styles.modelList}>
          {visibleModels.map((m) => {
            const selected = agent.model === m.id;
            const tempInfo = isOllama
              ? "lokalny · temperatura: tak"
              : m.supportsTemperature
                ? "temperatura: tak"
                : "temperatura: model dobiera sam";

            return (
              <label
                key={m.id}
                className={`${styles.modelOption} ${
                  selected ? styles.modelSelected : ""
                }`}
              >
                <input
                  type="radio"
                  name="agent-model"
                  value={m.id}
                  checked={selected}
                  onChange={() => changeField("model", m.id)}
                />
                <span className={styles.modelBody}>
                  <span className={styles.modelName}>{m.label}</span>
                  <span className={styles.modelMeta}>
                    {m.id} · {tempInfo}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {isOllama && ollama.status !== "loading" && (
          <button
            type="button"
            className={styles.button}
            style={{ marginTop: 10, alignSelf: "flex-start" }}
            onClick={refreshOllamaModels}
          >
            Odśwież listę modeli
          </button>
        )}
      </div>
    </div>
  );
}
