import { requireSupabase, throwIfError } from "./errors";
import { stateAgentToDbPatch } from "./agentMapping";

// Pola podstawowe — wystarczaja na liscie agentow w projekcie.
// Nie pobieramy tu persony/zasad, zeby nie ciagnac zbednych danych.
const COLUMNS =
  "id, project_id, name, description, role, status, created_at, updated_at";

// Pelna konfiguracja — uzywana przez kreator (trasa z agentId).
// Kolumny dodaje migracja supabase/002_agent_config.sql.
const FULL_COLUMNS = `${COLUMNS}, persona, provider, model, temperature, rules, tools, qas, input_settings, output_format, knowledge_mode, knowledge_file_ids`;

// Agenci ZAWSZE w kontekscie projektu — filtr po project_id jest obowiazkowy.
// Domyslnie bez archiwalnych.
export async function listAgents(projectId, { includeArchived = false } = {}) {
  const db = requireSupabase();
  if (!projectId) throw new Error("Brak identyfikatora projektu.");

  let query = db
    .from("agents")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (!includeArchived) query = query.eq("status", "active");

  const { data, error } = await query;
  throwIfError(error, "pobrać listy agentów");
  return data ?? [];
}

// WSZYSCY aktywni agenci (ze wszystkich projektow) — do wyboru rozmowcy
// w Czatach, gdzie liste grupujemy po projektach. Zwracamy pola podstawowe
// + project_id do grupowania. Pelna konfiguracje pobiera dopiero getAgent.
export async function listActiveAgents() {
  const db = requireSupabase();

  const { data, error } = await db
    .from("agents")
    .select("id, project_id, name, role")
    .eq("status", "active")
    .order("name", { ascending: true });

  throwIfError(error, "pobrać listy agentów");
  return data ?? [];
}

// Pojedynczy agent z PELNA konfiguracja — zrodlo danych dla kreatora.
// Zwraca surowy wiersz; zamiana na ksztalt state.agent robi dbAgentToState.
export async function getAgent(agentId) {
  const db = requireSupabase();
  if (!agentId) throw new Error("Brak identyfikatora agenta.");

  const { data, error } = await db
    .from("agents")
    .select(FULL_COLUMNS)
    .eq("id", agentId)
    .maybeSingle();

  throwIfError(error, "wczytać agenta");
  return data ?? null;
}

// ZAPIS Z KREATORA: cala konfiguracja state.agent -> baza (update po agentId).
// Walidacja i normalizacja typow siedzi w stateAgentToDbPatch.
export async function saveAgentConfig(agentId, stateAgent) {
  const db = requireSupabase();
  if (!agentId) throw new Error("Brak identyfikatora agenta.");

  const patch = stateAgentToDbPatch(stateAgent);

  const { data, error } = await db
    .from("agents")
    .update(patch)
    .eq("id", agentId)
    .select(FULL_COLUMNS)
    .single();

  throwIfError(error, "zapisać konfiguracji agenta");
  return data;
}

// Opcjonalne domyslne (provider/model/temperature) pochodza z Ustawien i sa
// wpisywane JUZ przy tworzeniu — nowy agent od razu ma preferencje uzytkownika.
// Gdy ich nie podano, baza uzyje swoich kolumnowych domyslnych (jak dotad).
export async function createAgent(
  projectId,
  { name, description, role, provider, model, temperature } = {},
) {
  const db = requireSupabase();
  if (!projectId) throw new Error("Brak identyfikatora projektu.");

  const cleanName = (name || "").trim();
  if (!cleanName) throw new Error("Nazwa agenta jest wymagana.");

  const insert = {
    project_id: projectId,
    name: cleanName,
    description: (description || "").trim() || null,
    role: (role || "").trim() || null,
  };
  if (typeof provider === "string" && provider) insert.provider = provider;
  if (typeof model === "string" && model) insert.model = model;
  if (typeof temperature === "number" && Number.isFinite(temperature)) {
    insert.temperature = Math.min(1, Math.max(0, temperature));
  }

  const { data, error } = await db
    .from("agents")
    .insert(insert)
    .select(COLUMNS)
    .single();

  throwIfError(error, "utworzyć agenta");
  return data;
}

export async function updateAgent(agentId, { name, description, role }) {
  const db = requireSupabase();

  const patch = {};
  if (name !== undefined) {
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Nazwa agenta nie może być pusta.");
    patch.name = cleanName;
  }
  if (description !== undefined) patch.description = description.trim() || null;
  if (role !== undefined) patch.role = role.trim() || null;

  const { data, error } = await db
    .from("agents")
    .update(patch)
    .eq("id", agentId)
    .select(COLUMNS)
    .single();

  throwIfError(error, "zapisać zmian w agencie");
  return data;
}

// TRWALE usuniecie agenta — rekord znika z bazy na stale.
// To NIE jest archiwizacja (ta zostawia rekord ze status='archived').
//
// Pliki wiedzy naleza do KONTA, a agent tylko je wskazywal
// (knowledge_file_ids), wiec nic tu nie kaskadujemy — wskazania znikaja
// razem z wierszem agenta, same pliki zostaja w magazynie.
export async function deleteAgent(agentId) {
  const db = requireSupabase();
  if (!agentId) throw new Error("Brak identyfikatora agenta.");

  const { error } = await db.from("agents").delete().eq("id", agentId);
  throwIfError(error, "trwale usunąć agenta");
}

export async function archiveAgent(agentId) {
  return setAgentStatus(agentId, "archived");
}

export async function restoreAgent(agentId) {
  return setAgentStatus(agentId, "active");
}

async function setAgentStatus(agentId, status) {
  const db = requireSupabase();

  const { data, error } = await db
    .from("agents")
    .update({ status })
    .eq("id", agentId)
    .select(COLUMNS)
    .single();

  throwIfError(
    error,
    status === "archived" ? "zarchiwizować agenta" : "przywrócić agenta",
  );
  return data;
}
