-- ============================================================
--  AIdeas — migracja 014: MAGAZYN WIEDZY, krok 1 (rozbrojenie)
--  Sesja 1 tematu "magazyn wiedzy", Etap A.
--
--  CEL CALEGO TEMATU: pliki wiedzy przestaja nalezec do PROJEKTU
--  i zaczynaja nalezec do KONTA. Jedna plaska pula na owner_id,
--  jeden plik uzywany przez wielu agentow w wielu projektach.
--
--  CO ROBI TA MIGRACJA — TRZY RZECZY, ZADNA NIE ZMIENIA ZACHOWANIA
--  APLIKACJI:
--
--    1. Zamraza agentow z knowledge_mode = 'all' na 'selected'
--       z imienna lista plikow, ktore czytaja DZIS.
--    2. Zdejmuje klucz obcy knowledge_files.project_id -> projects.id
--       (razem z jego "on delete cascade").
--    3. Zdejmuje "not null" z knowledge_files.project_id.
--
--  KOLUMNA project_id ZOSTAJE. Usuwa ja dopiero migracja 015, po tym
--  jak caly kod przestanie z niej korzystac. Rozdzielenie na dwa kroki
--  jest celowe: po 014 aplikacja dziala DOKLADNIE tak jak wczoraj,
--  po 015 dziala po nowemu, i nie ma miedzy nimi momentu, w ktorym
--  jest zepsuta. SQL uruchamiasz recznie, wiec taki moment trwalby
--  tyle, ile zajmuje przelaczenie okna.
--
--  JAK URUCHOMIC:
--  1. NAJPIERW zapytanie kontrolne PRZED (blok nizej) — zapisz wynik.
--  2. https://supabase.com/dashboard -> Twoj projekt -> SQL Editor -> New query
--  3. Wklej CALY ten plik -> Run
--  4. Wykonaj zapytania kontrolne PO (koniec pliku) i porownaj z punktem 1.
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--  (Krok 1 dziala tylko na wierszach 'all', a po pierwszym przebiegu
--  takich juz nie ma. Kroki 2 i 3 sprawdzaja stan przed zmiana.)
--
--  ------------------------------------------------------------
--  UWAGA: EDYTOR SQL OMIJA RLS.
--
--  Zapytania z panelu Supabase ida jako wlasciciel tabel, a wlasciciel
--  nie podlega politykom RLS. Znaczy to, ze UPDATE z kroku 1 dotknie
--  agentow WSZYSTKICH kont, nie tylko Twojego — i o to wlasnie chodzi,
--  bo zamrozic trzeba kazdego.
--
--  Ma to jednak skutek uboczny: skoro baza nie dopisuje juz warunku
--  owner_id = auth.uid(), to skorelowanie agenta z jego plikami musi
--  byc JAWNE. Dlatego podzapytanie w kroku 1 laczy nie tylko po
--  project_id, ale takze po owner_id. Bez tego drugiego warunku
--  wystarczyloby jedno przekrecone project_id w bazie, zeby agent
--  jednego konta dostal na sztywno wpisane id pliku innego konta.
--  RLS by go potem i tak nie wpuscil, ale w kolumnie zostalby smiec
--  wskazujacy na cudzy dokument. Warunek kosztuje nic i zamyka temat.
--  ------------------------------------------------------------
--
--  ------------------------------------------------------------
--  JAK TO COFNAC:
--
--    -- klucz obcy z kaskada:
--    alter table public.knowledge_files
--      add constraint knowledge_files_project_id_fkey
--      foreign key (project_id) references public.projects(id)
--      on delete cascade;
--
--    -- not null (zadziala, dopoki zaden wiersz nie ma project_id = null,
--    --           czyli dopoki nie ruszyl nowy upload):
--    alter table public.knowledge_files
--      alter column project_id set not null;
--
--  Kroku 1 (zamrozenia 'all') NIE DA SIE cofnac automatycznie — po
--  zamrozeniu nie ma jak odroznic agenta, ktory mial 'all', od agenta,
--  ktory sam zaznaczyl te same pliki. Dlatego zapytanie kontrolne PRZED
--  nie jest formalnoscia: jego wynik JEST kopia zapasowa tej informacji.
--  Cofniecie recznie: ustawic knowledge_mode = 'all' agentom z tamtej
--  listy (id agentow masz w wyniku).
--  ------------------------------------------------------------
--
--  CZEGO TA MIGRACJA NIE RUSZA:
--
--    - STORAGE. Ani jednego bajtu. Sciezka to juz <owner_id>/<...>
--      (Sesja 5, migracja 013), a polityka knowledge_wlasne_pliki
--      opiera sie o split_part(name,'/',1) i nie wie nic o projektach.
--      Po to zostala wczoraj tak napisana.
--    - RLS. Polityki na wszystkich 5 tabelach zostaja bez zmian.
--      knowledge_files nadal ma knowledge_files_wlasne na owner_id.
--    - owner_id. Jest wypelniony od migracji 007 i to on jest teraz
--      jedynym zakresem wlasnosci pliku.
--    - agents.project_id. Agenci NADAL naleza do projektow. Zmienia sie
--      wylacznie przynaleznosc PLIKOW.
-- ============================================================


-- ============================================================
--  ZAPYTANIE KONTROLNE — URUCHOM PRZED MIGRACJA, W OSOBNYM ZAPYTANIU.
--  Wynik zapisz. To jedyny slad po tym, ktory agent mial tryb 'all'.
--
--    select count(*) as agentow_w_trybie_all
--      from public.agents
--     where knowledge_mode = 'all';
--
--    select
--      a.id                                     as agent_id,
--      a.name                                   as agent,
--      a.status                                 as status_agenta,
--      p.name                                   as projekt,
--      a.owner_id,
--      jsonb_array_length(a.knowledge_file_ids) as dzis_wskazanych,
--      (select count(*)
--         from public.knowledge_files kf
--        where kf.project_id = a.project_id
--          and kf.owner_id   = a.owner_id
--          and kf.status     = 'ready')         as dostanie_po_zamrozeniu
--    from public.agents a
--    left join public.projects p on p.id = a.project_id
--    where a.knowledge_mode = 'all'
--    order by a.owner_id, p.name, a.name;
--
--  Czego sie spodziewac:
--    dzis_wskazanych        = 0  (tryb 'all' nie wskazuje plikow imiennie)
--    dostanie_po_zamrozeniu = tyle, ile gotowych plikow ma projekt agenta
--
--  BEZ filtra po a.status — archiwalnych tez trzeba zamrozic. Gdyby
--  ktorys zostal z 'all', migracja 015 (zacieszenie ograniczenia
--  knowledge_mode do 'none'/'selected') wywalilaby sie na nim, bo
--  dodanie CHECK sprawdza wiersze juz istniejace.
-- ============================================================


begin;

-- ------------------------------------------------------------
--  KROK 1 — ZAMROZENIE TRYBU 'all'
--
--  DLACZEGO W OGOLE:
--
--  Dzis 'all' znaczy "wszystkie gotowe pliki TEGO PROJEKTU"
--  (lib/agent/knowledgeForAgent.js: filtr .eq("project_id", ...)).
--  Po odpieciu plikow od projektow to samo slowo zaczelo by znaczyc
--  "wszystkie pliki KONTA" — i agent, ktory wczoraj czytal dwa
--  dokumenty, jutro dostawalby do promptu cala baze wiedzy, rosnaca
--  przy kazdym uploadzie. Zmiana zachowania bez dotkniecia agenta,
--  bez bledu, bez sladu w UI.
--
--  Drugi powod jest rownie wazny: agent w trybie 'all' ma PUSTE
--  knowledge_file_ids, a czyta wszystko. Nowa zakladka "Baza wiedzy"
--  ma pokazywac przy pliku, ktorzy agenci go uzywaja — i liczy to
--  wlasnie z knowledge_file_ids. Dopoki istnieje 'all', ta odpowiedz
--  jest KLAMSTWEM: magazyn napisalby "nie uzywa go nikt" o pliku,
--  ktory czyta pieciu agentow, a modal kasowania zaprosilby do
--  usuniecia go im wszystkim. Cala ochrona przy kasowaniu stoi na tym,
--  ze ten licznik mowi prawde.
--
--  CO ROBIMY: zamieniamy "wszystkie pliki projektu" na imienna liste
--  tych samych plikow. Zachowanie agenta po migracji jest IDENTYCZNE
--  co do pliku — zmienia sie tylko to, ze lista przestaje sie sama
--  rozszerzac.
--
--  status = 'ready' — bo dokladnie tak filtruje dzis knowledgeForAgent.js
--  (linia 34). Pliki 'no_text' i 'error' nie trafiaja do promptu ani
--  teraz, ani potem, a wpisane do listy bylyby duchami: sekcja w kreatorze
--  rysuje checkbox tylko dla plikow 'ready', wiec takiego id nie dalo by
--  sie odznaczyc z UI.
--
--  order by created_at — ta sama kolejnosc, w jakiej pliki trafiaja
--  dzis do promptu (knowledgeForAgent.js, linia 35). Kolejnosc w prompcie
--  wplywa na odpowiedzi modelu, wiec nie jest kosmetyczna.
--
--  coalesce(..., '[]') — agent w pustym projekcie dostaje pusta tablice,
--  a nie null. Ograniczenie agents_knowledge_file_ids_is_array (migracja
--  004) wymaga tablicy; null by je zlamal i przewrocil cala migracje.
--
--  UBOCZNIE: trigger agents_set_updated_at podniesie updated_at kazdemu
--  zamrozonemu agentowi, wiec na liscie agentow w projekcie (sortowanej
--  malejaco po updated_at) przeskocza na gore. Nic poza kolejnoscia
--  wyswietlania sie nie zmienia.
-- ------------------------------------------------------------
update public.agents a
   set knowledge_file_ids = coalesce(
         (select jsonb_agg(kf.id order by kf.created_at)
            from public.knowledge_files kf
           where kf.project_id = a.project_id
             and kf.owner_id   = a.owner_id      -- patrz naglowek: edytor omija RLS
             and kf.status     = 'ready'),
         '[]'::jsonb
       ),
       knowledge_mode = 'selected'
 where a.knowledge_mode = 'all';


-- ------------------------------------------------------------
--  KROK 2 — ZDJECIE KLUCZA OBCEGO project_id -> projects(id)
--
--  TO JEST NAJWAZNIEJSZA LINIJKA TEJ MIGRACJI.
--
--  Migracja 004 zalozyla kolumne tak:
--
--    project_id uuid not null
--      references public.projects(id) on delete cascade
--
--  Ta kaskada dziala W BAZIE, nie w kodzie. Gdybysmy zostawili
--  project_id "jako martwa kolumne" i tylko usuneli z aplikacji
--  wywolanie deleteProjectKnowledge(), to skasowanie projektu NADAL
--  kasowaloby wiersze knowledge_files — systemowo, z pominieciem
--  polityk RLS, bez jednego wiersza kodu, ktory dalo by sie o to
--  obwinic. A poniewaz kaskada SQL nie siega do Storage, obiekty
--  zostalyby w buckecie jako sieroty: nie do wyswietlenia (nie ma
--  wiersza) i nie do usuniecia z poziomu aplikacji.
--
--  Czyli: kolumna "martwa" z aktywnym on delete cascade to kolumna
--  UZBROJONA. Zdejmujemy zeby, kolumne zabieramy w 015.
--
--  Nazwy ograniczenia NIE wpisujemy na sztywno (konwencjonalna to
--  knowledge_files_project_id_fkey, ale nazwa nadana automatycznie
--  nie jest niczym gwarantowanym). Szukamy po tym, czym ograniczenie
--  JEST: klucz obcy z knowledge_files do projects.
--
--  Petla, a nie "select into": obsluguje zarowno zero takich kluczy
--  (drugie uruchomienie skryptu — nie robi nic), jak i teoretyczne kilka.
-- ------------------------------------------------------------
do $$
declare
  fk record;
begin
  for fk in
    select conname
      from pg_constraint
     where conrelid  = 'public.knowledge_files'::regclass
       and contype   = 'f'
       and confrelid = 'public.projects'::regclass
  loop
    execute format(
      'alter table public.knowledge_files drop constraint %I',
      fk.conname
    );
    raise notice 'Zdjeto klucz obcy: %', fk.conname;
  end loop;
end $$;


-- ------------------------------------------------------------
--  KROK 3 — ZDJECIE "not null" Z project_id
--
--  Od Etapu B upload przestanie wypelniac te kolumne. Gdyby zostala
--  obowiazkowa, kazdy nowy plik konczylby sie bledem zapisu — i to
--  bledem widocznym dopiero po wgraniu pliku do Storage, czyli
--  zostawiajacym po sobie smiec (trasa uploadu sprzata po sobie
--  w takim wypadku, ale nie ma powodu tego wywolywac).
--
--  Wartosci w istniejacych wierszach ZOSTAJA nietkniete. Sa jeszcze
--  potrzebne: to z nich Etap A wyliczyl liste w kroku 1, a gdyby
--  cos poszlo nie tak, sa jedynym zapisem tego, ktory plik lezal
--  w ktorym projekcie.
-- ------------------------------------------------------------
alter table public.knowledge_files
  alter column project_id drop not null;

commit;


-- ============================================================
--  KONTROLA PO MIGRACJI — uruchom w osobnym zapytaniu.
--
--  A) Nie zostal ani jeden agent w trybie 'all'. Oczekiwane: 0.
--
--     select count(*) as zostalo_w_trybie_all
--       from public.agents
--      where knowledge_mode = 'all';
--
--  B) Zamrozeni agenci maja tyle plikow, ile zapowiadala kolumna
--     "dostanie_po_zamrozeniu" z zapytania PRZED. Porownaj wiersz
--     w wiersz z zapisanym wynikiem.
--
--     select
--       a.name                                   as agent,
--       p.name                                   as projekt,
--       a.knowledge_mode,
--       jsonb_array_length(a.knowledge_file_ids) as wskazanych
--     from public.agents a
--     left join public.projects p on p.id = a.project_id
--     where a.knowledge_mode = 'selected'
--     order by a.owner_id, p.name, a.name;
--
--  C) Klucza obcego juz nie ma. Oczekiwane: brak wierszy.
--
--     select conname
--       from pg_constraint
--      where conrelid  = 'public.knowledge_files'::regclass
--        and contype   = 'f'
--        and confrelid = 'public.projects'::regclass;
--
--  D) project_id jest nullable. Oczekiwane: is_nullable = YES.
--
--     select column_name, is_nullable, data_type
--       from information_schema.columns
--      where table_schema = 'public'
--        and table_name   = 'knowledge_files'
--        and column_name  = 'project_id';
--
--  E) IZOLACJA NIETKNIETA — po kazdej zmianie schematu, zgodnie
--     z zasada z Sesji 5. Oczekiwane: 5 tabel, rowsecurity = true,
--     przy kazdej polityka <tabela>_wlasne dla {authenticated}.
--
--     select t.tablename, t.rowsecurity, p.policyname, p.roles
--       from pg_tables t
--       left join pg_policies p
--         on p.schemaname = t.schemaname and p.tablename = t.tablename
--      where t.schemaname = 'public'
--        and t.tablename in ('projects','agents','knowledge_files',
--                            'conversations','messages')
--      order by t.tablename;
--
--  F) Storage bez zmian. Oczekiwane: dokladnie jedna polityka
--     knowledge_wlasne_pliki, {authenticated}.
--
--     select policyname, roles, cmd
--       from pg_policies
--      where schemaname = 'storage' and tablename = 'objects';
--
--  ------------------------------------------------------------
--  TEST W APLIKACJI (po migracji, na koncie glownym):
--
--    1. Otworz agenta, ktory byl w trybie "Wszystkie pliki".
--       Karta "Baza wiedzy" ma teraz pokazywac "Wybrane pliki"
--       z ODHACZONYMI tymi samymi dokumentami co wczoraj.
--    2. "Podglad promptu" (karta Test agenta) — tresc plikow w prompcie
--       ma byc TA SAMA, w tej samej kolejnosci.
--    3. Wgraj nowy plik w tym projekcie. Ma sie pojawic NIEZAZNACZONY —
--       to jest cala roznica, ktora wprowadza ta migracja.
--    4. Konto testowe: nadal widzi wylacznie swoje pliki i swoich agentow.
-- ============================================================
