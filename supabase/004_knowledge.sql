-- ============================================================
--  AIdeas — migracja 004: Baza wiedzy (pliki projektu)
--  Sesja C przebudowy kreatora
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. Lewe menu -> "SQL Editor" -> "New query"
--  3. Wklej CALY ten plik -> "Run"
--  4. Sprawdz:
--     - "Table Editor" -> jest tabela knowledge_files
--     - "Storage" -> jest bucket "knowledge"
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie.
--
--  MODEL DANYCH: pliki wiedzy naleza do PROJEKTU (knowledge_files.project_id).
--  Agent tylko WSKAZUJE, ktorych uzywa (agents.knowledge_mode + knowledge_file_ids).
-- ============================================================

-- ------------------------------------------------------------
--  1) BUCKET na pliki wiedzy
--  Zakladamy go SQL-em, zeby nie trzeba bylo klikac w panelu.
--  public = false -> pliki nie sa dostepne publicznym URL-em.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('knowledge', 'knowledge', false)
on conflict (id) do nothing;

-- Polityki dostepu do bucketu — NIEAKTUALNE, CELOWO WYLACZONE Z TEGO SKRYPTU.
--
-- !!! NIE ODKOMENTOWUJ TEGO BLOKU !!!
--
-- Pierwotnie skrypt zakladal tu polityke aideas_knowledge_all: "for all,
-- to anon + authenticated, using (bucket_id = 'knowledge')". Zaden warunek
-- nie dotyczyl wlasciciela — kazdy, kto znal sciezke, mial dostep do kazdego
-- pliku, lacznie z niezalogowanymi. Bylo to spojne z owczesna decyzja
-- o aplikacji JEDNOUZYTKOWNIKOWEJ i wylaczonym RLS na tabelach.
--
-- Od Sesji 5 (migracja 013_rls_storage.sql) obowiazuje polityka
-- knowledge_wlasne_pliki, ktora dopuszcza konto wylacznie do jego wlasnego
-- folderu <owner_id>/ w buckecie.
--
-- Skrypty w tym folderze sa idempotentne i uruchamia sie je ponownie
-- "na wszelki wypadek". Gdyby ten blok zostal aktywny, takie uruchomienie
-- ODTWORZYLOBY otwarta polityke obok nowej. Polityki PERMISSIVE lacza sie
-- przez OR, wiec bucket zostalby OTWARTY DLA WSZYSTKICH — po cichu, bez
-- bledu i bez ostrzezenia.
--
-- Zostaje zakomentowane, a nie usuniete: zeby bylo widac, co tu stalo
-- i dlaczego juz nie stoi.
--
--   do $$
--   begin
--     if not exists (
--       select 1 from pg_policies
--        where schemaname = 'storage' and tablename = 'objects'
--          and policyname = 'aideas_knowledge_all'
--     ) then
--       create policy "aideas_knowledge_all" on storage.objects
--         for all
--         to anon, authenticated
--         using (bucket_id = 'knowledge')
--         with check (bucket_id = 'knowledge');
--     end if;
--   end $$;

-- ------------------------------------------------------------
--  2) TABELA knowledge_files
-- ------------------------------------------------------------
create table if not exists public.knowledge_files (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  file_name      text not null,
  -- Sciezka w Storage (bucket "knowledge"), np. "<project_id>/<uuid>-nazwa.pdf".
  file_path      text not null,
  size           bigint not null default 0,
  mime_type      text,
  -- Tekst wyciagniety z pliku — to jego trafia do promptu agenta.
  extracted_text text,
  -- 'ready'   = tekst wyciagniety poprawnie
  -- 'no_text' = plik nie zawiera warstwy tekstowej (np. PDF ze skanu)
  -- 'error'   = ekstrakcja sie nie powiodla (szczegoly w status_message)
  status         text not null default 'ready'
                 check (status in ('ready', 'no_text', 'error')),
  status_message text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists knowledge_files_project_id_idx
  on public.knowledge_files (project_id);

create index if not exists knowledge_files_created_at_idx
  on public.knowledge_files (created_at desc);

drop trigger if exists knowledge_files_set_updated_at on public.knowledge_files;
create trigger knowledge_files_set_updated_at
  before update on public.knowledge_files
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
--  3) AGENT: ktore pliki wykorzystuje
-- ------------------------------------------------------------
-- 'none'     = agent nie korzysta z bazy wiedzy
-- 'all'      = korzysta ze WSZYSTKICH plikow projektu
-- 'selected' = korzysta tylko z plikow wskazanych w knowledge_file_ids
alter table public.agents
  add column if not exists knowledge_mode text not null default 'none';

alter table public.agents
  add column if not exists knowledge_file_ids jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agents_knowledge_mode_allowed'
  ) then
    alter table public.agents
      add constraint agents_knowledge_mode_allowed
      check (knowledge_mode in ('none', 'all', 'selected'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'agents_knowledge_file_ids_is_array'
  ) then
    alter table public.agents
      add constraint agents_knowledge_file_ids_is_array
      check (jsonb_typeof(knowledge_file_ids) = 'array');
  end if;
end $$;

-- Kontrola po migracji:
-- select id, name, public from storage.buckets where id = 'knowledge';
-- select count(*) from public.knowledge_files;
