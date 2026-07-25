-- ============================================================
--  AIdeas — migracja 002: pelna konfiguracja agenta
--  Sesja: "Polaczenie kreatora z baza"
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. Lewe menu -> "SQL Editor" -> "New query"
--  3. Wklej CALY ten plik -> "Run"
--  4. Sprawdz w "Table Editor" -> tabela agents ma nowe kolumny
--
--  Skrypt jest idempotentny (add column if not exists) — mozna go
--  bezpiecznie uruchomic ponownie.
--
--  NAZEWNICTWO: kolumny nazwane DOKLADNIE tak, jak pola w state.agent
--  (persona, provider, model, temperature, rules, tools), zeby mapowanie
--  aplikacja <-> baza bylo 1:1 i nie wymagalo tlumaczenia nazw.
--
--  Uwaga: osobna kolumna system_prompt NIE jest potrzebna — w tej aplikacji
--  rolę system promptu pelni wlasnie `persona` (tak jest opisana w kreatorze:
--  "Osobowość agenta (system prompt)").
-- ============================================================

-- Osobowosc = system prompt agenta.
alter table public.agents
  add column if not exists persona text;

-- Dostawca modelu: 'anthropic' | 'openai' | 'ollama'.
alter table public.agents
  add column if not exists provider text not null default 'anthropic';

-- Identyfikator modelu, np. 'claude-haiku-4-5'. Dla Ollamy nazwa modelu lokalnego.
alter table public.agents
  add column if not exists model text not null default 'claude-haiku-4-5';

-- Temperatura 0–1. Cast na numeric(3,2) wystarcza dla kroku 0.1 z suwaka.
alter table public.agents
  add column if not exists temperature numeric(3,2) not null default 0.7;

-- Pola zagniezdzone trzymamy jako jsonb (tablice stringow).
--   rules: ["Zawsze odpowiadaj po polsku", ...]
--   tools: ["calculator", "datetime"]
alter table public.agents
  add column if not exists rules jsonb not null default '[]'::jsonb;

alter table public.agents
  add column if not exists tools jsonb not null default '[]'::jsonb;

-- Bezpieczniki spojnosci danych (dodawane tylko, gdy jeszcze nie istnieja).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agents_temperature_range'
  ) then
    alter table public.agents
      add constraint agents_temperature_range
      check (temperature >= 0 and temperature <= 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'agents_rules_is_array'
  ) then
    alter table public.agents
      add constraint agents_rules_is_array
      check (jsonb_typeof(rules) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'agents_tools_is_array'
  ) then
    alter table public.agents
      add constraint agents_tools_is_array
      check (jsonb_typeof(tools) = 'array');
  end if;
end $$;

-- Istniejacy trigger agents_set_updated_at (z migracji 001) obsluguje juz
-- nowe kolumny — kazdy update odswieza updated_at automatycznie.

-- Kontrola: podglad struktury po migracji.
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'agents'
--  order by ordinal_position;
