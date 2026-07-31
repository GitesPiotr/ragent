// GET /api/rag/collections/[id]/concepts → listConcepts
//
// Zwraca WYŁĄCZNIE pojęcia kanoniczne (merged_into is null) — reguła z sekcji 9.
// Bez tego graf w Sesji 9 pokazałby „urlop", „urlopy" i „dni wolne" jako trzy węzły,
// czyli dokładnie te duplikaty, których usunięcie jest celem Sesji 8.

import { ok, fail } from '../../../_lib/http.js';
import { listConcepts } from '@/lib/rag/concepts.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    return ok(await listConcepts(id));
  } catch (err) {
    return fail(err);
  }
}
