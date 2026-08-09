-- ############################################################################
--  KOLEJNOŚĆ MA ZNACZENIE
--
--  Część sekwencji stawiania modułu RAG, nie plik archiwalny: tworzy funkcję rag_search_chunks_text.
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
--  Wyszukiwanie hybrydowe - wektory + pelny tekst. Uruchamiasz TY recznie
--  w Supabase -> SQL Editor. Aplikacja niczego w bazie nie tworzy.
--
--  PO CO: wyszukiwanie wektorowe nie radzi sobie z DOKLADNYMI IDENTYFIKATORAMI.
--  Zmierzone na kolekcji "Regulaminy" (27.07.2026):
--    "art. 36"  -> najlepsze trafienie 0,5303 z RODO, nie z Kodeksu pracy;
--                  w wynikach tez "U S T A W A z dnia 26 czerwca 1974 r." (0,5079)
--                  i "Rozdzial I" (0,4899),
--    "art. 9999" (nie istnieje) -> 0,4516, czyli POWYZEJ progu 0,45.
--  Najslabsze poprawne trafienie w korpusie ma 0,4581, wiec te smieci stoja WYZEJ.
--  Zaden prog ich nie rozdzieli - potrzebny drugi sygnal, nie inna granica.
--
--  ZAKRES: jedna kolumna generowana, jeden indeks GIN, jedna nowa funkcja.
--  ZERO zmian w danych. ZERO przeliczania wektorow. Kolumna tsvector jest GENERATED
--  ALWAYS - Postgres wypelnia ja sam z content, teraz i przy kazdym zapisie.
--  Baza jest wspoldzielona z AIDEAS - skrypt dotyka wylacznie tabel rag_*.
--
--  SLOWNIK: 'simple'. Na tej instancji NIE MA konfiguracji polskiej
--  (sprawdzone: select cfgname from pg_ts_config - 29 pozycji, polskiej brak).
--  'simple' nie robi stemmingu ani nie zna stop-slow, wiec "urlopu" != "urlop".
--  To akceptowalne, bo sciezka tekstowa wlacza sie WYLACZNIE dla zapytan
--  zawierajacych identyfikator (patrz nizej) - a numery nie podlegaja odmianie.
--
--  BEZPIECZENSTWO - tak samo jak rag_search_chunks z Sesji 5:
--    - PRAWA WYWOLUJACEGO (brak security definer) - funkcja czyta tylko rag_*,
--    - search_path PRZYPIETY do "public, extensions", NIE pusty. Pusty zepsulby
--      operator <=> z pgvector (lekcja z Sesji 5),
--    - ZERO dynamicznego SQL - argumenty sa wartosciami w where/order,
--    - execute odebrane public, nadane wylacznie roli service_role.
--
--  WYMIAR 1024 to LITERAL (bge-m3, Sesja 1), tak samo jak w schemacie.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1) KOLUMNA tsvector - generowana, nie wypelniana skryptem.
--
--  GENERATED ALWAYS AS ... STORED znaczy, ze Postgres liczy ja sam przy kazdym
--  insercie i update. Nie ma czego migrowac, nie ma jak sie rozjechac z content.
--  to_tsvector musi byc IMMUTABLE - dlatego konfiguracja podana jest LITERALEM
--  ('simple'::regconfig), a nie przez default_text_search_config. Wersja
--  jednoargumentowa to_tsvector(text) jest STABLE, nie IMMUTABLE, i Postgres
--  odmowilby uzycia jej w kolumnie generowanej.
--
--  Indeksujemy WYLACZNIE content. heading_path swiadomie pomijamy: po 10.a.5
--  sciezka Kodeksu to nazwa rozdzialu ("Urlopy wypoczynkowe"), a numer artykulu
--  siedzi w tresci - czyli tam, gdzie go szukamy.
-- -----------------------------------------------------------------------------
alter table public.rag_chunks
  add column if not exists content_tsv tsvector
  generated always as (to_tsvector('simple'::regconfig, coalesce(content, ''))) stored;

-- Indeks GIN - bez niego kazde zapytanie pelnotekstowe to skan sekwencyjny.
-- (Inaczej niz przy wektorach: tam skan sekwencyjny jest swiadomym wyborem,
-- bo ivfflat pogorszylby trafnosc. Tu indeks nie zmienia wynikow, tylko czas.)
create index if not exists rag_chunks_content_tsv_idx
  on public.rag_chunks using gin (content_tsv);

-- -----------------------------------------------------------------------------
--  2) FUNKCJA rag_search_chunks_text - sciezka pelnotekstowa.
--
--  Osobna funkcja, NIE rozbudowa rag_search_chunks. Powod: rdzen ma decydowac,
--  czy w ogole uruchomic sciezke tekstowa (robi to tylko dla zapytan
--  z identyfikatorem), a takze rozroznic "tekst nic nie znalazl" od "tekst nie
--  byl pytany". Zlanie obu w jedno wywolanie zabiloby to rozroznienie, a to
--  wlasnie na nim stoi regula negatywna dla "art. 9999".
--
--  p_query dostaje tsquery zbudowane po stronie Postgresa przez plainto_tsquery,
--  ktore laczy tokeny operatorem AND. Rdzen podaje TYLKO tokeny identyfikatora
--  (np. "36"), nie cale zdanie - inaczej "co mowi art. 36 kodeksu pracy"
--  wymagaloby, zeby fragment zawieral takze "co" i "mowi".
--
--  ts_rank_cd zwracamy jako informacje pomocnicza. NIE jest to score i NIE
--  porownuje sie go z RAG_MIN_SCORE - skale sa nieporownywalne. Kolejnosc
--  ustala fuzja rang w rdzeniu (sekcja 11.2).
-- -----------------------------------------------------------------------------
drop function if exists public.rag_search_chunks_text(uuid, text, int, uuid[]);

create or replace function public.rag_search_chunks_text(
  p_collection_id uuid,
  p_query         text,
  p_limit         int    default 20,
  p_document_ids  uuid[] default null
)
returns table (
  chunk_id     uuid,
  document_id  uuid,
  file_name    text,
  heading_path text,
  page_from    int,
  page_to      int,
  content      text,
  text_rank    double precision
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
    ts_rank_cd(c.content_tsv, plainto_tsquery('simple'::regconfig, p_query))::double precision
  from public.rag_chunks c
  join public.rag_documents d on d.id = c.document_id
  where c.collection_id = p_collection_id
    -- Puste/bialoznakowe zapytanie nie moze zwrocic calej kolekcji.
    and nullif(btrim(coalesce(p_query, '')), '') is not null
    -- @@ z indeksem GIN. Fragmenty bez wektora NIE sa tu odsiewane celowo:
    -- sciezka tekstowa nie potrzebuje wektora, a fragment pociety i jeszcze
    -- niezaindeksowany nadal zawiera szukany numer. Rdzen i tak laczy oba
    -- zbiory po chunk_id.
    and c.content_tsv @@ plainto_tsquery('simple'::regconfig, p_query)
    and (p_document_ids is null or c.document_id = any (p_document_ids))
  order by ts_rank_cd(c.content_tsv, plainto_tsquery('simple'::regconfig, p_query)) desc,
           c.id                                    -- stabilny tie-break
  limit greatest(p_limit, 1);
$$;

revoke all on function public.rag_search_chunks_text(uuid, text, int, uuid[]) from public;
grant execute on function public.rag_search_chunks_text(uuid, text, int, uuid[]) to service_role;

-- =============================================================================
--  CZEGO TEN SKRYPT NIE ROBI - swiadomie:
--    - nie rusza rag_search_chunks z Sesji 5 (sciezka wektorowa bez zmian),
--    - nie tworzy indeksu wektorowego (patrz 7.2),
--    - nie zmienia zadnego wiersza danych,
--    - nie zna pojecia "artykul" ani zadnego polskiego slowa. Decyzje, ze
--      zapytanie zawiera identyfikator, podejmuje rdzen w JS (testowalne bez bazy).
--
--  KOSZT: kolumna generowana powieksza tabele o tsvector dla kazdego fragmentu
--  (~1000 fragmentow w kolekcji, rzad wielkosci pojedynczych MB) i wymaga
--  jednorazowego przepisania tabeli przy ALTER - przy tej skali sekundy.
-- =============================================================================

-- =============================================================================
--  SPRAWDZENIE PO URUCHOMIENIU (zalecane).
--
--  1) Czy kolumna i indeks powstaly:
--       select column_name, is_generated
--         from information_schema.columns
--        where table_name = 'rag_chunks' and column_name = 'content_tsv';
--       select indexname from pg_indexes
--        where tablename = 'rag_chunks' and indexname = 'rag_chunks_content_tsv_idx';
--
--  2) Czy numer artykulu jest OSOBNYM tokenem (o to w tym wszystkim chodzi):
--       select to_tsvector('simple', 'Art. 36. § 1. Okres wypowiedzenia umowy');
--     Oczekiwane: osobne lexemy 'art', '36', '1', 'okres', ... Gdyby '36'
--     nie bylo osobnym tokenem, cala regula nie ma sensu i trzeba to zglosic.
--
--  3) Czy wielocyfrowy identyfikator tez (Art. 6720 - test wskazany przez uzytkownika):
--       select to_tsvector('simple', 'Art. 6720. Praca zdalna moze byc wykonywana');
--     Oczekiwane: lexem '6720' w calosci, NIE rozbity.
--
--  4) Czy funkcja znajduje Art. 36 w Kodeksie:
--       select file_name, heading_path, left(content, 60) as poczatek, text_rank
--         from public.rag_search_chunks_text(
--                (select id from public.rag_collections where name = 'Regulaminy'),
--                '36', 5, null);
--
--  5) Czy zapytanie o nieistniejacy numer daje PUSTO (na tym stoi regula
--     negatywna dla "art. 9999"):
--       select count(*) from public.rag_search_chunks_text(
--                (select id from public.rag_collections where name = 'Regulaminy'),
--                '9999', 5, null);
--     Oczekiwane: 0.
-- =============================================================================
