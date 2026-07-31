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
    id: "rag_search",
    label: "Przeszukiwanie dokumentów",
    description:
      "Agent szuka odpowiedzi w zaznaczonej niżej bazie wiedzy i cytuje konkretne " +
      "fragmenty z nazwą pliku i sekcją, zamiast dostawać całe pliki doklejone " +
      "do promptu. Włącz przy większych dokumentach — regulaminach, umowach, " +
      "instrukcjach. Pliki muszą być wcześniej zindeksowane w zakładce " +
      "„Baza wiedzy” przyciskiem „Zindeksuj do RAG”.",
    costNote:
      "Bez kosztów zewnętrznych: wyszukiwanie liczy się lokalnie (Ollama). " +
      "Wymaga uruchomionej Ollamy — bez niej agent odpowie bez dokumentów " +
      "i powie o tym wprost.",
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

// =============================================================================
//  DLACZEGO WYBOR KOLEKCJI JEST TUTAJ, A NIE W OSOBNEJ SEKCJI
//
//  Bo to nie sa dwie decyzje, tylko jedna. Wlaczone narzedzie bez wskazanej
//  kolekcji NIE DZIALA, a wskazana kolekcja przy wylaczonym narzedziu nie robi
//  NIC. Rozdzielenie ich na dwa ekrany pozwoliloby ustawic jedno bez drugiego
//  i nie zobaczyc zwiazku — a to jest dokladnie ten rodzaj stanu, ktory
//  „WYGLADA na wlaczona wiedze, a dziala jak wylaczona"
//  (KnowledgeBaseSection.js:232-234).
//
//  Stad ostrzezenie przy samym przelaczniku: narzedzie wlaczone + brak kolekcji
//  to stan, ktory MUSI byc widoczny w chwili, w ktorej powstaje.
// =============================================================================

export function ToolsSection() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;

  // Kolekcje RAG konta — do wyboru zakresu wyszukiwania. Lista jest krotka
  // (kolekcja to jednostka organizacyjna, nie plik), wiec zwykly <select>.
  const [kolekcje, setKolekcje] = useState([]);
  const [kolekcjeBlad, setKolekcjeBlad] = useState(null);
  const [kolekcjeWczytane, setKolekcjeWczytane] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/rag/collections", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (data.error) {
          setKolekcjeBlad(data.error.message || "Nie udało się wczytać kolekcji.");
        } else {
          setKolekcje(data.collections || []);
          setKolekcjeBlad(null);
        }
      } catch (e) {
        if (alive) setKolekcjeBlad(e?.message || "Nie udało się wczytać kolekcji.");
      } finally {
        if (alive) setKolekcjeWczytane(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function wybierzKolekcje(id) {
    // Pusty string z <select> -> null. Kolumna jest typu uuid.
    dispatch(updateAgentField("rag_collection_id", id || null));
    dispatch(setActivity("config-changed"));
    dispatch(
      setLastEvent({
        type: "config-changed",
        field: "rag_collection_id",
        action: id ? "set-collection" : "clear-collection",
      }),
    );
  }

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

      {/* --- ZAKRES WYSZUKIWANIA: KTORA KOLEKCJA --------------------------
          Pokazujemy WYLACZNIE przy wlaczonym narzedziu. Wybor kolekcji dla
          agenta, ktory jej nie uzywa, byłby ustawieniem bez skutku — a takie
          ustawienia uczą, że interfejs kłamie. */}
      {agent.tools.includes("rag_search") && (
        <div className={styles.toolRow}>
          <span className={styles.toolInfo}>
            <span className={styles.toolName}>Przeszukiwana kolekcja</span>
            <span className={styles.toolDesc}>
              Agent przeszukuje CAŁĄ wskazaną kolekcję — nie wybiera z niej
              pojedynczych dokumentów. Kolekcje zakładasz i wypełniasz
              w zakładce „Kreator RAG”.
            </span>

            {/* STAN, KTORY WYGLADA NA WLACZONA WIEDZE, A DZIALA JAK WYLACZONA.
                Ten sam wzorzec co w KnowledgeBaseSection — ostrzezenie stoi
                przy miejscu, w ktorym stan powstaje, a nie w dokumentacji. */}
            {!agent.rag_collection_id && (
              <span className={styles.toolNote}>
                ⚠ Narzędzie jest włączone, ale nie wskazano kolekcji — agent nie
                ma czego przeszukać i przy każdym pytaniu odpowie, że nie ma
                dostępu do dokumentów. Wybierz kolekcję poniżej albo wyłącz
                narzędzie.
              </span>
            )}

            {kolekcjeBlad && (
              <span className={styles.toolNote}>
                Nie udało się wczytać listy kolekcji: {kolekcjeBlad}
              </span>
            )}

            {kolekcjeWczytane && !kolekcjeBlad && kolekcje.length === 0 && (
              <span className={styles.toolNote}>
                Nie masz jeszcze żadnej kolekcji. Załóż ją w zakładce „Kreator
                RAG” i wgraj do niej dokumenty — dopiero wtedy będzie co wskazać.
              </span>
            )}

            <select
              className={styles.select}
              value={agent.rag_collection_id || ""}
              onChange={(e) => wybierzKolekcje(e.target.value)}
              aria-label="Kolekcja przeszukiwana przez agenta"
            >
              <option value="">— nie wybrano —</option>
              {kolekcje.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </span>
        </div>
      )}
    </div>
  );
}
