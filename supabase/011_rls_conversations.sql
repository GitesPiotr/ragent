-- ============================================================
--  AIdeas — migracja 011: RLS na tabeli conversations
--  Sesja 4 tematu logowanie/konta/RLS, krok 4 z 5.
--
--  CO ROBI: wlacza izolacje danych na tabeli conversations. To ta tabela,
--  przez ktora konto testowe do tej pory widzialo cudze czaty — po tej
--  migracji lista rozmow staje sie prywatna.
--
--  listConversations() w lib/data/conversations.js:13-24 to jedyne
--  zapytanie w calej warstwie danych BEZ ZADNEGO filtra WHERE — pobiera
--  po prostu wszystkie rozmowy i sortuje. Do dzis dzialalo to poprawnie
--  tylko dlatego, ze konto bylo jedno. Od tej migracji filtr dopisuje baza.
--
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. SQL Editor -> New query
--  3. Wklej CALY plik -> Run
--  4. Wykonaj TEST z konca pliku.
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--
--  ------------------------------------------------------------
--  JAK TO COFNAC:
--
--      alter table public.conversations disable row level security;
--
--  ------------------------------------------------------------
--  UWAGA: PO TEJ MIGRACJI IZOLACJA CZATOW JEST DOPIERO POLOWICZNA.
--
--  Tabela messages ma RLS nadal WYLACZONY (krok 5, migracja 012).
--  Znaczy to, ze konto testowe nie moze juz WYPISAC Twoich rozmow, ale
--  gdyby poznalo identyfikator konkretnej rozmowy, to listMessages()
--  (conversations.js:154-166) filtruje wylacznie po conversation_id
--  i oddaloby TRESC wiadomosci.
--
--  To nie jest niedopatrzenie, tylko cena rozbicia na kroki: kazdy krok
--  ma byc osobno testowalny. Punkt D na koncu pliku pozwala zobaczyc te
--  dziure na wlasne oczy — a migracja 012 ja zamyka. Nie konczymy sesji
--  na tym kroku.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  POLITYKA — ten sam ksztalt co w migracjach 008, 009 i 010.
--
--  Uwaga na asymetrie objawow przy tej tabeli:
--    ODCZYT  (listConversations)  -> zla polityka daje PUSTA LISTE, bez bledu,
--    ZAPIS   (update ... .single()) -> zla polityka daje GLOSNY blad,
--            bo PostgREST przy .single() i zerowej liczbie trafien zwraca
--            PGRST116, ktore throwIfError zamienia na komunikat w UI.
--  Dlatego test ponizej sprawdza osobno czytanie i osobno zapisywanie.
-- ------------------------------------------------------------
drop policy if exists "conversations_wlasne" on public.conversations;

create policy "conversations_wlasne"
  on public.conversations
  for all
  to authenticated
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

alter table public.conversations enable row level security;

commit;

-- ============================================================
--  KONTROLA STANU (uruchom osobno, w nowym zapytaniu):
--
--  select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('projects','agents','knowledge_files',
--                       'conversations','messages');
--  -- cztery pierwsze: true, messages: FALSE (to krok 5)
-- ============================================================

-- ============================================================
--  TEST W APLIKACJI
--  Zloty zrzut: 2 rozmowy, w kazdej 1 pytanie + 1 odpowiedz.
--
--  A) KONTO GLOWNE — CZYTANIE
--     1. /czaty -> na liscie 2 rozmowy. Przypiete (jesli sa) na gorze.
--        Pusta lista = awaria.
--     2. Otworz rozmowe -> naglowek pokazuje rozmowce (agent albo model),
--        historia wiadomosci jest na miejscu.
--
--  B) KONTO GLOWNE — ZAPIS
--     3. Przypnij rozmowe i odepnij -> wskakuje na gore i wraca.
--     4. Nowa rozmowa -> tworzy sie i pojawia na liscie (with check).
--     5. Zmien tytul rozmowy -> zapisuje sie.
--     6. Zmien rozmowce w trakcie rozmowy -> zmienia sie, a historia
--        wiadomosci ZOSTAJE nietknieta.
--     7. Wyslij wiadomosc w istniejacej rozmowie -> odpowiedz przychodzi,
--        a rozmowa wskakuje na gore listy (to dowod, ze touchConversation
--        przeszlo — czyli UPDATE na wlasnym wierszu dziala).
--     8. Usun rozmowe testowa -> znika.
--
--  C) SIEC
--     9. DevTools -> Network -> /rest/v1/conversations:
--        status 200 I NIEPUSTA tablica.
--
--  D) KONTO TESTOWE — dowod izolacji (tu bedzie najbardziej oczywisty)
--    10. Wyloguj sie, zaloguj na konto testowe.
--    11. /czaty -> lista rozmow MA BYC PUSTA. Do tej migracji byly tam
--        widoczne rozmowy konta glownego.
--    12. Zaloz rozmowe na koncie testowym -> widoczna tylko tam.
--    13. Wroc na konto glowne -> Twoje rozmowy nadal sa.
--
--  D-BIS) NIEOBOWIAZKOWO: zobacz na wlasne oczy dziure, ktora zamknie krok 5.
--
--     Ten test pokazuje, dlaczego nie konczymy sesji na conversations.
--     Uruchom go w SQL Editorze jako JEDNO polecenie (caly blok do $$ ... $$
--     wlacznie ze srednikiem). Musi byc jednym poleceniem, bo Editor
--     zatwierdza kazde osobno, a podstawienie tozsamosci zyje tylko
--     w obrebie jednej transakcji.
--
--     Podstaw ponizej identyfikator jednej ze swoich rozmow z konta
--     glownego (skopiuj z tabeli conversations albo z adresu w aplikacji).
--
--       do $$
--       declare
--         v_conv uuid := 'TU-WKLEJ-ID-ROZMOWY-KONTA-GLOWNEGO';
--         n int;
--       begin
--         perform set_config('request.jwt.claims',
--           '{"sub":"576c2ccc-c7a5-4eb2-8e02-fa78154c76c5","role":"authenticated"}', true);
--         perform set_config('role', 'authenticated', true);
--
--         -- Kontrola, czy podstawienie tozsamosci w ogole zadzialalo.
--         -- Bez tego wynik "0" nie znaczylby nic — moglby oznaczac
--         -- brak izolacji rownie dobrze co nieudana probe.
--         raise notice 'Wcielam sie w: current_user=%, auth.uid()=%',
--           current_user, auth.uid();
--         if auth.uid() is null then
--           raise exception 'Podstawienie tozsamosci nie zadzialalo — test jest niewazny.';
--         end if;
--
--         select count(*) into n from public.conversations where id = v_conv;
--         raise notice 'Konto testowe widzi % TAKICH ROZMOW (ma byc 0 — to juz dziala).', n;
--
--         select count(*) into n from public.messages where conversation_id = v_conv;
--         raise notice 'Konto testowe widzi % WIADOMOSCI tej rozmowy (teraz > 0 — to ta dziura).', n;
--       end $$;
--
--     OCZEKIWANY WYNIK TERAZ (po migracji 011, przed 012):
--       rozmow: 0        <- izolacja naglowkow dziala
--       wiadomosci: > 0  <- tresc nadal do wziecia, jesli zna sie id rozmowy
--
--     PO MIGRACJI 012 ten sam blok ma pokazac wiadomosci: 0.
--     Wtedy izolacja czatow bedzie pelna.
-- ============================================================
