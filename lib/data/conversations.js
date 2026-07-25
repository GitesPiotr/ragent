import { requireSupabase, throwIfError } from "./errors";

// Warstwa danych dla zakladki „Czaty”: rozmowy (conversations) i ich
// wiadomosci (messages). Wymaga migracji supabase/005_chats.sql.

const CONVERSATION_COLUMNS =
  "id, title, agent_id, agent_name_snapshot, provider, model, pinned, created_at, updated_at";

const MESSAGE_COLUMNS = "id, conversation_id, role, content, created_at";

// Lista rozmow (naglowki): przypiete na gorze, w kazdej grupie od najnowszej.
// Wymaga migracji supabase/006_pinned.sql (kolumna pinned).
export async function listConversations() {
  const db = requireSupabase();

  const { data, error } = await db
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  throwIfError(error, "pobrać listy rozmów");
  return data ?? [];
}

// Przypnij / odepnij rozmowe (kolumna pinned). Nie dotyka wiadomosci.
export async function setConversationPinned(conversationId, pinned) {
  const db = requireSupabase();
  if (!conversationId) throw new Error("Brak identyfikatora rozmowy.");

  const { data, error } = await db
    .from("conversations")
    .update({ pinned: Boolean(pinned) })
    .eq("id", conversationId)
    .select(CONVERSATION_COLUMNS)
    .single();

  throwIfError(error, pinned ? "przypiąć rozmowy" : "odpiąć rozmowy");
  return data;
}

// Tworzy rozmowe. Dla rozmowy z agentem: agentId + agentName (snapshot).
// Dla rozmowy z samym modelem: agentId = null, agentName = null.
export async function createConversation({
  title,
  agentId = null,
  agentName = null,
  provider,
  model,
}) {
  const db = requireSupabase();

  const cleanProvider = (provider || "").trim();
  const cleanModel = (model || "").trim();
  if (!cleanProvider || !cleanModel) {
    throw new Error("Rozmowa wymaga wybranego dostawcy i modelu.");
  }

  const { data, error } = await db
    .from("conversations")
    .insert({
      title: (title || "").trim() || "Nowa rozmowa",
      agent_id: agentId || null,
      agent_name_snapshot: agentName || null,
      provider: cleanProvider,
      model: cleanModel,
    })
    .select(CONVERSATION_COLUMNS)
    .single();

  throwIfError(error, "utworzyć rozmowy");
  return data;
}

// Zmiana tytulu (auto z pierwszej wiadomosci albo recznie przez uzytkownika).
export async function updateConversationTitle(conversationId, title) {
  const db = requireSupabase();

  const clean = (title || "").trim();
  if (!clean) throw new Error("Tytuł rozmowy nie może być pusty.");

  const { data, error } = await db
    .from("conversations")
    .update({ title: clean })
    .eq("id", conversationId)
    .select(CONVERSATION_COLUMNS)
    .single();

  throwIfError(error, "zmienić tytułu rozmowy");
  return data;
}

// Zmiana ROZMOWCY w trakcie rozmowy: podmienia agenta albo model rozmowy.
// Historia wiadomosci zostaje NIENARUSZONA — nie dotykamy tabeli messages.
//   - agent:  agentId + agentName (snapshot),
//   - model:  agentId = null, agentName = null.
export async function updateConversationRunner(
  conversationId,
  { agentId = null, agentName = null, provider, model },
) {
  const db = requireSupabase();
  if (!conversationId) throw new Error("Brak identyfikatora rozmowy.");

  const cleanProvider = (provider || "").trim();
  const cleanModel = (model || "").trim();
  if (!cleanProvider || !cleanModel) {
    throw new Error("Rozmowa wymaga wybranego dostawcy i modelu.");
  }

  const { data, error } = await db
    .from("conversations")
    .update({
      agent_id: agentId || null,
      agent_name_snapshot: agentName || null,
      provider: cleanProvider,
      model: cleanModel,
    })
    .eq("id", conversationId)
    .select(CONVERSATION_COLUMNS)
    .single();

  throwIfError(error, "zmienić rozmówcy rozmowy");
  return data;
}

// Podbija updated_at rozmowy, zeby po nowej wiadomosci wskoczyla na gore listy.
// (Sam INSERT do messages nie dotyka conversations — robimy to jawnie.)
export async function touchConversation(conversationId) {
  const db = requireSupabase();

  // Trigger i tak ustawi updated_at = now(); pole podajemy, by UPDATE mial co zapisac.
  const { error } = await db
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  throwIfError(error, "zaktualizować rozmowy");
}

// TRWALE usuniecie rozmowy. Wiadomosci znikaja przez ON DELETE CASCADE.
export async function deleteConversation(conversationId) {
  const db = requireSupabase();
  if (!conversationId) throw new Error("Brak identyfikatora rozmowy.");

  const { error } = await db
    .from("conversations")
    .delete()
    .eq("id", conversationId);

  throwIfError(error, "usunąć rozmowy");
}

// Wiadomosci jednej rozmowy — po kolei (od najstarszej).
export async function listMessages(conversationId) {
  const db = requireSupabase();
  if (!conversationId) throw new Error("Brak identyfikatora rozmowy.");

  const { data, error } = await db
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  throwIfError(error, "pobrać wiadomości rozmowy");
  return data ?? [];
}

// Dopisuje jedna wiadomosc (uzytkownika albo asystenta).
export async function addMessage(conversationId, { role, content }) {
  const db = requireSupabase();
  if (!conversationId) throw new Error("Brak identyfikatora rozmowy.");
  if (role !== "user" && role !== "assistant") {
    throw new Error("Nieprawidłowa rola wiadomości.");
  }

  const { data, error } = await db
    .from("messages")
    .insert({ conversation_id: conversationId, role, content: content ?? "" })
    .select(MESSAGE_COLUMNS)
    .single();

  throwIfError(error, "zapisać wiadomości");
  return data;
}
