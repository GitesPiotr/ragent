// Magazyn wiedzy konta — ODCZYT PO STRONIE SERWERA, na potrzeby mentora.
//
// =============================================================================
//  DLACZEGO TO NIE JEST listKnowledgeFiles Z lib/data/knowledge.js
//
//  Chcialem dolozyc tam `deps.client`, tak jak ma to lib/rag/collections.js,
//  i miec JEDNA funkcje wolana dwoma transportami. Nie da sie: lib/data/*
//  siega po requireSupabase() z lib/data/errors.js, a ten importuje
//  lib/supabase/client.js, ktory tworzy klienta PRZEGLADARKI juz na poziomie
//  modulu (createBrowserClient w linii 22) i sam o sobie pisze: „Kod SERWEROWY
//  nie moze uzywac tego klienta". Import z trasy API wciagnalby wiec klienta
//  przegladarki do procesu serwera — po to, zeby go nigdy nie uzyc.
//
//  Zostaje blizniak, jak wczesniej przy modelach (lib/settings/dopuszczoneServer.js
//  wobec trasy /api/settings/models). Zasada jest ta sama i warto ja powtorzyc:
//  blizniak wolno miec, gdy rozni sie TRANSPORTEM, a nie ZNACZENIEM.
//
//  CO SIE RZECZYWISCIE DUBLUJE: tabela i zestaw kolumn. Tutaj kolumn jest MNIEJ
//  niz w warstwie danych i to jest celowe — mentor potrzebuje nazwy, zeby mowic
//  o pliku po ludzku, identyfikatora, zeby dalo sie go wskazac, i statusu, bo
//  plik bez tekstu nie da agentowi nic. Rozmiar, MIME i daty sa dla ekranu
//  „Baza wiedzy", nie dla promptu — kazde zbedne pole to znaki, za ktore
//  placimy przy kazdym kroku prowadzenia.
//
//  ZAKRES ROBI RLS, NIE TEN KOD. Zapytanie nie ma filtra po wlascicielu —
//  polityka knowledge_files_wlasne (migracja 010) dopisuje owner_id =
//  auth.uid() po stronie bazy. Klient MUSI wiec byc klientem sesji; podanie
//  tu klienta na service_role odslonicoloby magazyny wszystkich kont.
// =============================================================================

// Ile plikow najwyzej trafia do promptu. Magazyn konta bywa duzy, a lista
// wchodzi do KAZDEGO wywolania prowadzenia — bez limitu konto z setka plikow
// placiloby za nia w kazdym kroku. Najnowsze na gorze, bo nad nimi uzytkownik
// pracuje teraz.
export const LIMIT_PLIKOW_W_PROMPCIE = 40;

export async function listaPlikowServer(client, limit = LIMIT_PLIKOW_W_PROMPCIE) {
  if (!client) return { pliki: [], wszystkich: 0 };

  // count: "exact" — zeby dalo sie powiedziec „pokazuje 40 z 137" zamiast
  // udawac, ze uzytkownik ma dokladnie 40 plikow.
  const { data, error, count } = await client
    .from("knowledge_files")
    .select("id, file_name, status", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return { pliki: data ?? [], wszystkich: count ?? (data?.length ?? 0) };
}
