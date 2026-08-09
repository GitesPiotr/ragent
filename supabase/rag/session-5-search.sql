-- ############################################################################
--  KOLEJNOŚĆ MA ZNACZENIE
--
--  Część sekwencji stawiania modułu RAG, nie plik archiwalny: tworzy funkcję rag_search_chunks.
--
--  Uruchamiaj PRZED migracjami numerowanymi od supabase/016_rls_rag.sql w górę
--  — one zakładają, że te obiekty już istnieją (nadają im prawa, dokładają
--  owner_id i polityki RLS).
--
--  Ponowne uruchomienie jest nieszkodliwe dla RLS, ale cofa definicję do tej
--  z tego pliku, czyli kasuje późniejsze poprawki. Wyjątkiem jest
--  session-2-schema.sql — tam ponowne uruchomienie WYŁĄCZA RLS.
-- ############################################################################

-- =============================================================================
--  Sesja 5 - wyszukiwanie wektorowe. Uruchamiasz TY recznie w Supabase -> SQL Editor.
--
--  DLACZEGO W OGOLE FUNKCJA W BAZIE:
--  klient Supabase rozmawia z baza przez PostgREST, ktory nie potrafi wyrazic
--  sortowania operatorem pgvector (order by embedding <=> $1). Zapytanie wektorowe
--  musi wiec zyc po stronie Postgresa. Alternatywa - sciagniecie wszystkich wektorow
--  do Node i liczenie kosinusa w JS - przy docelowych ~2000 fragmentach oznacza
--  kilkadziesiat MB JSON-a na KAZDE zapytanie. Odpada.
--
--  ZAKRES: jedna funkcja, wylacznie do odczytu. Zadnych nowych tabel, zadnych zmian
--  w schemacie z Sesji 2. Baza jest wspoldzielona z AIDEAS - funkcja dotyka wylacznie
--  tabel rag_*.
--
--  BEZPIECZENSTWO - swiadomie INACZEJ niz rag_diag z Sesji 0:
--    - PRAWA WYWOLUJACEGO (brak security definer). rag_diag potrzebowal definera, bo
--      czyta katalog systemowy. Ta funkcja czyta wylacznie rag_chunks i rag_documents,
--      do ktorych service_role ma dostep wprost (RLS na rag_* wylaczony). Definer
--      dawalby jej uprawnienia wlasciciela bez zadnego powodu.
--    - search_path PRZYPIETY do "public, extensions", NIE pusty. Pusty search_path
--      zepsulby te funkcje: operator <=> pochodzi z rozszerzenia pgvector, ktore
--      w Supabase mieszka zwykle w schemacie "extensions". Przy pustym search_path
--      Postgres nie znalazlby go w czasie WYKONANIA i kazde zapytanie konczyloby sie
--      bledem "operator does not exist: vector <=> vector". Przypieta, stala lista
--      daje jednoznaczne rozwiazywanie nazw i tak samo zamyka podmiane search_path.
--    - ZERO dynamicznego SQL - argumenty sa wartosciami w where/order, nie identyfikatorami,
--    - funkcja tylko czyta (language sql, stable),
--    - execute odebrane public, nadane wylacznie roli service_role.
--
--  WYMIAR 1024 to LITERAL (bge-m3, Sesja 1) - tak samo jak w schemacie (sekcja 7.1).
--  Zmiana modelu na inny wymiar = podmiana tej funkcji razem z kolumna.
-- =============================================================================

-- Stara sygnatura (gdyby skrypt byl puszczany ponownie po zmianie parametrow).
drop function if exists public.rag_search_chunks(uuid, vector, int, uuid[]);

create or replace function public.rag_search_chunks(
  p_collection_id   uuid,
  p_query_embedding vector(1024),
  p_limit           int    default 5,
  p_document_ids    uuid[] default null
)
returns table (
  chunk_id     uuid,
  document_id  uuid,
  file_name    text,
  heading_path text,
  page_from    int,
  page_to      int,
  content      text,
  distance     double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    c.id,
    c.document_id,
    d.file_name,
    c.heading_path,
    c.page_from,
    c.page_to,
    c.content,
    -- ODLEGLOSC cosinusowa. Zamiana na score = 1 - distance dzieje sie w rdzeniu
    -- (lib/rag/search.js), zeby bylo JEDNO miejsce, ktore o tym decyduje (sekcja 11).
    (c.embedding <=> p_query_embedding)::double precision as distance
  from public.rag_chunks c
  join public.rag_documents d on d.id = c.document_id
  where c.collection_id = p_collection_id
    -- Fragmenty bez wektora (dokument pociety, jeszcze nie zindeksowany) nie biora
    -- udzialu w wyszukiwaniu. Bez tego warunku <=> na nullu wywalilby sortowanie.
    and c.embedding is not null
    -- Filtr po dokumentach (sekcja 9). null = szukaj w calej kolekcji.
    and (p_document_ids is null or c.document_id = any (p_document_ids))
  order by c.embedding <=> p_query_embedding
  limit greatest(p_limit, 1);
$$;

-- Uprawnienia: nikt poza rola serwera.
revoke all on function public.rag_search_chunks(uuid, vector, int, uuid[]) from public;
grant execute on function public.rag_search_chunks(uuid, vector, int, uuid[]) to service_role;

-- =============================================================================
--  SPRAWDZENIE PO URUCHOMIENIU (zalecane - zajmuje sekunde).
--
--  1) Czy funkcja istnieje i w ktorym schemacie siedzi pgvector:
--       select p.proname, n.nspname as schemat_funkcji,
--              (select e.extnamespace::regnamespace::text
--                 from pg_extension e where e.extname = 'vector') as schemat_pgvector
--         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        where p.proname = 'rag_search_chunks';
--
--     Jesli "schemat_pgvector" to COS INNEGO niz public albo extensions - dopisz ten
--     schemat do search_path w definicji wyzej i uruchom skrypt ponownie.
--
--  2) Czy zapytanie w ogole przechodzi (wektor zerowy, wynik bez znaczenia -
--     chodzi tylko o to, czy operator <=> sie rozwiazuje i nie ma bledu):
--       select count(*) from public.rag_search_chunks(
--         (select id from public.rag_collections limit 1),
--         array_fill(0::real, array[1024])::vector,
--         5, null);
--
--  Indeksu wektorowego NADAL nie tworzymy - patrz 7.2 (przy tej skali skan
--  sekwencyjny jest szybszy, a ivfflat pogorszylby trafnosc).
-- =============================================================================
