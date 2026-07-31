import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  identyfikatoryZapytania,
  polaczTrafienia,
  UDZIAL_GRUPY_TEKSTOWEJ,
} from './hybryda.js';

// Fuzja hybrydowa (11.2). Wszystkie przypadki pochodzą z pomiarów na kolekcji
// „Regulaminy", nie z wyobraźni — liczby w komentarzach to realne score.

const PROG = 0.45;

function w(chunkId, score) {
  return { chunkId, score, content: '', fileName: 'x', headingPath: null };
}

// --- wykrywanie identyfikatora ---------------------------------------------------

test('identyfikator to token z cyfrą — bez wiedzy o "artykułach"', () => {
  assert.deepEqual(identyfikatoryZapytania('art. 36'), ['36']);
  assert.deepEqual(identyfikatoryZapytania('co mówi art. 36 kodeksu pracy'), ['36']);
  assert.deepEqual(identyfikatoryZapytania('art. 6720'), ['6720']);
  assert.deepEqual(identyfikatoryZapytania('Section 3 of ISO 9001'), ['3', '9001']);
});

test('zapytanie bez cyfry NIE uruchamia ścieżki tekstowej', () => {
  // To jest gwarancja noResults: "jak" przy słowniku `simple` nie jest stop-słowem,
  // więc gdyby tekst działał zawsze, "jak upiec sernik" mogłoby coś dopasować.
  assert.deepEqual(identyfikatoryZapytania('jak upiec sernik'), []);
  assert.deepEqual(identyfikatoryZapytania('kiedy mogę żądać usunięcia danych'), []);
  assert.deepEqual(identyfikatoryZapytania(''), []);
  assert.deepEqual(identyfikatoryZapytania(null), []);
});

test('powtórzony identyfikator liczy się raz', () => {
  assert.deepEqual(identyfikatoryZapytania('art. 36 i jeszcze raz art. 36'), ['36']);
});

// --- brak identyfikatora: zachowanie MUSI być dzisiejsze -------------------------

test('bez ścieżki tekstowej działa dokładnie jak wyszukiwanie wektorowe', () => {
  const wektorowe = [w('a', 0.75), w('b', 0.60), w('c', 0.40)];
  const { hits, noResults } = polaczTrafienia({ wektorowe, tekstowe: null, prog: PROG, limit: 5 });

  assert.deepEqual(hits.map((h) => h.chunkId), ['a', 'b'], 'c poniżej progu wypada');
  assert.equal(noResults, false);
  assert.ok(hits.every((h) => h.trafionePrzez === 'wektor'));
  assert.ok(hits.every((h) => h.tekstRank === null));
});

test('bez identyfikatora i wszystko pod progiem → noResults', () => {
  // "jak upiec sernik" 0,3354 · "jaka jest stolica Australii" 0,3202
  const wektorowe = [w('a', 0.3354), w('b', 0.3202)];
  const { hits, noResults } = polaczTrafienia({ wektorowe, tekstowe: null, prog: PROG, limit: 5 });
  assert.deepEqual(hits, []);
  assert.equal(noResults, true);
});

// --- reguła negatywna ------------------------------------------------------------

test('identyfikator + ZERO trafień tekstowych → noResults', () => {
  // "art. 9999": dziś wektory zwracają przypis o dyrektywach EWG ze score 0,4516,
  // czyli POWYŻEJ progu. Pytano o rzecz dokładną, której nie ma — podobieństwo
  // tematyczne nie jest odpowiedzią.
  const wektorowe = [w('a', 0.4516), w('b', 0.4445)];
  const { hits, noResults, regulaNegatywna } = polaczTrafienia({
    wektorowe, tekstowe: [], prog: PROG, limit: 5,
  });
  assert.deepEqual(hits, []);
  assert.equal(noResults, true);
  assert.equal(regulaNegatywna, true);
});

test('JEDNO trafienie tekstowe wyłącza regułę negatywną', () => {
  // Warunek jest celowo ostry — zero, nie "mało". Jedno trafienie znaczy, że
  // identyfikator jednak istnieje, a o kolejność zadba grupowanie.
  const wektorowe = [w('a', 0.4516), w('b', 0.30)];
  const { hits, noResults, regulaNegatywna } = polaczTrafienia({
    wektorowe, tekstowe: [{ chunkId: 'b', textRank: 0.1 }], prog: PROG, limit: 5,
  });
  assert.equal(regulaNegatywna, false);
  assert.equal(noResults, false);
  // 'b' idzie pierwsze, bo pasuje tekstowo — mimo score 0,30 wobec 0,4516.
  assert.deepEqual(hits.map((h) => h.chunkId), ['b', 'a']);
});

// --- porządek: dopasowania dokładne przed tematycznymi ---------------------------

test('dopasowanie dokładne idzie PRZED mocniejszym trafieniem tematycznym', () => {
  // "art. 154": cel ma 0,4389, a szum z Kodeksu 0,4899 / 0,4880 / 0,4871 — żaden
  // nie zawiera 154. Przy sortowaniu po samym score cel lądował na 3. pozycji.
  const wektorowe = [w('szum1', 0.4899), w('szum2', 0.4880), w('cel', 0.4389)];
  const { hits } = polaczTrafienia({
    wektorowe, tekstowe: [{ chunkId: 'cel', textRank: 0.1 }], prog: PROG, limit: 5,
  });
  assert.deepEqual(hits.map((h) => h.chunkId), ['cel', 'szum1', 'szum2']);
  assert.equal(hits[0].trafionePrzez, 'tekst', 'wpuszczony mimo score pod progiem');
});

test('w obrębie grupy score MALEJE — to czyni kolejność wytłumaczalną', () => {
  const wektorowe = [w('t1', 0.40), w('t2', 0.60), w('w1', 0.50), w('w2', 0.70)];
  const { hits } = polaczTrafienia({
    wektorowe,
    tekstowe: [{ chunkId: 't1', textRank: 1 }, { chunkId: 't2', textRank: 1 }],
    prog: PROG, limit: 4,
  });
  assert.deepEqual(hits.map((h) => h.chunkId), ['t2', 't1', 'w2', 'w1']);
});

test('LIMIT UDZIAŁU: grupa tekstowa nie zabiera wszystkich miejsc', () => {
  // Zmierzone na "ile dni urlopu w 2024 roku": token "2024" daje 21 dopasowań
  // (przypisy "U. z 2024 r. poz. 834…"), a właściwy Art. 152 o score 0,5606 NIE
  // zawiera "2024". Bez limitu wypadał z wyników całkowicie, bez żadnego sygnału.
  const wektorowe = [
    w('t1', 0.5457), w('t2', 0.4931), w('t3', 0.4493), w('t4', 0.4344), w('t5', 0.3939),
    w('odpowiedz', 0.5606),
  ];
  const tekstowe = ['t1', 't2', 't3', 't4', 't5'].map((chunkId) => ({ chunkId, textRank: 0.1 }));
  const { hits } = polaczTrafienia({ wektorowe, tekstowe, prog: PROG, limit: 5 });

  // Limit dotyczy CZOŁA listy: najwyżej 3 z 5 miejsc na starcie należą do dopasowań
  // dokładnych. Nadmiarowe nie znikają — lądują za trafieniami tematycznymi.
  assert.deepEqual(hits.map((h) => h.chunkId), ['t1', 't2', 't3', 'odpowiedz', 't4']);
  assert.equal(hits.findIndex((h) => h.chunkId === 'odpowiedz'), 3,
    'właściwa odpowiedź wchodzi zaraz za limitem grupy tekstowej');
});

test('limit udziału nigdy nie schodzi do zera', () => {
  // Przy topK = 1 połowa to 0,5 — bez zaokrąglenia w górę i podłogi 1 dopasowanie
  // dokładne nie miałoby jak się pokazać.
  const wektorowe = [w('cel', 0.30), w('inny', 0.60)];
  const { hits } = polaczTrafienia({
    wektorowe, tekstowe: [{ chunkId: 'cel', textRank: 1 }], prog: PROG, limit: 1,
  });
  assert.deepEqual(hits.map((h) => h.chunkId), ['cel']);
});

test('udział liczy się od limitu, nie od liczby dopasowań', () => {
  assert.equal(UDZIAL_GRUPY_TEKSTOWEJ, 0.5);
});

test('trafienie w OBU ścieżkach jest oznaczone jako "oba"', () => {
  const wektorowe = [w('a', 0.60)];
  const { hits } = polaczTrafienia({
    wektorowe, tekstowe: [{ chunkId: 'a', textRank: 0.3 }], prog: PROG, limit: 5,
  });
  assert.equal(hits[0].trafionePrzez, 'oba');
});


test('limit obowiązuje po fuzji, nie przed', () => {
  // Przy limicie 2 grupa tekstowa dostaje ceil(2 * 0,5) = 1 miejsce, drugie idzie
  // do najmocniejszego trafienia tematycznego. 'b' wypada — to działanie limitu,
  // nie ucięcia przed fuzją (inaczej 'c' w ogóle by tu nie dotarło).
  const wektorowe = [w('a', 0.70), w('b', 0.65), w('c', 0.44)];
  const { hits } = polaczTrafienia({
    wektorowe, tekstowe: [{ chunkId: 'c', textRank: 9 }], prog: PROG, limit: 2,
  });
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map((h) => h.chunkId), ['c', 'a']);
});

test('remis rozstrzygany stabilnie, nie losowo', () => {
  const wektorowe = [w('bbb', 0.60), w('aaa', 0.60)];
  const raz = polaczTrafienia({ wektorowe, tekstowe: null, prog: PROG, limit: 5 });
  const dwa = polaczTrafienia({ wektorowe: [...wektorowe].reverse(), tekstowe: null, prog: PROG, limit: 5 });
  assert.deepEqual(raz.hits.map((h) => h.chunkId), dwa.hits.map((h) => h.chunkId));
});

test('pusty zbiór wektorowy nie wywraca fuzji', () => {
  assert.deepEqual(polaczTrafienia({ wektorowe: [], tekstowe: null, prog: PROG, limit: 5 }).hits, []);
  assert.equal(polaczTrafienia({}).noResults, true);
});

test('minScore = 0 (diagnostyka progu) przepuszcza wszystko', () => {
  const wektorowe = [w('a', 0.30), w('b', 0.10)];
  const { hits } = polaczTrafienia({ wektorowe, tekstowe: null, prog: 0, limit: 5 });
  assert.equal(hits.length, 2);
});

// =============================================================================
//  ODSIEW POWTÓRZONYCH FRAGMENTÓW (11.1k)
// =============================================================================
import { odsiejPowtorki, kluczTresci } from './hybryda.js';

const h = (id, content) => ({ chunkId: id, content, score: 0.6, trafionePrzez: 'wektor' });

test('REGRESJA KRYTYCZNA: fragmenty różniące się WYŁĄCZNIE dawką NIE są powtórką', () => {
  // To jest przypadek, który przesądził o kształcie tej funkcji. Zmierzone
  // podobieństwo wektorowe tej pary: 0,9911 — czyli KAŻDY próg wektorowy, który
  // odsiewa cokolwiek sensownego, skasowałby jedną z dwóch dawek. Dla użytkownika
  // to różnica krytyczna, a błąd byłby NIEWIDOCZNY: nie zobaczy fragmentu,
  // którego nie dostał.
  const { hits, odsiane } = odsiejPowtorki([
    h('a', 'Zalecana dawka początkowa lenalidomidu wynosi 10 mg doustnie raz na dobę w dniach 1. do 21.'),
    h('b', 'Zalecana dawka początkowa lenalidomidu wynosi 25 mg doustnie raz na dobę w dniach 1. do 21.'),
  ]);
  assert.equal(odsiane, 0, 'różnica dawki NIE MOŻE być traktowana jak powtórzenie');
  assert.equal(hits.length, 2);
});

test('to samo dla terminów i kwot — cyfry zostają w kluczu', () => {
  assert.notEqual(kluczTresci('termin 14 dni'), kluczTresci('termin 30 dni'));
  assert.notEqual(kluczTresci('kaucja 5000 zł'), kluczTresci('kaucja 500 zł'));
  assert.notEqual(kluczTresci('Revlimid 5 mg'), kluczTresci('Revlimid 50 mg'));
});

test('powtórzony fragment jest odsiewany, pierwszy zostaje', () => {
  const { hits, odsiane } = odsiejPowtorki([
    h('a', '9. WARUNKI PRZECHOWYWANIA'),
    h('b', '9. WARUNKI PRZECHOWYWANIA'),
    h('c', 'coś innego'),
  ]);
  assert.equal(odsiane, 1);
  assert.deepEqual(hits.map((x) => x.chunkId), ['a', 'c'], 'zostaje PIERWSZY, czyli lepiej oceniony');
});

test('różnice w białych znakach i wielkości liter to nadal ta sama treść', () => {
  const { odsiane } = odsiejPowtorki([h('a', 'Warunki   przechowywania\n'), h('b', 'WARUNKI PRZECHOWYWANIA')]);
  assert.equal(odsiane, 1);
});

test('puste fragmenty nie zlepiają się w jeden', () => {
  const { hits, odsiane } = odsiejPowtorki([h('a', ''), h('b', '   '), h('c', 'treść')]);
  assert.equal(odsiane, 0, 'brak treści to nie jest powtórzenie treści');
  assert.equal(hits.length, 3);
});

test('wyłącznik naprawdę wyłącza', () => {
  const { hits, odsiane } = odsiejPowtorki([h('a', 'to samo'), h('b', 'to samo')], { wlaczony: false });
  assert.equal(odsiane, 0);
  assert.equal(hits.length, 2);
});

test('odsiew NIE schodzi poniżej topK — kolejni kandydaci wchodzą na zwolnione miejsca', () => {
  const wektorowe = [
    h('a', 'powtórka'), h('b', 'powtórka'), h('c', 'powtórka'),
    h('d', 'inne 1'), h('e', 'inne 2'), h('f', 'inne 3'), h('g', 'inne 4'),
  ].map((x, i) => ({ ...x, score: 0.9 - i * 0.01 }));
  const { hits, odsiane } = polaczTrafienia({ wektorowe, tekstowe: null, prog: 0.3, limit: 5 });
  assert.equal(odsiane, 2, 'dwie powtórki wypadły');
  assert.equal(hits.length, 5, 'ale wyników nadal jest tyle, ile poproszono');
  assert.deepEqual(hits.map((x) => x.chunkId), ['a', 'd', 'e', 'f', 'g']);
});

test('zachowany fragment niesie POCHODZENIE odsianych bliźniaków', () => {
  const { hits, odsiane } = odsiejPowtorki([
    { chunkId: 'a', documentId: 'd1', fileName: 'regulamin-2023.pdf', pageFrom: 4, content: 'ta sama treść', score: 0.7 },
    { chunkId: 'b', documentId: 'd2', fileName: 'regulamin-2024.pdf', pageFrom: 5, content: 'ta sama treść', score: 0.9 },
  ]);
  assert.equal(odsiane, 1);
  assert.equal(hits.length, 1);
  // Zachowany ma WYŻSZY wynik, nie ten, który był pierwszy na liście.
  assert.equal(hits[0].chunkId, 'b');
  // I niesie informację o drugim — bez tego agent zacytowałby wersję 2024
  // i nikt by się nie dowiedział, że identyczne zdanie stoi też w 2023.
  assert.deepEqual(hits[0].takzeW, [
    { chunkId: 'a', documentId: 'd1', fileName: 'regulamin-2023.pdf', pageFrom: 4, innyDokument: true },
  ]);
});

test('bliźniak w TYM SAMYM pliku jest oznaczony jako ten sam dokument', () => {
  const { hits } = odsiejPowtorki([
    { chunkId: 'a', documentId: 'd1', fileName: 'epar.pdf', pageFrom: 80, content: 'x', score: 0.9 },
    { chunkId: 'b', documentId: 'd1', fileName: 'epar.pdf', pageFrom: 95, content: 'x', score: 0.8 },
  ]);
  assert.equal(hits[0].takzeW[0].innyDokument, false, 'ten sam plik — przy cytowaniu nic nie ginie');
});

test('remis wyników rozstrzyga chunkId, nie kolejność z bazy', () => {
  const a = { chunkId: 'zzz', documentId: 'd1', fileName: 'f', pageFrom: 1, content: 'x', score: 0.5 };
  const b = { chunkId: 'aaa', documentId: 'd2', fileName: 'g', pageFrom: 2, content: 'x', score: 0.5 };
  assert.equal(odsiejPowtorki([a, b]).hits[0].chunkId, 'aaa');
  assert.equal(odsiejPowtorki([b, a]).hits[0].chunkId, 'aaa', 'ta sama odpowiedź niezależnie od kolejności wejścia');
});

test('fragment BEZ bliźniaka nie dostaje pustego pola takzeW', () => {
  const { hits } = odsiejPowtorki([{ chunkId: 'a', documentId: 'd1', fileName: 'f', pageFrom: 1, content: 'x', score: 0.9 }]);
  assert.equal(hits[0].takzeW, undefined, 'brak bliźniaków to brak pola, nie pusta tablica');
});
