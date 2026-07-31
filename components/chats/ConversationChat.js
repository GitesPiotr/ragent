"use client";

import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/settings/SettingsContext";
import { Avatar } from "./Avatar";
import styles from "./chats.module.css";

const TOOL_LABELS = {
  calculator: "kalkulator",
  datetime: "data/czas",
  web_search: "wyszukiwanie",
  web_search_local: "wyszukiwanie",
  rag_search: "dokumenty",
};

// Okno czatu (kompaktowe): lista wiadomosci bez baniek (ikona + boks),
// pod spodem stopka: textarea + „Wyślij", picker rozmowcy i podpowiedz.
// Woła istniejacy /api/chat; zapis do bazy przez callbacki (bez zmian logiki).
//
//   runnerAgent   — obiekt w ksztalcie state.agent (agent albo sam model);
//                   null => nie wybrano rozmowcy, wysylanie zablokowane.
//   assistantKind — "agent" | "model": ikona przy odpowiedziach asystenta.
//   pickerSlot    — węzeł pickera/wskaznika renderowany w stopce pod inputem.
export function ConversationChat({
  runnerAgent,
  assistantKind = "model",
  initialMessages = [],
  onUserMessage,
  onAssistantMessage,
  onCountChange,
  pickerSlot,
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesRef = useRef(null);
  const { settings } = useSettings();

  useEffect(() => {
    onCountChange?.(messages.length);
  }, [messages, onCountChange]);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    if (!runnerAgent) {
      setError("Najpierw wybierz rozmówcę z listy poniżej.");
      return;
    }

    setError(null);
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    scrollToBottom();

    try {
      await onUserMessage?.(text);
    } catch (e) {
      setError(e.message);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: runnerAgent,
          messages: nextMessages,
          knowledgeCharLimit: settings.knowledgeCharLimit,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Wystąpił błąd serwera.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let replyText = "";
      let toolsUsed = [];
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
          if (ev.type === "done") {
            replyText = ev.reply || "";
            sources = Array.isArray(ev.sources) ? ev.sources : [];
            toolsUsed = (ev.toolCalls || []).map((tc) => tc.tool);
          } else if (ev.type === "error") streamError = ev.error;
        }
      }

      if (streamError) throw new Error(streamError);

      setMessages([
        ...nextMessages,
        { role: "assistant", content: replyText, tools: toolsUsed, sources },
      ]);
      scrollToBottom();

      try {
        await onAssistantMessage?.(replyText);
      } catch (e) {
        setError(
          `Odpowiedź się wyświetliła, ale nie udało się jej zapisać: ${e.message}`,
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <div className={styles.messages} ref={messagesRef}>
        {messages.length === 0 && !loading ? (
          <p className={styles.empty}>
            {runnerAgent
              ? "Napisz wiadomość, aby rozpocząć rozmowę."
              : "Wybierz rozmówcę poniżej, aby zacząć."}
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`${styles.msgRow} ${m.role === "user" ? styles.msgUser : ""}`}
            >
              <Avatar
                kind={m.role === "user" ? "user" : assistantKind}
                tone="filled"
                size={28}
              />
              <div className={styles.msgBox}>
                {m.content}
                {m.tools && m.tools.length > 0 && (
                  <span className={styles.msgToolBadge}>
                    🔧 użyto:{" "}
                    {m.tools.map((t) => TOOL_LABELS[t] || t).join(", ")}
                  </span>
                )}
                {m.sources && m.sources.length > 0 && (
                  <span className={styles.msgSources}>
                    <span className={styles.msgSourcesTitle}>Źródła:</span>
                    {m.sources.map((s, si) => (
                      <a
                        key={si}
                        className={styles.msgSourceLink}
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
            </div>
          ))
        )}

        {loading && (
          <div className={styles.loaderRow}>
            <Avatar kind={assistantKind} tone="filled" size={28} />
            <span>Piszę</span>
            <span className={styles.dots}>
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
      </div>

      {error && <div className={styles.error}>⚠️ {error}</div>}

      <div className={styles.footer}>
        <div className={styles.inputRow}>
          <textarea
            className={styles.input}
            value={input}
            placeholder="Napisz wiadomość…"
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

        {pickerSlot}

        <div className={styles.hint}>Enter wysyła · Shift+Enter nowa linia</div>
      </div>
    </>
  );
}
