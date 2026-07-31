// Dostawca POJĘĆ (Sesja 7). Pierwszy moduł w projekcie, który woła model JĘZYKOWY,
// nie embeddingowy. Czysty JS, zero React/Next/window.
//
// DWIE IMPLEMENTACJE ZA JEDNYM INTERFEJSEM, wybierane `RAG_CONCEPT_PROVIDER`:
//  • ollama    — model lokalny, DOMYŚLNY. Treść dokumentów nie opuszcza maszyny.
//  • anthropic — claude-haiku-4-5 przez API.
// Przełączenie to zmiana jednej zmiennej w .env.local, bez dotykania kodu.
//
// STRUKTURA JEST WYMUSZANA, NIE PROSZONA. Ollama dostaje schemat JSON w parametrze
// `format` (wymusza go gramatyką dekodera), Anthropic — `output_config.format`
// z `json_schema`. Prośba „zwróć samą listę" i nadzieja to nie jest kontrakt.

function bladDostawcy(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// =============================================================================
//  INSTRUKCJA — na niej stoi cała jakość wariantu 2
// =============================================================================
//
// Cztery wymagania, każde z konkretnego powodu zaobserwowanego na tym korpusie:
//  1. RZECZOWNIKI, nie zdania — „urlop wypoczynkowy", nie „artykuł mówi o urlopie".
//     Etykieta ma być węzłem grafu, a węzeł to rzecz, nie wypowiedź o rzeczy.
//  2. PO POLSKU — modele 7B chętnie przechodzą na angielski w środku odpowiedzi,
//     a wtedy „vacation" i „urlop" stają się dwoma węzłami tego samego pojęcia.
//  3. KONKRETNIE — „okres wypowiedzenia" niesie informację, „przepis" i „dokument"
//     nie niosą żadnej. Ogólniki skleją cały graf w jeden hub bez znaczenia.
//  4. Z TREŚCI FRAGMENTU — model 7B chętnie dopisuje, co wie z treningu.
//     Pojęcie ma opisywać TEN fragment, bo to on jest cytowany.
//
//  PRZYKŁADY POCHODZĄ Z OBCEJ DZIEDZINY (kuchnia) — I TO JEST ŚWIADOME.
//
//  Pierwsza wersja instrukcji używała przykładów z prawa pracy („ekwiwalent za
//  urlop", „wypowiedzenie zmieniające", „odpowiedzialność materialna"). Zmierzone
//  na 05-instrukcja-bhp.pdf: mistral-nemo dla fragmentu o PORAŻENIU PRĄDEM zwrócił
//  dokładnie te trzy etykiety — przepisał przykłady z instrukcji zamiast czytać
//  fragment.
//
//  Groźne jest nie samo przepisywanie, tylko to, że na docelowym korpusie byłoby
//  NIEWIDOCZNE: w Kodeksie pracy „ekwiwalent za urlop" wygląda wiarygodnie pod
//  każdym fragmentem. Przykłady z kuchni nie mogą wystąpić w żadnym dokumencie
//  tej kolekcji, więc każdy wyciek rzuca się w oczy natychmiast.
export function zbudujInstrukcje(ilePojec) {
  return [
    'Jesteś narzędziem do indeksowania dokumentów. Z podanego fragmentu wyciągasz pojęcia kluczowe.',
    '',
    `Zwróć DOKŁADNIE ${ilePojec} pojęć. Zasady:`,
    '1. Każde pojęcie to rzeczownik albo fraza rzeczownikowa — nie zdanie i nie opis.',
    '   Przykład formy (z obcej dziedziny, NIE kopiuj tych słów):',
    '   DOBRZE: "temperatura pieczenia", "czas wyrastania ciasta"',
    '   ŹLE: "fragment mówi o pieczeniu", "ciasto powinno wyrosnąć"',
    '2. Zawsze po polsku, nawet jeśli fragment jest w innym języku.',
    '3. Konkretnie, nie ogólnie. Pojęcie ma odróżniać ten fragment od innych.',
    '   ŹLE: "przepis", "dokument", "informacja", "prawo", "zasady", "wymagania"',
    '4. WYŁĄCZNIE z treści fragmentu. Nie dopisuj tego, co wiesz skądinąd,',
    '   i nie używaj słów z tej instrukcji — użyj słów z fragmentu.',
    '',
    'Odpowiadasz wyłącznie danymi w podanym formacie. Bez wstępu, bez wyjaśnień, bez komentarza.',
  ].join('\n');
}

// Schemat wymuszany na obu dostawcach. `minItems`/`maxItems` domykają liczbę pojęć
// po stronie dekodera — bez tego model bywa hojny albo skąpy.
export function schematOdpowiedzi(ilePojec) {
  return {
    type: 'object',
    properties: {
      pojecia: {
        type: 'array',
        items: { type: 'string' },
        minItems: ilePojec,
        maxItems: ilePojec,
      },
    },
    required: ['pojecia'],
    additionalProperties: false,
  };
}

// Odpowiedź modelu (tekst) → tablica etykiet. Wydzielone i EKSPORTOWANE, bo to
// jedyne miejsce, które może się wywrócić na cudzych danych — a da się je
// przetestować bez modelu.
export function sparsujOdpowiedz(tekst, ilePojec) {
  let dane;
  try {
    dane = typeof tekst === 'string' ? JSON.parse(tekst) : tekst;
  } catch {
    throw bladDostawcy('internal', `Model nie zwrócił poprawnego JSON-a: ${String(tekst).slice(0, 200)}`);
  }
  if (!dane || !Array.isArray(dane.pojecia)) {
    throw bladDostawcy('internal', `Odpowiedź modelu nie ma tablicy "pojecia": ${JSON.stringify(dane).slice(0, 200)}`);
  }
  // Model bywa hojny mimo schematu — przycinamy zamiast odrzucać całą partię.
  // Puste i niełańcuchowe pozycje odsiewamy tutaj, żeby nie doszły do bazy.
  return dane.pojecia
    .filter((p) => typeof p === 'string' && p.trim())
    .slice(0, ilePojec);
}

// =============================================================================
//  OLLAMA
// =============================================================================
async function ollamaChat(ollamaUrl, model, system, user, schemat) {
  const endpoint = ollamaUrl.replace(/\/+$/, '') + '/api/chat';
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        // `format` z pełnym schematem — Ollama wymusza go na dekoderze.
        format: schemat,
        // Temperatura 0: indeksowanie ma być powtarzalne. Ta sama treść przy
        // ponownym uruchomieniu ma dać tę samą etykietę, inaczej wznawianie
        // po błędzie tworzyłoby nowe pojęcia zamiast trafiać w istniejące.
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (err) {
    throw bladDostawcy(
      'ollama_unavailable',
      `Ollama nie odpowiada pod ${ollamaUrl}: ${(err && err.message) || 'brak połączenia'}.`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 404 || /not found/i.test(body)) {
      throw bladDostawcy(
        'ollama_unavailable',
        `Model "${model}" nie jest dostępny w Ollamie. Pobierz go: ollama pull ${model}`
      );
    }
    throw bladDostawcy('ollama_unavailable', `Ollama /api/chat zwróciła ${res.status}: ${body}`);
  }
  const data = await res.json().catch(() => null);
  const tresc = data && data.message && data.message.content;
  if (typeof tresc !== 'string') {
    throw bladDostawcy('internal', `Nieoczekiwana odpowiedź Ollamy dla modelu "${model}".`);
  }
  return tresc;
}

// =============================================================================
//  ANTHROPIC (claude-haiku-4-5)
// =============================================================================
//
// SDK ładowany DYNAMICZNIE — dokładnie tak jak unpdf/mammoth w extract.js. Dzięki
// temu import tego pliku nie wymaga pakietu, dopóki ktoś realnie nie wybierze
// providera `anthropic`. Testy jednostkowe i ścieżka Ollamy działają bez niego.
async function anthropicChat(cfg, system, user, schemat) {
  let Anthropic;
  try {
    Anthropic = (await import('@anthropic-ai/sdk')).default;
  } catch {
    throw bladDostawcy(
      'internal',
      'Biblioteka @anthropic-ai/sdk nie jest zainstalowana. Uruchom: npm install @anthropic-ai/sdk'
    );
  }
  if (!cfg.apiKey) {
    throw bladDostawcy(
      'no_key',
      'Brak ANTHROPIC_API_KEY. Ustaw go w .env.local albo przełącz RAG_CONCEPT_PROVIDER na "ollama".'
    );
  }
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const odp = await client.messages.create({
    model: cfg.model,
    max_tokens: 1024,
    system,
    // Odpowiednik `format` Ollamy: struktura wymuszana, nie proszona.
    output_config: { format: { type: 'json_schema', schema: schemat } },
    messages: [{ role: 'user', content: user }],
  });
  // Refusal ma własny stop_reason i PUSTĄ treść — bez tego sprawdzenia
  // content[0] wywaliłoby się na odmowie klasyfikatora.
  if (odp.stop_reason === 'refusal') {
    throw bladDostawcy('internal', 'Model odmówił przetworzenia fragmentu (stop_reason: refusal).');
  }
  const blok = (odp.content || []).find((b) => b.type === 'text');
  if (!blok) throw bladDostawcy('internal', 'Odpowiedź Anthropic nie zawiera bloku tekstowego.');
  return blok.text;
}

// =============================================================================
//  INTERFEJS
// =============================================================================
//
// cfg: { provider, model, perChunk, ollamaUrl, apiKey }
// deps.transport — wstrzykiwalne do testów (bez modelu i bez sieci).
export function createConceptProvider(cfg, deps = {}) {
  const ilePojec = cfg.perChunk > 0 ? cfg.perChunk : 3;
  const system = zbudujInstrukcje(ilePojec);
  const schemat = schematOdpowiedzi(ilePojec);

  const transport =
    deps.transport ||
    (cfg.provider === 'ollama'
      ? (user) => ollamaChat(cfg.ollamaUrl || 'http://localhost:11434', cfg.model, system, user, schemat)
      : cfg.provider === 'anthropic'
        ? (user) => anthropicChat(cfg, system, user, schemat)
        : null);

  if (!transport) {
    throw bladDostawcy(
      'invalid_input',
      `Nieznany dostawca pojęć: "${cfg.provider}". Dozwolone: ollama | anthropic.`
    );
  }

  return {
    ilePojec,
    // Fragmenty idą PO JEDNYM. Model językowy dostaje jeden fragment i zwraca
    // pojęcia dla niego — zbiorcze wywołanie dla kilku fragmentów naraz zmusza
    // model do pilnowania przyporządkowania, a to pierwsza rzecz, którą 7B gubi.
    // Partia (RAG_CONCEPT_BATCH) dotyczy liczby fragmentów na WYWOŁANIE HTTP
    // rdzenia, nie na wywołanie modelu.
    async dlaFragmentu(tekst) {
      const odp = await transport(String(tekst));
      return sparsujOdpowiedz(odp, ilePojec);
    },
  };
}
