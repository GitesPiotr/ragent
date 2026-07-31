// POST /api/rag/collections/[id]/ingest → ingestFile (multipart) — TYLKO ekstrakcja + cięcie.
// Konwersja web File → bajty dzieje się tutaj; rdzeń dostaje czysty obiekt (bez zależności od Web API).

import { ok, fail } from '../../../_lib/http.js';
import { ingestFile } from '@/lib/rag/documents.js';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const { id } = await params;

    let form;
    try {
      form = await request.formData();
    } catch {
      const e = new Error('Oczekiwano danych multipart/form-data z polem "file".');
      e.code = 'invalid_input';
      throw e;
    }

    const file = form.get('file');
    if (!file || typeof file === 'string') {
      const e = new Error('Brak pliku w żądaniu (pole "file").');
      e.code = 'invalid_input';
      throw e;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const document = await ingestFile({
      collectionId: id,
      file: { name: file.name, mimeType: file.type, size: file.size, bytes },
    });
    return ok({ document }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
