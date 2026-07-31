"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listKnowledgeFiles, listKnowledgeUsage } from "@/lib/data/knowledge";
import { ACCEPTED_EXTENSIONS } from "@/lib/knowledge/extractText";
import { FormModal } from "@/components/workspace/FormModal";
// Rama ekranu wspolna z Projektami i Agentami; specyfika magazynu w wiedza.module.
import shell from "../projekty/workspace.module.css";
import styles from "./wiedza.module.css";

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

const STATUS_LABELS = {
  ready: { text: "Tekst wczytany", className: "statusReady" },
  no_text: { text: "Brak tekstu", className: "statusWarn" },
  error: { text: "Błąd odczytu", className: "statusError" },
};

// Agent w opisie: „Nazwa (Projekt)". Projekt bywa nullem, gdy agent stracil
// projekt w niespojnym stanie danych — wtedy sama nazwa, bez pustego nawiasu.
function agentLabel(agent) {
  const project = agent.projectName ? ` (${agent.projectName})` : "";
  const archived = agent.archived ? " — zarchiwizowany" : "";
  return `${agent.name}${project}${archived}`;
}

// MAGAZYN WIEDZY — GLOWNA ZAKLADKA.
//
// Jedna plaska pula plikow nalezaca do KONTA. Bez folderow, bez kategorii,
// bez przypisania do projektu. Agenci plikow nie posiadaja — wskazuja je
// (agents.knowledge_file_ids), a wskazac moze wielu agentow z roznych
// projektow ten sam plik.
//
// Izolacje miedzy kontami robi RLS, nie ten ekran: listKnowledgeFiles()
// i listKnowledgeUsage() nie maja ani jednego filtra po wlascicielu.
export default function KnowledgePage() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Mapa: id pliku -> agenci, ktorzy go wskazuja.
  //
  // usageError trzymamy OSOBNO od error, bo to dwie rozne awarie o roznych
  // skutkach. Nieudana lista plikow = pusty ekran (widac, ze cos nie gra).
  // Nieudane liczenie uzywajacych = ekran wyglada normalnie, a przy kazdym
  // pliku brakuje informacji, na ktorej opiera sie decyzja o skasowaniu.
  // Ta druga MUSI byc widoczna jako „nie wiadomo", nigdy jako „nikt".
  const [usage, setUsage] = useState(null);
  const [usageError, setUsageError] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);
  const inputRef = useRef(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;

    (async () => {
      // allSettled, nie all: przewrocone liczenie uzywajacych NIE MOZE
      // zabrac calej listy plikow. To dwie niezalezne informacje.
      const [filesResult, usageResult] = await Promise.allSettled([
        listKnowledgeFiles(),
        listKnowledgeUsage(),
      ]);
      if (!alive) return;

      if (filesResult.status === "fulfilled") {
        setFiles(filesResult.value);
        setError(null);
      } else {
        setError(filesResult.reason?.message || "Nie udało się wczytać plików.");
      }

      if (usageResult.status === "fulfilled") {
        setUsage(usageResult.value);
        setUsageError(null);
      } else {
        setUsage(null);
        setUsageError(
          usageResult.reason?.message ||
            "Nie udało się sprawdzić, którzy agenci używają plików.",
        );
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Agenci uzywajacy danego pliku albo null, gdy sprawdzenie sie nie udalo.
  // Rozroznienie null vs [] jest tu cala trescia funkcji.
  function agentsUsing(fileId) {
    if (usageError || !usage) return null;
    return usage.get(fileId) ?? [];
  }

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

      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Modal pokazujemy ZAWSZE — takze dla pliku, ktorego nikt nie uzywa,
  // i takze wtedy, gdy nie udalo sie tego sprawdzic. Zero uzywajacych moze
  // znaczyc „nikt go nie potrzebuje" albo „nie udalo sie policzyc"; ta sama
  // pulapka, ktora w Sesji 5 kazala pokazywac modal przy kasowaniu projektu
  // niezaleznie od licznikow.
  function startDelete(file) {
    setModalError(null);
    setDeleting(file);
  }

  const closeDelete = useCallback(() => {
    setDeleting(null);
    setModalError(null);
  }, []);

  async function confirmDelete(e) {
    e.preventDefault();
    if (!deleting || busy) return;

    setBusy(true);
    setModalError(null);
    try {
      // Kasowanie idzie TRASA, nie wprost z przegladarki. To jedyna rzecz,
      // ktora z rundy 5b zostaje w tym pliku — przeniesienie trzech krokow
      // (odpiecie od agentow, Storage, wiersz) na serwer jest poprawa samo
      // w sobie, niezaleznie od RAG: kolejnosc i komunikaty sa teraz w jednym
      // miejscu, a nie w kodzie wykonywanym w przegladarce.
      const res = await fetch(`/api/knowledge/${deleting.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Nie udało się usunąć pliku.");

      setDeleting(null);
      // Przeladowujemy TAKZE uzywajacych — odpiecie zmienilo wskazania agentow.
      reload();
    } catch (e) {
      setModalError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const deletingAgents = deleting ? agentsUsing(deleting.id) : null;

  return (
    <div className={shell.listPage}>
      <div className={shell.header}>
        <h1 className={shell.title}>Baza wiedzy</h1>
        <p className={shell.subtitle}>
          Twoje dokumenty — wspólne dla całego konta. Jeden plik może być
          używany przez wielu agentów w różnych projektach; to zawsze ten sam
          plik, nie kopia. Agenci wybierają z tej listy w swoim kreatorze.
        </p>
      </div>

      {error && (
        <div className={shell.error} role="alert">
          <div className={shell.errorTitle}>Problem z bazą wiedzy</div>
          {error}
        </div>
      )}

      {/* --- WGRYWANIE --- */}
      <div className={styles.uploadBox}>
        <p className={styles.uploadHint}>
          Obsługiwane formaty: {ACCEPTED_EXTENSIONS.join(", ")} (do 4 MB). Z
          PDF-a wyciągamy warstwę tekstową — skany bez tekstu oznaczymy statusem
          i agent nie będzie mógł z nich korzystać.
        </p>

        <input
          ref={inputRef}
          id="magazyn-upload"
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={handleUpload}
          disabled={uploading}
          style={{ display: "none" }}
        />
        <label
          htmlFor="magazyn-upload"
          className={`${styles.dropZone} ${uploading ? styles.dropZoneBusy : ""}`}
        >
          {uploading
            ? "Wgrywam i wyciągam tekst…"
            : "Kliknij, aby wgrać nowy dokument"}
        </label>
      </div>

      {/* --- OSTRZEZENIE O NIEUDANYM LICZENIU --- */}
      {!loading && usageError && (
        <div className={shell.error} role="alert">
          <div className={shell.errorTitle}>
            Nie wiadomo, którzy agenci używają tych plików
          </div>
          {usageError} Pliki możesz usuwać, ale rób to ostrożnie — nie
          potrafimy w tej chwili powiedzieć, komu odbierzesz do nich dostęp.
        </div>
      )}

      {/* --- LISTA --- */}
      {loading ? (
        <div className={shell.info}>Wczytuję magazyn…</div>
      ) : files.length === 0 ? (
        <div className={shell.info}>
          Magazyn jest pusty. Wgraj pierwszy dokument powyżej — będzie od razu
          dostępny dla wszystkich Twoich agentów.
        </div>
      ) : (
        <div className={shell.list}>
          {files.map((file) => {
            const status = STATUS_LABELS[file.status] || STATUS_LABELS.error;
            const agents = agentsUsing(file.id);

            return (
              <div key={file.id} className={styles.fileCard}>
                <div className={styles.fileMain}>
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

                  {/* Trzy stany, trzy rozne komunikaty. „Nie wiadomo" nigdy
                      nie moze wygladac jak „nikt nie uzywa". */}
                  {agents === null ? (
                    <span
                      className={`${styles.usage} ${styles.usageUnknown}`}
                    >
                      Nie udało się sprawdzić, którzy agenci go używają.
                    </span>
                  ) : agents.length === 0 ? (
                    <span className={`${styles.usage} ${styles.usageNone}`}>
                      Nie używa go żaden agent.
                    </span>
                  ) : (
                    <span className={styles.usage}>
                      Używają:{" "}
                      {agents.map((agent) => (
                        <span
                          key={agent.id}
                          className={`${styles.agentTag} ${
                            agent.archived ? styles.agentTagArchived : ""
                          }`}
                        >
                          {agentLabel(agent)}
                        </span>
                      ))}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className={shell.dangerButton}
                  onClick={() => startDelete(file)}
                  disabled={busy}
                >
                  Usuń
                </button>
              </div>
            );
          })}
        </div>
      )}

      {deleting && (
        <FormModal
          title="Trwale usunąć plik?"
          titleId="delete-file-modal-title"
          submitLabel="Usuń trwale"
          savingLabel="Usuwam…"
          tone="danger"
          onSubmit={confirmDelete}
          onClose={closeDelete}
          saving={busy}
          canSubmit
          error={modalError}
        >
          <p className={shell.confirmText}>
            Usuniesz plik <strong>{deleting.file_name}</strong> z magazynu.
            Zniknie z konta na stałe, razem z zawartością w Storage.
          </p>

          {/* Trzy warianty, dokladnie te same trzy stany co na liscie. */}
          {deletingAgents === null ? (
            <p className={shell.confirmWarning}>
              Nie udało się sprawdzić, którzy agenci używają tego pliku. Możesz
              odebrać wiedzę agentom, o których nie wiemy — jeśli to możliwe,
              odśwież stronę i spróbuj ponownie.
            </p>
          ) : deletingAgents.length === 0 ? (
            <p className={shell.confirmText}>
              Nie używa go żaden agent — nikt nie straci do niego dostępu.
            </p>
          ) : (
            <>
              <p className={shell.confirmText}>
                Stracą do niego dostęp:
              </p>
              <ul className={styles.modalAgentList}>
                {deletingAgents.map((agent) => (
                  <li key={agent.id}>{agentLabel(agent)}</li>
                ))}
              </ul>
              <p className={shell.confirmText}>
                Odepniemy plik od tych agentów automatycznie. Będą działać
                dalej, ale bez wiedzy z tego dokumentu.
              </p>
            </>
          )}

          <p className={shell.confirmWarning}>
            Tej operacji nie można cofnąć.
          </p>
        </FormModal>
      )}
    </div>
  );
}
