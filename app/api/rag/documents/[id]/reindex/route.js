// POST /api/rag/documents/[id]/reindex → reindexDocument.
// Ciało: { rechunk?: boolean }. rechunk=false (domyślnie) czyści wektory+współrzędne → chunked.

import { ok, fail } from '../../../_lib/http.js';
import { reindexDocument } from '@/lib/rag/documents.js';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const rechunk = Boolean(body && body.rechunk);
    const result = await reindexDocument(id, { rechunk });
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
