import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stanSrodowiska } from './stanDiagnostyki.js';

// Zdrowa odpowiedź /api/rag/status — punkt wyjścia, psuty po jednym polu.
function zdrowa(nadpisz = {}) {
  return {
    supabase: { ok: true, code: null, message: 'Połączono z Supabase.' },
    pgvector: { installed: true, message: '' },
    dimCheck: { ok: true, code: null, expected: 1024, actual: 1024, message: '' },
    ollama: { ok: true, code: null, message: '', url: 'http://localhost:11434' },
    models: [{ name: 'bge-m3:latest' }, { name: 'llama3.1:8b' }],
    config: { embedProvider: 'ollama', embedModel: 'bge-m3', embedDim: 1024 },
    ...nadpisz,
  };
}

// --- stan czwarty: brak pomiaru -------------------------------------------------

test('brak odpowiedzi to stan nieznany, NIE zielony', () => {
  const s = stanSrodowiska(null);
  assert.equal(s.poziom, 'nieznany');
  assert.equal(s.kolor, '#a1a1aa');
  assert.notEqual(s.kolor, '#15803d');
});

test('błąd odczytu diagnostyki to awaria, nie stan nieznany', () => {
  const s = stanSrodowiska(null, 'timeout');
  assert.equal(s.poziom, 'awaria');
  assert.match(s.powod, /timeout/);
});

// --- zielona --------------------------------------------------------------------

test('wszystko odpowiada → zielona', () => {
  const s = stanSrodowiska(zdrowa());
  assert.equal(s.poziom, 'ok');
  assert.equal(s.kolor, '#15803d');
});

// --- czerwona: nic nie działa ---------------------------------------------------

test('baza niedostępna → czerwona', () => {
  const s = stanSrodowiska(zdrowa({ supabase: { ok: false, message: 'brak' } }));
  assert.equal(s.poziom, 'awaria');
  assert.equal(s.kolor, '#b91c1c');
});

test('brak pgvector → czerwona', () => {
  const s = stanSrodowiska(zdrowa({ pgvector: { installed: false, message: '' } }));
  assert.equal(s.poziom, 'awaria');
});

test('dim_mismatch → czerwona, z obiema liczbami w powodzie', () => {
  const s = stanSrodowiska(
    zdrowa({ dimCheck: { ok: false, code: 'dim_mismatch', expected: 1024, actual: 768 } })
  );
  assert.equal(s.poziom, 'awaria');
  assert.match(s.powod, /768/);
  assert.match(s.powod, /1024/);
});

// --- bursztynowa: widać dane, nie da się indeksować ------------------------------

test('Ollama nie odpowiada → bursztynowa, NIE czerwona', () => {
  const s = stanSrodowiska(zdrowa({ ollama: { ok: false, code: 'ollama_unavailable', message: '' } }));
  assert.equal(s.poziom, 'ostrzezenie');
  assert.equal(s.kolor, '#b45309');
});

test('brak modelu embeddingów na liście → bursztynowa', () => {
  const s = stanSrodowiska(zdrowa({ models: [{ name: 'llama3.1:8b' }] }));
  assert.equal(s.poziom, 'ostrzezenie');
  assert.match(s.powod, /bge-m3/);
});

test('etykieta wersji nie psuje dopasowania modelu', () => {
  // konfiguracja bez tagu, Ollama z tagiem — ta sama rzecz
  assert.equal(stanSrodowiska(zdrowa()).poziom, 'ok');
  assert.equal(
    stanSrodowiska(zdrowa({ config: { embedProvider: 'ollama', embedModel: 'bge-m3:latest' } })).poziom,
    'ok'
  );
});

test('dostawca inny niż ollama — lista modeli Ollamy nie decyduje', () => {
  const s = stanSrodowiska(zdrowa({ models: [], config: { embedProvider: 'openai', embedModel: 'x' } }));
  assert.equal(s.poziom, 'ok');
});

test('niepotwierdzony schemat wektorów → bursztynowa, nie zielona', () => {
  // brak rag_diag: baza odpowiada, ale pgvector i wymiar zostają nieznane
  const s = stanSrodowiska(zdrowa({ pgvector: { installed: null }, dimCheck: { ok: null } }));
  assert.equal(s.poziom, 'ostrzezenie');
});

// --- pierwszeństwo: awaria bije ostrzeżenie --------------------------------------

test('padnięta baza I padnięta Ollama → czerwona, nie bursztynowa', () => {
  const s = stanSrodowiska(
    zdrowa({ supabase: { ok: false, message: '' }, ollama: { ok: false, code: 'ollama_unavailable' } })
  );
  assert.equal(s.poziom, 'awaria');
});

// --- powód zawsze obecny --------------------------------------------------------

// --- dostawca chmurowy: Ollamy nie ma i nie ma jej być --------------------------
//
// Przypadek wdrożenia z RAG_EMBED_PROVIDER=openrouter. Przed poprawką werdykt
// wychodził bursztynowy z komunikatem „nie da się zaindeksować ani przeszukać",
// mimo że wektory liczy wtedy chmura — a bursztyn niesie się na diodę w rogu
// każdej strony panelu.

test('dostawca chmurowy + brak Ollamy → zielona, nie bursztynowa', () => {
  const s = stanSrodowiska(
    zdrowa({
      ollama: { ok: false, code: 'ollama_unavailable', message: '', url: '' },
      models: [],
      config: { embedProvider: 'openrouter', embedModel: 'baai/bge-m3', embedDim: 1024 },
    })
  );
  assert.equal(s.poziom, 'ok');
});

test('powód przy dostawcy chmurowym NIE wymienia Ollamy', () => {
  const s = stanSrodowiska(
    zdrowa({ config: { embedProvider: 'openrouter', embedModel: 'baai/bge-m3', embedDim: 1024 } })
  );
  assert.equal(s.poziom, 'ok');
  assert.doesNotMatch(s.powod, /Ollam/i);
});

test('przy dostawcy lokalnym powód nadal wymienia Ollamę', () => {
  const s = stanSrodowiska(zdrowa());
  assert.equal(s.poziom, 'ok');
  assert.match(s.powod, /Ollama/);
});

test('padnięta baza bije wszystko także przy dostawcy chmurowym', () => {
  const s = stanSrodowiska(
    zdrowa({
      supabase: { ok: false, message: '' },
      config: { embedProvider: 'openrouter', embedModel: 'baai/bge-m3', embedDim: 1024 },
    })
  );
  assert.equal(s.poziom, 'awaria');
});

test('każdy poziom niesie powód dla title/aria-label', () => {
  const przypadki = [
    stanSrodowiska(null),
    stanSrodowiska(zdrowa()),
    stanSrodowiska(zdrowa({ ollama: { ok: false } })),
    stanSrodowiska(zdrowa({ supabase: { ok: false } })),
  ];
  for (const s of przypadki) {
    assert.ok(s.powod && s.powod.length > 10, `pusty powod dla ${s.poziom}`);
  }
});
