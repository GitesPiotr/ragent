import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zapiszWyszukiwanie } from './search-log.js';

// Klient udający Supabase. `wynik` decyduje, czy insert się udaje.
function fakeClient(wynik, spy = {}) {
  return {
    from(tabela) {
      spy.tabela = tabela;
      return {
        insert(wiersz) {
          spy.wiersz = wiersz;
          return Promise.resolve(wynik);
        },
      };
    },
  };
}

async function ochlon() {
  // Zapis jest celowo nieoczekiwany (`bez await`) — dajemy mikrozadaniom dojść.
  await new Promise((r) => setTimeout(r, 5));
}

const podstawa = {
  collectionId: 'k1',
  query: 'ile dni urlopu',
  documentIds: null,
  topK: 5,
  minScore: 0.45,
  hits: [{ score: 0.71 }, { score: 0.52 }],
  hybrid: false,
  odsiane: 2,
  noResults: false,
  durationMs: 123,
};

test('zapisuje to, co potrzebne do diagnozy: skrajne wyniki, hybrydę, odsiew, czas', async () => {
  const spy = {};
  zapiszWyszukiwanie(podstawa, { client: fakeClient({ error: null }, spy) });
  await ochlon();
  assert.equal(spy.tabela, 'rag_search_log');
  assert.equal(spy.wiersz.query, 'ile dni urlopu');
  assert.equal(spy.wiersz.hits_count, 2);
  assert.equal(spy.wiersz.first_score, 0.71);
  assert.equal(spy.wiersz.last_score, 0.52);
  assert.equal(spy.wiersz.deduped, 2);
  assert.equal(spy.wiersz.duration_ms, 123);
  assert.equal(spy.wiersz.no_results, false);
  assert.equal(spy.wiersz.no_results_reason, null);
});

// STRAŻNIK, NIE OZDOBA — ten test pilnuje czegoś, co inaczej zepsułoby się BEZ OBJAWU.
//
// Kolumny owner_ref już nie ma: skasowała ją migracja 016 (KROK 2), bo jej rolę
// — powiązanie wpisu z kontem — przejął owner_id z `default auth.uid()`, wypełniany
// przez bazę przy zapisie klientem sesyjnym. Rdzeń nie ma tu czego podawać jawnie.
//
// Gdyby ktoś przywrócił do obiektu insertu linię `owner_ref: null`, PostgREST
// odrzuciłby KAŻDY wpis do dziennika ("Could not find the 'owner_ref' column").
// I tu jest sedno: to NIE wywróciłoby ani jednego żądania. Dwie osłony
// w search-log.js:51-62 są celowo zbudowane tak, żeby awaria dziennika nigdy nie
// przerwała wyszukiwania — zamieniłyby błąd w console.warn i tyle. Dziennik
// przestałby zapisywać cokolwiek, a jedynym śladem byłaby linijka w logach serwera.
// Tabela, której cały sens polega na tym, że jest jedynym sposobem, żeby dowiedzieć
// się, co nie działa, milczałaby — i nikt by tego nie zauważył.
//
// Dlatego asercja jest na BRAK KLUCZA, nie na jego wartość: `owner_ref: null`
// przeszłoby przez sprawdzenie wartości (null === null), a to jest dokładnie ten
// zapis, który psuje insert.
test('obiekt insertu NIE MA klucza owner_ref — kolumna zniknęła w migracji 016', async () => {
  const spy = {};
  zapiszWyszukiwanie({ ...podstawa, ownerRef: 'user-42' }, { client: fakeClient({ error: null }, spy) });
  await ochlon();
  assert.ok(
    !('owner_ref' in spy.wiersz),
    'owner_ref wrócił do insertu — PostgREST odrzuci każdy wpis, a osłony zamienią to w cichy console.warn'
  );
  // Właściciela dokłada baza, nie kod — owner_id też nie ma prawa tu być.
  assert.ok(
    !('owner_id' in spy.wiersz),
    'owner_id ustawia default auth.uid() w bazie; podanie go z kodu obchodziłoby tożsamość z sesji'
  );
});

test('rozróżnia POWÓD braku wyników — próg to co innego niż reguła negatywna', async () => {
  const spy = {};
  zapiszWyszukiwanie({ ...podstawa, hits: [], noResults: true }, { client: fakeClient({ error: null }, spy) });
  await ochlon();
  assert.equal(spy.wiersz.no_results_reason, 'prog');
  assert.equal(spy.wiersz.first_score, null, 'brak wyników to brak score, nie zero');

  const spy2 = {};
  zapiszWyszukiwanie(
    { ...podstawa, hits: [], noResults: true, regulaNegatywna: true },
    { client: fakeClient({ error: null }, spy2) }
  );
  await ochlon();
  assert.equal(spy2.wiersz.no_results_reason, 'regula_negatywna');
});

test('null documentIds (cała kolekcja) jest odróżnialne od listy — po decyzji z 18.a', async () => {
  const spy = {};
  zapiszWyszukiwanie({ ...podstawa, documentIds: ['d1'] }, { client: fakeClient({ error: null }, spy) });
  await ochlon();
  assert.deepEqual(spy.wiersz.document_ids, ['d1']);

  const spy2 = {};
  zapiszWyszukiwanie(podstawa, { client: fakeClient({ error: null }, spy2) });
  await ochlon();
  assert.equal(spy2.wiersz.document_ids, null);
});

test('ZASADA NADRZĘDNA: błąd zapisu NIE przerywa niczego', async () => {
  // Brak tabeli — najbardziej prawdopodobny przypadek po wdrożeniu bez migracji.
  assert.doesNotThrow(() =>
    zapiszWyszukiwanie(podstawa, { client: fakeClient({ error: { message: 'relation rag_search_log does not exist' } }) })
  );
  // Klient, który rzuca synchronicznie.
  assert.doesNotThrow(() =>
    zapiszWyszukiwanie(podstawa, {
      client: { from() { throw new Error('baza padła'); } },
    })
  );
  // Klient, który zwraca odrzuconą obietnicę — to jest ten przypadek, który
  // bez `.catch` wywaliłby proces jako unhandled rejection.
  assert.doesNotThrow(() =>
    zapiszWyszukiwanie(podstawa, {
      client: { from: () => ({ insert: () => Promise.reject(new Error('timeout')) }) },
    })
  );
  await ochlon();
});

test('bardzo długie zapytanie jest przycinane, nie odrzucane', async () => {
  const spy = {};
  zapiszWyszukiwanie({ ...podstawa, query: 'x'.repeat(50000) }, { client: fakeClient({ error: null }, spy) });
  await ochlon();
  assert.equal(spy.wiersz.query.length, 2000);
});
