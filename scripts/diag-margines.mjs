// MARGINES PROGU dla DOWOLNEJ kolekcji. NICZEGO NIE ZAPISUJE.
//
// Wersja 2 (29.07.2026): kolekcja i zestaw kontrolny przychodzą z zewnątrz. Wersja 1
// miała pytania wpisane w kod pod „Regulaminy", więc pomiar dało się powtórzyć na
// jednej kolekcji i na żadnej innej.
//
// CO SIĘ MIERZY:
//   sufit szumu DALEKIEGO — pytania spoza dziedziny, bez wspólnej leksyki
//   sufit szumu BLISKIEGO — pytania z SĄSIEDNIEJ dziedziny, dzielące z korpusem
//                           całe słownictwo, ale bez poprawnej odpowiedzi w nim
//   najsłabsze poprawne   — score celu w najtrudniejszym pytaniu Z korpusu
//   margines              — najsłabsze poprawne − próg (tak liczy to 11.1)
//
// SUFIT DALEKI SAM Z SIEBIE NIC NIE ZNACZY. Pytanie „jak upiec sernik" nie dzieli
// z korpusem prawnym ani jednego słowa, więc jego score spada bez udziału progu.
// Klasa BLISKA jest jedyną, która sprawdza, czy próg w ogóle coś rozdziela.
//
// ZESTAW KONTROLNY JEST CZĘŚCIĄ POMIARU, nie jego dekoracją: zmiana sformułowania
// pytania rusza score o ~0,15, czyli osiemnaście razy więcej niż cały margines.
// Dlatego zestawy leżą w plikach (scripts/zestawy/*.json) i są wersjonowane.
//
// Użycie:
//   node scripts/diag-margines.mjs scripts/zestawy/regulaminy.json
//   node scripts/diag-margines.mjs scripts/zestawy/test.json --kolekcja TEST

import { readFileSync } from 'node:fs';
import { loadEnvLocal } from './_env.mjs';
loadEnvLocal(import.meta.url);

const { getSupabaseClient } = await import('../lib/rag/db.js');
const { searchCollection } = await import('../lib/rag/search.js');
const { getConfig } = await import('../lib/rag/config.js');

const GLEBOKO = 200;

const argv = process.argv.slice(2);
const sciezka = argv.find((a) => !a.startsWith('--'));
if (!sciezka) {
  console.error('Użycie: node scripts/diag-margines.mjs <zestaw.json> [--kolekcja Nazwa] [--dokumenty a,b]');
  process.exit(1);
}
const zestaw = JSON.parse(readFileSync(sciezka, 'utf8'));
const nadpisanaKolekcja = argv.includes('--kolekcja') ? argv[argv.indexOf('--kolekcja') + 1] : null;
const filtrDok = argv.includes('--dokumenty') ? argv[argv.indexOf('--dokumenty') + 1].split(',') : null;
const NAZWA = nadpisanaKolekcja || zestaw.kolekcja;

const cfg = getConfig();
const PROG = cfg.search.minScore;
const client = getSupabaseClient();
const { data: kol } = await client.from('rag_collections').select('id,name');
const kolekcja = (kol || []).find((k) => k.name === NAZWA);
if (!kolekcja) {
  console.error(`Brak kolekcji "${NAZWA}". Dostępne: ${(kol || []).map((k) => k.name).join(', ')}`);
  process.exit(1);
}

// Opcjonalne zawężenie do części dokumentów — potrzebne, gdy kolekcja jest mieszana
// i pomiar na całości mierzyłby coś innego niż zadeklarowana dziedzina.
let documentIds = null;
if (filtrDok) {
  const { data: dok } = await client.from('rag_documents').select('id, file_name').eq('collection_id', kolekcja.id);
  documentIds = (dok || []).filter((d) => filtrDok.some((f) => d.file_name.includes(f))).map((d) => d.id);
  if (!documentIds.length) {
    console.error(`Żaden dokument nie pasuje do "${filtrDok.join(',')}".`);
    process.exit(1);
  }
}

async function gleboko(q) {
  const { hits } = await searchCollection({
    collectionId: kolekcja.id,
    query: q,
    topK: GLEBOKO,
    minScore: 0,
    documentIds,
  });
  return hits;
}

console.log('='.repeat(104));
console.log(`MARGINES PROGU · kolekcja "${kolekcja.name}" · RAG_MIN_SCORE = ${PROG} · topK ${GLEBOKO}`);
console.log(`zestaw: ${sciezka}  (utworzony ${zestaw.utworzony})`);
if (documentIds) console.log(`ZAWĘŻONE do ${documentIds.length} dokumentów: ${filtrDok.join(', ')}`);
console.log(zestaw.opis ? `korpus: ${zestaw.opis}` : '');
console.log('='.repeat(104));

// --- 1. Pytania poprawne ------------------------------------------------------
console.log('\n' + '-'.repeat(104));
console.log('PYTANIA Z KORPUSU — score CELU (nie score najlepszego trafienia)');
console.log('-'.repeat(104));
console.log('  score   poz.  top1     pytanie');

const wynikiPoprawne = [];
let brakCelu = 0;
for (const { pytanie, fraza } of zestaw.poprawne) {
  const hits = await gleboko(pytanie);
  const poz = hits.findIndex((h) => (h.content || '').includes(fraza));
  if (poz < 0) {
    brakCelu++;
    console.log(`  BRAK CELU     ${hits[0] ? hits[0].score.toFixed(4) : '—'}   "${pytanie}"`);
    console.log(`                       szukana fraza „${fraza}" nie występuje w ${hits.length} fragmentach`);
    continue;
  }
  const h = hits[poz];
  wynikiPoprawne.push({ q: pytanie, score: h.score, poz: poz + 1, plik: h.fileName });
  console.log(`  ${h.score.toFixed(4)} ${String(poz + 1).padStart(5)}  ${hits[0].score.toFixed(4)}   "${pytanie.slice(0, 58)}"`);
  console.log(`                        ${h.fileName}${h.pageFrom != null ? ' str.' + h.pageFrom : ''} › ${String(h.headingPath || '(brak ścieżki)').slice(0, 50)}`);
}

// --- 2. Szum ------------------------------------------------------------------
const SZUM = [
  ...(zestaw.szumDaleki || []).map((q) => [q, 'daleki']),
  ...(zestaw.szumBliski || []).map((q) => [q, 'BLISKI']),
];
console.log('\n' + '-'.repeat(104));
console.log('PYTANIA SPOZA KORPUSU — najwyższy score, jaki dostają');
console.log('-'.repeat(104));
console.log('  top1     klasa   pytanie → co wyszło na wierzch');

const wynikiSzum = [];
for (const [q, klasaSzumu] of SZUM) {
  const hits = await gleboko(q);
  const top1 = hits[0] ? hits[0].score : 0;
  wynikiSzum.push({ q, score: top1, plik: hits[0] ? hits[0].fileName : '—', klasaSzumu });
  console.log(`  ${top1.toFixed(4)}  ${klasaSzumu.padEnd(7)} "${q.slice(0, 52)}" → ${hits[0] ? hits[0].fileName.slice(0, 30) : '—'}`);
  if (hits[0]) console.log(`                    ${String(hits[0].content || '').replace(/\s+/g, ' ').slice(0, 76)}`);
}

// --- 3. Werdykt ---------------------------------------------------------------
const naj = (lista) => lista.reduce((a, b) => (b.score > a.score ? b : a), { score: -1, q: '—' });
const sufit = naj(wynikiSzum);
const sufitDaleki = naj(wynikiSzum.filter((w) => w.klasaSzumu === 'daleki'));
const sufitBliski = naj(wynikiSzum.filter((w) => w.klasaSzumu === 'BLISKI'));
const najslabsze = wynikiPoprawne.reduce((a, b) => (b.score < a.score ? b : a), { score: 2, q: '—' });
const marginesNadProgiem = najslabsze.score - PROG;
const przerwa = najslabsze.score - sufit.score;
const naPozycji1 = wynikiPoprawne.filter((w) => w.poz === 1).length;

console.log('\n' + '='.repeat(104));
console.log('WERDYKT');
console.log('='.repeat(104));
console.log(`  sufit szumu DALEKIEGO    : ${sufitDaleki.score.toFixed(4)}   ("${sufitDaleki.q}")`);
console.log(`  sufit szumu BLISKIEGO    : ${sufitBliski.score.toFixed(4)}   ("${sufitBliski.q}")`);
console.log(`  najsłabsze poprawne      : ${najslabsze.score.toFixed(4)}   ("${najslabsze.q}")`);
console.log(`  MARGINES nad progiem     : ${marginesNadProgiem >= 0 ? '+' : ''}${marginesNadProgiem.toFixed(4)}   (${najslabsze.score.toFixed(4)} − ${PROG})`);
console.log(`  przerwa poprawne − szum  : ${przerwa >= 0 ? '+' : ''}${przerwa.toFixed(4)}`);
console.log(`  cel na pozycji 1         : ${naPozycji1} z ${wynikiPoprawne.length}${brakCelu ? `   (+${brakCelu} bez celu w korpusie)` : ''}`);
console.log('');
if (przerwa <= 0) {
  console.log('  KLASY SIĘ PRZEPLATAJĄ — ŻADNA wartość progu ich nie rozdziela.');
  const podSufitem = wynikiPoprawne.filter((w) => w.score <= sufit.score);
  const nadPoprawnym = wynikiSzum.filter((w) => w.score >= najslabsze.score);
  console.log(`  poprawnych pod sufitem szumu: ${podSufitem.length}   ·   szumu nad najsłabszym poprawnym: ${nadPoprawnym.length}`);
} else {
  console.log(`  Przedział rozdzielający klasy: (${sufit.score.toFixed(4)} ; ${najslabsze.score.toFixed(4)}]`);
  console.log(`  Obecny próg ${PROG} ${PROG > sufit.score && PROG <= najslabsze.score ? 'MIEŚCI SIĘ w nim.' : 'NIE mieści się w nim.'}`);
}

// --- 4. Rozkład obu klas ------------------------------------------------------
console.log('\n' + '-'.repeat(104));
console.log('ROZKŁAD (P = poprawne, B = szum bliski, S = szum daleki) — przeplot znaczy brak progu');
console.log('-'.repeat(104));
const wszystko = [
  ...wynikiPoprawne.map((w) => ({ ...w, klasa: 'P' })),
  ...wynikiSzum.map((w) => ({ ...w, klasa: w.klasaSzumu === 'BLISKI' ? 'B' : 'S' })),
].sort((a, b) => b.score - a.score);
for (const w of wszystko) {
  console.log(`  ${w.klasa}  ${w.score.toFixed(4)}  ${'█'.repeat(Math.round(w.score * 40))}${w.score >= PROG ? '' : '  (pod progiem)'}`);
  console.log(`        ${' '.repeat(6)}"${w.q.slice(0, 66)}"`);
}

// --- 5. Ścieżka hybrydowa -----------------------------------------------------
if (zestaw.identyfikatory && zestaw.identyfikatory.length) {
  console.log('\n' + '-'.repeat(104));
  console.log('ŚCIEŻKA HYBRYDOWA — score wektorowy celu vs. czy fuzja go wyciąga');
  console.log('-'.repeat(104));
  console.log('  score wekt.  poz.wekt.  nad progiem?   po fuzji                  pytanie');
  for (const { pytanie, fraza } of zestaw.identyfikatory) {
    const hits = await gleboko(pytanie);
    const poz = hits.findIndex((h) => (h.content || '').includes(fraza));
    const { hits: realne, noResults } = await searchCollection({ collectionId: kolekcja.id, query: pytanie, documentIds });
    const pozRealna = realne.findIndex((h) => (h.content || '').includes(fraza));
    if (poz < 0) {
      console.log(`  BRAK CELU („${fraza}")                                              "${pytanie}"`);
      continue;
    }
    const s = hits[poz].score;
    console.log(
      `  ${s.toFixed(4)}     ${String(poz + 1).padStart(6)}     ${(s >= PROG ? 'TAK' : 'NIE').padEnd(12)}   ${(noResults ? 'noResults' : pozRealna >= 0 ? `poz. ${pozRealna + 1} z ${realne.length}` : `NIE MA go w ${realne.length}`).padEnd(24)}  "${pytanie}"`
    );
  }
}
console.log('');
