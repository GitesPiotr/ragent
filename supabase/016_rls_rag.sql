-- ============================================================
--  AIdeas — migracja 016: RLS na tabelach rag_*
--  Runda 3a integracji RAG. SAM SQL — kod aplikacji ta migracja NIE rusza.
--
--  CO ROBI: doklada owner_id do szesciu tabel rag_*, zaklada na nie polityki
--  na wlasciciela, wlacza row level security, otwiera cztery funkcje dla roli
--  authenticated i domyka bucket rag-files.
--
--  Domyka TODO z supabase/rag/session-2-schema.sql:114 ("owner_id + RLS przy
--  logowaniu") oraz ostrzezenie z session-log-wyszukiwan.sql:16 ("PRZY I1 TA
--  TABELA MUSI TRAFIC NA LISTE OBJETA RLS").
--
--  ------------------------------------------------------------
--  !!! WARUNEK KONIECZNY — KOLEJNOSC WZGLEDEM RUNDY 3B !!!
--
--  URUCHOM TEN SKRYPT DOPIERO RAZEM Z RUNDA 3B (zmiana klienta w lib/rag/db.js).
--
--  Powod jest twardy i dotyczy obu kierunkow naraz:
--
--  1) TA MIGRACJA SAMA W SOBIE NICZEGO NIE IZOLUJE.
--     lib/rag/db.js:1 tworzy klienta na kluczu service_role, a service_role ma
--     BYPASSRLS — polityki go po prostu nie dotycza. Dopoki modul chodzi na tym
--     kluczu, wszystkie szesc polityk jest martwym zapisem. Izolacja zaczyna
--     dzialac dopiero wtedy, gdy warstwa HTTP zacznie siegac do bazy klientem
--     z sesja uzytkownika. To jest runda 3b.
--
--  2) TA MIGRACJA ZATRZYMA ZAPIS PRZEZ service_role.
--     owner_id dostaje "not null default auth.uid()". Pod service_role auth.uid()
--     zwraca NULL, wiec kazdy insert do rag_* — a wiec kazde utworzenie kolekcji,
--     wgranie dokumentu, zapis fragmentow i pojec — polegnie na naruszeniu NOT NULL,
--     dopoki kod nie zacznie albo podawac owner_id jawnie, albo pisac przez sesje.
--
--  Czyli: miedzy uruchomieniem 016 a wdrozeniem 3b modul RAG nie zapisuje nic,
--  a i tak nie jest izolowany. To okno ma byc zerowe.
--
--  ------------------------------------------------------------
--  !!! SKRYPTY CLI PRZESTANA PISAC DO BAZY !!!
--
--  W module zrodlowym (KREATOR RAG) katalog scripts/ zawiera narzedzia, ktore
--  siegaja do bazy WPROST przez getSupabaseClient(), czyli na kluczu service_role,
--  poza jakakolwiek sesja uzytkownika. Piszace sa co najmniej trzy:
--    uruchom-pojecia      — wsadowe wyciaganie pojec (insert do rag_concepts
--                           i rag_chunk_concepts),
--    uruchom-normalizacje — scalanie pojec (update merged_into),
--    kopia-pojec          — zrzut/odtworzenie pojec (insert).
--
--  Po KROKU 3 kazdy ich insert polegnie na NOT NULL, bo pod service_role
--  auth.uid() zwraca NULL i nie ma z czego wziac owner_id. Odczyt bedzie dzialal
--  dalej (service_role omija polityki), zapis nie.
--
--  DO ROZWIAZANIA PRZY ICH PRZENOSZENIU (runda 5), nie teraz. Kierunki:
--    - podawac owner_id JAWNIE w insertach ze skryptu, z UUID konta przekazanym
--      argumentem albo zmienna srodowiskowa (najmniej magii, najlatwiej
--      zweryfikowac, ktore konto dostalo dane),
--    - albo logowac skrypt jako uzytkownika i pracowac na kliencie sesyjnym
--      (spojne z reszta, ale wymaga trzymania gdzies hasla do konta).
--  Zadnej z tych decyzji ta migracja nie przesadza.
--
--  JESLI MIMO TO chcesz uruchomic 016 wczesniej i zachowac dzialajacy zapis
--  przez service_role, zostaw kolumne luzna — zakomentuj KROK 3 (set not null)
--  i nalozc go osobno po 3b. Reszta skryptu jest wtedy bezpieczna: polityki
--  istnieja, ale service_role je omija, wiec nic sie nie zmienia w zachowaniu.
--
--  ------------------------------------------------------------
--  !!! PRZED URUCHOMIENIEM ZROB KOPIE BAZY !!!
--  Dashboard -> Database -> Backups. Skrypt kasuje kolumne (owner_ref)
--  i naklada NOT NULL na szesciu tabelach.
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. SQL Editor -> New query
--  3. Wklej CALY plik -> Run
--  4. Zajrzyj do zakladki "Messages" — beda tam liczby z warunku wstepnego.
--  5. Uruchom zapytania kontrolne z konca pliku (osobne "New query").
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--
--  ------------------------------------------------------------
--  JAK TO COFNAC:
--
--      alter table public.rag_collections    disable row level security;
--      alter table public.rag_documents      disable row level security;
--      alter table public.rag_chunks         disable row level security;
--      alter table public.rag_concepts       disable row level security;
--      alter table public.rag_chunk_concepts disable row level security;
--      alter table public.rag_search_log     disable row level security;
--      drop policy if exists "rag_files_wlasne_pliki" on storage.objects;
--
--  To przywraca stan sprzed migracji pod wzgledem DOSTEPU. Kolumny owner_id
--  zostaja (sa nieszkodliwe, service_role ich nie potrzebuje przy odczycie),
--  ale NOT NULL trzeba zdjac osobno, inaczej zapis przez service_role dalej
--  nie przejdzie:
--
--      alter table public.rag_collections    alter column owner_id drop not null;
--      -- ...i tak samo dla pozostalych pieciu tabel.
--
--  Kolumny rag_search_log.owner_ref ten rollback NIE przywraca — patrz KROK 2.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  KROK 0: WARUNEK WSTEPNY — tabele rag_* musza byc PUSTE.
--
--  Backfillu tu nie ma i nie moze byc. W 007 dalo sie przypisac wszystkie
--  istniejace wiersze do jednego konta, bo aplikacja byla wtedy faktycznie
--  jednoosobowa i wlasciciel byl znany. Tutaj takiej wiedzy nie ma: kolekcje
--  RAG powstawaly bez zadnego powiazania z kontem (session-2-schema.sql:5-7 —
--  "zero FK do tabel AIDEAS"), wiec zgadywanie wlasciciela znaczyloby przypisanie
--  cudzych dokumentow i cudzych zapytan do przypadkowego konta.
--
--  Dlatego: znajdzie sie choc jeden wiersz — przerywamy CALA migracje i nic
--  nie zostaje zmienione. Wtedy trzeba albo wyczyscic tabele, albo dopisac
--  swiadomy backfill z jawnym UUID (wzor: 007_owner_id.sql, KROK 2).
-- ------------------------------------------------------------
do $$
declare
  v_tabela text;
  v_ile    bigint;
  v_razem  bigint := 0;
  v_raport text   := '';
begin
  foreach v_tabela in array array[
    'rag_collections', 'rag_documents', 'rag_chunks',
    'rag_concepts', 'rag_chunk_concepts', 'rag_search_log'
  ] loop
    if to_regclass('public.' || v_tabela) is null then
      raise exception
        'Brak tabeli public.%. Uruchom najpierw skrypty z supabase/rag/ (schemat i dziennik wyszukiwan). Nic nie zostalo zmienione.',
        v_tabela;
    end if;

    execute format('select count(*) from public.%I', v_tabela) into v_ile;
    v_razem  := v_razem + v_ile;
    v_raport := v_raport || format('%s=%s ', v_tabela, v_ile);
  end loop;

  if v_razem > 0 then
    raise exception
      'Tabele rag_* NIE sa puste (razem % wierszy: %). Migracja przerwana — nie ma z czego ustalic wlasciciela. Wyczysc tabele albo dopisz swiadomy backfill.',
      v_razem, v_raport;
  end if;

  raise notice 'Warunek wstepny OK — wszystkie tabele rag_* puste: %', v_raport;
end $$;

-- ------------------------------------------------------------
--  KROK 1: KOLUMNY owner_id — na razie luzne (nullable).
--
--  Kolejnosc jak w 007: najpierw kolumna, potem default, na koncu NOT NULL.
--  Przy pustych tabelach mozna by to zrobic jednym alterem, ale rozbicie
--  zostaje, bo dzieki niemu skrypt przezyje ponowne uruchomienie na tabelach,
--  ktore w miedzyczasie dostaly wiersze.
--
--  on delete cascade: skasowanie konta w auth.users zabiera jego kolekcje,
--  dokumenty, fragmenty, pojecia i slad po wyszukiwaniach.
--
--  DLACZEGO owner_id NA WSZYSTKICH SZESCIU, A NIE TYLKO NA rag_collections:
--  wlasciciel dalby sie wyprowadzic po kluczach obcych (fragment -> dokument ->
--  kolekcja), ale wtedy KAZDA polityka bylaby podzapytaniem przez dwie tabele,
--  wykonywanym dla kazdego wiersza kazdego zapytania. Przy rag_chunks, gdzie
--  wyszukiwanie skanuje sekwencyjnie caly zbior (session-2-schema.sql:80-82 —
--  swiadomie zero indeksu wektorowego), to jest roznica miedzy filtrem na
--  kolumnie a zagniezdzonym joinem przy kazdym wierszu. Denormalizacja jest
--  tu celowa i to jest jej cena wstepu.
--
--  rag_chunk_concepts ma klucz zlozony (chunk_id, concept_id) i zadnej kolumny
--  id — dla owner_id nie ma to znaczenia, kolumna jest zwyklym atrybutem obok
--  klucza. Klucz glowny zostaje nietkniety.
-- ------------------------------------------------------------
alter table public.rag_collections
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.rag_documents
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.rag_chunks
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.rag_concepts
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.rag_chunk_concepts
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.rag_search_log
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- ------------------------------------------------------------
--  KROK 2: rag_search_log.owner_ref — ROZSTRZYGNIECIE: KOLUMNA ZNIKA.
--
--  owner_ref (text) powstala w session-log-wyszukiwan.sql:45 jako miejsce
--  zarezerwowane pod dokladnie te decyzje: "ZAREZERWOWANE dla I1, dzis zawsze
--  null", a komentarz nad tabela (wiersze 20-23) mowi wprost, ze dolozenie
--  identyfikatora uzytkownika "przesadzaloby o modelu powiazania, ktory nalezy
--  do I1". To jest I1. Model powiazania wlasnie zostal wybrany i jest nim
--  owner_id uuid z kluczem obcym do auth.users — ten sam, co na pieciu
--  tabelach AIDEAS objetych migracjami 008-012.
--
--  DLACZEGO KASUJEMY, A NIE ZOSTAWIAMY OBOK:
--    - owner_ref jest typu text i bez klucza obcego, wiec nie daje ani spojnosci,
--      ani kaskadowego kasowania przy usunieciu konta — a przy TEJ tabeli
--      (tresc zapytan uzytkownikow) kaskada jest wymogiem, nie wygoda,
--    - dwie kolumny wlasciciela w jednej tabeli to zaproszenie do wpisania
--      wlasciciela do niewlasciwej z nich. Polityka RLS patrzy tylko na owner_id;
--      wiersz z wypelnionym owner_ref i pustym owner_id nie bylby widoczny dla
--      nikogo, a wygladalby na poprawnie oznaczony,
--    - kolumna jest pusta co do jednego wiersza (KROK 0 wlasnie tego dowiodl),
--      wiec kasowanie nie traci zadnej informacji.
--
--  !!! TO WYMAGA JEDNEJ ZMIANY W KODZIE — ZADANIE DLA RUNDY 3B !!!
--
--  lib/rag/search-log.js:48 WPISUJE te kolumne do wiersza dziennika:
--      owner_ref: null, // ZAREZERWOWANE dla I1 — patrz sql/session-log-wyszukiwan.sql
--  Po skasowaniu kolumny PostgREST odrzuci taki insert ("Could not find the
--  'owner_ref' column"). Runda 3b musi usunac te linie i w jej miejsce oprzec
--  sie na default auth.uid() z KROKU 3.
--
--  JAK TO WYGLADA, ZANIM 3B TO ZROBI — i dlaczego to jest podstepne:
--  wyszukiwanie DZIALA DALEJ. search-log.js:51-62 ma swiadome dwie oslony
--  i nigdy nie pozwala, zeby awaria dziennika wywrocila odpowiedz; blad ladnie
--  ladnuje w console.warn "[rag] Nie zapisano sladu wyszukiwania". Skutek jest
--  wiec taki, ze dziennik PO CICHU przestaje zapisywac cokolwiek, a jedynym
--  objawem jest linijka w logach serwera. Tabela, ktorej caly sens polega na
--  tym, ze "jest to JEDYNY sposob, zeby dowiedziec sie, co nie dziala"
--  (session-log-wyszukiwan.sql:5), przestaje dzialac bez alarmu.
--
--  UWAGA PRZY COFANIU: rollback z naglowka NIE odtwarza tej kolumny. Gdyby byla
--  potrzebna, dodaj ja z powrotem recznie:
--      alter table public.rag_search_log add column if not exists owner_ref text;
-- ------------------------------------------------------------
alter table public.rag_search_log drop column if exists owner_ref;

-- ------------------------------------------------------------
--  KROK 3: DEFAULT i NOT NULL.
--
--  default auth.uid() to powod, dla ktorego runda 3b nie bedzie musiala
--  przepisywac kazdego insertu z osobna — wystarczy, ze zapyta baze klientem
--  z sesja uzytkownika, a wlasciciel dopisze sie sam. Dokladnie ten mechanizm
--  zadzialal w 007 (patrz tamtejszy KROK 3).
--
--  !!! TO JEST TEN KROK, KTORY ZATRZYMUJE ZAPIS PRZEZ service_role !!!
--  Pod service_role auth.uid() zwraca NULL i "set not null" zamienia kazdy
--  insert w blad. Jesli uruchamiasz 016 PRZED runda 3b i chcesz zachowac
--  dzialajacy zapis — zakomentuj szesc linii "set not null" ponizej i nalozc
--  je osobnym skryptem po 3b. Cala reszta migracji jest wtedy bez skutkow
--  ubocznych, bo service_role omija polityki.
-- ------------------------------------------------------------
alter table public.rag_collections    alter column owner_id set default auth.uid();
alter table public.rag_documents      alter column owner_id set default auth.uid();
alter table public.rag_chunks         alter column owner_id set default auth.uid();
alter table public.rag_concepts       alter column owner_id set default auth.uid();
alter table public.rag_chunk_concepts alter column owner_id set default auth.uid();
alter table public.rag_search_log     alter column owner_id set default auth.uid();

alter table public.rag_collections    alter column owner_id set not null;
alter table public.rag_documents      alter column owner_id set not null;
alter table public.rag_chunks         alter column owner_id set not null;
alter table public.rag_concepts       alter column owner_id set not null;
alter table public.rag_chunk_concepts alter column owner_id set not null;
alter table public.rag_search_log     alter column owner_id set not null;

-- ------------------------------------------------------------
--  KROK 4: INDEKSY na owner_id.
--
--  Po wlaczeniu RLS baza dokleja warunek owner_id = auth.uid() do KAZDEGO
--  zapytania. Bez indeksu kazde z nich to skan calej tabeli — a rag_chunks
--  jest najwieksza tabela w tym module.
-- ------------------------------------------------------------
create index if not exists rag_collections_owner_id_idx    on public.rag_collections (owner_id);
create index if not exists rag_documents_owner_id_idx      on public.rag_documents (owner_id);
create index if not exists rag_chunks_owner_id_idx         on public.rag_chunks (owner_id);
create index if not exists rag_concepts_owner_id_idx       on public.rag_concepts (owner_id);
create index if not exists rag_chunk_concepts_owner_id_idx on public.rag_chunk_concepts (owner_id);
create index if not exists rag_search_log_owner_id_idx     on public.rag_search_log (owner_id);

-- ------------------------------------------------------------
--  KROK 5: POLITYKI — ten sam ksztalt co w 008-012.
--
--  "using" vs "with check":
--    using      = ktore z ISTNIEJACYCH wierszy widze i mam prawo ruszyc,
--    with check = jaki wiersz wolno mi ZOSTAWIC W BAZIE.
--
--  drop przed create, bo "create policy" nie ma wariantu "if not exists" —
--  bez tego ponowne uruchomienie skryptu wysypaloby sie na duplikacie nazwy.
-- ------------------------------------------------------------
drop policy if exists "rag_collections_wlasne"    on public.rag_collections;
drop policy if exists "rag_documents_wlasne"      on public.rag_documents;
drop policy if exists "rag_chunks_wlasne"         on public.rag_chunks;
drop policy if exists "rag_concepts_wlasne"       on public.rag_concepts;
drop policy if exists "rag_chunk_concepts_wlasne" on public.rag_chunk_concepts;
drop policy if exists "rag_search_log_wlasne"     on public.rag_search_log;

create policy "rag_collections_wlasne"
  on public.rag_collections
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "rag_documents_wlasne"
  on public.rag_documents
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "rag_chunks_wlasne"
  on public.rag_chunks
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "rag_concepts_wlasne"
  on public.rag_concepts
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "rag_chunk_concepts_wlasne"
  on public.rag_chunk_concepts
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "rag_search_log_wlasne"
  on public.rag_search_log
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ------------------------------------------------------------
--  KROK 6: WLACZENIE RLS.
--
--  session-2-schema.sql:115-119 wylaczyl RLS jawnie, z uzasadnieniem "projekt
--  jednouzytkownikowy". To zalozenie wlasnie przestalo obowiazywac. Szosta
--  tabela (rag_search_log) powstala pozniej i nigdy nie byla w tamtej liscie —
--  RLS ma na niej stan domyslny Supabase, wiec "enable" moze byc dla niej
--  operacja bez zmiany. Nie szkodzi, polecenie jest idempotentne.
-- ------------------------------------------------------------
alter table public.rag_collections    enable row level security;
alter table public.rag_documents      enable row level security;
alter table public.rag_chunks         enable row level security;
alter table public.rag_concepts       enable row level security;
alter table public.rag_chunk_concepts enable row level security;
alter table public.rag_search_log     enable row level security;

-- ------------------------------------------------------------
--  KROK 7: FUNKCJE — execute dla roli authenticated.
--
--  Piec funkcji, ktorych warstwa HTTP uzywa przez rpc(). Do tej pory execute
--  mial wylacznie service_role; po 3b wolac je bedzie sesja uzytkownika.
--
--  SECURITY INVOKER ZOSTAJE NIETKNIETY — i to jest tu najwazniejsze.
--  Zadna z tych czterech funkcji nie ma "security definer" (rag_search_chunks
--  ma to opisane wprost w session-5-search.sql:16). Dzieki temu ich zapytania
--  wykonuja sie z prawami WOLAJACEGO, a wiec podlegaja politykom z KROKU 5:
--  rag_search_chunks przeszuka wylacznie wlasne fragmenty, a rag_set_chunk_coords
--  nadpisze wspolrzedne wylacznie na wlasnych. Gdyby ktorakolwiek dostala
--  "security definer", staly by sie obejsciem calej tej migracji — funkcja
--  chodzilaby z prawami wlasciciela i widziala wszystko.
--
--  PIATA FUNKCJA — rag_diag — JEST WYJATKIEM I MA NIM POZOSTAC.
--  W odroznieniu od czterech powyzszych ma "security definer"
--  (session-0-diagnostyka.sql:34) i to jest tu poprawne, a nie przeoczenie:
--  funkcja nie dotyka danych uzytkownika, tylko czyta KATALOG SYSTEMOWY
--  (obecnosc pgvector, rzeczywisty wymiar kolumny rag_chunks.embedding),
--  do czego rola authenticated nie ma i nie powinna miec praw. Przed
--  nadmiarem chroni ALLOWLISTA wewnatrz funkcji — przyjmuje wylacznie
--  wskazana pare tabela/kolumna, wiec definer nie daje tu wgladu w nic poza
--  tym, co /api/rag/status i tak pokazuje.
--
--  DEFINERA NIE ZDEJMUJEMY. Zdjecie go nie "uszczelnia" niczego, tylko psuje
--  diagnostyke: bez execute dla authenticated /api/rag/status na kliencie
--  sesyjnym pokazuje pgvector jako "nie mozna ustalic" i podpowiada
--  uruchomienie skryptu, ktory juz dawno zostal uruchomiony — czyli myli
--  dokladnie tam, gdzie ma pomagac.
--
--  "revoke ... from public" zostaje zgodnie z oryginalami. Odbiera uprawnienie
--  pseudo-roli PUBLIC (czyli "kazdemu"), nie rusza nadan imiennych — dlatego
--  service_role wymieniam ponizej jawnie, zeby plik byl samowystarczalny
--  i przezyl uruchomienie w dowolnej kolejnosci.
-- ------------------------------------------------------------
revoke all on function public.rag_search_chunks(uuid, vector, int, uuid[]) from public;
grant execute on function public.rag_search_chunks(uuid, vector, int, uuid[]) to service_role;
grant execute on function public.rag_search_chunks(uuid, vector, int, uuid[]) to authenticated;

revoke all on function public.rag_search_chunks_text(uuid, text, int, uuid[]) from public;
grant execute on function public.rag_search_chunks_text(uuid, text, int, uuid[]) to service_role;
grant execute on function public.rag_search_chunks_text(uuid, text, int, uuid[]) to authenticated;

revoke all on function public.rag_chunks_without_concepts(uuid, int, int) from public;
grant execute on function public.rag_chunks_without_concepts(uuid, int, int) to service_role;
grant execute on function public.rag_chunks_without_concepts(uuid, int, int) to authenticated;

revoke all on function public.rag_set_chunk_coords(jsonb) from public;
grant execute on function public.rag_set_chunk_coords(jsonb) to service_role;
grant execute on function public.rag_set_chunk_coords(jsonb) to authenticated;

-- rag_diag — SECURITY DEFINER, zostaje definerem (uzasadnienie w komentarzu wyzej).
revoke all on function public.rag_diag(text, text) from public;
grant execute on function public.rag_diag(text, text) to service_role;
grant execute on function public.rag_diag(text, text) to authenticated;

-- ------------------------------------------------------------
--  KROK 8: STORAGE — bucket "rag-files".
--
--  PROBLEM: klucz obiektu to <collection_id>/<document_id>/<nazwa>
--  (lib/rag/documents.js:231), wiec PIERWSZY SEGMENT NIE JEST auth.uid().
--  Wzorzec z 013_rls_storage.sql — split_part(name,'/',1) = auth.uid()::text —
--  nie da sie tu przepisac: odcialby wlascicielowi dostep do wszystkich jego
--  wlasnych plikow, bo porownywalby uid z identyfikatorem kolekcji.
--
--  ROZWAZONE ROZWIAZANIA:
--
--  A) Zmiana schematu klucza na <auth.uid()>/<collection_id>/<document_id>/<nazwa>
--     i polityka jeden do jednego jak w 013.
--     ODRZUCONE: to zmiana w lib/rag/documents.js, a wiec kod — czego runda 3a
--     z zalozenia nie dotyka. Doklada tez trwale zaleznosc ukladu katalogow
--     w buckecie od modelu kont; przy przenoszeniu kolekcji miedzy kontami
--     (czego dzis nie ma, ale jest naturalnym kolejnym zyczeniem) trzeba by
--     PRZENOSIC PLIKI, a nie zmienic jedna kolumne.
--
--  B) Polityka pytajaca o wlasciciela kolekcji przez rag_collections. WYBRANE.
--
--  DLACZEGO B JEST TU BEZPIECZNE, MIMO ZE 013 SWIADOMIE UNIKAL ZAGLADANIA DO TABEL:
--  argument z 013:69-75 brzmial "plik laduje w Storage ZANIM powstanie wiersz
--  w bazie", wiec przy zapisie polityka nie mialaby o co oprzec warunku.
--  W module RAG kolejnosc jest ODWROTNA i to jest sedno roznicy:
--  documents.js:207 najpierw pobiera kolekcje (getCollection — rzuca not_found,
--  jesli jej nie ma), potem wstawia wiersz dokumentu, i DOPIERO PO TYM wola
--  upload (documents.js:232). W chwili zapisu do bucketu wiersz kolekcji juz
--  istnieje, wiec "with check" ma sie o co oprzec.
--
--  DLACZEGO exists(...) A NIE JOIN NA rag_documents:
--  wystarczy pierwszy segment. Siegniecie po <document_id> z drugiego segmentu
--  nic nie dodaje (dokument i tak nalezy do tej samej kolekcji), a mnozy koszt
--  i liczbe miejsc do pomylenia.
--
--  DLACZEGO c.id::text = split_part(...), A NIE split_part(...)::uuid:
--  dokladnie ten sam powod co w 013:83-86 — rzutowanie NIEZAUFANEJ strony na uuid
--  wywraca CALE zapytanie bledem, gdy w buckecie znajdzie sie obiekt o sciezce,
--  ktora uuid-em nie jest. Rzutujemy strone pewna (c.id), porownujemy tekst
--  z tekstem, a niepasujacy obiekt po prostu sie nie dopasowuje.
--
--  =========================================================================
--  !!! PULAPKA, KTORA JUZ RAZ ZADZIALALA — DLATEGO "objects.name", NIE "name"
--
--  Pierwsza wersja tej polityki miala w podzapytaniu SAM "name":
--
--      where c.id::text = split_part(name, '/', 1)          <-- ZLE
--
--  Zamiar byl taki, zeby "name" znaczylo storage.objects.name — czyli klucz
--  obiektu. Postgres rozumie to inaczej: rozstrzyga nazwe w NAJBLIZSZYM
--  zakresie, a tam stoi alias "c", czyli rag_collections, ktore MA WLASNA
--  KOLUMNE "name" (nazwe kolekcji, session-2-schema.sql:22). Wyrazenie znaczy
--  wiec "c.id = pierwszy segment NAZWY KOLEKCJI" i jest zawsze falszywe.
--
--  DLACZEGO TO BOLI BARDZIEJ NIZ ZWYKLA LITEROWKA: skladniowo jest bez zarzutu.
--  Postgres nie zglasza bledu ani ostrzezenia, polityka tworzy sie poprawnie,
--  a jedynym objawem jest odmowa zapisu z komunikatem "new row violates
--  row-level security policy" — czyli dokladnie tym samym, ktory dostaniesz
--  przy braku uprawnien. Diagnoza idzie wtedy w strone kluczy i sesji, a blad
--  siedzi w rozstrzyganiu nazwy kolumny.
--
--  KWALIFIKUJEMY OBIE STRONY JAWNIE. "objects" to nazwa tabeli, na ktorej
--  stoi polityka (storage.objects), wiec objects.name jest kluczem obiektu
--  i nie da sie go pomylic z niczym z podzapytania.
--
--  JAK TO SPRAWDZIC, ZANIM ZAUFASZ POLITYCE — test w SQL Editor podstawia
--  kontekst uzytkownika i pyta wprost, czy warunek przepusci dany klucz:
--
--      select exists (
--        select 1 from public.rag_collections c
--         where c.id::text = split_part('<WKLEJ-KLUCZ-OBIEKTU>', '/', 1)
--           and c.owner_id = '<WKLEJ-UUID-KONTA>'::uuid
--      ) as czy_polityka_przepusci;
--
--  Ma zwrocic true. Zwraca false przy KAZDEJ z trzech przyczyn naraz (zla
--  kolumna, zla kolekcja, zle konto), wiec przy false sprawdz po kolei:
--  czy kolekcja o tym id istnieje i czyja jest.
--  =========================================================================
--
--  UWAGA O ZLOZENIU Z RLS NA rag_collections: podzapytanie wykonuje sie z prawami
--  wolajacego, wiec dziala na nim rowniez polityka rag_collections_wlasne.
--  Warunek "c.owner_id = auth.uid()" jest przez to formalnie nadmiarowy —
--  zostaje jawnie, bo polityka ma byc czytelna sama z siebie i nie moze
--  milczaco zalezec od tego, ze ktos inny zrobil swoja robote.
--
--  "to authenticated" — anon wypada calkowicie, tak samo jak w 013.
-- ------------------------------------------------------------
drop policy if exists "rag_files_wlasne_pliki" on storage.objects;

create policy "rag_files_wlasne_pliki"
  on storage.objects
  for all
  to authenticated
  using (
    objects.bucket_id = 'rag-files'
    and exists (
      select 1
        from public.rag_collections c
       where c.id::text = split_part(objects.name, '/', 1)
         and c.owner_id = auth.uid()
    )
  )
  with check (
    objects.bucket_id = 'rag-files'
    and exists (
      select 1
        from public.rag_collections c
       where c.id::text = split_part(objects.name, '/', 1)
         and c.owner_id = auth.uid()
    )
  );

commit;

-- ============================================================
--  ZAPYTANIA KONTROLNE — uruchom KAZDE osobno, w nowym "New query".
-- ============================================================

-- --- 1) RLS wlaczony na szesciu tabelach -------------------------------------
--  Oczekiwane: SZESC wierszy, w kazdym rowsecurity = true.
--
--  select tablename, rowsecurity
--    from pg_tables
--   where schemaname = 'public'
--     and tablename in (
--       'rag_collections','rag_documents','rag_chunks',
--       'rag_concepts','rag_chunk_concepts','rag_search_log'
--     )
--   order by tablename;

-- --- 2) Polityki na tabelach rag_* -------------------------------------------
--  Oczekiwane: SZESC wierszy, kazdy ALL / {authenticated},
--  qual i with_check postaci (auth.uid() = owner_id).
--
--  select tablename, policyname, cmd, roles, qual, with_check
--    from pg_policies
--   where schemaname = 'public'
--     and tablename like 'rag_%'
--   order by tablename;

-- --- 3) Polityka na buckecie rag-files ---------------------------------------
--  Oczekiwane: rag_files_wlasne_pliki / ALL / {authenticated}.
--  W tym samym wyniku ma stac knowledge_wlasne_pliki z migracji 013 — jesli
--  zniknela, ktos nadpisal polityki bucketu knowledge i trzeba wrocic do 013.
--  Czegokolwiek WIECEJ na tej liscie nie moze byc: polityki permissive lacza
--  sie przez OR, wiec jedna zapomniana, otwarta polityka uniewaznia obie te.
--
--  select policyname, cmd, roles, qual, with_check
--    from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   order by policyname;

-- --- 4) Granty na pieciu funkcjach -------------------------------------------
--  Oczekiwane: DZIESIEC wierszy — kazda z pieciu funkcji po dwa razy
--  (authenticated + service_role). Roli "public" ma NIE byc ani razu.
--
--  select p.proname                          as funkcja,
--         pg_get_function_identity_arguments(p.oid) as argumenty,
--         a.grantee,
--         a.privilege_type
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
--    join lateral (
--      select pg_get_userbyid(acl.grantee) as grantee,
--             acl.privilege_type
--    ) a on true
--   where n.nspname = 'public'
--     and p.proname in (
--       'rag_search_chunks','rag_search_chunks_text',
--       'rag_chunks_without_concepts','rag_set_chunk_coords','rag_diag'
--     )
--   order by funkcja, grantee;
--
--  Przy okazji sprawdz, ze rag_diag NADAL jest definerem, a pozostale cztery
--  NIE sa — to jest wlasnie ten podzial, na ktorym stoi cala migracja:
--
--  select proname, prosecdef as security_definer
--    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname like 'rag_%'
--   order by proname;
--  -- rag_diag = true, cztery pozostale = false.

-- --- 5) Granty TABELOWE dla roli authenticated -------------------------------
--  RLS decyduje, KTORE wiersze widzisz — ale dopiero wtedy, gdy w ogole masz
--  prawo do tabeli. Bez grantu tabelowego polityka nie ma czego filtrowac
--  i po 3b kazde zapytanie wroci "permission denied for table ...".
--  Supabase zwykle nadaje te prawa automatycznie (alter default privileges
--  w schemacie public), dlatego skrypt ICH NIE NADAJE — najpierw sprawdz.
--
--  Oczekiwane: dla kazdej z szesciu tabel komplet SELECT/INSERT/UPDATE/DELETE.
--
--  select table_name, string_agg(privilege_type, ', ' order by privilege_type) as prawa
--    from information_schema.role_table_grants
--   where table_schema = 'public'
--     and grantee = 'authenticated'
--     and table_name in (
--       'rag_collections','rag_documents','rag_chunks',
--       'rag_concepts','rag_chunk_concepts','rag_search_log'
--     )
--   group by table_name
--   order by table_name;
--
--  JESLI KTORAS TABELA NIE WYSTAPI albo bedzie miala niepelna liste —
--  uruchom to i sprawdz ponownie:
--
--  grant select, insert, update, delete on public.rag_collections    to authenticated;
--  grant select, insert, update, delete on public.rag_documents      to authenticated;
--  grant select, insert, update, delete on public.rag_chunks         to authenticated;
--  grant select, insert, update, delete on public.rag_concepts       to authenticated;
--  grant select, insert, update, delete on public.rag_chunk_concepts to authenticated;
--  grant select, insert, update, delete on public.rag_search_log     to authenticated;

-- --- 6) Kolumny owner_id: default, NOT NULL, brak owner_ref ------------------
--  Oczekiwane: szesc wierszy, is_nullable = NO, column_default = auth.uid().
--  Zapytanie o owner_ref ma zwrocic ZERO wierszy.
--
--  select table_name, column_name, is_nullable, column_default
--    from information_schema.columns
--   where table_schema = 'public'
--     and column_name in ('owner_id','owner_ref')
--     and table_name like 'rag_%'
--   order by table_name, column_name;
