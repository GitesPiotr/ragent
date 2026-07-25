"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import { useSettings } from "@/lib/settings/SettingsContext";
import { AgentChat } from "@/components/classic/AgentChat";
import styles from "./sections.module.css";

// Krotki opis plikow wiedzy do widoku "jeden blok".
function describeKnowledgeFiles(part) {
  const files = part.meta?.files || [];
  if (files.length === 0) return "brak plików";
  return files.map((f) => f.name).join(", ");
}

// Etykiety sekcji promptu -> ktora karta kreatora je wygenerowala.
const PART_ICONS = {
  persona: "🎭",
  rules: "📋",
  qa: "💬",
  knowledge: "📚",
  format: "↔️",
};

export function TestSection() {
  const { state } = useAppState();
  const agent = state.agent;
  const { settings } = useSettings();
  const knowledgeCharLimit = settings.knowledgeCharLimit;

  const [parts, setParts] = useState([]);
  const [fullLength, setFullLength] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRaw, setShowRaw] = useState(false);

  // Podglad liczymy SERWEROWO tym samym kodem co /api/chat, wiec pokazuje
  // dokladnie to, co dostaje model (razem z trescia plikow wiedzy, ktorej
  // przegladarka nie ma).
  //
  // Zaleznoscia efektu jest ZSERIALIZOWANY agent: efekt przelicza sie
  // dokladnie wtedy, gdy konfiguracja realnie sie zmieni, i nie ma tu
  // ryzyka nieaktualnego domkniecia.
  const agentJson = JSON.stringify(agent);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    // Male opoznienie: podczas pisania persony nie strzelamy przy kazdej literze.
    const timer = setTimeout(() => {
      (async () => {
        try {
          const res = await fetch("/api/agent/prompt-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: `{"agent":${agentJson},"knowledgeCharLimit":${knowledgeCharLimit}}`,
            signal: controller.signal,
          });
          const data = await res.json();
          if (!alive) return;
          if (!res.ok) throw new Error(data.error || "Błąd podglądu promptu.");

          setParts(data.parts || []);
          setFullLength(data.fullLength || 0);
          setError(null);
        } catch (e) {
          if (alive && e.name !== "AbortError") setError(e.message);
        } finally {
          if (alive) setLoading(false);
        }
      })();
    }, 350);

    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [agentJson, knowledgeCharLimit]);

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">🧪</span> Test agenta
        </h2>
        <p className={styles.subtitle}>
          Porozmawiaj z agentem, którego właśnie budujesz, i zobacz instrukcję,
          jaką dostaje model.
        </p>
      </div>

      {/* Rozroznienie ról — laik latwo myli mentora z agentem. */}
      <div className={styles.roleNote}>
        <span aria-hidden="true">ℹ️</span>
        <span>
          Tu rozmawiasz z <strong>własnym agentem</strong> — odpowiada zgodnie ze
          swoją osobowością, zasadami i wiedzą. To <strong>nie jest mentor</strong>:
          mentor (przycisk w prawym górnym rogu) uczy Cię budować agenta, a tutaj
          testujesz gotowy efekt.
        </span>
      </div>

      {/* --- PODGLAD PROMPTU --- */}
      <div className={styles.field}>
        <span className={styles.label}>Finalna instrukcja dla modelu</span>
        <span className={styles.hint}>
          To jest tekst wysyłany do modelu przy każdej Twojej wiadomości —
          złożony z sekcji, które wypełniłeś w kreatorze. Zmień ustawienie i
          zobacz, jak instrukcja się zmienia.
        </span>

        {error && (
          <div className={styles.errorBox} style={{ marginTop: 10 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className={styles.empty}>Składam instrukcję…</div>
        ) : (
          <>
            <div className={styles.promptMeta}>
              Sekcji: <strong>{parts.length}</strong> · łącznie{" "}
              <strong>{fullLength.toLocaleString("pl-PL")}</strong> znaków
            </div>

            <div className={styles.promptParts}>
              {parts.map((part) => (
                <div key={part.id} className={styles.promptPart}>
                  <div className={styles.promptPartHead}>
                    <span className={styles.promptPartLabel}>
                      <span aria-hidden="true">{PART_ICONS[part.id] || "•"}</span>{" "}
                      {part.label}
                    </span>
                    <span className={styles.promptPartSource}>
                      {part.source} · {part.chars.toLocaleString("pl-PL")} zn.
                    </span>
                  </div>

                  {/* Kontekst wiedzy: SKROT zamiast calej tresci. */}
                  {part.id === "knowledge" ? (
                    <div className={styles.promptKnowledge}>
                      {(part.meta?.files || []).map((f) => (
                        <div key={f.name} className={styles.promptFile}>
                          📄 {f.name}{" "}
                          <span className={styles.promptFileChars}>
                            ({f.chars.toLocaleString("pl-PL")} zn.)
                          </span>
                        </div>
                      ))}
                      {part.meta?.truncated && (
                        <div className={styles.promptWarn}>
                          Treść przekroczyła limit i została skrócona
                          {part.meta.skippedFiles
                            ? ` (pominięto plików: ${part.meta.skippedFiles})`
                            : ""}
                          .
                        </div>
                      )}
                      <div className={styles.promptFileNote}>
                        Pełna treść tych plików trafia do instrukcji — tutaj
                        pokazujemy skrót, żeby nie zalać ekranu.
                      </div>
                    </div>
                  ) : (
                    <pre className={styles.promptText}>{part.text}</pre>
                  )}

                  {part.isFallback && (
                    <div className={styles.promptWarn}>
                      Osobowość jest pusta — model dostaje instrukcję zastępczą.
                      Uzupełnij sekcję „Osobowość”.
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              className={styles.removeButton}
              style={{ alignSelf: "flex-start", marginTop: 10 }}
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? "Ukryj surowy tekst" : "Pokaż jako jeden blok"}
            </button>

            {showRaw && (
              <pre className={styles.promptRaw}>
                {parts
                  .map((p) =>
                    p.id === "knowledge"
                      ? `[KONTEKST WIEDZY — ${describeKnowledgeFiles(p)} · ${p.chars.toLocaleString("pl-PL")} znaków]`
                      : p.text,
                  )
                  .join("\n\n")}
              </pre>
            )}
          </>
        )}
      </div>

      {/* --- CZAT TESTOWY --- (AgentChat ma wlasny naglowek) */}
      <div className={styles.testChat}>
        <AgentChat />
      </div>
    </div>
  );
}
