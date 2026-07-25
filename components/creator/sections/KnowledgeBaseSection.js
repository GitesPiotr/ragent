"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import { listKnowledgeFiles, deleteKnowledgeFile } from "@/lib/data/knowledge";
import { ACCEPTED_EXTENSIONS } from "@/lib/knowledge/extractText";
import styles from "./sections.module.css";

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

// Status ekstrakcji w czytelnej formie.
const STATUS_LABELS = {
  ready: { text: "Tekst wczytany", className: "statusReady" },
  no_text: { text: "Brak tekstu", className: "statusWarn" },
  error: { text: "Błąd odczytu", className: "statusError" },
};

export function KnowledgeBaseSection() {
  // Pliki wiedzy naleza do PROJEKTU — bierzemy go z adresu.
  const params = useParams();
  const projectId = params?.projectId;

  const { state, dispatch } = useAppState();
  const agent = state.agent;
  const mode = agent.knowledge_mode || "none";
  const selectedIds = Array.isArray(agent.knowledge_file_ids)
    ? agent.knowledge_file_ids
    : [];

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const inputRef = useRef(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;

    (async () => {
      try {
        const data = await listKnowledgeFiles(projectId);
        if (!alive) return;
        setFiles(data);
        setError(null);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [projectId, reloadKey]);

  function changeField(field, value, action) {
    dispatch(updateAgentField(field, value));
    dispatch(setActivity("config-changed"));
    dispatch(setLastEvent({ type: "config-changed", field, action }));
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("projectId", projectId);
      form.append("file", file);

      const res = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Nie udało się wgrać pliku.");

      // Pierwszy wgrany plik: wlaczamy tryb "wszystkie", zeby agent
      // od razu z niego korzystal (bez tego wiedza lezalaby nieuzywana).
      if (mode === "none") changeField("knowledge_mode", "all", "auto-all");

      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(file) {
    setError(null);
    try {
      await deleteKnowledgeFile(file);
      // Sprzatamy tez wybor agenta, zeby nie wskazywal nieistniejacego pliku.
      if (selectedIds.includes(file.id)) {
        changeField(
          "knowledge_file_ids",
          selectedIds.filter((id) => id !== file.id),
          "remove-selected",
        );
      }
      reload();
    } catch (e) {
      setError(e.message);
    }
  }

  function toggleSelected(fileId) {
    const next = selectedIds.includes(fileId)
      ? selectedIds.filter((id) => id !== fileId)
      : [...selectedIds, fileId];
    changeField("knowledge_file_ids", next, "toggle-file");
  }

  const readyCount = files.filter((f) => f.status === "ready").length;

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">📚</span> Baza wiedzy
        </h2>
        <p className={styles.subtitle}>
          Twoje dokumenty, z których korzysta agent. Treść plików trafia do jego
          instrukcji, więc odpowiada na ich podstawie, a nie z ogólnej wiedzy.
        </p>
      </div>

      {error && (
        <div className={styles.errorBox} role="alert">
          {error}
        </div>
      )}

      {/* --- WGRYWANIE --- */}
      <div className={styles.field}>
        <span className={styles.label}>Dodaj dokument</span>
        <span className={styles.hint}>
          Obsługiwane formaty: {ACCEPTED_EXTENSIONS.join(", ")} (do 4 MB). Z PDF-a
          wyciągamy warstwę tekstową — skany bez tekstu oznaczymy statusem.
        </span>

        <input
          ref={inputRef}
          id="knowledge-upload"
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={handleUpload}
          disabled={uploading || !projectId}
          style={{ display: "none" }}
        />
        <label
          htmlFor="knowledge-upload"
          className={`${styles.dropZone} ${uploading ? styles.dropZoneBusy : ""}`}
        >
          {uploading
            ? "Wgrywam i wyciągam tekst…"
            : "Kliknij, aby wybrać plik z dysku"}
        </label>
      </div>

      {/* --- TRYB KORZYSTANIA --- */}
      <div className={styles.field}>
        <span className={styles.label}>Z czego korzysta ten agent</span>
        <div className={styles.segmented}>
          {[
            { id: "none", label: "Nie korzysta" },
            { id: "all", label: "Wszystkie pliki" },
            { id: "selected", label: "Wybrane pliki" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.segment} ${
                mode === option.id ? styles.segmentActive : ""
              }`}
              onClick={() =>
                changeField("knowledge_mode", option.id, "knowledge-mode")
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === "all" && readyCount > 0 && (
          <span className={styles.hint} style={{ marginTop: 8 }}>
            Agent korzysta ze wszystkich {readyCount} plików z wczytanym tekstem.
          </span>
        )}
        {mode === "selected" && (
          <span className={styles.hint} style={{ marginTop: 8 }}>
            Zaznacz poniżej pliki, z których agent ma korzystać (wybrane:{" "}
            {selectedIds.length}).
          </span>
        )}
        {mode === "none" && (
          <span className={styles.hint} style={{ marginTop: 8 }}>
            Agent ignoruje bazę wiedzy — pliki zostają w projekcie, ale nie
            trafiają do jego instrukcji.
          </span>
        )}
      </div>

      {/* --- LISTA PLIKOW --- */}
      <div className={styles.field}>
        <span className={styles.label}>Pliki w projekcie ({files.length})</span>

        {loading ? (
          <div className={styles.empty}>Wczytuję pliki…</div>
        ) : files.length === 0 ? (
          <div className={styles.empty}>
            Brak plików. Wgraj pierwszy dokument powyżej.
          </div>
        ) : (
          <div className={styles.list}>
            {files.map((file) => {
              const status = STATUS_LABELS[file.status] || STATUS_LABELS.error;
              const checkable = mode === "selected" && file.status === "ready";

              return (
                <div key={file.id} className={styles.fileRow}>
                  {checkable && (
                    <input
                      type="checkbox"
                      className={styles.fileCheck}
                      checked={selectedIds.includes(file.id)}
                      onChange={() => toggleSelected(file.id)}
                      aria-label={`Używaj pliku ${file.file_name}`}
                    />
                  )}

                  <span className={styles.fileInfo}>
                    <span className={styles.fileName}>{file.file_name}</span>
                    <span className={styles.fileMeta}>
                      {formatSize(file.size)} · {formatDate(file.created_at)} ·{" "}
                      <span className={styles[status.className]}>
                        {status.text}
                      </span>
                    </span>
                    {file.status_message && (
                      <span className={styles.fileNote}>
                        {file.status_message}
                      </span>
                    )}
                  </span>

                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => handleDelete(file)}
                  >
                    Usuń
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
