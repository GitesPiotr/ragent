// POST /api/rag/collections/[id]/search → searchCollection (sekcja 10.1).
// Cienka warstwa: walidacja → rdzeń → odpowiedź. Koperta błędu wg 10.2.
// Odpowiedź: { hits: [...], noResults: boolean } — dokładnie kontrakt z sekcji 9.
//
// Wyszukiwanie embeduje zapytanie, więc WYMAGA Ollamy — jej brak wraca jako
// ollama_unavailable (503), nie jako puste wyniki.

import { ok, fail } from '../../../_lib/http.js';
import { searchCollection } from '@/lib/rag/search.js';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const result = await searchCollection({
      collectionId: id,
      query: body.query,
      topK: body.topK,
      // minScore przekazujemy TYLKO gdy podane — inaczej rdzeń weźmie RAG_MIN_SCORE.
      // Zero jest wartością sensowną (diagnostyka progu), więc sprawdzamy obecność klucza.
      minScore: body.minScore === undefined || body.minScore === null ? undefined : body.minScore,
      documentIds: body.documentIds,
    });

    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
