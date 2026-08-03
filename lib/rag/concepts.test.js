import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizujEtykiete, liczWyrazy, providerConfigFromGlobal } from './concepts.js';
import {
  sparsujOdpowiedz,
  schematOdpowiedzi,
  zbudujInstrukcje,
  createConceptProvider,
} from './concepts-provider.js';

// Sesja 7. Wszystkie przypadki pochodzą z pomiarów na kolekcji „Regulaminy"
// albo z realnych zachowań modeli 7B, nie z wyobraźni.

// --- label_normalized ------------------------------------------------------------

test('normalizacja zrównuje wielkość liter i odstępy', () => {
  assert.equal(normalizujEtykiete('Urlop Wypoczynkowy'), 'urlop wypoczynkowy');
  assert.equal(normalizujEtykiete('  urlop   wypoczynkowy  '), 'urlop wypoczynkowy');
  assert.equal(normalizujEtykiete('okres\nwypowiedzenia'), 'okres wypowiedzenia');
});

test('NFC scala złożone znaki diakrytyczne — bez tego unique ich nie połączy', () => {
  // "ą" jako jeden punkt kodowy (U+0105) kontra "a" + ogonek (U+0061 U+0328).
  // Wizualnie identyczne, bajtowo różne. W grafie stanęłyby dwa węzły nie do
  // odróżnienia okiem. Ta sama klasa pułapki co warianty odstępów w paginie RODO.
  const zlozone = 'zwązek pracy'.normalize('NFD');
  const gotowe = 'zwązek pracy';
  assert.notEqual(zlozone, gotowe, 'wejście MUSI być bajtowo różne, inaczej test nic nie sprawdza');
  assert.equal(normalizujEtykiete(zlozone), normalizujEtykiete(gotowe));
});

test('diakrytyki NIE są usuwane — to nie jest robota tej warstwy', () => {
  assert.equal(normalizujEtykiete('Wynagrodzenie'), 'wynagrodzenie');
  assert.notEqual(normalizujEtykiete('urlop'), normalizujEtykiete('urlopy'));
  assert.notEqual(normalizujEtykiete('zażółć'), 'zazolc');
});

test('formy fleksyjne zostają OSOBNE — sklejanie ich to Sesja 8', () => {
  assert.notEqual(normalizujEtykiete('urlop'), normalizujEtykiete('urlopu'));
});

test('model bywa gadatliwy: cudzysłowy i końcowa kropka schodzą', () => {
  assert.equal(normalizujEtykiete('„urlop wypoczynkowy”'), 'urlop wypoczynkowy');
  assert.equal(normalizujEtykiete('"okres wypowiedzenia"'), 'okres wypowiedzenia');
  assert.equal(normalizujEtykiete('praca zdalna.'), 'praca zdalna');
  assert.equal(normalizujEtykiete('praca zdalna,'), 'praca zdalna');
});

test('kropka W ŚRODKU zostaje — inaczej "art. 36" straciłby sens', () => {
  assert.equal(normalizujEtykiete('art. 36'), 'art. 36');
});

test('puste i nietekstowe wejście nie wywraca normalizacji', () => {
  assert.equal(normalizujEtykiete(''), '');
  assert.equal(normalizujEtykiete('   '), '');
  assert.equal(normalizujEtykiete(null), '');
  assert.equal(normalizujEtykiete(undefined), '');
  assert.equal(normalizujEtykiete('"..."'), '');
});

// --- próg śmieci: liczba wyrazów, nie długość ------------------------------------

test('śmieci z korpusu mają poniżej 8 wyrazów', () => {
  // Wszystkie zmierzone na „Regulaminach" — 19 fragmentów, wszystkie śmieciowe.
  for (const [tekst, ile] of [
    ['%', 0],
    ['Rozdział I', 1],
    ['M. SCHULZ', 1],
    ['(uchylony)', 1],
    ['I (Akty ustawodawcze)', 2],
    ['(zawierający art. 671–674 – uchylony)', 3],
  ]) {
    assert.equal(liczWyrazy(tekst), ile, `${tekst}: oczekiwano ${ile} wyrazów`);
    assert.ok(liczWyrazy(tekst) < 8, `${tekst} powinno wypaść pod progiem`);
  }
});

test('POJEDYNCZE LITERY nie są wyrazami — inaczej "U S T A W A" przechodzi', () => {
  // Bez reguły ">=2 litery" ten fragment liczy się jako 12 wyrazów i zostaje
  // uznany za treść. Z regułą ma 2 ("dnia", "czerwca") i wypada.
  const smiec = 'U S T A W A z dnia 26 czerwca 1974 r.';
  assert.equal(liczWyrazy(smiec), 2);
  assert.ok(liczWyrazy(smiec) < 8);
});

test('prawdziwa treść przechodzi — także ta KRÓTKA', () => {
  // Oba przypadki wypadłyby przy progu 200 znaków: 149 i 139 znaków.
  // To rozdział o reklamacjach z BHP (1 z 5 fragmentów) i reguła o urlopie
  // z regulaminu. Mały dokument straciłby 20% treści bez śladu.
  const bhp = 'Reklamację wadliwego sprzętu można złożyć w terminie czternastu dni od stwierdzenia wady.';
  const regulamin = 'Pracownikowi przysługuje prawo do corocznego, nieprzerwanego, płatnego urlopu wypoczynkowego.';
  assert.ok(liczWyrazy(bhp) >= 8, `BHP ma ${liczWyrazy(bhp)} wyrazów`);
  assert.ok(liczWyrazy(regulamin) >= 8, `regulamin ma ${liczWyrazy(regulamin)} wyrazów`);
});

test('liczby i interpunkcja same w sobie nie są wyrazami', () => {
  assert.equal(liczWyrazy('2024, 1089, 1222, 1871'), 0);
  assert.equal(liczWyrazy('§ 1. 2. 3.'), 0);
  assert.equal(liczWyrazy(''), 0);
  assert.equal(liczWyrazy(null), 0);
});

// --- parsowanie odpowiedzi modelu ------------------------------------------------

test('poprawna odpowiedź daje listę etykiet', () => {
  const odp = JSON.stringify({ pojecia: ['urlop wypoczynkowy', 'wymiar urlopu', 'pracownik'] });
  assert.deepEqual(sparsujOdpowiedz(odp, 3), ['urlop wypoczynkowy', 'wymiar urlopu', 'pracownik']);
});

test('model hojny mimo schematu — nadmiar jest PRZYCINANY, nie odrzucany', () => {
  // Odrzucenie całej partii przez jedno pojęcie za dużo kosztowałoby ponowne
  // liczenie wszystkiego, co model już poprawnie zrobił.
  const odp = JSON.stringify({ pojecia: ['a', 'b', 'c', 'd', 'e'] });
  assert.deepEqual(sparsujOdpowiedz(odp, 3), ['a', 'b', 'c']);
});

test('puste i nietekstowe pozycje nie docierają do bazy', () => {
  const odp = JSON.stringify({ pojecia: ['urlop', '', '   ', null, 42, 'praca zdalna'] });
  assert.deepEqual(sparsujOdpowiedz(odp, 3), ['urlop', 'praca zdalna']);
});

test('niepoprawny JSON daje czytelny błąd, nie wyjątek parsera', () => {
  assert.throws(
    () => sparsujOdpowiedz('Oto pojęcia: urlop, praca', 3),
    (e) => e.code === 'internal' && /poprawnego JSON/.test(e.message)
  );
});

test('JSON bez tablicy "pojecia" jest odrzucany', () => {
  assert.throws(() => sparsujOdpowiedz(JSON.stringify({ concepts: ['a'] }), 3), (e) => e.code === 'internal');
  assert.throws(() => sparsujOdpowiedz(JSON.stringify({ pojecia: 'urlop' }), 3), (e) => e.code === 'internal');
});

// --- schemat i instrukcja --------------------------------------------------------

test('schemat domyka liczbę pojęć po stronie dekodera', () => {
  const s = schematOdpowiedzi(3);
  assert.equal(s.properties.pojecia.minItems, 3);
  assert.equal(s.properties.pojecia.maxItems, 3);
  assert.deepEqual(s.required, ['pojecia']);
});

test('instrukcja stawia cztery wymagania, na których stoi jakość', () => {
  const i = zbudujInstrukcje(3);
  assert.match(i, /DOKŁADNIE 3/);
  assert.match(i, /rzeczownik/i, 'rzeczowniki, nie zdania');
  assert.match(i, /po polsku/i, 'język');
  assert.match(i, /Konkretnie/i, 'konkretnie, nie ogólnie');
  assert.match(i, /WYŁĄCZNIE z treści fragmentu/i, 'nie z wiedzy własnej modelu');
  assert.equal(/urlop|wypowiedzeni|odpowiedzialność materialna/i.test(i), false,
    'przykłady NIE mogą pochodzić z dziedziny korpusu — model je przepisuje');
});

// --- dostawca: wybór implementacji ------------------------------------------------

test('nieznany dostawca odrzucany z czytelnym komunikatem', () => {
  assert.throws(
    () => createConceptProvider({ provider: 'openai', model: 'x', perChunk: 3 }),
    (e) =>
      e.code === 'invalid_input' &&
      /ollama \| anthropic \| openrouter/.test(e.message)
  );
});

test('openrouter jest trzecim obsługiwanym dostawcą pojęć', () => {
  // Dołożony w rundzie 8: model pojęć pochodzi od tej rundy z przypisań konta,
  // a katalog do wyboru to katalog OpenRoutera. Bez tej gałęzi dało się
  // w Ustawieniach wskazać model, którego rdzeń nie umie użyć.
  const p = createConceptProvider({
    provider: 'openrouter',
    model: 'mistralai/mistral-nemo',
    perChunk: 2,
    openrouterApiKey: 'x',
  });
  assert.equal(typeof p.dlaFragmentu, 'function');
  assert.equal(p.ilePojec, 2);
});

test('schemat dla OpenRoutera idzie BEZ minItems/maxItems', async () => {
  // Zmierzone, nie założone: pełny schemat dostał 400 od trzech dostawców
  // naraz — „minItems values other than 0 or 1 are not supported (got: [2, 5])".
  // Domyślny perChunk to 2, więc trafiałoby to KAŻDE wywołanie.
  let wyslany = null;
  const pierwotnyFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opcje) => {
    wyslany = JSON.parse(opcje.body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"pojecia":["a","b"]}' } }] }),
    };
  };
  try {
    const p = createConceptProvider({
      provider: 'openrouter', model: 'anthropic/claude-haiku-4.5',
      perChunk: 2, openrouterApiKey: 'x',
    });
    await p.dlaFragmentu('fragment');
  } finally {
    globalThis.fetch = pierwotnyFetch;
  }
  const pojecia = wyslany.response_format.json_schema.schema.properties.pojecia;
  assert.equal(pojecia.minItems, undefined);
  assert.equal(pojecia.maxItems, undefined);
  assert.equal(pojecia.type, 'array', 'reszta schematu nietknięta');
  // Liczba pojęć nie znika — stoi wprost w instrukcji systemowej.
  assert.match(wyslany.messages[0].content, /DOKŁADNIE 2 pojęć/);
});

test('zdjęcie limitów NIE dotyczy Ollamy ani Anthropic', () => {
  // Zdejmujemy wyłącznie na granicy OpenRoutera. Schemat, który dostaje
  // rdzeń, zostaje pełny — inaczej osłabilibyśmy dwie działające ścieżki.
  const s = schematOdpowiedzi(2);
  assert.equal(s.properties.pojecia.minItems, 2);
  assert.equal(s.properties.pojecia.maxItems, 2);
});

test('openrouter bez klucza mówi WPROST, czego brakuje', async () => {
  const p = createConceptProvider({ provider: 'openrouter', model: 'x', perChunk: 2 });
  await assert.rejects(
    () => p.dlaFragmentu('cokolwiek'),
    (e) => e.code === 'no_key' && /OPENROUTER_API_KEY/.test(e.message)
  );
});

// --- nadpisanie modelu pojęć z warstwy HTTP (runda 8) -----------------------------

const CFG = {
  concept: {
    provider: 'ollama',
    model: 'mistral-nemo',
    perChunk: 2,
    apiKey: 'klucz-anthropic',
    openrouterApiKey: 'klucz-openrouter',
  },
  embed: { ollamaUrl: 'http://localhost:11434' },
};

test('bez nadpisania zostaje konfiguracja ze zmiennych środowiskowych', () => {
  const c = providerConfigFromGlobal(CFG);
  assert.equal(c.provider, 'ollama');
  assert.equal(c.model, 'mistral-nemo');
});

test('nadpisanie zmienia WYŁĄCZNIE dostawcę i model', () => {
  // Klucze, perChunk i adres Ollamy zostają rdzenia — warstwa HTTP mówi CO,
  // rdzeń wie JAK. Gdyby nadpisanie niosło też klucz, AIDEAS musiałby go znać.
  const c = providerConfigFromGlobal(CFG, {
    provider: 'openrouter',
    model: 'qwen/qwen3.7-flash',
  });
  assert.equal(c.provider, 'openrouter');
  assert.equal(c.model, 'qwen/qwen3.7-flash');
  assert.equal(c.perChunk, 2, 'perChunk nietknięty');
  assert.equal(c.apiKey, 'klucz-anthropic', 'klucz Anthropic nietknięty');
  assert.equal(c.openrouterApiKey, 'klucz-openrouter', 'klucz OpenRoutera nietknięty');
  assert.equal(c.ollamaUrl, 'http://localhost:11434', 'adres Ollamy nietknięty');
});

test('NADPISANIE NIEPEŁNE JEST POMIJANE W CAŁOŚCI', () => {
  // Sam dostawca bez modelu dałby dostawcę bez modelu; sam model bez dostawcy
  // wysłałby identyfikator OpenRoutera do Ollamy. Oba kończą się błędem
  // dopiero przy pierwszym fragmencie, więc odsiewamy je tutaj.
  for (const zle of [
    { provider: 'openrouter' },
    { model: 'qwen/qwen3.7-flash' },
    { provider: '', model: 'x' },
    { provider: 'openrouter', model: '' },
    null,
    undefined,
  ]) {
    const c = providerConfigFromGlobal(CFG, zle);
    assert.equal(c.provider, 'ollama', `pominięte: ${JSON.stringify(zle)}`);
    assert.equal(c.model, 'mistral-nemo');
  }
});

test('dostawca da się wywołać bez modelu i bez sieci (wstrzyknięty transport)', async () => {
  const wolania = [];
  const p = createConceptProvider(
    { provider: 'ollama', model: 'x', perChunk: 2 },
    {
      transport: async (user) => {
        wolania.push(user);
        return JSON.stringify({ pojecia: ['urlop wypoczynkowy', 'wymiar urlopu'] });
      },
    }
  );
  const out = await p.dlaFragmentu('Art. 152. Pracownikowi przysługuje urlop.');
  assert.deepEqual(out, ['urlop wypoczynkowy', 'wymiar urlopu']);
  assert.equal(wolania.length, 1, 'jeden fragment = jedno wywołanie modelu');
  assert.match(wolania[0], /Art\. 152/);
});
