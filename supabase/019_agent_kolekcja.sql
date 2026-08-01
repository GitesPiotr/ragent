-- ============================================================
--  AIdeas — migracja 019: agent wskazuje kolekcje RAG
--
--  CO ROBI: dodaje agents.rag_collection_id. Jedna kolumna, jeden indeks,
--  zero zmian w istniejacych danych.
--
--  MODEL: JEDEN AGENT = JEDNA KOLEKCJA (SPEC 18.a). Agent nie wybiera
--  pojedynczych dokumentow — zakresem wyszukiwania jest CALA wskazana kolekcja.
--  Wybor podzbioru istnieje w rdzeniu (documentIds), ale AIDEAS z niego nie
--  korzysta: kolekcja JEST jednostka organizacyjna, a dzielenie jej w kreatorze
--  agenta znaczyloby, ze uzytkownik utrzymuje ten sam podzial w dwoch miejscach.
--
--  ZMIANA MODELU WZGLEDEM RUNDY 5: wczesniej plik z Bazy wiedzy indeksowal sie
--  do kolekcji konta, a agent wskazywal PLIKI. Wycofane. Baza wiedzy i Kreator
--  RAG sa teraz DWOMA OSOBNYMI NARZEDZIAMI:
--    Baza wiedzy — pliki doklejane do promptu w calosci (tryb 1), bez RAG,
--    Kreator RAG — wlasne kolekcje i wlasne wgrywanie plikow.
--  Kolumna rag_documents.external_ref z migracji 018 zostaje NIEUZYWANA.
--  Migracji kasujacej swiadomie nie ma — kolumna nikomu nie przeszkadza,
--  a jej usuniecie byloby nieodwracalne przy pierwszej zmianie zdania.
--
--  ------------------------------------------------------------
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. SQL Editor -> New query
--  3. Wklej CALY plik -> Run
--  4. Uruchom zapytania kontrolne z konca pliku.
--
--  Skrypt jest idempotentny. Kopia bazy nie jest konieczna: dodanie kolumny
--  NULLABLE bez wartosci domyslnej nie przepisuje tabeli i nie rusza wierszy.
--
--  JAK TO COFNAC:
--      drop index if exists public.agents_rag_collection_id_idx;
--      alter table public.agents drop column if exists rag_collection_id;
-- ============================================================

begin;

-- ------------------------------------------------------------
--  BEZ KLUCZA OBCEGO DO rag_collections — I TO JEST WYBOR.
--
--  Granica z sekcji 3 SPEC dziala W OBIE STRONY. Modul RAG ma zakaz kluczy
--  obcych do tabel AIDEAS (session-2-schema.sql:6) i konsekwentnie tabele
--  AIDEAS tez nie wiaza sie kluczem z rag_*. Powod jest ten sam po obu
--  stronach: oba zbiory maja dac sie wdrozyc, zmigrowac i skasowac osobno.
--  Klucz obcy zamienilby "dwa moduly w jednej bazie" w "jeden schemat",
--  a wtedy schemat rag_* przestalby byc wymienialny.
--
--  NULL = agent nie korzysta z RAG. To jest stan DOMYSLNY i poprawny —
--  wszystkie istniejace wiersze dostaja NULL i zachowuja sie dokladnie tak,
--  jak przed migracja.
-- ------------------------------------------------------------
alter table public.agents
  add column if not exists rag_collection_id uuid;

comment on column public.agents.rag_collection_id is
  'Kolekcja RAG przeszukiwana przez narzedzie rag_search. NULL = agent nie korzysta z RAG. BEZ FK do rag_collections (granica sekcji 3 SPEC dziala w obie strony).';

-- Indeks pod pytanie "ktorzy agenci wskazuja te kolekcje" — potrzebne przy
-- kasowaniu kolekcji (patrz nizej) i przy diagnostyce osieroconych wskazan.
-- Czesciowy, bo wiekszosc agentow ma tu NULL i nie ma po co ich indeksowac.
create index if not exists agents_rag_collection_id_idx
  on public.agents (rag_collection_id)
  where rag_collection_id is not null;

commit;

-- ============================================================
--  CO SIE STANIE, GDY SKASUJESZ KOLEKCJE, NA KTORA WSKAZUJE AGENT
--
--  ODPOWIEDZ WPROST: NIC. Nikt tego nie pilnuje i nikt nie zaprotestuje.
--  agents.rag_collection_id zostaje z identyfikatorem, ktorego juz nie ma —
--  jest to WSKAZANIE OSIEROCONE.
--
--  OBJAW jest lagodny i to nie przypadek. Narzedzie rag_search siega po
--  kolekcje klientem Z SESJA, wiec RLS zwraca brak wiersza dokladnie tak samo
--  dla kolekcji SKASOWANEJ, jak dla CUDZEJ. Narzedzie mowi wtedy modelowi,
--  ze wskazana kolekcja jest niedostepna, a model przekazuje to uzytkownikowi.
--  Agent NIE MILCZY i NIE ZGADUJE — odpowiada bez dokumentow i mowi dlaczego.
--
--  DLACZEGO NIE ROBIMY KASKADY (ani FK z on delete set null):
--  bo to jest pytanie PRODUKTOWE, nie schematowe. Skasowanie kolekcji, ktorej
--  uzywa piatka agentow, powinno przede wszystkim ZAPYTAC — a nie po cichu
--  wyzerowac im wskazania. Kaskada w bazie wyglada na porzadek, a naprawde
--  odbiera mozliwosc ostrzezenia: zanim UI zdazy cokolwiek powiedziec, dane
--  juz sa zmienione. AIDEAS ma na to gotowy wzorzec — modal kasowania projektu
--  i pliku wiedzy wymienia, kto straci dostep (lib/data/knowledge.js,
--  listKnowledgeUsage) — i to jest to samo pytanie.
--
--  PROPONOWANE ROZWIAZANIE (do zrobienia w Kreatorze RAG, NIE w tej migracji):
--    1. przed usunieciem kolekcji policzyc agentow, ktorzy ja wskazuja
--       (zapytanie kontrolne nr 2 nizej),
--    2. gdy sa — pokazac modal z ich lista, tak jak przy kasowaniu pliku,
--    3. po potwierdzeniu wyzerowac wskazania JAWNIE, jednym update'em,
--       a dopiero potem skasowac kolekcje.
--  Kolejnosc jak przy kasowaniu pliku wiedzy: najpierw odpiac, potem usunac.
--  Odwrotna zostawia agentow wskazujacych na nieistniejacy zasob.
--
--  DIAGNOSTYKA W MIEDZYCZASIE: zapytanie kontrolne nr 3 wypisuje wszystkie
--  osierocone wskazania. Warto na nie zerknac, zanim ktos zglosi,
--  ze "agent przestal widziec dokumenty".
-- ============================================================

-- ============================================================
--  ZAPYTANIA KONTROLNE — uruchom KAZDE osobno, w nowym "New query".
-- ============================================================

-- --- 1) Kolumna i indeks istnieja ------------------------------------------
--  Oczekiwane: rag_collection_id, uuid, is_nullable = YES, brak default.
--
--  select column_name, data_type, is_nullable, column_default
--    from information_schema.columns
--   where table_schema = 'public' and table_name = 'agents'
--     and column_name = 'rag_collection_id';
--
--  select indexname, indexdef
--    from pg_indexes
--   where schemaname = 'public' and tablename = 'agents'
--     and indexname = 'agents_rag_collection_id_idx';

-- --- 2) Kto wskazuje dana kolekcje — PRZED jej skasowaniem ------------------
--  Podstaw id kolekcji. Pusty wynik = mozna kasowac bez konsekwencji.
--
--  select a.id, a.name, a.status, p.name as projekt
--    from public.agents a
--    left join public.projects p on p.id = a.project_id
--   where a.rag_collection_id = '<WKLEJ-ID-KOLEKCJI>'::uuid;

-- --- 3) Wskazania OSIEROCONE — kolekcja juz nie istnieje --------------------
--  Oczekiwane: zero wierszy. Kazdy wiersz to agent, ktory mysli, ze ma
--  dokumenty, a nie ma.
--
--  UWAGA NA RLS: uruchamiane w SQL Editorze (rola postgres) widzi wszystkie
--  wiersze obu tabel, wiec wynik jest globalny, nie per konto. To wlasnie
--  jest tu potrzebne — chodzi o sprzatanie, nie o widok uzytkownika.
--
--  select a.id, a.name, a.rag_collection_id
--    from public.agents a
--   where a.rag_collection_id is not null
--     and not exists (
--       select 1 from public.rag_collections c where c.id = a.rag_collection_id
--     );

-- --- 4) Ilu agentow w ogole korzysta z RAG ---------------------------------
--  Podglad przyjecia sie funkcji; przy okazji pokazuje, czy ktos nie wskazal
--  kolekcji masowo przez pomylke.
--
--  select count(*) filter (where rag_collection_id is not null) as z_ragiem,
--         count(*) filter (where rag_collection_id is null)     as bez_raga,
--         count(*)                                              as razem
--    from public.agents;
