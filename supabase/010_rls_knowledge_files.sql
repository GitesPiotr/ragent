-- ============================================================
--  AIdeas — migracja 010: RLS na tabeli knowledge_files
--  Sesja 4 tematu logowanie/konta/RLS, krok 3 z 5.
--
--  CO ROBI: wlacza izolacje danych na tabeli knowledge_files.
--
--  TO JEST NAJWAZNIEJSZY KROK CALEJ SESJI. Zamyka PULAPKE NR 1
--  z inwentaryzacji: loadKnowledgeFilesForAgent() w
--  lib/agent/knowledgeForAgent.js filtruje pliki po project_id, ktory
--  SERWER BIERZE WPROST Z CIALA ZADANIA POST od klienta, bez sprawdzania
--  wlasciciela. Do dzis wystarczylo podstawic cudze project_id w zadaniu
--  do /api/chat albo /api/agent/prompt-preview, zeby dostac TRESC cudzych
--  dokumentow w system promptcie.
--
--  Po tej migracji zapytanie z knowledgeForAgent.js:30-38 dostaje od bazy
--  dopisany warunek owner_id = auth.uid(), wiec cudze project_id zwraca
--  pusta liste. Kod tej trasy NIE wymaga zmiany — ale wymaga TESTU,
--  bo zalozenie "RLS to domknie" trzeba udowodnic. Test negatywny jest
--  na koncu tego pliku, w punkcie D.
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. SQL Editor -> New query
--  3. Wklej CALY plik -> Run
--  4. Wykonaj TEST z konca pliku — punktu D nie pomijaj.
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--
--  ------------------------------------------------------------
--  JAK TO COFNAC:
--
--      alter table public.knowledge_files disable row level security;
--
--  Jedna linijka, nie rusza ZADNYCH danych ani plikow w Storage.
--
--  ------------------------------------------------------------
--  CZEGO TA MIGRACJA NIE ZALATWIA: STORAGE.
--
--  Izolujemy WIERSZE w tabeli, nie PLIKI w buckecie "knowledge".
--  Polityka aideas_knowledge_all z migracji 004 jest nadal otwarta
--  (for all, to anon + authenticated, caly bucket). Znaczy to tyle, ze
--  ktos znajacy dokladna sciezke obiektu moglby po niej siegnac mimo
--  wszystko. W aplikacji nie ma ani jednego miejsca, ktore pobiera pliki
--  ze Storage (tylko upload i remove — sprawdzone), wiec praktycznej
--  drogi do tego nie ma, ale dziura formalnie istnieje.
--  Storage domykamy w Sesji 5 jako osobny blok, bo ma wlasny model
--  polityk i wlasny zestaw pulapek.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  POLITYKA — ten sam ksztalt co w migracjach 008 i 009.
--
--  "using" vs "with check":
--    using      = ktore z ISTNIEJACYCH wierszy widze i mam prawo ruszyc,
--    with check = jaki wiersz wolno mi ZOSTAWIC W BAZIE.
--
--  Trasa /api/knowledge/upload wstawia wiersz przez klienta z sesja
--  uzytkownika (server.js), a migracja 007 dala kolumnie owner_id
--  default auth.uid() — wiec upload przechodzi przez "with check"
--  bez zadnej zmiany w kodzie.
-- ------------------------------------------------------------
drop policy if exists "knowledge_files_wlasne" on public.knowledge_files;

create policy "knowledge_files_wlasne"
  on public.knowledge_files
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

alter table public.knowledge_files enable row level security;

commit;

-- ============================================================
--  KONTROLA STANU (uruchom osobno, w nowym zapytaniu):
--
--  select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('projects','agents','knowledge_files');
--  -- wszystkie trzy: rowsecurity = true
--
--  select tablename, policyname, cmd, roles from pg_policies
--   where schemaname = 'public'
--     and tablename in ('projects','agents','knowledge_files');
--  -- trzy wiersze, kazdy ALL / {authenticated}
-- ============================================================

-- ============================================================
--  TEST W APLIKACJI
--  Zloty zrzut: 2 pliki wiedzy w bazie, oba w projekcie konta glownego.
--
--  UWAGA NA SCIEZKE: pliki wiedzy nie maja wlasnej zakladki w projekcie —
--  siedza w KREATORZE AGENTA, w sekcji „Baza wiedzy”
--  (components/creator/sections/KnowledgeBaseSection.js).
--
--  A) KONTO GLOWNE — CZYTANIE
--     1. Projekt -> agent -> kreator -> sekcja „Baza wiedzy”:
--        widoczne 2 pliki z dotychczasowymi statusami.
--        Pusta lista = awaria (ta sekcja pokazuje bledy, ale RLS nie
--        zwraca bledu — zwraca pustke).
--
--  B) KONTO GLOWNE — ZAPIS
--     2. Wgraj nowy plik .txt z rozpoznawalna trescia -> pojawia sie
--        na liscie ze statusem „gotowy”.
--        To test trasy /api/knowledge/upload i klauzuli with check.
--     3. Usun ten plik -> znika z listy.
--
--  C) LICZNIK ZAWARTOSCI PROJEKTU — ta sama pulapka co przy agentach
--     4. Na projekcie JEDNORAZOWYM (nie na prawdziwym!) z wgranym plikiem
--        kliknij „Usun projekt”. MA sie pojawic okno potwierdzenia
--        wymieniajace 1 plik wiedzy.
--        Znikniecie bez pytania = licznik zwrocil 0 = RLS nie dziala.
--        Powod: app/projekty/page.js:233 przy zerowych licznikach kasuje
--        projekt OD RAZU, bez modala.
--
--  D) TEST PULAPKI NR 1 — najwazniejszy punkt tej migracji
--
--     PRZYGOTOWANIE (na koncie testowym):
--       - wejdz w projekt konta testowego, dodaj agenta, w kreatorze
--         wgraj plik .txt z rozpoznawalna trescia,
--       - upewnij sie, ze plik ma status „gotowy” — plik bez warstwy
--         tekstowej (np. skan PDF) NIE nadaje sie do tego testu,
--         bo nie trafia do promptu nawet bez RLS i test wyszedlby
--         falszywie pozytywnie,
--       - przepisz project_id tego projektu z adresu w przegladarce.
--
--     WYKONANIE (zalogowany na koncie GLOWNYM, DevTools -> Console):
--
--       const test = async (etykieta, projectId) => {
--         const r = await fetch('/api/agent/prompt-preview', {
--           method: 'POST',
--           headers: { 'Content-Type': 'application/json' },
--           body: JSON.stringify({
--             agent: { project_id: projectId, knowledge_mode: 'all' }
--           })
--         });
--         const d = await r.json();
--         const k = (d.parts || []).find(p => p.id === 'knowledge');
--         console.log(etykieta, k
--           ? `WIDZI WIEDZE: ${k.chars} znakow, pliki: ` +
--             (k.meta?.files || []).map(f => f.name).join(', ')
--           : 'brak sekcji wiedzy');
--       };
--
--       await test('WLASNY projekt ->', 'TU-WKLEJ-WLASNE-PROJECT-ID');
--       await test('CUDZY  projekt ->', 'TU-WKLEJ-PROJECT-ID-KONTA-TESTOWEGO');
--
--     OCZEKIWANY WYNIK:
--       WLASNY projekt -> WIDZI WIEDZE: <liczba> znakow, pliki: <nazwy>
--       CUDZY  projekt -> brak sekcji wiedzy
--
--     PIERWSZA LINIA JEST OBOWIAZKOWA. To proba kontrolna: bez niej
--     "brak sekcji wiedzy" w drugiej linii moze znaczyc rownie dobrze
--     "RLS dziala", jak i "zle sformulowalem zadanie" — a to dwie bardzo
--     rozne rzeczy. Dopiero gdy pierwsza linia POKAZUJE wiedze, druga
--     linia cokolwiek dowodzi.
--
--     JESLI DRUGA LINIA POKAZE NAZWY PLIKOW konta testowego — wyciek
--     trwa, natychmiast cofnij migracje i nie idz dalej.
--
--  E) KONTO TESTOWE — dowod izolacji od drugiej strony
--     5. Zaloguj sie na konto testowe, otworz kreator swojego agenta:
--        w „Bazie wiedzy” ma byc TYLKO jego wlasny plik, zaden z dwoch
--        plikow konta glownego.
--     6. Wroc na konto glowne i sprawdz, ze nadal widzisz swoje 2 pliki.
-- ============================================================
