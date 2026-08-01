// Klient Supabase na kluczu service_role. Wyłącznie po stronie serwera.
// Sekcja 3 SPEC zabrania w lib/rag/ odwołań do window — dlatego "server only"
// jest gwarantowane architekturą (importuje to jedynie warstwa HTTP), nie runtime'owym
// sprawdzaniem window. Sekret nigdy nie trafia do klienta i nie ma przedrostka NEXT_PUBLIC_.
//
// =============================================================================
//  WARSTWA HTTP NIE UŻYWA JUŻ getSupabaseClient() — runda 3b integracji z AIDEAS
//
//  Trasy w app/api/rag/ budują klienta z SESJĄ zalogowanego użytkownika
//  (app/api/rag/_lib/klientSesji.js) i wstrzykują go do rdzenia przez deps.client.
//  Powód: service_role ma BYPASSRLS, więc dopóki zapytania szły tym kluczem,
//  polityki z supabase/016_rls_rag.sql nie miały czego pilnować — każde konto
//  widziałoby każdą kolekcję.
//
//  Ta funkcja ZOSTAJE i jest nadal potrzebna, ale w jednej roli: to ścieżka dla
//  NARZĘDZI URUCHAMIANYCH Z KONSOLI (scripts/ w module źródłowym — wsadowe
//  wyciąganie pojęć, normalizacja, kopie), które nie mają żadnej sesji, bo nie
//  chodzą w kontekście żądania HTTP.
//
//  UWAGA NA PÓŹNIEJ: po uruchomieniu 016 ta ścieżka ODCZYTUJE wszystko (omija
//  RLS), ale NIE ZAPISUJE — owner_id ma "not null default auth.uid()", a pod
//  service_role auth.uid() jest NULL. Skrypty piszące wymagają decyzji przy
//  przenoszeniu (runda 5); opisuje ją nagłówek supabase/016_rls_rag.sql.
//
//  Jeśli dopisujesz nową trasę w app/api/rag/ i sięgasz stąd po klienta —
//  robisz dziurę w izolacji. Weź klientSesji() i podaj przez deps.client.
// =============================================================================

// BRAMKA BUDOWANIA — patrz komentarz w config.js. Tu stawka jest najwyższa
// w całym module: ten plik trzyma klienta na kluczu service_role.
import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getConfig } from './config.js';

// Nazwa bucketa Storage. Mieszka tutaj, a nie w documents.js, bo sięgają po nią dwa
// moduły: documents.js (upload/pobranie/usunięcie pojedynczego pliku) i collections.js
// (sprzątanie całego prefiksu kolekcji). Literał w dwóch miejscach rozjechałby się
// przy pierwszej zmianie, a błąd byłby cichy — pliki lądowałyby w innym buckecie,
// niż ten, z którego sprzątamy.
export const BUCKET = 'rag-files';

// =============================================================================
//  ODCZYT STRONAMI — JEDNO MIEJSCE, BO TA PUŁAPKA WRÓCIŁA TRZY RAZY
//
//  PostgREST bez `.range()` oddaje maksymalnie 1000 wierszy i NIE MÓWI, że uciął.
//  Kod policzy się z części danych, a wynik wygląda wiarygodnie — to jest najgorszy
//  rodzaj błędu, bo nie ma objawu. Trafiło nas przy `rag_chunk_concepts` (Sesja 9),
//  potem przy `rag_concepts` (Sesja 9b) i za każdym razem odpowiedzią była kolejna
//  ręczna pętla w kolejnym pliku. Reguła „wszystkie odczyty muszą stronicować"
//  nie zadziałała, bo reguła nie jest wykonywalna — a helper z testem jest.
//
//  DRUGA RZECZ, KTÓREJ RĘCZNE PĘTLE NIE ROBIŁY: pilnowanie, czy zapytanie w ogóle
//  stosuje `.range()`. Gdy autor go zapomni, każda strona jest tą samą stroną i pętla
//  kręci się bez końca, cicho i w nieskończoność. Tutaj taki przypadek kończy się
//  jawnym błędem, a nie zawieszeniem procesu.
// =============================================================================
export const ROZMIAR_STRONY = 500;

// Zabezpieczenie przed ucieczką: 200 stron × 500 = 100 tys. wierszy. Powyżej tego
// zawsze chodzi o błąd w zapytaniu, nie o prawdziwe dane w tej aplikacji.
const MAKS_STRON = 200;

function bladOdczytu(wiadomosc) {
  const e = new Error(wiadomosc);
  e.code = 'internal';
  return e;
}

// `zbudujZapytanie(od, do)` musi zwrócić zapytanie z `.range(od, do)` — to na nim
// stoi cała mechanika. `naBlad` pozwala wywołującemu przetłumaczyć błąd bazy na swój
// (np. graph.js zamienia 22P02 na invalid_input); bez niego lecimy z kodem internal.
export async function czytajStronami(zbudujZapytanie, { rozmiar = ROZMIAR_STRONY, naBlad } = {}) {
  const out = [];
  let poprzedniOdcisk = null;
  for (let strona = 0; strona < MAKS_STRON; strona++) {
    const od = strona * rozmiar;
    const { data, error } = await zbudujZapytanie(od, od + rozmiar - 1);
    if (error) throw naBlad ? naBlad(error) : bladOdczytu('Błąd odczytu z bazy: ' + (error.message || 'nieznany'));
    const wiersze = data || [];

    // Strona identyczna z poprzednią = zapytanie ignoruje `.range()`. Sprawdzamy to
    // dla KAŻDEJ niepustej strony, nie tylko dla pełnej: PostgREST bez `.range()`
    // oddaje min(wszystko, 1000) wierszy, co prawie nigdy nie równa się rozmiarowi
    // strony — pierwsza wersja tego zabezpieczenia patrzyła tylko na pełne strony
    // i dlatego przepuszczała dokładnie ten przypadek, przed którym miała chronić.
    if (wiersze.length) {
      const odcisk = JSON.stringify([wiersze.length, wiersze[0], wiersze[wiersze.length - 1]]);
      if (odcisk === poprzedniOdcisk) {
        throw bladOdczytu(
          'Odczyt stronami dostał dwa razy tę samą stronę — zapytanie nie stosuje .range(od, do).'
        );
      }
      poprzedniOdcisk = odcisk;
    }

    out.push(...wiersze);
    if (wiersze.length < rozmiar) return out;
  }
  throw bladOdczytu(`Odczyt stronami przekroczył ${MAKS_STRON} stron — sprawdź warunki zapytania.`);
}

let cached = null;

// Zwraca klienta Supabase. Gdy brak URL/klucza — rzuca błąd z kodem no_key,
// żeby warstwa wyżej mogła zamienić go na czytelny komunikat (sekcja 10.2).
export function getSupabaseClient() {
  const config = getConfig();

  if (!config.supabase.configured) {
    const err = new Error('Brak konfiguracji Supabase (RAG_SUPABASE_URL / RAG_SUPABASE_SERVICE_KEY).');
    err.code = 'no_key';
    throw err;
  }

  // Prosty cache: te same dane wejściowe → ten sam klient.
  if (cached && cached.url === config.supabase.url && cached.key === config.supabase.serviceKey) {
    return cached.client;
  }

  const client = createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  cached = { url: config.supabase.url, key: config.supabase.serviceKey, client };
  return client;
}
