// KONDYCJA KOLEKCJI przed pomiarem progu. NIC NIE ZAPISUJE.
//
// Pomiar progu na kolekcji z dziurami w indeksowaniu mierzy co innego, niż się myśli:
// fragment bez wektora nie ma jak zostać znaleziony, więc „najsłabsze poprawne
// trafienie" opisywałoby wtedy tylko tę część korpusu, która została zembedowana.
// Ten skrypt sprawdza to PRZED pomiarem i ma prawo go zatrzymać.
//
// Użycie:  node scripts/diag-kondycja.mjs [nazwa-kolekcji]

import { loadEnvLocal } from './_env.mjs';
loadEnvLocal(import.meta.url);

const { getSupabaseClient, czytajStronami } = await import('../lib/rag/db.js');
const { getConfig } = await import('../lib/rag/config.js');

const cfg = getConfig();
const client = getSupabaseClient();
const NAZWA = process.argv[2] || 'Regulaminy';
const { data: kol } = await client.from('rag_collections').select('id, name, embed_model, embed_dim');
const k = (kol || []).find((x) => x.name === NAZWA);
if (!k) {
  console.error(`Brak kolekcji "${NAZWA}". Dostępne: ${(kol || []).map((x) => x.name).join(', ')}`);
  process.exit(1);
}

const { data: dokumenty } = await client
  .from('rag_documents')
  .select('id, file_name, chunk_count, status, char_count, page_count')
  .eq('collection_id', k.id)
  .order('created_at', { ascending: true });

// `embedding` bierzemy jako flagę, nie jako wektor — 932 × 1024 liczb to kilkanaście MB
// przesyłu, a pytanie brzmi wyłącznie „jest czy nie ma".
const chunks = await czytajStronami((od, do_) =>
  client
    .from('rag_chunks')
    .select('id, document_id, embedding, content')
    .eq('collection_id', k.id)
    .order('id', { ascending: true })
    .range(od, do_)
);

console.log('='.repeat(98));
console.log(`KONDYCJA · "${k.name}"  ·  model ${k.embed_model} · wymiar ${k.embed_dim}`);
console.log(`konfiguracja: ${cfg.embed.model} / ${cfg.embed.dim}${k.embed_model !== cfg.embed.model ? '   ⚠ ROZJAZD MODELU' : ''}`);
console.log('='.repeat(98));

let problemy = 0;
console.log('\n  fragm.  z wektorem  pustych  status      plik');
for (const d of dokumenty) {
  const swoje = chunks.filter((c) => c.document_id === d.id);
  const zWek = swoje.filter((c) => c.embedding).length;
  const puste = swoje.filter((c) => !String(c.content || '').trim()).length;
  const zle = swoje.length === 0 || zWek < swoje.length || puste > 0;
  if (zle) problemy++;
  console.log(
    `  ${String(swoje.length).padStart(6)}  ${String(zWek).padStart(10)}  ${String(puste).padStart(7)}  ${String(d.status || '—').padEnd(10)}  ${d.file_name}${zle ? '   ⚠' : ''}`
  );
  if (swoje.length === 0) console.log(`          ⚠ ZERO FRAGMENTÓW (znaków: ${d.char_count || 0}, stron: ${d.page_count || 0})`);
  if (swoje.length && zWek < swoje.length) console.log(`          ⚠ ${swoje.length - zWek} fragmentów BEZ WEKTORA — nie da się ich znaleźć`);
}

const bezWektora = chunks.filter((c) => !c.embedding).length;
console.log(`\n  RAZEM: ${chunks.length} fragmentów, ${chunks.length - bezWektora} z wektorem, ${bezWektora} bez.`);

// Rozkład długości — bardzo krótkie fragmenty (nagłówki, numery stron) są naturalnym
// szumem i warto wiedzieć, ile ich jest, zanim zdziwi nas sufit.
const dlugosci = chunks.map((c) => String(c.content || '').length).sort((a, b) => a - b);
const mediana = dlugosci[Math.floor(dlugosci.length / 2)] || 0;
const krotkie = dlugosci.filter((d) => d < 80).length;
console.log(`  długość fragmentu: mediana ${mediana} znaków, poniżej 80 znaków: ${krotkie} (${Math.round((krotkie / chunks.length) * 100)}%)`);

// =============================================================================
//  JAKOŚĆ TEKSTU — druga klasa problemów, niewidoczna w liczbie fragmentów
//
//  „932 fragmenty, 932 z wektorem" wygląda na zdrową kolekcję i nią nie jest, jeśli
//  ekstrakcja zgubiła polskie znaki diakrytyczne albo dokument jest w innym języku.
//  Wektor policzy się z każdego tekstu — także z „Sporód wszystkich gospodarstw
//  rodzinnych 62% stanowiy te tworzone wycznie". Fragment bez wektora ma tę
//  przewagę, że widać, że go nie ma.
// =============================================================================
const POLSKIE = /[ąćęłńóśźż]/gi;
// Znaki, których polszczyzna NIE MA, a które jednoznacznie wskazują sąsiedni język.
const OBCE = {
  łotewski: /[āīūķļņģ]/gi,
  litewski: /[ėįųū]/gi,
  estoński: /[õäöü]/gi,
};
// Słowa, w których brak diakrytyku jest pewny, bo w poprawnej polszczyźnie nie istnieją.
const OKALECZONE = /\b(wycznie|sporód|ogóem|maestw\w*|dziemi|bd|wród|gospodarst\w+ domow\w+ ogóem|zwizk\w+|utrzyman\w+ i innymi)\b/gi;

console.log('\n' + '-'.repeat(98));
console.log('JAKOŚĆ TEKSTU — czy to na pewno polszczyzna i czy ekstrakcja nic nie zgubiła');
console.log('-'.repeat(98));
console.log('  diakrytyki  okaleczone  język obcy   plik');
let jakoscZla = 0;
for (const d of dokumenty) {
  const swoje = chunks.filter((c) => c.document_id === d.id);
  // Dokument bez fragmentów ma 0% diakrytyków z definicji i zgłaszanie go tutaj byłoby
  // fałszywym alarmem — brak tekstu jest już zgłoszony wyżej, jako brak tekstu.
  // Miara jakości nie ma prawa krzyczeć na pustkę; to ta sama zasada co „cicha zerowa
  // metryka", tylko odwrócona: zero, które nic nie znaczy, nie może udawać usterki.
  if (!swoje.length) {
    console.log(`  ${'—'.padStart(10)}  ${'—'.padStart(10)}  ${'—'.padStart(10)}   ${d.file_name}   (brak tekstu — zgłoszone wyżej)`);
    continue;
  }
  const tekst = swoje.map((c) => c.content || '').join(' ');
  const liter = (tekst.match(/\p{L}/gu) || []).length || 1;
  const diakr = (tekst.match(POLSKIE) || []).length;
  const udzialDiakr = (diakr / liter) * 100;
  const okaleczone = (tekst.match(OKALECZONE) || []).length;

  // Fragment liczymy jako obcojęzyczny, gdy ma znak spoza polskiego alfabetu.
  let obcych = 0;
  const jezyki = new Set();
  for (const c of swoje) {
    let obcy = false;
    for (const [jezyk, re] of Object.entries(OBCE)) {
      if (re.test(String(c.content || ''))) {
        obcy = true;
        jezyki.add(jezyk);
      }
      re.lastIndex = 0;
    }
    if (obcy) obcych++;
  }
  const udzialObcych = Math.round((obcych / (swoje.length || 1)) * 100);

  // Polszczyzna ma ~7–9% znaków diakrytycznych. Poniżej 2% przy polskim tytule
  // to nie styl autora, tylko zgubiona warstwa znaków.
  const zle = udzialDiakr < 2 || okaleczone > 20 || udzialObcych > 30;
  if (zle) jakoscZla++;
  console.log(
    `  ${(udzialDiakr.toFixed(1) + '%').padStart(10)}  ${String(okaleczone).padStart(10)}  ${(udzialObcych + '%').padStart(10)}   ${d.file_name}${zle ? '   ⚠' : ''}`
  );
  if (udzialDiakr < 2) console.log(`          ⚠ EKSTRAKCJA ZGUBIŁA DIAKRYTYKI — tekst jest okaleczony, wektory liczone z uszkodzonych słów`);
  if (udzialObcych > 30) console.log(`          ⚠ ${udzialObcych}% fragmentów w językach: ${[...jezyki].join(', ')} — to nie jest korpus polski`);
}

console.log(
  `\n  ${problemy || bezWektora ? '⚠ INDEKSOWANIE: SĄ PROBLEMY.' : '✓ Indeksowanie: kompletne (wszystkie fragmenty mają wektor).'}`
);
console.log(
  `  ${jakoscZla ? `⚠ JAKOŚĆ TEKSTU: ${jakoscZla} z ${dokumenty.length} dokumentów nie nadaje się do pomiaru progu jako „korpus polski".` : '✓ Jakość tekstu: bez zastrzeżeń.'}`
);
console.log('');
if (problemy || bezWektora || jakoscZla) process.exit(2);
