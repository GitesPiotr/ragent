-- ============================================================
--  AIdeas — migracja 012: RLS na tabeli messages
--  Sesja 4 tematu logowanie/konta/RLS, krok 5 z 5 — OSTATNIA TABELA.
--
--  CO ROBI: wlacza izolacje danych na tabeli messages i tym samym domyka
--  polowiczna izolacje czatow z migracji 011.
--
--  DZIURA, KTORA TO ZAMYKA: listMessages() (conversations.js:154-166)
--  filtruje wylacznie po conversation_id. Po migracji 011 konto testowe
--  nie moglo juz WYPISAC cudzych rozmow, ale znajac identyfikator jednej
--  z nich moglo wyciagnac jej TRESC. Od tej migracji baza dopisuje do tego
--  zapytania warunek owner_id = auth.uid() i identyfikator rozmowy
--  przestaje byc kluczem do czegokolwiek.
--
--  Po tej migracji wszystkie 5 tabel ma RLS wlaczony i jednakowa polityke.
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. SQL Editor -> New query
--  3. Wklej CALY plik -> Run
--  4. Wykonaj TEST z konca pliku, lacznie z punktem D — to on domyka
--     dowod izolacji czatow.
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--
--  ------------------------------------------------------------
--  JAK TO COFNAC:
--
--      alter table public.messages disable row level security;
-- ============================================================

begin;

-- ------------------------------------------------------------
--  POLITYKA — ten sam ksztalt co w migracjach 008-011.
--
--  Filtrujemy po messages.owner_id, a NIE przez rozmowe nadrzedna
--  (np. przez exists(...) na conversations). Powody:
--    - kazda wiadomosc ma wlasne owner_id z migracji 007, wiec warunek
--      jest bezposredni i korzysta z indeksu messages_owner_id_idx,
--    - warunek przez rozmowe nadrzedna oznaczalby, ze niewidoczna
--      rozmowa po cichu zabiera ze soba wiadomosci — dokladnie ten rodzaj
--      kaskadowej cichej awarii, ktorego unikamy w calej tej sesji,
--    - wszystkie 5 tabel ma dzieki temu IDENTYCZNA polityke.
--
--  addMessage() (conversations.js:169-184) wstawia tylko conversation_id,
--  role i content — owner_id wypelnia default auth.uid() z migracji 007,
--  wiec zapis przechodzi przez "with check" bez zmian w kodzie.
--
--  KASOWANIE ROZMOWY dziala dalej: ON DELETE CASCADE z migracji 005
--  jest akcja referencyjna wykonywana systemowo i polityki RLS jej nie
--  dotycza — skasowanie rozmowy zabiera jej wiadomosci tak jak dotad.
-- ------------------------------------------------------------
drop policy if exists "messages_wlasne" on public.messages;

create policy "messages_wlasne"
  on public.messages
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

alter table public.messages enable row level security;

commit;

-- ============================================================
--  KONTROLA STANU — CALEJ SESJI (uruchom osobno, w nowym zapytaniu):
--
--  select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('projects','agents','knowledge_files',
--                       'conversations','messages')
--   order by tablename;
--  -- WSZYSTKIE PIEC: rowsecurity = true
--
--  select tablename, policyname, cmd, roles from pg_policies
--   where schemaname = 'public'
--     and tablename in ('projects','agents','knowledge_files',
--                       'conversations','messages')
--   order by tablename;
--  -- PIEC wierszy, kazdy: ALL / {authenticated}
--  -- Gdyby ktorys mial {anon,authenticated} albo cmd inny niz ALL —
--  -- to znaczy, ze zostal po starszej probie i trzeba go poprawic.
-- ============================================================

-- ============================================================
--  TEST W APLIKACJI
--  Zloty zrzut: 4 wiadomosci — 2 rozmowy po 1 pytaniu i 1 odpowiedzi.
--
--  A) KONTO GLOWNE — CZYTANIE
--     1. /czaty -> otworz OBIE rozmowy po kolei. W kazdej maja byc
--        2 wiadomosci: Twoje pytanie i odpowiedz.
--        Rozmowa z pustym oknem = awaria (naglowek rozmowy przyjdzie
--        z conversations, ale tresc z messages juz nie).
--     2. Odswiez strone (F5) i otworz rozmowe ponownie — wiadomosci
--        nadal sa. To odroznia dane wczytane z bazy od tych, ktore
--        zostaly w pamieci Reacta.
--
--  B) KONTO GLOWNE — ZAPIS
--     3. Wyslij nowa wiadomosc w istniejacej rozmowie -> odpowiedz
--        przychodzi. Odswiez strone -> OBIE nowe wiadomosci (Twoja
--        i agenta) sa na miejscu. To test with check dla obu rol.
--     4. Zaloz nowa rozmowe, napisz w niej cokolwiek, potem ja usun ->
--        znika razem z wiadomosciami (ON DELETE CASCADE).
--
--  C) SIEC
--     5. DevTools -> Network -> /rest/v1/messages:
--        status 200 I NIEPUSTA tablica.
--
--  D) DOMKNIECIE DOWODU IZOLACJI CZATOW — punkt obowiazkowy
--
--     To ten sam blok, ktory po migracji 011 pokazywal "wiadomosci > 0".
--     Teraz ma pokazac ZERO. Uruchom w SQL Editorze jako JEDNO polecenie
--     (caly blok wraz ze srednikiem), podstawiajac identyfikator jednej
--     ze swoich rozmow z konta glownego:
--
--       do $$
--       declare
--         v_conv uuid := 'TU-WKLEJ-ID-ROZMOWY-KONTA-GLOWNEGO';
--         n_conv int; n_msg int;
--       begin
--         perform set_config('request.jwt.claims',
--           '{"sub":"576c2ccc-c7a5-4eb2-8e02-fa78154c76c5","role":"authenticated"}', true);
--         perform set_config('role', 'authenticated', true);
--
--         raise notice 'Wcielam sie w: current_user=%, auth.uid()=%',
--           current_user, auth.uid();
--         if auth.uid() is null then
--           raise exception 'Podstawienie tozsamosci nie zadzialalo — test jest niewazny.';
--         end if;
--
--         select count(*) into n_conv from public.conversations where id = v_conv;
--         select count(*) into n_msg  from public.messages where conversation_id = v_conv;
--         raise notice 'Konto testowe widzi: rozmow=%, wiadomosci=% (obie liczby maja byc 0).',
--           n_conv, n_msg;
--
--         if n_conv <> 0 or n_msg <> 0 then
--           raise exception 'IZOLACJA CZATOW NIEPELNA: rozmow=%, wiadomosci=%.', n_conv, n_msg;
--         end if;
--       end $$;
--
--     OCZEKIWANY WYNIK: rozmow=0, wiadomosci=0, bez wyjatku.
--     Porownaj z wynikiem sprzed tej migracji — wtedy wiadomosci bylo > 0.
--
--  E) KONTO TESTOWE — normalna praca na wlasnych danych
--     6. Zaloguj sie na konto testowe, zaloz rozmowe i wyslij wiadomosc.
--        Ma dzialac bez zarzutu — izolacja ma odcinac cudze dane,
--        a nie psuc wlasne.
--     7. /czaty pokazuje wylacznie jego wlasne rozmowy.
--
--  F) PRZEJSCIE KONTROLNE PO CALEJ SESJI (konto glowne)
--     8. Projekty -> 2 aktywne. Wejscie w projekt -> agent widoczny.
--     9. Kreator agenta -> persona, model, temperatura, „Baza wiedzy”
--        z 2 plikami.
--    10. Test agenta / podglad promptu -> sekcja „Kontekst wiedzy” obecna.
--    11. /czaty -> 2 rozmowy, obie z pelna historia.
--    12. Ustawienia -> Diagnostyka -> „Konto (sesja na serwerze)” zielone.
-- ============================================================
