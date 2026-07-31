// Rdzeń kolekcji (sekcja 9). Czysty JS, do bazy sięga wyłącznie przez db.js.
// Zero wiedzy o AIDEAS — operuje pojęciem "kolekcja". Sekcja 3 (granica).

import { getSupabaseClient, BUCKET } from './db.js';
import { getConfig } from './config.js';
import { probeModelDim } from './embedding.js';

const TABLE = 'rag_collections';

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Mapowanie wiersza bazy (snake_case) na obiekt API (camelCase).
function mapCollection(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    externalRef: row.external_ref,
    status: row.status,
    embedModel: row.embed_model,
    embedDim: row.embed_dim,
    projection: row.projection,
    conceptsNormalizedAt: row.concepts_normalized_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Błędy bazy → kody z sekcji 10.2. Nieznane traktujemy jako awarię serwera (internal).
function throwDb(error) {
  if (error && error.code === '22P02') {
    throw err('invalid_input', 'Nieprawidłowy identyfikator kolekcji (oczekiwano UUID).');
  }
  throw err('internal', 'Błąd bazy danych: ' + ((error && error.message) || 'nieznany'));
}

// Czysta walidacja wejścia createCollection — wydzielona, żeby dała się testować bez bazy.
export function normalizeCreateInput(input, defaultModel) {
  if (!input || typeof input !== 'object') {
    throw err('invalid_input', 'Brak danych kolekcji.');
  }
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    throw err('invalid_input', 'Nazwa kolekcji jest wymagana.');
  }
  const description =
    input.description === undefined || input.description === null || input.description === ''
      ? null
      : String(input.description);
  const externalRef =
    input.externalRef === undefined || input.externalRef === null || input.externalRef === ''
      ? null
      : String(input.externalRef);
  const model =
    typeof input.embedModel === 'string' && input.embedModel.trim()
      ? input.embedModel.trim()
      : defaultModel;

  return { name, description, externalRef, embedModel: model };
}

// createCollection: embedModel opcjonalny (dziedziczy RAG_EMBED_MODEL); wymiar NIE
// jest podawany ręcznie — sondujemy model i zapisujemy embed_model + embed_dim spójnie.
export async function createCollection(input, deps = {}) {
  const config = getConfig();
  const norm = normalizeCreateInput(input, config.embed.model);

  // Sonda wymiaru z modelu (sekcja 9). Wymaga działającego dostawcy embeddingów.
  const dim = await probeModelDim(norm.embedModel, config.embed);

  const client = deps.client || getSupabaseClient();
  const { data, error } = await client
    .from(TABLE)
    .insert({
      name: norm.name,
      description: norm.description,
      external_ref: norm.externalRef,
      embed_model: norm.embedModel,
      embed_dim: dim,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw err('invalid_input', 'Kolekcja z tym powiązaniem (external_ref) już istnieje.');
    }
    throwDb(error);
  }
  return mapCollection(data);
}

export async function listCollections({ includeArchived = false } = {}, deps = {}) {
  const client = deps.client || getSupabaseClient();
  let query = client.from(TABLE).select('*').order('created_at', { ascending: false });
  if (!includeArchived) {
    query = query.eq('status', 'active');
  }
  const { data, error } = await query;
  if (error) throwDb(error);
  return data.map(mapCollection);
}

export async function getCollection(id, deps = {}) {
  if (!id) throw err('invalid_input', 'Brak identyfikatora kolekcji.');
  const client = deps.client || getSupabaseClient();
  const { data, error } = await client.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throwDb(error);
  if (!data) throw err('not_found', 'Kolekcja nie istnieje.');
  return mapCollection(data);
}

// Integracja z AIDEAS: odszukanie kolekcji po zewnętrznym powiązaniu. Brak → null.
export async function getCollectionByExternalRef(ref, deps = {}) {
  if (!ref) return null;
  const client = deps.client || getSupabaseClient();
  const { data, error } = await client.from(TABLE).select('*').eq('external_ref', ref).maybeSingle();
  if (error) throwDb(error);
  return data ? mapCollection(data) : null;
}

// ensureCollectionByExternalRef USUNIETE (runda 12).
//
// Powstalo w rundzie 5b dla modelu "konto -> jedna kolekcja zakladana
// automatycznie", ktory zostal wycofany: agent WSKAZUJE kolekcje
// (agents.rag_collection_id, migracja 019), a Baza wiedzy i Kreator RAG sa
// dwoma osobnymi narzedziami. Nic tego nie wolalo.
//
// DLACZEGO SKASOWANE, A NIE ZOSTAWIONE "NA WSZELKI WYPADEK": ta funkcja
// TWORZYLA DANE. Wywolana przez pomylke zalozylaby kolekcje z automatu i po
// cichu wrocila do wycofanego modelu — a kolekcje zakladane bez wiedzy
// uzytkownika sa dokladnie tym, co ta zmiana usuwala. Martwy kod, ktory
// pisze do bazy, jest grozniejszy niz jego brak.
//
// getCollectionByExternalRef powyzej ZOSTAJE — to pierwotne API modulu
// (Sesja 2), udokumentowany hak integracyjny, nie pozostalosc po rundzie 5b.

async function setStatus(id, status, deps = {}) {
  if (!id) throw err('invalid_input', 'Brak identyfikatora kolekcji.');
  const client = deps.client || getSupabaseClient();
  const { data, error } = await client
    .from(TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throwDb(error);
  if (!data) throw err('not_found', 'Kolekcja nie istnieje.');
  return mapCollection(data);
}

export function archiveCollection(id, deps = {}) {
  return setStatus(id, 'archived', deps);
}

export function restoreCollection(id, deps = {}) {
  return setStatus(id, 'active', deps);
}

// Storage.list() NIE jest rekurencyjne — zwraca jedną warstwę katalogu. Struktura
// klucza to {collectionId}/{documentId}/{nazwa} (patrz 10.a.3), więc obchodzimy ją
// sami. Wpis z polem `id` to obiekt, wpis bez `id` to prefiks (katalog).
const STORAGE_STRONA = 100;

async function wypiszPrefiks(client, prefiks) {
  const out = [];
  for (let offset = 0; ; offset += STORAGE_STRONA) {
    const { data, error } = await client.storage
      .from(BUCKET)
      .list(prefiks, { limit: STORAGE_STRONA, offset });
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < STORAGE_STRONA) break;
  }
  return out;
}

// Klucze do skasowania razem z kolekcją. Bierzemy SUMĘ dwóch źródeł, bo każde
// samo w sobie ma dziurę:
//  • file_path z rag_documents — nie obejmuje obiektów, których wiersz już zniknął
//    (np. po wcześniejszym nieudanym usuwaniu),
//  • obchód prefiksu w Storage — nie obejmuje dokumentu, którego file_path wskazuje
//    gdzieś poza {collectionId}/ (nie powinno się zdarzać, ale kosztuje nas to jedno
//    zapytanie, a cichy plik-widmo kosztowałby więcej).
export async function kluczeStorageKolekcji(client, collectionId) {
  const klucze = new Set();

  const { data: docs } = await client
    .from('rag_documents')
    .select('file_path')
    .eq('collection_id', collectionId);
  for (const d of docs || []) if (d.file_path) klucze.add(d.file_path);

  // Obchód prefiksu jest best-effort: gdy Storage nie odpowiada, kasowanie kolekcji
  // i tak ma się udać — inaczej awaria Storage blokowałaby porządki w bazie.
  try {
    for (const dokument of await wypiszPrefiks(client, collectionId)) {
      if (dokument.id) { klucze.add(`${collectionId}/${dokument.name}`); continue; }
      for (const plik of await wypiszPrefiks(client, `${collectionId}/${dokument.name}`)) {
        if (plik.id) klucze.add(`${collectionId}/${dokument.name}/${plik.name}`);
      }
    }
  } catch {
    /* zostaje to, co dała baza */
  }

  return [...klucze];
}

export async function deleteCollection(id, deps = {}) {
  if (!id) throw err('invalid_input', 'Brak identyfikatora kolekcji.');
  const client = deps.client || getSupabaseClient();

  // Klucze MUSZĄ być zebrane PRZED usunięciem wiersza: kaskada FK kasuje
  // rag_documents, a razem z nimi jedyny zapis o tym, gdzie leżą pliki.
  const klucze = await kluczeStorageKolekcji(client, id);

  // Kaskada FK w bazie usuwa rag_chunks / rag_documents / rag_concepts.
  const { error, count } = await client.from(TABLE).delete({ count: 'exact' }).eq('id', id);
  if (error) throwDb(error);
  if (!count) throw err('not_found', 'Kolekcja nie istnieje.');

  // Sprzątanie Storage jest NIEBLOKUJĄCE — tak samo jak w deleteDocument. Wiersz już
  // zniknął, więc błąd Storage nie może wywrócić operacji. Ale w odróżnieniu od
  // pojedynczego dokumentu RAPORTUJEMY wynik: przy kolekcji na kilkaset plików cicha
  // porażka to dokładnie ten wyciek, który ta zmiana ma zlikwidować.
  let usuniete = 0;
  let nieusuniete = 0;
  for (let i = 0; i < klucze.length; i += STORAGE_STRONA) {
    const partia = klucze.slice(i, i + STORAGE_STRONA);
    try {
      const { error: sErr } = await client.storage.from(BUCKET).remove(partia);
      if (sErr) nieusuniete += partia.length;
      else usuniete += partia.length;
    } catch {
      nieusuniete += partia.length;
    }
  }

  return { id, deleted: true, plikowUsunietych: usuniete, plikowNieusunietych: nieusuniete };
}
