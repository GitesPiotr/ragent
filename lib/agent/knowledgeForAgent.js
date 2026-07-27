// Klient SERWEROWY (sesja zalogowanego uzytkownika z ciasteczek), bo ten modul
// jest wolany wylacznie z tras API — patrz lib/supabase/server.js.
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// Pobiera tresc plikow wiedzy dla agenta — SERWEROWO, zeby nie wozic
// calych dokumentow przez przegladarke i nie trzymac ich w stanie Reacta.
//
//   knowledge_mode "none"     -> nic
//   knowledge_mode "selected" -> pliki wskazane w knowledge_file_ids
//
// Uzywane przez /api/chat ORAZ /api/agent/prompt-preview — dzieki temu
// podglad promptu pokazuje dokladnie to, co dostaje model.
// Blad pobrania NIE przerywa dzialania — agent odpowie bez wiedzy.
//
// ------------------------------------------------------------
// ZNIKNELY DWA WARUNKI. Oba celowo, oba z powodem.
//
// 1) Filtr .eq("project_id", agent.project_id).
//
//    Pliki naleza teraz do KONTA, nie do projektu, wiec zawezanie po
//    projekcie odcieloby agenta od wiekszosci magazynu. Ale jest drugi,
//    wazniejszy powod, zeby usunac go DOKLADNIE TERAZ, a nie przy okazji:
//    migracja 015 usuwa kolumne project_id. Zapytanie po nieistniejacej
//    kolumnie zwraca blad, a linia "if (error) return []" nizej zamienia
//    kazdy blad w pusta liste. Skutek bylby taki, ze WSZYSCY agenci po
//    cichu przestaliby miec wiedze i odpowiadali z ogolnej — bez bledu,
//    bez ostrzezenia, bez sladu w UI. Ta sama klasa cichej awarii, ktora
//    wzmacnialismy kodem w Sesji 5.
//
// 2) Tryb "all".
//
//    Znaczyl "wszystkie gotowe pliki tego projektu". Po odpieciu plikow
//    od projektow to samo slowo znaczyloby "wszystkie pliki konta" —
//    zakres wiedzy agenta rosnacy sam przy kazdym uploadzie, bez dotkniecia
//    agenta. Migracja 014 zamrozila istniejacych agentow na "selected"
//    z imienna lista, a 015 zabroni tej wartosci w bazie.
//
//    Warunek nizej brzmi "mode !== selected", a nie "mode === none":
//    gdyby mimo wszystko trafil sie wiersz z 'all', ma nie czytac NICZEGO
//    zamiast czytac calosc magazynu. Cicho — ale to stan, ktorego baza
//    po 015 nie dopuszcza, wiec alternatywa byloby zgadywanie intencji.
// ------------------------------------------------------------
//
// BEZPIECZENSTWO: `agent` przychodzi Z CIALA ZADANIA POST
// (app/api/chat/route.js — body.agent), wiec knowledge_file_ids podaje
// KLIENT i moze tam wpisac dowolne id, takze cudze. Jedyne, co stoi miedzy
// spreparowanym zadaniem a trescia cudzych dokumentow, to RLS: polityka
// knowledge_files_wlasne dopisuje owner_id = auth.uid(), wiec .in("id", ids)
// zwroci wylacznie wlasne pliki. Zadnego drugiego bezpiecznika tu NIE MA
// i nie wolno tego zalozenia oslabic — to jest ta sama pulapka, ktora
// przed Sesja 4 pozwalala wyciagnac cudze pliki przez podstawienie
// project_id (migracja 010, "pulapka nr 1").
export async function loadKnowledgeFilesForAgent(agent) {
  const mode = agent?.knowledge_mode || "none";
  if (mode !== "selected") return [];
  if (!isSupabaseConfigured) return [];

  const ids = Array.isArray(agent.knowledge_file_ids)
    ? agent.knowledge_file_ids.filter(Boolean)
    : [];
  if (ids.length === 0) return [];

  const supabase = await createClient();
  if (!supabase) return [];

  try {
    // order by created_at rosnaco — kolejnosc plikow w prompcie wplywa na
    // odpowiedzi modelu, wiec nie jest kosmetyczna. Ta sama, ktora migracja
    // 014 wpisala do zamrozonych list.
    const { data, error } = await supabase
      .from("knowledge_files")
      .select("id, file_name, extracted_text, status")
      .in("id", ids)
      .eq("status", "ready")
      .order("created_at", { ascending: true });

    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}
