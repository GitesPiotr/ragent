// GET /api/rag/collections/[id]/documents → listDocuments

import { ok, fail } from '../../../_lib/http.js';
import { listDocuments } from '@/lib/rag/documents.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const documents = await listDocuments(id);
    return ok({ documents });
  } catch (err) {
    return fail(err);
  }
}
