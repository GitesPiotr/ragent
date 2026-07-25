-- ============================================================
--  AIdeas — schemat bazy (Supabase / PostgreSQL)
--  Sesja: "Zakladki Projekty/Agenty + Supabase"
--
--  JAK URUCHOMIC:
--  1. Wejdz na https://supabase.com/dashboard -> Twoj projekt
--  2. Z lewego menu wybierz "SQL Editor" -> "New query"
--  3. Wklej CALY ten plik i kliknij "Run"
--  4. Sprawdz w "Table Editor", ze pojawily sie tabele: projects, agents
--
--  Skrypt jest idempotentny (IF NOT EXISTS / CREATE OR REPLACE) —
--  mozna go bezpiecznie uruchomic ponownie.
-- ============================================================

-- ------------------------------------------------------------
--  Wspolny trigger: automatyczna aktualizacja updated_at.
--  Dzieki temu aplikacja nie musi pamietac o ustawianiu tego pola.
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
--  TABELA: projects
--  Projekt = kontener na agentow. NIE zawiera agentow zagniezdzonych —
--  relacja idzie w druga strone (agents.project_id -> projects.id).
-- ------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  -- Soft-delete: 'archived' zamiast fizycznego kasowania rekordu.
  status      text not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()

  -- PRZYSZLOSC (tryb wieloosobowy):
  --   owner_id uuid not null references auth.users(id) on delete cascade
  -- Wtedy dochodzi RLS — patrz sekcja na koncu pliku.
);

-- Lista projektow jest sortowana po dacie modyfikacji (najnowsze u gory).
create index if not exists projects_updated_at_idx
  on public.projects (updated_at desc);

-- Filtrowanie listy po statusie (domyslnie pokazujemy tylko 'active').
create index if not exists projects_status_idx
  on public.projects (status);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
--  TABELA: agents
--  Agent nalezy do dokladnie jednego projektu (project_id).
--  W TEJ sesji tylko pola podstawowe. Pelna konfiguracja agenta
--  (personality / system_prompt / model_provider / model_name /
--  temperature oraz rules i tools jako jsonb) dojdzie przy kreatorze —
--  patrz zakomentowany blok ponizej.
-- ------------------------------------------------------------
create table if not exists public.agents (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null,
  description text,
  role        text,
  status      text not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()

  -- Pelna konfiguracja agenta (persona, provider, model, temperature,
  -- rules, tools) dochodzi w migracji supabase/002_agent_config.sql.
);

-- Agentow zawsze pobieramy filtrujac po project_id — indeks obowiazkowy.
create index if not exists agents_project_id_idx
  on public.agents (project_id);

create index if not exists agents_updated_at_idx
  on public.agents (updated_at desc);

create index if not exists agents_status_idx
  on public.agents (status);

drop trigger if exists agents_set_updated_at on public.agents;
create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

-- ============================================================
--  BEZPIECZENSTWO — STAN OBECNY I PRZYSZLOSC
--
--  TERAZ: aplikacja jest JEDNOUZYTKOWNIKOWA i dziala lokalnie,
--  wiec RLS zostaje WYLACZONE. Klucz publishable (anon) ma pelny
--  dostep do obu tabel. Supabase oznaczy je w dashboardzie jako
--  "Unrestricted" — na tym etapie to jest swiadoma decyzja.
--
--  UWAGA: nie wystawiaj tej bazy publicznie w tym stanie.
--
--  PRZYSZLOSC (gdy dojdzie logowanie i wielu uzytkownikow):
--  1. Dodaj kolumne owner_id do obu tabel:
--       alter table public.projects
--         add column owner_id uuid not null references auth.users(id) on delete cascade;
--       alter table public.agents
--         add column owner_id uuid not null references auth.users(id) on delete cascade;
--  2. Wlacz RLS i dodaj polityki:
--       alter table public.projects enable row level security;
--       alter table public.agents   enable row level security;
--
--       create policy "wlasne projekty" on public.projects
--         for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
--
--       create policy "wlasni agenci" on public.agents
--         for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
-- ============================================================
