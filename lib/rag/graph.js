// Graf wiedzy (Sesja 9): dokumenty, pojęcia i krawędzie dokument↔pojęcie.
// Czysty JS, do bazy wyłącznie przez db.js. Zero React/Next/window.
//
// ROZSTRZYGNIĘCIE SKALI (SPEC, Sesja 9) — powód, dla którego ta funkcja NIE zwraca
// fragmentów: fizyka force-directed liczy odpychanie każdy-z-każdym, więc koszt
// rośnie z KWADRATEM liczby węzłów. Przy 2000 fragmentów to nie 20× więcej pracy
// niż przy 100 węzłach, tylko 400× — przeglądarka staje. Graf pokazuje dziesiątki
// węzłów (dokumenty + pojęcia), a fragmenty dorysowuje dopiero searchByConcept
// po kliknięciu JEDNEGO pojęcia, z limitem 30.
//
// ŻADNEGO NOWEGO SQL. `rag_chunks` ma `collection_id` (Sesja 2), więc wszystko
// składa się z trzech odczytów PostgREST — w produkcyjnej bazie dzielonej z AIDEAS
// nie trzeba niczego instalować.

import { getSupabaseClient, czytajStronami } from './db.js';
import { kolorDokumentu } from './map.js';
import { czyNormalizacjaOczekuje } from './normalize-concepts.js';

// Stronicowanie mieszka w db.js (`czytajStronami`) — TU BYŁA WŁASNA PĘTLA i właśnie
// dlatego pułapka wróciła po raz trzeci: pętla pilnowała `rag_chunk_concepts`,
// a odczyt `rag_concepts` obok niej stronicowania nie miał. Reguła w komentarzu nie
// jest wykonywalna, helper z testem jest.

// `.in()` ląduje w URL-u zapytania, więc lista identyfikatorów nie może rosnąć
// bez ograniczeń — po Kodeksie pojęć kanonicznych będą setki. Dzielimy na grupy.
const GRUPA_ID = 100;

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function throwDb(error) {
  if (error && error.code === '22P02') {
    throw err('invalid_input', 'Nieprawidłowy identyfikator (oczekiwano UUID).');
  }
  throw err('internal', 'Błąd bazy danych: ' + ((error && error.message) || 'nieznany'));
}

// Cienka nakładka: dokłada tłumaczenie błędów tego modułu (22P02 → invalid_input),
// żeby wywołania niżej czytały się tak samo jak wcześniej.
const stronicuj = (zbudujZapytanie) =>
  czytajStronami(zbudujZapytanie, {
    naBlad: (error) => {
      try {
        throwDb(error);
      } catch (e) {
        return e;
      }
    },
  });

// =============================================================================
//  getGraphData — kształt dokładnie ze SPEC (sekcja 9)
//
//    { documents: [{ id, name, color, chunkCount }],
//      concepts:  [{ id, label, mentionCount }],
//      edges:     [{ documentId, conceptId, weight }] }
//
//  WYŁĄCZNIE POJĘCIA KANONICZNE (`merged_into is null`) — to jest w DoD. Bez tego
//  filtru graf pokazałby „urlop", „urlop wypoczynkowy" i „godzina pracy" jako
//  osobne węzły, czyli dokładnie te duplikaty, których usunięcie było celem Sesji 8.
//
//  CZEGO TU NIE MA: pola „ile dokumentów dotyka tego pojęcia". Da się je wyliczyć
//  z `edges` po stronie widoku i tak robi GrafWiedzy — kontrakt zostaje taki,
//  jak go opisuje sekcja 9, bez pól dokładanych pod jeden konkretny rysunek.
//
// =============================================================================
//  PRÓG WYSTĄPIEŃ — FILTR JEST TUTAJ, NIE W RYSOWANIU (Sesja 10)
//
//  `deps.minMentions` odsiewa pojęcia PO STRONIE RDZENIA. Gdyby filtr siedział
//  w widoku, przeglądarka i tak ściągałaby 565 pojęć i liczyła dla nich fizykę,
//  tylko część by ukrywała — a to jest właśnie ten koszt, którego mamy uniknąć.
//
//  MOSTY OMIJAJĄ PRÓG. Pojęcie sięgające ≥2 dokumentów zostaje niezależnie od
//  `mention_count`, bo most jest tym, po co ten widok istnieje. Pomiar
//  (scripts/sym-skala-grafu.mjs) pokazuje, dlaczego to nie jest ozdobnik: przy
//  progu 3 wypadłyby „działalność gospodarcza", „praca nadliczbowa" i „akcja
//  ratownicza", każde z dwoma wystąpieniami w dwóch różnych plikach. Filtr, który
//  ucina dokładnie to, co widok ma pokazywać, byłby filtrem wywróconym.
//
//  Stopień liczymy Z PEŁNEGO zbioru krawędzi, PRZED odsianiem — inaczej nie da się
//  wiedzieć, które pojęcie jest mostem. To znaczy, że rdzeń nadal czyta wszystkie
//  powiązania; oszczędność jest w tym, co jedzie do przeglądarki i wchodzi do O(n²).
//
//  `deps.tylkoMosty` to skrót do 15 węzłów zamiast progu — osobny przełącznik,
//  bo „pokaż wyłącznie wspólne" nie jest tym samym co „pokaż częste".
//
//  `totals` ISTNIEJE DLA 12.9, NIE DLA RYSUNKU. Bez liczby przed filtrem widok nie
//  ma z czego napisać „pokazano 157 z 565" i po cichu udawałby, że 157 to wszystko —
//  ta sama zasada co przy limicie 30 w searchByConcept.
// =============================================================================
export async function getGraphData(collectionId, deps = {}) {
  if (!collectionId) throw err('invalid_input', 'Brak identyfikatora kolekcji.');
  const client = deps.client || getSupabaseClient();

  const minMentions = deps.minMentions === undefined ? 1 : Math.trunc(Number(deps.minMentions));
  if (!Number.isFinite(minMentions) || minMentions < 1) {
    throw err('invalid_input', 'Próg wystąpień musi być liczbą całkowitą ≥ 1.');
  }
  const tylkoMosty = deps.tylkoMosty === true;

  const { data: coll, error: cErr } = await client
    .from('rag_collections')
    .select('id, name, concepts_normalized_at')
    .eq('id', collectionId)
    .single();
  // Brak kolumny to nie „kolekcja nie istnieje" — to nieuruchomiona migracja, i komunikat
  // ma o tym mówić wprost, tak samo jak throwRpc w search.js odsyła do skryptu SQL.
  // Bez tego rozgałęzienia widok grafu padałby z „Kolekcja nie istnieje" i szukano by
  // usterki w danych zamiast w konfiguracji bazy.
  if (cErr && /concepts_normalized_at/.test(cErr.message || '')) {
    throw err(
      'invalid_input',
      'Brak kolumny rag_collections.concepts_normalized_at. Uruchom ręcznie skrypt sql/session-normalizacja-znacznik.sql w Supabase → SQL Editor.'
    );
  }
  if (cErr || !coll) throw err('not_found', 'Kolekcja nie istnieje.');

  // Kolejność po created_at — TA SAMA co w getMapData, bo kolor wynika z pozycji.
  // Rozjazd sortowania przemalowałby dokumenty między mapą a grafem.
  //
  // `id` JAKO DRUGI KLUCZ — nie ozdobnik. Bez niego dwa dokumenty wgrane w tej samej
  // sekundzie mają nierozstrzygniętą kolejność, a PostgREST nie obiecuje stabilności
  // przy remisie. Kolejność wierszy decyduje o KOLORZE dokumentu i o pozycji startowej
  // w spirali, więc rozjazd znaczyłby inny układ grafu przy tych samych danych —
  // dokładnie ta nieuczciwość, którą 12.9 wytyka Math.random() w prototypie mapy.
  const { data: docRows, error: dErr } = await client
    .from('rag_documents')
    .select('id, file_name, chunk_count, created_at')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (dErr) throwDb(dErr);

  const documents = (docRows || []).map((d, i) => ({
    id: d.id,
    name: d.file_name,
    color: kolorDokumentu(i),
    chunkCount: d.chunk_count || 0,
  }));

  // `id` jako drugi klucz sortowania — tu waży najwięcej: po Kodeksie setki pojęć
  // mają mention_count = 1, czyli remis jest regułą, nie wyjątkiem. Bez rozstrzygnięcia
  // ta sama kolekcja ustawiałaby węzły inaczej przy każdym wejściu na stronę.
  const wszystkiePojecia = await stronicuj((od, do_) =>
    client
      .from('rag_concepts')
      .select('id, label, mention_count')
      .eq('collection_id', collectionId)
      .is('merged_into', null)
      .order('mention_count', { ascending: false })
      .order('id', { ascending: true })
      .range(od, do_)
  );

  const wszystkie = wszystkiePojecia.map((p) => ({
    id: p.id,
    label: p.label,
    mentionCount: p.mention_count || 0,
  }));

  if (!wszystkie.length) {
    // `normalizacjaOczekuje: false` JAWNIE, nie przez pominięcie pola. Kolekcja bez
    // pojęć nie ma czego scalać, a kształt odpowiedzi ma być jeden — widok nie może
    // dostawać `undefined` w jednej ścieżce i wartości w drugiej.
    return {
      documents,
      concepts: [],
      edges: [],
      normalizacjaOczekuje: false,
      totals: { concepts: 0, shown: 0, bridges: 0 },
    };
  }

  // Fragment → dokument. Czytamy PO KOLEKCJI, nie po liście identyfikatorów
  // fragmentów: lista miałaby tysiące pozycji i nie zmieściłaby się w URL-u.
  const chunkRows = await stronicuj((od, do_) =>
    client
      .from('rag_chunks')
      .select('id, document_id')
      .eq('collection_id', collectionId)
      .order('id', { ascending: true })
      .range(od, do_)
  );
  const doDokumentu = new Map(chunkRows.map((c) => [c.id, c.document_id]));

  // Powiązania — tylko dla pojęć kanonicznych TEJ kolekcji, grupami po GRUPA_ID.
  // Czytamy je dla WSZYSTKICH pojęć, także tych, które próg zaraz odsieje: bez pełnego
  // zbioru krawędzi nie da się policzyć, które pojęcie jest mostem, a mosty mają próg
  // omijać. Oszczędność filtra jest w tym, co jedzie do przeglądarki.
  //
  // `concept_id` jako drugi klucz sortowania: przy stronicowaniu po `chunk_id` remis
  // jest pewny (jeden fragment ma po kilka pojęć), a wtedy niestabilna kolejność mogłaby
  // zgubić albo zdublować wiersz na granicy stron.
  const conceptIds = wszystkie.map((c) => c.id);
  const powiazania = [];
  for (let i = 0; i < conceptIds.length; i += GRUPA_ID) {
    const grupa = conceptIds.slice(i, i + GRUPA_ID);
    powiazania.push(
      ...(await stronicuj((od, do_) =>
        client
          .from('rag_chunk_concepts')
          .select('chunk_id, concept_id')
          .in('concept_id', grupa)
          .order('chunk_id', { ascending: true })
          .order('concept_id', { ascending: true })
          .range(od, do_)
      ))
    );
  }

  // waga = liczba fragmentów TEGO dokumentu przypisanych do TEGO pojęcia.
  const wagi = new Map();
  for (const p of powiazania) {
    const documentId = doDokumentu.get(p.chunk_id);
    // Fragment spoza kolekcji nie ma prawa tu trafić (filtrujemy po pojęciach
    // kolekcji), ale gdyby powiązanie osierociało, cicho je pomijamy zamiast
    // rysować krawędź do dokumentu, którego w tym grafie nie ma.
    if (!documentId) continue;
    const klucz = documentId + '|' + p.concept_id;
    wagi.set(klucz, (wagi.get(klucz) || 0) + 1);
  }

  const wszystkieKrawedzie = [...wagi.entries()].map(([klucz, weight]) => {
    const i = klucz.indexOf('|');
    return { documentId: klucz.slice(0, i), conceptId: klucz.slice(i + 1), weight };
  });

  // Stopień = do ilu RÓŻNYCH dokumentów sięga pojęcie. Ta sama reguła co
  // stopienPojec w lib/mapview/graf.js i z tego samego powodu: liczymy dokumenty,
  // nie krawędzie. Tu jest liczona po raz drugi, bo filtr musi znać most PRZED
  // odesłaniem danych, a widok liczy ją do kolorowania — jedna nie zastąpi drugiej
  // bez przeniesienia filtra do przeglądarki, czyli bez zniweczenia całego zysku.
  const dokumentyPojecia = new Map();
  for (const e of wszystkieKrawedzie) {
    if (!dokumentyPojecia.has(e.conceptId)) dokumentyPojecia.set(e.conceptId, new Set());
    dokumentyPojecia.get(e.conceptId).add(e.documentId);
  }
  const jestMostem = (id) => (dokumentyPojecia.get(id) || new Set()).size > 1;
  const mostow = wszystkie.filter((c) => jestMostem(c.id)).length;

  // `conceptCount` = ile pojęć kanonicznych dotyka dokumentu PRZED progiem.
  //
  // Istnieje dla legendy i jest wymogiem 12.9, nie wygodą: bez tej liczby widok nie
  // umie odróżnić trzech różnych powodów, dla których dokument wisi bez krawędzi,
  // i musiałby zbić je w jeden napis. Zmierzone na Regulaminach — wszystkie trzy
  // przypadki są tam naraz:
  //   • 02-polityka (6 pojęć) i 03-pracownicy.csv (2) MAJĄ pojęcia, tylko żadne nie
  //     przeszło progu → obniżenie progu je przywróci,
  //   • CELEX (RODO): 504 fragmenty, ZERO policzonych pojęć → żaden próg nie pomoże,
  //     robota po prostu nie jest zrobiona,
  //   • 06-skan-zaswiadczenie.pdf: zero fragmentów (no_text) → tym bardziej.
  // Napis „brak pojęć przy tym progu" jest prawdziwy tylko dla pierwszego przypadku.
  const pojecNaDokument = new Map();
  for (const [conceptId, dokumenty] of dokumentyPojecia) {
    void conceptId;
    for (const documentId of dokumenty) {
      pojecNaDokument.set(documentId, (pojecNaDokument.get(documentId) || 0) + 1);
    }
  }
  for (const d of documents) d.conceptCount = pojecNaDokument.get(d.id) || 0;

  const concepts = wszystkie.filter((c) =>
    tylkoMosty ? jestMostem(c.id) : c.mentionCount >= minMentions || jestMostem(c.id)
  );
  const zostaje = new Set(concepts.map((c) => c.id));
  const edges = wszystkieKrawedzie.filter((e) => zostaje.has(e.conceptId));

  // STAN POŚREDNI POTOKU (12.9). Pojęcie utworzone PÓŹNIEJ niż ostatni przebieg
  // normalizacji nie było jeszcze porównywane z resztą, więc liczby „pojęć" i „mostów"
  // opisują stan w połowie przetwarzania. Widok musi to powiedzieć, bo sam z siebie
  // wygląda tak samo jak stan końcowy — to była przyczyna, dla której „1066 pojęć,
  // 43 mosty" przez dobę uchodziło za wynik.
  //
  // Liczone jednym `count`, nie odczytem pojęć: to head-request bez transferu wierszy,
  // a odpowiedź jest binarna.
  // Reguła siedzi w normalize-concepts.js — tam, gdzie normalizacja. Widok kolekcji
  // czyta tę samą funkcję, żeby dwa ekrany nie mogły powiedzieć czegoś innego.
  // Znacznik podajemy z wiersza, który już mamy, żeby nie czytać go drugi raz.
  const normalizacjaOczekuje = await czyNormalizacjaOczekuje(collectionId, {
    client,
    concepts_normalized_at: coll.concepts_normalized_at,
  });

  return {
    documents,
    concepts,
    edges,
    normalizacjaOczekuje,
    totals: { concepts: wszystkie.length, shown: concepts.length, bridges: mostow },
  };
}
