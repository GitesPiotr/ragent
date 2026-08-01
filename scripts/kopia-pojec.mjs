// KOPIA ZAPASOWA STANU POJĘĆ przed normalizacją — zrzut i przywracanie.
//
// PO CO: `normalizeConcepts` jest NIEODWRACALNE. Kolejność operacji (normalize-concepts.js
// 209–228) to: przepnij powiązania na ziarno → SKASUJ stare powiązania → ustaw merged_into.
// Wiersz pojęcia przeżywa, ale informacja „które fragmenty należały do którego pojęcia"
// przestaje istnieć. Samo wyzerowanie `merged_into` oddaje pustą skorupę: pojęcie bez
// powiązań, mention_count 0, niewidoczne w grafie. Odtworzenie wymaga ponownego
// wyciągania pojęć (~1,5 h).
//
// Nietknięte przez normalizację są jednak tylko DWIE tabele i TRZY kolumny, a wierszy
// jest ~1100. Zrzut tego zamienia operację nieodwracalną w eksperyment.
//
// CO OBEJMUJE KOPIA:
//   rag_chunk_concepts  — wszystkie wiersze pojęć tej kolekcji (chunk_id, concept_id, weight)
//   rag_concepts        — id, merged_into, mention_count
// CZEGO NIE OBEJMUJE (i nie musi — normalizacja tego nie dotyka):
//   embedding, label, label_normalized, coord_*, oraz cokolwiek w rag_chunks.
//
// TRYBY:
//   node scripts/kopia-pojec.mjs zrzut     [--kolekcja N] [--plik P]
//   node scripts/kopia-pojec.mjs przywroc  --plik P  --tak-przywroc
//   node scripts/kopia-pojec.mjs weryfikuj [--kolekcja N]
//
// `zrzut` i `weryfikuj` można puszczać kiedykolwiek. `przywroc` ZAPISUJE i wymaga
// jawnego `--tak-przywroc` — bez tej flagi pokazuje tylko, co by zrobił.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadEnvLocal } from './_env.mjs';
loadEnvLocal(import.meta.url);

const { getSupabaseClient, czytajStronami } = await import('../lib/rag/db.js');

function args(argv) {
  const out = { tryb: argv[0] || '', kolekcja: 'Regulaminy', plik: null, potwierdzone: false };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--kolekcja') out.kolekcja = argv[++i];
    else if (argv[i] === '--plik') out.plik = argv[++i];
    else if (argv[i] === '--tak-przywroc') out.potwierdzone = true;
  }
  return out;
}
const A = args(process.argv.slice(2));
const client = getSupabaseClient();

async function kolekcjaPoNazwie(nazwa) {
  const { data } = await client.from('rag_collections').select('id,name');
  const k = (data || []).find((x) => x.name === nazwa);
  if (!k) {
    console.error(`Brak kolekcji "${nazwa}". Dostępne: ${(data || []).map((x) => x.name).join(', ')}`);
    process.exit(1);
  }
  return k;
}

// --- odczyt stanu -------------------------------------------------------------
// rag_chunk_concepts NIE MA collection_id (schemat 7: klucz to (chunk_id, concept_id)),
// więc filtrujemy po stronie klienta zbiorem pojęć kolekcji. Przy ~1100 wierszach to
// tańsze i bezpieczniejsze niż `.in()` z tysiącem UUID-ów w adresie URL.
async function odczytajStan(collectionId) {
  const pojecia = await czytajStronami((od, do_) =>
    client
      .from('rag_concepts')
      .select('id, merged_into, mention_count')
      .eq('collection_id', collectionId)
      .order('id', { ascending: true })
      .range(od, do_)
  );
  const idPojec = new Set(pojecia.map((p) => p.id));

  const wszystkiePowiazania = await czytajStronami((od, do_) =>
    client
      .from('rag_chunk_concepts')
      .select('chunk_id, concept_id, weight')
      .order('chunk_id', { ascending: true })
      .order('concept_id', { ascending: true })
      .range(od, do_)
  );
  const powiazania = wszystkiePowiazania.filter((r) => idPojec.has(r.concept_id));

  // Porządek kanoniczny — bez niego porównanie dwóch zrzutów zależałoby od kolejności
  // z bazy, a ta nie jest gwarantowana. Weryfikacja porównuje TEKST, więc porządek
  // musi być własnością zrzutu, nie przypadkiem.
  pojecia.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  powiazania.sort(
    (a, b) => String(a.chunk_id).localeCompare(String(b.chunk_id)) || String(a.concept_id).localeCompare(String(b.concept_id))
  );
  return { pojecia, powiazania };
}

const odcisk = (stan) => JSON.stringify(stan);
const klucz = (r) => r.chunk_id + '|' + r.concept_id;

// --- ZRZUT --------------------------------------------------------------------
async function zrzut(kolekcja, sciezka) {
  const stan = await odczytajStan(kolekcja.id);
  const plik = {
    wersja: 1,
    kolekcjaId: kolekcja.id,
    kolekcjaNazwa: kolekcja.name,
    kiedy: new Date().toISOString(),
    liczby: {
      pojec: stan.pojecia.length,
      kanonicznych: stan.pojecia.filter((p) => !p.merged_into).length,
      scalonych: stan.pojecia.filter((p) => p.merged_into).length,
      powiazan: stan.powiazania.length,
    },
    ...stan,
  };
  const dir = dirname(sciezka);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(sciezka, JSON.stringify(plik, null, 1), 'utf8');
  return plik;
}

// --- PRZYWRACANIE --------------------------------------------------------------
// Zapisuje TYLKO różnice. Nie dlatego, że szybciej — dlatego, że raport z liczbą
// zmienionych wierszy jest wtedy dowodem, a nie deklaracją: przywrócenie na nietkniętej
// bazie MUSI pokazać same zera.
async function przywroc(plik, naSucho) {
  const stanTeraz = await odczytajStan(plik.kolekcjaId);

  const docelowePoj = new Map(plik.pojecia.map((p) => [p.id, p]));
  const zmianyPojec = [];
  for (const teraz of stanTeraz.pojecia) {
    const cel = docelowePoj.get(teraz.id);
    if (!cel) continue; // pojęcie powstałe PO zrzucie — nie ruszamy
    const rozne =
      (cel.merged_into || null) !== (teraz.merged_into || null) ||
      (cel.mention_count || 0) !== (teraz.mention_count || 0);
    if (rozne) zmianyPojec.push(cel);
  }

  const terazPow = new Map(stanTeraz.powiazania.map((r) => [klucz(r), r]));
  const celPow = new Map(plik.powiazania.map((r) => [klucz(r), r]));
  const doWstawienia = plik.powiazania.filter((r) => !terazPow.has(klucz(r)));
  const doUsuniecia = stanTeraz.powiazania.filter((r) => !celPow.has(klucz(r)));

  const raport = {
    pojecDoPoprawy: zmianyPojec.length,
    powiazanDoWstawienia: doWstawienia.length,
    powiazanDoUsuniecia: doUsuniecia.length,
    pojecSpozaZrzutu: stanTeraz.pojecia.filter((p) => !docelowePoj.has(p.id)).length,
  };
  if (naSucho) return raport;

  // Kolejność: najpierw DODAJ powiązania, potem usuń nadmiarowe, na końcu pojęcia.
  // Odwrotna zostawiłaby w środku moment, w którym fragment nie ma żadnego pojęcia.
  for (let i = 0; i < doWstawienia.length; i += 200) {
    const paczka = doWstawienia.slice(i, i + 200).map((r) => ({
      chunk_id: r.chunk_id,
      concept_id: r.concept_id,
      weight: r.weight,
    }));
    const { error } = await client
      .from('rag_chunk_concepts')
      .upsert(paczka, { onConflict: 'chunk_id,concept_id', ignoreDuplicates: true });
    if (error) throw new Error('Błąd wstawiania powiązań: ' + error.message);
  }
  for (const r of doUsuniecia) {
    const { error } = await client
      .from('rag_chunk_concepts')
      .delete()
      .eq('chunk_id', r.chunk_id)
      .eq('concept_id', r.concept_id);
    if (error) throw new Error('Błąd usuwania powiązania: ' + error.message);
  }
  for (const p of zmianyPojec) {
    const { error } = await client
      .from('rag_concepts')
      .update({ merged_into: p.merged_into, mention_count: p.mention_count })
      .eq('id', p.id);
    if (error) throw new Error('Błąd zapisu pojęcia: ' + error.message);
  }
  return raport;
}

// =============================================================================
const domyslnyPlik = (k) => `kopie/pojecia-${k.name.replace(/\W+/g, '-')}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

if (A.tryb === 'zrzut') {
  const k = await kolekcjaPoNazwie(A.kolekcja);
  const sciezka = A.plik || domyslnyPlik(k);
  const p = await zrzut(k, sciezka);
  console.log(`ZRZUT · "${p.kolekcjaNazwa}"`);
  console.log(`  pojęć ${p.liczby.pojec} (kanonicznych ${p.liczby.kanonicznych}, scalonych ${p.liczby.scalonych})`);
  console.log(`  powiązań ${p.liczby.powiazan}`);
  console.log(`  → ${sciezka}`);
} else if (A.tryb === 'przywroc') {
  if (!A.plik) {
    console.error('Podaj --plik <ścieżka do zrzutu>.');
    process.exit(1);
  }
  const plik = JSON.parse(readFileSync(A.plik, 'utf8'));
  console.log(`PRZYWRACANIE ze zrzutu z ${plik.kiedy} · "${plik.kolekcjaNazwa}"`);
  const naSucho = await przywroc(plik, true);
  console.log(`  pojęć do poprawy       : ${naSucho.pojecDoPoprawy}`);
  console.log(`  powiązań do wstawienia : ${naSucho.powiazanDoWstawienia}`);
  console.log(`  powiązań do usunięcia  : ${naSucho.powiazanDoUsuniecia}`);
  console.log(`  pojęć powstałych po zrzucie (nietykane) : ${naSucho.pojecSpozaZrzutu}`);
  if (!A.potwierdzone) {
    console.log('\n  NIC NIE ZAPISANO. Dodaj --tak-przywroc, żeby wykonać.');
  } else {
    const r = await przywroc(plik, false);
    console.log(`\n  ZAPISANO: pojęć ${r.pojecDoPoprawy}, powiązań +${r.powiazanDoWstawienia} / −${r.powiazanDoUsuniecia}`);
    const po = await odczytajStan(plik.kolekcjaId);
    const zgodne = odcisk(po) === odcisk({ pojecia: plik.pojecia, powiazania: plik.powiazania });
    console.log(`  stan po przywróceniu zgodny ze zrzutem: ${zgodne ? 'TAK ✓' : 'NIE ✗'}`);
    if (!zgodne) process.exit(1);
  }
} else if (A.tryb === 'weryfikuj') {
  // DOWÓD, ŻE KOPIA DZIAŁA, zrobiony na nietkniętej bazie: zrzut → przywrócenie
  // → ponowny zrzut → porównanie tekstu. Na nietkniętej bazie przywrócenie musi
  // być pustą operacją; gdyby cokolwiek zmieniło, kopia nie opisuje stanu wiernie.
  const k = await kolekcjaPoNazwie(A.kolekcja);
  const sciezka = A.plik || 'kopie/weryfikacja.json';
  console.log(`WERYFIKACJA KOPII · "${k.name}"`);
  const a = await zrzut(k, sciezka);
  console.log(`  1. zrzut A: pojęć ${a.liczby.pojec}, powiązań ${a.liczby.powiazan}`);

  const naSucho = await przywroc(a, true);
  const pustaOperacja =
    naSucho.pojecDoPoprawy === 0 && naSucho.powiazanDoWstawienia === 0 && naSucho.powiazanDoUsuniecia === 0;
  console.log(
    `  2. przywrócenie A na nietkniętej bazie: pojęć ${naSucho.pojecDoPoprawy}, +${naSucho.powiazanDoWstawienia} / −${naSucho.powiazanDoUsuniecia}  ${pustaOperacja ? '(pusta operacja — tak ma być)' : '⚠ NIEPUSTA'}`
  );
  const r = await przywroc(a, false);
  console.log(`     wykonane: pojęć ${r.pojecDoPoprawy}, +${r.powiazanDoWstawienia} / −${r.powiazanDoUsuniecia}`);

  const b = await zrzut(k, sciezka + '.b');
  const zgodne = odcisk({ pojecia: a.pojecia, powiazania: a.powiazania }) === odcisk({ pojecia: b.pojecia, powiazania: b.powiazania });
  console.log(`  3. zrzut B: pojęć ${b.liczby.pojec}, powiązań ${b.liczby.powiazan}`);
  console.log(`  4. A == B (co do znaku): ${zgodne ? 'TAK ✓' : 'NIE ✗'}`);

  // Test negatywny. Bez niego „A == B" dowodzi tylko tego, że nic nie robiliśmy —
  // a to samo pokazałby skrypt, który w ogóle nie czyta bazy. Psujemy JEDEN wiersz
  // w pamięci, przywracamy ze zrzutu i sprawdzamy, czy przywracanie to WIDZI.
  const ofiara = a.pojecia.find((p) => !p.merged_into);
  if (ofiara) {
    const przed = ofiara.mention_count;
    await client.from('rag_concepts').update({ mention_count: (przed || 0) + 777 }).eq('id', ofiara.id);
    const wykryte = await przywroc(a, true);
    console.log(`  5. test negatywny — zepsuto mention_count jednego pojęcia:`);
    console.log(`     przywracanie widzi różnicę w ${wykryte.pojecDoPoprawy} pojęciu  ${wykryte.pojecDoPoprawy === 1 ? '✓' : '✗ POWINNO BYĆ 1'}`);
    await przywroc(a, false);
    const c = await odczytajStan(k.id);
    const naprawione = c.pojecia.find((p) => p.id === ofiara.id).mention_count === przed;
    console.log(`     po przywróceniu wartość wróciła do ${przed}: ${naprawione ? 'TAK ✓' : 'NIE ✗'}`);
    if (!(wykryte.pojecDoPoprawy === 1 && naprawione)) process.exit(1);
  }
  console.log(`\n  KOPIA ${zgodne && pustaOperacja ? 'DZIAŁA' : 'NIE PRZESZŁA WERYFIKACJI'} · zrzut: ${sciezka}`);
  if (!(zgodne && pustaOperacja)) process.exit(1);
} else {
  console.log('Tryby:');
  console.log('  node scripts/kopia-pojec.mjs zrzut     [--kolekcja N] [--plik P]');
  console.log('  node scripts/kopia-pojec.mjs przywroc  --plik P --tak-przywroc');
  console.log('  node scripts/kopia-pojec.mjs weryfikuj [--kolekcja N]');
  process.exit(1);
}
