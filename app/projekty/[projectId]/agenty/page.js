"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  listAgents,
  createAgent,
  updateAgent,
  archiveAgent,
  restoreAgent,
  deleteAgent,
} from "@/lib/data/agents";
import { getProject } from "@/lib/data/projects";
import { useSettings } from "@/lib/settings/SettingsContext";
import { useDopuszczone } from "@/lib/settings/DopuszczoneContext";
import { rozstrzygnij, zPrzypisania, ZRODLO } from "@/lib/settings/przypisaniaModeli";
import { FormModal } from "@/components/workspace/FormModal";
import { BackButton } from "@/components/workspace/BackButton";
import styles from "../../workspace.module.css";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

// Modal tworzenia i edycji agenta — te same pola, inne etykiety.
// Obudowa (X, Escape, klik w tlo, Anuluj) siedzi w FormModal.
function AgentModal({
  title,
  submitLabel,
  idPrefix,
  name,
  role,
  description,
  onNameChange,
  onRoleChange,
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
          placeholder="np. Asystent ofertowy"
          disabled={saving}
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${idPrefix}-role`}>
          Rola
        </label>
        <input
          id={`${idPrefix}-role`}
          className={styles.input}
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          placeholder="np. Specjalista ds. ofert"
          disabled={saving}
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
          placeholder="Czym zajmuje się ten agent?"
          disabled={saving}
        />
      </div>
    </FormModal>
  );
}

export default function AgentsPage() {
  // Aktywny projekt wynika WYLACZNIE z URL — zadnego localStorage.
  const params = useParams();
  const projectId = params?.projectId;

  const [project, setProject] = useState(null);
  const { settings } = useSettings();
  const { przypisania } = useDopuszczone();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  // Formularz tworzenia (modal).
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Edycja w modalu — id aktualnie edytowanego agenta + wartosci pol.
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Trwale usuniecie — agent oczekujacy na potwierdzenie w modalu.
  const [deleting, setDeleting] = useState(null);

  // Blad zapisu z modala — pokazujemy go w modalu, nie nad lista.
  const [modalError, setModalError] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // Stan ustawiamy dopiero PO await (nie synchronicznie w ciele efektu).
  useEffect(() => {
    if (!projectId) return;
    let alive = true;

    (async () => {
      try {
        // Naglowek projektu + jego agenci. Projekt pobieramy osobno,
        // bo relacja jest plaska (agents.project_id -> projects.id).
        const [projectData, agentsData] = await Promise.all([
          getProject(projectId),
          listAgents(projectId, { includeArchived }),
        ]);
        if (!alive) return;
        setProject(projectData);
        setAgents(agentsData);
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
  }, [projectId, includeArchived, reloadKey]);

  function openCreate() {
    setNewName("");
    setNewRole("");
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
      // DOMYSLNY MODEL NOWEGO AGENTA — kolejnosc z rundy 8:
      //   1. przypisanie `agent_domyslny` z bazy,
      //   2. settings.defaultProvider/defaultModel z localStorage,
      //   3. stale z lib/settings/defaults.js (w nich zaszyte w DEFAULT_SETTINGS,
      //      wiec `settings` nigdy nie jest puste i trzeci szczebel jest tu
      //      juz wliczony w drugi).
      //
      // Temperatura NIE jest czescia przypisania — model_assignments trzyma
      // pare (dostawca, model) i tylko ja. Zostaje z Ustawien.
      const domyslny = rozstrzygnij([
        zPrzypisania(przypisania, "agent_domyslny"),
        {
          zrodlo: ZRODLO.USTAWIENIA,
          provider: settings.defaultProvider,
          model: settings.defaultModel,
        },
      ]);

      await createAgent(projectId, {
        name: newName,
        description: newDescription,
        role: newRole,
        provider: domyslny.provider,
        model: domyslny.model,
        temperature: settings.defaultTemperature,
      });
      setNewName("");
      setNewRole("");
      setNewDescription("");
      setCreateOpen(false);
      reload();
    } catch (e) {
      setModalError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(agent) {
    setEditingId(agent.id);
    setEditName(agent.name);
    setEditRole(agent.role || "");
    setEditDescription(agent.description || "");
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
      await updateAgent(editingId, {
        name: editName,
        role: editRole,
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

  function startDelete(agent) {
    setDeleting(agent);
    setModalError(null);
  }

  const closeDelete = useCallback(() => {
    setDeleting(null);
    setModalError(null);
  }, []);

  // TRWALE usuniecie agenta — nieodwracalne, stad osobne potwierdzenie.
  async function confirmDelete(e) {
    e.preventDefault();
    if (!deleting || saving) return;

    setSaving(true);
    setModalError(null);
    try {
      await deleteAgent(deleting.id);
      setDeleting(null);
      reload();
    } catch (e) {
      setModalError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(agent) {
    setSaving(true);
    setError(null);
    try {
      if (agent.status === "archived") await restoreAgent(agent.id);
      else await archiveAgent(agent.id);
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.listPage}>
      <div>
        <div className={styles.backRow}>
          <BackButton href="/projekty">Wszystkie projekty</BackButton>
        </div>
        <div className={styles.headerRow}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>
              Agenty{project ? ` — ${project.name}` : ""}
            </h1>
            <p className={styles.subtitle}>
              {project?.description ||
                "Agenci należący do tego projektu. Kliknij „Konfiguruj”, aby ustawić osobowość, model, zasady i wiedzę agenta."}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.primaryButton} ${styles.headerAction}`}
            onClick={openCreate}
          >
            Nowy agent
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          <div className={styles.errorTitle}>Problem z połączeniem z bazą</div>
          {error}
        </div>
      )}

      {!loading && !project && !error && (
        <div className={styles.info}>
          Nie znaleziono takiego projektu. Wróć do listy projektów.
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
          Pokaż archiwalnych
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
        <div className={styles.info}>Wczytuję agentów…</div>
      ) : agents.length === 0 ? (
        <div className={styles.info}>
          {includeArchived
            ? "Brak agentów w tym projekcie."
            : "Ten projekt nie ma jeszcze agentów. Kliknij „Nowy agent”, aby dodać pierwszego."}
        </div>
      ) : (
        <div className={styles.list}>
          {agents.map((agent) => {
            const archived = agent.status === "archived";

            return (
              <div
                key={agent.id}
                className={`${styles.card} ${archived ? styles.cardArchived : ""}`}
              >
                <div className={styles.cardTop}>
                  <h2 className={styles.cardTitle}>
                    <Link
                      href={`/projekty/${projectId}/agenty/${agent.id}`}
                      className={styles.cardTitleLink}
                    >
                      {agent.name}
                    </Link>
                  </h2>
                  {archived && <span className={styles.badge}>Archiwum</span>}
                </div>

                {agent.role && (
                  <div>
                    <span className={styles.roleTag}>{agent.role}</span>
                  </div>
                )}

                {agent.description && (
                  <p className={styles.cardDesc}>{agent.description}</p>
                )}

                <div className={styles.cardMeta}>
                  Zmodyfikowano: {formatDate(agent.updated_at)}
                </div>

                <div className={styles.cardActions}>
                  {/* Pelna konfiguracja agenta = kreator pod trasa z agentId. */}
                  <Link
                    href={`/projekty/${projectId}/agenty/${agent.id}`}
                    className={styles.primaryLink}
                  >
                    Konfiguruj →
                  </Link>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => startEdit(agent)}
                    disabled={saving}
                  >
                    Zmień opis
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => toggleArchive(agent)}
                    disabled={saving}
                  >
                    {archived ? "Przywróć" : "Archiwizuj"}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => startDelete(agent)}
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
        <AgentModal
          title="Nowy agent"
          submitLabel="Dodaj agenta"
          idPrefix="create-agent"
          name={newName}
          role={newRole}
          description={newDescription}
          onNameChange={setNewName}
          onRoleChange={setNewRole}
          onDescriptionChange={setNewDescription}
          onSubmit={handleCreate}
          onClose={closeCreate}
          saving={saving}
          error={modalError}
        />
      )}

      {deleting && (
        <FormModal
          title="Trwale usunąć agenta?"
          titleId="delete-agent-modal-title"
          submitLabel="Usuń trwale"
          savingLabel="Usuwam…"
          tone="danger"
          onSubmit={confirmDelete}
          onClose={closeDelete}
          saving={saving}
          canSubmit
          error={modalError}
        >
          <p className={styles.confirmText}>
            Usuniesz agenta <strong>{deleting.name}</strong> wraz z całą jego
            konfiguracją (persona, zasady, narzędzia, pytania i odpowiedzi).
          </p>
          <p className={styles.confirmWarning}>
            Tej operacji nie można cofnąć. Jeśli chcesz tylko schować agenta z
            listy, użyj „Archiwizuj”.
          </p>
        </FormModal>
      )}

      {editingId && (
        <AgentModal
          title="Edytuj agenta"
          submitLabel="Zapisz"
          idPrefix="edit-agent"
          name={editName}
          role={editRole}
          description={editDescription}
          onNameChange={setEditName}
          onRoleChange={setEditRole}
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
