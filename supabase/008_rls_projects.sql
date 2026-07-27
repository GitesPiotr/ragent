-- ============================================================
--  AIdeas — migracja 008: RLS na tabeli projects
--  Sesja 4 tematu logowanie/konta/RLS, krok 1 z 5.
--
--  CO ROBI: wlacza izolacje danych na tabeli projects. Od tej chwili
--  kazde zapytanie z aplikacji widzi WYLACZNIE wiersze, ktorych
--  owner_id rowna sie id zalogowanego uzytkownika.
--
--  URUCHOM DOPIERO PO probie na sucho:
--      supabase/proby/008_proba_projects.sql
--  Proba niczego nie zmienia, a sprawdza te sama polityke na zywych
--  danych. Jesli przeszla bez bledu — ten plik jest bezpieczny.
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. SQL Editor -> New query
--  3. Wklej CALY plik -> Run
--  4. Przejdz do aplikacji i policz projekty na liscie (patrz TEST nizej).
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--
--  ------------------------------------------------------------
--  JAK TO COFNAC (gdyby aplikacja przestala widziec dane):
--
--      alter table public.projects disable row level security;
--
--  Jedna linijka, natychmiastowa, nie rusza ZADNYCH danych. Polityka
--  zostaje w bazie, tylko przestaje obowiazywac. Dlatego przy tej
--  migracji nie jest potrzebna kopia bazy.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  POLITYKA
--
--  "for all" — jedna regula na select, insert, update i delete.
--  Rozdzielamy polityki dopiero wtedy, gdy reguly faktycznie sie roznia;
--  tutaj wszedzie obowiazuje to samo "moje albo nic", wiec cztery osobne
--  polityki byly by tylko czterema miejscami do rozjechania sie.
--
--  "to authenticated" — rola anon (niezalogowany) nie dostaje nic.
--
--  "using" vs "with check" — to NIE jest to samo:
--    using      = ktore z ISTNIEJACYCH wierszy widze i mam prawo ruszyc
--                 (dziala na select, update, delete),
--    with check = jaki wiersz wolno mi ZOSTAWIC W BAZIE
--                 (dziala na insert i na wynik update).
--  Bez "with check" dalo by sie wstawic wiersz z cudzym owner_id.
--
--  Zapisy z aplikacji dzialaja bez zmian w kodzie, bo migracja 007
--  ustawila owner_id default auth.uid() — nowy wiersz sam dostaje
--  wlasciciela zgodnego z tym warunkiem.
-- ------------------------------------------------------------
drop policy if exists "projects_wlasne" on public.projects;

create policy "projects_wlasne"
  on public.projects
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ------------------------------------------------------------
--  WLACZENIE RLS
--
--  Kolejnosc (polityka -> enable) i wspolna transakcja sa celowe.
--  Tabela z wlaczonym RLS i bez polityki odrzuca wszystko. Gdyby to byly
--  dwa osobne uruchomienia, miedzy nimi istnialoby okno, w ktorym
--  aplikacja jest calkiem slepa.
-- ------------------------------------------------------------
alter table public.projects enable row level security;

commit;

-- ============================================================
--  TEST PO MIGRACJI — w tej kolejnosci
--
--  1) STAN W BAZIE (nowe zapytanie w SQL Editorze):
--
--     select tablename, rowsecurity from pg_tables
--      where schemaname = 'public' and tablename = 'projects';
--     -- rowsecurity = true
--
--     select policyname, cmd, roles from pg_policies
--      where schemaname = 'public' and tablename = 'projects';
--     -- jeden wiersz: projects_wlasne / ALL / {authenticated}
--
--  2) APLIKACJA, konto glowne (pit321@op.pl):
--     - /projekty pokazuje 2 projekty (trzeci jest zarchiwizowany).
--       SPADEK PONIZEJ 2 = problem, cofnij migracje.
--     - wejscie w projekt dziala,
--     - "Nowy projekt" tworzy sie i od razu widac go na liscie
--       (to test klauzuli with check),
--     - DevTools -> Network -> zapytanie do /rest/v1/projects:
--       status 200 i NIEPUSTA tablica w odpowiedzi.
--       Pusta tablica przy statusie 200 to wlasnie cicha awaria.
--
--  3) APLIKACJA, konto testowe (saturnenergia@gmail.com):
--     - wyloguj sie, zaloguj na konto testowe,
--     - /projekty ma byc PUSTE. To jest dowod izolacji.
--     - dopiero TERAZ mozna zalozyc na tym koncie projekt testowy —
--       wczesniej byl by widoczny na liscie konta glownego i rozjechal
--       zloty zrzut.
--     - wroc na konto glowne i sprawdz, ze nadal widzisz swoje 2.
-- ============================================================
