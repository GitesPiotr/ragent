-- ============================================================
--  AIdeas — migracja 018: powiazanie RAG z AIDEAS + poprawka indeksu FTS
--
--  TRZY NIEZALEZNE RZECZY, celowo w jednym pliku i jednej transakcji:
--    A) rag_documents.external_ref — hak, bez ktorego nie da sie zmapowac
--       plikow wiedzy AIDEAS na dokumenty RAG,
--    B) heading_path w indeksie pelnotekstowym — naprawa zapytan o numer
--       paragrafu, ktore dzis wracaja jako "nie znalazlem",
--    C) odebranie roli anon prawa wywolywania funkcji rag_*.
--
--  ------------------------------------------------------------
--  !!! PRZED URUCHOMIENIEM ZROB KOPIE BAZY !!!
--  Dashboard -> Database -> Backups. Krok B PRZEBUDOWUJE tabele rag_chunks
--  (szczegoly i czas nizej) i odtwarza indeks GIN.
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. SQL Editor -> New query
--  3. Wklej CALY plik -> Run
--  4. Uruchom zapytania kontrolne z konca pliku.
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--
--  ------------------------------------------------------------
--  JAK TO COFNAC:
--
--    A)  drop index if exists public.rag_documents_external_ref_uidx;
--        alter table public.rag_documents drop column if exists external_ref;
--
--    B)  patrz KROK B — cofniecie to ten sam zabieg z poprzednim wyrazeniem:
--        to_tsvector('simple', coalesce(content, ''))
--
--    C)  grant execute on function ... to anon;   (dla kazdej z pieciu)
--        Cofac raczej nie ma po co — patrz uzasadnienie w KROKU C.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  KROK A: rag_documents.external_ref — powiazanie z plikami AIDEAS
--
--  PROBLEM: AIDEAS zna plik jako knowledge_files.id, RAG zna dokument jako
--  wlasny uuid, i NIC ich nie laczy. Bez tego nie da sie przelozyc
--  agents.knowledge_file_ids na documentIds, ktore przyjmuje wyszukiwanie
--  (search.js, parametr documentIds) — a to jest cala tresc integracji.
--
--  WZOREC: rag_collections.external_ref (session-2-schema.sql:24) — tekst,
--  BEZ klucza obcego. Granica z sekcji 3 SPEC mowi wprost: "klucze obce
--  WYLACZNIE miedzy rag_*, zero FK do tabel AIDEAS". Powiazanie jest luzne
--  i to jest wybor, nie niedopatrzenie: dzieki temu skasowanie pliku wiedzy
--  po stronie AIDEAS nie kaskaduje po cichu na dokument RAG razem z jego
--  fragmentami i wektorami. Sierote widac i mozna ja sprzatnac swiadomie;
--  kaskada zabralaby prace indeksowania bez pytania.
--
--  UNIKALNOSC W OBREBIE KOLEKCJI, nie globalnie — i tu ROZNIMY SIE od wzorca
--  z rag_collections, ktory jest unikalny globalnie. Powod: ten sam plik wiedzy
--  ma prawo trafic do dwoch roznych kolekcji (np. "Kadry" i "BHP"), bo kolekcja
--  to zbior tematyczny, nie wlasciciel pliku. Globalny unikat zabranialby tego
--  bez zadnego zysku. Natomiast DWA dokumenty z tym samym external_ref w JEDNEJ
--  kolekcji to zawsze blad — podwojne wgranie tego samego pliku, ktore przy
--  wyszukiwaniu dawaloby duplikaty trafien.
--
--  INDEKS CZESCIOWY (where external_ref is not null): dokumenty wgrane wprost
--  w panelu Kreatora nie maja zadnego powiazania z AIDEAS i maja miec NULL.
--  Bez klauzuli "where" unikat pozwolilby na tylko jeden taki dokument
--  na kolekcje — bo w indeksie unikalnym NULL-e sa rozne, ale para
--  (collection_id, NULL) juz nie musi byc. Klauzula usuwa ten problem u zrodla.
-- ------------------------------------------------------------
alter table public.rag_documents
  add column if not exists external_ref text;

comment on column public.rag_documents.external_ref is
  'Hak integracyjny: knowledge_files.id z AIDEAS. BEZ FK (granica sekcji 3 SPEC). NULL = dokument wgrany wprost w Kreatorze.';

create unique index if not exists rag_documents_external_ref_uidx
  on public.rag_documents (collection_id, external_ref)
  where external_ref is not null;

-- ------------------------------------------------------------
--  KROK B: heading_path w indeksie pelnotekstowym
--
--  CO JEST ZLE DZISIAJ — zmierzone, nie przypuszczane:
--
--    zapytanie "§ 45"                 -> noResults, ZERO trafien
--    zapytanie "gdzie jest apteczka"  -> ten sam fragment, score 0.6476
--
--  Czyli fragment istnieje, jest zaindeksowany i wektorowo znajduje sie bez
--  trudu — ale zapytanie o jego WLASNY NUMER zwraca "nie znalazlem".
--
--  MECHANIZM, po kolei:
--    1. identyfikatoryZapytania("§ 45") wyciaga ["45"] -> rusza sciezka
--       hybrydowa (search.js:166),
--    2. rag_search_chunks_text szuka w content_tsv, a ta kolumna indeksuje
--       WYLACZNIE `content`,
--    3. w tym dokumencie numer paragrafu zyje wylacznie w `heading_path`.
--       Policzone na wszystkich 108 fragmentach: z "45" w heading_path — 1,
--       z "45" w tresci — 0; fragmentow, ktorych TRESC zawiera "§ <liczba>" —
--       0 ze 108,
--    4. sciezka tekstowa nie znajduje nic, tekstowe.length === 0,
--    5. REGULA NEGATYWNA (hybryda.js:200) orzeka "pytales o rzecz dokladna,
--       tej rzeczy nie ma" i zwraca pusto, ignorujac wektory.
--
--  Regula robi dokladnie to, co obiecuje. Bledne jest ZALOZENIE pod nia:
--  komentarz w session-hybrid-search.sql:45-47 mowi "heading_path swiadomie
--  pomijamy, bo sciezka Kodeksu to nazwa rozdzialu, a numer artykulu siedzi
--  w tresci". To prawda DLA KODEKSU. Dla dokumentu z numeracja w naglowkach
--  — a takie sa regulaminy, umowy, normy, instrukcje — jest odwrotnie.
--  Indeksowanie obu kolumn jest poprawne w OBU ukladach naraz.
--
--  DLACZEGO TO NIE ZEPSUJE "noResults" (najwazniejsze pytanie tej zmiany):
--  sciezka tekstowa uruchamia sie WYLACZNIE wtedy, gdy zapytanie zawiera token
--  z cyfra (hybryda.js, identyfikatoryZapytania). "jakie sa objawy zapalenia
--  pluc" nie ma ani jednej cyfry, wiec hybryda w ogole nie startuje, a wynik
--  liczy sie tak samo jak dzis — z samych wektorow, przy tym samym progu.
--  Zmiana nie moze dotknac zapytan bez cyfr. Zapytania Z CYFRA dostana wiecej
--  kandydatow tekstowych, co oslabia regule negatywna (rzadziej bedzie zerowa
--  liczba trafien) — i o to wlasnie chodzi.
--
--  DLACZEGO heading_path IDZIE PRZED content: przy ts_rank_cd wczesniejsza
--  pozycja lexemu wazy nieco wiecej. Numer paragrafu ma byc mocnym sygnalem,
--  a nie doklejka na koncu.
--
--  ------------------------------------------------------------
--  CZY ALTER PRZEBUDUJE KOLUMNE DLA WSZYSTKICH WIERSZY — TAK, I TO CELOWO.
--
--  content_tsv jest kolumna GENEROWANA STORED, czyli fizycznie zapisana przy
--  kazdym wierszu. Zmiana wyrazenia MUSI przeliczyc wszystkie 108 wierszy —
--  inaczej stare wiersze mialyby stary tsvector i "§ 45" dalej by nie dzialalo.
--
--  DLACZEGO DROP + ADD, A NIE "ALTER COLUMN ... SET EXPRESSION":
--  SET EXPRESSION istnieje dopiero od PostgreSQL 17. DROP + ADD dziala na
--  kazdej wersji, ktora Supabase dzis wystawia, i daje ten sam skutek:
--  ADD COLUMN z kolumna generowana STORED wymusza PELNY PRZEPIS TABELI,
--  wiec kazdy wiersz dostaje nowa wartosc.
--
--  INDEKS TRZEBA ODTWORZYC RECZNIE. DROP COLUMN kasuje wszystko, co od niej
--  zalezy — razem z rag_chunks_content_tsv_idx. Gdyby ten skrypt konczyl sie
--  na dodaniu kolumny, wyszukiwanie pelnotekstowe dzialaloby dalej, ale jako
--  skan sekwencyjny: wolniej i bez zadnego objawu poza czasem odpowiedzi.
--
--  ILE TO POTRWA PRZY 108 FRAGMENTACH: ulamek sekundy — 108 wywolan
--  to_tsvector na tekstach rzedu 400 znakow plus budowa indeksu GIN nad
--  108 wpisami. W praktyce nie do zmierzenia zegarkiem.
--
--  ALE NIE JEST TO DARMOWE W SKALI, i to jest ostrzezenie na przyszlosc:
--  koszt rosnie liniowo z liczba fragmentow, a przepis tabeli trzyma
--  ACCESS EXCLUSIVE — czyli na czas trwania BLOKUJE tabele rag_chunks
--  dla odczytu i zapisu. Przy 100 tysiacach fragmentow to juz minuty
--  niedostepnosci wyszukiwania. Wtedy trzeba to robic inaczej (nowa kolumna
--  obok, wypelnienie partiami, podmiana) — nie tym skryptem.
--
--  Funkcja rag_search_chunks_text NIE wymaga zmiany: odwoluje sie do
--  content_tsv po nazwie, a kolumna wraca z ta sama nazwa i typem. Cialo
--  funkcji jest tekstem ($$...$$), wiec Postgres nie sledzi tej zaleznosci
--  i nie blokuje kasowania kolumny — dlatego calosc siedzi w JEDNEJ
--  transakcji: miedzy DROP a ADD funkcja bylaby niesprawna.
-- ------------------------------------------------------------
alter table public.rag_chunks drop column if exists content_tsv;

alter table public.rag_chunks
  add column content_tsv tsvector
  generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(heading_path, '') || ' ' || coalesce(content, '')
    )
  ) stored;

create index if not exists rag_chunks_content_tsv_idx
  on public.rag_chunks using gin (content_tsv);

-- ------------------------------------------------------------
--  KROK C: odebranie roli "anon" prawa wywolywania funkcji rag_*
--
--  SKAD ANON TAM W OGOLE JEST: nie z naszych skryptow. Supabase ma w schemacie
--  public domyslne nadania (alter default privileges ... to anon, authenticated,
--  service_role), wiec kazda nowo utworzona funkcja dostaje execute dla anona
--  automatycznie. To samo domyslne nadanie sprawilo, ze rag_diag dzialal
--  na kliencie sesyjnym mimo grantu tylko dla service_role (obserwacja z rundy 3b).
--
--  CO TO DZIS ZMIENIA: praktycznie nic i trzeba to powiedziec uczciwie.
--  Dane chronia polityki z 016, a te obejmuja WYLACZNIE role authenticated —
--  anon nie przechodzi przez zaden "using", wiec cztery funkcje z prawami
--  wywolujacego zwrocily by mu pusty zbior. Ruch spoza sesji i tak nie dochodzi
--  do tras, bo proxy.js odcina go na 401.
--
--  DLACZEGO MIMO TO: zostaje rag_diag, ktory jest SECURITY DEFINER — jego
--  polityki NIE dotycza. Dzis oddaje tylko obecnosc pgvector i wymiar kolumny,
--  czyli nic wrazliwego, ale to jedyna funkcja w tym module, dla ktorej
--  odpowiedz na pytanie "co zobaczy anonim" brzmi "to, co funkcja zechce
--  pokazac", a nie "nic, bo RLS". Powierzchnia dostepna bez logowania ma byc
--  pusta z ZALOZENIA, nie dlatego, ze akurat nie ma na niej nic ciekawego.
--
--  service_role i authenticated zostaja nietkniete — nadal potrzebuja execute
--  (odpowiednio: skrypty CLI i warstwa HTTP).
-- ------------------------------------------------------------
revoke execute on function public.rag_search_chunks(uuid, vector, int, uuid[]) from anon;
revoke execute on function public.rag_search_chunks_text(uuid, text, int, uuid[]) from anon;
revoke execute on function public.rag_chunks_without_concepts(uuid, int, int) from anon;
revoke execute on function public.rag_set_chunk_coords(jsonb) from anon;
revoke execute on function public.rag_diag(text, text) from anon;

commit;

-- ============================================================
--  ZAPYTANIA KONTROLNE — uruchom KAZDE osobno, w nowym "New query".
-- ============================================================

-- --- 1) KROK B zadzialal? Najwazniejsze zapytanie w tym pliku --------------
--  Sprawdza WPROST to, co bylo zepsute: czy fragment "§ 45" jest teraz
--  znajdowany przez zapytanie tekstowe o "45".
--  Oczekiwane: jeden wiersz, heading_path = "§ 45".
--
--  select c.heading_path, left(c.content, 60) as poczatek_tresci
--    from public.rag_chunks c
--   where c.content_tsv @@ plainto_tsquery('simple'::regconfig, '45');

-- --- 2) Czy kolumna ma nowe wyrazenie i czy indeks wrocil ------------------
--  W generation_expression musi byc heading_path. Indeks MUSI istniec —
--  bez niego wyszukiwanie dziala, ale skanem sekwencyjnym.
--
--  select column_name, is_generated, generation_expression
--    from information_schema.columns
--   where table_schema = 'public' and table_name = 'rag_chunks'
--     and column_name = 'content_tsv';
--
--  select indexname, indexdef
--    from pg_indexes
--   where schemaname = 'public' and tablename = 'rag_chunks'
--     and indexname = 'rag_chunks_content_tsv_idx';

-- --- 3) Czy WSZYSTKIE wiersze zostaly przeliczone --------------------------
--  Oczekiwane: bez_tsv = 0 oraz z_naglowkiem = liczbie fragmentow majacych
--  heading_path. Gdyby przepis tabeli sie nie odbyl, drugie liczydlo bylo by 0.
--
--  select count(*) as fragmentow,
--         count(*) filter (where content_tsv is null) as bez_tsv,
--         count(*) filter (where heading_path is not null
--                            and content_tsv @@ plainto_tsquery('simple'::regconfig,
--                                  regexp_replace(heading_path, '\D', '', 'g'))
--                            and regexp_replace(heading_path, '\D', '', 'g') <> ''
--                         ) as z_naglowkiem_w_indeksie
--    from public.rag_chunks;

-- --- 4) KROK A: kolumna i indeks czesciowy ---------------------------------
--  Oczekiwane: kolumna external_ref typu text oraz indeks UNIQUE
--  po (collection_id, external_ref) z klauzula WHERE.
--
--  select column_name, data_type, is_nullable
--    from information_schema.columns
--   where table_schema = 'public' and table_name = 'rag_documents'
--     and column_name = 'external_ref';
--
--  select indexname, indexdef
--    from pg_indexes
--   where schemaname = 'public' and tablename = 'rag_documents'
--     and indexname = 'rag_documents_external_ref_uidx';

-- --- 5) KROK C: granty na pieciu funkcjach ---------------------------------
--  Oczekiwane: authenticated i service_role — TAK, anon — ANI RAZU.
--
--  select p.proname as funkcja,
--         pg_get_userbyid(acl.grantee) as rola,
--         acl.privilege_type
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
--   where n.nspname = 'public'
--     and p.proname in ('rag_search_chunks','rag_search_chunks_text',
--                       'rag_chunks_without_concepts','rag_set_chunk_coords','rag_diag')
--   order by funkcja, rola;

-- ============================================================
--  PO URUCHOMIENIU: POMIAR POROWNAWCZY W PANELU
--
--  Powtorz szesc zapytan z rundy 4b na kolekcji TEST. Stan PRZED migracja
--  (do porownania):
--
--    a) apteczka          n=1  § 45:0.6476
--    b) wypowiedzenie     n=5  § 89:0.7082 > § 90:0.6457 > § 76:0.5788 > ...
--    c) ryczalt zdalna    n=5  § 67:0.7846 > § 66:0.5929 > § 65:0.5842 > ...
--    d) "§ 45"            noResults  <- MA sie zmienic na trafienie
--    e) zapalenie pluc    noResults  <- MA ZOSTAC noResults
--    f) rekojmia          n=4  § 107:0.4908 > § 99:0.4608 > ...
--
--  (a-c) i (f) nie maja prawa sie ruszyc: zadne z tych zapytan nie zawiera
--  cyfry, wiec sciezka tekstowa w nich nie startuje. Jakakolwiek zmiana
--  kolejnosci albo score w tych czterech oznacza, ze zmienilo sie cos jeszcze
--  — i trzeba to znalezc, zanim uznamy migracje za udana.
-- ============================================================
