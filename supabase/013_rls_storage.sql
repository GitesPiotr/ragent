-- ============================================================
--  AIdeas — migracja 013: izolacja plikow w Storage (bucket "knowledge")
--  Sesja 5 tematu logowanie/konta/RLS, Etap D — ostatni element izolacji.
--
--  CO ROBI: usuwa stara, OTWARTA polityke bucketu i zastepuje ja polityka
--  na wlasciciela. Od tej chwili konto ma dostep wylacznie do plikow
--  lezacych w jego wlasnym folderze.
--
--  ------------------------------------------------------------
--  !!! WARUNEK KONIECZNY PRZED URUCHOMIENIEM !!!
--
--  WSZYSTKIE obiekty w buckecie musza juz lezec pod <owner_id>/<nazwa>.
--  Sprawdz to zapytaniem kontrolnym z konca tego pliku — kolumna
--  schemat_sciezki ma pokazywac wylacznie "NOWY".
--
--  Plik, ktory zostanie pod stara sciezka <project_id>/<nazwa>, w chwili
--  uruchomienia tego skryptu stanie sie dla swojego wlasciciela
--  NIEWIDOCZNY i NIEKASOWALNY — trwala sierota w buckecie, ktorej nie da
--  sie usunac z poziomu aplikacji.
--
--  Migracje sciezek robi trasa /api/dev/migrate-storage-paths,
--  uruchamiana RAZ NA KAZDYM KONCIE (widzi tylko wlasne wiersze).
--
--  ------------------------------------------------------------
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. SQL Editor -> New query
--  3. Wklej CALY plik -> Run
--  4. Wykonaj TEST z konca pliku — punktu D nie pomijaj.
--
--  Skrypt jest idempotentny — mozna go uruchomic ponownie bez szkody.
--
--  ------------------------------------------------------------
--  JAK TO COFNAC (odtworzenie stanu sprzed migracji):
--
--      drop policy if exists "knowledge_wlasne_pliki" on storage.objects;
--
--      create policy "aideas_knowledge_all" on storage.objects
--        for all
--        to anon, authenticated
--        using      (bucket_id = 'knowledge')
--        with check (bucket_id = 'knowledge');
--
--  To jest DOKLADNA tresc starej polityki z migracji 004. Cofniecie nie
--  rusza ani jednego pliku — polityki dotycza wylacznie dostepu.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  1) USUNIECIE STAREJ POLITYKI
--
--  aideas_knowledge_all pochodzi z migracji 004 i byla swiadomie otwarta:
--  "for all, to anon + authenticated, using (bucket_id = 'knowledge')".
--  Zaden warunek nie dotyczyl wlasciciela — kazdy, kto znal sciezke,
--  mial dostep do kazdego pliku, lacznie z niezalogowanymi (anon).
--
--  Nie wystarczy dolozyc nowej polityki obok. Polityki PERMISSIVE lacza
--  sie przez OR, wiec dopoki stara istnieje, nowa niczego nie ogranicza.
-- ------------------------------------------------------------
drop policy if exists "aideas_knowledge_all" on storage.objects;

-- ------------------------------------------------------------
--  2) NOWA POLITYKA — na wlasciciela, przez sciezke
--
--  Sciezka obiektu to <owner_id>/<timestamp>-<nazwa>, wiec pierwszy segment
--  JEST identyfikatorem wlasciciela. Polityka porownuje go z auth.uid().
--
--  DLACZEGO PRZEZ SCIEZKE, A NIE PRZEZ TABELE:
--    - polityka nie zaglada do zadnej tabeli, wiec przezyje planowany
--      refaktor bazy wiedzy na magazyn KONTA (pliki przestana byc
--      przypisane do projektu) bez jednej zmiany,
--    - oparcie o knowledge_files nie mialoby sie o co oprzec przy zapisie:
--      plik laduje w Storage ZANIM powstanie wiersz w bazie
--      (app/api/knowledge/upload/route.js — najpierw upload, potem insert).
--
--  DLACZEGO NIE storage.objects.owner_id:
--    ta kolumna istnieje, ale wypelnia ja usluga Storage z tokenu w chwili
--    wgrania. Dla plikow wgranych przed wprowadzeniem logowania bywa pusta.
--    Sciezka jest jawna, widac ja w panelu i nie zalezy od tego, jak plik
--    trafil do bucketu.
--
--  DLACZEGO split_part, A NIE RZUTOWANIE NA uuid:
--    porownujemy tekst z tekstem. Gdyby w buckecie znalazl sie obiekt
--    o sciezce, ktora nie jest UUID-em, "::uuid" wysypaloby CALE zapytanie
--    bledem, zamiast po prostu nie dopasowac wiersza.
--    (Rownowazny zapis w dokumentacji Supabase: (storage.foldername(name))[1].)
--
--  "to authenticated" — anon wypada calkowicie. Sprawdzone: w calym kodzie
--  nie ma ani jednego wywolania Storage poza sesja uzytkownika.
-- ------------------------------------------------------------
create policy "knowledge_wlasne_pliki"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'knowledge'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'knowledge'
    and split_part(name, '/', 1) = auth.uid()::text
  );

commit;

-- ============================================================
--  ZAPYTANIE KONTROLNE — uruchom PRZED migracja (warunek konieczny)
--  ORAZ po niej. Przed migracja kolumna schemat_sciezki ma pokazywac
--  wylacznie "NOWY". Jesli pokaze cokolwiek innego, NIE URUCHAMIAJ tego
--  skryptu, tylko dokoncz migracje sciezek.
--
--  select
--    o.name as sciezka,
--    case
--      when split_part(o.name, '/', 1) in (
--        select id::text from auth.users
--      ) then 'NOWY - folder konta'
--      else 'STARY - NIE URUCHAMIAJ 013'
--    end as schemat_sciezki,
--    kf.id as wiersz_id,
--    kf.file_name
--  from storage.objects o
--  left join public.knowledge_files kf on kf.file_path = o.name
--  where o.bucket_id = 'knowledge'
--  order by schemat_sciezki, sciezka;
--
--  KONTROLA POLITYK PO MIGRACJI:
--
--  select policyname, cmd, roles, qual, with_check
--    from pg_policies
--   where schemaname = 'storage' and tablename = 'objects';
--  -- DOKLADNIE JEDEN wiersz: knowledge_wlasne_pliki / ALL / {authenticated}
--  -- Ani sladu aideas_knowledge_all. Gdyby sie pojawila — ktos uruchomil
--  -- ponownie 004_knowledge.sql; patrz adnotacja w tamtym pliku.
-- ============================================================

-- ============================================================
--  TEST
--
--  A) KONTO GLOWNE — normalna praca na wlasnych plikach
--     1. Kreator -> „Baza wiedzy”: dotychczasowe pliki nadal na liscie.
--     2. Wgraj nowy plik .txt -> status „gotowy”.
--     3. Usun go -> znika z listy ORAZ z bucketu (sprawdz w panelu
--        Storage, nie tylko w aplikacji — to dwie rozne rzeczy).
--
--  B) KASOWANIE PROJEKTU Z PLIKIEM — na projekcie JEDNORAZOWYM
--     4. Zaloz projekt, dodaj agenta, wgraj do niego plik.
--     5. „Usun projekt” -> modal wymienia 1 plik -> potwierdz.
--     6. Panel Storage: obiektu NIE MA. Gdyby zostal, to sierota —
--        polityka odmowila kasowania i trzeba cofnac migracje.
--
--  C) KONTO TESTOWE — wlasne pliki dzialaja
--     7. Zaloguj sie na konto testowe, wgraj plik, potem go usun.
--        Izolacja ma odcinac cudze pliki, a nie psuc wlasne.
--
--  D) TEST IZOLACJI — punkt obowiazkowy, z proba kontrolna
--     Szczegoly i gotowe snippety sa w odpowiedzi asystenta do Etapu D.
--     Zasada ta sama co przy pulapce nr 1: NAJPIERW wlasny plik (musi sie
--     udac), POTEM cudzy (musi odmowic). Bez proby kontrolnej odmowa
--     nie dowodzi niczego — moze oznaczac zle zbudowane zadanie.
-- ============================================================
