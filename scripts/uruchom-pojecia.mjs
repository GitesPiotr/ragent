// Uruchomienie wyciągania pojęć z konsoli — ta sama pętla, którą wykonuje klient
// w przeglądarce (POST /concepts/extract aż do finished), tylko bez UI.
//
// ZAPISUJE DO BAZY. Wymaga uruchomionego sql/session-7-concepts.sql i Ollamy.
//
// Użycie:  node scripts/uruchom-pojecia.mjs 01-regulamin-pracy.md

import { loadEnvLocal } from './_env.mjs';
loadEnvLocal(import.meta.url);

const { getConfig } = await import('../lib/rag/config.js');
const { getSupabaseClient } = await import('../lib/rag/db.js');
const { extractConceptsForDocument, listConcepts, searchByConcept } = await import('../lib/rag/concepts.js');

const PLIK = process.argv[2];
if (!PLIK) {
  console.error('Podaj nazwę pliku, np.: node scripts/uruchom-pojecia.mjs 01-regulamin-pracy.md');
  process.exit(1);
}

const cfg = getConfig();
const client = getSupabaseClient();

const { data: docs } = await client.from('rag_documents').select('id,collection_id,file_name,chunk_count');
const doc = docs.find((d) => d.file_name === PLIK);
if (!doc) {
  console.error(`Nie znaleziono dokumentu "${PLIK}".`);
  process.exit(1);
}

console.log(`Dokument: ${PLIK} (${doc.chunk_count} fragmentów)`);
console.log(`Model: ${cfg.concept.provider} / ${cfg.concept.model} · partia ${cfg.concept.batch} · ${cfg.concept.perChunk} pojęć na fragment\n`);

// `done` i `total` przychodzą policzone Z BAZY (odpowiednik getEmbedProgress),
// więc nic tu nie sumujemy — przerwanie i wznowienie pokazuje prawdziwy stan.
const start = Date.now();
const stanStartowy = await extractConceptsForDocument(doc.id, { batch: 0 });
console.log(`Na starcie: ${stanStartowy.done}/${stanStartowy.total} fragmentów ma pojęcia\n`);

let ostatni = stanStartowy;
for (;;) {
  const r = await extractConceptsForDocument(doc.id);
  ostatni = r;
  const s = (Date.now() - start) / 1000;
  const zrobionePrzezNas = Math.max(0, r.done - stanStartowy.done);
  const tempo = zrobionePrzezNas ? (s / zrobionePrzezNas).toFixed(1) : '—';
  const zostalo = r.total - r.done;
  const eta = zrobionePrzezNas ? ((s / zrobionePrzezNas) * zostalo / 60).toFixed(0) : '?';
  console.log(`  ${r.done}/${r.total} fragmentów · ${s.toFixed(0)}s · ${tempo}s/frg · zostało ~${eta} min`);
  if (r.finished) break;
}

const sekundy = (Date.now() - start) / 1000;
const nasze = Math.max(1, ostatni.done - stanStartowy.done);
console.log(`\nGotowe w ${(sekundy / 60).toFixed(1)} min · przerobiono ${nasze} fragmentów (${(sekundy / nasze).toFixed(1)}s na fragment)`);
if (ostatni.done < ostatni.total) {
  console.log(`UWAGA: ${ostatni.total - ostatni.done} fragmentów nie dostało pojęć — model nie zwrócił dla nich etykiet.`);
}
console.log('');

// --- co powstało -------------------------------------------------------------
const { concepts } = await listConcepts(doc.collection_id);
console.log('='.repeat(94));
console.log(`POJĘCIA KOLEKCJI: ${concepts.length}`);
console.log('='.repeat(94));
for (const p of concepts) {
  const { chunks, total } = await searchByConcept({
    collectionId: doc.collection_id,
    conceptId: p.id,
    limit: 3,
  });
  console.log(`\n„${p.label}"  ·  mention_count = ${p.mentionCount}  ·  fragmentów w bazie: ${total}`);
  for (const f of chunks) {
    console.log(`     ${f.fileName} | ${JSON.stringify(f.content.slice(0, 70).replace(/\s+/g, ' '))}`);
  }
}
console.log('');
