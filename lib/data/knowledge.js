import { requireSupabase, throwIfError } from "./errors";

const BUCKET = "knowledge";

// MAGAZYN WIEDZY — MODEL DANYCH.
//
// Pliki naleza do KONTA (owner_id), nie do projektu. Jedna plaska pula:
// bez folderow, bez kategorii, bez przypisania do projektu. Jeden plik moze
// byc uzywany przez wielu agentow w wielu projektach — to fizycznie ten sam
// obiekt w Storage i ten sam wiersz w bazie, zero duplikatow.
//
// Agent plikow NIE POSIADA, tylko je WSKAZUJE (agents.knowledge_file_ids).
//
// ZAKRES WIDOCZNOSCI ROBI RLS, NIE KOD. Zapytania nizej nie maja ani jednego
// filtra po wlascicielu — polityka knowledge_files_wlasne (migracja 010)
// dopisuje owner_id = auth.uid() po stronie bazy. Dopisywanie tego samego
// warunku recznie nic by nie dodalo, a sugerowaloby, ze to KOD pilnuje
// izolacji. Nie pilnuje.

// Na listach NIE pobieramy extracted_text — bywa ogromny, a do wyswietlenia
// wystarcza metadane i status.
//
// project_id CELOWO tu nie ma. Kolumna jeszcze istnieje (usuwa ja migracja
// 015), ale nic jej juz nie czyta. Gdyby zostala w tej liscie, migracja 015
// wywrocilaby kazde zapytanie korzystajace z LIST_COLUMNS.
const LIST_COLUMNS =
  "id, file_name, file_path, size, mime_type, status, status_message, created_at";

// Caly magazyn konta. Bez argumentow — nie ma juz czego zawezac.
// Najnowsze na gorze, tak jak dotad.
export async function listKnowledgeFiles() {
  const db = requireSupabase();

  const { data, error } = await db
    .from("knowledge_files")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false });

  throwIfError(error, "pobrać listy plików wiedzy");
  return data ?? [];
}

// KTO UZYWA KTOREGO PLIKU.
//
// Zwraca Map: id pliku -> tablica agentow, ktorzy go wskazuja.
// Kazdy agent opisany jako { id, name, projectName, archived }.
//
// DLACZEGO W JS, A NIE WIDOKIEM SQL:
// widok bez "security_invoker = on" dziala z uprawnieniami swojego
// wlasciciela i OMIJA RLS — pokazalby nazwy agentow wszystkich kont.
// To dokladnie ta klasa dziury, ktora zamknelismy w sesjach 1-5, i nie ma
// powodu odtwarzac jej dla wygody. Tutaj oba zapytania sa zwyklymi
// selectami pod RLS, wiec zawezenie do konta jest darmowe i pewne.
// Skala (kilkunastu agentow, kilka plikow) czyni koszt niemierzalnym.
// Do rewizji dopiero przy RAG, gdy plikow beda setki.
//
// ARCHIWALNYCH AGENTOW LICZYMY TAK SAMO. Agent ze statusem "archived"
// nadal wskazuje plik i po przywroceniu bedzie go czytal — pominiecie go
// zanizaloby licznik przy kasowaniu, czyli klamaloby dokladnie tam, gdzie
// ten licznik ma chronic. UI oznacza go osobno.
//
// BLAD LECI W GORE, nie zamienia sie w pusta mape. Rozroznienie
// "nikt nie uzywa" od "nie udalo sie sprawdzic" jest tu istotniejsze niz
// gdziekolwiek indziej: pierwsze zaprasza do skasowania pliku, drugie
// powinno przed tym ostrzec.
export async function listKnowledgeUsage() {
  const db = requireSupabase();

  const [agentsResult, projectsResult] = await Promise.all([
    db.from("agents").select("id, name, status, project_id, knowledge_file_ids"),
    db.from("projects").select("id, name"),
  ]);

  throwIfError(agentsResult.error, "sprawdzić, którzy agenci używają plików");
  throwIfError(projectsResult.error, "pobrać nazw projektów");

  const projectNames = new Map(
    (projectsResult.data ?? []).map((p) => [p.id, p.name]),
  );

  const usage = new Map();

  for (const agent of agentsResult.data ?? []) {
    const ids = Array.isArray(agent.knowledge_file_ids)
      ? agent.knowledge_file_ids
      : [];

    // Set, a nie sama tablica: gdyby to samo id trafilo do jsonb dwa razy,
    // agent pokazalby sie na liscie uzywajacych podwojnie.
    for (const fileId of new Set(ids)) {
      if (typeof fileId !== "string" || !fileId) continue;

      const list = usage.get(fileId) ?? [];
      list.push({
        id: agent.id,
        name: agent.name,
        projectName: projectNames.get(agent.project_id) ?? null,
        archived: agent.status === "archived",
      });
      usage.set(fileId, list);
    }
  }

  return usage;
}

// USUNIECIE PLIKU Z MAGAZYNU — trzy kroki, kolejnosc jest cala trescia
// tej funkcji.
//
//   1. odpiecie pliku od WSZYSTKICH agentow, ktorzy go wskazuja,
//   2. usuniecie obiektu ze Storage,
//   3. usuniecie wiersza z knowledge_files.
//
// DLACZEGO ODPINAMY NAJPIERW, a nie na koncu:
//
// Odwrotna kolejnosc zostawialaby przy bledzie agentow wskazujacych na
// nieistniejacy plik. To NIE rzuca bledem — loadKnowledgeFilesForAgent
// robi .in("id", ids) i po prostu dostaje mniej wierszy — wiec agent
// po cichu odpowiadalby bez tej wiedzy. Awaria niewidoczna, czyli ta gorsza.
//
// Przy tej kolejnosci najgorszy stan posredni to "agenci odpieci, plik
// nadal jest": widoczny na liscie, mozliwy do usuniecia ponownie, mozliwy
// do recznego zaznaczenia z powrotem. Kazde ponowienie jest bezpieczne —
// agenci juz odpieci nie trafiaja do petli po raz drugi.
//
// Na bledzie Storage PRZERYWAMY (nie kasujemy wiersza mimo wszystko).
// Ta sama zasada, co w usunietym juz deleteProjectKnowledge: wiersz jest
// jedynym sladem sciezki obiektu, wiec skasowany zostawilby w buckecie
// sierote — niewidoczna z aplikacji i nie do usuniecia. Obiekt, ktorego
// po prostu nie ma, bledu nie zglasza, wiec ta galaz nie tworzy "duchow".
//
// WYSCIG: miedzy odczytem agentow a zapisem ktos moglby zmienic ich liste
// w drugiej karcie. Aplikacja jest jednouzytkownikowa, a najgorszy skutek
// to plik odpiety od agenta, ktory wlasnie go dodal. Nie zabezpieczamy.
export async function deleteKnowledgeFileAndUnpin(file) {
  const db = requireSupabase();
  if (!file?.id) throw new Error("Brak identyfikatora pliku.");

  // --- 1) ODPIECIE OD AGENTOW ---
  const { data: agents, error: agentsError } = await db
    .from("agents")
    .select("id, name, knowledge_file_ids");

  throwIfError(agentsError, "sprawdzić, którzy agenci używają tego pliku");

  const using = (agents ?? []).filter(
    (a) =>
      Array.isArray(a.knowledge_file_ids) &&
      a.knowledge_file_ids.includes(file.id),
  );

  let unpinned = 0;
  for (const agent of using) {
    const next = agent.knowledge_file_ids.filter((id) => id !== file.id);

    const { error } = await db
      .from("agents")
      .update({ knowledge_file_ids: next })
      .eq("id", agent.id);

    if (error) {
      const progress =
        unpinned > 0
          ? ` Zdążyliśmy odpiąć go od ${unpinned} z ${using.length} agentów, reszta korzysta z niego dalej.`
          : "";
      throw new Error(
        `Nie udało się odpiąć pliku od agenta „${agent.name}”. Plik NIE został usunięty.${progress} Spróbuj ponownie — ponowienie jest bezpieczne. Szczegóły: ${
          error.message || "nieznany błąd"
        }`,
      );
    }
    unpinned += 1;
  }

  // --- 2) STORAGE ---
  if (file.file_path) {
    const { error: storageError } = await db.storage
      .from(BUCKET)
      .remove([file.file_path]);

    if (storageError) {
      throw new Error(
        `Plik został odpięty od agentów, ale nie udało się usunąć go z magazynu (Storage). Wpis w bazie ZOSTAJE, więc plik nadal widać na liście — spróbuj usunąć go ponownie. Szczegóły: ${
          storageError.message || "nieznany błąd"
        }`,
      );
    }
  }

  // --- 3) WIERSZ ---
  const { error: rowError } = await db
    .from("knowledge_files")
    .delete()
    .eq("id", file.id);

  if (rowError) {
    throw new Error(
      `Plik zniknął z magazynu (Storage), ale jego wpis został w bazie. Usuń go jeszcze raz — ponowienie posprząta wpis. Szczegóły: ${
        rowError.message || "nieznany błąd"
      }`,
    );
  }

  return { unpinnedFrom: using.length };
}
