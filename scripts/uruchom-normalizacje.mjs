// Uruchomienie normalizacji pojęć z konsoli (Sesja 8). ZAPISUJE DO BAZY.
// Sprawdza też DoD: drugie uruchomienie ma zwrócić PUSTĄ listę scaleń,
// a każde scalone pojęcie ma wskazywać na kanoniczne (brak łańcuchów).
import { loadEnvLocal } from './_env.mjs';
loadEnvLocal(import.meta.url);
const { getConfig } = await import('../lib/rag/config.js');
const { getSupabaseClient } = await import('../lib/rag/db.js');
const { normalizeConcepts } = await import('../lib/rag/normalize-concepts.js');
const { listConcepts } = await import('../lib/rag/concepts.js');

const cfg = getConfig();
const client = getSupabaseClient();
const { data: kol } = await client.from('rag_collections').select('id,name');
const k = kol.find((x) => x.name === (process.argv[2] || 'Regulaminy'));

console.log(`Kolekcja: ${k.name}`);
console.log(`Próg: ${cfg.concept.mergeThreshold} · drugi sygnał: ${cfg.concept.mergeLexical ? `WŁĄCZONY (min ${cfg.concept.mergeLexicalMin}, rdzeń ≥${cfg.concept.stemMin})` : 'wyłączony'}`);

const przed = (await listConcepts(k.id)).concepts.length;
const r1 = await normalizeConcepts(k.id);
console.log(`\nPRZEBIEG 1: ${przed} → ${r1.conceptCount} pojęć kanonicznych, scaleń ${r1.merged.length}`);
for (const m of r1.merged) console.log(`   „${m.from}" → „${m.into}"   (${m.powod})`);

const r2 = await normalizeConcepts(k.id);
console.log(`\nPRZEBIEG 2 (DoD: ma być PUSTY): scaleń ${r2.merged.length}, pojęć ${r2.conceptCount}`);
if (r2.merged.length) for (const m of r2.merged) console.log(`   !! „${m.from}" → „${m.into}"`);

// DoD: brak łańcuchów — każde scalone wskazuje na pojęcie z merged_into = null.
const { data: wszystkie } = await client
  .from('rag_concepts').select('id,label,merged_into').eq('collection_id', k.id);
const wgId = new Map(wszystkie.map((p) => [p.id, p]));
const lancuchy = wszystkie.filter((p) => p.merged_into && wgId.get(p.merged_into)?.merged_into);
console.log(`\nDoD łańcuchy: ${lancuchy.length === 0 ? 'BRAK ✓' : 'SĄ ✗'}`);
for (const l of lancuchy) console.log(`   !! „${l.label}" → „${wgId.get(l.merged_into).label}" → dalej`);

console.log('\nPojęcia kanoniczne po normalizacji:');
for (const p of (await listConcepts(k.id)).concepts) console.log(`   ${String(p.mentionCount).padStart(3)}×  „${p.label}"`);
console.log('');
