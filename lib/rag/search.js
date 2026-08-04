// Wyszukiwanie (sekcja 11 + kontrakt searchCollection z sekcji 9).
// Czysty JS, do bazy wyłącznie przez db.js. Zero React/Next/window.
//
// TRZY REGUŁY, KTÓRE TU OBOWIĄZUJĄ:
// 1. score = PODOBIEŃSTWO (1 - odległość), nigdy odległość. Na zewnątrz nie wychodzi
//    żadna wartość, w której "mniej = lepiej".
// 2. Próg RAG_MIN_SCORE odcina słabe trafienia; gdy nie zostaje nic → noResults: true.
//    To jest właściwość, dzięki której narzędzie agenta umie powiedzieć "nie znalazłem"
//    zamiast podać pięć przypadkowych fragmentów (sekcja 11).
// 3. Zapytanie idzie przez embedQuery (RAG_EMBED_QUERY_PREFIX), nie embedDocuments.

import { getSupabaseClient } from './db.js';
import { getConfig } from './config.js';
import { createEmbeddingProvider, nieobslugiwanaPara, embedConfigDlaKolekcji } from './embedding.js';
import { identyfikatoryZapytania, polaczTrafienia, GLEBOKOSC_FUZJI } from './hybryda.js';
import { zapiszWyszukiwanie } from './search-log.js';

const RPC = 'rag_search_chunks';
const RPC_TEKST = 'rag_search_chunks_text';

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Odległość cosinusowa (0..2) → podobieństwo (sekcja 11). Przycięcie do [0,1]:
// wartość ujemna oznacza wektory rozbieżne bardziej niż prostopadłe i tak czy owak
// leci pod próg, a kontrakt mówi o zakresie [0,1] — nie wypuszczamy liczb spoza niego.
export function distanceToScore(distance) {
  // UWAGA na null: Number(null) === 0, więc bez tego warunku brak odległości
  // udawałby trafienie idealne (score 1). Brak danych to najgorszy wynik, nie najlepszy.
  if (distance === null || distance === undefined) return 0;
  const d = Number(distance);
  if (!Number.isFinite(d)) return 0;
  const score = 1 - d;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}

// Zaokrąglenie prezentacyjne — 4 miejsca wystarczą do strojenia progu, a nie zaśmiecają
// odpowiedzi ogonem zmiennoprzecinkowym.
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// Błąd RPC → czytelny komunikat. Najczęstszy przypadek pierwszego uruchomienia:
// funkcji nie ma w bazie, bo skrypt SQL nie został jeszcze puszczony ręcznie.
function throwRpc(error, funkcja = RPC) {
  const msg = (error && error.message) || 'nieznany';
  const code = error && error.code;
  if (code === 'PGRST202' || /could not find the function|does not exist/i.test(msg)) {
    // Skrypt zależy od tego, KTÓREJ funkcji brakuje — odesłanie do złego pliku
    // kosztowałoby kwadrans szukania nie tam, gdzie trzeba.
    const skrypt =
      funkcja === RPC_TEKST ? 'sql/session-hybrid-search.sql' : 'sql/session-5-search.sql';
    throw err(
      'invalid_input',
      `Funkcja wyszukiwania "${funkcja}" nie istnieje w bazie. Uruchom ręcznie skrypt ${skrypt} w Supabase → SQL Editor.`
    );
  }
  if (code === '22P02') {
    throw err('invalid_input', 'Nieprawidłowy identyfikator (oczekiwano UUID).');
  }
  // Rozjazd wymiaru wektora widać dopiero tutaj, jeśli ktoś ominął kontrolę modelu.
  if (/expected \d+ dimensions|different vector dimensions/i.test(msg)) {
    throw err(
      'dim_mismatch',
      `Wymiar wektora zapytania nie zgadza się z kolumną rag_chunks.embedding: ${msg}`
    );
  }
  throw err('internal', 'Błąd bazy danych przy wyszukiwaniu: ' + msg);
}

function normalizeQuery(query) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) throw err('invalid_input', 'Zapytanie jest puste.');
  return q;
}

// documentIds: null (cała kolekcja) albo niepusta tablica UUID-ów.
function normalizeDocumentIds(documentIds) {
  if (documentIds === undefined || documentIds === null) return null;
  if (!Array.isArray(documentIds)) {
    throw err('invalid_input', 'documentIds musi być tablicą identyfikatorów dokumentów.');
  }
  const ids = documentIds.filter((d) => typeof d === 'string' && d.trim()).map((d) => d.trim());
  return ids.length ? ids : null;
}

// searchCollection wg sekcji 9:
//   { collectionId, query, topK, minScore, documentIds }
//     → { hits: [{ chunkId, documentId, fileName, headingPath, pageFrom, pageTo, content, score }],
//         noResults: boolean }
// topK domyślnie z RAG_TOP_K, minScore z RAG_MIN_SCORE — parametry mogą nadpisać
// (minScore: 0 przepuszcza wszystko, z tego korzysta diagnostyka progu).
// deps.client / deps.provider — wstrzykiwalne do testów (bez bazy i bez Ollamy).
export async function searchCollection(
  { collectionId, query, topK, minScore, documentIds } = {},
  deps = {}
) {
  // Czas liczony od WEJŚCIA, nie od zapytania do bazy — do dziennika ma trafić to,
  // ile czekał użytkownik, razem z embedowaniem zapytania. Ono jest tu najdroższe.
  const zaczeto = Date.now();
  const config = getConfig();
  const client = deps.client || getSupabaseClient();

  if (!collectionId) throw err('invalid_input', 'Brak identyfikatora kolekcji.');
  const q = normalizeQuery(query);
  const ids = normalizeDocumentIds(documentIds);

  const limit = Number.isFinite(Number(topK)) && Number(topK) > 0 ? Math.floor(Number(topK)) : config.search.topK;
  // Uwaga na 0: minScore = 0 jest sensowną wartością (diagnostyka), więc sprawdzamy
  // "czy podano liczbę", a nie prawdziwościowość.
  const threshold =
    minScore === undefined || minScore === null || !Number.isFinite(Number(minScore))
      ? config.search.minScore
      : Number(minScore);

  // --- Para embeddingów kolekcji PRZED wyszukiwaniem (sekcja 11) ---------------
  // Wiersz kolekcji czytamy nie po to, żeby ją z czymś PORÓWNAĆ, tylko po to,
  // żeby wiedzieć, CZYM liczyć wektor zapytania — patrz komentarz przy providerze.
  const { data: coll, error: cErr } = await client
    .from('rag_collections')
    .select('id, embed_provider, embed_model, embed_dim')
    .eq('id', collectionId)
    .single();
  // =========================================================================
  //  BRAK WIERSZA TO NIE TO SAMO CO BŁĄD ZAPYTANIA.
  //
  //  Wcześniej `cErr || !coll` sklejało oba w „Kolekcja nie istnieje." i to
  //  kosztowało pomyłkę diagnostyczną przy migracji 021: dopóki kolumna
  //  embed_provider nie istniała, select wywalał się na nieznanej kolumnie,
  //  a KAŻDA kolekcja raportowała „nie istnieje" — komunikat wysyłał szukać
  //  w zupełnie złym miejscu.
  //
  //  Rozróżnienie po sygnaturze, bo `.single()` sygnalizuje BRAK WIERSZA
  //  również błędem (PostgREST: PGRST116, „The result contains 0 rows"),
  //  a nie pustym `data`. Nie da się więc odróżnić tych przypadków po samej
  //  obecności `error` — trzeba spojrzeć, co to za błąd.
  // =========================================================================
  const brakWiersza =
    !cErr || cErr.code === 'PGRST116' || /0 rows|not found/i.test(cErr.message || '');
  if (cErr && !brakWiersza) {
    throw err(
      'internal',
      `Nie udało się odczytać kolekcji: ${cErr.message}. ` +
        `Jeśli mowa o nieznanej kolumnie — uruchom zaległą migrację z katalogu supabase/.`
    );
  }
  if (!coll) throw err('not_found', 'Kolekcja nie istnieje.');

  // Strażnik: para, dla której rdzeń nie ma implementacji dostawcy. Odmowa PRZED
  // liczeniem czegokolwiek — inaczej wyszłoby to dopiero komunikatem zaślepki.
  const nieobslugiwana = nieobslugiwanaPara(coll);
  if (nieobslugiwana) throw err('model_mismatch', `${nieobslugiwana} Wyszukiwanie wstrzymane.`);

  // --- Wektor zapytania: embedQuery, NIE embedDocuments (6.1) -------------------
  // Dokumenty embedowano z doklejonym heading_path (8.2); zapytanie nie dostaje
  // żadnego heading_path — ta asymetria jest zamierzona.
  //
  // =========================================================================
  //  KOLEKCJA JEST ŹRÓDŁEM PRAWDY DLA WŁASNEGO EMBEDOWANIA.
  //
  //  Wektor zapytania MUSI powstać tą samą parą (dostawca, model), którą
  //  policzono wektory w bazie — i para ta jest zapisana W KOLEKCJI.
  //  RAG_EMBED_PROVIDER i RAG_EMBED_MODEL to DOMYŚLNE DLA NOWYCH kolekcji
  //  (collections.js:85), nie sterują istniejącymi. Dzięki temu dwie kolekcje
  //  na dwóch dostawcach przeszukuje się W TEJ SAMEJ CHWILI, przy jednej
  //  konfiguracji serwera — każda swoją drogą.
  //
  //  Do rundy 3 stało tu `embedConfigFromGlobal(config)` plus odmowa, gdy
  //  para kolekcji rozjeżdżała się z konfiguracją. To był ten sam błąd
  //  projektowy co w documents.js: kolekcja pamiętała wybór, ale go nie
  //  napędzała. Reguła i mapowanie: embedding.js, `embedConfigDlaKolekcji`.
  // =========================================================================
  const provider = deps.provider || createEmbeddingProvider(embedConfigDlaKolekcji(coll, config));
  const vector = await provider.embedQuery(q);
  if (!Array.isArray(vector) || vector.length === 0) {
    throw err('internal', 'Provider nie zwrócił wektora zapytania.');
  }

  // Kanoniczny literał pgvector — ta sama konwencja co przy zapisie w embedNextBatch.
  const literal = '[' + vector.join(',') + ']';

  // --- Ścieżka tekstowa uruchamia się TYLKO dla zapytań z identyfikatorem (11.2).
  // Bez identyfikatora zachowanie jest bit w bit dzisiejsze: ten sam limit w SQL,
  // ten sam próg, ta sama kolejność. To dlatego brak regresji na pytaniach
  // semantycznych jest gwarantowany konstrukcją, a nie potwierdzany pomiarem.
  const identyfikatory = identyfikatoryZapytania(q);
  const hybryda = identyfikatory.length > 0;

  const { data, error } = await client.rpc(RPC, {
    p_collection_id: collectionId,
    p_query_embedding: literal,
    // Przy fuzji sięgamy GŁĘBOKO — cel bywa daleko w rankingu wektorowym i dopiero
    // wzmocnienie go wyciąga (zmierzone pozycje: 8, 31, 58 przy topK = 5).
    p_limit: hybryda ? Math.max(limit, GLEBOKOSC_FUZJI) : config.search.dedup ? limit * 3 : limit,
    p_document_ids: ids,
  });
  if (error) throwRpc(error);

  const rows = Array.isArray(data) ? data : [];

  // Odległość → score, sortowanie malejąco. Odcięcie progiem robi dopiero fuzja,
  // bo trafienie tekstowe wolno wpuścić PONIŻEJ progu wektorowego.
  const wektorowe = rows
    .map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      fileName: r.file_name,
      headingPath: r.heading_path,
      pageFrom: r.page_from,
      pageTo: r.page_to,
      content: r.content,
      score: round4(distanceToScore(r.distance)),
    }))
    .sort((a, b) => b.score - a.score);

  // null (nie []) gdy ścieżki nie pytaliśmy — to rozróżnienie niesie regułę negatywną.
  let tekstowe = null;
  if (hybryda) {
    const { data: dataT, error: errT } = await client.rpc(RPC_TEKST, {
      p_collection_id: collectionId,
      p_query: identyfikatory.join(' '),
      p_limit: Math.max(limit * 4, 20),
      p_document_ids: ids,
    });
    if (errT) throwRpc(errT, RPC_TEKST);
    tekstowe = (Array.isArray(dataT) ? dataT : []).map((r) => ({
      chunkId: r.chunk_id,
      textRank: r.text_rank,
    }));
  }

  // GŁĘBIEJ, GDY ODSIEW WŁĄCZONY. Odsiew usuwa kandydatów, więc bez zapasu
  // `topK` przestawałby być dotrzymany dokładnie tam, gdzie powtórek jest najwięcej.
  const { hits, odsiane, regulaNegatywna } = polaczTrafienia({
    wektorowe,
    tekstowe,
    prog: threshold,
    limit,
    dedup: config.search.dedup,
  });

  // DZIENNIK — bez `await`, bo to warstwa OBOK ścieżki odpowiedzi (11.3).
  // `zapiszWyszukiwanie` nie rzuca; najgorsze, co może zrobić, to ostrzeżenie w konsoli.
  zapiszWyszukiwanie(
    {
      collectionId,
      query: q,
      documentIds: ids,
      topK: limit,
      minScore: threshold,
      hits,
      hybrid: hybryda,
      odsiane,
      noResults: hits.length === 0,
      regulaNegatywna,
      durationMs: Date.now() - zaczeto,
    },
    { client: deps.client }
  );

  // `odsiane` wychodzi na zewnątrz: usunięcie ma być WIDOCZNE, nie ciche.
  return { hits, noResults: hits.length === 0, odsiane };
}
