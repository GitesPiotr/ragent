"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import { listKnowledgeFiles } from "@/lib/data/knowledge";
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

// SEKCJA "BAZA WIEDZY" W KREATORZE — WYBOR, NIE POSIADANIE.
//
// Pula plikow to caly magazyn KONTA, nie pliki jednego projektu. Agent
// niczego tu nie posiada: zaznacza, z ktorych plikow ma korzystac
// (agents.knowledge_file_ids). Ten sam plik moze byc zaznaczony przez wielu
// agentow w roznych projektach — to jeden obiekt i jeden wiersz, bez kopii.
//
// CZEGO TU CELOWO NIE MA: PRZYCISKU "USUN" PRZY PLIKU.
//
// Wczesniej kasowal plik projektu. Przy puli calego konta kasowalby go
// CALEMU KONTU — nowicjusz usuwajacy "swoj" plik z jednego agenta zabralby
// go po cichu wszystkim pozostalym. Kasowanie zyje wylacznie w zakladce
// "Baza wiedzy", gdzie modal wymienia z nazwy agentow, ktorzy plik traca.
//
// CZEGO TU JUZ NIE MA: TRYBU "WSZYSTKIE PLIKI".
//
// Znaczyl "wszystkie pliki tego projektu". W magazynie konta znaczylby
// "wszystko, co mam" — zakres wiedzy agenta rosnacy sam przy kazdym
// uploadzie. Zostaly dwa stany: nie korzysta / korzysta z wybranych.
export function KnowledgeBaseSection() {
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
    let alive = true;

    (async () => {
      try {
        // Bez argumentu — caly magazyn konta. Zawezenie do wlasciciela
        // robi RLS po stronie bazy, nie ten kod.
        const data = await listKnowledgeFiles();
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
  }, [reloadKey]);

  function changeField(field, value, action) {
    dispatch(updateAgentField(field, value));
    dispatch(setActivity("config-changed"));
    dispatch(setLastEvent({ type: "config-changed", field, action }));
  }

  // Wgrywanie WPROST DO MAGAZYNU, z poziomu kreatora.
  //
  // Alternatywa — odeslanie uzytkownika do zakladki "Baza wiedzy" — jest
  // pulapka: strona agenta przy kazdym montazu wczytuje go z bazy i nadpisuje
  // state.agent, a kreator nie ma autosave. Wyjscie w trakcie konfiguracji
  // i powrot skasowalyby niezapisane zmiany, i to bez ostrzezenia
  // (beforeunload lapie tylko zamkniecie karty, nie nawigacje w aplikacji).
  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Nie udało się wgrać pliku.");

      // Swiezo wgrany plik od razu zaznaczamy dla TEGO agenta. Bez tego
      // wgranie wygladaloby jak brak efektu: plik lezalby w magazynie,
      // a agent i tak by go nie czytal. To nastepca dawnego automatycznego
      // wlaczania trybu "wszystkie pliki" — ten sam odruch, ale zamyka sie
      // na jednym pliku zamiast na calym magazynie.
      const uploaded = data.file;
      if (uploaded?.id && uploaded.status === "ready") {
        if (!selectedIds.includes(uploaded.id)) {
          changeField(
            "knowledge_file_ids",
            [...selectedIds, uploaded.id],
            "auto-select-uploaded",
          );
        }
        if (mode !== "selected") {
          changeField("knowledge_mode", "selected", "auto-select-uploaded");
        }
      }

      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function toggleSelected(fileId) {
    const next = selectedIds.includes(fileId)
      ? selectedIds.filter((id) => id !== fileId)
      : [...selectedIds, fileId];
    changeField("knowledge_file_ids", next, "toggle-file");
  }

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">📚</span> Baza wiedzy
        </h2>
        <p className={styles.subtitle}>
          Dokumenty z Twojego magazynu, z których ma korzystać ten agent. Treść
          zaznaczonych plików trafia do jego instrukcji, więc odpowiada na ich
          podstawie, a nie z ogólnej wiedzy. Magazyn jest wspólny dla całego
          konta — ten sam plik może wskazać wielu agentów w różnych projektach.
        </p>
      </div>

      {error && (
        <div className={styles.errorBox} role="alert">
          {error}
        </div>
      )}

      {/* --- WGRYWANIE DO MAGAZYNU --- */}
      <div className={styles.field}>
        <span className={styles.label}>Wgraj nowy plik do magazynu</span>
        <span className={styles.hint}>
          Plik trafia do Twojego magazynu wiedzy (nie do tego projektu) i od
          razu zaznaczamy go dla tego agenta. Obsługiwane formaty:{" "}
          {ACCEPTED_EXTENSIONS.join(", ")} (do 4 MB). Z PDF-a wyciągamy warstwę
          tekstową — skany bez tekstu oznaczymy statusem.
        </span>

        <input
          ref={inputRef}
          id="knowledge-upload"
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={handleUpload}
          disabled={uploading}
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
            { id: "selected", label: "Korzysta z wybranych" },
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

        {/* Tryb „z wybranych" i zero zaznaczonych to stan, ktory WYGLADA
            na wlaczona wiedze, a dziala jak wylaczona. Mowimy o tym wprost,
            zamiast pokazywac spokojne „wybrane: 0". */}
        {mode === "selected" && selectedIds.length === 0 && files.length > 0 && (
          <span className={styles.note}>
            Nie zaznaczyłeś ani jednego pliku, więc agent nadal nie korzysta z
            żadnej wiedzy. Zaznacz poniżej te dokumenty, które ma czytać.
          </span>
        )}
        {mode === "selected" && selectedIds.length > 0 && (
          <span className={styles.hint} style={{ marginTop: 8 }}>
            Agent czyta {selectedIds.length}{" "}
            {selectedIds.length === 1 ? "zaznaczony plik" : "zaznaczone pliki"}{" "}
            z magazynu. Pozostałe go nie dotyczą.
          </span>
        )}
        {mode === "none" && (
          <span className={styles.hint} style={{ marginTop: 8 }}>
            Agent ignoruje bazę wiedzy — pliki zostają w magazynie, ale nie
            trafiają do jego instrukcji.
          </span>
        )}
      </div>

      {/* --- MAGAZYN KONTA --- */}
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <span className={styles.label}>
            Twój magazyn wiedzy ({files.length})
          </span>

          {/* NOWA KARTA, i to nie jest ozdobnik.
              Kreator nie ma autosave, a strona agenta przy kazdym montazu
              wczytuje go z bazy i nadpisuje state.agent. Zwykly link
              wyprowadzilby uzytkownika ze srodka konfiguracji i po powrocie
              skasowalby jego niezapisane zmiany — bez ostrzezenia, bo
              beforeunload lapie tylko zamkniecie karty, nie nawigacje
              wewnatrz aplikacji. Nowa karta zostawia kreator zamontowany. */}
          <a
            href="/wiedza"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.manageLink}
          >
            Zarządzaj magazynem ↗
          </a>
        </div>

        {loading ? (
          <div className={styles.empty}>Wczytuję pliki…</div>
        ) : files.length === 0 ? (
          <div className={styles.empty}>
            Magazyn jest pusty. Wgraj pierwszy dokument powyżej — będzie
            dostępny dla wszystkich Twoich agentów, nie tylko dla tego.
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
