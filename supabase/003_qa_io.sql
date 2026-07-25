-- ============================================================
--  AIdeas — migracja 003: Q&A + Wejście/Wyjście
--  Sesja B przebudowy kreatora
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. Lewe menu -> "SQL Editor" -> "New query"
--  3. Wklej CALY ten plik -> "Run"
--  4. Sprawdz w "Table Editor" -> tabela agents ma kolumny
--     qas, input_settings, output_format
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--
--  NAZEWNICTWO: kolumny nazwane tak samo jak pola w state.agent,
--  zeby mapowanie aplikacja <-> baza pozostalo 1:1 (jak w migracji 002).
-- ============================================================

-- Pary pytanie-odpowiedz (few-shot dla agenta).
-- Ksztalt elementu: { "question": "...", "answer": "...", "enabled": true }
alter table public.agents
  add column if not exists qas jsonb not null default '[]'::jsonb;

-- Co agent przyjmuje na wejsciu.
alter table public.agents
  add column if not exists input_settings jsonb not null
  default '{"accept_text": true, "accept_files": false, "accept_images": false}'::jsonb;

-- Format odpowiedzi agenta: 'text' | 'markdown' | 'json'.
alter table public.agents
  add column if not exists output_format text not null default 'text';

-- Bezpieczniki spojnosci (dodawane tylko, gdy jeszcze nie istnieja).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agents_qas_is_array'
  ) then
    alter table public.agents
      add constraint agents_qas_is_array
      check (jsonb_typeof(qas) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'agents_input_settings_is_object'
  ) then
    alter table public.agents
      add constraint agents_input_settings_is_object
      check (jsonb_typeof(input_settings) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'agents_output_format_allowed'
  ) then
    alter table public.agents
      add constraint agents_output_format_allowed
      check (output_format in ('text', 'markdown', 'json'));
  end if;
end $$;

-- Istniejacy trigger agents_set_updated_at (migracja 001) obsluguje nowe kolumny.

-- Kontrola po migracji:
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'agents'
--    and column_name in ('qas', 'input_settings', 'output_format');
