"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  listProjects,
  createProject,
  updateProject,
  archiveProject,
  restoreProject,
  deleteProject,
  getProjectContentCounts,
} from "@/lib/data/projects";
import { FormModal } from "@/components/workspace/FormModal";
import styles from "./workspace.module.css";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

// Odmiana w narzedniku ("wraz z ..."): 1 agentem / N agentami.
//
// Plikow wiedzy juz tu nie odmieniamy — nie znikaja razem z projektem.
// Naleza do konta i zostaja w magazynie, o czym modal mowi wprost.
function agentsPhrase(count) {
  return count === 1 ? "1 agentem" : `${count} agentami`;
}

// Pusty projekt dostaje wlasne zdanie w oknie potwierdzenia — inaczej
// zdanie skonczylo by sie na „wraz z 0 agentami”, co czyta sie zle.
function isProjectEmpty(counts) {
  return !(counts?.agents > 0);
}

// Modal tworzenia i edycji projektu — te same pola, inne etykiety.
// Obudowa (X, Escape, klik w tlo, Anuluj) siedzi w FormModal.
function ProjectModal({
  title,
  submitLabel,
  idPrefix,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onSubmit,
  onClose,
  saving,
  error,
}) {
  return (
    <FormModal
      title={title}
      titleId={`${idPrefix}-modal-title`}
      submitLabel={submitLabel}
      onSubmit={onSubmit}
      onClose={onClose}
      saving={saving}
      canSubmit={Boolean(name.trim())}
      error={error}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${idPrefix}-name`}>
          Nazwa (wymagana)
        </label>
        <input
          id={`${idPrefix}-name`}
          className={styles.input}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="np. Obsługa klienta"
          disabled={saving}
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${idPrefix}-description`}>
          Opis
        </label>
        <textarea
          id={`${idPrefix}-description`}
          className={styles.textarea}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Do czego służy ten projekt?"
          disabled={saving}
        />
      </div>
    </FormModal>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  // Formularz tworzenia (modal).
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Edycja w modalu — id aktualnie edytowanego projektu + wartosci pol.
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Trwale usuniecie: projekt czekajacy na potwierdzenie w modalu wraz
  // z licznikiem jego zawartosci. Modal pokazujemy ZAWSZE, takze dla
  // projektu pustego — uzasadnienie przy startDelete().
  const [deleting, setDeleting] = useState(null);
  const [deleteCounts, setDeleteCounts] = useState(null);

  // Blad zapisu z modala — pokazujemy go w modalu, nie nad lista.
  const [modalError, setModalError] = useState(null);

  // Licznik wymuszajacy ponowne pobranie danych (po zapisie / kliknieciu Odswiez).
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // TEST POLACZENIA: to jest pierwsze zapytanie do Supabase po wejsciu do apki.
  // Jesli klucze/tabele sa zle, uzytkownik zobaczy komunikat, nie bialy ekran.
  // Stan ustawiamy dopiero PO await (nie synchronicznie w ciele efektu).
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const data = await listProjects({ includeArchived });
        if (!alive) return;
        setProjects(data);
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
  }, [includeArchived, reloadKey]);

  function openCreate() {
    setNewName("");
    setNewDescription("");
    setModalError(null);
    setCreateOpen(true);
  }

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setModalError(null);
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || saving) return;

    setSaving(true);
    setModalError(null);
    try {
      await createProject({ name: newName, description: newDescription });
      setNewName("");
      setNewDescription("");
      setCreateOpen(false);
      reload();
    } catch (e) {
      setModalError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(project) {
    setEditingId(project.id);
    setEditName(project.name);
    setEditDescription(project.description || "");
    setModalError(null);
  }

  const closeEdit = useCallback(() => {
    setEditingId(null);
    setModalError(null);
  }, []);

  async function saveEdit(e) {
    e.preventDefault();
    if (!editName.trim() || saving) return;

    setSaving(true);
    setModalError(null);
    try {
      await updateProject(editingId, {
        name: editName,
        description: editDescription,
      });
      setEditingId(null);
      reload();
    } catch (e) {
      setModalError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Liczniki sluza WYLACZNIE do tresci komunikatu — nigdy do decyzji, czy
  // pytac o potwierdzenie. Modal pokazujemy ZAWSZE.
  //
  // Wczesniej przy zerowych licznikach projekt kasowal sie od razu, bez
  // pytania („pusty projekt nie ma czego stracic”). Po wlaczeniu RLS (Sesja 4)
  // to zalozenie stalo sie niebezpieczne: nieudane zapytanie NIE rzuca bledem,
  // tylko zwraca zero. Zepsuty odczyt licznikow zamienial sie wiec w ciche,
  // nieodwracalne skasowanie projektu razem z agentami i plikami wiedzy.
  //
  // Teraz najgorsze, co moze zrobic zly licznik, to pokazac nieprawdziwa
  // tresc w oknie — a nie skasowac dane bez pytania.
  async function startDelete(project) {
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      const counts = await getProjectContentCounts(project.id);
      setDeleteCounts(counts);
      setModalError(null);
      setDeleting(project);
    } catch (e) {
      // Brak modala na ekranie, wiec blad liczenia pokazujemy nad lista.
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const closeDelete = useCallback(() => {
    setDeleting(null);
    setDeleteCounts(null);
    setModalError(null);
  }, []);

  // TRWALE usuniecie projektu wraz z agentami (agenci -> projekt) wykonuje
  // deleteProject; tu tylko obsluga UI i bledow. Pliki wiedzy zostaja
  // w magazynie konta — nie sa czescia projektu.
  async function confirmDelete(e) {
    e.preventDefault();
    if (!deleting || saving) return;

    setSaving(true);
    setModalError(null);
    try {
      await deleteProject(deleting.id);
      setDeleting(null);
      setDeleteCounts(null);
      reload();
    } catch (e) {
      setModalError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(project) {
    setSaving(true);
    setError(null);
    try {
      if (project.status === "archived") await restoreProject(project.id);
      else await archiveProject(project.id);
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.listPage}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Projekty</h1>
          <p className={styles.subtitle}>
            Projekt to kontener na agentów. Wejdź w projekt, aby zarządzać jego
            agentami.
          </p>
        </div>
        <button
          type="button"
          className={`${styles.primaryButton} ${styles.headerAction}`}
          onClick={openCreate}
        >
          Nowy projekt
        </button>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          <div className={styles.errorTitle}>Problem z połączeniem z bazą</div>
          {error}
        </div>
      )}

      <div className={styles.toolbar}>
        <label className={styles.toggleArchived}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setLoading(true);
              setIncludeArchived(e.target.checked);
            }}
          />
          Pokaż archiwalne
        </label>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={reload}
          disabled={loading}
        >
          Odśwież
        </button>
      </div>

      {loading ? (
        <div className={styles.info}>Wczytuję projekty…</div>
      ) : projects.length === 0 ? (
        <div className={styles.info}>
          {includeArchived
            ? "Brak projektów."
            : "Nie masz jeszcze żadnego projektu. Kliknij „Nowy projekt”, aby utworzyć pierwszy."}
        </div>
      ) : (
        <div className={styles.list}>
          {projects.map((project) => {
            const archived = project.status === "archived";

            return (
              <div
                key={project.id}
                className={`${styles.card} ${archived ? styles.cardArchived : ""}`}
              >
                <div className={styles.cardTop}>
                  <h2 className={styles.cardTitle}>
                    <Link
                      href={`/projekty/${project.id}/agenty`}
                      className={styles.cardTitleLink}
                    >
                      {project.name}
                    </Link>
                  </h2>
                  {archived && <span className={styles.badge}>Archiwum</span>}
                </div>

                {project.description && (
                  <p className={styles.cardDesc}>{project.description}</p>
                )}

                <div className={styles.cardMeta}>
                  Zmodyfikowano: {formatDate(project.updated_at)}
                </div>

                <div className={styles.cardActions}>
                  <Link
                    href={`/projekty/${project.id}/agenty`}
                    className={styles.ghostButton}
                  >
                    Otwórz agentów →
                  </Link>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => startEdit(project)}
                    disabled={saving}
                  >
                    Edytuj
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => toggleArchive(project)}
                    disabled={saving}
                  >
                    {archived ? "Przywróć" : "Archiwizuj"}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => startDelete(project)}
                    disabled={saving}
                  >
                    Usuń trwale
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <ProjectModal
          title="Nowy projekt"
          submitLabel="Utwórz projekt"
          idPrefix="create-project"
          name={newName}
          description={newDescription}
          onNameChange={setNewName}
          onDescriptionChange={setNewDescription}
          onSubmit={handleCreate}
          onClose={closeCreate}
          saving={saving}
          error={modalError}
        />
      )}

      {deleting && (
        <FormModal
          title="Trwale usunąć projekt?"
          titleId="delete-project-modal-title"
          submitLabel="Usuń trwale"
          savingLabel="Usuwam…"
          tone="danger"
          onSubmit={confirmDelete}
          onClose={closeDelete}
          saving={saving}
          canSubmit
          error={modalError}
        >
          {/* Projekt bez agentow wymaga innego zdania — inaczej wyszlo by
              „wraz z 0 agentami”. */}
          {isProjectEmpty(deleteCounts) ? (
            <p className={styles.confirmText}>
              Usuniesz projekt <strong>{deleting.name}</strong>. Nie ma w nim
              żadnych agentów.
            </p>
          ) : (
            <p className={styles.confirmText}>
              Usuniesz projekt <strong>{deleting.name}</strong> wraz z{" "}
              <strong>{agentsPhrase(deleteCounts.agents)}</strong>.
            </p>
          )}
          {/* Pliki wiedzy naleza do konta, nie do projektu. Mowimy to wprost:
              uzytkownik, ktory przez pol roku wgrywal pliki „do projektu”,
              musi zobaczyc, ze ich NIE traci. */}
          <p className={styles.confirmText}>
            Pliki wiedzy <strong>zostaną</strong> — należą do Twojego konta, nie
            do projektu, i nadal będą dostępne dla agentów w innych projektach.
          </p>
          <p className={styles.confirmWarning}>
            Tej operacji nie można cofnąć. Jeśli chcesz tylko schować projekt z
            listy, użyj „Archiwizuj”.
          </p>
        </FormModal>
      )}

      {editingId && (
        <ProjectModal
          title="Edytuj projekt"
          submitLabel="Zapisz"
          idPrefix="edit-project"
          name={editName}
          description={editDescription}
          onNameChange={setEditName}
          onDescriptionChange={setEditDescription}
          onSubmit={saveEdit}
          onClose={closeEdit}
          saving={saving}
          error={modalError}
        />
      )}
    </div>
  );
}
