import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pobierzKatalogModeli, wyczyscCacheKatalogu } from './pobierz.js';

// =============================================================================
//  CACHE I ZACHOWANIE PRZY AWARII OPENROUTERA
//
//  Sprawdzamy tu rzeczy, których nie da się porządnie sprawdzić klikaniem:
//  ile RAZY poszliśmy do sieci, co się dzieje przy równoczesnych wejściach
//  i co wraca, gdy OpenRouter nie odpowiada. Podmieniamy globalny `fetch`,
//  bo pobierz.js woła go wprost — nie ma tu wstrzykiwania zależności i
//  celowo: to jedno wywołanie HTTP, a nie warstwa wymagająca abstrakcji.
// =============================================================================

const prawdziwyFetch = globalThis.fetch;
let wywolania = 0;

function odpowiedzZModelami(ile = 3) {
  return {
    data: Array.from({ length: ile }, (_, i) => ({
      id: `wytworca${i}/model${i}`,
      name: `Model ${i}`,
      context_length: 1000 * (i + 1),
      pricing: { prompt: '0.000001', completion: '0.000002' },
      supported_parameters: i === 0 ? ['tools'] : [],
    })),
  };
}

function podstawFetch(zachowanie) {
  globalThis.fetch = async () => {
    wywolania += 1;
    return zachowanie();
  };
}

function ok(dane) {
  return () => ({ ok: true, status: 200, json: async () => dane });
}

beforeEach(() => {
  wywolania = 0;
  wyczyscCacheKatalogu();
});

afterEach(() => {
  globalThis.fetch = prawdziwyFetch;
  wyczyscCacheKatalogu();
});

test('drugie wywołanie idzie z cache, bez ruchu do sieci', async () => {
  podstawFetch(ok(odpowiedzZModelami(3)));

  const pierwsze = await pobierzKatalogModeli();
  const drugie = await pobierzKatalogModeli();

  assert.equal(wywolania, 1, 'drugie wywołanie nie ma prawa iść do OpenRoutera');
  assert.equal(pierwsze.zCache, false);
  assert.equal(drugie.zCache, true);
  assert.equal(drugie.modele.length, 3);
  assert.equal(drugie.pobraneO, pierwsze.pobraneO);
});

test('odswiez: true omija ważny cache', async () => {
  podstawFetch(ok(odpowiedzZModelami(3)));
  await pobierzKatalogModeli();
  const wymuszone = await pobierzKatalogModeli({ odswiez: true });

  assert.equal(wywolania, 2);
  assert.equal(wymuszone.zCache, false);
});

test('równoczesne wejścia dzielą JEDNO pobranie', async () => {
  // Bez bezpiecznika `wPolocie` pięć osób wchodzących naraz na listę modeli
  // przy zimnym cache wystrzeliwuje pięć identycznych zapytań.
  podstawFetch(() => ({
    ok: true,
    status: 200,
    json: async () => odpowiedzZModelami(2),
  }));

  const wyniki = await Promise.all([
    pobierzKatalogModeli(),
    pobierzKatalogModeli(),
    pobierzKatalogModeli(),
    pobierzKatalogModeli(),
    pobierzKatalogModeli(),
  ]);

  assert.equal(wywolania, 1);
  assert.ok(wyniki.every((w) => w.modele.length === 2));
});

// --- awaria OpenRoutera -------------------------------------------------------

test('zimny cache + awaria = wyjątek, NIE pusta lista', async () => {
  // To jest cała różnica między czytelnym błędem a listą, która wygląda
  // na poprawną odpowiedź „OpenRouter nie ma modeli".
  podstawFetch(() => {
    throw new Error('fetch failed');
  });

  await assert.rejects(() => pobierzKatalogModeli(), (err) => {
    assert.equal(err.code, 'openrouter_katalog_polaczenie');
    // „fetch failed" to DOSŁOWNIE to, co rzuca Node przy nieistniejącej
    // domenie, i dokładnie to zobaczył użytkownik przy pierwszym pomiarze
    // tej trasy. Surowy komunikat nie ma prawa wyjść na wierzch.
    assert.doesNotMatch(err.message, /fetch failed/);
    assert.match(err.message, /Nie można połączyć się z OpenRouterem/);
    assert.equal(err.cause.message, 'fetch failed', 'przyczyna zostaje do logów');
    return true;
  });
});

test('przekroczony czas oczekiwania ma własny komunikat', async () => {
  // Inna rada dla użytkownika: przy zerwanym połączeniu sprawdza internet,
  // przy zamulonym OpenRouterze po prostu próbuje ponownie.
  podstawFetch(() => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    throw err;
  });

  await assert.rejects(() => pobierzKatalogModeli(), (err) => {
    assert.match(err.message, /nie odpowiedział w ciągu 10 s/);
    return true;
  });
});

test('odpowiedź HTTP z błędem też nie daje pustej listy', async () => {
  podstawFetch(() => ({ ok: false, status: 503, json: async () => ({}) }));

  await assert.rejects(() => pobierzKatalogModeli(), (err) => {
    assert.equal(err.code, 'openrouter_katalog_http');
    assert.equal(err.status, 503);
    assert.match(err.message, /503/);
    return true;
  });
});

test('200 z pustym katalogiem jest odrzucane, a nie zapamiętywane', async () => {
  // OpenRouter ma zawsze setki modeli. Puste `data` znaczy, że dostaliśmy
  // coś innego, niż się spodziewamy — a wpuszczone do cache zamroziłoby
  // pustą listę na godzinę.
  podstawFetch(ok({ data: [] }));

  await assert.rejects(() => pobierzKatalogModeli(), (err) => {
    assert.equal(err.code, 'openrouter_katalog_pusty');
    return true;
  });

  // Nic się nie odłożyło: kolejne wywołanie znowu próbuje sieci.
  podstawFetch(ok(odpowiedzZModelami(2)));
  const drugie = await pobierzKatalogModeli();
  assert.equal(drugie.modele.length, 2);
});

test('mając starą kopię, przy awarii oddajemy JĄ — oznaczoną', async () => {
  podstawFetch(ok(odpowiedzZModelami(4)));
  const swieze = await pobierzKatalogModeli();
  assert.equal(swieze.przeterminowany, false);

  podstawFetch(() => {
    throw new Error('OpenRouter nie odpowiada');
  });
  const stare = await pobierzKatalogModeli({ odswiez: true });

  assert.equal(stare.modele.length, 4, 'stara lista jest warta więcej niż błąd');
  assert.equal(stare.przeterminowany, true, 'ale użytkownik ma wiedzieć, że jest stara');
  assert.equal(stare.zCache, true);
  // Powód niepowodzenia jedzie razem z listą — inaczej „przeterminowany: true"
  // jest nie do zdiagnozowania bez wchodzenia w logi serwera.
  assert.match(stare.bladOdswiezenia, /Nie można połączyć się z OpenRouterem/);
});

test('podsumowanie jedzie razem z listą', async () => {
  podstawFetch(ok(odpowiedzZModelami(3)));
  const { podsumowanie } = await pobierzKatalogModeli();
  assert.deepEqual(podsumowanie, {
    lacznie: 3,
    zDeklaracjaNarzedzi: 1,
    darmowe: 0,
  });
});
