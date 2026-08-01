-- =============================================================================
--  Sesja 6 - mapa punktow. Uruchamiasz TY recznie w Supabase -> SQL Editor.
--
--  DLACZEGO FUNKCJA, A NIE ZWYKLE UPDATE:
--  po zbudowaniu bazy rzutowania trzeba zapisac wspolrzedne WSZYSTKICH fragmentow
--  naraz - przy tej kolekcji 1306 wierszy. Przez PostgREST to 1306 osobnych zadan
--  HTTP (minuty i tysiac okazji do zerwania w polowie). Jedno wywolanie z tablica
--  jsonb to jeden przelot i ~300 KB.
--
--  ZAKRES: jedna funkcja. Zadnych nowych tabel ani kolumn - coord_x/y/z i neighbors
--  istnieja w schemacie od Sesji 2. Funkcja dotyka WYLACZNIE tych czterech kolumn
--  w rag_chunks; nie umie zmienic tresci, wektora ani przynaleznosci fragmentu.
--
--  BEZPIECZENSTWO (jak rag_search_chunks z Sesji 5):
--    - prawa wywolujacego, bez security definer (service_role i tak pisze do rag_*),
--    - search_path przypiety do "public, extensions",
--    - zero dynamicznego SQL - jsonb jest DANYMI, nie fragmentem zapytania,
--    - execute odebrane public, nadane wylacznie roli service_role.
--
--  Wejscie: tablica obiektow
--    [{"id":"<uuid>","x":0.12,"y":-0.34,"z":0.05,"neighbors":[{"id":"<uuid>","dist2d":0.02}]}]
--  Wyjscie: liczba zaktualizowanych wierszy (do kontroli po stronie aplikacji).
-- =============================================================================

drop function if exists public.rag_set_chunk_coords(jsonb);

create or replace function public.rag_set_chunk_coords(p_rows jsonb)
returns integer
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_count integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rag_set_chunk_coords: oczekiwano tablicy jsonb'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.rag_chunks c
     set coord_x   = d.x,
         coord_y   = d.y,
         coord_z   = d.z,
         neighbors = d.neighbors
    from (
      select (r->>'id')::uuid  as id,
             (r->>'x')::real   as x,
             (r->>'y')::real   as y,
             (r->>'z')::real   as z,
             r->'neighbors'    as neighbors
        from jsonb_array_elements(p_rows) r
    ) d
   where c.id = d.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.rag_set_chunk_coords(jsonb) from public;
grant execute on function public.rag_set_chunk_coords(jsonb) to service_role;

-- =============================================================================
--  SPRAWDZENIE PO URUCHOMIENIU:
--    select proname from pg_proc where proname = 'rag_set_chunk_coords';
--
--  Test na sucho (pusta tablica - powinno zwrocic 0, bez zadnej zmiany w danych):
--    select public.rag_set_chunk_coords('[]'::jsonb);
-- =============================================================================
