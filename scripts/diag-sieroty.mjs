// Diagnostyka sierot między Storage a bazą (Sesja 10, punkt 2).
//
// Dwie klasy rozjazdu, każda z innym skutkiem:
//   A. OBIEKT BEZ WIERSZA — plik leży w buckecie, ale nie ma dokumentu, który by go
//      wskazywał. Zajmuje miejsce i nikt go nigdy nie usunie, bo nie ma z czego.
//      Powstaje, gdy kasujemy kolekcję (dziś deleteCollection nie rusza Storage)
//      albo gdy upload się powiódł, a zapis wiersza padł.
//   B. WIERSZ BEZ OBIEKTU — dokument ma file_path, ale pliku nie ma. Skutek jest
//      inny i gorszy: "Przetnij od nowa" i reindeks z rechunk pobierają oryginał
//      po file_path, więc taki dokument wygląda na sprawny, dopóki ktoś nie spróbuje.
//
// Skrypt NICZEGO NIE USUWA. Wypisuje, co znalazł, i tyle.
//
// Użycie:  node scripts/diag-sieroty.mjs


import { loadEnvLocal } from './_env.mjs';
loadEnvLocal(import.meta.url);

const { getSupabaseClient } = await import('../lib/rag/db.js');

const BUCKET = 'rag-files';
const STRONA = 100;
const client = getSupabaseClient();

// Storage.list() NIE jest rekurencyjne i zwraca jedną "warstwę" katalogu, więc
// strukturę {collectionId}/{documentId}/{nazwa} trzeba obejść samemu. Wpis bez
// pola `id` to katalog (prefiks), wpis z `id` to obiekt.
async function wypisz(prefiks) {
  const out = [];
  for (let offset = 0; ; offset += STRONA) {
    const { data, error } = await client.storage
      .from(BUCKET)
      .list(prefiks, { limit: STRONA, offset });
    if (error) throw new Error(`list("${prefiks}"): ${error.message}`);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < STRONA) break;
  }
  return out;
}

async function wszystkieObiekty() {
  const obiekty = [];
  const kolekcje = await wypisz('');
  for (const k of kolekcje) {
    if (k.id) { obiekty.push({ klucz: k.name, rozmiar: k.metadata?.size ?? null }); continue; }
    const dokumenty = await wypisz(k.name);
    for (const d of dokumenty) {
      if (d.id) { obiekty.push({ klucz: `${k.name}/${d.name}`, rozmiar: d.metadata?.size ?? null }); continue; }
      for (const p of await wypisz(`${k.name}/${d.name}`)) {
        if (!p.id) continue; // głębiej struktura nie schodzi
        obiekty.push({
          klucz: `${k.name}/${d.name}/${p.name}`,
          rozmiar: p.metadata?.size ?? null,
          collectionId: k.name,
          documentId: d.name,
        });
      }
    }
  }
  return obiekty;
}

const mb = (b) => (b === null || b === undefined ? '?' : (b / 1024 / 1024).toFixed(2) + ' MB');

let obiekty;
try {
  obiekty = await wszystkieObiekty();
} catch (e) {
  console.error('Nie udało się odczytać Storage:', e.message);
  console.error('Sprawdź, czy klucz w .env.local to secret/service_role, a nie publishable.');
  process.exit(1);
}

const { data: dokumenty, error: dErr } = await client
  .from('rag_documents')
  .select('id, collection_id, file_name, file_path, status, chunk_count');
if (dErr) {
  console.error('Błąd odczytu rag_documents:', dErr.message);
  process.exit(1);
}
const { data: kolekcje, error: kErr } = await client.from('rag_collections').select('id, name');
if (kErr) {
  console.error('Błąd odczytu rag_collections:', kErr.message);
  process.exit(1);
}
const nazwaKolekcji = new Map(kolekcje.map((k) => [k.id, k.name]));

const sciezkiWBazie = new Set(dokumenty.filter((d) => d.file_path).map((d) => d.file_path));
const kluczeWStorage = new Set(obiekty.map((o) => o.klucz));

console.log(`\nBUCKET "${BUCKET}": ${obiekty.length} obiektów`);
console.log(`rag_documents: ${dokumenty.length} wierszy (z file_path: ${sciezkiWBazie.size})`);
console.log(`rag_collections: ${kolekcje.length}`);

// --- A. obiekt bez wiersza ---------------------------------------------------
const bezWiersza = obiekty.filter((o) => !sciezkiWBazie.has(o.klucz));
let bajty = 0;
for (const o of bezWiersza) bajty += o.rozmiar || 0;
console.log(`\n${'='.repeat(74)}`);
console.log(`A. OBIEKTY BEZ WIERSZA W rag_documents: ${bezWiersza.length}  (${mb(bajty)})`);
console.log('   Nikt ich już nie usunie — nie ma dokumentu, który by je wskazywał.');
for (const o of bezWiersza) {
  const kol = o.collectionId ? nazwaKolekcji.get(o.collectionId) : undefined;
  const skad = o.collectionId
    ? kol
      ? `kolekcja „${kol}" nadal istnieje`
      : 'kolekcja NIE ISTNIEJE w bazie'
    : 'klucz spoza schematu {kolekcja}/{dokument}/{plik}';
  console.log(`   • ${o.klucz}`);
  console.log(`     ${mb(o.rozmiar)} · ${skad}`);
}
if (!bezWiersza.length) console.log('   (brak)');

// --- B. wiersz bez obiektu ---------------------------------------------------
const bezObiektu = dokumenty.filter((d) => d.file_path && !kluczeWStorage.has(d.file_path));
console.log(`\n${'='.repeat(74)}`);
console.log(`B. DOKUMENTY Z file_path WSKAZUJĄCYM NA NIEISTNIEJĄCY OBIEKT: ${bezObiektu.length}`);
console.log('   Wyglądają na sprawne, dopóki ktoś nie kliknie „Przetnij od nowa".');
for (const d of bezObiektu) {
  console.log(`   • ${d.file_name}  [${d.status}, ${d.chunk_count} fragm.]`);
  console.log(`     file_path: ${d.file_path}`);
  console.log(`     kolekcja: ${nazwaKolekcji.get(d.collection_id) || '(nie istnieje)'}`);
}
if (!bezObiektu.length) console.log('   (brak)');

// --- C. wiersz bez file_path -------------------------------------------------
// Nie jest sierotą w Storage, ale to ta sama rodzina rozjazdu: dokument, którego
// oryginału nie ma jak odzyskać. Wypisujemy, żeby nie zniknął z pola widzenia.
const bezSciezki = dokumenty.filter((d) => !d.file_path);
console.log(`\n${'='.repeat(74)}`);
console.log(`C. DOKUMENTY BEZ file_path (upload padł przed zapisem ścieżki): ${bezSciezki.length}`);
for (const d of bezSciezki) {
  console.log(`   • ${d.file_name}  [${d.status}, ${d.chunk_count} fragm.] — kolekcja: ${nazwaKolekcji.get(d.collection_id) || '(nie istnieje)'}`);
}
if (!bezSciezki.length) console.log('   (brak)');

// --- D. prefiksy po nieistniejących kolekcjach --------------------------------
const prefiksy = new Map();
for (const o of obiekty) {
  if (!o.collectionId) continue;
  const e = prefiksy.get(o.collectionId) || { n: 0, bajty: 0 };
  e.n++;
  e.bajty += o.rozmiar || 0;
  prefiksy.set(o.collectionId, e);
}
const osierocone = [...prefiksy.entries()].filter(([id]) => !nazwaKolekcji.has(id));
console.log(`\n${'='.repeat(74)}`);
console.log(`D. PREFIKSY STORAGE PO NIEISTNIEJĄCYCH JUŻ KOLEKCJACH: ${osierocone.length}`);
console.log('   Od Sesji 10 deleteCollection sprząta prefiks, więc tu powinno być pusto.');
console.log('   Niepusto = sprzątanie zawiodło (patrz plikowNieusunietych) albo prefiks');
console.log('   pochodzi sprzed tamtej zmiany.');
for (const [id, e] of osierocone) console.log(`   • ${id}/  — ${e.n} obiektów, ${mb(e.bajty)}`);
if (!osierocone.length) console.log('   (brak)');

console.log('');
