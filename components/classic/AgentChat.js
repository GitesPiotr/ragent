"use client";

import { useRef, useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import { setActivity, setLastEvent } from "@/lib/state/actions";
import { useSettings } from "@/lib/settings/SettingsContext";
import styles from "./AgentChat.module.css";

// Czytelne, polskie etykiety narzedzi do adnotacji w czacie.
// (Mapa po stronie klienta, zeby nie ciagnac serwerowego kodu narzedzi.)
const TOOL_LABELS = {
  calculator: "kalkulator",
  datetime: "data/czas",
  web_search: "wyszukiwanie",
  web_search_local: "wyszukiwanie",
  rag_search: "dokumenty",
};

function toolLabel(id) {
  return TOOL_LABELS[id] || id;
}

export function AgentChat() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;
  const { settings } = useSettings();

  // Historia rozmowy trzymana w stanie komponentu (nie w globalnym stanie).
  const [messages, setMessages] = useState([]); // { role: "user"|"assistant", content }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesRef = useRef(null);

  function scrollToBottom() {
    // Przewijamy liste na dol po dodaniu wiadomosci.
    requestAnimationFrame(() => {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    scrollToBottom();

    // Hak dla animacji: agent zaczyna myslec.
    dispatch(setActivity("agent-thinking"));
    dispatch(setLastEvent({ type: "agent-request" }));

    const toolsUsed = [];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Wysylamy AKTUALNY stan agenta + historie rozmowy.
        body: JSON.stringify({
          agent,
          messages: nextMessages,
          knowledgeCharLimit: settings.knowledgeCharLimit,
        }),
      });

      // Bledy walidacji zwracane sa jako zwykly JSON (nie strumien).
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Wystąpił błąd serwera.");
      }

      // Odpowiedz to strumien NDJSON - czytamy zdarzenia na zywo.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let replyText = "";
      let sources = [];
      let streamError = null;
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;

          const ev = JSON.parse(line);
          if (ev.type === "tool-call") {
            // Narzedzie sie wykonuje - aktualizujemy stan na zywo.
            dispatch(setActivity("tool-running"));
            dispatch(setLastEvent({ type: "tool-call", tool: ev.tool }));
            if (!toolsUsed.includes(ev.tool)) toolsUsed.push(ev.tool);
          } else if (ev.type === "done") {
            replyText = ev.reply || "";
            sources = Array.isArray(ev.sources) ? ev.sources : [];
            (ev.toolCalls || []).forEach((tc) => {
              if (!toolsUsed.includes(tc.tool)) toolsUsed.push(tc.tool);
            });
          } else if (ev.type === "error") {
            streamError = ev.error;
          }
        }
      }

      if (streamError) throw new Error(streamError);

      setMessages([
        ...nextMessages,
        { role: "assistant", content: replyText, tools: toolsUsed, sources },
      ]);
      dispatch(setLastEvent({ type: "agent-reply" }));
    } catch (e) {
      setError(e.message);
      dispatch(setLastEvent({ type: "agent-error", message: e.message }));
    } finally {
      setLoading(false);
      dispatch(setActivity("idle"));
      scrollToBottom();
    }
  }

  function onKeyDown(e) {
    // Enter wysyla, Shift+Enter dodaje nowa linie.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className={styles.chat}>
      <div>
        <h3 className={styles.heading}>Rozmowa z agentem</h3>
        <p className={styles.subheading}>
          Agent korzysta z aktualnej konfiguracji powyżej (persona, model,
          zasady). Zmiany w kreatorze wpływają na kolejne odpowiedzi.
        </p>
      </div>

      <div className={styles.messages} ref={messagesRef}>
        {messages.length === 0 && !loading ? (
          <p className={styles.empty}>Napisz wiadomość, aby rozpocząć rozmowę.</p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`${styles.message} ${
                m.role === "user" ? styles.user : styles.assistant
              }`}
            >
              <span className={styles.role}>
                {m.role === "user" ? "Ty" : "Agent"}
              </span>
              {m.content}
              {m.tools && m.tools.length > 0 && (
                <span className={styles.toolBadge}>
                  🔧 użyto: {m.tools.map(toolLabel).join(", ")}
                </span>
              )}
              {m.sources && m.sources.length > 0 && (
                <span className={styles.sources}>
                  <span className={styles.sourcesTitle}>Źródła:</span>
                  {m.sources.map((s, si) => (
                    <a
                      key={si}
                      className={styles.sourceLink}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {s.title || s.url}
                    </a>
                  ))}
                </span>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className={styles.loader}>
            <span>Agent myśli</span>
            <span className={styles.dots}>
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
      </div>

      {error && <div className={styles.error}>⚠️ {error}</div>}

      <div className={styles.inputRow}>
        <textarea
          className={styles.input}
          value={input}
          placeholder="Napisz wiadomość do agenta..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
        />
        <button
          type="button"
          className={styles.sendButton}
          onClick={send}
          disabled={loading || input.trim().length === 0}
        >
          Wyślij
        </button>
      </div>
    </div>
  );
}
