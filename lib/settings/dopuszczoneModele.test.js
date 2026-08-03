import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  modeleKonta,
  kontoMaModele,
  listaModeli,
  modeleOllamy,
  modeleMentora,
  czyModelMentoraDozwolony,
  tekstDostepnychModeli,
  DOSTAWCA_MENTORA,
  ZRODLO,
} from './dopuszczoneModele.js';
import { MODELS_BY_PROVIDER, modelSupportsTemperature } from '../config/models.js';

// Konto, ktore cos wybralo: po jednym modelu u trzech dostawcow.
const DOPUSZCZONE = [
  { provider: 'anthropic', model_id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (szybki, tani)' },
  { provider: 'openrouter', model_id: 'openrouter/fusion', label: 'OpenRouter: Fusion' },
  { provider: 'ollama', model_id: 'llama3.1:8b', label: 'llama3.1:8b' },
];

// --- ksztalt rekordu ----------------------------------------------------------

test('wiersz bazy sprowadza sie do { id, label }', () => {
  const m = modeleKonta(DOPUSZCZONE, 'anthropic');
  assert.deepEqual(m, [{ id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (szybki, tani)' }]);
});

test('brak migawki nazwy — etykieta z identyfikatora', () => {
  const m = modeleKonta([{ provider: 'openai', model_id: 'gpt-5.6-luna', label: null }], 'openai');
  assert.deepEqual(m, [{ id: 'gpt-5.6-luna', label: 'gpt-5.6-luna' }]);
});

test('modele innych dostawcow nie przeciekaja do listy', () => {
  assert.deepEqual(modeleKonta(DOPUSZCZONE, 'openai'), []);
  assert.equal(modeleKonta(DOPUSZCZONE, 'openrouter').length, 1);
});

// --- regula fallbacku ---------------------------------------------------------

test('KONTO BEZ WYBORU dostaje MODELS_BY_PROVIDER, nie pustke', () => {
  // Bez tego kazde istniejace konto, ktore nigdy nie bylo w Ustawieniach,
  // straciloby mozliwosc stworzenia agenta.
  const { modele, zrodlo } = listaModeli([], 'anthropic');
  assert.equal(zrodlo, ZRODLO.DOMYSLNE);
  assert.deepEqual(modele.map((m) => m.id), MODELS_BY_PROVIDER.anthropic.map((m) => m.id));
  assert.deepEqual(listaModeli(null, 'openai').modele.length, 3);
});

test('KONTO Z WYBOREM dostaje DOKLADNIE swoj wybor', () => {
  // Bez doklejania domyslnych „na wszelki wypadek" — inaczej wybor modeli
  // w Ustawieniach nie mialby zadnego skutku.
  const { modele, zrodlo } = listaModeli(DOPUSZCZONE, 'anthropic');
  assert.equal(zrodlo, ZRODLO.KONTO);
  assert.deepEqual(modele.map((m) => m.id), ['claude-haiku-4-5']);
  assert.equal(modele.length < MODELS_BY_PROVIDER.anthropic.length, true);
});

test('fallback patrzy na CALE konto, lista na jednego dostawce', () => {
  // Konto z samym OpenRouterem widzi u OpenAI pusto — swiadomie nic tam
  // nie dopuscilo. Gdyby fallback liczyl per dostawca, dostaloby tam
  // statyczna liste GPT, ktorej nigdy nie wybralo.
  const tylkoOR = [DOPUSZCZONE[1]];
  assert.equal(kontoMaModele(tylkoOR), true);
  assert.deepEqual(listaModeli(tylkoOR, 'openai'), { modele: [], zrodlo: ZRODLO.PUSTE });
  assert.deepEqual(listaModeli(tylkoOR, 'openrouter').modele.map((m) => m.id), ['openrouter/fusion']);
});

test('dostawca bez statycznej listy i bez wyboru konta to PUSTE, nie DOMYSLNE', () => {
  // OpenRouter ma MODELS_BY_PROVIDER.openrouter = [] — interfejs musi umiec
  // odroznic „nic tu nie ma" od „masz domyslne".
  assert.equal(listaModeli([], 'openrouter').zrodlo, ZRODLO.PUSTE);
});

// --- Ollama -------------------------------------------------------------------

const DEMON = [{ id: 'llama3.1:8b', label: 'llama3.1:8b' }, { id: 'qwen2.5:7b', label: 'qwen2.5:7b' }];

test('Ollama: przeciecie listy konta z tym, co naprawde chodzi', () => {
  const r = modeleOllamy(DOPUSZCZONE, DEMON);
  assert.deepEqual(r.modele.map((m) => m.id), ['llama3.1:8b']);
  assert.equal(r.zrodlo, ZRODLO.KONTO);
  assert.equal(r.odfiltrowane, 1);
});

test('Ollama: model dopuszczony, ale usuniety z dysku, NIE trafia do wyboru', () => {
  // `ollama rm` po dopuszczeniu w Ustawieniach. Pokazanie go konczyloby sie
  // bledem dopiero przy rozmowie.
  const r = modeleOllamy([{ provider: 'ollama', model_id: 'llama3', label: 'Llama 3' }], DEMON);
  assert.deepEqual(r.modele, []);
  assert.equal(r.odfiltrowane, 2);
});

test('Ollama: konto bez wyboru widzi wszystko z demona', () => {
  const r = modeleOllamy([], DEMON);
  assert.deepEqual(r.modele.map((m) => m.id), ['llama3.1:8b', 'qwen2.5:7b']);
  assert.equal(r.zrodlo, ZRODLO.DOMYSLNE);
});

test('Ollama: demon pusty to co innego niz nic niedopuszczone', () => {
  // Dwa rozne komunikaty: „pobierz model" wobec „wlacz je w Ustawieniach".
  assert.deepEqual(modeleOllamy(DOPUSZCZONE, []).modele, []);
  assert.equal(modeleOllamy(DOPUSZCZONE, []).odfiltrowane, 0, 'demon pusty: nie ma czego odfiltrowac');
  assert.equal(modeleOllamy(DOPUSZCZONE, DEMON).odfiltrowane, 1, 'demon ma, ale niedopuszczone');
});

// --- mentor -------------------------------------------------------------------

test('DOSTAWCA MENTORA ZOSTAJE STALA "anthropic"', () => {
  // Tryb prowadzenia robi drugie wywolanie ze structured output.
  // lib/providers/index.js NIE przekazuje responseFormat do Ollamy, a openai.js
  // ma je opisane jako niezweryfikowane. Zly dostawca nie rzuca bledem —
  // mentor po cichu przestaje cokolwiek proponowac.
  assert.equal(DOSTAWCA_MENTORA, 'anthropic');
});

test('mentor wybiera tylko sposrod modeli Anthropic dopuszczonych przez konto', () => {
  const { modele } = modeleMentora(DOPUSZCZONE);
  assert.deepEqual(modele.map((m) => m.id), ['claude-haiku-4-5']);
  // OpenRouter i Ollama sa dopuszczone, ale mentora nie napedza.
  assert.equal(modele.some((m) => m.id === 'openrouter/fusion'), false);
});

test('mentor bez wyboru konta ma statyczna liste Anthropic', () => {
  assert.equal(modeleMentora([]).modele.length, MODELS_BY_PROVIDER.anthropic.length);
});

test('walidacja modelu mentora BEZ listy = zachowanie sprzed rundy 6', () => {
  // Tu `null` NIE przepuszcza wszystkiego — inaczej niz w store.js.
  // Awaria odczytu bazy nie moze ROZLUZNIC walidacji serwera; ma wrocic
  // do sprawdzenia wzgledem statycznej listy Anthropic, ktore stalo tu wczesniej.
  assert.equal(czyModelMentoraDozwolony('claude-haiku-4-5', null), true);
  assert.equal(czyModelMentoraDozwolony('claude-opus-4-8', null), true);
  assert.equal(czyModelMentoraDozwolony('cokolwiek', null), false);
  assert.equal(czyModelMentoraDozwolony('openrouter/fusion', null), false);
  // Pusty/nie-napis odpada zawsze — to nie jest kwestia listy.
  assert.equal(czyModelMentoraDozwolony('', null), false);
  assert.equal(czyModelMentoraDozwolony(null, null), false);
  assert.equal(czyModelMentoraDozwolony(42, null), false);
});

test('walidacja modelu mentora: lista podana znaczy werdykt wiazacy', () => {
  assert.equal(czyModelMentoraDozwolony('claude-haiku-4-5', DOPUSZCZONE), true);
  assert.equal(czyModelMentoraDozwolony('claude-opus-4-8', DOPUSZCZONE), false, 'Anthropic, ale niedopuszczony');
  assert.equal(czyModelMentoraDozwolony('openrouter/fusion', DOPUSZCZONE), false, 'dopuszczony, ale nie Anthropic');
});

// --- TEKST DO PROMPTU — najdelikatniejsze miejsce -----------------------------

const temp = (provider, id) => modelSupportsTemperature(provider, id);

test('PRZED/PO: format linii nie zmienil sie co do znaku', () => {
  // Tekst sprzed rundy 6 dla statycznej listy Anthropic + jednego lokalnego.
  const przed = [
    'Anthropic:',
    '- claude-opus-4-8 (Claude Opus 4.8 (najmocniejszy)) — temperatura: NIE (model sam dobiera losowość)',
    '- claude-sonnet-5 (Claude Sonnet 5 (zbalansowany)) — temperatura: NIE (model sam dobiera losowość)',
    '- claude-haiku-4-5 (Claude Haiku 4.5 (szybki, tani)) — temperatura: tak',
    'Lokalne (Ollama):',
    '- llama3.1:8b (lokalny, Ollama) — temperatura: tak',
  ].join('\n');

  const po = tekstDostepnychModeli(
    [
      { provider: 'anthropic', modele: MODELS_BY_PROVIDER.anthropic.map((m) => ({ id: m.id, label: m.label })) },
      { provider: 'ollama', modele: [{ id: 'llama3.1:8b', label: 'llama3.1:8b' }] },
    ],
    temp,
    null,
  );
  assert.equal(po, przed);
});

test('Ollama niedostepna: zdanie z instrukcja "nie proponuj" zostaje', () => {
  // To jest INSTRUKCJA dla modelu, nie opis stanu — usuniecie zmienia
  // zachowanie mentora.
  const t = tekstDostepnychModeli(
    [{ provider: 'anthropic', modele: [{ id: 'x', label: 'X' }] }],
    () => true,
    'ECONNREFUSED',
  );
  assert.match(t, /^Lokalne \(Ollama\): niedostępne \(ECONNREFUSED\) — nie proponuj modeli lokalnych\.$/m);
});

test('grupa OpenRoutera dochodzi, gdy konto dopuscilo takie modele', () => {
  const t = tekstDostepnychModeli(
    [{ provider: 'openrouter', modele: [{ id: 'openrouter/fusion', label: 'OpenRouter: Fusion' }] }],
    temp,
    null,
  );
  assert.match(t, /^OpenRouter:$/m);
  assert.match(t, /^- openrouter\/fusion \(OpenRouter: Fusion\) — temperatura: tak$/m);
});

test('kolejnosc grup jest stala niezaleznie od kolejnosci wejscia', () => {
  // Prompt ma byc powtarzalny przy tej samej zawartosci konta.
  const grupy = [
    { provider: 'ollama', modele: [{ id: 'l', label: 'l' }] },
    { provider: 'anthropic', modele: [{ id: 'a', label: 'A' }] },
  ];
  const t = tekstDostepnychModeli(grupy, () => true, null);
  assert.ok(t.indexOf('Anthropic:') < t.indexOf('Lokalne (Ollama):'));
  assert.equal(tekstDostepnychModeli([...grupy].reverse(), () => true, null), t);
});

test('grupa pusta (poza Ollama) nie zostawia samego naglowka', () => {
  const t = tekstDostepnychModeli(
    [{ provider: 'openai', modele: [] }, { provider: 'anthropic', modele: [{ id: 'a', label: 'A' }] }],
    () => true,
    null,
  );
  assert.doesNotMatch(t, /OpenAI:/);
});
