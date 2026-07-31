-- =============================================================================
--  Sesja 7 - kandydaci do wyciagania pojec. Uruchamiasz TY recznie
--  w Supabase -> SQL Editor. Aplikacja niczego w bazie nie tworzy.
--
--  ZAKRES: JEDNA funkcja, wylacznie do odczytu. Tabele rag_concepts
--  i rag_chunk_concepts istnieja od Sesji 2 - nic w schemacie nie zmieniamy.
--
--  PO CO TA FUNKCJA (a nie zapytanie z PostgREST):
--  wznawialnosc wymaga pytania "ktore fragmenty NIE MAJA jeszcze pojec".
--  PostgREST nie wyrazi `not exists` - trzeba by przeslac liste 500 UUID-ow
--  w parametrze URL, co przekracza rozsadna dlugosc adresu.
--
--  DLACZEGO PROG WYRAZOW SIEDZI TUTAJ, A NIE W KODZIE:
--  gdyby fragmenty smieciowe byly odsiewane PO pobraniu, wracalyby jako
--  kandydaci przy kazdym wywolaniu (nigdy nie dostana pojec, wiec nigdy nie
--  znikna z zapytania) i petla nie zwrocilaby `finished`. Prog w zapytaniu
--  czyni skonczonosc wlasnoscia konstrukcji, nie kodu wolajacego.
--
--  WYRAZ = token o CO NAJMNIEJ DWOCH LITERACH. Bez tego warunku fragment
--  "U S T A W A z dnia 26 czerwca 1974 r." liczy sie jako 12 wyrazow
--  i przechodzi; przy regule >=2 liter ma ich 2 i wypada.
--  Zmierzone na kolekcji "Regulaminy": smieci maja <=6 wyrazow, tresc >=10,
--  miedzy 7 a 9 nie ma NICZEGO. Domyslny prog 8 lezy w srodku tej przerwy.
--
--  BEZPIECZENSTWO - tak samo jak rag_search_chunks z Sesji 5:
--    - PRAWA WYWOLUJACEGO (brak security definer) - czyta tylko rag_*,
--    - search_path PRZYPIETY do "public" (tu nie ma operatorow z rozszerzen,
--      ale przypinamy dla jednoznacznosci rozwiazywania nazw),
--    - ZERO dynamicznego SQL - argumenty sa wartosciami w where/limit,
--    - execute odebrane public, nadane wylacznie roli service_role.
-- =============================================================================

drop function if exists public.rag_chunks_without_concepts(uuid, int, int);

create or replace function public.rag_chunks_without_concepts(
  p_document_id uuid,
  p_min_words   int default 8,
  p_limit       int default 1000
)
returns table (
  chunk_id    uuid,
  chunk_index int,
  content     text
)
language sql
stable
set search_path = public
as $$
  select c.id, c.chunk_index, c.content
  from public.rag_chunks c
  where c.document_id = p_document_id
    -- Fragment bez ani jednego pojecia. Powiazanie ma klucz glowny
    -- (chunk_id, concept_id), wiec obecnosc choc jednego wiersza znaczy
    -- "ten fragment byl juz przetworzony".
    and not exists (
      select 1 from public.rag_chunk_concepts k where k.chunk_id = c.id
    )
    -- Prog smieci. regexp_matches z flaga 'g' zwraca wiersz na kazde
    -- dopasowanie; liczymy je. \m i \M to granice wyrazu w Postgresie.
    and (
      select count(*)
      from regexp_matches(c.content, '\m[[:alpha:]]{2,}', 'g')
    ) >= p_min_words
  order by c.chunk_index
  limit greatest(p_limit, 1);
$$;

revoke all on function public.rag_chunks_without_concepts(uuid, int, int) from public;
grant execute on function public.rag_chunks_without_concepts(uuid, int, int) to service_role;

-- =============================================================================
--  SPRAWDZENIE PO URUCHOMIENIU (zalecane).
--
--  1) Czy prog wyrazow dziala tak, jak zmierzylismy w JS:
--       select (select count(*) from regexp_matches(
--                 'U S T A W A z dnia 26 czerwca 1974 r.', '\m[[:alpha:]]{2,}', 'g'))
--              as smiec_ustawa,          -- oczekiwane: 2  (dnia, czerwca)
--              (select count(*) from regexp_matches(
--                 'Rozdzial I', '\m[[:alpha:]]{2,}', 'g'))
--              as smiec_rozdzial,        -- oczekiwane: 1
--              (select count(*) from regexp_matches(
--                 'Reklamacje wadliwego sprzetu mozna zlozyc w terminie czternastu dni',
--                 '\m[[:alpha:]]{2,}', 'g'))
--              as tresc_bhp;             -- oczekiwane: >= 8
--
--     UWAGA: [[:alpha:]] w Postgresie zalezy od LC_CTYPE bazy. Jesli polskie
--     znaki diakrytyczne NIE sa liczone jako litery, wynik dla polskiego tekstu
--     bedzie zanizony - wtedy zglos to, zanim uruchomimy na calym dokumencie.
--
--  2) Ilu kandydatow ma 05-instrukcja-bhp.pdf (oczekiwane: 5 z 5, bo zaden
--     jego fragment nie jest smieciem):
--       select count(*) from public.rag_chunks_without_concepts(
--         (select id from public.rag_documents where file_name = '05-instrukcja-bhp.pdf'),
--         8, 1000);
--
--  3) Ilu kandydatow ma Kodeks pracy (oczekiwane: 510 - 17 smieci = 493):
--       select count(*) from public.rag_chunks_without_concepts(
--         (select id from public.rag_documents where file_name = 'D20250277Lj.pdf'),
--         8, 100000);
--
--  4) Co dokladnie zostalo ODSIANE w Kodeksie (kontrola, czy nie wypada tresc):
--       select c.content
--       from public.rag_chunks c
--       where c.document_id = (select id from public.rag_documents
--                              where file_name = 'D20250277Lj.pdf')
--         and (select count(*) from regexp_matches(c.content, '\m[[:alpha:]]{2,}', 'g')) < 8
--       order by length(c.content);
--     Oczekiwane: same "Rozdzial I", "(uchylony)", "(zawierajacy art. ... )".
-- =============================================================================
