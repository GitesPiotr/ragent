// Dziennik wyszukiwań (11.3) — WARSTWA OBOK, nie na ścieżce odpowiedzi.
//
// ZASADA NADRZĘDNA TEGO PLIKU: zapis nie może zepsuć wyszukiwania. Nigdy.
// Każdy błąd — brak tabeli, padnięta baza, przekroczony czas — kończy się wpisem
// w logu konsoli i niczym więcej. Użytkownik dostaje swoje wyniki.
//
// Dlatego funkcja NIE RZUCA i nie jest oczekiwana (`await`) na ścieżce odpowiedzi.
// To odwrotność reguły „brak danych wstrzymuje werdykt": tam brak danych miał
// zatrzymać wniosek, tu brak zapisu nie ma prawa zatrzymać odpowiedzi. Różnica jest
// w tym, co jest produktem — tam wnioskiem, tu odpowiedzią dla użytkownika.

import { getSupabaseClient } from './db.js';
import { getConfig } from './config.js';

// Zapytania bywają wklejane hurtem; nie chcemy dziennika z polami po 200 kB.
const MAKS_ZAPYTANIE = 2000;

/**
 * Zapisuje ślad po jednym wyszukiwaniu. NIE RZUCA i nie zwraca nic użytecznego.
 * Wołać BEZ `await` z gorącej ścieżki albo z `void`.
 */
export function zapiszWyszukiwanie(wpis, deps = {}) {
  let config;
  try {
    config = getConfig();
  } catch {
    return;
  }
  if (!config.search.log) return;

  const client = deps.client || getSupabaseClient();
  const wiersz = {
    collection_id: wpis.collectionId || null,
    query: String(wpis.query || '').slice(0, MAKS_ZAPYTANIE),
    // null (cała kolekcja) MUSI być odróżnialne od pustej listy — po decyzji z 18.a
    // to są dwa różne zdarzenia i dziennik ma je rozróżniać od pierwszego dnia.
    document_ids: Array.isArray(wpis.documentIds) ? wpis.documentIds : null,
    top_k: wpis.topK ?? null,
    min_score: wpis.minScore ?? null,
    hits_count: wpis.hits ? wpis.hits.length : 0,
    first_score: wpis.hits && wpis.hits.length ? wpis.hits[0].score : null,
    last_score: wpis.hits && wpis.hits.length ? wpis.hits[wpis.hits.length - 1].score : null,
    hybrid: !!wpis.hybrid,
    deduped: wpis.odsiane || 0,
    no_results: !!wpis.noResults,
    no_results_reason: wpis.noResults ? (wpis.regulaNegatywna ? 'regula_negatywna' : 'prog') : null,
    duration_ms: wpis.durationMs ?? null,
    owner_ref: null, // ZAREZERWOWANE dla I1 — patrz sql/session-log-wyszukiwan.sql
  };

  // DWIE OSŁONY, BO SĄ DWIE DROGI BŁĘDU. `.catch` łapie odrzuconą obietnicę,
  // ale `client.from(...)` wykonuje się SYNCHRONICZNIE — jeśli rzuci (padnięty
  // klient, zły stan modułu), wyjątek ominie łańcuch i wyleci z tej funkcji prosto
  // na ścieżkę odpowiedzi. Pierwsza wersja tego pliku miała dokładnie tę dziurę
  // i deklarowała w nagłówku regułę, której sama nie spełniała; złapał ją test.
  let zapytanie;
  try {
    zapytanie = client.from('rag_search_log').insert(wiersz);
  } catch (e) {
    console.warn('[rag] Nie zapisano śladu wyszukiwania: ' + (e && e.message ? e.message : String(e)));
    return;
  }

  Promise.resolve(zapytanie)
    .then(({ error } = {}) => {
      if (!error) return;
      if (/rag_search_log/.test(error.message || '')) {
        console.warn(
          '[rag] Dziennik wyszukiwań nie działa: brak tabeli rag_search_log. ' +
            'Uruchom sql/session-log-wyszukiwan.sql albo ustaw RAG_SEARCH_LOG=off. ' +
            'Wyszukiwanie działa normalnie.'
        );
        return;
      }
      console.warn('[rag] Nie zapisano śladu wyszukiwania: ' + (error.message || 'nieznany błąd'));
    })
    .catch((e) => {
      console.warn('[rag] Nie zapisano śladu wyszukiwania: ' + (e && e.message ? e.message : String(e)));
    });
}
