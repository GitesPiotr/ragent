// Orkiestracja dokumentów (sekcja 9 + 10.3, zakres Sesji 3): upload → ekstrakcja →
// cięcie → zapis fragmentów BEZ wektorów, status 'chunked'. Embedowania TU NIE MA (Sesja 4).
// Czysty JS, do bazy i Storage sięga wyłącznie przez klienta z db.js.

import { getSupabaseClient, BUCKET } from './db.js';
import { getConfig } from './config.js';
import { getCollection } from './collections.js';
import { extractBlocks } from './extract.js';
import { chunkBlocks } from './chunk.js';
import { createEmbeddingProvider } from './embedding.js';
import { refreshProjectionAfterIndexing, projectPendingChunks } from './map.js';
import { zmierzJakoscTekstu, opiszJakosc } from './jakosc-tekstu.js';

// Próg no_text: poniżej tylu znaków wydobytego tekstu uznajemy dokument za "bez treści"
// (skan/obraz), status 'no_text' — nie 'error', nie pusty 'ready'.
const NO_TEXT_MAX_CHARS = 20;
// Ostrzeżenie o częściowym skanie (sekcja 14, Sesja 3): PDF z < tylu znakami na stronę.
const PARTIAL_SCAN_CHARS_PER_PAGE = 200;

// =============================================================================
//  10.a.1 — wykrywanie uszkodzonego kodowania tekstu z PDF
//
//  W ludzie-bezdomni.pdf litera "j" wydobywa się jako telugu "గ", a dwuznak "dz"
//  jako "ǳ" (U+01F3): "podobnie గak tysiące innych", "bawiły się blade ǳieci".
//  To właściwość SAMEGO PLIKU — własny krój z nietypowym mapowaniem znaków —
//  więc unpdf czyta to, co w PDF-ie jest, i nie jest to błąd naszego kodu.
//  Konsekwencja jest jednak nasza: wektory powstają z zepsutego tekstu, a użytkownik
//  nie ma jak się o tym dowiedzieć. Stąd ostrzeżenie, analogiczne do tego o skanie.
// =============================================================================

// Litery, których w polskim tekście się spodziewamy: podstawowa łacinka, znaki
// diakrytyczne zachodnioeuropejskie (Latin-1) i Latin Extended-A (obejmuje komplet
// polskich). Wszystko poza tym — cyrylica, telugu, greka, Latin Extended-B — jest
// w polskim dokumencie sygnałem uszkodzonego mapowania znaków.
const LITERA_OCZEKIWANA = /[A-Za-zÀ-ÿĀ-ſ]/;

// Liczy udział PODEJRZANYCH LITER wśród wszystkich liter. Świadomie po literach,
// nie po wszystkich znakach: interpunkcja, cyfry, spacje i znaki typograficzne
// (¹, —, „") są w porządku i tylko rozwadniałyby wynik.
export function udzialPodejrzanychLiter(text) {
  const s = typeof text === 'string' ? text : '';
  let liter = 0;
  let podejrzanych = 0;
  for (const znak of s) {
    if (!/\p{L}/u.test(znak)) continue;
    liter++;
    if (!LITERA_OCZEKIWANA.test(znak)) podejrzanych++;
  }
  return liter === 0 ? 0 : podejrzanych / liter;
}

// Próg 2% wg 10.a.1. Zmierzony na korpusie: poprawne dokumenty mają 0,00%,
// a ludzie-bezdomni.pdf — patrz komentarz wyżej — wielokrotność progu.
const USZKODZONY_TEKST_PROG = 0.02;

// Limit długości ostatniego segmentu klucza w Storage. Cała ścieżka ma limit, a dwa
// pierwsze segmenty to UUID-y (2 × 36 + 2 ukośniki), więc na nazwę zostaje z zapasem.
const MAX_KEY_SEGMENT = 120;

const POLSKIE_ZNAKI = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z',
};

function bezDiakrytykow(s) {
  // `ł`/`Ł` to osobne znaki Unicode, nie „l + znak łączący" — NFD ich NIE rozłoży,
  // więc najpierw jawna podmiana polskich liter, dopiero potem ogólne NFD, które
  // obejmuje resztę łacinki (é, ü, ç) bez wypisywania każdego alfabetu z osobna.
  return s
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => POLSKIE_ZNAKI[c])
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function oczyscCzesc(s) {
  return bezDiakrytykow(s)
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

// sanitizeStorageName: nazwa pliku → bezpieczny OSTATNI SEGMENT klucza w Storage.
// Supabase Storage odrzuca klucze ze znakami spoza wąskiego zestawu ASCII ("Invalid key"),
// a praktycznie każdy plik polskiego użytkownika ma ogonki i spacje.
//
// UWAGA: to dotyczy WYŁĄCZNIE `file_path`. `rag_documents.file_name` zostaje oryginalną,
// nietkniętą nazwą — to ona idzie do cytowań w AIDEAS i musi wyglądać tak, jak u użytkownika.
//
// Kolizji nie obsługujemy celowo: ścieżka to `{collectionId}/{documentId}/{nazwa}`,
// a documentId to UUID, więc dwie identycznie zsanityzowane nazwy i tak są w osobnych
// katalogach. Sufiksy/liczniki byłyby kodem bez powodu.
export function sanitizeStorageName(name) {
  const raw = typeof name === 'string' ? name : '';
  const dot = raw.lastIndexOf('.');
  const maExt = dot > 0 && dot < raw.length - 1;

  let rdzen = oczyscCzesc(maExt ? raw.slice(0, dot) : raw);
  const ext = maExt ? oczyscCzesc(raw.slice(dot + 1)) : '';

  if (!rdzen) rdzen = 'plik';
  const sufiks = ext ? '.' + ext : '';

  // Obcinamy RDZEŃ, nie rozszerzenie — po `.pdf` poznaje się typ pliku w Storage.
  if (sufiks.length >= MAX_KEY_SEGMENT) return (rdzen + sufiks).slice(0, MAX_KEY_SEGMENT);
  if (rdzen.length + sufiks.length > MAX_KEY_SEGMENT) {
    rdzen = rdzen.slice(0, MAX_KEY_SEGMENT - sufiks.length).replace(/[-.]+$/, '') || 'plik';
  }
  return rdzen + sufiks;
}

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

function mapDocument(row) {
  const doc = {
    id: row.id,
    collectionId: row.collection_id,
    fileName: row.file_name,
    filePath: row.file_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    pageCount: row.page_count,
    charCount: row.char_count,
    chunkCount: row.chunk_count,
    status: row.status,
    errorMessage: row.error_message,
    // NULL („nie mierzono") jest ODRÓŻNIALNE od werdyktu „nieoceniony" (zmierzono,
    // za mało tekstu ciągłego, żeby orzec). Widok pokazuje te stany osobno — brak
    // pomiaru nie może wyglądać jak wynik pomiaru (12.9).
    textQuality: row.text_quality || null,
    // Hak integracyjny (migracja 018). Dla dokumentów wgranych wprost w Kreatorze
    // jest nullem; dla wciągniętych z Bazy wiedzy AIDEAS niesie knowledge_files.id.
    externalRef: row.external_ref ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  // Ostrzeżenia liczone W LOCIE — bez dodatkowych kolumn w schemacie.
  const ostrzezenia = [];

  if (
    row.status !== 'no_text' &&
    row.mime_type === 'application/pdf' &&
    row.page_count &&
    row.char_count != null &&
    row.char_count / row.page_count < PARTIAL_SCAN_CHARS_PER_PAGE
  ) {
    ostrzezenia.push('Dokument wygląda na częściowo zeskanowany — rozpoznano mało tekstu.');
  }

  // 10.a.1 — uszkodzone kodowanie znaków w PDF-ie.
  if (row.status !== 'no_text' && row.extracted_text) {
    const udzial = udzialPodejrzanychLiter(row.extracted_text);
    if (udzial > USZKODZONY_TEKST_PROG) {
      ostrzezenia.push(
        `Tekst może być uszkodzony — ${(udzial * 100).toFixed(1)}% liter nie należy do polskiego alfabetu. ` +
          'Sprawdź podgląd fragmentów; wyszukiwanie w tym dokumencie będzie gorsze.'
      );
    }
  }

  // 11.1d — utrata warstwy diakrytyków. INNY PRZYPADEK NIŻ 10.a.1 WYŻEJ:
  // tamta reguła szuka liter SPOZA polskiego alfabetu (znaki podmienione), ta szuka
  // BRAKU polskich liter przy zachowanej polszczyźnie (znaki zgubione). GUS przechodzi
  // przez 10.a.1 bez zarzutu — wszystkie jego litery należą do polskiego alfabetu,
  // po prostu nie ma wśród nich ani jednej z ogonkiem.
  //
  // Tylko werdykt „okaleczony" jest OSTRZEŻENIEM. Dokument obcojęzyczny jest
  // obcojęzyczny zgodnie z prawdą i nic z tym nie jest nie tak; „nieoceniony" mówi
  // „nie wiadomo", a nie „w porządku". Oba idą do `info`, nie do `warning`.
  const opis = opiszJakosc(row.text_quality);
  if (opis && opis.waga === 'ostrzezenie') ostrzezenia.push(opis.tekst);
  else if (opis) doc.info = opis.tekst;

  // Pole `warning` zostaje pojedynczym zdaniem (tak czyta je UI), ale dokument może
  // mieć obie wady naraz — wtedy sklejamy je zamiast po cichu gubić drugą.
  if (ostrzezenia.length) doc.warning = ostrzezenia.join(' ');
  return doc;
}

async function getDocumentRow(client, id) {
  const { data, error } = await client.from('rag_documents').select('*').eq('id', id).single();
  if (error) throwDb(error);
  return data;
}

// ingestFile: ekstrakcja + cięcie + zapis fragmentów (status 'chunked'). BEZ wektorów.
// deps.client — wstrzykiwalny klient (testy bez bazy i bez Storage), jak w embedNextBatch.
// externalRef — opcjonalny znacznik powiązania z systemem zewnętrznym, zapisywany
// RAZEM z wierszem dokumentu, a nie osobnym update'em po fakcie. Różnica jest
// praktyczna: przy zapisie po fakcie nieudany update zostawiałby dokument
// z fragmentami i wektorami, którego nic już nie łączy ze źródłem — sierotę
// niewidoczną dla kasowania po stronie AIDEAS.
export async function ingestFile({ collectionId, file, externalRef = null }, deps = {}) {
  const config = getConfig();

  if (!file || !file.name || !file.bytes) throw err('invalid_input', 'Brak pliku w żądaniu.');
  const maxBytes = config.files.maxFileMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw err('limit_exceeded', `Plik przekracza limit ${config.files.maxFileMb} MB.`);
  }

  const client = deps.client || getSupabaseClient();

  // Rzuci not_found, jeśli kolekcja nie istnieje; daje też pewny collection_id.
  const collection = await getCollection(collectionId, deps);

  const { data: created, error: insErr } = await client
    .from('rag_documents')
    .insert({
      collection_id: collection.id,
      file_name: file.name,
      mime_type: file.mimeType || null,
      size_bytes: file.size,
      status: 'extracting',
      external_ref: externalRef,
    })
    .select()
    .single();
  if (insErr) throw err('internal', 'Nie udało się utworzyć dokumentu: ' + insErr.message);
  const documentId = created.id;

  try {
    // Oryginał trafia do ISTNIEJĄCEGO bucketu rag-files. Kod NIE tworzy bucketu —
    // infrastrukturę (bucket, jak wcześniej pgvector i schemat) stawia użytkownik ręcznie,
    // kod z niej korzysta. extracted_text i tak pozwala przeciąć na nowo bez pliku (8.4).
    //
    // Do KLUCZA idzie nazwa zsanityzowana (Storage odrzuca ogonki i spacje), do
    // `file_name` powyżej — oryginalna. Od tej pory `file_path` jest jedynym źródłem
    // prawdy o położeniu pliku; nikt nie składa ścieżki z `file_name` na nowo.
    const path = `${collection.id}/${documentId}/${sanitizeStorageName(file.name)}`;
    const up = await client.storage.from(BUCKET).upload(path, file.bytes, {
      contentType: file.mimeType || 'application/octet-stream',
      upsert: true,
    });
    if (up.error) {
      const msg = up.error.message || '';
      if (/bucket not found|not found/i.test(msg)) {
        throw err(
          'internal',
          `Bucket "${BUCKET}" nie istnieje w Supabase Storage. Utwórz go raz ręcznie: Storage → New bucket → nazwa "${BUCKET}", prywatny.`
        );
      }
      if (/row-level security|not authorized|permission|violates/i.test(msg)) {
        // KOMUNIKAT PRZEPISANY PO RUNDZIE 3B. Poprzednia wersja kazała sprawdzić
        // RAG_SUPABASE_SERVICE_KEY — a warstwa HTTP nie używa już service_role
        // (zapytania idą klientem z sesją użytkownika, patrz lib/rag/db.js).
        // Ta podpowiedź kosztowała realną sesję diagnostyczną: prawdziwą przyczyną
        // była literówka w polityce bucketu, a komunikat wysyłał szukać złego klucza.
        throw err(
          'internal',
          `Storage odmówił zapisu pliku "${path}" (polityka RLS na buckecie "${BUCKET}"). ` +
            'Zapis idzie klientem z sesją użytkownika, więc NIE chodzi o klucz w .env.local. ' +
            'Sprawdź politykę rag_files_wlasne_pliki: pierwszy segment klucza to identyfikator ' +
            'kolekcji, a polityka musi umieć powiązać go z właścicielem (supabase/016_rls_rag.sql, KROK 8). ' +
            `Szczegóły: ${msg}`
        );
      }
      if (/invalid key/i.test(msg)) {
        // Nie powinno się już zdarzyć (klucz jest sanityzowany) — jeśli jednak, to znak,
        // że sanityzacja przepuściła nowy przypadek. Komunikat ma to od razu wskazać.
        throw err(
          'internal',
          `Storage odrzucił klucz obiektu "${path}". To błąd sanityzacji nazwy pliku, nie konfiguracji. Szczegóły: ${msg}`
        );
      }
      throw err('internal', 'Błąd zapisu pliku do magazynu (upload): ' + msg);
    }

    const { blocks, pageCount, usunietePaginy, niepewneRodziny } = await extractBlocks(file, config.chunk);
    const { extractedText, chunks } = chunkBlocks(blocks, config.chunk);
    const charCount = extractedText.length;

    // Ścieżka no_text: dokument bez treści (skan) — status 'no_text', bez fragmentów.
    if (charCount < NO_TEXT_MAX_CHARS) {
      await client
        .from('rag_documents')
        .update({
          file_path: path,
          extracted_text: extractedText,
          text_quality: zmierzJakoscTekstu(extractedText),
          char_count: charCount,
          page_count: pageCount,
          chunk_count: 0,
          status: 'no_text',
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);
      return mapDocument(await getDocumentRow(client, documentId));
    }

    await client
      .from('rag_documents')
      .update({ status: 'chunking', updated_at: new Date().toISOString() })
      .eq('id', documentId);

    const rows = chunks.map((c) => ({
      document_id: documentId,
      collection_id: collection.id,
      chunk_index: c.chunkIndex,
      content: c.content,
      heading_path: c.headingPath,
      page_from: c.pageFrom,
      page_to: c.pageTo,
      char_start: c.charStart,
      char_end: c.charEnd,
      token_estimate: c.tokenEstimate,
      // embedding, coord_x/y/z, neighbors — celowo puste (Sesja 4 i 6).
    }));
    if (rows.length) {
      const { error: chErr } = await client.from('rag_chunks').insert(rows);
      if (chErr) throw err('internal', 'Błąd zapisu fragmentów: ' + chErr.message);
    }

    await client
      .from('rag_documents')
      .update({
        file_path: path,
        extracted_text: extractedText,
        // Mierzone RAZ, przy zapisie tekstu — nie przy każdym odczycie listy
        // dokumentów. Miara jest tania, ale liczona w locie nie zostawiałaby
        // trwałego śladu, a o to właśnie chodzi: komunikat znika z sesją,
        // problem zostaje.
        text_quality: zmierzJakoscTekstu(extractedText),
        char_count: charCount,
        page_count: pageCount,
        chunk_count: rows.length,
        status: 'chunked',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    // Raport z 10.a.2: skoro reguła KASUJE tekst, użytkownik musi móc zobaczyć, co
    // dokładnie zniknęło i ile razy — inaczej zbyt szeroka reguła jest niewykrywalna.
    const doc = mapDocument(await getDocumentRow(client, documentId));
    if (usunietePaginy && usunietePaginy.length) doc.usunietePaginy = usunietePaginy;
    // Raport z 10.a.5: strażnik nie kasuje tekstu, ale ODBIERA ścieżkom poziom
    // szczegółowości. Bez raportu jest niewidoczny — a to on decyduje, czy dokument
    // cytuje się artykułem, czy tylko rozdziałem.
    if (niepewneRodziny && niepewneRodziny.length) doc.niepewneRodziny = niepewneRodziny;
    return doc;
  } catch (e) {
    // Awaria w trakcie: zostaw dokument w statusie 'error' z komunikatem (nie zawieszony).
    await client
      .from('rag_documents')
      .update({
        status: 'error',
        error_message: (e && e.message) || 'nieznany błąd',
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .then(
        () => {},
        () => {}
      );
    throw e;
  }
}

// findDocumentByExternalRef i findDocumentsByExternalRefs USUNIETE (runda 12).
//
// Oba sluzyly mapowaniu knowledge_files.id -> rag_documents przy modelu, w ktorym
// plik z Bazy wiedzy indeksowal sie do kolekcji konta (rundy 5b i 7). Model
// zostal wycofany: agent wskazuje CALA kolekcje (agents.rag_collection_id),
// wiec nie ma czego mapowac — documentIds jest teraz null. Nic ich nie wolalo.
//
// Kolumna rag_documents.external_ref ZOSTAJE w schemacie (migracja 018), bez
// migracji kasujacej — i ta roznica jest celowa. Nieuzywana kolumna nie robi nic,
// dopoki ktos jej nie wypelni, a jej usuniecie byloby nieodwracalne. Martwa
// funkcja eksportowana czeka, az ktos ja zawola.

export async function listDocuments(collectionId, deps = {}) {
  if (!collectionId) throw err('invalid_input', 'Brak identyfikatora kolekcji.');
  const client = deps.client || getSupabaseClient();
  const { data, error } = await client
    .from('rag_documents')
    .select('*')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: true });
  if (error) throwDb(error);
  return data.map(mapDocument);
}

// Podgląd fragmentów dokumentu — do WERYFIKACJI w UI (heading_path, strony, wycinek).
// Endpoint pomocniczy poza tabelą 10.1; read-only.
export async function listDocumentChunks(documentId, { limit = 300 } = {}, deps = {}) {
  if (!documentId) throw err('invalid_input', 'Brak identyfikatora dokumentu.');
  const client = deps.client || getSupabaseClient();
  const { data, error } = await client
    .from('rag_chunks')
    .select('id, chunk_index, heading_path, page_from, page_to, char_start, char_end, content')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true })
    .limit(limit);
  if (error) throwDb(error);
  return data.map((c) => ({
    id: c.id,
    chunkIndex: c.chunk_index,
    headingPath: c.heading_path,
    pageFrom: c.page_from,
    pageTo: c.page_to,
    charStart: c.char_start,
    charEnd: c.char_end,
    contentLength: c.content.length,
    preview: c.content.length > 240 ? c.content.slice(0, 240) + '…' : c.content,
  }));
}

export async function deleteDocument(documentId, deps = {}) {
  if (!documentId) throw err('invalid_input', 'Brak identyfikatora dokumentu.');
  const client = deps.client || getSupabaseClient();
  const { data: doc } = await client
    .from('rag_documents')
    .select('file_path')
    .eq('id', documentId)
    .maybeSingle();

  const { error, count } = await client.from('rag_documents').delete({ count: 'exact' }).eq('id', documentId);
  if (error) throwDb(error);
  if (!count) throw err('not_found', 'Dokument nie istnieje.');

  // Kaskada FK usuwa rag_chunks. Sprzątamy też oryginał w Storage.
  //
  // Sprzątanie Storage jest CELOWO nieblokujące: wiersz już zniknął z bazy, więc brak
  // obiektu w Storage nie jest błędem, tylko normalnym stanem. Dwa realne przypadki:
  // (1) `file_path` jest NULL, bo upload padł przed zapisem ścieżki — sierota, którą
  // użytkownik musi móc usunąć jednym kliknięciem; (2) `file_path` jest, ale obiektu
  // nie ma. Żaden z nich nie może wywrócić „Usuń".
  if (doc && doc.file_path) {
    await client.storage.from(BUCKET).remove([doc.file_path]).then(
      () => {},
      () => {}
    );
  }
  return { id: documentId, deleted: true };
}

// =============================================================================
//  Sesja 4 — embeddingi partiami (10.3) i reindeks
// =============================================================================

function providerConfigFromGlobal(config) {
  return {
    provider: config.embed.provider,
    model: config.embed.model,
    dim: config.embed.dim,
    batch: config.embed.batch,
    docPrefix: config.embed.docPrefix,
    queryPrefix: config.embed.queryPrefix,
    ollamaUrl: config.embed.ollamaUrl,
  };
}

async function countChunks(client, documentId, onlyNull) {
  let q = client.from('rag_chunks').select('id', { count: 'exact', head: true }).eq('document_id', documentId);
  if (onlyNull) q = q.is('embedding', null);
  const { count, error } = await q;
  if (error) throwDb(error);
  return count || 0;
}

// getEmbedProgress: SAM ODCZYT postępu z bazy — ile fragmentów ma już wektor, ile wszystkich.
// Bez embedowania i bez zmiany statusu. Dzięki temu pasek postępu po wznowieniu startuje od
// PRAWDZIWEJ liczby (np. 4/7), zamiast pokazywać 0/0 do czasu odpowiedzi pierwszej partii.
export async function getEmbedProgress(documentId, deps = {}) {
  if (!documentId) throw err('invalid_input', 'Brak identyfikatora dokumentu.');
  const client = deps.client || getSupabaseClient();

  const { data: doc, error: dErr } = await client
    .from('rag_documents')
    .select('id, status')
    .eq('id', documentId)
    .single();
  if (dErr || !doc) throw err('not_found', 'Dokument nie istnieje.');

  if (doc.status === 'no_text') return { done: 0, total: 0, finished: true };

  const total = await countChunks(client, documentId, false);
  const remaining = await countChunks(client, documentId, true);
  return { done: total - remaining, total, finished: total > 0 && remaining === 0 };
}

// embedNextBatch: liczy JEDNĄ partię fragmentów bez wektora (10.3). Wznawialne —
// źródłem prawdy jest baza (`where embedding is null`), nie żaden kursor w stanie.
// deps.client / deps.provider — wstrzykiwalne do testów (bez DB/Ollamy).
export async function embedNextBatch(documentId, deps = {}) {
  const config = getConfig();
  const client = deps.client || getSupabaseClient();

  if (!documentId) throw err('invalid_input', 'Brak identyfikatora dokumentu.');

  const { data: doc, error: dErr } = await client
    .from('rag_documents')
    .select('id, status, collection_id')
    .eq('id', documentId)
    .single();
  if (dErr || !doc) throw err('not_found', 'Dokument nie istnieje.');

  // Dokument bez treści (skan) nie ma czego embedować — nie ruszamy statusu no_text.
  if (doc.status === 'no_text') return { done: 0, total: 0, finished: true };

  const total = await countChunks(client, documentId, false);
  if (total === 0) return { done: 0, total: 0, finished: true };

  // Jedna partia fragmentów BEZ wektora — to zapewnia wznawialność.
  const { data: batch, error: bErr } = await client
    .from('rag_chunks')
    .select('id, content, heading_path')
    .eq('document_id', documentId)
    .is('embedding', null)
    .order('chunk_index', { ascending: true })
    .limit(config.embed.batch);
  if (bErr) throwDb(bErr);

  if (!batch || batch.length === 0) {
    // Wszystko już ma wektory — upewnij się, że status to ready.
    await client
      .from('rag_documents')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', documentId);
    return { done: total, total, finished: true };
  }

  // Kontrola spójności modelu (nigdy nie mieszaj niekompatybilnych wektorów).
  const { data: coll } = await client
    .from('rag_collections')
    .select('embed_model')
    .eq('id', doc.collection_id)
    .single();
  if (coll && coll.embed_model && coll.embed_model !== config.embed.model) {
    throw err(
      'model_mismatch',
      `Kolekcja zbudowana modelem "${coll.embed_model}", a konfiguracja używa "${config.embed.model}". Ustaw RAG_EMBED_MODEL na model kolekcji przed indeksowaniem.`
    );
  }

  const provider = deps.provider || createEmbeddingProvider(providerConfigFromGlobal(config));

  // Status embedding na czas liczenia partii.
  await client
    .from('rag_documents')
    .update({ status: 'embedding', updated_at: new Date().toISOString() })
    .eq('id', documentId);

  try {
    // Tekst DO EMBEDOWANIA to {heading_path}\n{content} (8.2) — content w bazie zostaje bez prefiksu.
    const inputs = batch.map((c) =>
      config.chunk.prependHeadings && c.heading_path ? `${c.heading_path}\n${c.content}` : c.content
    );
    const vectors = await provider.embedDocuments(inputs);
    if (!Array.isArray(vectors) || vectors.length !== batch.length) {
      throw err('internal', 'Provider zwrócił niepoprawną liczbę wektorów.');
    }
    for (let i = 0; i < batch.length; i++) {
      // pgvector przyjmuje kanoniczny literał tekstowy "[a,b,c]" — jednoznaczny przez PostgREST.
      const literal = '[' + vectors[i].join(',') + ']';
      const { error: uErr } = await client.from('rag_chunks').update({ embedding: literal }).eq('id', batch[i].id);
      if (uErr) throwDb(uErr);
    }
  } catch (e) {
    // Nie zostawiaj dokumentu w martwym 'embedding' — wróć do 'chunked' (nadal wznawialne
    // przez `where embedding is null`), a błąd (np. ollama_unavailable) leci wyżej.
    await client
      .from('rag_documents')
      .update({ status: 'chunked', updated_at: new Date().toISOString() })
      .eq('id', documentId)
      .then(() => {}, () => {});
    throw e;
  }

  const remaining = await countChunks(client, documentId, true);
  const done = total - remaining;
  const finished = remaining === 0;

  await client
    .from('rag_documents')
    .update({ status: finished ? 'ready' : 'embedding', updated_at: new Date().toISOString() })
    .eq('id', documentId);

  // Reguła 12.4 rozdzielona na DWA różne pytania — mylenie ich zabrało Sesji 6b
  // "mapę rysującą się na żywo":
  //
  //  • CZY ZBUDOWAĆ / PRZELICZYĆ BAZĘ — tylko na końcu dokumentu (finished).
  //    12.4 mówi wprost: "Nie sprawdzaj po każdej partii".
  //  • CZY ZRZUTOWAĆ NOWE FRAGMENTY istniejącą bazą — po KAŻDEJ partii.
  //    12.4: "każda kolejna partia dostaje współrzędne od razu"; 12.6: sąsiedztwo
  //    przyrostowe liczone w trakcie indeksowania, "dzięki temu połączenia powstają
  //    na żywo". Bez tego dokument na 1283 fragmenty nie pokazuje NIC przez 40 partii,
  //    a potem wysypuje się na mapę jednym skokiem.
  //
  // Opakowane w try/catch świadomie: mapa jest warstwą wizualizacji, a indeksowanie
  // jest warstwą danych. Awaria mapy (np. nieuruchomiony skrypt SQL Sesji 6) NIE MOŻE
  // wywrócić poprawnie policzonych wektorów ani zablokować pętli z 10.3.
  //
  // newChunks / recalculated jadą w odpowiedzi, żeby otwarta mapa dowiedziała się
  // o nowych punktach BEZ odpytywania całej kolekcji (patrz 10.3 i komentarz w map.js).
  const wynik = { done, total, finished };
  try {
    if (finished) {
      const stan = await refreshProjectionAfterIndexing(doc.collection_id, deps);
      if (stan && stan.recalculated) wynik.recalculated = true;
      else if (stan && stan.chunks && stan.chunks.length) wynik.newChunks = stan.chunks;
    } else {
      const { chunks } = await projectPendingChunks(doc.collection_id, deps);
      if (chunks && chunks.length) wynik.newChunks = chunks;
    }
  } catch {
    // celowo cicho — stan mapy widać w GET /map, a indeksowanie ma iść dalej
  }

  return wynik;
}

// reindexDocument (sekcja 9): rechunk=false → czyści wektory ORAZ coord_x/y/z (i sąsiadów) →
// status chunked (dalej przez embedNextBatch). rechunk=true → ponowne cięcie.
export async function reindexDocument(documentId, { rechunk = false } = {}, deps = {}) {
  if (!documentId) throw err('invalid_input', 'Brak identyfikatora dokumentu.');
  const config = getConfig();
  const client = deps.client || getSupabaseClient();

  const { data: doc, error } = await client.from('rag_documents').select('*').eq('id', documentId).single();
  if (error || !doc) throw err('not_found', 'Dokument nie istnieje.');

  if (rechunk) {
    // extracted_text nie zachowuje typów bloków ani stron, więc dla WIERNEGO ponownego
    // cięcia re-ekstrahujemy oryginał ze Storage (mamy go). Świadome odejście od litery
    // "z extracted_text" na rzecz zachowania heading_path/stron.
    if (!doc.file_path) throw err('invalid_input', 'Brak oryginału pliku w Storage — nie można pociąć od nowa.');
    const { data: blob, error: dlErr } = await client.storage.from(BUCKET).download(doc.file_path);
    if (dlErr) throw err('internal', 'Nie udało się pobrać oryginału ze Storage: ' + dlErr.message);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const file = { name: doc.file_name, mimeType: doc.mime_type, size: doc.size_bytes, bytes };

    const { blocks, pageCount, usunietePaginy, niepewneRodziny } = await extractBlocks(file, config.chunk);
    const { extractedText, chunks } = chunkBlocks(blocks, config.chunk);

    await client.from('rag_chunks').delete().eq('document_id', documentId);
    const rows = chunks.map((c) => ({
      document_id: documentId,
      collection_id: doc.collection_id,
      chunk_index: c.chunkIndex,
      content: c.content,
      heading_path: c.headingPath,
      page_from: c.pageFrom,
      page_to: c.pageTo,
      char_start: c.charStart,
      char_end: c.charEnd,
      token_estimate: c.tokenEstimate,
    }));
    if (rows.length) {
      const { error: iErr } = await client.from('rag_chunks').insert(rows);
      if (iErr) throwDb(iErr);
    }
    await client
      .from('rag_documents')
      .update({
        extracted_text: extractedText,
        text_quality: zmierzJakoscTekstu(extractedText),
        char_count: extractedText.length,
        page_count: pageCount,
        chunk_count: rows.length,
        status: 'chunked',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);
    return {
      id: documentId,
      status: 'chunked',
      chunkCount: rows.length,
      rechunked: true,
      usunietePaginy: usunietePaginy || [],
      niepewneRodziny: niepewneRodziny || [],
    };
  }

  // rechunk=false: wyczyść wektory ORAZ współrzędne i sąsiadów (bez tego mapa z Sesji 6
  // trzymałaby punkty w starych miejscach) → status chunked.
  const { error: uErr } = await client
    .from('rag_chunks')
    .update({ embedding: null, coord_x: null, coord_y: null, coord_z: null, neighbors: null })
    .eq('document_id', documentId);
  if (uErr) throwDb(uErr);

  await client
    .from('rag_documents')
    .update({ status: 'chunked', updated_at: new Date().toISOString() })
    .eq('id', documentId);

  const total = await countChunks(client, documentId, false);
  return { id: documentId, status: 'chunked', chunkCount: total, rechunked: false };
}
