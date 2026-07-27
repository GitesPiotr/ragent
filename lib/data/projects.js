import { requireSupabase, throwIfError } from "./errors";

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
//
// PLIKOW WIEDZY JUZ TU NIE LICZYMY — nie znikaja razem z projektem, bo do
// niego nie naleza. Naleza do konta i zostaja w magazynie.
export async function getProjectContentCounts(projectId) {
  const db = requireSupabase();
  if (!projectId) throw new Error("Brak identyfikatora projektu.");

  const { count, error } = await db
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  throwIfError(error, "policzyć agentów w projekcie");

  return { agents: count ?? 0 };
}

// TRWALE usuniecie projektu wraz z agentami. Nieodwracalne.
//
// PLIKI WIEDZY PRZEZYWAJA KASOWANIE PROJEKTU. Naleza do konta, nie do
// projektu — zostaja w magazynie i moga byc dalej uzywane przez agentow
// z innych projektow. To najwazniejsza zmiana zachowania w tym refaktorze.
//
// Nie wystarczylo do tego usunac stad wywolania deleteProjectKnowledge().
// Kolumna knowledge_files.project_id miala klucz obcy z ON DELETE CASCADE,
// wiec baza kasowalaby te wiersze SAMA — systemowo, z pominieciem polityk
// RLS i bez jednej linijki kodu, ktora dalo by sie o to obwinic, zostawiajac
// przy okazji sieroty w Storage (kaskada SQL nie siega do bucketu).
// Klucz obcy zdjela migracja 014, kolumne usuwa 015.
//
// Kolejnosc nadal od "liscia" do "korzenia": agenci, potem projekt.
// agents.project_id ma wlasna kaskade, ale kasujemy jawnie, zeby kazdy etap
// mial wlasny, czytelny komunikat bledu. Gdy etap padnie, przerywamy —
// projekt zostaje, wiec da sie ponowic.
export async function deleteProject(projectId) {
  const db = requireSupabase();
  if (!projectId) throw new Error("Brak identyfikatora projektu.");

  // 1) Agenci projektu.
  const { error: agentsError } = await db
    .from("agents")
    .delete()
    .eq("project_id", projectId);

  if (agentsError) {
    throw new Error(
      `Nie udało się usunąć agentów projektu. Projekt NIE został usunięty — spróbuj ponownie. Szczegóły: ${
        agentsError.message || "nieznany błąd"
      }`,
    );
  }

  // 2) Sam projekt.
  const { error: projectError } = await db
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (projectError) {
    throw new Error(
      `Agenci projektu zostali usunięci, ale samego projektu nie udało się skasować. Spróbuj usunąć go ponownie. Szczegóły: ${
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
