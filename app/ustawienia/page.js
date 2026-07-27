"use client";

import { useCallback, useEffect, useState } from "react";
import { useSettings } from "@/lib/settings/SettingsContext";
import { getModelsForProvider, PROVIDERS } from "@/lib/config/models";
import {
  THEMES,
  DEFAULT_AGENT_PROVIDERS,
  KNOWLEDGE_LIMIT_MIN,
  KNOWLEDGE_LIMIT_MAX,
  DEFAULT_OLLAMA_URL,
} from "@/lib/settings/defaults";
import styles from "./ustawienia.module.css";

const SECTIONS = [
  { id: "connections", label: "Połączenia", icon: "🔌" },
  { id: "appearance", label: "Wygląd", icon: "🎨" },
  { id: "mentor", label: "Mentor", icon: "💡" },
  { id: "defaults", label: "Domyślne agenta", icon: "🤖" },
];

const THEME_LABELS = { light: "Jasny", dark: "Ciemny", auto: "Auto (system)" };

// --- Male, wspoldzielone kontrolki --------------------------------------------

function Row({ label, desc, htmlFor, children }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <label className={styles.rowLabel} htmlFor={htmlFor}>
          {label}
        </label>
        {desc && <p className={styles.rowDesc}>{desc}</p>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

function Toggle({ id, checked, onChange, disabled }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}
    >
      <span className={styles.toggleKnob} />
    </button>
  );
}

const STATUS_META = {
  ok: { cls: "dotOk", label: "OK" },
  warn: { cls: "dotWarn", label: "Uwaga" },
  error: { cls: "dotError", label: "Błąd" },
};

function StatusRow({ name, status }) {
  const meta = STATUS_META[status?.status] || STATUS_META.warn;
  return (
    <div className={styles.statusRow}>
      <span className={`${styles.dot} ${styles[meta.cls]}`} aria-hidden="true" />
      <div className={styles.statusText}>
        <div className={styles.statusName}>
          {name}
          <span className={`${styles.statusTag} ${styles[meta.cls]}`}>
            {meta.label}
          </span>
        </div>
        {status?.detail && (
          <div className={styles.statusDetail}>{status.detail}</div>
        )}
        {Array.isArray(status?.models) && status.models.length > 0 && (
          <div className={styles.statusModels}>
            {status.models.map((m) => (
              <span key={m} className={styles.modelChip}>
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sekcje --------------------------------------------------------------------

function ConnectionsSection({ settings, updateSettings }) {
  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const check = useCallback(async (url) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/diagnostics?ollamaUrl=${encodeURIComponent(url)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd diagnostyki.");
      setDiag(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Pierwsze sprawdzenie po wejściu w sekcję.
  useEffect(() => {
    check(settings.ollamaUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Połączenia</h2>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => check(settings.ollamaUrl)}
          disabled={loading}
        >
          {loading ? "Sprawdzam…" : "Sprawdź ponownie"}
        </button>
      </div>

      {error && <div className={styles.error}>⚠️ {error}</div>}

      <div className={styles.statusList}>
        <StatusRow name="Supabase" status={diag?.supabase} />
        {/* Czy sesja z ciasteczka dociera do kodu serwerowego. Kluczowe przed
            włączeniem izolacji danych (RLS) — patrz komentarz w trasie. */}
        <StatusRow name="Konto (sesja na serwerze)" status={diag?.account} />
        <StatusRow name="Anthropic (klucz API)" status={diag?.anthropic} />
        <StatusRow name="OpenAI (klucz API)" status={diag?.openai} />
        <StatusRow name="Ollama (lokalne modele)" status={diag?.ollama} />
      </div>

      <div className={styles.rowsDivider} />

      <Row
        label="Adres serwera Ollama"
        desc={`Używany do wykrywania lokalnych modeli. Domyślnie ${DEFAULT_OLLAMA_URL}.`}
        htmlFor="ollamaUrl"
      >
        <input
          id="ollamaUrl"
          type="text"
          className={styles.textInput}
          value={settings.ollamaUrl}
          onChange={(e) => updateSettings({ ollamaUrl: e.target.value })}
          placeholder={DEFAULT_OLLAMA_URL}
        />
      </Row>
    </div>
  );
}

function AppearanceSection({ settings, updateSettings }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Wygląd</h2>
      </div>

      <Row
        label="Motyw"
        desc="Auto podąża za ustawieniem systemu. Jasny/Ciemny wymuszają wybrany wariant."
      >
        <div className={styles.segmented} role="group" aria-label="Motyw">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.segment} ${
                settings.theme === t ? styles.segmentActive : ""
              }`}
              aria-pressed={settings.theme === t}
              onClick={() => updateSettings({ theme: t })}
            >
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>
      </Row>

      <Row
        label="Panel diagnostyczny"
        desc="Nakładka podglądu stanu (dostępna też przez ?debug=1)."
        htmlFor="showDebugPanel"
      >
        <Toggle
          id="showDebugPanel"
          checked={settings.showDebugPanel}
          onChange={(v) => updateSettings({ showDebugPanel: v })}
        />
      </Row>
    </div>
  );
}

function MentorSection({ settings, updateSettings }) {
  const models = getModelsForProvider("anthropic");
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Mentor</h2>
      </div>

      <Row
        label="Model mentora"
        desc="Mentora zawsze napędza Claude (Anthropic). Wpływa na rozmowę z mentorem."
        htmlFor="mentorModel"
      >
        <select
          id="mentorModel"
          className={styles.select}
          value={settings.mentorModel}
          onChange={(e) => updateSettings({ mentorModel: e.target.value })}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label || m.id}
            </option>
          ))}
        </select>
      </Row>

      <Row
        label="Automatyczne otwieranie mentora"
        desc="Otwieraj panel mentora w kreatorze nowego (pustego) agenta."
        htmlFor="autoOpenMentor"
      >
        <Toggle
          id="autoOpenMentor"
          checked={settings.autoOpenMentor}
          onChange={(v) => updateSettings({ autoOpenMentor: v })}
        />
      </Row>
    </div>
  );
}

function DefaultsSection({ settings, updateSettings }) {
  const providerModels = getModelsForProvider(settings.defaultProvider);
  const providerLabel = (id) =>
    PROVIDERS.find((p) => p.id === id)?.label || id;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Domyślne nowego agenta</h2>
      </div>

      <Row
        label="Domyślny dostawca"
        desc="Ustawiany przy tworzeniu nowego agenta."
        htmlFor="defaultProvider"
      >
        <select
          id="defaultProvider"
          className={styles.select}
          value={settings.defaultProvider}
          onChange={(e) => updateSettings({ defaultProvider: e.target.value })}
        >
          {DEFAULT_AGENT_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {providerLabel(p)}
            </option>
          ))}
        </select>
      </Row>

      <Row
        label="Domyślny model"
        desc="Model używany dla nowo tworzonych agentów."
        htmlFor="defaultModel"
      >
        <select
          id="defaultModel"
          className={styles.select}
          value={settings.defaultModel}
          onChange={(e) => updateSettings({ defaultModel: e.target.value })}
        >
          {providerModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label || m.id}
            </option>
          ))}
        </select>
      </Row>

      <Row
        label="Domyślna temperatura"
        desc="Kreatywność odpowiedzi nowego agenta (0 = przewidywalnie, 1 = twórczo)."
        htmlFor="defaultTemperature"
      >
        <div className={styles.sliderWrap}>
          <input
            id="defaultTemperature"
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.defaultTemperature}
            onChange={(e) =>
              updateSettings({ defaultTemperature: parseFloat(e.target.value) })
            }
            className={styles.slider}
          />
          <span className={styles.sliderValue}>
            {settings.defaultTemperature.toFixed(1)}
          </span>
        </div>
      </Row>

      <Row
        label="Limit znaków wiedzy w promptcie"
        desc={`Ile znaków dokumentów doklejać do promptu (${KNOWLEDGE_LIMIT_MIN}–${KNOWLEDGE_LIMIT_MAX}).`}
        htmlFor="knowledgeCharLimit"
      >
        <input
          id="knowledgeCharLimit"
          type="number"
          min={KNOWLEDGE_LIMIT_MIN}
          max={KNOWLEDGE_LIMIT_MAX}
          step="1000"
          className={styles.numberInput}
          value={settings.knowledgeCharLimit}
          onChange={(e) =>
            updateSettings({ knowledgeCharLimit: parseInt(e.target.value, 10) })
          }
        />
      </Row>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const [active, setActive] = useState("connections");

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Ustawienia</h1>

      {/* Baner informacyjny — spokojny, nad sekcjami. */}
      <div className={styles.banner} role="note">
        <span className={styles.bannerIcon} aria-hidden="true">
          ℹ️
        </span>
        <p className={styles.bannerText}>
          Ustawienia są w trakcie rozwoju. Obecnie zapisują się lokalnie w tej
          przeglądarce. Po dodaniu logowania będą powiązane z Twoim kontem,
          pojawi się też sekcja Konto i zarządzanie kluczami API.
        </p>
      </div>

      <div className={styles.layout}>
        {/* Nawigacja sekcji po lewej */}
        <nav className={styles.nav} aria-label="Sekcje ustawień">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.navItem} ${
                active === s.id ? styles.navItemActive : ""
              }`}
              onClick={() => setActive(s.id)}
            >
              <span className={styles.navIcon} aria-hidden="true">
                {s.icon}
              </span>
              {s.label}
            </button>
          ))}
        </nav>

        {/* Treść wybranej sekcji */}
        <div className={styles.content}>
          {active === "connections" && (
            <ConnectionsSection
              settings={settings}
              updateSettings={updateSettings}
            />
          )}
          {active === "appearance" && (
            <AppearanceSection
              settings={settings}
              updateSettings={updateSettings}
            />
          )}
          {active === "mentor" && (
            <MentorSection settings={settings} updateSettings={updateSettings} />
          )}
          {active === "defaults" && (
            <DefaultsSection
              settings={settings}
              updateSettings={updateSettings}
            />
          )}
        </div>
      </div>
    </div>
  );
}
