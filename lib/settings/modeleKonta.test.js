import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE,
  PRZYPISANIA,
  kluczModelu,
  znormalizujDopuszczone,
  znormalizujPrzypisania,
  przypisaniaDoOdpowiedzi,
} from './modeleKonta.js';

const DOSTAWCY = ['anthropic', 'openai', 'openrouter', 'ollama'];

const DOPUSZCZONE = [
  { provider: 'anthropic', model_id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { provider: 'openrouter', model_id: 'anthropic/claude-haiku-4.5', label: null },
  { provider: 'ollama', model_id: 'mistral-nemo', label: null },
];

// =============================================================================
//  "SERWER NIGDY NIE UFA IM SLEPO" (serverSettings.js:2)
//
//  Wszystko ponizej przychodzi z pola formularza, wiec moze byc czymkolwiek.
//  Testy pilnuja dwoch rzeczy naraz: ze smiec nie wchodzi do bazy ORAZ ze
//  smiec nie wywraca zapisu pozostalych, poprawnych pozycji.
// =============================================================================

test('lista przyjmuje poprawne wpisy i normalizuje nazwy pol', () => {
  const { przyjete, odrzucone } = znormalizujDopuszczone(
    [
      { provider: 'anthropic', model_id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      // klient moze przyslac `id` (tak nazywa sie pole w katalogu z rundy 3)
      // albo `modelId` — obie formy prowadza do tej samej kolumny.
      { provider: 'openrouter', id: 'anthropic/claude-haiku-4.5' },
      { provider: 'ollama', modelId: '  mistral-nemo  ' },
    ],
    { dostawcy: DOSTAWCY },
  );

  assert.equal(odrzucone.length, 0);
  assert.deepEqual(przyjete, [
    { provider: 'anthropic', model_id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { provider: 'openrouter', model_id: 'anthropic/claude-haiku-4.5', label: null },
    { provider: 'ollama', model_id: 'mistral-nemo', label: null },
  ]);
});

test('jeden zly wpis nie uniewaznia pozostalych', () => {
  // Gdyby cala lista byla odrzucana, uzytkownik z dwudziestoma modelami
  // dostalby blad bez wskazania, ktory wiersz jest winny.
  const { przyjete, odrzucone } = znormalizujDopuszczone(
    [
      { provider: 'anthropic', model_id: 'claude-haiku-4-5' },
      { provider: 'skadinad', model_id: 'cokolwiek' },
      { provider: 'openai', model_id: '' },
      { provider: 'ollama', model_id: 'mistral-nemo' },
    ],
    { dostawcy: DOSTAWCY },
  );

  assert.deepEqual(przyjete.map((m) => m.model_id), ['claude-haiku-4-5', 'mistral-nemo']);
  assert.equal(odrzucone.length, 2);
  assert.match(odrzucone[0].powod, /nieznany dostawca: skadinad/);
  assert.match(odrzucone[1].powod, /brak dostawcy albo identyfikatora/);
});

test('nieznany dostawca nie przechodzi — lista dostawcow jest w kodzie, nie w bazie', () => {
  const { przyjete, odrzucone } = znormalizujDopuszczone(
    [{ provider: 'wymyslony', model_id: 'x' }],
    { dostawcy: DOSTAWCY },
  );
  assert.equal(przyjete.length, 0);
  assert.equal(odrzucone.length, 1);
});

test('duplikat w zadaniu jest pomijany cicho', () => {
  // To nie jest blad uzytkownika, tylko skutek klikniecia dwa razy —
  // a unikat w bazie i tak by go odrzucil, tyle ze bledem.
  const { przyjete, odrzucone } = znormalizujDopuszczone(
    [
      { provider: 'anthropic', model_id: 'claude-haiku-4-5' },
      { provider: 'anthropic', model_id: 'claude-haiku-4-5' },
    ],
    { dostawcy: DOSTAWCY },
  );
  assert.equal(przyjete.length, 1);
  assert.equal(odrzucone.length, 0);
});

test('ten sam identyfikator u dwoch dostawcow to dwa rozne modele', () => {
  // Powod, dla ktorego klucz to para, a nie sam model — patrz migracja 020.
  const { przyjete } = znormalizujDopuszczone(
    [
      { provider: 'ollama', model_id: 'llama3' },
      { provider: 'openrouter', model_id: 'llama3' },
    ],
    { dostawcy: DOSTAWCY },
  );
  assert.equal(przyjete.length, 2);
  assert.notEqual(kluczModelu('ollama', 'llama3'), kluczModelu('openrouter', 'llama3'));
});

test('smieci zamiast listy daja pusta liste, nie wyjatek', () => {
  for (const smiec of [null, undefined, 'lista', 42, {}]) {
    const { przyjete } = znormalizujDopuszczone(smiec, { dostawcy: DOSTAWCY });
    assert.deepEqual(przyjete, []);
  }
});

test('napis dluzszy niz limit jest odrzucany', () => {
  const { przyjete, odrzucone } = znormalizujDopuszczone(
    [{ provider: 'anthropic', model_id: 'x'.repeat(201) }],
    { dostawcy: DOSTAWCY },
  );
  assert.equal(przyjete.length, 0);
  assert.equal(odrzucone.length, 1);
});

// --- przypisania --------------------------------------------------------------

test('przypisanie do modelu Z listy przechodzi', () => {
  const { wiersz, odrzucone } = znormalizujPrzypisania(
    {
      mentor: { provider: 'anthropic', model_id: 'claude-haiku-4-5' },
      rag_pojecia: { provider: 'ollama', model_id: 'mistral-nemo' },
    },
    DOPUSZCZONE,
  );

  assert.equal(odrzucone.length, 0);
  assert.equal(wiersz.mentor_provider, 'anthropic');
  assert.equal(wiersz.mentor_model, 'claude-haiku-4-5');
  assert.equal(wiersz.rag_concept_provider, 'ollama');
  assert.equal(wiersz.rag_concept_model, 'mistral-nemo');
  // Rola nieprzyslana = wyczyszczona. Zapis jest calosciowy, nie latkowy.
  assert.equal(wiersz.agent_default_provider, null);
  assert.equal(wiersz.agent_default_model, null);
});

// =============================================================================
//  PUNKT 3 ZADANIA: MODEL SPOZA LISTY -> FALLBACK, NIE BLAD
// =============================================================================
test('przypisanie do modelu SPOZA listy jest zerowane, a nie odrzucane bledem', () => {
  const { wiersz, odrzucone } = znormalizujPrzypisania(
    {
      mentor: { provider: 'anthropic', model_id: 'claude-opus-5' }, // nie wlaczony
      rag_pojecia: { provider: 'ollama', model_id: 'mistral-nemo' }, // wlaczony
    },
    DOPUSZCZONE,
  );

  // Fallbackiem jest NULL, czyli "brak wlasnego zdania — uzyj domyslki
  // z kodu". Podstawienie konkretnego modelu zamrozilo by w bazie aktualna
  // wartosc MENTOR_MODEL i zmiana w .env.local przestala by dzialac.
  assert.equal(wiersz.mentor_provider, null);
  assert.equal(wiersz.mentor_model, null);

  // Poprawne przypisanie obok NIE ucierpialo — to nie jest blad calosci.
  assert.equal(wiersz.rag_concept_model, 'mistral-nemo');

  // I najwazniejsze: uzytkownik ma sie o tym DOWIEDZIEC. Ciche wyzerowanie
  // wyglada jak udany zapis, po ktorym przypisanie znika.
  assert.equal(odrzucone.length, 1);
  assert.equal(odrzucone[0].rola, 'mentor');
  assert.equal(odrzucone[0].model_id, 'claude-opus-5');
  assert.match(odrzucone[0].powod, /nie jest na liscie dopuszczonych/);
});

test('dobry model u zlego dostawcy tez jest spoza listy', () => {
  // "claude-haiku-4-5" jest wlaczony dla anthropic, nie dla openrouter
  // (tam ma inny identyfikator). Para musi zgadzac sie w calosci.
  const { wiersz, odrzucone } = znormalizujPrzypisania(
    { mentor: { provider: 'openrouter', model_id: 'claude-haiku-4-5' } },
    DOPUSZCZONE,
  );
  assert.equal(wiersz.mentor_model, null);
  assert.equal(odrzucone.length, 1);
});

test('pusta lista dopuszczonych zeruje wszystkie przypisania', () => {
  const { wiersz, odrzucone } = znormalizujPrzypisania(
    {
      mentor: { provider: 'anthropic', model_id: 'claude-haiku-4-5' },
      agent_domyslny: { provider: 'anthropic', model_id: 'claude-haiku-4-5' },
    },
    [],
  );
  assert.equal(wiersz.mentor_model, null);
  assert.equal(wiersz.agent_default_model, null);
  assert.equal(odrzucone.length, 2);
});

test('jawny null czysci przypisanie bez zglaszania odrzucenia', () => {
  // "Nie chcę mieć zdania" to nie to samo co "przysłałem coś złego".
  const { wiersz, odrzucone } = znormalizujPrzypisania({ mentor: null }, DOPUSZCZONE);
  assert.equal(wiersz.mentor_model, null);
  assert.equal(odrzucone.length, 0);
});

test('smiec w miejscu przypisania jest zglaszany', () => {
  const { wiersz, odrzucone } = znormalizujPrzypisania(
    { mentor: { provider: 'anthropic' } }, // bez modelu
    DOPUSZCZONE,
  );
  assert.equal(wiersz.mentor_model, null);
  assert.equal(odrzucone.length, 1);
  assert.match(odrzucone[0].powod, /brak dostawcy albo identyfikatora/);
});

test('wiersz zawsze ma komplet szesciu kolumn', () => {
  // Brakujaca kolumna w upsercie zostawilaby STARA wartosc w bazie —
  // czyli przypisanie, ktore uzytkownik wlasnie usunal, wrocilo by po zapisie.
  const { wiersz } = znormalizujPrzypisania({}, DOPUSZCZONE);
  const oczekiwane = ROLE.flatMap((r) => [PRZYPISANIA[r].provider, PRZYPISANIA[r].model]);
  assert.deepEqual(Object.keys(wiersz).sort(), oczekiwane.sort());
  assert.equal(oczekiwane.length, 6);
});

// --- odczyt -------------------------------------------------------------------

test('wiersz z bazy wraca jako trzy role', () => {
  const wynik = przypisaniaDoOdpowiedzi({
    owner_id: 'x',
    mentor_provider: 'anthropic',
    mentor_model: 'claude-haiku-4-5',
    agent_default_provider: null,
    agent_default_model: null,
    rag_concept_provider: 'ollama',
    rag_concept_model: 'mistral-nemo',
  });

  assert.deepEqual(wynik, {
    agent_domyslny: null,
    rag_pojecia: { provider: 'ollama', model_id: 'mistral-nemo' },
    mentor: { provider: 'anthropic', model_id: 'claude-haiku-4-5' },
  });
});

test('brak wiersza (konto nic nie zapisalo) to trzy nulle, nie wyjatek', () => {
  assert.deepEqual(przypisaniaDoOdpowiedzi(null), {
    agent_domyslny: null,
    rag_pojecia: null,
    mentor: null,
  });
});

test('polowiczne przypisanie w bazie czyta sie jako brak', () => {
  // Kluczy obcych nie da sie tak oszukac, ale gdyby wiersz powstal inaczej,
  // { provider: 'anthropic', model_id: null } byloby ksztaltem nie do uzycia.
  const wynik = przypisaniaDoOdpowiedzi({ mentor_provider: 'anthropic', mentor_model: null });
  assert.equal(wynik.mentor, null);
});
