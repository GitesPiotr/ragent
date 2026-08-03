import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  znormalizujLokalne,
  pasujeDoSzukania,
  odfiltruj,
  wytworcyZKatalogu,
  policz,
  zadaniaKorzystajace,
  komunikatBlokady,
  niedostepneWlaczone,
  wyjasnienieNiedostepnego,
  kluczModelu,
  FILTRY_DOMYSLNE,
} from './katalogModeli.js';

// Trzy modele chmurowe + dwa lokalne, dobrane tak, żeby każdy filtr
// odcinał COŚ INNEGO — inaczej test przechodzi przy zamienionych warunkach.
const KATALOG = [
  {
    id: 'anthropic/claude-haiku-4.5', label: 'Anthropic: Claude Haiku 4.5',
    provider: 'openrouter', wytworca: 'anthropic',
    deklarujeTools: true, darmowy: false,
  },
  {
    id: 'inclusionai/ling-3.0-flash:free', label: 'Ling-3.0-flash (free)',
    provider: 'openrouter', wytworca: 'inclusionai',
    deklarujeTools: false, darmowy: true,
  },
  {
    id: 'openrouter/fusion', label: 'OpenRouter: Fusion',
    provider: 'openrouter', wytworca: 'openrouter',
    deklarujeTools: false, darmowy: false,
  },
];

const WLACZONE = new Set([
  kluczModelu('openrouter', 'anthropic/claude-haiku-4.5'),
  kluczModelu('ollama', 'mistral-nemo'),
]);

// --- modele lokalne -----------------------------------------------------------

test('model lokalny dostaje ten sam kształt rekordu co chmurowy', () => {
  const [m] = znormalizujLokalne([{ id: 'mistral-nemo', label: 'mistral-nemo:latest' }]);
  assert.equal(m.provider, 'ollama');
  assert.equal(m.gdzie, 'lokalny');
  // „darmowy", NIE „darmowy z limitem" — chodzi na własnej maszynie, więc
  // nie ma ani opłaty, ani dziennego limitu zapytań.
  assert.equal(m.koszt, 'darmowy');
  assert.equal(m.darmowy, true);
  // Ceny NULL, nie zero: null znaczy „nie dotyczy", zero znaczyłoby
  // „zmierzone zero" i wpadło w tę samą gałąź co darmowy model chmurowy.
  assert.equal(m.cenaWejsciaZaMln, null);
  assert.equal(m.cenaWyjsciaZaMln, null);
});

test('lokalny model ma BRAK DEKLARACJI, a nie "nie obsługuje"', () => {
  // Ollama nie publikuje odpowiednika supported_parameters. Napisanie
  // „nie obsługuje" byłoby zmyślaniem faktu, którego nikt nie sprawdził.
  const [m] = znormalizujLokalne([{ id: 'llama3' }]);
  assert.equal(m.narzedzia, 'bez deklaracji');
  assert.doesNotMatch(m.narzedzia, /nie obsługuje|bez obsługi/);
});

test('lokalne: brak id odsiewany, etykieta z id, sortowanie', () => {
  const lista = znormalizujLokalne([{ id: 'zeta' }, { id: '' }, null, { id: 'alfa' }]);
  assert.deepEqual(lista.map((m) => m.id), ['alfa', 'zeta']);
  assert.equal(lista[0].label, 'alfa');
  assert.deepEqual(znormalizujLokalne(null), []);
});

// --- wyszukiwarka -------------------------------------------------------------

test('szuka po nazwie ORAZ po identyfikatorze', () => {
  const m = KATALOG[0];
  assert.equal(pasujeDoSzukania(m, 'haiku'), true, 'po fragmencie nazwy');
  assert.equal(pasujeDoSzukania(m, 'anthropic/'), true, 'po fragmencie id');
  assert.equal(pasujeDoSzukania(m, 'HAIKU'), true, 'bez względu na wielkość liter');
  assert.equal(pasujeDoSzukania(m, '  haiku  '), true, 'z białymi znakami wokół');
  assert.equal(pasujeDoSzukania(m, 'gemini'), false);
});

test('pusta fraza przepuszcza wszystko', () => {
  for (const f of ['', '   ', null, undefined]) {
    assert.equal(pasujeDoSzukania(KATALOG[0], f), true);
  }
});

// --- filtry, każdy osobno -----------------------------------------------------

test('filtr: tylko z deklarowaną obsługą narzędzi', () => {
  const w = odfiltruj(KATALOG, { tylkoZNarzedziami: true }, WLACZONE);
  assert.deepEqual(w.map((m) => m.wytworca), ['anthropic']);
});

test('filtr narzędzi jest DOMYŚLNIE WYŁĄCZONY', () => {
  // Sedno ustalenia z rundy 2: 66 modeli nie ma tej flagi, a openrouter/fusion
  // — jeden z nich — wywołał narzędzia poprawnie. Filtr włączony domyślnie
  // schowałby je bez słowa.
  assert.equal(FILTRY_DOMYSLNE.tylkoZNarzedziami, false);
  const bez = odfiltruj(KATALOG, {}, WLACZONE);
  assert.equal(bez.length, 3, 'domyślnie widać też modele bez deklaracji');
  assert.ok(bez.some((m) => m.id === 'openrouter/fusion'));
});

test('filtr: tylko darmowe', () => {
  const w = odfiltruj(KATALOG, { tylkoDarmowe: true }, WLACZONE);
  assert.deepEqual(w.map((m) => m.wytworca), ['inclusionai']);
});

test('filtr: tylko włączone', () => {
  const w = odfiltruj(KATALOG, { tylkoWlaczone: true }, WLACZONE);
  assert.deepEqual(w.map((m) => m.id), ['anthropic/claude-haiku-4.5']);
});

test('filtr włączonych patrzy na PARĘ dostawca+model', () => {
  // 'mistral-nemo' jest włączony dla ollamy. Ten sam identyfikator
  // u openroutera włączony NIE jest i ma się nie prześlizgnąć.
  const podstepny = [{ id: 'mistral-nemo', label: 'x', provider: 'openrouter', wytworca: 'm', deklarujeTools: false, darmowy: false }];
  assert.equal(odfiltruj(podstepny, { tylkoWlaczone: true }, WLACZONE).length, 0);
});

test('filtr: wytwórca', () => {
  const w = odfiltruj(KATALOG, { wytworca: 'openrouter' }, WLACZONE);
  assert.deepEqual(w.map((m) => m.id), ['openrouter/fusion']);
  assert.equal(odfiltruj(KATALOG, { wytworca: '' }, WLACZONE).length, 3);
});

test('filtry łączą się koniunkcją i potrafią dać pusto', () => {
  // darmowy ORAZ z deklaracją narzędzi — w tym zestawie nie ma takiego.
  const w = odfiltruj(KATALOG, { tylkoDarmowe: true, tylkoZNarzedziami: true }, WLACZONE);
  assert.deepEqual(w, []);
});

test('fraza działa razem z filtrami', () => {
  const w = odfiltruj(KATALOG, { fraza: 'ling', tylkoDarmowe: true }, WLACZONE);
  assert.equal(w.length, 1);
  assert.equal(odfiltruj(KATALOG, { fraza: 'ling', tylkoZNarzedziami: true }, WLACZONE).length, 0);
});

test('lista wytwórców pochodzi z danych, nie z wpisu', () => {
  assert.deepEqual(wytworcyZKatalogu(KATALOG), ['anthropic', 'inclusionai', 'openrouter']);
  // Lokalne nie mają wytwórcy — puste nie mogą trafić do listy rozwijanej.
  assert.deepEqual(wytworcyZKatalogu(znormalizujLokalne([{ id: 'llama3' }])), []);
});

// --- licznik ------------------------------------------------------------------

test('licznik "N z M, włączonych: K" liczy K z WIDOCZNYCH', () => {
  const widoczne = odfiltruj(KATALOG, { tylkoDarmowe: true }, WLACZONE);
  const l = policz(KATALOG, widoczne, WLACZONE);
  // Gdyby K liczyło się z całości konta, pokazałoby „włączonych: 2" nad listą,
  // w której nie ma ani jednego włączonego.
  assert.deepEqual(l, { widoczne: 1, wszystkie: 3, wlaczone: 0 });

  const bezFiltru = policz(KATALOG, odfiltruj(KATALOG, {}, WLACZONE), WLACZONE);
  assert.deepEqual(bezFiltru, { widoczne: 3, wszystkie: 3, wlaczone: 1 });
});

// --- blokada wyłączenia -------------------------------------------------------

const PRZYPISANIA = {
  agent_domyslny: { provider: 'openrouter', model_id: 'anthropic/claude-haiku-4.5' },
  rag_pojecia: { provider: 'ollama', model_id: 'mistral-nemo' },
  mentor: { provider: 'openrouter', model_id: 'anthropic/claude-haiku-4.5' },
};

test('model przypisany do dwóch zadań zwraca oba', () => {
  const role = zadaniaKorzystajace('openrouter', 'anthropic/claude-haiku-4.5', PRZYPISANIA);
  assert.deepEqual(role.sort(), ['agent_domyslny', 'mentor']);
});

test('model nieprzypisany wolno wyłączyć', () => {
  assert.deepEqual(zadaniaKorzystajace('openrouter', 'openrouter/fusion', PRZYPISANIA), []);
  assert.equal(komunikatBlokady([]), null);
});

test('ten sam model u innego dostawcy NIE jest tym przypisanym', () => {
  assert.deepEqual(zadaniaKorzystajace('ollama', 'anthropic/claude-haiku-4.5', PRZYPISANIA), []);
});

// --- włączone, ale niedostępne ------------------------------------------------

// Lista z bazy: dwa modele są w katalogu, `ollama/llama3` już nie.
const DOPUSZCZONE = [
  { provider: 'openrouter', model_id: 'anthropic/claude-haiku-4.5', label: 'Anthropic: Claude Haiku 4.5' },
  { provider: 'ollama', model_id: 'mistral-nemo', label: 'mistral-nemo:latest' },
  { provider: 'ollama', model_id: 'llama3', label: 'llama3:latest' },
];
const LOKALNE = znormalizujLokalne([{ id: 'mistral-nemo' }]);
const KATALOGI = { openrouter: KATALOG, ollama: LOKALNE };

test('model z bazy, którego nie ma w katalogu, trafia na listę niedostępnych', () => {
  // Bez tej listy `ollama/llama3` nie ma w interfejsie ŻADNEGO przełącznika:
  // nie pojawia się w żadnym wierszu, a mimo to liczy się na koncie.
  const n = niedostepneWlaczone(DOPUSZCZONE, KATALOGI);
  assert.deepEqual(n.map((m) => m.id), ['llama3']);
  assert.equal(n[0].powod, 'znikl');
});

test('niedostępny dostaje KSZTAŁT REKORDU KATALOGU, nie wiersza bazy', () => {
  // Dzięki temu wchodzi w tę samą funkcję przełączania i tę samą blokadę
  // przypisań, co zwykły wiersz listy — bez drugiej ścieżki zapisu.
  const [m] = niedostepneWlaczone(DOPUSZCZONE, KATALOGI);
  assert.equal(m.id, 'llama3');
  assert.equal(m.provider, 'ollama');
  assert.equal(m.label, 'llama3:latest');
  assert.equal(m.model_id, undefined);
});

test('bez migawki nazwy w bazie etykietą zostaje identyfikator', () => {
  const [m] = niedostepneWlaczone([{ provider: 'ollama', model_id: 'llama3', label: null }], KATALOGI);
  assert.equal(m.label, 'llama3');
});

test('KATALOG, KTÓRY SIĘ NIE WCZYTAŁ, NIE OGŁASZA ZNIKNIĘCIA MODELI', () => {
  // null = „nie wiem". Gdyby przyjąć tu pustą tablicę, każda czkawka
  // OpenRoutera pokazywałaby wszystkie modele konta jako zniknięte u dostawcy.
  const n = niedostepneWlaczone(DOPUSZCZONE, { openrouter: null, ollama: LOKALNE });
  assert.deepEqual(n.map((m) => m.id), ['llama3'], 'ollama orzeka, openrouter nie');
  assert.deepEqual(niedostepneWlaczone(DOPUSZCZONE, { openrouter: null, ollama: null }), []);
  assert.deepEqual(niedostepneWlaczone(DOPUSZCZONE, null), []);
});

test('katalog PUSTY (wczytany) to co innego niż katalog niewczytany', () => {
  // Ollama odpowiedziała i nie ma ani jednego modelu — wtedy włączony
  // `mistral-nemo` NAPRAWDĘ jest nie do wybrania i ma się pokazać.
  const n = niedostepneWlaczone(DOPUSZCZONE, { openrouter: KATALOG, ollama: [] });
  assert.deepEqual(n.map((m) => m.id), ['llama3', 'mistral-nemo']);
});

test('dostawca bez katalogu w tej karcie ma WŁASNY powód, nie "zniknął"', () => {
  // Baza przyjmuje też anthropic i openai (PROVIDERS w lib/config/models.js),
  // a ta karta ich nie listuje. Model nie zniknął — my go tu nie pokazujemy,
  // i napisanie „zniknął z katalogu dostawcy" byłoby fałszem.
  const n = niedostepneWlaczone(
    [{ provider: 'anthropic', model_id: 'claude-haiku-4-5', label: 'Haiku' }],
    KATALOGI,
  );
  assert.equal(n.length, 1);
  assert.equal(n[0].powod, 'brak-katalogu');
  assert.match(wyjasnienieNiedostepnego('brak-katalogu', 'anthropic'), /anthropic/);
  assert.doesNotMatch(wyjasnienieNiedostepnego('brak-katalogu', 'anthropic'), /zniknął/);
  assert.match(wyjasnienieNiedostepnego('znikl', 'ollama'), /zniknął z katalogu/);
});

test('model obecny w katalogu INNEGO dostawcy nadal jest niedostępny', () => {
  // 'openrouter/fusion' jest w katalogu OpenRoutera. Włączony dla ollamy
  // to inny byt i nie wolno go uznać za znaleziony.
  const n = niedostepneWlaczone(
    [{ provider: 'ollama', model_id: 'openrouter/fusion', label: 'x' }],
    KATALOGI,
  );
  assert.deepEqual(n.map((m) => m.provider), ['ollama']);
});

test('pusta lista dopuszczonych i śmieci nie wywracają funkcji', () => {
  assert.deepEqual(niedostepneWlaczone([], KATALOGI), []);
  assert.deepEqual(niedostepneWlaczone(null, KATALOGI), []);
  assert.deepEqual(niedostepneWlaczone([null, {}, { provider: 'ollama' }], KATALOGI), []);
});

test('licznik NIE liczy niedostępnych — mówi o tym, co da się wybrać', () => {
  // Sekcja niedostępnych stoi nad listą, ale licznik opisuje listę.
  // `ollama/llama3` jest włączony na koncie i nie ma go w żadnej z tych liczb.
  const l = policz(LOKALNE, odfiltruj(LOKALNE, {}, new Set(
    DOPUSZCZONE.map((m) => kluczModelu(m.provider, m.model_id)),
  )), new Set(DOPUSZCZONE.map((m) => kluczModelu(m.provider, m.model_id))));
  assert.deepEqual(l, { widoczne: 1, wszystkie: 1, wlaczone: 1 });
});

test('komunikat blokady mówi, DO KTÓREGO zadania', () => {
  // Bez tej informacji użytkownik zostaje ze zgadywanką, które z trzech pól odpiąć.
  assert.equal(
    komunikatBlokady(['mentor']),
    'Nie można wyłączyć — ten model jest przypisany jako model mentora. Najpierw zmień przypisanie.',
  );
  assert.equal(
    komunikatBlokady(['agent_domyslny', 'mentor']),
    'Nie można wyłączyć — ten model jest przypisany jako domyślny model agenta i model mentora. Najpierw zmień przypisanie.',
  );
  assert.match(komunikatBlokady(['rag_pojecia']), /model do pojęć RAG/);
});
