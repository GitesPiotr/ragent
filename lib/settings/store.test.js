import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSettings } from './store.js';
import { DEFAULT_SETTINGS } from './defaults.js';

// Konto, ktore dopuscilo JEDEN model Anthropic i jeden OpenRoutera.
const DOPUSZCZONE = [
  { provider: 'anthropic', model_id: 'claude-haiku-4-5', label: 'Haiku' },
  { provider: 'openrouter', model_id: 'openrouter/fusion', label: 'Fusion' },
];

// --- SEDNO: brak listy nie ma prawa nic nadpisac ------------------------------

test('BEZ LISTY zapisany model NIE JEST podmieniany', () => {
  // To jest cala rzecz, o ktora chodzi. Poprzednia wersja przy nieznanym
  // modelu wstawiala pierwszy z zaszytej listy. Gdyby to zostalo przy
  // nieznanej liscie konta, kazdy zapis ustawien kasowalby wybor
  // uzytkownika — cicho, bo zapis konczy sie sukcesem.
  const wynik = sanitizeSettings({
    mentorModel: 'claude-sonnet-5',
    defaultProvider: 'anthropic',
    defaultModel: 'claude-opus-4-8',
  });
  assert.equal(wynik.mentorModel, 'claude-sonnet-5');
  assert.equal(wynik.defaultModel, 'claude-opus-4-8');
});

test('BEZ LISTY przechodzi tez model, ktorego nie ma w MODELS_BY_PROVIDER', () => {
  // Model z katalogu OpenRoutera nigdy nie bedzie w zaszytej liscie.
  const wynik = sanitizeSettings({ defaultProvider: 'anthropic', defaultModel: 'openrouter/fusion' });
  assert.equal(wynik.defaultModel, 'openrouter/fusion');
});

test('BEZ LISTY nadal odsiewamy zly TYP, bo to nie jest kwestia listy', () => {
  const wynik = sanitizeSettings({ mentorModel: 42, defaultModel: null });
  assert.equal(wynik.mentorModel, DEFAULT_SETTINGS.mentorModel);
  assert.equal(wynik.defaultModel, DEFAULT_SETTINGS.defaultModel);
});

// --- z lista: werdykt wiazacy -------------------------------------------------

test('Z LISTA model spoza niej leci na pierwszy dopuszczony', () => {
  const wynik = sanitizeSettings(
    { defaultProvider: 'anthropic', defaultModel: 'claude-opus-4-8' },
    { dopuszczone: DOPUSZCZONE },
  );
  assert.equal(wynik.defaultModel, 'claude-haiku-4-5');
});

test('Z LISTA model dopuszczony zostaje nietkniety', () => {
  const wynik = sanitizeSettings(
    { defaultProvider: 'anthropic', defaultModel: 'claude-haiku-4-5' },
    { dopuszczone: DOPUSZCZONE },
  );
  assert.equal(wynik.defaultModel, 'claude-haiku-4-5');
});

test('mentor: model Anthropic niedopuszczony wraca do domyslnego', () => {
  const wynik = sanitizeSettings(
    { mentorModel: 'claude-opus-4-8' },
    { dopuszczone: DOPUSZCZONE },
  );
  assert.equal(wynik.mentorModel, DEFAULT_SETTINGS.mentorModel);
});

test('mentor: model dopuszczony, ale NIE od Anthropic, nie przechodzi', () => {
  // Dostawca mentora jest stala — uzasadnienie w dopuszczoneModele.js.
  const wynik = sanitizeSettings(
    { mentorModel: 'openrouter/fusion' },
    { dopuszczone: DOPUSZCZONE },
  );
  assert.equal(wynik.mentorModel, DEFAULT_SETTINGS.mentorModel);
});

test('LISTA PUSTA (konto nic nie wybralo) = domyslne z MODELS_BY_PROVIDER', () => {
  // Pusta tablica to werdykt „konto nic nie ma", a wtedy regula fallbacku
  // daje statyczna liste — wiec model z tej listy ma przejsc.
  const wynik = sanitizeSettings(
    { defaultProvider: 'anthropic', defaultModel: 'claude-opus-4-8' },
    { dopuszczone: [] },
  );
  assert.equal(wynik.defaultModel, 'claude-opus-4-8');
});

test('konto bez ani jednego modelu TEGO dostawcy nie zeruje pola', () => {
  // Konto ma tylko OpenRoutera, a domyslnym dostawca jest openai.
  // Pusty <select> byłby gorszy niz wartosc domyslna.
  const wynik = sanitizeSettings(
    { defaultProvider: 'openai', defaultModel: 'gpt-5.6-luna' },
    { dopuszczone: [DOPUSZCZONE[1]] },
  );
  assert.equal(typeof wynik.defaultModel, 'string');
  assert.ok(wynik.defaultModel.length > 0);
});

// --- reszta pol bez zmian -----------------------------------------------------

test('pozostale pola dzialaja jak przed runda 6', () => {
  const wynik = sanitizeSettings({
    ollamaUrl: 'http://127.0.0.1:11434',
    theme: 'dark',
    showDebugPanel: true,
    defaultTemperature: 5,
    knowledgeCharLimit: 999999,
    autoOpenMentor: true,
  });
  assert.equal(wynik.ollamaUrl, 'http://127.0.0.1:11434');
  assert.equal(wynik.theme, 'dark');
  assert.equal(wynik.showDebugPanel, true);
  assert.equal(wynik.defaultTemperature, 1, 'przyciete do zakresu');
  assert.equal(wynik.knowledgeCharLimit, 100000, 'przyciete do maksimum');
  assert.equal(wynik.autoOpenMentor, true);
  assert.equal(sanitizeSettings({ theme: 'neon' }).theme, DEFAULT_SETTINGS.theme);
  assert.equal(sanitizeSettings({ ollamaUrl: 'ftp://x' }).ollamaUrl, DEFAULT_SETTINGS.ollamaUrl);
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
});

test('nieznany dostawca domyslny wraca do domyslnego', () => {
  assert.equal(sanitizeSettings({ defaultProvider: 'ollama' }).defaultProvider, DEFAULT_SETTINGS.defaultProvider);
});
