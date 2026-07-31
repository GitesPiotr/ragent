// Klient Supabase na kluczu service_role. Wyłącznie po stronie serwera.
// Sekcja 3 SPEC zabrania w lib/rag/ odwołań do window — dlatego "server only"
// jest gwarantowane architekturą (importuje to jedynie warstwa HTTP), nie runtime'owym
// sprawdzaniem window. Sekret nigdy nie trafia do klienta i nie ma przedrostka NEXT_PUBLIC_.

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
