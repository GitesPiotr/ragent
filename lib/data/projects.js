import { requireSupabase, throwIfError } from "./errors";
import { deleteProjectKnowledge } from "./knowledge";

// Kolumny, ktore pobieramy — jawna lista zamiast "*", zeby dolozenie
// kolumny w bazie nie zmienialo w niekontrolowany sposob ksztaltu danych.
const COLUMNS = "id, name, description, status, created_at, updated_at";

// Lista projektow. Domyslnie BEZ archiwalnych (soft-delete).
// includeArchived = true -> pokazujemy wszystko.
export async function listProjects({ includeArchived = false } = {}) {
  const db = requireSupabase();

  let query = db.from("projects").select(COLUMNS).order("updated_at", { ascending: false });
  if (!includeArchived) query = query.eq("status", "active");

  const { data, error } = await query;
  throwIfError(error, "pobrać listy projektów");
  return data ?? [];
}

// Pojedynczy projekt (naglowek na ekranie agentow). Zwraca null, gdy nie ma.
export async function getProject(projectId) {
  const db = requireSupabase();

  const { data, error } = await db
    .from("projects")
    .select(COLUMNS)
    .eq("id", projectId)
    .maybeSingle();

  throwIfError(error, "pobrać projektu");
  return data ?? null;
}

export async function createProject({ name, description }) {
  const db = requireSupabase();

  const cleanName = (name || "").trim();
  if (!cleanName) throw new Error("Nazwa projektu jest wymagana.");

  const { data, error } = await db
    .from("projects")
    .insert({ name: cleanName, description: (description || "").trim() || null })
    .select(COLUMNS)
    .single();

  throwIfError(error, "utworzyć projektu");
  return data;
}

// Aktualizacja nazwy/opisu. updated_at ustawia trigger w bazie.
export async function updateProject(projectId, { name, description }) {
  const db = requireSupabase();

  const patch = {};
  if (name !== undefined) {
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Nazwa projektu nie może być pusta.");
    patch.name = cleanName;
  }
  if (description !== undefined) {
    patch.description = description.trim() || null;
  }

  const { data, error } = await db
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .select(COLUMNS)
    .single();

  throwIfError(error, "zapisać zmian w projekcie");
  return data;
}

// Ile rzeczy zniknie razem z projektem — pokazujemy to w oknie potwierdzenia,
// zeby uzytkownik wiedzial, co dokladnie kasuje. Liczymy TAKZE archiwalnych
// agentow, bo trwale usuniecie projektu zabiera rowniez ich.
// head:true -> serwer zwraca sam licznik, bez wierszy.
export async function getProjectContentCounts(projectId) {
  const db = requireSupabase();
  if (!projectId) throw new Error("Brak identyfikatora projektu.");

  const [agentsResult, filesResult] = await Promise.all([
    db
      .from("agents")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    db
      .from("knowledge_files")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
  ]);

  throwIfError(agentsResult.error, "policzyć agentów w projekcie");
  throwIfError(filesResult.error, "policzyć plików wiedzy w projekcie");

  return {
    agents: agentsResult.count ?? 0,
    knowledgeFiles: filesResult.count ?? 0,
  };
}

// TRWALE usuniecie projektu wraz z cala zawartoscia. Nieodwracalne.
//
// Kolejnosc jest celowa: od "liscia" do "korzenia", zeby zaden etap nie
// zostawil sierot. Schemat ma ON DELETE CASCADE na agents.project_id oraz
// knowledge_files.project_id, ale kasujemy jawnie, bo:
//   - Storage nie jest objety kaskada SQL (trzeba usunac pliki samemu),
//   - dzieki temu kazdy etap ma wlasny, czytelny komunikat bledu.
// Gdy ktorys etap padnie, przerywamy — projekt zostaje, wiec da sie ponowic.
export async function deleteProject(projectId) {
  const db = requireSupabase();
  if (!projectId) throw new Error("Brak identyfikatora projektu.");

  // 1) Pliki wiedzy: najpierw Storage, potem rekordy knowledge_files.
  await deleteProjectKnowledge(projectId);

  // 2) Agenci projektu.
  const { error: agentsError } = await db
    .from("agents")
    .delete()
    .eq("project_id", projectId);

  if (agentsError) {
    throw new Error(
      `Pliki wiedzy zostały usunięte, ale nie udało się usunąć agentów. Projekt NIE został usunięty — spróbuj ponownie. Szczegóły: ${
        agentsError.message || "nieznany błąd"
      }`,
    );
  }

  // 3) Sam projekt.
  const { error: projectError } = await db
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (projectError) {
    throw new Error(
      `Zawartość projektu (agenci i pliki wiedzy) została usunięta, ale samego projektu nie udało się skasować. Spróbuj usunąć go ponownie. Szczegóły: ${
        projectError.message || "nieznany błąd"
      }`,
    );
  }
}

// Soft-delete: rekord zostaje, zmienia sie tylko status.
export async function archiveProject(projectId) {
  return setProjectStatus(projectId, "archived");
}

export async function restoreProject(projectId) {
  return setProjectStatus(projectId, "active");
}

async function setProjectStatus(projectId, status) {
  const db = requireSupabase();

  const { data, error } = await db
    .from("projects")
    .update({ status })
    .eq("id", projectId)
    .select(COLUMNS)
    .single();

  throwIfError(
    error,
    status === "archived" ? "zarchiwizować projektu" : "przywrócić projektu",
  );
  return data;
}
