-- ============================================================
--  AIdeas — migracja 020: modele konta (lista dopuszczonych + przypisania)
--
--  CO ROBI: zaklada DWIE tabele — allowed_models (wiele wierszy na konto)
--  i model_assignments (dokladnie jeden wiersz na konto) — z owner_id,
--  politykami na wlasciciela i RLS, wzorem 016.
--
--  PO CO: wybor modeli przestaje byc preferencja jednej przegladarki.
--  Dzis cale ustawienia siedza w localStorage (lib/settings/defaults.js:1 —
--  "na razie per-przegladarka", z zapowiedzia dokladnie tej zmiany), wiec
--  osoba, ktora wlaczy sobie dwadziescia modeli z katalogu OpenRoutera,
--  traci to przy zmianie komputera albo wyczyszczeniu danych strony.
--
--  KOD APLIKACJI TA MIGRACJA WYPRZEDZA. Trasy odczytu i zapisu powstaja
--  razem z nia (runda 4), ale INTERFEJS I CZYTELNICY LISTY MODELI ZOSTAJA
--  NIETKNIECI — to rundy 5 i 6. Do tego czasu tabele sa zapisywane
--  i odczytywane wylacznie przez /api/settings/models, a aplikacja dziala
--  jak dotad, na localStorage. Uruchomienie tej migracji NICZEGO NIE PSUJE
--  i niczego jeszcze nie wlacza.
--
--  ------------------------------------------------------------
--  DLACZEGO DWIE TABELE, A NIE JEDNA
--
--  Rozwazane byly trzy uklady:
--
--  A) JEDNA TABELA, przypisania jako flagi na wierszach modeli
--     (is_default_agent / is_rag_concept / is_mentor boolean).
--     ODRZUCONE. "Najwyzej jeden model mentora na konto" trzeba by wtedy
--     wymuszac trzema indeksami czesciowymi (unique ... where is_mentor),
--     a i tak nie da sie zapisac przypisania do modelu spoza listy —
--     co jest akurat tym przypadkiem, ktory walidacja ma OBSLUZYC
--     fallbackiem, a nie uczynic niewyrazalnym.
--
--  B) DWIE TABELE, przypisania jako WIERSZE (owner_id, rola, provider, model).
--     ODRZUCONE, choc kusi rozszerzalnoscia. Zysk "czwarta rola bez migracji"
--     jest pozorny: rola istnieje wtedy i tylko wtedy, gdy jakis kod ja czyta,
--     wiec i tak trzeba by ruszyc kod — a migracja obok jest tania. Koszt jest
--     za to realny: lista dozwolonych rol musialaby zyc w CHECK obok tej samej
--     listy w kodzie, czyli w dwoch miejscach, ktore rozjada sie przy pierwszej
--     zmianie nazwy. Do tego "najwyzej jedno przypisanie na role" wymaga
--     unique (owner_id, rola), a odczyt sklada trzy wiersze w jeden obiekt.
--
--  C) DWIE TABELE, przypisania w KOLUMNACH, jeden wiersz na konto. WYBRANE.
--     Kardynalnosci sa rozne i to jest cala odpowiedz: dopuszczonych modeli
--     jest WIELE i sa zbiorem, przypisania sa TRZY, POJEDYNCZE i z gory znane.
--     W tym ukladzie "najwyzej jeden mentor" wynika z ksztaltu tabeli, a nie
--     z pilnujacego go ograniczenia; odczyt to jeden wiersz; zapis to jeden
--     upsert. Czwarta rola kosztuje jedno "alter table add column" — i tak
--     wykonywane w tej samej rundzie co zmiana w kodzie, ktora ja wprowadza.
--
--  ------------------------------------------------------------
--  DLACZEGO PROVIDER I MODEL TO DWIE KOLUMNY, A NIE JEDNA
--
--  Identyfikator modelu NIE jest globalnie jednoznaczny. "llama3" u Ollamy
--  i "llama3" gdziekolwiek indziej to dwa rozne byty, a katalog OpenRoutera
--  ma wlasna przestrzen nazw ("anthropic/claude-haiku-4.5" wobec
--  "claude-haiku-4-5" w lib/config/models.js — ten sam model, dwa napisy).
--  Sklejanie ich w jeden napis znaczyloby, ze ktos kiedys go rozdzieli
--  po pierwszym ukosniku i trafi w "anthropic" tam, gdzie dostawca jest
--  "openrouter".
--
--  ------------------------------------------------------------
--  !!! PRZED URUCHOMIENIEM: KOPIA BAZY NIE JEST KONIECZNA !!!
--  Skrypt tylko DODAJE dwie nowe tabele. Nie rusza zadnej istniejacej
--  tabeli, kolumny ani wiersza.
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. SQL Editor -> New query
--  3. Wklej CALY plik -> Run
--  4. Uruchom zapytania kontrolne z konca pliku (osobne "New query").
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--
--  JAK TO COFNAC:
--      drop table if exists public.model_assignments;
--      drop table if exists public.allowed_models;
--
--  Kolejnosc jest istotna: model_assignments ma klucze obce do
--  allowed_models, wiec tabela wskazywana idzie druga.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  TABELA 1: allowed_models — modele WLACZONE przez uzytkownika.
--
--  unique (owner_id, provider, model_id) pelni tu dwie role naraz:
--  nie pozwala wlaczyc tego samego modelu dwa razy ORAZ jest celem
--  zlozonych kluczy obcych z model_assignments (Postgres wymaga
--  unikalnosci po stronie wskazywanej).
--
--  KOLUMNA label JEST MIGAWKA, NIE ZRODLEM PRAWDY. Nazwy modeli zyja
--  w katalogu (lib/config/models.js dla dostawcow statycznych,
--  /api/openrouter/models dla OpenRoutera). Trzymamy kopie nazwy z chwili
--  wlaczenia po to i tylko po to, zeby dalo sie pokazac liste, gdy katalog
--  jest niedostepny albo gdy model z niego zniknal — bez tego uzytkownik
--  widzialby wtedy sam identyfikator. Nullable, bo dostawca lokalny
--  (Ollama) nie zawsze ma czym ja wypelnic.
-- ------------------------------------------------------------
create table if not exists public.allowed_models (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid()
               references auth.users(id) on delete cascade,
  provider   text not null,
  model_id   text not null,
  label      text,
  created_at timestamptz not null default now(),

  constraint allowed_models_unikat unique (owner_id, provider, model_id)
);

-- ------------------------------------------------------------
--  BEZ CHECK NA LISTE DOSTAWCOW — I TO JEST WYBOR.
--
--  Kusi, zeby dopisac check (provider in ('anthropic','openai','openrouter','ollama')).
--  Nie robimy tego z tego samego powodu, dla ktorego odrzucony zostal wariant B:
--  lista dostawcow zyje w lib/config/models.js (PROVIDERS) i wpisana tu drugi
--  raz rozjechalaby sie przy dodaniu piatego — a objawem byloby "new row
--  violates check constraint" przy zapisie, czyli komunikat wskazujacy na baze
--  wtedy, gdy problemem jest niezaktualizowana migracja.
--
--  Pilnuje tego SERWER, przy zapisie (lib/settings/modeleKonta.js), i tam ta
--  lista jest jedna. Baza przyjmuje kazdy tekst; nikt nie pisze do niej
--  z pominieciem trasy, bo klucz service_role w tym projekcie nie istnieje
--  (lib/supabase/server.js:17).
-- ------------------------------------------------------------

create index if not exists allowed_models_owner_id_idx
  on public.allowed_models (owner_id);

-- ------------------------------------------------------------
--  TABELA 2: model_assignments — ktory model do czego.
--
--  owner_id JEST KLUCZEM GLOWNYM. Nie ma osobnego id i to jest sedno
--  wariantu C: jedno konto = najwyzej jeden wiersz, wymuszone ksztaltem.
--  Zapis to "insert ... on conflict (owner_id) do update", bez pytania,
--  czy wiersz juz istnieje.
--
--  TRZY PRZYPISANIA, SZESC KOLUMN:
--    agent_default_* — model podpowiadany przy tworzeniu nowego agenta
--                      (dzis DEFAULT_SETTINGS.defaultProvider/defaultModel),
--    rag_concept_*   — model wyciagajacy pojecia w Kreatorze RAG
--                      (dzis RAG_CONCEPT_PROVIDER / RAG_CONCEPT_MODEL z env),
--    mentor_*        — model mentora (dzis DEFAULT_SETTINGS.mentorModel
--                      oraz MENTOR_MODEL z env).
--
--  WSZYSTKIE NULLABLE. Null nie znaczy "brak modelu", tylko "konto nie ma
--  wlasnego zdania — uzyj wartosci z kodu/env". Dzieki temu domyslki zostaja
--  w JEDNYM miejscu (lib/settings/defaults.js, lib/config/mentor.js,
--  lib/rag/config.js), a tabela nie staje sie ich druga kopia, ktora trzeba
--  aktualizowac razem z nimi.
--
--  EMBEDDINGOW TU NIE MA I NIE BEDZIE. Model embeddingow nalezy do KOLEKCJI,
--  nie do konta: fragmenty juz zaindeksowane sa wektorami tego konkretnego
--  modelu i zmiana ustawienia na poziomie konta uniewaznilaby je bez zapytania.
--  Rdzen RAG pilnuje tego osobno (blad model_mismatch przed wyszukiwaniem).
-- ------------------------------------------------------------
create table if not exists public.model_assignments (
  owner_id uuid primary key default auth.uid()
             references auth.users(id) on delete cascade,

  agent_default_provider text,
  agent_default_model    text,

  rag_concept_provider   text,
  rag_concept_model      text,

  mentor_provider        text,
  mentor_model           text,

  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
--  KLUCZE OBCE ZLOZONE: przypisanie MUSI wskazywac model z wlasnej listy.
--
--  Trzy klucze (owner_id, X_provider, X_model) -> allowed_models
--  (owner_id, provider, model_id). Owner_id wchodzi w klucz celowo: bez niego
--  dalo by sie przypisac model wlaczony przez KOGOS INNEGO.
--
--  on delete set null: wylaczenie modelu z listy ZERUJE przypisanie, zamiast
--  blokowac usuniecie albo zostawiac wskazanie w prozni. Skutek jest dokladnie
--  taki, jakiego chcemy — konto wraca do domyslki z kodu, bo null znaczy
--  wlasnie "brak wlasnego zdania".
--
--  !!! DLACZEGO PUSTE PRZYPISANIE W OGOLE PRZECHODZI PRZEZ TE KLUCZE !!!
--
--  Bo klucz zlozony dziala domyslnie w trybie MATCH SIMPLE: jesli CHOC JEDNA
--  z kolumn wskazujacych jest NULL, ograniczenie NIE JEST SPRAWDZANE. Wiersz
--  z owner_id ustawionym i mentor_provider/mentor_model rownymi NULL przechodzi
--  wiec bez zadnego wiersza w allowed_models — i wlasnie na tym stoi caly model
--  "null = brak wlasnego zdania".
--
--  Gdyby ktos kiedys dopisal tu MATCH FULL, kazde konto musialoby miec komplet
--  trzech przypisan albo zaden — czyli nie dalo by sie ustawic samego mentora.
--  Nie dopisujemy.
--
--  CZY TO NIE KLOCI SIE Z "FALLBACK, NIE BLAD"? Nie, bo te dwie rzeczy dzialaja
--  w innych momentach. Serwer sprowadza przypisanie do null ZANIM cokolwiek
--  zapisze (lib/settings/modeleKonta.js) — do bazy nigdy nie trafia wskazanie
--  spoza listy, wiec te klucze nie maja prawa sie odezwac przy normalnej pracy.
--  Sa siatka na wypadek, gdyby ktos kiedys dopisal druga sciezke zapisu
--  z pominieciem walidacji: wtedy dostanie blad 23503 zamiast cichego
--  przypisania w prozni. To ma byc sygnal o bledzie w kodzie, nie sciezka
--  uzytkownika.
--
--  GDYBY KIEDYS PRZESZKADZALY (np. przy chęci przypisania modelu spoza listy):
--      alter table public.model_assignments drop constraint model_assignments_agent_fk;
--      -- i analogicznie dla rag_concept_fk oraz mentor_fk.
--
--  "add constraint" nie ma wariantu "if not exists", stad drop przed add —
--  zeby skrypt przezyl ponowne uruchomienie.
-- ------------------------------------------------------------
alter table public.model_assignments
  drop constraint if exists model_assignments_agent_fk,
  drop constraint if exists model_assignments_rag_concept_fk,
  drop constraint if exists model_assignments_mentor_fk;

alter table public.model_assignments
  add constraint model_assignments_agent_fk
    foreign key (owner_id, agent_default_provider, agent_default_model)
    references public.allowed_models (owner_id, provider, model_id)
    on delete set null (agent_default_provider, agent_default_model),

  add constraint model_assignments_rag_concept_fk
    foreign key (owner_id, rag_concept_provider, rag_concept_model)
    references public.allowed_models (owner_id, provider, model_id)
    on delete set null (rag_concept_provider, rag_concept_model),

  add constraint model_assignments_mentor_fk
    foreign key (owner_id, mentor_provider, mentor_model)
    references public.allowed_models (owner_id, provider, model_id)
    on delete set null (mentor_provider, mentor_model);

-- ------------------------------------------------------------
--  DLACZEGO "on delete set null (kolumny)", A NIE SAMO "set null":
--
--  Zwykle "on delete set null" wyzerowaloby WSZYSTKIE kolumny klucza — razem
--  z owner_id, ktore jest tu kluczem glownym i ma NOT NULL. Kasowanie modelu
--  z listy konczyloby sie wtedy bledem zamiast wyzerowaniem przypisania,
--  czyli dokladnie odwrotnie, niz zamierzone.
--
--  Skladnia "set null (lista kolumn)" pochodzi z PostgreSQL 15. Supabase
--  stoi dzis na 15+, wiec jest dostepna; gdyby skrypt trafil na starsza baze,
--  Run zglosi blad skladni PRZY TYM POLECENIU i cala transakcja sie wycofa —
--  nic nie zostanie zmienione. Obejsciem na starszej wersji jest wyzwalacz
--  before delete na allowed_models zerujacy pasujace kolumny.
--
--  INDEKSY POD TE KLUCZE: przy kasowaniu wiersza z allowed_models Postgres
--  szuka wskazan w model_assignments. Tabela ma najwyzej jeden wiersz na konto,
--  wiec osobne indeksy byly by kosztem bez zysku — sam klucz glowny (owner_id)
--  wystarcza, bo kasowany model i tak nalezy do konkretnego konta.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
--  POLITYKI — ten sam ksztalt co w 008-012 i 016.
--
--  using      = ktore z ISTNIEJACYCH wierszy widze i mam prawo ruszyc,
--  with check = jaki wiersz wolno mi ZOSTAWIC W BAZIE.
--
--  drop przed create, bo "create policy" nie ma wariantu "if not exists".
-- ------------------------------------------------------------
drop policy if exists "allowed_models_wlasne"    on public.allowed_models;
drop policy if exists "model_assignments_wlasne" on public.model_assignments;

create policy "allowed_models_wlasne"
  on public.allowed_models
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "model_assignments_wlasne"
  on public.model_assignments
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

alter table public.allowed_models    enable row level security;
alter table public.model_assignments enable row level security;

-- ------------------------------------------------------------
--  GRANTY TABELOWE.
--
--  RLS rozstrzyga, KTORE wiersze widzisz — ale dopiero wtedy, gdy w ogole
--  masz prawo do tabeli. Supabase zwykle nadaje je automatycznie (alter
--  default privileges w schemacie public), jednak w 016 okazalo sie to
--  warte sprawdzenia (patrz tamtejsze zapytanie kontrolne 5). Tutaj tabele
--  sa NOWE, wiec nadajemy wprost — jedno polecenie mniej do diagnozowania
--  przy "permission denied for table allowed_models".
-- ------------------------------------------------------------
grant select, insert, update, delete on public.allowed_models    to authenticated;
grant select, insert, update, delete on public.model_assignments to authenticated;

commit;

-- ============================================================
--  ZAPYTANIA KONTROLNE — uruchom KAZDE osobno, w nowym "New query".
-- ============================================================

-- --- 1) Obie tabele istnieja i maja wlaczony RLS -----------------------------
--  Oczekiwane: DWA wiersze, w kazdym rowsecurity = true.
--
--  select tablename, rowsecurity
--    from pg_tables
--   where schemaname = 'public'
--     and tablename in ('allowed_models', 'model_assignments')
--   order by tablename;

-- --- 2) Polityki ------------------------------------------------------------
--  Oczekiwane: DWA wiersze, kazdy ALL / {authenticated},
--  qual i with_check postaci (auth.uid() = owner_id).
--
--  select tablename, policyname, cmd, roles, qual, with_check
--    from pg_policies
--   where schemaname = 'public'
--     and tablename in ('allowed_models', 'model_assignments')
--   order by tablename;

-- --- 3) Klucze obce i unikat ------------------------------------------------
--  Oczekiwane: TRZY klucze obce (agent / rag_concept / mentor) i jeden
--  unikat allowed_models_unikat. Brak ktoregokolwiek klucza znaczy, ze
--  wersja Postgresa nie przyjela skladni "set null (kolumny)" — patrz
--  komentarz przy kluczach.
--
--  select con.conname, con.contype, rel.relname as tabela
--    from pg_constraint con
--    join pg_class rel on rel.oid = con.conrelid
--    join pg_namespace n on n.oid = rel.relnamespace
--   where n.nspname = 'public'
--     and rel.relname in ('allowed_models', 'model_assignments')
--     and con.contype in ('f', 'u')
--   order by rel.relname, con.conname;

-- --- 4) Kolumny owner_id: default auth.uid() i NOT NULL ----------------------
--  Oczekiwane: dwa wiersze, is_nullable = NO, column_default = auth.uid().
--
--  select table_name, column_name, is_nullable, column_default
--    from information_schema.columns
--   where table_schema = 'public'
--     and column_name = 'owner_id'
--     and table_name in ('allowed_models', 'model_assignments')
--   order by table_name;

-- --- 5) Granty dla roli authenticated ----------------------------------------
--  Oczekiwane: dla obu tabel komplet SELECT/INSERT/UPDATE/DELETE.
--
--  select table_name, string_agg(privilege_type, ', ' order by privilege_type) as prawa
--    from information_schema.role_table_grants
--   where table_schema = 'public'
--     and grantee = 'authenticated'
--     and table_name in ('allowed_models', 'model_assignments')
--   group by table_name
--   order by table_name;

-- --- 6) Przypisania OSIEROCONE — wskazanie poza wlasna lista -----------------
--  Oczekiwane: zero wierszy. Klucze obce nie powinny na to pozwolic; to
--  zapytanie jest kontrola, czy faktycznie sie zalozyly.
--
--  UWAGA NA RLS: SQL Editor (rola postgres) widzi wszystkie wiersze obu tabel,
--  wiec wynik jest globalny, nie per konto — i o to tu chodzi.
--
--  select a.owner_id, 'mentor' as rola, a.mentor_provider as provider, a.mentor_model as model
--    from public.model_assignments a
--   where a.mentor_model is not null
--     and not exists (
--       select 1 from public.allowed_models m
--        where m.owner_id = a.owner_id
--          and m.provider = a.mentor_provider
--          and m.model_id = a.mentor_model
--     )
--  union all
--  select a.owner_id, 'agent_domyslny', a.agent_default_provider, a.agent_default_model
--    from public.model_assignments a
--   where a.agent_default_model is not null
--     and not exists (
--       select 1 from public.allowed_models m
--        where m.owner_id = a.owner_id
--          and m.provider = a.agent_default_provider
--          and m.model_id = a.agent_default_model
--     )
--  union all
--  select a.owner_id, 'rag_pojecia', a.rag_concept_provider, a.rag_concept_model
--    from public.model_assignments a
--   where a.rag_concept_model is not null
--     and not exists (
--       select 1 from public.allowed_models m
--        where m.owner_id = a.owner_id
--          and m.provider = a.rag_concept_provider
--          and m.model_id = a.rag_concept_model
--     );
