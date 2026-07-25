"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import styles from "./sections.module.css";

// Narzedzia obslugiwane przez warstwe providerow (lib/tools).
const AVAILABLE_TOOLS = [
  {
    id: "calculator",
    label: "Kalkulator",
    description: "Liczy działania matematyczne zamiast zgadywać wynik.",
  },
  {
    id: "datetime",
    label: "Data / czas",
    description: "Sprawdza bieżącą datę i godzinę.",
  },
  {
    id: "web_search",
    label: "Wyszukiwanie w internecie",
    description:
      "Agent sięga po aktualne informacje z sieci i podaje źródła. Dla modeli " +
      "Claude używa wbudowanego wyszukiwania Anthropic, a dla modeli lokalnych " +
      "(Ollama) — wyszukiwarki po stronie serwera.",
    costNote:
      "Koszt: modele Claude — opłata za każde wyszukiwanie u Anthropic; modele " +
      "lokalne — darmowy limit wyszukiwarki (Tavily, ok. 1000 zapytań/mies.). " +
      "Włączaj świadomie, nie każdemu agentowi domyślnie.",
    // Dostepnosc zalezy od providera i (dla Ollamy) klucza wyszukiwarki.
    dynamicAvailability: true,
  },
];

// Zwraca { ok, note } dla przelacznika „Wyszukiwanie w internecie”.
function webSearchAvailability(provider, searchConfigured) {
  if (provider === "anthropic") return { ok: true };
  if (provider === "ollama") {
    return searchConfigured
      ? { ok: true }
      : {
          ok: false,
          note:
            "Aby wyszukiwać na modelu lokalnym, ustaw klucz wyszukiwarki " +
            "(TAVILY_API_KEY) w pliku .env.local i zrestartuj serwer.",
        };
  }
  return {
    ok: false,
    note: "Wyszukiwanie działa z modelami Claude oraz lokalnymi (Ollama).",
  };
}

export function ToolsSection() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;

  // Czy klucz wyszukiwarki jest ustawiony (serwer). Wplywa na dostepnosc
  // przelacznika wyszukiwania dla modeli lokalnych.
  const [searchConfigured, setSearchConfigured] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/search/status", { cache: "no-store" });
        const data = await res.json();
        if (alive) setSearchConfigured(Boolean(data.configured));
      } catch {
        /* brak informacji -> zostaje false (wyszarzone dla Ollamy) */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function toggleTool(toolId) {
    const enabled = agent.tools.includes(toolId);
    const next = enabled
      ? agent.tools.filter((t) => t !== toolId)
      : [...agent.tools, toolId];

    dispatch(updateAgentField("tools", next));
    dispatch(setActivity("config-changed"));
    dispatch(
      setLastEvent({
        type: "config-changed",
        field: "tools",
        action: enabled ? "disable-tool" : "enable-tool",
        tool: toolId,
      }),
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">🛠️</span> Narzędzia
        </h2>
        <p className={styles.subtitle}>
          Włącz to, czego agent może użyć w trakcie rozmowy. Agent sam decyduje,
          kiedy sięgnąć po narzędzie.
        </p>
      </div>

      {AVAILABLE_TOOLS.map((tool) => {
        const enabled = agent.tools.includes(tool.id);
        // Kalkulator/datetime — zawsze dostepne. Wyszukiwanie — zaleznie od
        // providera i klucza wyszukiwarki.
        const avail = tool.dynamicAvailability
          ? webSearchAvailability(agent.provider, searchConfigured)
          : { ok: true };
        const providerOk = avail.ok;

        return (
          <div key={tool.id} className={styles.toolRow}>
            <span className={styles.toolInfo}>
              <span className={styles.toolName}>{tool.label}</span>
              <span className={styles.toolDesc}>{tool.description}</span>
              {tool.costNote && providerOk && (
                <span className={styles.toolCost}>💳 {tool.costNote}</span>
              )}
              {!providerOk && avail.note && (
                <span className={styles.toolNote}>{avail.note}</span>
              )}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`${tool.label}: ${enabled ? "włączone" : "wyłączone"}`}
              disabled={!providerOk}
              className={`${styles.switch} ${enabled ? styles.switchOn : ""} ${
                !providerOk ? styles.switchDisabled : ""
              }`}
              onClick={() => toggleTool(tool.id)}
            >
              <span className={styles.switchKnob} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
