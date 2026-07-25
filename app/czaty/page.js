"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAgent } from "@/lib/data/agents";
import { dbAgentToState } from "@/lib/data/agentMapping";
import {
  listConversations,
  createConversation,
  updateConversationTitle,
  updateConversationRunner,
  setConversationPinned,
  touchConversation,
  deleteConversation,
  listMessages,
  addMessage,
} from "@/lib/data/conversations";
import { ConversationChat } from "@/components/chats/ConversationChat";
import { ConversationRow } from "@/components/chats/ConversationRow";
import { RunnerSelect, RunnerLabel } from "@/components/chats/RunnerPicker";
import { useResizablePanel } from "@/lib/hooks/useResizablePanel";
import { Avatar } from "@/components/chats/Avatar";
import { FormModal } from "@/components/workspace/FormModal";
import styles from "@/components/chats/chats.module.css";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function makeTitle(text) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "Nowa rozmowa";
  return t.length > 50 ? `${t.slice(0, 50).trimEnd()}…` : t;
}

// Obiekt w ksztalcie state.agent dla rozmowy z SAMYM modelem — bez persony.
function modelRunner(provider, model) {
  return {
    provider,
    model,
    temperature: 0.7,
    persona: "",
    rules: [],
    tools: [],
    qas: [],
    knowledge_mode: "none",
    knowledge_file_ids: [],
    output_format: "text",
    project_id: null,
  };
}

// Rozmowa „z agentem" (robot) gdy ma agent_id ALBO snapshot (byla agentowa),
// inaczej „z modelem" (AI). Deleted = agent zniknal, ale rozmowa zostala.
function conversationKind(conv) {
  return conv.agent_id || conv.agent_name_snapshot ? "agent" : "model";
}
function isDeletedAgent(conv) {
  return !conv.agent_id && Boolean(conv.agent_name_snapshot);
}
// Nazwa rozmowcy (obok chipa): agent -> nazwa agenta, model -> nazwa modelu.
function conversationRunnerName(conv) {
  if (conv.agent_id || conv.agent_name_snapshot)
    return conv.agent_name_snapshot || "?";
  return conv.model;
}

export default function ChatsPage() {
  const [conversations, setConversations] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [search, setSearch] = useState("");

  // Prawa kolumna: null | { kind:"chat", runner, convKind, whoName, modelLabel,
  // deleted, initialMessages }.
  const [active, setActive] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTitle, setActiveTitle] = useState("");
  const [runnerValue, setRunnerValue] = useState("");
  const [msgCount, setMsgCount] = useState(0);
  const [chatKey, setChatKey] = useState(0);
  const [chatError, setChatError] = useState(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  const activeConvIdRef = useRef(null);
  const draftRef = useRef(null);

  // Przesuwalna granica listy rozmów / panelu rozmowy.
  const {
    width: sidebarWidth,
    dragging: resizing,
    containerRef,
    separatorProps,
  } = useResizablePanel({
    side: "left",
    min: 200,
    max: 420,
    defaultWidth: 260,
    storageKey: "czaty:sidebarWidth",
  });

  const refreshConversations = useCallback(async () => {
    const data = await listConversations();
    setConversations(data);
    return data;
  }, []);

  const handleCountChange = useCallback((n) => setMsgCount(n), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listConversations();
        if (!alive) return;
        setConversations(data);
        setListError(null);
      } catch (e) {
        if (alive) setListError(e.message);
      } finally {
        if (alive) setListLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function startNew() {
    setChatError(null);
    setEditingTitle(false);
    activeConvIdRef.current = null;
    draftRef.current = null;
    setSelectedId(null);
    setActiveTitle("");
    setRunnerValue("");
    setMsgCount(0);
    setActive({
      kind: "chat",
      runner: null,
      convKind: null,
      whoName: null,
      runnerName: null,
      modelLabel: "",
      deleted: false,
      initialMessages: [],
    });
    setChatKey((k) => k + 1);
  }

  // Zmiana rozmowcy w pickerze — dziala ZAWSZE, takze w trakcie rozmowy.
  // NIE remontuje czatu: podmienia tylko runnera, wiec historia wiadomosci i
  // wpisany tekst zostaja. Dla zapisanej rozmowy aktualizuje rekord w bazie
  // (agent_id, agent_name_snapshot, provider, model) — bez ruszania messages.
  async function onRunnerChange(sel) {
    setChatError(null);

    let runner;
    let convKind;
    let runnerName;
    let modelLabel;
    let draft;

    try {
      if (sel.type === "agent") {
        const row = await getAgent(sel.agentId);
        if (!row) throw new Error("Nie znaleziono agenta.");
        runner = dbAgentToState(row);
        convKind = "agent";
        runnerName = row.name;
        modelLabel = `${runner.provider} · ${runner.model}`;
        draft = {
          agentId: row.id,
          agentName: row.name,
          provider: runner.provider,
          model: runner.model,
        };
        setRunnerValue(`a:${row.id}`);
      } else {
        runner = modelRunner(sel.provider, sel.model);
        convKind = "model";
        runnerName = sel.model;
        modelLabel = `${sel.provider} · ${sel.model}`;
        draft = {
          agentId: null,
          agentName: null,
          provider: sel.provider,
          model: sel.model,
        };
        setRunnerValue(`m:${sel.provider}:${sel.model}`);
      }
    } catch (e) {
      setChatError(e.message);
      return;
    }

    draftRef.current = draft;
    setActive((a) => ({
      ...a,
      runner,
      convKind,
      whoName: runnerName,
      runnerName,
      modelLabel,
      deleted: false,
    }));

    // Rozmowa juz zapisana => utrwal zmiane rozmowcy (historia zostaje).
    const convId = activeConvIdRef.current;
    if (convId) {
      try {
        await updateConversationRunner(convId, draft);
        await refreshConversations();
      } catch (e) {
        setChatError(e.message);
      }
    }
  }

  async function openConversation(conv) {
    setChatError(null);
    setEditingTitle(false);
    setSelectedId(conv.id);
    setActiveTitle(conv.title);
    try {
      const msgs = await listMessages(conv.id);

      let runner;
      let convKind;
      let runnerName;
      let modelLabel;
      let deleted = false;

      if (conv.agent_id) {
        const row = await getAgent(conv.agent_id);
        if (row) {
          runner = dbAgentToState(row);
          convKind = "agent";
          runnerName = row.name;
          modelLabel = `${runner.provider} · ${runner.model}`;
        } else {
          runner = modelRunner(conv.provider, conv.model);
          convKind = "agent";
          deleted = true;
          runnerName = conv.agent_name_snapshot || "?";
          modelLabel = `${conv.provider} · ${conv.model}`;
        }
      } else if (conv.agent_name_snapshot) {
        runner = modelRunner(conv.provider, conv.model);
        convKind = "agent";
        deleted = true;
        runnerName = conv.agent_name_snapshot;
        modelLabel = `${conv.provider} · ${conv.model}`;
      } else {
        runner = modelRunner(conv.provider, conv.model);
        convKind = "model";
        runnerName = conv.model;
        modelLabel = `${conv.provider} · ${conv.model}`;
      }

      activeConvIdRef.current = conv.id;
      draftRef.current = {
        agentId: conv.agent_id,
        agentName: conv.agent_name_snapshot,
        provider: conv.provider,
        model: conv.model,
      };
      setRunnerValue(
        conv.agent_id
          ? `a:${conv.agent_id}`
          : `m:${conv.provider}:${conv.model}`,
      );
      setMsgCount(msgs.length);
      setActive({
        kind: "chat",
        runner,
        convKind,
        whoName: runnerName,
        runnerName,
        modelLabel,
        deleted,
        initialMessages: msgs.map((m) => ({ role: m.role, content: m.content })),
      });
      setChatKey((k) => k + 1);
    } catch (e) {
      setChatError(e.message);
    }
  }

  const persistUser = useCallback(
    async (text) => {
      let convId = activeConvIdRef.current;
      if (!convId) {
        const d = draftRef.current || {};
        const conv = await createConversation({
          title: makeTitle(text),
          agentId: d.agentId,
          agentName: d.agentName,
          provider: d.provider,
          model: d.model,
        });
        convId = conv.id;
        activeConvIdRef.current = convId;
        setSelectedId(convId);
        setActiveTitle(conv.title);
        await refreshConversations();
      }
      await addMessage(convId, { role: "user", content: text });
    },
    [refreshConversations],
  );

  const persistAssistant = useCallback(
    async (text) => {
      const convId = activeConvIdRef.current;
      if (!convId) return;
      await addMessage(convId, { role: "assistant", content: text });
      await touchConversation(convId);
      await refreshConversations();
    },
    [refreshConversations],
  );

  async function saveTitle() {
    const convId = activeConvIdRef.current;
    const next = titleDraft.trim();
    if (!convId || !next) {
      setEditingTitle(false);
      return;
    }
    try {
      const updated = await updateConversationTitle(convId, next);
      setActiveTitle(updated.title);
      await refreshConversations();
    } catch (e) {
      setChatError(e.message);
    } finally {
      setEditingTitle(false);
    }
  }

  // Zmiana nazwy z listy (menu akcji) — reuzywa updateConversationTitle.
  async function handleRename(conv, nextTitle) {
    try {
      const updated = await updateConversationTitle(conv.id, nextTitle);
      if (activeConvIdRef.current === conv.id) setActiveTitle(updated.title);
      await refreshConversations();
    } catch (e) {
      setChatError(e.message);
    }
  }

  // Przypnij / odepnij — stan w bazie, potem odswiezenie listy (przesortuje).
  async function handleTogglePin(conv) {
    try {
      await setConversationPinned(conv.id, !conv.pinned);
      await refreshConversations();
    } catch (e) {
      setChatError(e.message);
    }
  }

  async function confirmDelete(e) {
    e.preventDefault();
    if (!deleting || saving) return;
    setSaving(true);
    try {
      await deleteConversation(deleting.id);
      if (selectedId === deleting.id) {
        setActive(null);
        setSelectedId(null);
        activeConvIdRef.current = null;
      }
      setDeleting(null);
      await refreshConversations();
    } catch (err) {
      setChatError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const hasSavedConv = active?.kind === "chat" && Boolean(selectedId);
  const headerKind = active?.convKind || "placeholder";

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  // Grupy: przypiete na gorze, reszta pod spodem (kolejnosc juz posortowana
  // przez listConversations: pinned desc, updated_at desc).
  const pinnedList = filtered.filter((c) => c.pinned);
  const restList = filtered.filter((c) => !c.pinned);

  const renderRow = (c) => (
    <ConversationRow
      key={c.id}
      conv={c}
      active={selectedId === c.id}
      kind={conversationKind(c)}
      runnerName={conversationRunnerName(c)}
      deleted={isDeletedAgent(c)}
      formatDate={formatDate}
      onOpen={openConversation}
      onRename={handleRename}
      onTogglePin={handleTogglePin}
      onDelete={setDeleting}
    />
  );

  return (
    <div
      className={`${styles.page} ${resizing ? styles.pageResizing : ""}`}
      ref={containerRef}
    >
      {/* LEWA: nowa rozmowa + szukaj + lista */}
      <div className={styles.listCol} style={{ width: sidebarWidth }}>
        <button type="button" className={styles.newButton} onClick={startNew}>
          + Nowa rozmowa
        </button>

        <input
          className={styles.search}
          value={search}
          placeholder="Szukaj rozmów…"
          onChange={(e) => setSearch(e.target.value)}
        />

        {listError && <div className={styles.error}>⚠️ {listError}</div>}

        {listLoading ? (
          <div className={styles.listInfo}>Wczytuję rozmowy…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.listInfo}>
            {conversations.length === 0
              ? "Brak rozmów. Kliknij „Nowa rozmowa”."
              : "Brak pasujących rozmów."}
          </div>
        ) : (
          <div className={styles.convList}>
            {pinnedList.length > 0 ? (
              <>
                <div className={styles.groupLabel}>Przypięte</div>
                {pinnedList.map(renderRow)}
                {restList.length > 0 && (
                  <div className={styles.groupLabel}>Ostatnie</div>
                )}
                {restList.map(renderRow)}
              </>
            ) : (
              restList.map(renderRow)
            )}
          </div>
        )}
      </div>

      {/* Przesuwalny uchwyt między listą a panelem */}
      <div
        className={`${styles.resizer} ${resizing ? styles.resizerActive : ""}`}
        {...separatorProps}
      />

      {/* PRAWA: rozmowa */}
      <div className={styles.chatCol}>
        {chatError && <div className={styles.error}>⚠️ {chatError}</div>}

        {!active && (
          <div className={styles.emptyState}>
            Wybierz rozmowę z listy albo kliknij „Nowa rozmowa”, aby zacząć.
          </div>
        )}

        {active?.kind === "chat" && (
          <>
            <div className={styles.chatHeader}>
              <Avatar kind={headerKind} tone="soft" size={38} />

              <div className={styles.headerText}>
                <div className={styles.headerTitleRow}>
                  {editingTitle && hasSavedConv ? (
                    <input
                      className={styles.titleInput}
                      value={titleDraft}
                      autoFocus
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={saveTitle}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTitle();
                        if (e.key === "Escape") setEditingTitle(false);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.title}
                      title={
                        hasSavedConv ? "Kliknij, aby zmienić tytuł" : undefined
                      }
                      onClick={() => {
                        if (!hasSavedConv) return;
                        setTitleDraft(activeTitle);
                        setEditingTitle(true);
                      }}
                    >
                      {activeTitle || "Nowa rozmowa"}
                    </button>
                  )}
                </div>

                {active.convKind && (
                  <div className={styles.badges}>
                    <RunnerLabel
                      kind={active.convKind}
                      name={active.runnerName}
                      deleted={active.deleted}
                    />
                  </div>
                )}
              </div>

              <div className={styles.headerRight}>
                {msgCount > 0 && (
                  <span className={styles.counter}>
                    {msgCount === 1 ? "1 wiadomość" : `${msgCount} wiadomości`}
                  </span>
                )}
                {hasSavedConv && (
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => {
                      const conv = conversations.find((c) => c.id === selectedId);
                      if (conv) setDeleting(conv);
                    }}
                  >
                    Usuń
                  </button>
                )}
              </div>
            </div>

            <ConversationChat
              key={chatKey}
              runnerAgent={active.runner}
              assistantKind={active.convKind || "model"}
              initialMessages={active.initialMessages}
              onUserMessage={persistUser}
              onAssistantMessage={persistAssistant}
              onCountChange={handleCountChange}
              pickerSlot={
                <RunnerSelect value={runnerValue} onChange={onRunnerChange} />
              }
            />
          </>
        )}
      </div>

      {deleting && (
        <FormModal
          title="Usunąć rozmowę?"
          titleId="delete-conversation-title"
          submitLabel="Usuń rozmowę"
          savingLabel="Usuwam…"
          tone="danger"
          onSubmit={confirmDelete}
          onClose={() => setDeleting(null)}
          saving={saving}
          canSubmit
          error={null}
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
            Usuniesz rozmowę <strong>{deleting.title}</strong> wraz z całą jej
            historią wiadomości. Tej operacji nie można cofnąć.
          </p>
        </FormModal>
      )}
    </div>
  );
}
