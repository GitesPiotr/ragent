// Diagnostyka PROGU wyszukiwania (Sesja 5). Pokazuje WSZYSTKIE trafienia z ich score
// PRZED odcięciem progiem, żeby dało się zobaczyć, gdzie na TWOICH dokumentach przebiega
// granica między trafnym a przypadkowym. RAG_MIN_SCORE=0.35 to wartość startowa —
// spec każe ją dostroić właśnie po tej sesji (redline 8), a nie zgadywać.
//
// Uruchom:
//   node scripts/diag-prog.mjs "ile dni urlopu"
//   node scripts/diag-prog.mjs "ile dni urlopu" --kolekcja Regulaminy --topk 30
//   node scripts/diag-prog.mjs "jak upiec sernik"     ← pytanie spoza bazy, do porównania
//
// Niczego nie zapisuje. Wymaga działającej Ollamy (zapytanie musi zostać zembedowane).



import { loadEnvLocal } from './_env.mjs';
function parseArgs(argv) {
  const out = { query: '', kolekcja: null, topk: 20 };
  const reszta = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--kolekcja' || argv[i] === '-k') out.kolekcja = argv[++i];
    else if (argv[i] === '--topk' || argv[i] === '-n') out.topk = Number.parseInt(argv[++i], 10) || 20;
    else reszta.push(argv[i]);
  }
  out.query = reszta.join(' ').trim();
  return out;
}

function skroc(text, n) {
  const jedna = String(text || '').replace(/\s+/g, ' ').trim();
  return jedna.length > n ? jedna.slice(0, n - 1) + '…' : jedna;
}

function pasek(score, szerokosc = 20) {
  const pelne = Math.round(Math.max(0, Math.min(1, score)) * szerokosc);
  return '█'.repeat(pelne) + '·'.repeat(szerokosc - pelne);
}

async function main() {
  loadEnvLocal(import.meta.url);

  const args = parseArgs(process.argv.slice(2));
  if (!args.query) {
    console.log('Użycie: node scripts/diag-prog.mjs "twoje pytanie" [--kolekcja nazwa|id] [--topk 20]');
    process.exit(1);
  }

  // Import PO wczytaniu .env.local — config.js czyta process.env przy wywołaniu.
  const { searchCollection } = await import('../lib/rag/search.js');
  const { listCollections } = await import('../lib/rag/collections.js');
  const { getConfig } = await import('../lib/rag/config.js');

  const config = getConfig();
  const prog = config.search.minScore;

  // --- wybór kolekcji ---
  const kolekcje = await listCollections({ includeArchived: false });
  if (!kolekcje.length) {
    console.log('Brak kolekcji w bazie.');
    process.exit(1);
  }
  let kolekcja;
  if (args.kolekcja) {
    kolekcja = kolekcje.find((k) => k.id === args.kolekcja || k.name.toLowerCase() === args.kolekcja.toLowerCase());
    if (!kolekcja) {
      console.log(`Nie znaleziono kolekcji "${args.kolekcja}". Dostępne: ${kolekcje.map((k) => k.name).join(', ')}`);
      process.exit(1);
    }
  } else if (kolekcje.length === 1) {
    kolekcja = kolekcje[0];
  } else {
    console.log('Podaj kolekcję przez --kolekcja. Dostępne:');
    for (const k of kolekcje) console.log(`  ${k.name}  (${k.id})`);
    process.exit(1);
  }

  console.log('');
  console.log(`Pytanie:  "${args.query}"`);
  console.log(`Kolekcja: ${kolekcja.name}  ·  model: ${kolekcja.embedModel}  ·  próg RAG_MIN_SCORE: ${prog}`);
  console.log('');

  // minScore: 0 → rdzeń NIE odcina niczego. Na tym polega cała diagnostyka.
  const { hits } = await searchCollection({
    collectionId: kolekcja.id,
    query: args.query,
    topK: args.topk,
    minScore: 0,
  });

  if (!hits.length) {
    console.log('Zero fragmentów w kolekcji ma wektory — czy dokumenty są zindeksowane?');
    return;
  }

  console.log('  #   score   ' + ' '.repeat(14) + '  plik / nagłówek / fragment');
  console.log('  ' + '─'.repeat(96));

  let kreskaPostawiona = false;
  hits.forEach((h, i) => {
    if (!kreskaPostawiona && h.score < prog) {
      console.log('  ' + '─'.repeat(30) + `  PRÓG ${prog}  ` + '─'.repeat(50));
      console.log('  (poniżej tej linii wyszukiwanie NIE zwraca nic)');
      kreskaPostawiona = true;
    }
    const strona = h.pageFrom != null ? ` str.${h.pageFrom}` : '';
    console.log(`  ${String(i + 1).padStart(2)}  ${h.score.toFixed(4)}  ${pasek(h.score)}  ${h.fileName}${strona}`);
    if (h.headingPath) console.log(`      ${' '.repeat(28)}${skroc(h.headingPath, 60)}`);
    console.log(`      ${' '.repeat(28)}${skroc(h.content, 60)}`);
  });

  if (!kreskaPostawiona) {
    console.log('  ' + '─'.repeat(30) + `  PRÓG ${prog}  ` + '─'.repeat(50));
    console.log('  (wszystkie pokazane trafienia są POWYŻEJ progu — zwiększ --topk, żeby zobaczyć ogon)');
  }

  // --- podsumowanie do decyzji o progu ---
  const powyzej = hits.filter((h) => h.score >= prog).length;
  console.log('');
  console.log(`Przechodzi próg: ${powyzej} z ${hits.length}.  Najlepszy: ${hits[0].score.toFixed(4)}, najgorszy: ${hits[hits.length - 1].score.toFixed(4)}.`);

  // Największa przerwa między kolejnymi score to naturalna granica zbioru: zwykle
  // dokładnie tam kończą się trafienia "o tym samym", a zaczyna szum.
  let najwiekszaPrzerwa = 0;
  let gdzie = -1;
  for (let i = 1; i < hits.length; i++) {
    const d = hits[i - 1].score - hits[i].score;
    if (d > najwiekszaPrzerwa) {
      najwiekszaPrzerwa = d;
      gdzie = i;
    }
  }
  if (gdzie > 0) {
    const granica = (hits[gdzie - 1].score + hits[gdzie].score) / 2;
    console.log(
      `Największy skok score: ${najwiekszaPrzerwa.toFixed(4)} między #${gdzie} (${hits[gdzie - 1].score.toFixed(4)}) a #${gdzie + 1} (${hits[gdzie].score.toFixed(4)}).`
    );
    console.log(`Naturalna granica dla TEGO pytania wypada koło ${granica.toFixed(2)}.`);
  }
  console.log('');
  console.log('Sprawdź to na kilku pytaniach (trafnych i spoza bazy), zanim ruszysz RAG_MIN_SCORE.');
  console.log('');
}

main().catch((e) => {
  console.log('');
  console.log('BŁĄD: ' + (e && e.message ? e.message : String(e)));
  if (e && e.code) console.log('kod: ' + e.code);
  process.exit(1);
});
