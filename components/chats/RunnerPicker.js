"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { listProjects } from "@/lib/data/projects";
import { listActiveAgents } from "@/lib/data/agents";
import { useSettings } from "@/lib/settings/SettingsContext";
import { useDopuszczone } from "@/lib/settings/DopuszczoneContext";
import { listaModeli, modeleOllamy } from "@/lib/settings/dopuszczoneModele";
import { POKAZ_DOSTAWCE_LOKALNA } from "@/lib/config/models";
import { Avatar } from "./Avatar";
import styles from "./chats.module.css";

// Etykieta rozmowcy uzywana SPOJNIE w calej apce: maly kolorowy chip z samym
// typem + nazwa OBOK, zwyklym tekstem.
//   [Agent] Formalny        [Model AI] llama3.1:8b
//   kind:    "agent" | "model"
//   name:    nazwa agenta albo modelu (obok chipa, bez tla/ramki)
//   deleted: agent zniknal — chip na czerwono + dopisek „usunięty"
export function RunnerLabel({
  kind,
  name,
  deleted = false,
  compact = false,
  className = "",
}) {
  const label = kind === "agent" ? "Agent" : "Model AI";
  const chipClass = deleted
    ? styles.chipDeleted
    : kind === "agent"
      ? styles.chipAgent
      : styles.chipModel;
  return (
    <span
      className={`${styles.runner} ${compact ? styles.runnerCompact : ""} ${className}`}
    >
      <span className={`${styles.chip} ${chipClass}`}>{label}</span>
      <span
        className={`${styles.runnerName} ${deleted ? styles.runnerDeleted : ""}`}
      >
        {name}
      </span>
      {deleted && <span className={styles.runnerDeletedTag}>usunięty</span>}
    </span>
  );
}

// Kolejnosc grup modeli w liscie i prefiks nazwy dostawcy przy kazdej pozycji.
//
// PREFIKSY SA KROTSZE NIZ NAZWY_DOSTAWCOW z dopuszczoneModele.js, i to jest
// swiadome: tamte ida do promptu mentora („Lokalne (Ollama):" jako naglowek
// grupy), a te do waskiej listy rozwijanej. „Ollama: llama3.1:8b" zostaje
// slowo w slowo takie, jak bylo przed runda 6.
//
// Anthropic BEZ prefiksu — tez jak wczesniej. To dostawca domyslny aplikacji
// i doklejenie mu nazwy zmienialo by wyglad kazdej istniejacej pozycji listy.
// TRYB POKAZU: własna lista, więc własny filtr. Zdjęcie „ollama" z PROVIDERS
// w lib/config/models.js NIE dosięgłoby tego miejsca — ta tablica jest wpisana
// tu od nowa i o tamtej nie wie. Przełącznik jest wspólny, żeby jedno miejsce
// dalej decydowało o wszystkich czterech ekranach.
const PICKER_PROVIDERS = ["anthropic", "openai", "openrouter", "ollama"].filter(
  (id) => POKAZ_DOSTAWCE_LOKALNA || id !== "ollama",
);
const PREFIKS = {
  anthropic: "",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  ollama: "Ollama",
};

// Prefiks doklejamy TYLKO, gdy nazwa sama go jeszcze nie niesie.
// Etykiety z katalogu OpenRoutera maja postac „Wytworca: Model", wiec
// „OpenRouter: Anthropic: Claude Haiku 4.5" czyta sie sensownie (ten model
// Anthropica przez OpenRoutera), ale „OpenRouter: OpenRouter: Fusion" juz nie.
function zNazwaDostawcy(provider, nazwa) {
  const p = PREFIKS[provider];
  if (!p || nazwa.startsWith(`${p}:`)) return nazwa;
  return `${p}: ${nazwa}`;
}

// Wlasna lista rozwijana (natywny <select> nie pozwala ostylowac opcji chipami).
//   - agenci pogrupowani po projektach + osobna grupa „Modele AI",
//   - kazda opcja to chip typu + nazwa (RunnerLabel),
//   - zamykanie: Escape / klik poza / wybor; klawiatura: strzalki + Enter,
//   - picker jest AKTYWNY zawsze (takze w trakcie rozmowy).
// value:  "" | "a:<agentId>" | "m:<provider>:<modelId>"
// onChange({ type:"agent", agentId }) albo ({ type:"model", provider, model }).
export function RunnerSelect({ value, onChange }) {
  const { settings } = useSettings();
  const { dopuszczone } = useDopuszczone();
  const [groups, setGroups] = useState([]);
  // Blad wczytywania agentow. MUSI byc widoczny: po wlaczeniu RLS (Sesja 4)
  // nieudane zapytanie objawia sie pusta lista, a nie wyjatkiem, wiec bez
  // tego komunikatu awaria wyglada identycznie jak „nie masz jeszcze agentow”.
  const [agentsError, setAgentsError] = useState(null);
  const [ollama, setOllama] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [projects, agents] = await Promise.all([
          listProjects({ includeArchived: false }),
          listActiveAgents(),
        ]);
        if (!alive) return;
        const byProject = new Map();
        for (const a of agents) {
          if (!byProject.has(a.project_id)) byProject.set(a.project_id, []);
          byProject.get(a.project_id).push(a);
        }
        setGroups(
          projects
            .filter((p) => byProject.has(p.id))
            .map((p) => ({ project: p, agents: byProject.get(p.id) })),
        );
        setAgentsError(null);
      } catch (e) {
        if (!alive) return;
        // Wczesniej stalo tu samo setGroups([]) — blad znikal bez sladu,
        // a uzytkownik widzial liste bez agentow i nie mial jak sie
        // dowiedziec, ze cos poszlo nie tak.
        setGroups([]);
        setAgentsError(e?.message || "Nie udało się wczytać listy agentów.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Ollama dynamicznie — z adresu z ustawien (?url=). Brak Ollamy => jej nie ma.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/models?url=${encodeURIComponent(settings.ollamaUrl)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (alive && !data.error && Array.isArray(data.models)) {
          setOllama(data.models);
        }
      } catch {
        /* Ollama niedostepna — pomijamy. */
      }
    })();
    return () => {
      alive = false;
    };
  }, [settings.ollamaUrl]);

  // Elementy do wyrenderowania (naglowki grup + opcje) oraz plaska lista samych
  // opcji do nawigacji klawiatura.
  const { items, options } = useMemo(() => {
    const its = [];
    const opts = [];
    const pushOption = (opt) => {
      opt.index = opts.length;
      opts.push(opt);
      its.push(opt);
    };

    for (const g of groups) {
      its.push({ type: "header", key: `h-${g.project.id}`, label: g.project.name });
      for (const a of g.agents) {
        pushOption({
          type: "option",
          key: `a-${a.id}`,
          value: `a:${a.id}`,
          kind: "agent",
          name: a.name,
        });
      }
    }

    // MODELE AI — Z LISTY KONTA, WSZYSCY DOSTAWCY.
    //
    // Przed runda 6 stalo tu twarde getModelsForProvider("anthropic") plus
    // Ollama, czyli picker NIE ZNAL ani OpenAI, ani OpenRoutera: model dalo
    // sie ustawic agentowi w kreatorze, ale nie dalo sie z nim porozmawiac
    // bezposrednio w Czatach. Teraz zrodlo jest jedno i obejmuje kazdego
    // dostawce, ktorego konto wlaczylo.
    //
    // Nazwa dostawcy w etykiecie zostaje przy KAZDYM modelu poza Anthropic —
    // tak samo, jak wczesniej robil to prefiks „Ollama: ". Bez tego
    // „Claude Haiku 4.5" z Anthropic i ten sam model przez OpenRoutera sa
    // na liscie nie do odroznienia, a to dwie rozne trasy i dwa rozne klucze.
    its.push({ type: "header", key: "h-models", label: "Modele AI" });
    for (const provider of PICKER_PROVIDERS) {
      const modele =
        provider === "ollama"
          ? modeleOllamy(dopuszczone, ollama).modele
          : listaModeli(dopuszczone, provider).modele;

      for (const m of modele) {
        pushOption({
          type: "option",
          key: `${provider}-${m.id}`,
          value: `m:${provider}:${m.id}`,
          kind: "model",
          name: zNazwaDostawcy(provider, m.label || m.id),
        });
      }
    }

    return { items: its, options: opts };
  }, [groups, ollama, dopuszczone]);

  const selected = options.find((o) => o.value === value) || null;
  const selectedKind = selected ? selected.kind : "placeholder";

  // Zamykanie klikiem poza komponentem.
  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Podswietlona opcja zawsze widoczna na liscie.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function openList() {
    setActiveIndex(selected ? selected.index : 0);
    setOpen(true);
  }

  function choose(opt) {
    if (opt.value.startsWith("a:")) {
      onChange({ type: "agent", agentId: opt.value.slice(2) });
    } else {
      const rest = opt.value.slice(2);
      const sep = rest.indexOf(":");
      onChange({
        type: "model",
        provider: rest.slice(0, sep),
        model: rest.slice(sep + 1),
      });
    }
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openList();
      else setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      if (!open) return;
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const opt = options[activeIndex];
      if (opt) choose(opt);
    }
  }

  return (
    <div className={styles.pickerRow} ref={rootRef}>
      <Avatar kind={selectedKind} tone="soft" size={30} />
      <div className={styles.dropdown}>
        <button
          type="button"
          className={styles.dropdownButton}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onKeyDown}
        >
          {selected ? (
            <RunnerLabel
              kind={selected.kind}
              name={selected.name}
              className={styles.runnerGrow}
            />
          ) : (
            <span className={styles.dropdownPlaceholder}>
              — wybierz rozmówcę —
            </span>
          )}
          <span className={styles.caret} aria-hidden="true">
            ▾
          </span>
        </button>

        {open && (
          <ul className={styles.dropdownList} role="listbox" ref={listRef}>
            {/* Modele AI sa na liscie zawsze, wiec sam brak agentow nie zrobilby
                z options pustej tablicy — blad musi miec wlasny wiersz. */}
            {agentsError && (
              <li className={styles.dropdownError} role="presentation">
                Nie udało się wczytać agentów: {agentsError}
              </li>
            )}
            {options.length === 0 && !agentsError && (
              <li className={styles.dropdownEmpty}>
                Brak dostępnych rozmówców
              </li>
            )}
            {items.map((it) =>
              it.type === "header" ? (
                <li
                  key={it.key}
                  className={styles.dropdownGroupLabel}
                  role="presentation"
                >
                  {it.label}
                </li>
              ) : (
                <li key={it.key} role="option" aria-selected={it.value === value}>
                  <button
                    type="button"
                    data-index={it.index}
                    className={`${styles.dropdownOption} ${
                      it.index === activeIndex ? styles.dropdownOptionActive : ""
                    } ${it.value === value ? styles.dropdownOptionSelected : ""}`}
                    onMouseEnter={() => setActiveIndex(it.index)}
                    onClick={() => choose(it)}
                  >
                    <Avatar kind={it.kind} tone="soft" size={24} />
                    <RunnerLabel
                      kind={it.kind}
                      name={it.name}
                      className={styles.runnerGrow}
                    />
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
