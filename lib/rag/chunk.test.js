import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkBlocks } from './chunk.js';
import { extractCsv } from './extract.js';

const CFG = { size: 900, max: 1400, min: 150, overlap: 150 };

function sentence(prefix, len) {
  // Buduje "zdanie" o zadanej długości zakończone kropką i spacją usuwaną trimem.
  let s = prefix + ' ';
  while (s.length < len - 1) s += 'x';
  return s.trim() + '.';
}

const mixedBlocks = [
  { type: 'heading', level: 1, text: 'Rozdział 1', page: 1 },
  { type: 'paragraph', text: sentence('Pierwszy akapit o urlopie', 400), page: 1 },
  { type: 'paragraph', text: sentence('Drugi akapit o wynagrodzeniu', 400), page: 1 },
  { type: 'heading', level: 2, text: '1.1 Hasła', page: 2 },
  { type: 'paragraph', text: sentence('Akapit o hasłach i bezpieczeństwie', 600), page: 2 },
  { type: 'paragraph', text: 'Króciutki.', page: 2 },
];

test('NIEZMIENNIK: extracted_text.slice(char_start,char_end) === content dla każdego fragmentu', () => {
  const { extractedText, chunks } = chunkBlocks(mixedBlocks, CFG);
  assert.ok(chunks.length > 0);
  for (const c of chunks) {
    assert.equal(extractedText.slice(c.charStart, c.charEnd), c.content);
  }
});

test('determinizm: to samo wejście → identyczny wynik', () => {
  const a = chunkBlocks(mixedBlocks, CFG);
  const b = chunkBlocks(mixedBlocks, CFG);
  assert.deepEqual(a.chunks, b.chunks);
  assert.equal(a.extractedText, b.extractedText);
});

test('nagłówek nie przechodzi: żaden fragment nie przecina zakresu nagłówka', () => {
  const { chunks, blocks } = chunkBlocks(mixedBlocks, CFG);
  const headings = blocks.filter((b) => b.type === 'heading');
  for (const c of chunks) {
    for (const h of headings) {
      const intersects = c.charStart < h.end && c.charEnd > h.start;
      assert.ok(!intersects, `Fragment ${c.chunkIndex} przecina nagłówek "${h.text}"`);
    }
  }
});

test('heading_path budowany ze stosu nagłówków', () => {
  const { chunks } = chunkBlocks(mixedBlocks, CFG);
  // Fragmenty spod "1.1 Hasła" mają ścieżkę "Rozdział 1 › 1.1 Hasła".
  const podHaslami = chunks.find((c) => c.content.includes('hasłach'));
  assert.equal(podHaslami.headingPath, 'Rozdział 1 › 1.1 Hasła');
  const pierwszy = chunks.find((c) => c.content.includes('Pierwszy akapit'));
  assert.equal(pierwszy.headingPath, 'Rozdział 1');
});

test('8.3.6: krótki fragment między nagłówkami zostaje krótki (nie scala przez nagłówek)', () => {
  const blocks = [
    { type: 'heading', level: 1, text: 'A', page: null },
    { type: 'paragraph', text: 'Krótki.', page: null },
    { type: 'heading', level: 1, text: 'B', page: null },
    { type: 'paragraph', text: 'Też krótki.', page: null },
  ];
  const { chunks } = chunkBlocks(blocks, CFG);
  const krotki = chunks.find((c) => c.content === 'Krótki.');
  assert.ok(krotki, 'krótki fragment powinien istnieć osobno');
  assert.ok(krotki.charEnd - krotki.charStart < CFG.min);
});

test('8.3.6: krótki fragment w obrębie run scala się z sąsiadem', () => {
  const blocks = [
    { type: 'paragraph', text: sentence('Długi akapit', 950), page: null }, // > size, własny span
    { type: 'paragraph', text: 'Mały.', page: null }, // < min, scala się z poprzednim
  ];
  const { chunks } = chunkBlocks(blocks, CFG);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].content.endsWith('Mały.'));
});

test('8.3.4: akapit > MAX tnie się po zdaniach na wiele fragmentów ≤ MAX', () => {
  const zdania = [];
  for (let i = 0; i < 8; i++) zdania.push(sentence('Zdanie numer ' + i, 300));
  const blocks = [{ type: 'paragraph', text: zdania.join(' '), page: null }];
  const { chunks, extractedText } = chunkBlocks(blocks, CFG);
  assert.ok(chunks.length > 1, 'powinno powstać wiele fragmentów');
  for (const c of chunks) {
    assert.ok(c.charEnd - c.charStart <= CFG.max, 'fragment nie przekracza MAX');
    assert.equal(extractedText.slice(c.charStart, c.charEnd), c.content);
  }
});

test('8.3.4: pojedyncze zdanie > MAX tnie się twardo co SIZE', () => {
  const oneSentence = 'A'.repeat(2000) + '.'; // brak granic zdań w środku
  const blocks = [{ type: 'paragraph', text: oneSentence, page: null }];
  const { chunks } = chunkBlocks(blocks, CFG);
  assert.ok(chunks.length >= 3, 'ok. 2000/900 → co najmniej 3 kawałki');
  // twarde cięcie: każdy oprócz ostatniego ma długość SIZE
  for (let i = 0; i < chunks.length - 1; i++) {
    assert.equal(chunks[i].charEnd - chunks[i].charStart, CFG.size);
  }
});

test('CSV: każdy fragment zaczyna się od powtórzonego wiersza nagłówka', () => {
  const rows = ['imie,nazwisko,dzial'];
  for (let i = 0; i < 60; i++) rows.push(`Imie${i},Nazwisko${i},Dzial${i}`);
  const csv = rows.join('\n');
  const blocks = extractCsv(csv, CFG.size);
  assert.ok(blocks.length > 1, 'duży CSV powinien dać wiele bloków');
  const { chunks } = chunkBlocks(blocks, CFG);
  for (const c of chunks) {
    assert.ok(c.content.startsWith('imie,nazwisko,dzial'), 'fragment zaczyna się od nagłówka kolumn');
  }
});

test('extracted_text łączy bloki dokładnie separatorem "\\n\\n"', () => {
  const blocks = [
    { type: 'paragraph', text: 'Alfa.', page: null },
    { type: 'paragraph', text: 'Beta.', page: null },
  ];
  const { extractedText } = chunkBlocks(blocks, CFG);
  assert.equal(extractedText, 'Alfa.\n\nBeta.');
});

test('zakładka nie przechodzi przez nagłówek (fragment po nagłówku zaczyna się w swoim run)', () => {
  // Dwa duże akapity pod jednym nagłówkiem → zakładka MOŻE wystąpić w obrębie run,
  // ale fragmenty spod drugiego nagłówka nie mogą sięgać przed ten nagłówek.
  const { chunks, blocks } = chunkBlocks(mixedBlocks, CFG);
  const drugiNaglowek = blocks.find((b) => b.type === 'heading' && b.text === '1.1 Hasła');
  for (const c of chunks) {
    if (c.headingPath && c.headingPath.includes('1.1 Hasła')) {
      assert.ok(c.charStart >= drugiNaglowek.end, 'fragment nie sięga przed swój nagłówek');
    }
  }
});
