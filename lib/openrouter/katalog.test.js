import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wytworcaZId,
  czyDarmowy,
  deklarujeTools,
  etykietaGdzie,
  etykietaKosztu,
  etykietaNarzedzi,
  znormalizujModel,
  znormalizujKatalog,
  podsumujKatalog,
} from './katalog.js';

// =============================================================================
//  ETYKIETY MAJĄ BYĆ LICZONE, NIE WPISYWANE
//
//  Cały sens tych testów: „darmowy z limitem" i cena w dolarach mają wynikać
//  z liczb w katalogu, a nie z tego, co ktoś kiedyś wpisał przy rekordzie.
//  Cennik OpenRoutera się zmienia; wpisana etykieta rozjeżdża się z danymi
//  po cichu, a użytkownik dowiaduje się o tym z rachunku.
// =============================================================================

test('wytworcaZId bierze człon przed ukośnikiem', () => {
  assert.equal(wytworcaZId('anthropic/claude-haiku-4.5'), 'anthropic');
  assert.equal(wytworcaZId('inclusionai/ling-3.0-flash:free'), 'inclusionai');
  // Bez ukośnika nie ma wytwórcy — i nie zgadujemy, że jest nim całe id.
  assert.equal(wytworcaZId('samo-id'), '');
  assert.equal(wytworcaZId('/od-ukosnika'), '');
  assert.equal(wytworcaZId(null), '');
});

test('darmowy TYLKO gdy obie ceny są zerowe', () => {
  assert.equal(czyDarmowy({ cenaWejsciaZaMln: 0, cenaWyjsciaZaMln: 0 }), true);
  // Zero po jednej stronie to nie „darmowy". To najdroższa możliwa pomyłka
  // w tym pliku: model liczący tylko za wyjście zostałby pokazany jako
  // bezpłatny, a płaci się za każdą odpowiedź.
  assert.equal(czyDarmowy({ cenaWejsciaZaMln: 0, cenaWyjsciaZaMln: 5 }), false);
  assert.equal(czyDarmowy({ cenaWejsciaZaMln: 1, cenaWyjsciaZaMln: 0 }), false);
  assert.equal(
    czyDarmowy({ cenaWejsciaZaMln: null, cenaWyjsciaZaMln: null }),
    false,
  );
});

test('etykieta kosztu wynika z cen, nie z wpisu', () => {
  assert.equal(
    etykietaKosztu({ cenaWejsciaZaMln: 0, cenaWyjsciaZaMln: 0 }),
    'darmowy z limitem',
  );
  // 0.000001 i 0.000005 USD za token = $1 i $5 za milion (Claude Haiku 4.5).
  assert.equal(
    etykietaKosztu({ cenaWejsciaZaMln: 1, cenaWyjsciaZaMln: 5 }),
    'płatny · $1.00 / $5.00 za 1 mln tokenów',
  );
  // Brak cennika to brak wiedzy — nie „darmowy".
  assert.equal(
    etykietaKosztu({ cenaWejsciaZaMln: null, cenaWyjsciaZaMln: null }),
    'koszt nieznany',
  );
  assert.equal(etykietaKosztu({}), 'koszt nieznany');
});

test('tanie ceny nie zaokrąglają się do zera', () => {
  // Model za $0.02 / $0.06 za milion. Przy dwóch miejscach po przecinku
  // wejście pokazałoby się jako „$0.02" — jeszcze czytelnie — ale model za
  // $0.0007 wyszedłby jako „$0.00", czyli darmowy. Stąd zmienna precyzja.
  assert.equal(
    etykietaKosztu({ cenaWejsciaZaMln: 0.0007, cenaWyjsciaZaMln: 0.06 }),
    'płatny · $0.0007 / $0.060 za 1 mln tokenów',
  );
  assert.equal(
    etykietaKosztu({ cenaWejsciaZaMln: 15, cenaWyjsciaZaMln: 120 }),
    'płatny · $15.00 / $120 za 1 mln tokenów',
  );
});

test('etykieta miejsca: lokalny tylko dla Ollamy', () => {
  assert.equal(etykietaGdzie('ollama'), 'lokalny');
  assert.equal(etykietaGdzie('openrouter'), 'w chmurze');
  assert.equal(etykietaGdzie('anthropic'), 'w chmurze');
  assert.equal(etykietaGdzie('openai'), 'w chmurze');
});

// =============================================================================
//  NARZĘDZIA: DEKLARACJA DOSTAWCY, NIE FAKT
//
//  Zmierzone w rundzie 2: `openrouter/fusion` NIE wymienia „tools"
//  w supported_parameters, a wywołał rag_search poprawnie, ze źródłami.
//  Dlatego pole nazywa się `deklarujeTools`, etykieta mówi „deklaruje",
//  a katalog NIE JEST po tej fladze filtrowany — filtr schowałby modele,
//  które działają.
// =============================================================================
test('deklarujeTools czyta flagę, nie rozstrzyga faktu', () => {
  assert.equal(deklarujeTools(['tools', 'temperature']), true);
  assert.equal(deklarujeTools(['temperature', 'top_p']), false);
  assert.equal(deklarujeTools([]), false);
  // Brak pola to brak deklaracji — nie brak możliwości.
  assert.equal(deklarujeTools(undefined), false);
  assert.equal(deklarujeTools(null), false);
});

test('etykieta narzędzi mówi wprost, że to deklaracja', () => {
  assert.equal(
    etykietaNarzedzi({ deklarujeTools: true }),
    'deklaruje obsługę narzędzi',
  );
  assert.equal(
    etykietaNarzedzi({ deklarujeTools: false }),
    'nie deklaruje obsługi narzędzi',
  );
  // Słowo „deklaruje" ma trafić przed oczy użytkownika, a nie zostać
  // w komentarzu — stąd ten test na samą treść.
  assert.ok(etykietaNarzedzi({ deklarujeTools: true }).includes('deklaruje'));
  assert.ok(etykietaNarzedzi({ deklarujeTools: false }).includes('deklaruje'));
});

// --- normalizacja ------------------------------------------------------------

// Wycinek prawdziwej odpowiedzi z https://openrouter.ai/api/v1/models,
// przycięty do pól, których używamy. Ceny są napisami ZA JEDEN token —
// dokładnie tak, jak przychodzą.
const SUROWY_PLATNY = {
  id: 'anthropic/claude-haiku-4.5',
  name: 'Anthropic: Claude Haiku 4.5',
  context_length: 200000,
  pricing: { prompt: '0.000001', completion: '0.000005', web_search: '0.01' },
  supported_parameters: ['max_tokens', 'temperature', 'tool_choice', 'tools'],
};

const SUROWY_DARMOWY = {
  id: 'inclusionai/ling-3.0-flash:free',
  name: 'Ling-3.0-flash (free)',
  context_length: 131072,
  pricing: { prompt: '0', completion: '0' },
  supported_parameters: ['temperature'],
};

test('normalizacja przelicza ceny na milion tokenów', () => {
  const m = znormalizujModel(SUROWY_PLATNY);
  // Gdyby ktoś przepisał surową wartość bez mnożenia, byłoby tu 0.000001
  // i cena pokazana użytkownikowi byłaby milion razy za niska.
  assert.equal(m.cenaWejsciaZaMln, 1);
  assert.equal(m.cenaWyjsciaZaMln, 5);
  assert.equal(m.koszt, 'płatny · $1.00 / $5.00 za 1 mln tokenów');
  assert.equal(m.darmowy, false);
});

test('rekord ma pola wspólne z lib/config/models.js', () => {
  const m = znormalizujModel(SUROWY_PLATNY);
  // `id` i `label` to kontrakt, na którym stoi istniejąca lista modeli —
  // nowy kształt ma być jej nadzbiorem, a nie czwartym osobnym bytem.
  assert.equal(m.id, 'anthropic/claude-haiku-4.5');
  assert.equal(m.label, 'Anthropic: Claude Haiku 4.5');
  assert.equal(m.wytworca, 'anthropic');
  assert.equal(m.kontekst, 200000);
  assert.equal(m.deklarujeTools, true);
  assert.equal(m.gdzie, 'w chmurze');
  assert.equal(m.narzedzia, 'deklaruje obsługę narzędzi');
  // Pola świadomie POMINIĘTE — patrz nagłówek katalog.js. Ich obecność
  // znaczyłaby, że ktoś dołożył drugie źródło prawdy.
  assert.equal('supportsTemperature' in m, false);
  assert.equal('requiresKey' in m, false);
  assert.equal('verified' in m, false);
});

test('model bez nazwy dostaje etykietę z identyfikatora', () => {
  const m = znormalizujModel({ id: 'ktos/model', pricing: { prompt: '0', completion: '0' } });
  assert.equal(m.label, 'ktos/model');
  assert.equal(m.koszt, 'darmowy z limitem');
});

test('wpis bez identyfikatora jest odsiewany', () => {
  assert.equal(znormalizujModel({ name: 'Bez id' }), null);
  assert.equal(znormalizujModel({ id: '   ' }), null);
  assert.equal(znormalizujModel(null), null);
});

test('katalog jest sortowany i odporny na śmieci w odpowiedzi', () => {
  const lista = znormalizujKatalog({
    data: [SUROWY_PLATNY, SUROWY_DARMOWY, { name: 'bez id' }, null],
  });
  assert.equal(lista.length, 2);
  // Sortowanie po wytwórcy: anthropic przed inclusionai. Bez tego kolejność
  // to kolejność dodania w OpenRouterze i lista skacze przy każdym odczycie.
  assert.deepEqual(
    lista.map((m) => m.id),
    ['anthropic/claude-haiku-4.5', 'inclusionai/ling-3.0-flash:free'],
  );
});

test('odpowiedź bez pola data daje pustą listę, nie wyjątek', () => {
  assert.deepEqual(znormalizujKatalog(null), []);
  assert.deepEqual(znormalizujKatalog({}), []);
  assert.deepEqual(znormalizujKatalog({ data: 'nie tablica' }), []);
});

test('podsumowanie liczy trzy rzeczy z raportu rundy', () => {
  const lista = znormalizujKatalog({ data: [SUROWY_PLATNY, SUROWY_DARMOWY] });
  assert.deepEqual(podsumujKatalog(lista), {
    lacznie: 2,
    zDeklaracjaNarzedzi: 1,
    darmowe: 1,
  });
  assert.deepEqual(podsumujKatalog(null), {
    lacznie: 0,
    zDeklaracjaNarzedzi: 0,
    darmowe: 0,
  });
});
