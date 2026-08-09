-- ############################################################################
--  KOLEJNOŚĆ MA ZNACZENIE — PRZECZYTAJ PRZED URUCHOMIENIEM
--
--  Ten plik TWORZY pięć tabel rag_* (rag_collections, rag_documents,
--  rag_chunks, rag_concepts, rag_chunk_concepts) i jest WYMAGANY przy
--  stawianiu modułu od zera. Nie jest archiwalny — w supabase/*.sql nie ma
--  ani jednego "create table" dla tabel rag_*, tamte migracje tylko je
--  modyfikują.
--
--  Ale kończy się WYŁĄCZENIEM RLS na tych tabelach (linie 135-139), z czasów,
--  gdy projekt był jednoużytkownikowy. Naprawia to supabase/016_rls_rag.sql,
--  który włącza RLS z powrotem i zakłada polityki "for all to authenticated".
--
--  URUCHAMIAJ WYŁĄCZNIE PRZED 016_rls_rag.sql.
--
--  Ponowne uruchomienie PO 016 zdejmie RLS z pięciu tabel — cicho, bez błędu.
--  Aplikacja będzie działać dalej, a dane przestaną być izolowane między
--  kontami. Nic tego nie zgłosi.
-- ############################################################################

-- =============================================================================
--  Sesja 2 - schemat bazy RAG. Uruchamiasz TY recznie w Supabase -> SQL Editor.
--
--  Baza jest PRODUKCYJNA (wspoldzielona z AIDEAS). Bezpieczenstwo granicy:
--    - wszystkie tabele maja prefiks rag_,
--    - klucze obce WYLACZNIE miedzy rag_* (zero FK do tabel AIDEAS),
--    - powiazanie zewnetrzne to pole external_ref (tekst, bez FK).
--
--  Wymiar wektora = 1024 (bge-m3, zatwierdzony w Sesji 1) - LITERAL, bo Postgres
--  nie czyta zmiennych srodowiskowych (sekcja 7.1). Prefiks rag_ tez jest literalem.
--
--  Skrypt jest idempotentny na tyle, na ile sie da (create ... if not exists,
--  alter ... disable). Mozna go puscic ponownie bez wysypki.
-- =============================================================================

-- Rozszerzenie wektorowe (idempotentne; masz je juz z Sesji 0 - nie zaszkodzi).
create extension if not exists vector;

-- --- rag_collections ---------------------------------------------------------
create table if not exists rag_collections (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  external_ref text,                              -- hak integracyjny; BEZ FK do AIDEAS
  status       text not null default 'active',    -- 'active' | 'archived'
  embed_model  text,                              -- model uzyty do zbudowania kolekcji
  embed_dim    int,                               -- rzeczywisty wymiar modelu (spojny z embed_model)
  projection   jsonb,                             -- baza rzutowania 2D (sekcja 12)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Indeks unikalny CZESCIOWY na external_ref (hak integracyjny): jedna kolekcja
-- na dane external_ref, ale wiele kolekcji moze miec external_ref = null.
create unique index if not exists rag_collections_external_ref_uidx
  on rag_collections (external_ref)
  where external_ref is not null;

-- --- rag_documents -----------------------------------------------------------
create table if not exists rag_documents (
  id             uuid primary key default gen_random_uuid(),
  collection_id  uuid not null references rag_collections(id) on delete cascade,
  file_name      text not null,
  file_path      text,
  mime_type      text,
  size_bytes     bigint,
  page_count     int,
  char_count     int,
  chunk_count    int not null default 0,
  extracted_text text,                            -- pelny tekst po ekstrakcji (sekcja 8.4)
  status         text not null default 'pending',
                 -- 'pending'|'extracting'|'chunking'|'chunked'|'embedding'|'ready'|'no_text'|'error'
  error_message  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- --- rag_chunks --------------------------------------------------------------
create table if not exists rag_chunks (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references rag_documents(id) on delete cascade,
  collection_id  uuid not null references rag_collections(id) on delete cascade,
  chunk_index    int not null,
  content        text not null,                   -- DOKLADNY wycinek extracted_text (sekcja 8.4)
  heading_path   text,                            -- "Rozdzial 3 > 3.2 Urlopy"
  page_from      int,                             -- null dla docx
  page_to        int,
  char_start     int not null,                    -- offset w rag_documents.extracted_text
  char_end       int not null,
  token_estimate int,                             -- dlugosc content / 4 (przyblizenie)
  embedding      vector(1024),                    -- LITERAL (bge-m3 @ 1024, Sesja 1)
  coord_x        real,
  coord_y        real,
  coord_z        real,                            -- trzecia skladowa PCA (widok 3D, 12.8)
  neighbors      jsonb,                           -- sasiedztwo 2D: [{id, dist2d}] (12.6)
  created_at     timestamptz not null default now(),
  unique (document_id, chunk_index)
);

-- Indeksy wg 7.2 - SWIADOMIE tylko btree na collection_id i document_id.
-- ZADNEGO indeksu wektorowego (ivfflat/hnsw): przy ~2000 fragmentow skan
-- sekwencyjny jest szybszy, a ivfflat na malym zbiorze pogarsza trafnosc (7.2).
create index if not exists rag_chunks_collection_id_idx on rag_chunks (collection_id);
create index if not exists rag_chunks_document_id_idx   on rag_chunks (document_id);

-- --- rag_concepts (tworzone teraz, wypelniane w wariancie 2) ------------------
create table if not exists rag_concepts (
  id               uuid primary key default gen_random_uuid(),
  collection_id    uuid not null references rag_collections(id) on delete cascade,
  label            text not null,
  label_normalized text not null,
  embedding        vector(1024),                  -- LITERAL (ten sam wymiar co rag_chunks)
  mention_count    int default 0,
  coord_x          real,
  coord_y          real,
  coord_z          real,                          -- srodek ciezkosci fragmentow pojecia (12.5)
  merged_into      uuid references rag_concepts(id),  -- null dla kanonicznych (Sesja 8)
  created_at       timestamptz not null default now(),
  unique (collection_id, label_normalized)
);

-- --- rag_chunk_concepts (powiazanie fragment <-> pojecie) ---------------------
create table if not exists rag_chunk_concepts (
  chunk_id   uuid not null references rag_chunks(id)   on delete cascade,
  concept_id uuid not null references rag_concepts(id) on delete cascade,
  weight     real default 1,
  primary key (chunk_id, concept_id)
);

-- --- RLS ----------------------------------------------------------------------
-- Projekt jednouzytkownikowy: Supabase domyslnie WLACZA RLS i bez polityk
-- zablokuje zapis. Wylaczamy jawnie. Do bazy siega wylacznie serwer kluczem
-- service_role (architektura trojwarstwowa, sekcja 3).
-- TODO: owner_id + RLS przy logowaniu
alter table rag_collections    disable row level security;
alter table rag_documents      disable row level security;
alter table rag_chunks         disable row level security;
alter table rag_concepts       disable row level security;
alter table rag_chunk_concepts disable row level security;
