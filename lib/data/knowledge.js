import { requireSupabase, throwIfError } from "./errors";

const BUCKET = "knowledge";

// Na listach NIE pobieramy extracted_text — bywa ogromny, a do wyswietlenia
// wystarcza metadane i status.
const LIST_COLUMNS =
  "id, project_id, file_name, file_path, size, mime_type, status, status_message, created_at";

// Pliki wiedzy naleza do PROJEKTU, nie do agenta.
export async function listKnowledgeFiles(projectId) {
  const db = requireSupabase();
  if (!projectId) throw new Error("Brak identyfikatora projektu.");

  const { data, error } = await db
    .from("knowledge_files")
    .select(LIST_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  throwIfError(error, "pobrać listy plików wiedzy");
  return data ?? [];
}

// Kasuje WSZYSTKIE pliki wiedzy projektu: najpierw obiekty ze Storage,
// potem rekordy. Uzywane przy trwalym usuwaniu projektu.
//
// Storage NIE jest objety kaskada z SQL-a (ON DELETE CASCADE dziala tylko na
// tabelach), wiec pliki trzeba skasowac jawnie — inaczej zostana sierotami
// w buckecie, zajmujac miejsce i nie do usuniecia z poziomu aplikacji.
export async function deleteProjectKnowledge(projectId) {
  const db = requireSupabase();
  if (!projectId) throw new Error("Brak identyfikatora projektu.");

  // Sciezki musimy poznac PRZED skasowaniem rekordow — potem nie bedzie ich skad wziac.
  const { data, error: listError } = await db
    .from("knowledge_files")
    .select("id, file_path")
    .eq("project_id", projectId);

  throwIfError(listError, "pobrać listy plików wiedzy do usunięcia");

  const files = data ?? [];
  const paths = files.map((f) => f.file_path).filter(Boolean);

  if (paths.length > 0) {
    const { error: storageError } = await db.storage.from(BUCKET).remove(paths);
    if (storageError) {
      throw new Error(
        `Nie udało się usunąć plików z magazynu (Storage). Nic nie zostało skasowane z bazy. Szczegóły: ${
          storageError.message || "nieznany błąd"
        }`,
      );
    }
  }

  const { error: rowsError } = await db
    .from("knowledge_files")
    .delete()
    .eq("project_id", projectId);

  if (rowsError) {
    throw new Error(
      `Pliki zostały usunięte z magazynu, ale nie udało się skasować ich wpisów w bazie. Projekt NIE został usunięty — spróbuj ponownie. Szczegóły: ${
        rowsError.message || "nieznany błąd"
      }`,
    );
  }

  return files.length;
}

// Usuwa plik: najpierw ze Storage, potem rekord. Gdy plik w Storage juz nie
// istnieje, i tak kasujemy rekord — inaczej zostalby "duch" nie do usuniecia.
export async function deleteKnowledgeFile(file) {
  const db = requireSupabase();
  if (!file?.id) throw new Error("Brak identyfikatora pliku.");

  if (file.file_path) {
    await db.storage.from(BUCKET).remove([file.file_path]);
  }

  const { error } = await db.from("knowledge_files").delete().eq("id", file.id);
  throwIfError(error, "usunąć pliku wiedzy");
}
