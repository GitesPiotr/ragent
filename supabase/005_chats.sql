-- ============================================================
--  AIdeas — migracja 005: Czaty (zapisywane rozmowy)
--  Zakladka „Czaty”: rozmowy z zapisanym agentem ALBO z samym modelem.
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. Lewe menu -> „SQL Editor” -> „New query”
--  3. Wklej CALY ten plik -> „Run”
--  4. Sprawdz w „Table Editor”, ze sa tabele: conversations, messages
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie.
--
--  MODEL DANYCH:
--    conversations = jedna zapisana rozmowa (naglowek: tytul, z kim, model).
--    messages      = wiadomosci tej rozmowy (uzytkownik / asystent), po kolei.
--
--  Rozmowa MUSI przetrwac usuniecie agenta, dlatego:
--    - agent_id jest NULLABLE i ma ON DELETE SET NULL (rozmowa zostaje),
--    - agent_name_snapshot trzyma nazwe agenta z chwili rozmowy
--      (po usunieciu agenta pokazujemy „Agent usuniety (nazwa)”).
-- ============================================================

-- ------------------------------------------------------------
--  Wspolny trigger updated_at (ten sam co w schema.sql).
--  Powtarzamy definicje, zeby skrypt byl samowystarczalny.
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
--  TABELA: conversations
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null default 'Nowa rozmowa',
  -- Rozmowa z agentem -> agent_id wskazuje agenta. Rozmowa z samym modelem
  -- -> agent_id jest NULL. Po usunieciu agenta FK zeruje sie (rozmowa zostaje).
  agent_id            uuid references public.agents(id) on delete set null,
  -- Nazwa agenta z chwili rozmowy — przetrwa jego usuniecie.
  agent_name_snapshot text,
  -- Provider + model rozmowy. Dla rozmowy z modelem to jedyne zrodlo prawdy;
  -- dla rozmowy z agentem to snapshot (agent moze pozniej zmienic model).
  provider            text not null,
  model               text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Lista rozmow sortowana od najnowszej (po dacie ostatniej aktywnosci).
create index if not exists conversations_updated_at_idx
  on public.conversations (updated_at desc);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
--  TABELA: messages
-- ------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

-- Wiadomosci ZAWSZE czytamy dla jednej rozmowy, po kolei — indeks zlozony.
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- ------------------------------------------------------------
--  RLS — NIEAKTUALNE, CELOWO WYLACZONE Z TEGO SKRYPTU.
--
--  !!! NIE ODKOMENTOWUJ TYCH DWOCH LINII !!!
--
--  Pierwotnie ten skrypt jawnie WYLACZAL Row Level Security na
--  conversations i messages — bo aplikacja byla jednouzytkownikowa,
--  chodzila lokalnie i pisala kluczem anon.
--
--  Od Sesji 4 (migracje 008-012) aplikacja jest WIELOKONTOWA, a izolacja
--  danych opiera sie wlasnie na RLS. Kazda z pieciu tabel ma polityke
--  "<tabela>_wlasne" filtrujaca po auth.uid() = owner_id.
--
--  Skrypty w tym folderze sa idempotentne i uruchamia sie je ponownie
--  "na wszelki wypadek". Gdyby te dwie linie zostaly aktywne, takie
--  ponowne uruchomienie WYLACZYLOBY IZOLACJE na conversations i messages
--  — po cichu, bez bledu i bez ostrzezenia. Kazde konto zobaczyloby
--  wtedy cudze rozmowy i ich tresc.
--
--  Dlatego zostaja zakomentowane, a nie usuniete: zeby bylo widac,
--  co tu kiedys stalo i dlaczego juz nie stoi.
--
--    alter table public.conversations disable row level security;
--    alter table public.messages      disable row level security;
--
--  Wlasciwe polityki zakladaja:
--    supabase/011_rls_conversations.sql
--    supabase/012_rls_messages.sql
-- ------------------------------------------------------------

-- Kontrola po migracji:
-- select count(*) from public.conversations;
-- select count(*) from public.messages;
