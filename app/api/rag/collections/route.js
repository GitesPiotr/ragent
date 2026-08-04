// GET  /api/rag/collections            → listCollections
// POST /api/rag/collections            → createCollection
// Cienka warstwa: walidacja → rdzeń → odpowiedź. Klient z sesją użytkownika idzie
// do rdzenia przez deps.client — bez tego RLS nie miałby czego pilnować (klientSesji.js).

import { ok, fail } from '../_lib/http.js';
import { klientSesji } from '../_lib/klientSesji.js';
import { listCollections, createCollection } from '@/lib/rag/collections.js';
import {
  znajdzModelEmbeddingow,
  dozwoloneParyOpis,
  DOMYSLNY_MODEL_EMBEDDINGOW,
} from '@/lib/config/modeleEmbeddingow.js';

export const dynamic = 'force-dynamic';

// =============================================================================
//  WALIDACJA PARY (dostawca, model) — SERWER NIE UFA CIAŁU ŻĄDANIA
//
//  Wzorzec z lib/settings/serverSettings.js:2. Tu waga jest większa niż zwykle,
//  bo wybór jest NIEODWRACALNY I NAPĘDZAJĄCY: od rundy 3 para zapisana
//  w kolekcji decyduje, czym ta kolekcja jest indeksowana i przeszukiwana
//  (lib/rag/embedding.js, `embedConfigDlaKolekcji`). To JEDYNE miejsce, w którym
//  oferta aplikacji ma szansę zadziałać — rdzeń jej nie zna i znać nie ma
//  (sekcja 3 SPEC), a po zapisie nikt pary już nie zweryfikuje wobec listy.
//  Przepuszczenie pary spoza oferty dałoby kolekcję z dostawcą bez
//  implementacji, a awaria wyszłaby dopiero po zaindeksowaniu dokumentów.
//
//  BRAK WYBORU TO NIE BŁĄD, tylko domyślka: żądania sprzed rundy 2 (i te
//  z innych miejsc kodu) nie znają tych pól, a mają dalej działać.
// =============================================================================
function paraEmbeddingow(body) {
  const podanoCokolwiek =
    (body && body.embedProvider != null && body.embedProvider !== '') ||
    (body && body.embedModel != null && body.embedModel !== '');

  if (!podanoCokolwiek) {
    return {
      embedProvider: DOMYSLNY_MODEL_EMBEDDINGOW.provider,
      embedModel: DOMYSLNY_MODEL_EMBEDDINGOW.model,
    };
  }

  const wybrany = znajdzModelEmbeddingow(body.embedProvider, body.embedModel);
  if (!wybrany) {
    const e = new Error(
      `Nieobsługiwana para dostawca+model embeddingów: ` +
        `"${body.embedProvider ?? '(brak)'}" + "${body.embedModel ?? '(brak)'}". ` +
        `Dozwolone: ${dozwoloneParyOpis()}.`
    );
    e.code = 'invalid_input';
    throw e;
  }
  return { embedProvider: wybrany.provider, embedModel: wybrany.model };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('includeArchived');
    const includeArchived = raw === '1' || raw === 'true';
    const client = await klientSesji();
    const collections = await listCollections({ includeArchived }, { client });
    return ok({ collections });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      const e = new Error('Nieprawidłowe dane żądania (oczekiwano JSON).');
      e.code = 'invalid_input';
      throw e;
    }
    const client = await klientSesji();
    // Para NADPISUJE to, co przyszło w ciele — rdzeń dostaje wyłącznie
    // wartości przepuszczone przez walidację, nigdy surowe.
    const collection = await createCollection(
      { ...(body || {}), ...paraEmbeddingow(body || {}) },
      { client },
    );
    return ok({ collection }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
