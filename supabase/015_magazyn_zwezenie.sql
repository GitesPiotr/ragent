-- ============================================================
--  AIdeas — migracja 015: MAGAZYN WIEDZY, krok 2 (zwezenie)
--  Sesja 1 tematu "magazyn wiedzy", Etap F.
--
--  DOMKNIECIE. Migracja 014 rozbroila stary model (zdjela kaskade,
--  zamrozila tryb 'all'), kod przeszedl na magazyn konta w Etapach B-D,
--  a ta migracja usuwa z bazy to, czego juz nikt nie uzywa.
--
--  CO ROBI:
--    1. Sprawdza warunek wstepny i przerywa z czytelnym komunikatem,
--       gdyby gdzies zostal agent w trybie 'all'.
--    2. Zaciesnia ograniczenie agents_knowledge_mode_allowed
--       do ('none', 'selected') — 'all' przestaje byc dopuszczalny.
--    3. USUWA kolumne knowledge_files.project_id.
--
--  ------------------------------------------------------------
--  !!! TO JEST JEDYNY NIEODWRACALNY KROK CALEGO TEMATU !!!
--
--  Punkty 1 i 2 cofa sie jedna linijka. Punktu 3 NIE DA SIE cofnac
--  w sensownym znaczeniu tego slowa: kolumne mozna dodac z powrotem,
--  ale bedzie PUSTA. Informacja o tym, ktory plik lezal kiedys w ktorym
--  projekcie, przestanie istniec.
--
--  Dlatego kolejnosc w tym pliku jest taka, a nie inna: wszystko, co moze
--  sie nie udac i wszystko, co jest odwracalne, dzieje sie PRZED dropem.
--  Calosc siedzi w jednej transakcji, wiec potkniecie na kroku 1 albo 2
--  cofa rowniez krok 3 — kolumna zostaje nietknieta.
--
--  ZANIM URUCHOMISZ: zapytanie kontrolne PRZED (blok nizej) wypisuje
--  przypisania plik -> projekt. To ostatni moment, zeby je zapisac,
--  jesli mialyby sie do czegos przydac. Nie musza — aplikacja nie ma
--  ani jednego miejsca, ktore by ich uzywalo.
--  ------------------------------------------------------------
--
--  JAK URUCHOMIC:
--  1. Zapytania kontrolne PRZED (blok nizej), w osobnym zapytaniu.
--  2. SQL Editor -> New query -> wklej CALY plik -> Run.
--  3. Kontrole PO (koniec pliku).
--  4. Odswiez aplikacje i przejdz regresje z Etapu G.
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--
--  ------------------------------------------------------------
--  JAK TO COFNAC (w granicach mozliwosci):
--
--    -- ograniczenie z powrotem na trzy wartosci:
--    alter table public.agents
--      drop constraint if exists agents_knowledge_mode_allowed;
--    alter table public.agents
--      add constraint agents_knowledge_mode_allowed
--      check (knowledge_mode in ('none', 'all', 'selected'));
--
--    -- kolumna z powrotem, ale PUSTA i bez klucza obcego:
--    alter table public.knowledge_files add column project_id uuid;
--
--  Klucza obcego z "on delete cascade" NIE ODTWARZAJ. To wlasnie on
--  sprawial, ze usuniecie projektu kasowalo pliki po cichu, z pominieciem
--  RLS, zostawiajac sieroty w Storage. Zdjela go migracja 014 i to byl
--  caly sens tamtego kroku.
--  ------------------------------------------------------------
--
--  CZEGO TA MIGRACJA NIE RUSZA:
--
--    - PLIKOW. Ani jednego bajtu w Storage, ani jednego wiersza mniej
--      w knowledge_files. Znika KOLUMNA, nie dane. Kontrola D nizej
--      porownuje liczbe plikow przed i po — ma sie zgadzac co do jednego.
--    - RLS. Polityki na pieciu tabelach bez zmian.
--    - STORAGE. knowledge_wlasne_pliki opiera sie o sciezke
--      <owner_id>/..., wiec o projektach nie wiedziala nigdy.
--    - agents.project_id. Agenci NADAL naleza do projektow — zmienila sie
--      wylacznie przynaleznosc PLIKOW. Ta kolumna zostaje i jest uzywana
--      (listy agentow, grupowanie w Czatach, nazwa projektu przy agencie
--       na liscie "kto uzywa" w magazynie).
--
--  WARUNEK WSTEPNY PO STRONIE KODU — sprawdzone przed napisaniem tego pliku.
--  Zadne zapytanie nie czyta juz knowledge_files.project_id:
--    - lib/data/knowledge.js — LIST_COLUMNS bez project_id,
--    - app/api/knowledge/upload/route.js — insert i select bez project_id,
--    - lib/agent/knowledgeForAgent.js — filtr po project_id usuniety,
--    - lib/data/projects.js — getProjectContentCounts nie liczy juz plikow,
--      deleteProject nie kasuje ich wcale.
--  Wystepujace w kodzie "project_id" dotyczy TABELI AGENTS, ktorej ta
--  migracja nie tyka.
-- ============================================================


-- ============================================================
--  ZAPYTANIA KONTROLNE — URUCHOM PRZED MIGRACJA, W OSOBNYM ZAPYTANIU.
--
--  A) Warunek konieczny. Oczekiwane: 0. Przy czymkolwiek innym migracja
--     przerwie sie sama (krok 1), ale lepiej wiedziec wczesniej.
--
--     select count(*) as agentow_w_trybie_all
--       from public.agents
--      where knowledge_mode = 'all';
--
--  B) Liczba plikow PRZED. Zapisz — kontrola D porownuje z ta liczba.
--
--     select count(*) as plikow_przed from public.knowledge_files;
--
--  C) OSTATNI SLAD przypisania plik -> projekt. Po migracji ta informacja
--     przestanie istniec. Zapisz, jesli chcesz ja miec; aplikacja jej
--     nie potrzebuje.
--
--     select kf.id, kf.file_name, kf.project_id, p.name as projekt,
--            kf.owner_id, kf.created_at
--       from public.knowledge_files kf
--       left join public.projects p on p.id = kf.project_id
--      order by kf.owner_id, kf.created_at;
--
--     Uwaga: pliki wgrane po Etapie B maja project_id = null i to jest
--     poprawne — trasa uploadu przestala je wypelniac.
-- ============================================================


begin;

-- ------------------------------------------------------------
--  KROK 1 — WARUNEK WSTEPNY: zaden agent nie moze byc w trybie 'all'
--
--  Samo dodanie ograniczenia w kroku 2 tez by to wychwycilo, ale bledem
--  Postgresa o naruszeniu CHECK — komunikatem, z ktorego nie wynika,
--  co zrobic. Wolimy powiedziec to wprost.
--
--  Kiedy to moze wystapic: gdyby migracja 014 nie zostala uruchomiona,
--  albo gdyby ktos w miedzyczasie wpisal 'all' recznie w SQL Editorze.
--  Z poziomu aplikacji jest to od Etapu D niemozliwe — przelacznik ma
--  dwa stany, a KNOWLEDGE_MODES nie zna juz wartosci 'all'.
-- ------------------------------------------------------------
do $$
declare
  zostalo integer;
begin
  select count(*) into zostalo
    from public.agents
   where knowledge_mode = 'all';

  if zostalo > 0 then
    raise exception
      'Przerywam: % agent(ow) ma jeszcze knowledge_mode = ''all''. Uruchom najpierw KROK 1 z migracji 014 (zamrozenie na ''selected'' z imienna lista plikow), potem wroc tutaj. Nic nie zostalo zmienione.',
      zostalo;
  end if;
end $$;


-- ------------------------------------------------------------
--  KROK 2 — ZACIESNIENIE OGRANICZENIA knowledge_mode
--
--  Migracja 004 dopuszczala ('none', 'all', 'selected'). Zostaja dwie
--  wartosci. Od tej chwili baza NIE POZWOLI zapisac agenta w trybie 'all'
--  — takze recznie, takze przez pomylke.
--
--  Nazwa ograniczenia zostaje TA SAMA celowo. Migracja 004 zaklada je
--  wewnatrz "if not exists (... where conname = 'agents_knowledge_mode_allowed')",
--  wiec ponowne uruchomienie 004 "na wszelki wypadek" zobaczy ograniczenie
--  o tej nazwie i NIE odtworzy starej, luzniejszej wersji. Gdybysmy nadali
--  nowa nazwe, 004 dolozylby obok siebie stare ograniczenie — akurat tutaj
--  bez szkody, bo dwa CHECK-i lacza sie przez AND, ale zostawialoby smiec.
--
--  Dodanie CHECK sprawdza wiersze JUZ ISTNIEJACE (nie ma NOT VALID),
--  wiec to takze drugi bezpiecznik dla kroku 1.
-- ------------------------------------------------------------
alter table public.agents
  drop constraint if exists agents_knowledge_mode_allowed;

alter table public.agents
  add constraint agents_knowledge_mode_allowed
  check (knowledge_mode in ('none', 'selected'));


-- ------------------------------------------------------------
--  KROK 3 — USUNIECIE KOLUMNY knowledge_files.project_id
--
--  TO JEST TEN NIEODWRACALNY MOMENT.
--
--  Kolumna jest juz nieuzywana przez kod (lista w naglowku pliku)
--  i rozbrojona przez migracje 014 (bez klucza obcego, bez not null).
--  Zostawienie jej byloby gorsze niz usuniecie: martwa kolumna w tabeli
--  zaprasza, zeby ktos kiedys "przywrocil" jej sens, a razem z nim
--  kaskade, ktora wlasnie rozbroilismy.
--
--  Razem z kolumna Postgres usuwa automatycznie indeks
--  knowledge_files_project_id_idx (migracja 004). Nie trzeba go
--  kasowac osobno i nie da sie o nim zapomniec.
--
--  Znika KOLUMNA, nie dane: liczba wierszy w knowledge_files i liczba
--  obiektow w buckecie pozostaja bez zmian. Sprawdza to kontrola D.
--
--  "if exists" — zeby drugie uruchomienie skryptu nie wywracalo sie
--  na braku kolumny.
-- ------------------------------------------------------------
alter table public.knowledge_files
  drop column if exists project_id;

commit;


-- ============================================================
--  KONTROLA PO MIGRACJI — uruchom w osobnym zapytaniu.
--
--  A) Kolumny nie ma. Oczekiwane: brak wierszy.
--
--     select column_name
--       from information_schema.columns
--      where table_schema = 'public'
--        and table_name   = 'knowledge_files'
--        and column_name  = 'project_id';
--
--  B) Indeks po niej tez znikl. Oczekiwane: brak wierszy.
--
--     select indexname from pg_indexes
--      where schemaname = 'public'
--        and tablename  = 'knowledge_files'
--        and indexname  = 'knowledge_files_project_id_idx';
--
--     Przy okazji sprawdz, ze indeks po WLASCICIELU zostal — to on
--     obsluguje teraz liste magazynu. Oczekiwane: jeden wiersz.
--
--     select indexname from pg_indexes
--      where schemaname = 'public'
--        and tablename  = 'knowledge_files'
--        and indexname  = 'knowledge_files_owner_id_idx';
--
--  C) Ograniczenie zaciesnione. Oczekiwane: definicja z dwiema wartosciami,
--     bez 'all'.
--
--     select conname, pg_get_constraintdef(oid) as definicja
--       from pg_constraint
--      where conname = 'agents_knowledge_mode_allowed';
--
--  D) NIC NIE PRZEPADLO. Porownaj z liczba zapisana w kontroli B przed
--     migracja — ma sie zgadzac co do jednego pliku.
--
--     select count(*) as plikow_po from public.knowledge_files;
--
--     select count(*) as obiektow_w_buckecie
--       from storage.objects where bucket_id = 'knowledge';
--
--  E) IZOLACJA NIETKNIETA. Oczekiwane: 5 tabel, rowsecurity = true,
--     przy kazdej polityka <tabela>_wlasne dla {authenticated}.
--
--     select t.tablename, t.rowsecurity, p.policyname, p.roles
--       from pg_tables t
--       left join pg_policies p
--         on p.schemaname = t.schemaname and p.tablename = t.tablename
--      where t.schemaname = 'public'
--        and t.tablename in ('projects','agents','knowledge_files',
--                            'conversations','messages')
--      order by t.tablename;
--
--  F) Storage bez zmian. Oczekiwane: dokladnie jedna polityka
--     knowledge_wlasne_pliki (ALL, {authenticated}).
--
--     select policyname, roles, cmd
--       from pg_policies
--      where schemaname = 'storage' and tablename = 'objects';
--
--  G) Brak duchow: zaden agent nie wskazuje nieistniejacego pliku.
--     Oczekiwane: brak wierszy.
--
--     select a.name, a.knowledge_file_ids
--       from public.agents a
--      where exists (
--        select 1 from jsonb_array_elements_text(a.knowledge_file_ids) x(fid)
--         where not exists (
--           select 1 from public.knowledge_files kf where kf.id::text = x.fid
--         )
--      );
--
--  ------------------------------------------------------------
--  TEST W APLIKACJI (po migracji, na OBU kontach):
--
--    1. /wiedza — lista plikow wczytuje sie bez bledu. To najwazniejszy
--       punkt: gdyby ktores zapytanie nadal prosilo o project_id, tutaj
--       wysypaloby sie pierwsze.
--    2. Wgraj nowy plik — dodaje sie i pojawia na liscie.
--    3. Kreator agenta -> karta Baza wiedzy: pula pelna, zaznaczanie dziala,
--       zapis przechodzi.
--    4. Podglad promptu — tresc zaznaczonych plikow jest w instrukcji.
--       Gdyby knowledgeForAgent.js gdzies jeszcze pytal o project_id,
--       blad zamienilby sie w PUSTA liste i wiedza zniknelaby po cichu.
--       Dlatego ten punkt sprawdza sie oczami, nie brakiem bledu.
--    5. Skasuj plik uzywany przez agenta — modal wymienia go z nazwy,
--       po skasowaniu kontrola G nadal zwraca zero wierszy.
--    6. Skasuj projekt z agentem — pliki zostaja w magazynie.
--    7. Konto testowe widzi wylacznie swoje pliki.
-- ============================================================
