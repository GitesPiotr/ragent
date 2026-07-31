// POST /api/rag/collections/[id]/concepts/normalize → normalizeConcepts
//
// Zwraca { merged: [{from, into, powod}], conceptCount }. DoD Sesji 8 wymaga,
// żeby DRUGIE uruchomienie zwróciło pustą listę scaleń — idempotencja siedzi
// w rdzeniu (pomijamy pojęcia, które już mają merged_into), nie tutaj.

import { ok, fail } from '../../../../_lib/http.js';
import { normalizeConcepts } from '@/lib/rag/normalize-concepts.js';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    return ok(await normalizeConcepts(id));
  } catch (err) {
    return fail(err);
  }
}
