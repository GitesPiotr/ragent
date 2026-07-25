"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { RunnerLabel } from "./RunnerPicker";
import styles from "./chats.module.css";

// Mala pinezka przy przypietej rozmowie.
function PinIcon() {
  return (
    <svg
      className={styles.pinIcon}
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16 3a1 1 0 0 1 .7 1.7L15 6.4V11l2.3 2.3a1 1 0 0 1-.7 1.7H13v5a1 1 0 0 1-2 0v-5H7.4a1 1 0 0 1-.7-1.7L9 11V6.4L7.3 4.7A1 1 0 0 1 8 3h8Z" />
    </svg>
  );
}

// Jedna pozycja listy rozmow: obszar otwierania + przycisk „⋯" z menu akcji
// (zmien nazwe / przypnij-odepnij / usun) oraz edycja nazwy inline.
export function ConversationRow({
  conv,
  active,
  kind,
  runnerName,
  deleted,
  formatDate,
  onOpen,
  onRename,
  onTogglePin,
  onDelete,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);

  const menuBtnRef = useRef(null);
  const menuRef = useRef(null);

  const actions = [
    { key: "rename", label: "Zmień nazwę", run: startRename },
    {
      key: "pin",
      label: conv.pinned ? "Odepnij" : "Przypnij",
      run: () => {
        setMenuOpen(false);
        onTogglePin(conv);
      },
    },
    {
      key: "delete",
      label: "Usuń",
      danger: true,
      run: () => {
        setMenuOpen(false);
        onDelete(conv);
      },
    },
  ];

  function openMenu() {
    const r = menuBtnRef.current?.getBoundingClientRect();
    if (r) {
      // Fixed — nie przycina go overflow listy. Prawa krawedz menu przy
      // przycisku (rosnie w lewo); jesli malo miejsca na dole, otwiera do gory.
      const pos = { right: window.innerWidth - r.right };
      if (window.innerHeight - r.bottom < 170) {
        pos.bottom = window.innerHeight - r.top + 4;
      } else {
        pos.top = r.bottom + 4;
      }
      setMenuPos(pos);
    }
    setActiveIndex(0);
    setMenuOpen(true);
  }

  function startRename() {
    setMenuOpen(false);
    setDraft(conv.title);
    setEditing(true);
  }

  function commitRename() {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== conv.title) onRename(conv, t);
  }

  // Zamykanie menu: klik poza, Escape. Focus na menu dla klawiatury.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        menuBtnRef.current &&
        !menuBtnRef.current.contains(e.target)
      ) {
        setMenuOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    const id = requestAnimationFrame(() => menuRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(id);
    };
  }, [menuOpen]);

  function onMenuKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(actions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      actions[activeIndex]?.run();
    }
  }

  // Tryb edycji nazwy — pole w miejscu pozycji.
  if (editing) {
    return (
      <div
        className={`${styles.convItem} ${active ? styles.convItemActive : ""}`}
      >
        <Avatar kind={kind} tone="soft" size={30} />
        <input
          className={styles.renameInput}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${styles.convItem} ${active ? styles.convItemActive : ""} ${
        menuOpen ? styles.convItemMenuOpen : ""
      }`}
    >
      <button
        type="button"
        className={styles.convOpen}
        onClick={() => onOpen(conv)}
      >
        <Avatar kind={kind} tone="soft" size={30} />
        <span className={styles.convText}>
          <span className={styles.convTitle}>
            {conv.pinned && <PinIcon />}
            {conv.title}
          </span>
          <span className={styles.convMeta}>
            <RunnerLabel
              kind={kind}
              name={runnerName}
              deleted={deleted}
              compact
              className={styles.runnerGrow}
            />
            <span className={styles.convDate}>· {formatDate(conv.updated_at)}</span>
          </span>
        </span>
      </button>

      <button
        ref={menuBtnRef}
        type="button"
        className={styles.convMenuBtn}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Akcje rozmowy"
        onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
      >
        ⋯
      </button>

      {menuOpen && menuPos && (
        <div
          ref={menuRef}
          className={styles.actionMenu}
          role="menu"
          tabIndex={-1}
          style={menuPos}
          onKeyDown={onMenuKeyDown}
        >
          {actions.map((a, i) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              className={`${styles.actionItem} ${
                a.danger ? styles.actionDanger : ""
              } ${i === activeIndex ? styles.actionItemActive : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={a.run}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
