-- =============================================================================
--  Sesja 0 — skrypt do RĘCZNEGO uruchomienia w Supabase → SQL Editor.
--  Uruchamiasz TY. Aplikacja niczego w bazie nie tworzy.
--
--  Zakres świadomie wąski: WŁĄCZ pgvector + jedna funkcja pomocnicza tylko do
--  odczytu diagnostycznego. To NIE jest schemat (żadnych tabel rag_*) — ten
--  powstaje dopiero w Sesji 2, po decyzji o wymiarze wektora (Sesja 1).
-- =============================================================================

-- 1) Rozszerzenie wektorowe.
create extension if not exists vector;

-- 2) rag_diag() — wąska, WYŁĄCZNIE do odczytu funkcja diagnostyczna.
--
--    Robi dokładnie dwie rzeczy:
--      a) sprawdza obecność rozszerzenia pgvector,
--      b) (pod Sesję 2) odczytuje wymiar wskazanej kolumny wektorowej.
--
--    Bezpieczeństwo:
--      - SECURITY DEFINER, ale search_path pusty i wszystkie obiekty katalogu
--        w pełni kwalifikowane — brak możliwości przechwycenia przez search_path,
--      - ZERO dynamicznego SQL sklejanego z argumentów. Nazwa tabeli/kolumny nie
--        trafia do treści zapytania jako identyfikator — jest tylko WARTOŚCIĄ
--        porównywaną w WHERE, i dodatkowo walidowaną względem STAŁEJ listy
--        dozwolonych kolumn. Argument spoza listy → wyjątek, nie zapytanie,
--      - execute nadawany wyłącznie roli service_role (nie public).
create or replace function public.rag_diag(
  p_table  text default null,
  p_column text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_has_vector boolean;
  v_dim        integer := null;
begin
  -- a) obecność pgvector
  select exists (
    select 1 from pg_catalog.pg_extension where extname = 'vector'
  ) into v_has_vector;

  -- b) opcjonalny odczyt wymiaru kolumny — tylko dla kolumn z ALLOWLISTY.
  if p_table is not null and p_column is not null then
    if not (
         (p_table = 'rag_chunks'   and p_column = 'embedding')
      or (p_table = 'rag_concepts' and p_column = 'embedding')
    ) then
      raise exception 'rag_diag: niedozwolona kolumna %.%', p_table, p_column
        using errcode = 'check_violation';
    end if;

    -- Dla typu vector atttypmod przechowuje liczbę wymiarów wprost
    -- (np. vector(1024) → atttypmod = 1024). -1 oznacza wymiar nieokreślony.
    -- p_table/p_column są tu WARTOŚCIAMI w WHERE, nie fragmentem SQL.
    select a.atttypmod
      into v_dim
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class     c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = p_table
       and a.attname = p_column
       and a.attnum  > 0
       and not a.attisdropped;

    if v_dim is not null and v_dim < 0 then
      v_dim := null;
    end if;
  end if;

  return jsonb_build_object(
    'pgvector',   coalesce(v_has_vector, false),
    'column_dim', v_dim
  );
end;
$$;

-- 3) Uprawnienia: odbierz wszystkim, nadaj wyłącznie roli używanej przez service_role.
revoke all on function public.rag_diag(text, text) from public;
grant execute on function public.rag_diag(text, text) to service_role;
