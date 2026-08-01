// GET  /api/rag/collections            → listCollections
// POST /api/rag/collections            → createCollection
// Cienka warstwa: walidacja → rdzeń → odpowiedź. Klient z sesją użytkownika idzie
// do rdzenia przez deps.client — bez tego RLS nie miałby czego pilnować (klientSesji.js).

import { ok, fail } from '../_lib/http.js';
import { klientSesji } from '../_lib/klientSesji.js';
import { listCollections, createCollection } from '@/lib/rag/collections.js';

export const dynamic = 'force-dynamic';

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
    const collection = await createCollection(body || {}, { client });
    return ok({ collection }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
