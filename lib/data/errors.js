import { supabase, isSupabaseConfigured, SUPABASE_CONFIG_ERROR } from "@/lib/supabase/client";

// Rzuca czytelnym bledem, gdy .env.local nie jest uzupelniony.
// Kazda funkcja warstwy danych wola to na starcie.
export function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(SUPABASE_CONFIG_ERROR);
  }
  return supabase;
}

// Tlumaczy blad z Supabase/PostgREST na komunikat zrozumialy dla czlowieka.
// `context` to krotki opis operacji, np. "pobrać listy projektów".
export function toReadableError(error, context) {
  if (!error) return null;

  const code = error.code || "";
  const msg = String(error.message || "");

  // Tabela nie istnieje - najczestszy blad na starcie (skrypt SQL nieuruchomiony).
  // 42P01 = blad Postgresa, PGRST205 = PostgREST nie widzi tabeli w schema cache.
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    /relation .* does not exist|Could not find the table/i.test(msg)
  ) {
    return "Tabele nie istnieją w bazie. Uruchom skrypt supabase/schema.sql w Supabase → SQL Editor, a potem odśwież stronę.";
  }
  // Kolumna nie istnieje - brakuje ktorejs migracji rozszerzajacej tabele agents.
  // Nazwe brakujacej kolumny podajemy wprost, zeby bylo wiadomo, ktory skrypt uruchomic.
  if (code === "42703" || /column .* does not exist/i.test(msg)) {
    const column = msg.match(/column ["']?[\w.]*?\.?(\w+)["']? does not exist/i)?.[1];
    return `Baza nie ma jeszcze wszystkich kolumn konfiguracji agenta${
      column ? ` (brakuje: ${column})` : ""
    }. Uruchom w Supabase → SQL Editor kolejne skrypty z folderu supabase/ (002_agent_config.sql, 003_qa_io.sql), a potem odśwież stronę.`;
  }
  // Brak uprawnien / RLS odrzucil operacje.
  //
  // UWAGA: to NIE jest usterka konfiguracji. Od Sesji 4 (migracje 008-012)
  // wszystkie pieć tabel ma wlaczony Row Level Security i polityke
  // filtrujaca po auth.uid() = owner_id — na tym opiera sie izolacja kont.
  //
  // Wczesniejsza wersja tego komunikatu radzila sprawdzic, "czy tabele nie
  // maja wlaczonego RLS". Po wlaczeniu izolacji byla to rada ODWROTNA do
  // prawdy: zastosowanie jej odslonilo by dane wszystkich kont. Realne
  // przyczyny sa dwie i obie sa po stronie sesji, nie bazy.
  if (code === "42501" || /permission denied|row-level security/i.test(msg)) {
    return "Baza odrzuciła tę operację. Najczęściej znaczy to, że sesja wygasła — wyloguj się i zaloguj ponownie. Jeśli to nie pomaga, próbujesz sięgnąć po dane należące do innego konta; każde konto widzi wyłącznie własne projekty, agentów, pliki wiedzy i rozmowy.";
  }
  // PGRST116 — PostgREST zglasza go, gdy zapytanie zakonczone .single()
  // trafilo w ZERO wierszy (albo w wiecej niz jeden).
  //
  // Po wlaczeniu RLS to najczestszy objaw proby zapisu do rekordu, ktorego
  // sie nie widzi: polityka odfiltrowuje wiersz, UPDATE trafia w pustke,
  // a .single() skarzy sie po angielsku ("JSON object requested, multiple
  // (or no) rows returned"). Bez tej galezi taki komunikat szedl prosto
  // na ekran.
  //
  // Uwaga: to NIE jest odmowa dostepu (42501) — zapytanie bylo poprawne,
  // po prostu nie objelo zadnego wiersza. Stad inny komunikat.
  if (
    code === "PGRST116" ||
    /multiple \(or no\) rows returned|Results contain 0 rows/i.test(msg)
  ) {
    return "Nie znaleziono tego wpisu albo nie masz do niego dostępu. Mógł zostać usunięty w innej karcie — odśwież stronę. Jeśli to nie pomaga, sprawdź, czy jesteś zalogowany na właściwe konto.";
  }
  // Zly klucz API.
  if (code === "PGRST301" || /JWT|api key|Invalid API key/i.test(msg)) {
    return "Nieprawidłowy klucz Supabase. Sprawdź NEXT_PUBLIC_SUPABASE_ANON_KEY w .env.local i zrestartuj serwer.";
  }
  // Naruszenie klucza obcego - np. projekt zostal usuniety.
  if (code === "23503") {
    return "Projekt, do którego próbujesz przypisać agenta, już nie istnieje.";
  }
  // Brak wymaganego pola.
  if (code === "23502") {
    return "Brakuje wymaganego pola (np. nazwy).";
  }
  // Brak sieci / zly URL projektu.
  if (/fetch failed|Failed to fetch|NetworkError|ENOTFOUND/i.test(msg)) {
    return "Brak połączenia z Supabase. Sprawdź internet oraz NEXT_PUBLIC_SUPABASE_URL w .env.local.";
  }

  return `Nie udało się ${context}. Szczegóły: ${msg || "nieznany błąd"}`;
}

// Skrot: jesli Supabase zwrocil blad - rzuc go juz jako czytelny komunikat.
export function throwIfError(error, context) {
  if (error) throw new Error(toReadableError(error, context));
}
