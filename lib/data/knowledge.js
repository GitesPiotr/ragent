import { requireSupabase, throwIfError } from "./errors";

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

// KASOWANIA PLIKU TU NIE MA — I NIE MA GO TU CELOWO.
//
// Stala tutaj deleteKnowledgeFileAndUnpin(): trzy kroki wykonywane WPROST
// Z PRZEGLADARKI. Przeniesiona do app/api/knowledge/[id]/route.js (runda 5b)
// razem z calym uzasadnieniem kolejnosci — odpiecie od agentow idzie pierwsze,
// bo odwrotna kolejnosc zostawia agentow wskazujacych na nieistniejacy plik,
// co NIE rzuca bledem i konczy sie cicha utrata wiedzy.
//
// POWOD PRZENIESIENIA: od integracji z RAG plik ma drugie zycie — dokument
// w rag_documents, jego fragmenty, wektory i kopie oryginalu w buckecie
// rag-files. To wszystko musi zniknac razem z nim, a z przegladarki nie ma
// sie gdzie tego podpiac: nie ma triggera, nie ma hooka, nie ma jednego
// miejsca, przez ktore przechodzi kasowanie.
//
// Funkcja zostala USUNIETA, a nie zostawiona "na wszelki wypadek": kazde jej
// wywolanie omijaloby kasowanie dokumentu RAG, czyli zostawialoby pelna tresc
// pliku w wyszukiwarce po tym, jak uzytkownik zobaczyl, ze plik zniknal.
// Martwy kod o takim skutku jest gorszy niz jego brak.
//
// Kasuj przez: fetch(`/api/knowledge/${id}`, { method: "DELETE" }).
