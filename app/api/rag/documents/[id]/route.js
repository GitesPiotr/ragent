// DELETE /api/rag/documents/[id] → deleteDocument (kaskada fragmentów + sprzątanie Storage)

import { ok, fail } from '../../_lib/http.js';
import { klientSesji } from '../../_lib/klientSesji.js';
import { deleteDocument } from '@/lib/rag/documents.js';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const result = await deleteDocument(id, { client: await klientSesji() });
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
