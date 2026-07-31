// GET /api/rag/collections/[id]/concepts/[conceptId]/chunks → searchByConcept
//
// Zwraca { chunks, total }, gdzie `total` to liczba WSZYSTKICH fragmentów pojęcia,
// nie zwróconych. UI pokazuje „pokazano 30 z 312" (12.9) — nie udajemy, że to
// wszystko. Domyślny limit 30: popularne pojęcie miewa 300+ fragmentów.

import { ok, fail } from '../../../../../_lib/http.js';
import { klientSesji } from '../../../../../_lib/klientSesji.js';
import { searchByConcept } from '@/lib/rag/concepts.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id, conceptId } = await params;
    const limit = Number(new URL(request.url).searchParams.get('limit')) || 30;
    return ok(
      await searchByConcept({ collectionId: id, conceptId, limit }, { client: await klientSesji() })
    );
  } catch (err) {
    return fail(err);
  }
}
