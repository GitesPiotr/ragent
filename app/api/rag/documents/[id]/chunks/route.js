// GET /api/rag/documents/[id]/chunks → podgląd fragmentów (heading_path, strony, wycinek).
// Endpoint pomocniczy poza tabelą 10.1 — służy WERYFIKACJI cięcia w UI. Read-only.

import { ok, fail } from '../../../_lib/http.js';
import { listDocumentChunks } from '@/lib/rag/documents.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const chunks = await listDocumentChunks(id);
    return ok({ chunks });
  } catch (err) {
    return fail(err);
  }
}
