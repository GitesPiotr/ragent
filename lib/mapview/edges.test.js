import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEdges, sredniKolor, grupujPoKolorze, indeksKrawedzi } from './edges.js';

const KOLORY = new Map([
  ['d1', '#4c9aff'],
  ['d2', '#37b26b'],
]);

function chunk(id, documentId, sasiedzi) {
  return { id, documentId, neighbors: sasiedzi.map((s) => ({ id: s, dist2d: 0.1 })) };
}

// --- deduplikacja: A→B i B→A to JEDNA linia (12.6) --------------------------------

test('krawędź wzajemna liczy się raz, nie dwa', () => {
  const edges = buildEdges([chunk('a', 'd1', ['b']), chunk('b', 'd1', ['a'])], KOLORY);
  assert.equal(edges.length, 1);
});

test('deduplikacja niezależna od kolejności fragmentów', () => {
  const wprzod = buildEdges([chunk('a', 'd1', ['b']), chunk('b', 'd1', ['a'])], KOLORY);
  const wstecz = buildEdges([chunk('b', 'd1', ['a']), chunk('a', 'd1', ['b'])], KOLORY);
  assert.equal(wprzod.length, wstecz.length);
});

test('sąsiedztwo niesymetryczne (tylko jedna strona wie) daje krawędź', () => {
  // Tak wygląda sąsiedztwo policzone PRZYROSTOWO: nowy punkt zna starego,
  // stary o nowym nie wie do pełnego przeliczenia (12.6).
  const edges = buildEdges([chunk('stary', 'd1', []), chunk('nowy', 'd1', ['stary'])], KOLORY);
  assert.equal(edges.length, 1);
  assert.deepEqual([edges[0].a, edges[0].b].sort(), ['nowy', 'stary']);
});

test('sąsiad wskazujący na nieistniejący fragment jest pomijany', () => {
  const edges = buildEdges([chunk('a', 'd1', ['duch'])], KOLORY);
  assert.deepEqual(edges, []);
});

test('sąsiad wskazujący na samego siebie jest pomijany', () => {
  const edges = buildEdges([chunk('a', 'd1', ['a'])], KOLORY);
  assert.deepEqual(edges, []);
});

test('brak neighbors (null) nie wywraca budowy', () => {
  const edges = buildEdges([{ id: 'a', documentId: 'd1', neighbors: null }], KOLORY);
  assert.deepEqual(edges, []);
});

test('realna skala: wzajemne sąsiedztwo redukuje się dokładnie o połowę', () => {
  // Pierścień, w którym każdy wskazuje poprzednika i następcę — czyli KAŻDA para
  // jest wzajemna. 300 fragmentów × 2 sąsiadów = 600 krawędzi skierowanych,
  // po deduplikacji musi zostać dokładnie 300 linii.
  const chunks = [];
  for (let i = 0; i < 300; i++) {
    const poprzedni = 'c' + ((i + 299) % 300);
    const nastepny = 'c' + ((i + 1) % 300);
    chunks.push(chunk('c' + i, 'd1', [poprzedni, nastepny]));
  }
  const edges = buildEdges(chunks, KOLORY);
  assert.equal(edges.length, 300, 'bez deduplikacji byłoby 600 — każda linia rysowana dwa razy');
});

test('sąsiedztwo jednostronne NIE jest redukowane — nie ma czego deduplikować', () => {
  // Przeciwieństwo poprzedniego: nikt nie wskazuje wzajemnie, więc wszystkie
  // krawędzie są różne. Chroni przed "deduplikacją", która gubiłaby prawdziwe linie.
  const chunks = [];
  for (let i = 0; i < 100; i++) chunks.push(chunk('c' + i, 'd1', ['c' + ((i + 1) % 100)]));
  const edges = buildEdges(chunks, KOLORY);
  assert.equal(edges.length, 100);
});

// --- kolor uśredniony z obu końców (12.6) ----------------------------------------

test('kolor krawędzi to średnia obu końców', () => {
  assert.equal(sredniKolor('#000000', '#ffffff'), '#808080');
  assert.equal(sredniKolor('#ff0000', '#0000ff'), '#800080');
});

test('krawędź wewnątrz dokumentu zachowuje jego kolor', () => {
  assert.equal(sredniKolor('#4c9aff', '#4c9aff'), '#4c9aff');
  const edges = buildEdges([chunk('a', 'd1', ['b']), chunk('b', 'd1', [])], KOLORY);
  assert.equal(edges[0].color, '#4c9aff');
});

test('krawędź MIĘDZY dokumentami dostaje kolor pośredni', () => {
  const edges = buildEdges([chunk('a', 'd1', ['b']), chunk('b', 'd2', [])], KOLORY);
  assert.notEqual(edges[0].color, '#4c9aff');
  assert.notEqual(edges[0].color, '#37b26b');
});

test('nieznany dokument → kolor zastępczy zamiast wywrotki', () => {
  const edges = buildEdges([chunk('a', 'dX', ['b']), chunk('b', 'dX', [])], new Map());
  assert.equal(edges[0].color, '#8a93a6');
});

test('sredniKolor odporny na śmieciowe wejście', () => {
  assert.equal(sredniKolor(null, null), '#8a93a6');
  assert.equal(sredniKolor('#4c9aff', 'nie-kolor'), '#4c9aff');
});

// --- grupowanie: sedno wydajności ------------------------------------------------

test('grupowanie po kolorze zbija tysiące krawędzi do garstki wywołań rysowania', () => {
  const chunks = [];
  for (let i = 0; i < 1000; i++) {
    chunks.push(chunk('c' + i, i % 2 ? 'd1' : 'd2', ['c' + ((i + 1) % 1000)]));
  }
  const edges = buildEdges(chunks, KOLORY);
  const grupy = grupujPoKolorze(edges);
  assert.ok(edges.length > 900);
  assert.ok(grupy.size <= 3, `oczekiwano garstki grup, jest ${grupy.size}`);
});

test('grupowanie nie gubi ani nie dubluje krawędzi', () => {
  const edges = [
    { a: '1', b: '2', color: '#111111' },
    { a: '2', b: '3', color: '#222222' },
    { a: '3', b: '4', color: '#111111' },
  ];
  const grupy = grupujPoKolorze(edges);
  let razem = 0;
  for (const l of grupy.values()) razem += l.length;
  assert.equal(razem, 3);
  assert.equal(grupy.get('#111111').length, 2);
});

// --- indeks do podświetlania po najechaniu ---------------------------------------

test('indeksKrawedzi znajduje krawędzie z obu stron', () => {
  const edges = [{ a: 'x', b: 'y', color: '#111111' }];
  const idx = indeksKrawedzi(edges);
  assert.equal(idx.get('x').length, 1);
  assert.equal(idx.get('y').length, 1);
});
