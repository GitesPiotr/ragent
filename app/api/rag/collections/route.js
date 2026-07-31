// GET  /api/rag/collections            → listCollections
// POST /api/rag/collections            → createCollection
// Cienka warstwa: walidacja → rdzeń → odpowiedź. service_role żyje tylko po stronie serwera.

import { ok, fail } from '../_lib/http.js';
import { listCollections, createCollection } from '@/lib/rag/collections.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('includeArchived');
    const includeArchived = raw === '1' || raw === 'true';
    const collections = await listCollections({ includeArchived });
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
    const collection = await createCollection(body || {});
    return ok({ collection }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
