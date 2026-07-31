// Funkcje diagnostyczne. Zwracają DANE, nigdy HTML.
// Zasada nadrzędna Sesji 0: każdy element sprawdzany OSOBNO i NIEZALEŻNIE — jeden
// niedziałający nie może wywrócić całości ani rzucić wyjątkiem na zewnątrz.

import { getConfig } from './config.js';
import { getSupabaseClient } from './db.js';

// Sprawdza połączenie z Supabase oraz — tym samym wywołaniem rag_diag — obecność
// pgvector i RZECZYWISTY wymiar kolumny rag_chunks.embedding (kontrola dim_mismatch,
// aktywowana w Sesji 2, gdy kolumna już istnieje).
async function checkSupabaseAndVector(config, deps = {}) {
  const supabase = { ok: false, code: null, message: '' };
  const pgvector = { installed: null, message: '' };
  let columnDim = null;

  // Wstrzyknięty klient (warstwa HTTP podaje tu klienta z sesją użytkownika) sam
  // w sobie jest dowodem konfiguracji — stoi na NEXT_PUBLIC_SUPABASE_*, nie na
  // RAG_SUPABASE_SERVICE_KEY. Bez tego warunku diagnostyka meldowałaby "no_key"
  // z powodu klucza, którego ta ścieżka już nie używa.
  if (!deps.client && !config.supabase.configured) {
    supabase.code = 'no_key';
    supabase.message =
      'Brak konfiguracji Supabase. Uzupełnij RAG_SUPABASE_URL (lub NEXT_PUBLIC_SUPABASE_URL) oraz RAG_SUPABASE_SERVICE_KEY w .env.local.';
    pgvector.message = 'Nie sprawdzono — brak połączenia z bazą.';
    return { supabase, pgvector, columnDim };
  }

  try {
    const client = deps.client || getSupabaseClient();
    // rag_diag(p_table, p_column) — wąska, tylko do odczytu funkcja pomocnicza
    // (patrz sql/session-0-diagnostyka.sql). Kolumna z allowlisty: rag_chunks.embedding.
    const { data, error } = await client.rpc('rag_diag', {
      p_table: 'rag_chunks',
      p_column: 'embedding',
    });

    if (error) {
      const msg = error.message || '';
      const missingFn =
        error.code === 'PGRST202' || /rag_diag/i.test(msg) || /function.*does not exist/i.test(msg);

      if (missingFn) {
        supabase.ok = true;
        supabase.message = 'Połączono z Supabase.';
        pgvector.message =
          'Nie można ustalić — brak funkcji rag_diag. Uruchom skrypt sql/session-0-diagnostyka.sql w Supabase → SQL Editor.';
      } else {
        supabase.message = 'Błąd zapytania do Supabase: ' + msg;
        pgvector.message = 'Nie sprawdzono.';
      }
      return { supabase, pgvector, columnDim };
    }

    supabase.ok = true;
    supabase.message = 'Połączono z Supabase.';
    pgvector.installed = Boolean(data && data.pgvector);
    pgvector.message = pgvector.installed
      ? 'Rozszerzenie pgvector jest włączone.'
      : 'Rozszerzenie pgvector NIE jest włączone. Uruchom: create extension if not exists vector;';
    columnDim = data && data.column_dim != null ? data.column_dim : null;
    return { supabase, pgvector, columnDim };
  } catch (err) {
    supabase.message = 'Nie udało się połączyć z Supabase: ' + (err && err.message ? err.message : 'nieznany błąd');
    pgvector.message = 'Nie sprawdzono — brak połączenia z bazą.';
    return { supabase, pgvector, columnDim };
  }
}

// Kontrola wymiaru (sekcja 7.1): porównuje rzeczywisty wymiar kolumny z RAG_EMBED_DIM.
// Rozbieżność → dim_mismatch, ZANIM dojdzie do pierwszego zapisu.
function buildDimCheck(columnDim, expectedDim) {
  if (columnDim == null) {
    return {
      ok: null,
      code: null,
      expected: expectedDim,
      actual: null,
      message:
        'Nie sprawdzono — kolumna rag_chunks.embedding jeszcze nie istnieje lub brak połączenia z bazą. Uruchom skrypt schematu (Sesja 2).',
    };
  }
  if (columnDim === expectedDim) {
    return {
      ok: true,
      code: null,
      expected: expectedDim,
      actual: columnDim,
      message: `Wymiar kolumny zgodny z konfiguracją (${columnDim}).`,
    };
  }
  return {
    ok: false,
    code: 'dim_mismatch',
    expected: expectedDim,
    actual: columnDim,
    message: `Niezgodność wymiaru: kolumna rag_chunks.embedding ma vector(${columnDim}), a RAG_EMBED_DIM=${expectedDim}. Ujednolić przed jakimkolwiek zapisem (migracja kolumny + przeindeksowanie).`,
  };
}

// Sprawdza, czy Ollama odpowiada pod RAG_OLLAMA_URL, i pobiera listę modeli.
async function checkOllama(config) {
  const url = config.embed.ollamaUrl;
  const result = { ok: false, code: null, message: '', url, models: [] };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url.replace(/\/+$/, '') + '/api/tags', { signal: controller.signal });
    if (!res.ok) {
      result.code = 'ollama_unavailable';
      result.message = `Ollama odpowiedziała błędem HTTP ${res.status}.`;
      return result;
    }
    const body = await res.json();
    result.ok = true;
    result.models = Array.isArray(body && body.models)
      ? body.models.map((m) => ({ name: m.name, size: m.size ?? null }))
      : [];
    result.message = result.models.length
      ? `Ollama działa (dostępnych modeli: ${result.models.length}).`
      : 'Ollama działa, ale nie pobrano jeszcze żadnego modelu.';
    return result;
  } catch (err) {
    result.code = 'ollama_unavailable';
    const reason =
      err && err.name === 'AbortError'
        ? 'przekroczono czas oczekiwania.'
        : (err && err.message ? err.message : 'brak połączenia.');
    result.message = `Ollama nie odpowiada pod ${url}: ${reason}`;
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

// Składa pełny obraz diagnostyczny. Nie rzuca — każdy fragment ma własny try/catch.
export async function getStatus(deps = {}) {
  const config = getConfig();

  const [dbPart, ollama] = await Promise.all([
    checkSupabaseAndVector(config, deps).catch((err) => ({
      supabase: { ok: false, code: null, message: 'Błąd diagnostyki bazy: ' + (err && err.message) },
      pgvector: { installed: null, message: 'Nie sprawdzono.' },
      columnDim: null,
    })),
    checkOllama(config).catch((err) => ({
      ok: false,
      code: 'ollama_unavailable',
      message: String((err && err.message) || err),
      url: config.embed.ollamaUrl,
      models: [],
    })),
  ]);

  return {
    supabase: dbPart.supabase,
    pgvector: dbPart.pgvector,
    ollama,
    models: ollama.models,
    dimCheck: buildDimCheck(dbPart.columnDim ?? null, config.embed.dim),

    config: {
      embedProvider: config.embed.provider,
      embedModel: config.embed.model,
      embedDim: config.embed.dim,
      tablePrefix: config.tablePrefix,
      ollamaUrl: config.embed.ollamaUrl,
      // Parametry wyszukiwania (Sesja 5). Wystawione, bo próg jest wartością DO STROJENIA
      // (redline 8) — UI rysuje w diagnostyce kreskę odcięcia dokładnie w tym miejscu,
      // zamiast powielać domyślną wartość po swojej stronie i rozjechać się z rdzeniem.
      topK: config.search.topK,
      minScore: config.search.minScore,
      missing: config.missing,
    },
  };
}
