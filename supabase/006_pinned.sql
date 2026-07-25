-- ============================================================
--  AIdeas — migracja 006: Przypinanie rozmow (pinned)
--  Dodaje kolumne `pinned` do conversations oraz indeks wspierajacy
--  sortowanie: najpierw przypiete, potem wg ostatniej aktywnosci.
--
--  JAK URUCHOMIC (uruchom TERAZ, przed korzystaniem z menu akcji na liscie
--  rozmow — bez tej kolumny lista rozmow przestanie sie wczytywac):
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. Lewe menu -> „SQL Editor” -> „New query”
--  3. Wklej CALY ten plik -> „Run”
--  4. Sprawdz w „Table Editor” -> conversations, ze jest kolumna `pinned`.
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie.
-- ============================================================

-- Kolumna: przypieta rozmowa (domyslnie nie).
alter table public.conversations
  add column if not exists pinned boolean not null default false;

-- Indeks pod sortowanie listy: przypiete na gorze (pinned desc),
-- w obrebie grupy od najnowszej (updated_at desc).
create index if not exists conversations_pinned_updated_idx
  on public.conversations (pinned desc, updated_at desc);

-- Kontrola po migracji:
-- select id, title, pinned, updated_at from public.conversations
--   order by pinned desc, updated_at desc;
