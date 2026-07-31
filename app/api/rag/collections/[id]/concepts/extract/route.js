// POST /api/rag/collections/[id]/concepts/extract → extractConceptsForDocument
//
// documentId W CIELE ŻĄDANIA (sekcja 10), nie w ścieżce: wyciąganie pojęć jest
// operacją NA KOLEKCJI, wykonywaną dokument po dokumencie.
//
// Liczy JEDNĄ PARTIĘ i zwraca { done, total, finished } — ten sam kontrakt co
// /embed. Klient woła w pętli; przerwanie w dowolnym momencie niczego nie psuje,
// bo stan siedzi wyłącznie w bazie (10.3).
//
// GET /api/rag/collections/[id]/concepts/extract?documentId=… → SAM ODCZYT postępu,
// bez wołania modelu. Dokładnie ta sama para metod co na /embed w Sesji 4, i z tego
// samego powodu: pasek musi znać mianownik ZANIM przyjdzie pierwsza partia (przy
// Kodeksie to 44 sekundy) i musi przeżyć przeładowanie strony. Odczyt jest odczytem,
// więc idzie GET-em — nie POST-em z pustą partią.

import { ok, fail } from '../../../../_lib/http.js';
import { extractConceptsForDocument } from '@/lib/rag/concepts.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const documentId = new URL(request.url).searchParams.get('documentId');
    if (!documentId) {
      const e = new Error('Brak documentId w adresie.');
      e.code = 'invalid_input';
      throw e;
    }
    // batch: 0 — ta sama ścieżka co wyciąganie, tylko bez partii do przerobienia.
    // Dzięki temu `total` liczy się w JEDNYM miejscu i nie ma jak się rozjechać.
    return ok(await extractConceptsForDocument(documentId, { collectionId: id, batch: 0 }));
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const documentId = body && body.documentId;
    if (!documentId) {
      const e = new Error('Brak documentId w ciele żądania.');
      e.code = 'invalid_input';
      throw e;
    }
    return ok(await extractConceptsForDocument(documentId, { collectionId: id }));
  } catch (err) {
    return fail(err);
  }
}
