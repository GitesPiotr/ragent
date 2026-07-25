import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

// Pobiera tresc plikow wiedzy dla agenta — SERWEROWO, zeby nie wozic
// calych dokumentow przez przegladarke i nie trzymac ich w stanie Reacta.
//
//   knowledge_mode "none"     -> nic
//   knowledge_mode "all"      -> wszystkie gotowe pliki projektu
//   knowledge_mode "selected" -> tylko pliki z knowledge_file_ids
//
// Uzywane przez /api/chat ORAZ /api/agent/prompt-preview — dzieki temu
// podglad promptu pokazuje dokladnie to, co dostaje model.
// Blad pobrania NIE przerywa dzialania — agent odpowie bez wiedzy.
export async function loadKnowledgeFilesForAgent(agent) {
  const mode = agent?.knowledge_mode || "none";
  if (mode === "none") return [];
  if (!isSupabaseConfigured || !supabase) return [];
  if (!agent?.project_id) return [];

  const ids = Array.isArray(agent.knowledge_file_ids)
    ? agent.knowledge_file_ids.filter(Boolean)
    : [];
  if (mode === "selected" && ids.length === 0) return [];

  try {
    let query = supabase
      .from("knowledge_files")
      .select("id, file_name, extracted_text, status")
      .eq("project_id", agent.project_id)
      .eq("status", "ready")
      .order("created_at", { ascending: true });

    if (mode === "selected") query = query.in("id", ids);

    const { data, error } = await query;
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}
