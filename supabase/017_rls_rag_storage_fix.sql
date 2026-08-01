-- ============================================================
--  AIdeas — migracja 017: poprawka polityki bucketu "rag-files"
--
--  CO ROBI: zastepuje polityke rag_files_wlasne_pliki wersja, ktora naprawde
--  dziala. Nic poza ta jedna polityka nie jest ruszane.
--
--  ------------------------------------------------------------
--  PO CO OSOBNY PLIK, SKORO 016 JEST JUZ POPRAWIONY W REPO
--
--  Bo 016 NIE DA SIE JUZ URUCHOMIC PONOWNIE. Jego KROK 0 przerywa migracje,
--  gdy w tabelach rag_* jest chocby jeden wiersz — a po pierwszym uruchomieniu
--  sa tam kolekcje i dokumenty. Ten warunek jest tam celowo i zostaje.
--  Poprawka musi wiec przyjsc osobnym, waskim skryptem.
--
--  Jesli poprawiles polityke RECZNIE w SQL Editor: uruchom ten plik mimo to.
--  Jest idempotentny (drop policy if exists + create), a jego sens polega na
--  tym, ze od teraz repozytorium i baza mowia to samo. Recznej poprawki nikt
--  za pol roku nie odtworzy z pamieci.
--
--  ------------------------------------------------------------
--  CO BYLO ZLE — I DLACZEGO NIE DALO SIE TEGO ZOBACZYC
--
--  Polityka z 016 miala w podzapytaniu SAM "name":
--
--      where c.id::text = split_part(name, '/', 1)          <-- ZLE
--
--  Zamiar: "name" ma znaczyc storage.objects.name, czyli klucz obiektu.
--  Postgres rozstrzyga jednak nazwe w NAJBLIZSZYM zakresie, a tam stoi alias
--  "c" — czyli rag_collections, ktore MA WLASNA KOLUMNE "name" (nazwa kolekcji,
--  session-2-schema.sql:22). Warunek znaczyl wiec "id kolekcji = pierwszy
--  segment NAZWY kolekcji" i byl zawsze falszywy.
--
--  Skladniowo bez zarzutu. Postgres nie zglosil ani bledu, ani ostrzezenia;
--  polityka utworzyla sie poprawnie. Jedyny objaw to odmowa zapisu
--  "new row violates row-level security policy" — dokladnie ten sam komunikat,
--  ktory dostaje sie przy braku uprawnien, wiec diagnoza szla w strone kluczy
--  i sesji, a blad siedzial w rozstrzyganiu nazwy kolumny.
--
--  LEKCJA DO ZAPAMIETANIA: w polityce RLS, ktora ma podzapytanie do innej
--  tabeli, KWALIFIKUJ KOLUMNY TABELI CHRONIONEJ. "objects.name" nie da sie
--  pomylic z niczym; "name" — owszem, i to po cichu.
--
--  ------------------------------------------------------------
--  JAK URUCHOMIC:
--  1. https://supabase.com/dashboard -> Twoj projekt
--  2. SQL Editor -> New query
--  3. Wklej CALY plik -> Run
--  4. Uruchom test z konca pliku.
--
--  JAK TO COFNAC:
--      drop policy if exists "rag_files_wlasne_pliki" on storage.objects;
--  Zaden plik w buckecie nie zostaje ruszony — polityki dotycza dostepu.
-- ============================================================

begin;

drop policy if exists "rag_files_wlasne_pliki" on storage.objects;

-- Klucz obiektu to <collection_id>/<document_id>/<nazwa> (lib/rag/documents.js:231),
-- wiec pierwszy segment to identyfikator KOLEKCJI, nie konta — wzorca z 013 nie da
-- sie tu przepisac wprost. Wlasciciela ustalamy przez rag_collections.
--
-- Jest to bezpieczne przy ZAPISIE, bo kolejnosc w ingestFile jest odwrotna niz
-- w buckecie "knowledge": documents.js:207 najpierw pobiera kolekcje, potem wstawia
-- wiersz dokumentu, i DOPIERO POTEM wola upload. W chwili zapisu wiersz kolekcji
-- juz istnieje, wiec "with check" ma sie o co oprzec.
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
--  KONTROLA (uruchom osobno, w nowym "New query")
-- ============================================================

-- --- 1) Tresc polityki — najwazniejsze zapytanie w tym pliku ----------------
--  W kolumnach qual i with_check MUSI byc "objects.name".
--  Jesli zobaczysz tam samo "c.name" albo "name" bez kwalifikatora — poprawka
--  nie weszla i zapis do bucketu bedzie dalej odrzucany.
--
--  select policyname, cmd, roles, qual, with_check
--    from pg_policies
--   where schemaname = 'storage'
--     and tablename = 'objects'
--     and policyname = 'rag_files_wlasne_pliki';

-- --- 2) Komplet polityk bucketow --------------------------------------------
--  Maja byc DOKLADNIE dwie: rag_files_wlasne_pliki oraz knowledge_wlasne_pliki
--  (z migracji 013). Cokolwiek wiecej — polityki permissive lacza sie przez OR,
--  wiec jedna zapomniana, otwarta uniewaznia obie.
--
--  select policyname, cmd, roles
--    from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   order by policyname;

-- --- 3) Test na prawdziwym kluczu, bez wgrywania czegokolwiek ---------------
--  Podstaw klucz istniejacego obiektu i UUID swojego konta. Ma zwrocic true.
--
--  select exists (
--    select 1 from public.rag_collections c
--     where c.id::text = split_part('<WKLEJ-KLUCZ-OBIEKTU>', '/', 1)
--       and c.owner_id = '<WKLEJ-UUID-KONTA>'::uuid
--  ) as czy_polityka_przepusci;
--
--  false oznacza jedna z TRZECH rzeczy naraz — sprawdzaj po kolei:
--    a) kolekcja o tym id nie istnieje,
--    b) kolekcja nalezy do innego konta,
--    c) klucz obiektu nie zaczyna sie od identyfikatora kolekcji.

-- --- 4) Sprzatanie po nieudanych probach ------------------------------------
--  Dokumenty, ktorych upload zostal odrzucony, zostaja w bazie ze statusem
--  'error', zerem fragmentow i STARYM komunikatem bledu. Nie znikaja same
--  i wygladaja w interfejsie jak biezaca awaria, mimo ze problem juz nie
--  istnieje. Podglad przed usunieciem:
--
--  select d.id, d.file_name, d.status, d.chunk_count, d.error_message, d.created_at
--    from public.rag_documents d
--   where d.status = 'error' and d.chunk_count = 0
--   order by d.created_at desc;
--
--  Kasowac najlepiej z poziomu aplikacji (przycisk „Usun" przy dokumencie) —
--  wtedy idzie przez deleteDocument, ktore sprzata tez ewentualny obiekt
--  w Storage. Kasowanie wierszy wprost z SQL zostawiloby plik-widmo.
