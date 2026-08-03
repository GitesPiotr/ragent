-- ============================================================
--  AIdeas — migracja 021: dostawca embeddingow przy kolekcji
--
--  CO ROBI: dokłada rag_collections.embed_provider (text, not null,
--  domyslnie 'ollama'), wypelnia istniejace wiersze i dopiero potem
--  zaciesnia do not null.
--
--  PO CO: od tej rundy embeddingi moga byc liczone nie tylko lokalna
--  Ollama, ale tez przez OpenRoutera (baai/bge-m3). Straznik zgodnosci
--  modelu — lib/rag/search.js:143 i lib/rag/documents.js:541 — porownywal
--  do tej pory SAM NAPIS z nazwa modelu. To przestaje wystarczac: lokalnie
--  model nazywa sie "bge-m3", a przez OpenRoutera "baai/bge-m3", wiec samo
--  przelaczenie dostawcy wywalaloby model_mismatch na KAZDEJ istniejacej
--  kolekcji — mimo ze wektory sa te same.
--
--  ------------------------------------------------------------
--  DLACZEGO DWIE KOLUMNY, A NIE JEDEN SKLEJONY NAPIS
--
--  Rozwazane byly trzy uklady:
--
--  A) NORMALIZACJA NAZWY przy porownaniu (obciac prefiks dostawcy,
--     "baai/bge-m3" -> "bge-m3"). ODRZUCONE: zamienia porownanie na
--     heurystyke. Zadziala przypadkiem takze dla dwoch RÓZNYCH modeli
--     o zbieznych koncowkach nazwy, a wtedy straznik przepusci wektory
--     nieporownywalne — czyli dokladnie to, przed czym stoi.
--
--  B) TABELA ROWNOWAZNOSCI modeli (ktory jest ktorym u kogo).
--     ODRZUCONE: konstrukcja wieksza od problemu przy dwoch modelach,
--     i to ona wymagalaby utrzymywania.
--
--  C) DWIE KOLUMNY: embed_provider + embed_model, straznik porownuje PARE.
--     WYBRANE. Para jest tym, czym naprawde jest tozsamosc modelu w tej
--     aplikacji — ten sam plik wag u dwoch dostawcow ma dwie nazwy, a rozne
--     pliki wag u jednego dostawcy tez. Sklejenie w jeden napis
--     ("openrouter/baai/bge-m3") dawalo by kolumne, ktora trzeba rozbierac
--     przy kazdym uzyciu, a rozbior po ukosniku jest zawodny — identyfikatory
--     OpenRoutera SAME zawieraja ukosnik.
--
--  ------------------------------------------------------------
--  BEZ CHECK NA LISTE DOSTAWCOW — swiadomie, tak samo jak w 020.
--
--  Lista dozwolonych dostawcow embeddingow zyje w jednym miejscu w kodzie:
--  createEmbeddingProvider() w lib/rag/embedding.js. CHECK w bazie bylby
--  DRUGIM miejscem z ta sama lista i rozjechalby sie przy pierwszym
--  dolozeniu dostawcy — a wtedy migracja bazy stalaby sie warunkiem
--  wdrozenia zmiany w kodzie.
--
--  ------------------------------------------------------------
--  URUCHOMIENIE NICZEGO NIE PSUJE. Po tej migracji wszystkie istniejace
--  kolekcje maja embed_provider = 'ollama', czyli dokladnie to, czym
--  faktycznie zostaly zbudowane. Aplikacja dziala jak dotad.
--
--  KOLEJNOSC JEST TRESCIOWA: kolumna nullowalna -> backfill -> not null.
--  Dodanie od razu z "not null default" tez by zadzialalo, ale ukryloby
--  backfill w domysle silnika. Tutaj widac, ze istniejace wiersze dostaly
--  wartosc SWIADOMIE, a nie przy okazji.
-- ============================================================

-- --- 1) Kolumna, na razie nullowalna -------------------------------------
alter table public.rag_collections
  add column if not exists embed_provider text;

-- --- 2) Backfill ---------------------------------------------------------
-- WSZYSTKIE istniejace kolekcje powstaly na Ollamie — innej drogi nie bylo.
-- Obejmuje tez wiersze z embed_model IS NULL (kolumna jest nullowalna
-- od session-2-schema.sql:26): one rowniez nie mialy jak powstac inaczej.
update public.rag_collections
   set embed_provider = 'ollama'
 where embed_provider is null;

-- --- 3) Domyslna wartosc i zaciesnienie ----------------------------------
-- Default DLA NOWYCH wierszy: kod i tak podaje provider jawnie
-- (createCollection), ale wiersz wstawiony recznie w SQL Editorze ma sie
-- zachowac jak dotad, a nie wywrocic na not null.
alter table public.rag_collections
  alter column embed_provider set default 'ollama';

alter table public.rag_collections
  alter column embed_provider set not null;

-- ============================================================
--  WERYFIKACJA (uruchom osobno, nic nie zmienia)
--
--  Rozklad dostawcow — po migracji wszystko ma byc 'ollama':
--
--  select embed_provider, embed_model, count(*)
--    from public.rag_collections
--   group by 1, 2
--   order by 1, 2;
--
--  Kolumna ma byc not null z defaultem:
--
--  select column_name, is_nullable, column_default, data_type
--    from information_schema.columns
--   where table_schema = 'public'
--     and table_name = 'rag_collections'
--     and column_name = 'embed_provider';
-- ============================================================
