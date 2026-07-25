"use client";

import { useRef, useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import { useMentorLayout } from "./MentorLayoutContext";
import { useSettings } from "@/lib/settings/SettingsContext";
import styles from "./MentorPanel.module.css";

// Czytelne etykiety pol i narzedzi (do kart propozycji).
const FIELD_LABELS = {
  persona: "Osobowość (persona)",
  model: "Model",
  temperature: "Temperatura",
  rules: "Zasady",
  tools: "Narzędzia",
};
const TOOL_LABELS = { calculator: "kalkulator", datetime: "data/czas" };

// Podglad proponowanej wartosci dla danego pola.
function ProposalValue({ proposal }) {
  const { field, value } = proposal;
  if (field === "rules") {
    return (
      <ul className={styles.proposalList}>
        {value.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    );
  }
  if (field === "tools") {
    return (
      <span>
        {value.length > 0
          ? value.map((t) => TOOL_LABELS[t] || t).join(", ")
          : "brak narzędzi"}
      </span>
    );
  }
  if (field === "temperature") {
    return <span>{value}</span>;
  }
  return <span>{value}</span>;
}

export function MentorPanel() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;

  // Otwarcie/zamkniecie i szerokosc panelu pochodza z layoutu strony —
  // dzieki temu przeciaganie krawedzi mentora moze zwezac kreator.
  const {
    open,
    setOpen,
    width: mentorWidth,
    dragging: resizing,
    separatorProps,
  } = useMentorLayout();

  const { settings } = useSettings();
  // Ustawienia wpływające na kod serwerowy mentora — dołączane do KAŻDEGO
  // zapytania; serwer je waliduje (model tylko z listy Anthropic).
  const mentorApiSettings = {
    mentorModel: settings.mentorModel,
    ollamaUrl: settings.ollamaUrl,
  };

  const [mode, setMode] = useState(null); // null | "reactive" | "guided"
  const [messages, setMessages] = useState([]); // { role, content, proposal?, applied? }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesRef = useRef(null);

  // KROK PERSONA (tylko ten krok) — ktora sciezke wybral user:
  // null = jeszcze nie wybral (pokazujemy dwa przyciski)
  // "self" = opisuje sam, mentor ocenia (tryb feedbacku)
  // "propose" = mentor proponuje (dotychczasowe prowadzenie)
  // "done" = persona zaakceptowana, wracamy do normalnego prowadzenia
  const [personaPath, setPersonaPath] = useState(null);
  const [personaDraft, setPersonaDraft] = useState("");

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  function resetConversation() {
    setMessages([]);
    setError(null);
    setInput("");
    setPersonaPath(null);
    setPersonaDraft("");
  }

  function chooseMode(m) {
    resetConversation();
    setMode(m);
    if (m === "guided") {
      // Tryb prowadzenia startuje sam - mentor zaczyna od persony.
      const kickoff = {
        role: "user",
        content: "Zacznijmy — poprowadź mnie krok po kroku.",
      };
      setMessages([kickoff]);
      runGuided([kickoff], agent);
    }
  }

  function backToModes() {
    setMode(null);
    resetConversation();
  }

  // Zamienia lokalne wiadomosci na format wysylany do API (tylko role+content).
  function toApiMessages(list) {
    return list.map((m) => ({ role: m.role, content: m.content }));
  }

  // --- TRYB REAKTYWNY (bez zmian wzgledem poprzedniej sesji) ---
  async function sendReactive() {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    scrollToBottom();

    dispatch(setActivity("mentor-thinking"));
    dispatch(setLastEvent({ type: "mentor-request" }));

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent,
          messages: toApiMessages(next),
          ...mentorApiSettings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wystąpił błąd serwera.");

      setMessages([...next, { role: "assistant", content: data.reply }]);
      dispatch(setLastEvent({ type: "mentor-reply" }));
    } catch (e) {
      setError(e.message);
      dispatch(setLastEvent({ type: "mentor-error", message: e.message }));
    } finally {
      setLoading(false);
      dispatch(setActivity("idle"));
      scrollToBottom();
    }
  }

  // --- TRYB PROWADZENIA ---
  // history: pelna lista wiadomosci do wyslania; agentForApi: stan agenta,
  // ktory ma zobaczyc mentor (wazne przy akceptacji - przekazujemy juz
  // zaktualizowany stan, nie czekajac na re-render Reacta).
  async function runGuided(history, agentForApi) {
    setError(null);
    setLoading(true);
    scrollToBottom();

    dispatch(setActivity("mentor-thinking"));
    dispatch(setLastEvent({ type: "mentor-request" }));

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "guided",
          agent: agentForApi,
          messages: toApiMessages(history),
          ...mentorApiSettings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wystąpił błąd serwera.");

      setMessages([
        ...history,
        {
          role: "assistant",
          content: data.message,
          proposal: data.proposal || null,
          step: data.step || null,
        },
      ]);
      dispatch(setLastEvent({ type: "mentor-reply" }));
    } catch (e) {
      setError(e.message);
      dispatch(setLastEvent({ type: "mentor-error", message: e.message }));
    } finally {
      setLoading(false);
      dispatch(setActivity("idle"));
      scrollToBottom();
    }
  }

  function sendGuidedUser() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    runGuided(next, agent);
  }

  // --- KROK PERSONA, ŚCIEŻKA A ("Opisz sam") — mentor OCENIA opis usera.
  // Osobny endpoint (mode: "persona-feedback"): jeden etap, czysta proza,
  // a propozycja do kreatora to WŁASNY tekst usera (trafia slowo w slowo).
  async function sendPersonaDraft() {
    const draft = personaDraft.trim();
    if (!draft || loading) return;

    const next = [
      ...messages,
      { role: "user", content: `Oto mój opis osobowości:\n\n${draft}` },
    ];
    setMessages(next);
    setError(null);
    setLoading(true);
    scrollToBottom();

    dispatch(setActivity("mentor-thinking"));
    dispatch(setLastEvent({ type: "mentor-request" }));

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "persona-feedback",
          agent,
          personaDraft: draft,
          messages: toApiMessages(next),
          ...mentorApiSettings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wystąpił błąd serwera.");

      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.message,
          proposal: data.proposal || null,
          step: data.step || null,
        },
      ]);
      dispatch(setLastEvent({ type: "mentor-reply" }));
    } catch (e) {
      setError(e.message);
      dispatch(setLastEvent({ type: "mentor-error", message: e.message }));
    } finally {
      setLoading(false);
      dispatch(setActivity("idle"));
      scrollToBottom();
    }
  }

  // --- KROK PERSONA, ŚCIEŻKA B ("Poproś o propozycję") — dotychczasowy przebieg.
  function askMentorForPersona() {
    if (loading) return;
    setPersonaPath("propose");
    const next = [
      ...messages,
      {
        role: "user",
        content: "Poproszę o propozycję osobowości — zaproponuj mi ją.",
      },
    ];
    setMessages(next);
    runGuided(next, agent);
  }

  // SEDNO: akceptacja propozycji -> wpisanie pola do kreatora (stan).
  function acceptProposal(index) {
    const proposal = messages[index]?.proposal;
    if (!proposal || loading) return;

    // 1) Wpisz wartosc do state.agent (widoczne od razu w kreatorze).
    dispatch(updateAgentField(proposal.field, proposal.value));
    dispatch(setLastEvent({ type: "mentor-set-field", field: proposal.field }));

    // Persona zaakceptowana (obiema sciezkami) -> konczymy specjalny krok
    // persony i wracamy do zwyklego prowadzenia dla kolejnych pol.
    if (proposal.field === "persona") setPersonaPath("done");

    // 2) Oznacz propozycje jako zastosowana.
    const marked = messages.map((m, i) =>
      i === index ? { ...m, applied: true } : m,
    );

    // 3) Poinformuj mentora, ze przechodzimy dalej - z JUZ zaktualizowanym stanem.
    const nextAgent = { ...agent, [proposal.field]: proposal.value };
    const next = [
      ...marked,
      { role: "user", content: "Akceptuję tę wartość, przejdźmy dalej." },
    ];
    setMessages(next);
    runGuided(next, nextAgent);
  }

  // Indeks OSTATNIEJ wypowiedzi mentora — pod nia doklejamy wybor sciezki persony,
  // zeby przyciski nie zostawaly przy starych wiadomosciach.
  const lastAssistantIndex = messages.reduce(
    (acc, m, i) => (m.role === "assistant" && m.content ? i : acc),
    -1,
  );

  // Czy pokazac dwa przyciski wyboru sciezki (tylko krok persony, przed wyborem).
  function showsPersonaChoice(m, i) {
    return (
      i === lastAssistantIndex &&
      mode === "guided" &&
      personaPath === null &&
      m.step === "persona" &&
      !m.proposal &&
      !loading
    );
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (mode === "guided") sendGuidedUser();
      else sendReactive();
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "✕ Zamknij mentora" : "💡 Mentor"}
      </button>

      {open && (
        <aside className={styles.panel} style={{ width: mentorWidth }}>
          {/* Przesuwalny uchwyt na LEWEJ krawedzi panelu */}
          <div
            className={`${styles.resizer} ${resizing ? styles.resizerActive : ""}`}
            {...separatorProps}
          />

          <div className={styles.header}>
            <h2 className={styles.title}>Mentor AIDEAS</h2>
            {mode === null ? (
              <p className={styles.subtitle}>
                Wybierz, jak mam Ci pomóc.
              </p>
            ) : (
              <button
                type="button"
                className={styles.backButton}
                onClick={backToModes}
              >
                ← zmień tryb
              </button>
            )}
          </div>

          {/* Wybor trybu */}
          {mode === null && (
            <div className={styles.modePicker}>
              <button
                type="button"
                className={styles.modeButton}
                onClick={() => chooseMode("reactive")}
              >
                <span className={styles.modeTitle}>Zapytaj mentora</span>
                <span className={styles.modeDesc}>
                  Zadaj dowolne pytanie o pojęcia i swoje ustawienia.
                </span>
              </button>
              <button
                type="button"
                className={styles.modeButton}
                onClick={() => chooseMode("guided")}
              >
                <span className={styles.modeTitle}>
                  Przeprowadź mnie krok po kroku
                </span>
                <span className={styles.modeDesc}>
                  Poprowadzę Cię przez budowę agenta i wypełnię kreator za Ciebie.
                </span>
              </button>
            </div>
          )}

          {/* Rozmowa */}
          {mode !== null && (
            <>
              <div className={styles.messages} ref={messagesRef}>
                {messages.filter((m) => m.content).length === 0 && !loading ? (
                  <p className={styles.empty}>Zaraz zaczynamy…</p>
                ) : (
                  messages.map((m, i) =>
                    m.content ? (
                      <div key={i} className={styles.msgWrap}>
                        <div
                          className={`${styles.message} ${
                            m.role === "user" ? styles.user : styles.mentor
                          }`}
                        >
                          <span className={styles.role}>
                            {m.role === "user" ? "Ty" : "Mentor"}
                          </span>
                          {m.content}
                        </div>

                        {/* Karta propozycji do wpisania w kreator */}
                        {m.role === "assistant" && m.proposal && (
                          <div className={styles.proposalCard}>
                            <div className={styles.proposalHead}>
                              Propozycja do pola:{" "}
                              <strong>
                                {FIELD_LABELS[m.proposal.field] ||
                                  m.proposal.field}
                              </strong>
                            </div>
                            <div className={styles.proposalBody}>
                              <ProposalValue proposal={m.proposal} />
                            </div>
                            {m.applied ? (
                              <div className={styles.appliedBadge}>
                                ✓ Wpisano do kreatora
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={styles.acceptButton}
                                disabled={loading}
                                onClick={() => acceptProposal(i)}
                              >
                                Zaakceptuj i wpisz do kreatora
                              </button>
                            )}
                          </div>
                        )}

                        {/* KROK PERSONA — wybór jednej z dwóch ścieżek */}
                        {showsPersonaChoice(m, i) && (
                          <div className={styles.pathChoice}>
                            <button
                              type="button"
                              className={styles.pathButton}
                              onClick={() => setPersonaPath("self")}
                            >
                              <span className={styles.pathTitle}>
                                Opisz sam
                              </span>
                              <span className={styles.pathDesc}>
                                Napisz własny opis — mentor da Ci feedback.
                              </span>
                            </button>
                            <button
                              type="button"
                              className={styles.pathButton}
                              onClick={askMentorForPersona}
                            >
                              <span className={styles.pathTitle}>
                                Poproś mentora o propozycję
                              </span>
                              <span className={styles.pathDesc}>
                                Mentor dopyta o kontekst i napisze personę za Ciebie.
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : null,
                  )
                )}

                {loading && (
                  <div className={styles.loader}>
                    <span>Mentor pisze</span>
                    <span className={styles.dots}>
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                )}
              </div>

              {error && <div className={styles.error}>⚠️ {error}</div>}

              {/* ŚCIEŻKA A: własne pole na opis persony + prośba o feedback.
                  Zostaje widoczne po feedbacku, żeby user mógł poprawić opis
                  i poprosić o kolejną ocenę. */}
              {mode === "guided" && personaPath === "self" ? (
                <div className={styles.draftBox}>
                  <label className={styles.draftLabel} htmlFor="persona-draft">
                    Twój opis osobowości — rola, styl, zakres, cechy
                  </label>
                  <textarea
                    id="persona-draft"
                    className={styles.draftInput}
                    value={personaDraft}
                    placeholder="Np. Jesteś asystentem do spraw obsługi klienta…"
                    onChange={(e) => setPersonaDraft(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className={styles.sendButton}
                    onClick={sendPersonaDraft}
                    disabled={loading || personaDraft.trim().length === 0}
                  >
                    {messages.some((m) => m.step === "persona" && m.proposal)
                      ? "Poproś o kolejny feedback"
                      : "Poproś o feedback"}
                  </button>
                </div>
              ) : (
              <div className={styles.inputRow}>
                <textarea
                  className={styles.input}
                  value={input}
                  placeholder={
                    mode === "guided"
                      ? "Odpowiedz mentorowi…"
                      : "Zapytaj mentora…"
                  }
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.sendButton}
                  onClick={mode === "guided" ? sendGuidedUser : sendReactive}
                  disabled={loading || input.trim().length === 0}
                >
                  Wyślij
                </button>
              </div>
              )}
            </>
          )}
        </aside>
      )}
    </>
  );
}
