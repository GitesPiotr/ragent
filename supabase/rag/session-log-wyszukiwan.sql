-- Dziennik wyszukiwań (11.3).
--
-- POWÓD: dziś nie wiadomo, o co ludzie pytali, co dostali i ile to trwało. Po integracji
-- z agentem jest to JEDYNY sposób, żeby dowiedzieć się, co nie działa, zamiast zgadywać
-- z pojedynczych skarg. Brak takiego zapisu zauważa się dopiero po wdrożeniu — i wtedy
-- jest za późno, bo nie da się odtworzyć tego, czego nikt nie zapisał.
--
-- =============================================================================
--  ⚠ TA TABELA ZAWIERA TREŚĆ ZAPYTAŃ UŻYTKOWNIKÓW — DANE WRAŻLIWE
--
--  „Czy mogę zwolnić pracownicę w ciąży", „jaka dawka przy niewydolności nerek",
--  „ile wynosi moja odprawa" — to nie jest telemetria, tylko zapis tego, o co kto
--  pytał. Wyciek tej tabeli jest gorszy niż wyciek samych dokumentów: dokumenty
--  bywają publiczne, pytania nigdy.
--
--  PRZY I1 TA TABELA MUSI TRAFIĆ NA LISTĘ OBJĘTĄ RLS, razem z rag_documents
--  i rag_chunks. Bez tego polityki obejmą wiedzę, ale nie ślad po korzystaniu z niej.
-- =============================================================================
--
-- CZEGO TU CELOWO NIE MA: identyfikatora użytkownika. RAG nie wie dziś nic o kontach
-- (sekcja 3, granica), a dołożenie takiej kolumny teraz przesądzałoby o modelu
-- powiązania, który należy do I1. Kolumna `owner_ref` jest przygotowana i zostaje
-- NULL do czasu tamtej decyzji.

create table if not exists rag_search_log (
  id             uuid primary key default gen_random_uuid(),
  collection_id  uuid references rag_collections(id) on delete cascade,

  -- Zapytanie i zakres
  query          text not null,
  document_ids   uuid[],                    -- null = cała kolekcja
  top_k          int,
  min_score      real,

  -- Co wyszło
  hits_count     int    not null default 0,
  first_score    real,                      -- null gdy zero wyników
  last_score     real,
  hybrid         boolean not null default false,   -- czy ruszyła ścieżka pełnotekstowa
  deduped        int     not null default 0,       -- ile bliźniaków odsiano (11.1k)
  no_results     boolean not null default false,
  no_results_reason text,                   -- 'prog' | 'regula_negatywna' | null

  duration_ms    int,
  owner_ref      text,                      -- ZAREZERWOWANE dla I1, dziś zawsze null
  created_at     timestamptz not null default now()
);

-- Odczyt jest zawsze „ostatnie N" albo „ostatnie N dla kolekcji" — stąd te dwa.
create index if not exists rag_search_log_created_at_idx  on rag_search_log (created_at desc);
create index if not exists rag_search_log_collection_idx  on rag_search_log (collection_id, created_at desc);

comment on table rag_search_log is
  'Dziennik wyszukiwań (11.3). ZAWIERA TREŚĆ ZAPYTAŃ UŻYTKOWNIKÓW — objąć RLS przy I1.';

-- =============================================================================
--  JAK TO OBEJRZEĆ — panelu nie ma i najprawdopodobniej nie będzie potrzebny.
-- =============================================================================
--
--  -- Ostatnie 50 wyszukiwań, wszystko co istotne w jednym rzucie:
--  select
--    created_at, query, hits_count, first_score, last_score,
--    hybrid, deduped, no_results, no_results_reason, duration_ms
--  from rag_search_log
--  order by created_at desc
--  limit 50;
--
--  -- Pytania BEZ ODPOWIEDZI — to jest najważniejszy widok. Powtarzające się tu
--  -- zapytanie znaczy albo brakujący dokument, albo próg za wysoko, albo pytanie
--  -- z sąsiedniej dziedziny (11.0). Trzy różne przyczyny, jedna lista.
--  select query, count(*) as ile, max(created_at) as ostatnio, no_results_reason
--  from rag_search_log
--  where no_results
--  group by query, no_results_reason
--  order by ile desc
--  limit 50;
--
--  -- Rozkład najlepszego wyniku — czy próg 0.45 stoi tam, gdzie powinien.
--  -- Skupisko TUŻ POD progiem to sygnał, że coś odcinamy niesłusznie.
--  select width_bucket(first_score, 0, 1, 20) * 0.05 as kubelek, count(*)
--  from rag_search_log
--  where first_score is not null
--  group by 1 order by 1;
--
--  -- Czy odsiew bliźniaków w ogóle coś robi i na których kolekcjach:
--  select c.name, count(*) as wyszukiwan, sum(l.deduped) as odsianych
--  from rag_search_log l join rag_collections c on c.id = l.collection_id
--  group by c.name;
