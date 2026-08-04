import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCreateInput, deleteCollection, kluczeStorageKolekcji } from './collections.js';

// Testujemy czystą walidację wejścia — bez bazy i bez Ollamy.
const DEFAULT_MODEL = 'bge-m3';

test('poprawne wejście: przycina nazwę, zwraca znormalizowany obiekt', () => {
  const out = normalizeCreateInput(
    { name: '  Regulaminy  ', description: 'opis', externalRef: 'proj-1', embedModel: 'bge-m3' },
    DEFAULT_MODEL
  );
  assert.deepEqual(out, {
    name: 'Regulaminy',
    description: 'opis',
    externalRef: 'proj-1',
    embedModel: 'bge-m3',
    // Dostawca nie podany → null, czyli „dziedzicz z konfiguracji".
    // NIE 'ollama' na sztywno: rdzeń nie zna oferty i nie zgaduje za wołającego.
    embedProvider: null,
  });
});

test('embedProvider przechodzi razem z modelem i jest przycinany', () => {
  const out = normalizeCreateInput(
    { name: 'K', embedProvider: '  openrouter ', embedModel: ' baai/bge-m3 ' },
    DEFAULT_MODEL
  );
  assert.equal(out.embedProvider, 'openrouter');
  assert.equal(out.embedModel, 'baai/bge-m3');
});

test('pusty embedProvider znaczy „dziedzicz", nie „pusty dostawca"', () => {
  for (const zle of ['', '   ', null, undefined, 42]) {
    assert.equal(
      normalizeCreateInput({ name: 'K', embedProvider: zle }, DEFAULT_MODEL).embedProvider,
      null,
      `${JSON.stringify(zle)}`
    );
  }
});

test('brak embedModel: dziedziczy domyślny globalny model', () => {
  const out = normalizeCreateInput({ name: 'Kolekcja' }, DEFAULT_MODEL);
  assert.equal(out.embedModel, DEFAULT_MODEL);
  assert.equal(out.description, null);
  assert.equal(out.externalRef, null);
});

test('pusty externalRef i description → null (żeby indeks częściowy działał)', () => {
  const out = normalizeCreateInput({ name: 'X', description: '', externalRef: '' }, DEFAULT_MODEL);
  assert.equal(out.description, null);
  assert.equal(out.externalRef, null);
});

test('embedModel z samymi spacjami → domyślny model', () => {
  const out = normalizeCreateInput({ name: 'X', embedModel: '   ' }, DEFAULT_MODEL);
  assert.equal(out.embedModel, DEFAULT_MODEL);
});

test('brak nazwy → invalid_input', () => {
  assert.throws(() => normalizeCreateInput({}, DEFAULT_MODEL), (e) => e.code === 'invalid_input');
});

test('pusta/whitespace nazwa → invalid_input', () => {
  assert.throws(() => normalizeCreateInput({ name: '   ' }, DEFAULT_MODEL), (e) => e.code === 'invalid_input');
});

test('brak obiektu wejścia → invalid_input', () => {
  assert.throws(() => normalizeCreateInput(null, DEFAULT_MODEL), (e) => e.code === 'invalid_input');
});

// =============================================================================
//  deleteCollection — sprzątanie prefiksu Storage (Sesja 10, punkt 2)
//
//  Do Sesji 10 deleteCollection NIE ruszał Storage ("sprzątanie dojdzie w późniejszej
//  sesji"). Skutek: każdy plik skasowanej kolekcji zostawał w buckecie na zawsze,
//  bo znikał jedyny wiersz, który go wskazywał. Diagnostyka na realnej bazie
//  (scripts/diag-sieroty.mjs) pokazała 0 sierot tylko dlatego, że żadnej kolekcji
//  jeszcze nie skasowano — wyciek istniał w kodzie, nie został wykonany.
// =============================================================================

// Minimalny klient: tyle Supabase, ile dotyka deleteCollection.
function fakeClient(stan) {
  stan.usuniete = stan.usuniete || [];
  return {
    from(tabela) {
      const q = {
        _filtry: {},
        select() { return q; },
        eq(kol, val) { q._filtry[kol] = val; return q; },
        delete(opts) { q._delete = true; q._count = opts && opts.count; return q; },
        then(res) {
          if (tabela === 'rag_documents') {
            const dane = (stan.rag_documents || []).filter((d) => d.collection_id === q._filtry.collection_id);
            return Promise.resolve({ data: dane, error: null }).then(res);
          }
          if (q._delete) {
            if (stan.bladBazy) return Promise.resolve({ error: stan.bladBazy, count: null }).then(res);
            const przed = (stan.rag_collections || []).length;
            stan.rag_collections = (stan.rag_collections || []).filter((k) => k.id !== q._filtry.id);
            return Promise.resolve({ error: null, count: przed - stan.rag_collections.length }).then(res);
          }
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return q;
    },
    storage: {
      from: () => ({
        async list(prefiks) {
          if (stan.bladStorage) return { data: null, error: { message: stan.bladStorage } };
          const glebokosc = prefiks === '' ? 0 : prefiks.split('/').length;
          const dzieci = new Map();
          for (const k of stan.obiekty || []) {
            if (prefiks && !k.startsWith(prefiks + '/')) continue;
            const czesci = k.split('/');
            const nazwa = czesci[glebokosc];
            if (nazwa === undefined) continue;
            // Wpis z `id` = obiekt (ostatni segment), bez `id` = katalog.
            const jestPlikiem = czesci.length === glebokosc + 1;
            if (!dzieci.has(nazwa) || jestPlikiem) {
              dzieci.set(nazwa, jestPlikiem ? { name: nazwa, id: 'o' + nazwa } : { name: nazwa });
            }
          }
          return { data: [...dzieci.values()], error: null };
        },
        async remove(sciezki) {
          if (stan.bladUsuwania) return { data: null, error: { message: stan.bladUsuwania } };
          stan.usuniete.push(...sciezki);
          stan.obiekty = (stan.obiekty || []).filter((k) => !sciezki.includes(k));
          return { data: sciezki.map((p) => ({ name: p })), error: null };
        },
      }),
    },
  };
}

test('deleteCollection kasuje wszystkie pliki prefiksu kolekcji', async () => {
  const stan = {
    rag_collections: [{ id: 'k1' }],
    rag_documents: [
      { id: 'd1', collection_id: 'k1', file_path: 'k1/d1/umowa.pdf' },
      { id: 'd2', collection_id: 'k1', file_path: 'k1/d2/regulamin.pdf' },
    ],
    obiekty: ['k1/d1/umowa.pdf', 'k1/d2/regulamin.pdf', 'k2/d9/obce.pdf'],
  };
  const wynik = await deleteCollection('k1', { client: fakeClient(stan) });

  assert.equal(wynik.deleted, true);
  assert.equal(wynik.plikowUsunietych, 2);
  assert.equal(wynik.plikowNieusunietych, 0);
  assert.deepEqual(stan.obiekty, ['k2/d9/obce.pdf'], 'cudza kolekcja nietknięta');
});

test('kasuje TAKŻE obiekt, którego wiersz już nie istnieje', async () => {
  // Ślad po wcześniejszym nieudanym usuwaniu: plik jest, wiersza nie ma.
  // Sam file_path z bazy by go nie znalazł — stąd obchód prefiksu.
  const stan = {
    rag_collections: [{ id: 'k1' }],
    rag_documents: [{ id: 'd1', collection_id: 'k1', file_path: 'k1/d1/umowa.pdf' }],
    obiekty: ['k1/d1/umowa.pdf', 'k1/d7/duch.pdf'],
  };
  const wynik = await deleteCollection('k1', { client: fakeClient(stan) });

  assert.equal(wynik.plikowUsunietych, 2);
  assert.deepEqual(stan.obiekty, [], 'w buckecie nie zostaje nic z tej kolekcji');
});

test('klucze zbierane są PRZED usunięciem wiersza — inaczej kaskada zabiera mapę', async () => {
  // Gdyby kolejność była odwrotna, rag_documents byłoby już puste i jedynym źródłem
  // zostałby obchód prefiksu. Ten test pilnuje, że baza zdążyła się wypowiedzieć.
  const stan = {
    rag_collections: [{ id: 'k1' }],
    rag_documents: [{ id: 'd1', collection_id: 'k1', file_path: 'k1/d1/umowa.pdf' }],
    obiekty: [], // Storage milczy — cała wiedza pochodzi z bazy
  };
  const klucze = await kluczeStorageKolekcji(fakeClient(stan), 'k1');
  assert.deepEqual(klucze, ['k1/d1/umowa.pdf']);
});

test('awaria Storage NIE blokuje skasowania kolekcji, ale jest raportowana', async () => {
  const stan = {
    rag_collections: [{ id: 'k1' }],
    rag_documents: [{ id: 'd1', collection_id: 'k1', file_path: 'k1/d1/umowa.pdf' }],
    obiekty: ['k1/d1/umowa.pdf'],
    bladUsuwania: 'Storage niedostępny',
  };
  const wynik = await deleteCollection('k1', { client: fakeClient(stan) });

  assert.equal(wynik.deleted, true, 'porządki w bazie mają się udać mimo awarii Storage');
  assert.equal(wynik.plikowNieusunietych, 1, 'cicha porażka to dokładnie ten wyciek, który naprawiamy');
  assert.equal(stan.rag_collections.length, 0);
});

test('niedostępne listowanie Storage nie wywraca operacji', async () => {
  const stan = {
    rag_collections: [{ id: 'k1' }],
    rag_documents: [{ id: 'd1', collection_id: 'k1', file_path: 'k1/d1/umowa.pdf' }],
    obiekty: ['k1/d1/umowa.pdf'],
    bladStorage: 'connection refused',
  };
  const wynik = await deleteCollection('k1', { client: fakeClient(stan) });
  assert.equal(wynik.deleted, true);
  assert.equal(wynik.plikowUsunietych, 1, 'zostaje to, co dała baza');
});

test('kolekcja bez plików — zero do skasowania, bez błędu', async () => {
  const stan = { rag_collections: [{ id: 'k1' }], rag_documents: [], obiekty: [] };
  const wynik = await deleteCollection('k1', { client: fakeClient(stan) });
  assert.equal(wynik.plikowUsunietych, 0);
  assert.equal(wynik.deleted, true);
});

test('nieistniejąca kolekcja → not_found', async () => {
  const stan = { rag_collections: [], rag_documents: [], obiekty: [] };
  await assert.rejects(
    () => deleteCollection('kX', { client: fakeClient(stan) }),
    (e) => e.code === 'not_found'
  );
});

test('brak id → invalid_input (bez dotykania bazy)', async () => {
  await assert.rejects(() => deleteCollection(''), (e) => e.code === 'invalid_input');
});
