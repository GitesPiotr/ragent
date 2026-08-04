// BRAMKA BUDOWANIA. Import rzuca wyjątek wszędzie poza środowiskiem serwerowym
// (warunek "react-server" w exports paczki), więc próba wciągnięcia tego modułu
// do komponentu klienckiego wywala build zamiast wysłać sekrety do przeglądarki.
// Testy dostają ten sam warunek przez --conditions=react-server w skrypcie "test".
import 'server-only';

// Jedyne miejsce w projekcie, które czyta process.env.
// Reszta kodu (db.js, status.js, warstwa HTTP) bierze konfigurację WYŁĄCZNIE stąd.
// Zgodnie z sekcją 3 SPEC: rdzeń nie zna Reacta, Next.js ani window.

function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === 'true' || value === '1';
}

// Czyta i waliduje konfigurację. Nie rzuca wyjątku przy braku sekretów —
// brakujące wymagane zmienne trafiają do config.missing, a warstwa /status
// zamienia to na czytelny komunikat (no_key) zamiast wywrotki. To jest DoD Sesji 0.
export function getConfig() {
  const env = process.env;

  // Fallback URL wg sekcji 5: RAG_SUPABASE_URL, w razie braku NEXT_PUBLIC_SUPABASE_URL.
  const supabaseUrl = env.RAG_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = env.RAG_SUPABASE_SERVICE_KEY || '';

  const config = {
    tablePrefix: env.RAG_TABLE_PREFIX || 'rag_',

    supabase: {
      url: supabaseUrl,
      serviceKey: supabaseServiceKey,
      configured: Boolean(supabaseUrl && supabaseServiceKey),
    },

    embed: {
      provider: env.RAG_EMBED_PROVIDER || 'ollama',
      model: env.RAG_EMBED_MODEL || 'bge-m3',
      dim: toInt(env.RAG_EMBED_DIM, 1024),
      batch: toInt(env.RAG_EMBED_BATCH, 32),
      docPrefix: env.RAG_EMBED_DOC_PREFIX || '',
      queryPrefix: env.RAG_EMBED_QUERY_PREFIX || '',
      ollamaUrl: env.RAG_OLLAMA_URL || 'http://localhost:11434',
      // Klucz BEZ prefiksu `RAG_` — ten sam, którym płaci czat i dostawca pojęć.
      // Uzasadnienie konwencji stoi przy transporcie w lib/rag/embedding.js.
      // Powtórzony odczyt (jest już w `concept` niżej) jest zamierzony: każda
      // sekcja niesie komplet tego, czego potrzebuje jej dostawca, i da się ją
      // przekazać dalej bez sięgania po sąsiednią.
      openrouterApiKey: env.OPENROUTER_API_KEY || '',
    },

    files: {
      maxFileMb: toInt(env.RAG_MAX_FILE_MB, 25),
    },

    chunk: {
      size: toInt(env.RAG_CHUNK_SIZE, 900),
      max: toInt(env.RAG_CHUNK_MAX, 1400),
      min: toInt(env.RAG_CHUNK_MIN, 150),
      overlap: toInt(env.RAG_CHUNK_OVERLAP, 150),
      prependHeadings: toBool(env.RAG_PREPEND_HEADINGS, true),
    },

    projection: {
      minChunks: toInt(env.RAG_PROJECTION_MIN_CHUNKS, 50),
      mapNeighbors: toInt(env.RAG_MAP_NEIGHBORS, 3),
    },

    search: {
      topK: toInt(env.RAG_TOP_K, 5),
      // 0.45 — wartość DOSTROJONA pomiarem po Sesji 5, nie startowa 0.35 ze specyfikacji
      // (redline 8 każe ją dostroić właśnie wtedy). Na korpusie testowym najwyższy szum
      // z pytań spoza bazy wyniósł 0.4100, a najsłabsze poprawne trafienie 0.4843 —
      // 0.45 leży w środku tego pustego pasa. Przy zmianie modelu embeddingów zmierz
      // od nowa: scripts/diag-prog.mjs. Skala podobieństw zależy od modelu.
      minScore: toFloat(env.RAG_MIN_SCORE, 0.45),
      // ODSIEW POWTÓRZONYCH FRAGMENTÓW (11.1k). Domyślnie WŁĄCZONY.
      // Wyłącznik istnieje, bo ta funkcja USUWA wyniki, a błąd w usuwaniu jest
      // niewidoczny — użytkownik nie zobaczy fragmentu, którego nie dostał.
      // NIE MA progu podobieństwa i to jest wynik pomiaru, nie uproszczenie:
      // pary różniące się WYŁĄCZNIE liczbą („10 mg" wobec „25 mg" w identycznym
      // zdaniu) sięgają 0,9911, a powyżej tej wartości 26 z 27 odsiewanych par
      // ma tekst identyczny CO DO ZNAKU. Próg wektorowy nie kupuje tu nic poza
      // ryzykiem skasowania dawki.
      dedup: env.RAG_DEDUP !== 'off',
      // DZIENNIK WYSZUKIWAŃ (11.3). Domyślnie włączony — po integracji jest to
      // jedyny sposób, żeby dowiedzieć się, co nie działa, zamiast zgadywać
      // z pojedynczych skarg. Wyłącznik istnieje, bo tabela zawiera TREŚĆ ZAPYTAŃ
      // UŻYTKOWNIKÓW i bywa środowisko, w którym nie wolno jej trzymać.
      log: env.RAG_SEARCH_LOG !== 'off',
    },

    concept: {
      // DOMYŚLNIE OLLAMA, wbrew wartości startowej z sekcji 5. Powód jest
      // produktowy, nie techniczny: przy narzędziu dla różnych użytkowników
      // treść ich dokumentów nie wychodzi na zewnątrz. Przełączenie na
      // Anthropic to zmiana tej jednej zmiennej, bez dotykania kodu.
      provider: env.RAG_CONCEPT_PROVIDER || 'ollama',
      model: env.RAG_CONCEPT_MODEL || 'mistral-nemo',
      apiKey: env.ANTHROPIC_API_KEY || '',
      // Klucz OpenRoutera — trzeci dostawca pojęć (runda 8). Osobne pole,
      // a nie nadpisanie `apiKey`: dostawcę można przełączyć przypisaniem
      // konta bez restartu serwera, więc OBA klucze muszą być pod ręką naraz.
      // Jedno pole „apiKey" znaczyłoby, że przełączenie dostawcy wymaga
      // zmiany zmiennej środowiskowej — czyli dokładnie tego, co runda 8 znosi.
      openrouterApiKey: env.OPENROUTER_API_KEY || '',
      // 2, nie 3 ze specyfikacji — zmierzone na 01-regulamin-pracy.md (Sesja 7).
      // Trzecia pozycja okazała się śmietnikiem: model, który MUSI zwrócić trzy
      // pojęcia, gdy widzi dwa, dopycha wariantem drugiego albo słowem wyrwanym
      // z kontekstu. Szczegóły i konsekwencja dla Sesji 8: SPEC, punkt Sesji 7.
      perChunk: toInt(env.RAG_CONCEPT_PER_CHUNK, 2),
      mergeThreshold: toFloat(env.RAG_CONCEPT_MERGE_THRESHOLD, 0.88),
      // Drugi sygnał przy scalaniu (Sesja 8) — DOMYŚLNIE WYŁĄCZONY.
      // Sam próg wektorowy nie rozdziela klas na tym korpusie (patrz SPEC, Sesja 8),
      // ale dostrojenie `mergeLexicalMin` wymaga materiału, którego dziś nie ma.
      // Włączenie: RAG_CONCEPT_MERGE_LEXICAL=true.
      mergeLexical: toBool(env.RAG_CONCEPT_MERGE_LEXICAL, false),
      mergeLexicalMin: toFloat(env.RAG_CONCEPT_MERGE_LEXICAL_MIN, 0.82),
      stemMin: toInt(env.RAG_CONCEPT_STEM_MIN, 5),
      // Fragmentów na JEDNO wywołanie HTTP rdzenia (nie na wywołanie modelu —
      // model dostaje fragmenty pojedynczo). Embedowanie ma 32, bo tam jedno
      // wywołanie to milisekundy; tu model 7B liczy sekundami, więc partia 32
      // oznaczałaby żądanie trwające minuty. Dostrojone pomiarem na BHP.
      batch: toInt(env.RAG_CONCEPT_BATCH, 4),
      // Próg śmieci: minimalna liczba wyrazów (≥2 litery) we fragmencie.
      // Zmierzone na „Regulaminach" — histogram ma pustą przerwę między
      // śmieciem (≤6) a treścią (≥10). Patrz komentarz w concepts.js.
      minWords: toInt(env.RAG_CONCEPT_MIN_WORDS, 8),
    },
  };

  // Walidacja: które wymagane zmienne są nieustawione. Nie rzucamy — raportujemy.
  config.missing = [];
  if (!supabaseUrl) {
    config.missing.push('RAG_SUPABASE_URL (lub NEXT_PUBLIC_SUPABASE_URL)');
  }
  if (!supabaseServiceKey) {
    config.missing.push('RAG_SUPABASE_SERVICE_KEY');
  }

  return config;
}
