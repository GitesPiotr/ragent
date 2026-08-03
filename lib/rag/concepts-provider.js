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
//  OPENROUTER
// =============================================================================
//
// Trzeci dostawca pojęć. Dołożony, bo od rundy 8 model pojęć pochodzi
// z przypisań konta, a katalog do wyboru to katalog OpenRoutera — bez tej
// gałęzi dało się w Ustawieniach wskazać model, którego rdzeń nie umie użyć.
//
// BEZ SDK, gołym `fetch` — inaczej niż Anthropic. Powód: API OpenRoutera jest
// zgodne z OpenAI, a tu potrzebne jest jedno wywołanie bez narzędzi i bez
// strumienia. Dokładanie zależności dla jednego POST-a byłoby drugim miejscem,
// w którym trzeba pilnować wersji pakietu.
//
// `response_format` zamiast `output_config` — to jest cała różnica wobec
// Anthropic i jedyny powód, dla którego to osobna funkcja, a nie parametr.
//
// UWAGA: struktura odpowiedzi jest tu PROSZONA, nie wymuszona. Model
// z katalogu OpenRoutera może `response_format` zignorować (zmierzone
// w rundzie 7 na modelach tanich). Dlatego `sparsujOdpowiedz` niżej i tak
// musi sobie radzić z tekstem, który nie jest czystym JSON-em — i radzi,
// bo tak samo zachowuje się słabszy model lokalny w Ollamie.
//
// =============================================================================
//  minItems/maxItems ZDEJMOWANE — ZMIERZONE, NIE ZAŁOŻONE
//
//  Pierwsza wersja tej gałęzi wysyłała schemat w całości i dostała 400 od
//  TRZECH dostawców naraz (Azure, Amazon Bedrock, Anthropic — OpenRouter
//  próbował po kolei):
//    „output_config.format.schema: For 'array' type, 'minItems' values other
//     than 0 or 1 are not supported (got: [2, 5])"
//  Domyślny `perChunk` to 2, więc trafia to KAŻDE wywołanie, nie przypadek
//  brzegowy.
//
//  Zdjęcie tych dwóch pól NIE osłabia gwarancji, bo gwarancji nigdy tu nie
//  było po stronie schematu:
//   • liczba pojęć stoi WPROST w instrukcji systemowej („Zwróć DOKŁADNIE N"),
//   • `sparsujOdpowiedz` i tak przycina do `ilePojec` i odsiewa puste —
//     komentarz przy nim mówi wprost „model bywa hojny MIMO SCHEMATU".
//  Czyli egzekwuje to parser, a schemat był podpowiedzią. Dla Ollamy
//  i Anthropic zostaje bez zmian — zdejmujemy wyłącznie na tej granicy,
//  tak samo jak lib/providers/openrouter.js przekształca kształt schematu
//  pod OpenRoutera i nie rusza pozostałych dostawców.
// =============================================================================
function schematBezLimitow(schemat) {
  const pojecia = { ...(schemat?.properties?.pojecia || {}) };
  delete pojecia.minItems;
  delete pojecia.maxItems;
  return { ...schemat, properties: { ...schemat.properties, pojecia } };
}

async function openrouterChat(cfg, system, user, schemat) {
  if (!cfg.openrouterApiKey) {
    throw bladDostawcy(
      'no_key',
      'Brak OPENROUTER_API_KEY. Ustaw go w .env.local albo wskaż model pojęć u innego dostawcy.'
    );
  }
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.openrouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 1024,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'pojecia',
            schema: schematBezLimitow(schemat),
            strict: true,
          },
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (err) {
    throw bladDostawcy(
      'internal',
      `OpenRouter nie odpowiada: ${(err && err.message) || 'brak połączenia'}.`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) {
      throw bladDostawcy('no_key', 'OpenRouter odrzucił klucz OPENROUTER_API_KEY (401).');
    }
    if (res.status === 402) {
      throw bladDostawcy('internal', 'Brak środków na koncie OpenRoutera (402).');
    }
    throw bladDostawcy('internal', `OpenRouter zwrócił ${res.status}: ${body}`);
  }
  const data = await res.json().catch(() => null);
  const tresc = data?.choices?.[0]?.message?.content;
  if (typeof tresc !== 'string') {
    throw bladDostawcy(
      'internal',
      `Nieoczekiwana odpowiedź OpenRoutera dla modelu "${cfg.model}".`
    );
  }
  return tresc;
}

// =============================================================================
//  INTERFEJS
// =============================================================================
//
// cfg: { provider, model, perChunk, ollamaUrl, apiKey, openrouterApiKey }
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
        : cfg.provider === 'openrouter'
          ? (user) => openrouterChat(cfg, system, user, schemat)
          : null);

  if (!transport) {
    throw bladDostawcy(
      'invalid_input',
      `Nieznany dostawca pojęć: "${cfg.provider}". Dozwolone: ollama | anthropic | openrouter.`
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
