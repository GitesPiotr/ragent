-- ============================================================
--  AIdeas — migracja 007: owner_id (wlasciciel rekordu)
--  Sesja 3 tematu logowanie/konta/RLS.
--
--  CO ROBI: dodaje kolumne owner_id do wszystkich 5 tabel i przypisuje
--  istniejace dane do konta wlasciciela. RLS NIE jest wlaczane — to tylko
--  przygotowanie gruntu pod izolacje danych (sesja 4).
--  Aplikacja po tej migracji dziala DOKLADNIE tak jak przed nia.
--
--  !!! PRZED URUCHOMIENIEM ZROB KOPIE BAZY !!!
--  Dashboard -> Database -> Backups. Skrypt naklada NOT NULL na piec tabel;
--  bezpieczniki ponizej chronia przed bledem, ale kopia jest tansza niz
--  zaufanie do nich.
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. Lewe menu -> "SQL Editor" -> "New query"
--  3. Wklej CALY ten plik -> "Run"
--  4. Zajrzyj do zakladki "Messages" — beda tam liczby z backfillu.
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
-- ============================================================

-- ------------------------------------------------------------
--  KROK 1: kolumny owner_id — NA RAZIE NULLABLE.
--
--  NOT NULL naklada sie dopiero po backfillu (krok 5). Proba dodania
--  "not null" od razu na tabeli z istniejacymi wierszami ZAWSZE konczy sie
--  bledem — Postgres nie ma czym wypelnic juz istniejacych wierszy.
--
--  on delete cascade: skasowanie konta w auth.users kasuje rowniez jego dane.
-- ------------------------------------------------------------
alter table public.projects
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.agents
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.knowledge_files
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.conversations
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.messages
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- ------------------------------------------------------------
--  KROK 2: BACKFILL — wszystkie istniejace wiersze na konto wlasciciela.
--
--  UUID wystepuje w calym skrypcie DOKLADNIE RAZ — w linii ponizej.
--  Blok najpierw sprawdza, czy takie konto istnieje, i przerywa CALA
--  migracje, jesli nie. Lepiej czytelny blad niz po cichu zle przypisane dane.
--
--  "where owner_id is null" sprawia, ze ponowne uruchomienie skryptu
--  NIE nadpisze wlascicieli ustawionych wczesniej.
-- ------------------------------------------------------------
do $$
declare
  v_owner uuid := '54463626-3794-43ae-a58b-8b1fc10b61e8';
  n_projects int; n_agents int; n_files int; n_convs int; n_msgs int;
begin
  if not exists (select 1 from auth.users where id = v_owner) then
    raise exception
      'Nie znaleziono uzytkownika o id %. Sprawdz UUID w auth.users i uruchom ponownie. Nic nie zostalo zmienione.',
      v_owner;
  end if;

  update public.projects        set owner_id = v_owner where owner_id is null;
  get diagnostics n_projects = row_count;

  update public.agents          set owner_id = v_owner where owner_id is null;
  get diagnostics n_agents = row_count;

  update public.knowledge_files set owner_id = v_owner where owner_id is null;
  get diagnostics n_files = row_count;

  -- conversations: obejmuje TAKZE rozmowy bez agenta (agent_id is null)
  -- oraz te po usunietym agencie (ON DELETE SET NULL wyzerowal agent_id).
  -- Filtr idzie po samym owner_id, wiec zadna "sierota" nie umknie.
  update public.conversations   set owner_id = v_owner where owner_id is null;
  get diagnostics n_convs = row_count;

  update public.messages        set owner_id = v_owner where owner_id is null;
  get diagnostics n_msgs = row_count;

  raise notice 'Backfill: projects=%, agents=%, knowledge_files=%, conversations=%, messages=%',
    n_projects, n_agents, n_files, n_convs, n_msgs;
end $$;

-- ------------------------------------------------------------
--  KROK 3: DOMYSLNA WARTOSC dla NOWYCH wierszy.
--
--  To jest powod, dla ktorego kod aplikacji NIE wymaga zmian.
--  auth.uid() zwraca id zalogowanego uzytkownika z jego tokenu, wiec kazdy
--  insert z aplikacji sam dostaje wlasciciela — mimo ze lib/data/* o kolumnie
--  owner_id nic nie wie.
--
--  BEZ tego domyslnego wypelnienia krok 5 (NOT NULL) POPSULBY tworzenie
--  nowych projektow, agentow i rozmow.
-- ------------------------------------------------------------
alter table public.projects        alter column owner_id set default auth.uid();
alter table public.agents          alter column owner_id set default auth.uid();
alter table public.knowledge_files alter column owner_id set default auth.uid();
alter table public.conversations   alter column owner_id set default auth.uid();
alter table public.messages        alter column owner_id set default auth.uid();

-- ------------------------------------------------------------
--  KROK 4: KONTROLA przed zaostrzeniem — czy na pewno nie ma pustych?
--  Jesli cokolwiek zostalo puste, przerywamy PRZED nalozeniem NOT NULL.
-- ------------------------------------------------------------
do $$
declare v_left int;
begin
  select
    (select count(*) from public.projects        where owner_id is null) +
    (select count(*) from public.agents          where owner_id is null) +
    (select count(*) from public.knowledge_files where owner_id is null) +
    (select count(*) from public.conversations   where owner_id is null) +
    (select count(*) from public.messages        where owner_id is null)
  into v_left;

  if v_left > 0 then
    raise exception
      'Zostalo % wierszy bez owner_id — NOT NULL nie zostanie nalozone. Sprawdz krok 2 (backfill).',
      v_left;
  end if;

  raise notice 'Kontrola OK: zero wierszy bez owner_id.';
end $$;

-- ------------------------------------------------------------
--  KROK 5: NOT NULL — dopiero teraz, gdy kazdy wiersz ma wlasciciela.
-- ------------------------------------------------------------
alter table public.projects        alter column owner_id set not null;
alter table public.agents          alter column owner_id set not null;
alter table public.knowledge_files alter column owner_id set not null;
alter table public.conversations   alter column owner_id set not null;
alter table public.messages        alter column owner_id set not null;

-- ------------------------------------------------------------
--  KROK 6: INDEKSY.
--  Polityki RLS (sesja 4) beda filtrowac po owner_id przy KAZDYM zapytaniu.
--  Bez indeksu kazde takie zapytanie to skan calej tabeli.
-- ------------------------------------------------------------
create index if not exists projects_owner_id_idx        on public.projects (owner_id);
create index if not exists agents_owner_id_idx          on public.agents (owner_id);
create index if not exists knowledge_files_owner_id_idx on public.knowledge_files (owner_id);
create index if not exists conversations_owner_id_idx   on public.conversations (owner_id);
create index if not exists messages_owner_id_idx        on public.messages (owner_id);

-- ============================================================
--  KONTROLA PO MIGRACJI
--  Uruchom PONIZSZE zapytanie osobno (nowe "New query"), zeby zobaczyc wynik.
--  W kazdym wierszu obie liczby musza byc ROWNE.
--
--  select 'projects'        as tabela, count(*) as wierszy, count(owner_id) as z_wlascicielem from public.projects
--  union all select 'agents',          count(*), count(owner_id) from public.agents
--  union all select 'knowledge_files', count(*), count(owner_id) from public.knowledge_files
--  union all select 'conversations',   count(*), count(owner_id) from public.conversations
--  union all select 'messages',        count(*), count(owner_id) from public.messages;
--
--  Sprawdzenie, ze RLS NADAL jest wylaczony (rowlsecurity ma byc false):
--
--  select tablename, rowsecurity
--    from pg_tables
--   where schemaname = 'public'
--     and tablename in ('projects','agents','knowledge_files','conversations','messages');
-- ============================================================
