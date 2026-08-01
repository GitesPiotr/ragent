// Mapa punktów — warstwa łącząca czystą matematykę z pca.js z bazą (sekcja 12).
// Czysty JS, do bazy wyłącznie przez db.js. Zero React/Next/window.
//
// Podział odpowiedzialności: pca.js NIE zna bazy i nie zna identyfikatorów, map.js
// nie zna matematyki. Dzięki temu determinizm PCA testuje się bez Supabase.

import { getSupabaseClient } from './db.js';
import { getConfig } from './config.js';
import {
  buildProjection,
  projectVector,
  computeNeighbors2d,
  neighborsForNewPoints,
  MIN_CHUNKS_FOR_PCA,
} from './pca.js';

// PostgREST zwraca maksymalnie 1000 wierszy na żądanie — bez stronicowania PCA
// policzyłoby się po cichu z 1000 z 1306 fragmentów i nikt by tego nie zauważył.
const PAGE = 500;

// Próg przeliczenia bazy (12.4): ZMIANA o więcej niż 30% względem projection.chunkCount.
//
// Do Sesji 10 reguła była JEDNOKIERUNKOWA — patrzyła wyłącznie na przyrost. Ubytek
// nie odpalał jej nigdy, więc baza rzutowania potrafiła zostać policzona z 3091
// fragmentów, gdy w kolekcji było ich 1043 (po usunięciu dużego dokumentu i po
// ponownych cięciach). Osie PCA pochodziły wtedy z danych, których w dwóch trzecich
// już nie ma: rzut pozostaje matematycznie poprawny, ale przestaje maksymalizować
// wariancję TYCH punktów, więc mapa zbija się w kąt, a `builtFrom` kłamie.
const REBUILD_ZMIANA = 0.3;

// Paleta kolorów dokumentów. Deterministyczna: kolor wynika z pozycji dokumentu
// w kolekcji posortowanej po dacie utworzenia, więc nie skacze między wejściami.
//
// DOBRANA POD JASNE TŁO (#fafafa) I ZMIERZONA, nie wybrana z gustu.
// Poprzedni zestaw powstał pod tło #0f1115 i na białym przestawał działać:
// osiem z dziesięciu kolorów schodziło poniżej kontrastu 3:1 (najgorszy #8fce00
// = 1,83; #d1a53a = 2,20; #ff8b4c = 2,22). Punkt na mapie o kontraście 2:1 wobec
// tła nie jest „nieco bledszy" — po nałożeniu globalAlpha przygaszania znika.
//
// Trzy warunki, wszystkie policzone (scratchpad: kontrast WCAG + CIE76):
//  1. kontrast wobec #fafafa ≥ 3:1 — tutaj minimum 3,53 (#0891b2), maksimum 8,61,
//  2. odległość percepcyjna od złota mostów #b45309 ≥ 25 dE — minimum 31,9
//     (#dc2626); most w grafie musi zostać rozpoznawalny obok każdego dokumentu,
//  3. wzajemna rozróżnialność ≥ 25 dE — minimum 27,8 dla całego zestawu.
//
// KOLEJNOŚĆ TEŻ JEST WYNIKIEM, nie alfabetem: dokumenty dostają kolory po indeksie,
// więc najczęściej porównywane są SĄSIEDNIE pozycje. Ułożone tak, żeby najmniejsza
// odległość między sąsiadami była jak największa — wyszło 91 dE (para grafit↔czerwony
// na końcu). Jedna rodzina barw na pozycję: bez dwóch odcieni tego samego fioletu,
// bo „ten sam kolor, ciemniejszy" nie jest kategorią, którą da się odczytać z mapy.
const PALETA = [
  '#2563eb', // niebieski
  '#166534', // zielony
  '#c026d3', // fuksja
  '#0891b2', // cyjan
  '#db2777', // róż
  '#4d7c0f', // limonka
  '#5b21b6', // fiolet
  '#0d9488', // morski
  '#dc2626', // czerwony
  '#475569', // grafit
];

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function throwDb(error) {
  if (error && error.code === '22P02') {
    throw err('invalid_input', 'Nieprawidłowy identyfikator (oczekiwano UUID).');
  }
  const msg = (error && error.message) || 'nieznany';
  if (error && (error.code === 'PGRST202' || /rag_set_chunk_coords/i.test(msg))) {
    throw err(
      'invalid_input',
      'Funkcja zapisu współrzędnych "rag_set_chunk_coords" nie istnieje w bazie. Uruchom ręcznie skrypt sql/session-6-map.sql w Supabase → SQL Editor (Sesja 6).'
    );
  }
  throw err('internal', 'Błąd bazy danych: ' + msg);
}

// EKSPORTOWANE, bo graf (Sesja 9) musi malować dokument tym samym kolorem co mapa.
// Gdyby każdy widok miał własną paletę, ten sam plik byłby niebieski na mapie
// i zielony w grafie — a użytkownik ogląda oba widoki obok siebie na stronie kolekcji.
export function kolorDokumentu(index) {
  return PALETA[index % PALETA.length];
}

// Długość podglądu w dymku. Trzymana w jednym miejscu, bo od niej zależy rozmiar
// odpowiedzi zarówno getMapData, jak i newChunks z pętli indeksowania.
const PREVIEW_MAX = 120;

// JEDEN kształt fragmentu mapy dla wszystkich odbiorców: getMapData i newChunks
// zwracane przez rzut przyrostowy. Klient dokleja nowe punkty do tej samej tablicy,
// w której trzyma stare, więc rozjazd kształtów objawiłby się dopiero na mapie —
// dymkiem bez treści albo punktem bez koloru dokumentu.
function ksztaltFragmentu(row, coords) {
  const chunk = {
    id: row.id,
    documentId: row.document_id,
    x: coords.x,
    y: coords.y,
    z: coords.z,
    preview: (row.content || '').replace(/\s+/g, ' ').trim().slice(0, PREVIEW_MAX),
    pageFrom: row.page_from,
    headingPath: row.heading_path,
  };
  if (coords.neighbors) chunk.neighbors = coords.neighbors;
  return chunk;
}

// pgvector wraca przez PostgREST jako TEKST "[0.011,0.029,…]", nie jako tablica.
// Obsługujemy oba kształty, żeby zmiana zachowania sterownika niczego nie wywróciła.
export function parseVector(value) {
  if (Array.isArray(value)) return Float64Array.from(value);
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s.startsWith('[') || !s.endsWith(']')) {
      throw err('internal', 'Nieoczekiwany format wektora z bazy.');
    }
    const parts = s.slice(1, -1).split(',');
    const out = new Float64Array(parts.length);
    for (let i = 0; i < parts.length; i++) out[i] = Number.parseFloat(parts[i]);
    return out;
  }
  throw err('internal', 'Brak wektora tam, gdzie był oczekiwany.');
}

// Odczyt WSZYSTKICH wektorów kolekcji, stronicowany i ZAWSZE posortowany po id.
// Sortowanie nie jest kosmetyką: sumowanie zmiennoprzecinkowe zależy od kolejności,
// więc bez stałego porządku dwa przebiegi PCA dałyby wyniki różne na ostatnich
// bitach i DoD "identyczne współrzędne" nie przeszłoby (patrz komentarz w pca.js).
async function fetchAllVectors(client, collectionId, { onProgress } = {}) {
  const ids = [];
  const vectors = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('rag_chunks')
      .select('id, embedding')
      .eq('collection_id', collectionId)
      .not('embedding', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throwDb(error);
    if (!data || data.length === 0) break;
    for (const row of data) {
      ids.push(row.id);
      vectors.push(parseVector(row.embedding));
    }
    if (onProgress) onProgress(ids.length);
    if (data.length < PAGE) break;
  }
  return { ids, vectors };
}

// Zapis współrzędnych + sąsiadów jedną funkcją bazodanową, partiami po 500 wierszy
// (żeby ładunek jsonb nie urósł do megabajtów w jednym żądaniu).
async function saveCoords(client, rows) {
  let zapisane = 0;
  for (let i = 0; i < rows.length; i += PAGE) {
    const part = rows.slice(i, i + PAGE);
    const { data, error } = await client.rpc('rag_set_chunk_coords', { p_rows: part });
    if (error) throwDb(error);
    zapisane += typeof data === 'number' ? data : part.length;
  }
  return zapisane;
}

// Odczyt współrzędnych WSZYSTKICH już zrzutowanych fragmentów — stronicowany.
// Bez tego przy kolekcji > 1000 punktów sąsiedztwo nowych fragmentów liczyłoby się
// względem pierwszego tysiąca i nikt by nie zauważył, że reszta mapy jest pomijana.
async function fetchAllCoords(client, collectionId) {
  const punkty = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('rag_chunks')
      .select('id, coord_x, coord_y')
      .eq('collection_id', collectionId)
      .not('coord_x', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throwDb(error);
    if (!data || data.length === 0) break;
    for (const r of data) punkty.push({ id: r.id, x: r.coord_x, y: r.coord_y });
    if (data.length < PAGE) break;
  }
  return punkty;
}

async function countWithVectors(client, collectionId) {
  const { count, error } = await client
    .from('rag_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', collectionId)
    .not('embedding', 'is', null);
  if (error) throwDb(error);
  return count || 0;
}

// buildCollectionProjection: PEŁNA budowa/przeliczenie bazy rzutowania (12.1–12.4).
// Liczy PCA na wszystkich wektorach, rzutuje wszystkie fragmenty, liczy sąsiedztwo 2D
// i zapisuje komplet: rag_collections.projection + coord_x/y/z + neighbors.
export async function buildCollectionProjection(collectionId, deps = {}) {
  const config = getConfig();
  const client = deps.client || getSupabaseClient();
  if (!collectionId) throw err('invalid_input', 'Brak identyfikatora kolekcji.');

  const { data: coll, error: cErr } = await client
    .from('rag_collections')
    .select('id, embed_model, projection')
    .eq('id', collectionId)
    .single();
  if (cErr || !coll) throw err('not_found', 'Kolekcja nie istnieje.');

  const t0 = Date.now();
  const { ids, vectors } = await fetchAllVectors(client, collectionId, deps);
  const tOdczyt = Date.now() - t0;

  if (vectors.length < MIN_CHUNKS_FOR_PCA) {
    throw err(
      'invalid_input',
      `Za mało fragmentów z wektorem, żeby zbudować mapę: ${vectors.length} (potrzeba co najmniej ${MIN_CHUNKS_FOR_PCA}).`
    );
  }

  const t1 = Date.now();
  const { projection, coords } = buildProjection(vectors, { embedModel: coll.embed_model });
  const tPca = Date.now() - t1;

  // Sąsiedztwo liczone w przestrzeni 2D (12.6) — na coord_x/y, nie w pełnym wymiarze.
  const t2 = Date.now();
  const punkty = ids.map((id, i) => ({ id, x: coords[i][0], y: coords[i][1] }));
  const sasiedzi = computeNeighbors2d(punkty, config.projection.mapNeighbors);
  const tSasiedzi = Date.now() - t2;

  const rows = ids.map((id, i) => ({
    id,
    x: coords[i][0],
    y: coords[i][1],
    z: coords[i][2],
    neighbors: sasiedzi.get(id) || [],
  }));

  const t3 = Date.now();
  const zapisane = await saveCoords(client, rows);

  const { error: uErr } = await client
    .from('rag_collections')
    .update({ projection, updated_at: new Date().toISOString() })
    .eq('id', collectionId);
  if (uErr) throwDb(uErr);
  const tZapis = Date.now() - t3;

  return {
    built: true,
    chunkCount: vectors.length,
    updated: zapisane,
    rebuilt: Boolean(coll.projection),
    timings: { odczyt: tOdczyt, pca: tPca, sasiedzi: tSasiedzi, zapis: tZapis, razem: Date.now() - t0 },
  };
}

// Rzut NOWYCH fragmentów istniejącą bazą (12.4: "nowe fragmenty rzutuj istniejącą bazą").
// Istniejące punkty nie są ruszane — to jest wprost punkt DoD.
//
// Zwraca też `chunks` — zrzutowane fragmenty w kształcie getMapData().chunks. Dzięki temu
// pętla indeksowania może oddać je klientowi w odpowiedzi na tę samą partię i mapa nie
// musi odpytywać całej kolekcji, żeby dowiedzieć się o 32 nowych punktach (12.4: "każda
// kolejna partia dostaje współrzędne od razu").
export async function projectPendingChunks(collectionId, deps = {}) {
  const config = getConfig();
  const client = deps.client || getSupabaseClient();

  const { data: coll, error: cErr } = await client
    .from('rag_collections')
    .select('id, projection')
    .eq('id', collectionId)
    .single();
  if (cErr || !coll) throw err('not_found', 'Kolekcja nie istnieje.');
  if (!coll.projection || !coll.projection.components) {
    return { projected: 0, chunks: [], reason: 'brak bazy rzutowania' };
  }

  const mean = coll.projection.mean;
  const components = coll.projection.components;

  // Istniejące punkty potrzebne do policzenia sąsiadów nowych (12.6, wariant przyrostowy).
  let punktyStare = await fetchAllCoords(client, collectionId);
  let razem = 0;
  const zrzutowane = [];

  // Pętla po stronach: pojedynczy dokument potrafi mieć więcej fragmentów niż jedna
  // strona odczytu (Kodeks pracy to 1283), więc jednorazowy odczyt zostawiłby resztę
  // bez współrzędnych — i te fragmenty zniknęłyby z mapy bez żadnego błędu.
  for (;;) {
    const { data: nowe, error } = await client
      .from('rag_chunks')
      .select('id, document_id, embedding, content, page_from, heading_path')
      .eq('collection_id', collectionId)
      .not('embedding', 'is', null)
      .is('coord_x', null)
      .order('id', { ascending: true })
      .range(0, PAGE - 1);
    if (error) throwDb(error);
    if (!nowe || nowe.length === 0) break;

    const punktyNowe = nowe.map((r) => {
      const [x, y, z] = projectVector(parseVector(r.embedding), mean, components);
      return { id: r.id, x, y, z };
    });

    // Sąsiedzi liczeni TYLKO dla nowych, względem wszystkich — listy STARYCH punktów
    // zostają nietknięte. To niesymetryczne z założenia (12.6) i dlatego w UI mówimy
    // "połączenia znaczeniowe", a nie "k najbliższych sąsiadów".
    const mapa = neighborsForNewPoints(
      punktyNowe.map((p) => ({ id: p.id, x: p.x, y: p.y })),
      punktyStare,
      config.projection.mapNeighbors
    );

    const rows = punktyNowe.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      neighbors: mapa.get(p.id) || [],
    }));
    razem += await saveCoords(client, rows);

    for (let i = 0; i < nowe.length; i++) {
      zrzutowane.push(ksztaltFragmentu(nowe[i], rows[i]));
    }

    // Kolejna strona porównuje się już także z tym, co właśnie zrzutowaliśmy.
    punktyStare = punktyStare.concat(punktyNowe.map((p) => ({ id: p.id, x: p.x, y: p.y })));
    if (nowe.length < PAGE) break;
  }

  return { projected: razem, chunks: zrzutowane };
}

// Reguła 12.4 w jednym miejscu: co zrobić, gdy dokument skończył się indeksować.
// Wołane z embedNextBatch przy finished: true. NIGDY nie może wywrócić indeksowania —
// wołający opakowuje to w try/catch.
//
// `recalculated: true` oznacza, że RUSZYŁY SIĘ WSZYSTKIE współrzędne (budowa bazy albo
// przeliczenie po przyroście > 30%). Przyrostowa lista nowych punktów wtedy nie wystarcza
// i klient musi dociągnąć całość — dlatego to osobna flaga, a nie brak `chunks`.
// Czy baza rzutowania odbiega od stanu kolekcji na tyle, że trzeba ją przeliczyć?
// Symetrycznie: tak samo traktujemy przyrost i ubytek.
//
// UWAGA na drugą warstwę jednokierunkowości: sam warunek to za mało, bo
// refreshProjectionAfterIndexing wołane jest WYŁĄCZNIE po zaindeksowaniu partii.
// Usunięcie dokumentu nie woła go wcale, więc nawet symetryczny próg nie zadziała
// w chwili kasowania. Świadomie NIE przeliczamy bazy wewnątrz usuwania — pełne PCA
// przy kasowaniu dokumentu na 1455 fragmentów zablokowałoby operację, a punkt 5
// Sesji 10 wymaga czegoś odwrotnego. Zamiast tego getMapStatus RAPORTUJE
// nieaktualność (`bazaNieaktualna`), a UI oferuje „Przelicz mapę".
export function bazaNieaktualna(liczba, bazowa) {
  if (!bazowa) return false;
  return Math.abs(liczba - bazowa) / bazowa > REBUILD_ZMIANA;
}

export async function refreshProjectionAfterIndexing(collectionId, deps = {}) {
  const config = getConfig();
  const client = deps.client || getSupabaseClient();

  const { data: coll, error } = await client
    .from('rag_collections')
    .select('id, projection')
    .eq('id', collectionId)
    .single();
  if (error || !coll) return { action: 'brak-kolekcji' };

  const liczba = await countWithVectors(client, collectionId);
  const projection = coll.projection;

  if (!projection || !projection.components) {
    // Progu jeszcze nie ma → mapy nie budujemy (UI pokazuje licznik N/50).
    if (liczba >= config.projection.minChunks) {
      await buildCollectionProjection(collectionId, deps);
      return { action: 'zbudowana', chunkCount: liczba, recalculated: true };
    }
    // Wyjątek z 12.4: mała, ale SKOŃCZONA kolekcja też ma mieć mapę.
    if (liczba >= MIN_CHUNKS_FOR_PCA) {
      const { count: nieskonczone } = await client
        .from('rag_documents')
        .select('id', { count: 'exact', head: true })
        .eq('collection_id', collectionId)
        .in('status', ['pending', 'extracting', 'chunking', 'chunked', 'embedding']);
      if (!nieskonczone) {
        await buildCollectionProjection(collectionId, deps);
        return { action: 'zbudowana-mala-kolekcja', chunkCount: liczba, recalculated: true };
      }
    }
    return { action: 'ponizej-progu', chunkCount: liczba, minChunks: config.projection.minChunks };
  }

  // Baza istnieje: zmiana o > 30% w KTÓRĄKOLWIEK stronę → pełne przeliczenie (12.4),
  // inaczej rzut nowych istniejącą bazą.
  const bazowa = projection.chunkCount || 0;
  if (bazowa > 0 && bazaNieaktualna(liczba, bazowa)) {
    await buildCollectionProjection(collectionId, deps);
    return { action: 'przeliczona', chunkCount: liczba, poprzednio: bazowa, recalculated: true };
  }

  const { projected, chunks } = await projectPendingChunks(collectionId, deps);
  return { action: 'dorzucone', projected, chunks };
}

// getMapData wg kontraktu z sekcji 9.
// ROZMIAR ODPOWIEDZI: preview przycięty do ~120 znaków, sąsiedzi DOMYŚLNIE POMIJANI —
// przy 1306 fragmentach pełna odpowiedź z sąsiadami to kilka MB na każde wejście.
export async function getMapData(collectionId, { includeNeighbors = false } = {}, deps = {}) {
  const config = getConfig();
  const client = deps.client || getSupabaseClient();
  if (!collectionId) throw err('invalid_input', 'Brak identyfikatora kolekcji.');

  const { data: coll, error: cErr } = await client
    .from('rag_collections')
    .select('id, name, projection')
    .eq('id', collectionId)
    .single();
  if (cErr || !coll) throw err('not_found', 'Kolekcja nie istnieje.');

  const { data: docRows, error: dErr } = await client
    .from('rag_documents')
    .select('id, file_name, status, created_at')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: true });
  if (dErr) throwDb(dErr);

  const documents = (docRows || []).map((d, i) => ({
    id: d.id,
    name: d.file_name,
    color: kolorDokumentu(i),
  }));

  const chunkCount = await countWithVectors(client, collectionId);
  const projection = coll.projection && coll.projection.components ? coll.projection : null;

  if (!projection) {
    // Mapy nie ma. UI pokazuje licznik "N / minChunks", nie puste płótno (12.4, 12.9).
    return {
      documents,
      chunks: [],
      viewport: null,
      projectionBuilt: false,
      chunkCount,
      minChunks: config.projection.minChunks,
      canBuild: chunkCount >= MIN_CHUNKS_FOR_PCA,
    };
  }

  const kolumny = includeNeighbors
    ? 'id, document_id, coord_x, coord_y, coord_z, content, page_from, heading_path, neighbors'
    : 'id, document_id, coord_x, coord_y, coord_z, content, page_from, heading_path';

  const chunks = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('rag_chunks')
      .select(kolumny)
      .eq('collection_id', collectionId)
      .not('coord_x', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throwDb(error);
    if (!data || data.length === 0) break;
    for (const r of data) {
      chunks.push(
        ksztaltFragmentu(r, {
          x: r.coord_x,
          y: r.coord_y,
          z: r.coord_z,
          neighbors: includeNeighbors ? r.neighbors || [] : null,
        })
      );
    }
    if (data.length < PAGE) break;
  }

  return {
    documents,
    chunks,
    viewport: projection.viewport,
    projectionBuilt: true,
    chunkCount,
    minChunks: config.projection.minChunks,
    builtAt: projection.builtAt,
    builtFrom: projection.chunkCount,
    // Jedyne miejsce, w którym widać rozjazd bazy ze stanem kolekcji po USUNIĘCIU
    // (indeksowanie naprawia się samo). Bez tej flagi mapa rysowała się osiami
    // z nieistniejących już danych i nic tego nie sygnalizowało.
    nieaktualna: bazaNieaktualna(chunkCount, projection.chunkCount || 0),
  };
}
