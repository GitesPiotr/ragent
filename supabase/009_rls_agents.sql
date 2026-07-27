-- ============================================================
--  AIdeas — migracja 009: RLS na tabeli agents
--  Sesja 4 tematu logowanie/konta/RLS, krok 2 z 5.
--
--  CO ROBI: wlacza izolacje danych na tabeli agents. Od tej chwili kazde
--  zapytanie z aplikacji widzi WYLACZNIE agentow, ktorych owner_id rowna
--  sie id zalogowanego uzytkownika.
--
--  Polityka jest DOKLADNIE tego samego kształtu co w migracji 008
--  (projects). Piec identycznych polityk na piec tabel jest w utrzymaniu
--  latwiejsze niz piec wariantow — jesli kiedys trzeba bedzie zmienic
--  regule, zmienia sie ja w pieciu tych samych miejscach.
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. SQL Editor -> New query
--  3. Wklej CALY plik -> Run
--  4. Przejdz do aplikacji i wykonaj TEST z konca tego pliku.
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--
--  ------------------------------------------------------------
--  JAK TO COFNAC (gdyby agenci przestali byc widoczni):
--
--      alter table public.agents disable row level security;
--
--  Jedna linijka, natychmiastowa, nie rusza ZADNYCH danych. Polityka
--  zostaje w bazie, tylko przestaje obowiazywac.
--
--  ------------------------------------------------------------
--  UWAGA NA METODE: w Supabase SQL Editorze NIE DA SIE zrobic proby na
--  sucho. Editor wykonuje polecenia pojedynczo i sam je zatwierdza, wiec
--  begin/rollback rozpisane na caly plik niczego nie cofnie (sprawdzone
--  na migracji 008). Jedyna wiarygodna weryfikacja to test w aplikacji
--  na dwoch kontach — patrz koniec pliku.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  POLITYKA
--
--  "for all" — jedna regula na select, insert, update i delete.
--  "to authenticated" — rola anon (niezalogowany) nie dostaje nic.
--
--  "using" vs "with check":
--    using      = ktore z ISTNIEJACYCH wierszy widze i mam prawo ruszyc
--                 (select, update, delete),
--    with check = jaki wiersz wolno mi ZOSTAWIC W BAZIE
--                 (insert oraz wynik update).
--
--  Zapisy z aplikacji dzialaja bez zmian w kodzie, bo migracja 007
--  ustawila agents.owner_id default auth.uid() — nowy agent sam dostaje
--  wlasciciela zgodnego z tym warunkiem.
--
--  CZEGO TA POLITYKA CELOWO NIE ROBI: nie sprawdza, czy agent.project_id
--  wskazuje na TWOJ projekt. Klucze obce Postgres sprawdza systemowo,
--  z pominieciem RLS, wiec da sie utworzyc wlasnego agenta wskazujacego
--  na cudzy projekt. Danych to nie ujawnia (zeby takiego agenta zobaczyc,
--  trzeba by wejsc w cudzy projekt, a ten jest niewidoczny od migracji
--  008) — to zasmiecenie, nie wyciek. Jawne bariery na project_id
--  przysylany przez klienta zakladamy w Etapie 4, w trasach serwerowych,
--  gdzie sa tanie i czytelne. Dokladanie tego warunku do klauzuli "using"
--  bylo by wrecz szkodliwe: agent znikalby po cichu za kazdym razem, gdy
--  jego projekt jest chwilowo niewidoczny.
-- ------------------------------------------------------------
drop policy if exists "agents_wlasne" on public.agents;

create policy "agents_wlasne"
  on public.agents
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ------------------------------------------------------------
--  WLACZENIE RLS
--
--  Kolejnosc (polityka -> enable) w jednej transakcji jest celowa.
--  Tabela z wlaczonym RLS i bez polityki odrzuca wszystko.
-- ------------------------------------------------------------
alter table public.agents enable row level security;

commit;

-- ============================================================
--  KONTROLA STANU (uruchom osobno, w nowym zapytaniu):
--
--  select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename in ('projects','agents');
--  -- oba: rowsecurity = true
--
--  select tablename, policyname, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename in ('projects','agents');
--  -- dwa wiersze: projects_wlasne i agents_wlasne, oba ALL / {authenticated}
-- ============================================================

-- ============================================================
--  TEST W APLIKACJI — jedyna wiarygodna weryfikacja tej migracji.
--  Zloty zrzut: 1 agent w bazie, aktywny.
--
--  A) KONTO GLOWNE (pit321@op.pl) — CZYTANIE
--     1. /projekty -> wejdz w projekt -> lista pokazuje 1 agenta.
--     2. Otworz kreator tego agenta -> persona, zasady, Q&A, model
--        i temperatura MUSZA byc wypelnione. Pusty kreator znaczy, ze
--        getAgent() zwrocil null — czyli awaria, nie "nowy agent".
--     3. /czaty -> nowa rozmowa -> wybor rozmowcy: agent jest na liscie,
--        pogrupowany pod swoim projektem.
--        TO JEST NAJCZULSZY PUNKT: listActiveAgents() to jedyne zapytanie
--        do tabeli agents BEZ filtra project_id, a RunnerPicker.js:80-82
--        lyka wyjatek i pokazuje pusta liste. Pusto = awaria bez komunikatu.
--
--  B) KONTO GLOWNE — ZAPIS (klauzula with check)
--     4. W kreatorze zmien jedno zdanie w personie -> Zapisz -> odswiez
--        strone -> zmiana jest na miejscu.
--     5. Dodaj nowego agenta w projekcie -> tworzy sie i od razu widac.
--     6. Zarchiwizuj tego nowego agenta -> znika z listy; przywroc -> wraca.
--
--  C) LICZNIK ZAWARTOSCI PROJEKTU — ostroznie, patrz ostrzezenie
--     7. Dodaj jednego agenta do projektu "test2" (tego z kroku 1 sesji),
--        potem kliknij "Usun projekt" na test2.
--        MA sie pojawic okno potwierdzenia z informacja o 1 agencie.
--        JESLI PROJEKT ZNIKNIE BEZ PYTANIA — RLS na agents nie dziala.
--        Powod: app/projekty/page.js:233 przy zerowych licznikach kasuje
--        projekt OD RAZU, bez modala. Cicha awaria RLS zamienia sie tam
--        w ciche usuniecie danych. Dlatego test robimy na projekcie
--        jednorazowym, nie na prawdziwym.
--
--  D) SIEC
--     8. DevTools -> Network -> zapytanie do /rest/v1/agents:
--        status 200 I NIEPUSTA tablica w odpowiedzi.
--
--  E) KONTO TESTOWE (saturnenergia@gmail.com) — dowod izolacji
--     9. Wyloguj sie, zaloguj na konto testowe.
--    10. /czaty -> nowa rozmowa -> wybor rozmowcy: lista MA BYC PUSTA
--        (zaden agent konta glownego nie moze sie tam pokazac).
--    11. Wroc na konto glowne i sprawdz, ze agent nadal jest.
-- ============================================================
