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
function agentsPhrase(count) {
  return count === 1 ? "1 agentem" : `${count} agentami`;
}

function filesPhrase(count) {
  return count === 1 ? "1 plikiem wiedzy" : `${count} plikami wiedzy`;
}

// Co zniknie razem z projektem. Pomijamy zerowe skladniki — modal pokazuje sie
// tylko dla projektu z zawartoscia, ale jedna z dwoch liczb moze byc zerem
// (np. same pliki, bez agentow) i "wraz z 0 agentami" czytaloby sie zle.
function contentsPhrase(counts) {
  const parts = [];
  if (counts?.agents > 0) parts.push(agentsPhrase(counts.agents));
  if (counts?.knowledgeFiles > 0) parts.push(filesPhrase(counts.knowledgeFiles));
  return parts.join(" i ");
}

// Pusty projekt dostaje wlasne zdanie w oknie potwierdzenia — contentsPhrase()
// zwrocilo by dla niego pusty string, a zdanie skonczylo by sie na „wraz z .”.
function isProjectEmpty(counts) {
  return !(counts?.agents > 0) && !(counts?.knowledgeFiles > 0);
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
  // z licznikami jego zawartosci. Pusty projekt kasujemy bez modala.
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

  // TRWALE usuniecie projektu z cala zawartoscia. Kaskade (Storage -> pliki ->
  // agenci -> projekt) wykonuje deleteProject; tu tylko obsluga UI i bledow.
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
          {/* Projekt bez zawartosci wymaga innego zdania — contentsPhrase()
              zwraca wtedy pusty string i wyszlo by „wraz z .”. */}
          {isProjectEmpty(deleteCounts) ? (
            <p className={styles.confirmText}>
              Usuniesz projekt <strong>{deleting.name}</strong>. Nie ma w nim
              żadnych agentów ani plików wiedzy.
            </p>
          ) : (
            <p className={styles.confirmText}>
              Usuniesz projekt <strong>{deleting.name}</strong> wraz z{" "}
              <strong>{contentsPhrase(deleteCounts)}</strong>.
              {deleteCounts?.knowledgeFiles > 0 &&
                " Pliki zostaną skasowane także z magazynu (Storage)."}
            </p>
          )}
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
