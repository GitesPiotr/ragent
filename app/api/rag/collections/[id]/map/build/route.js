// POST /api/rag/collections/[id]/map/build → buildCollectionProjection.
//
// Jawna budowa/przeliczenie bazy rzutowania. Osobny endpoint od GET /map, bo to
// operacja PISZĄCA i długa (przy 1300 fragmentach ~30 s: odczyt wektorów, PCA,
// sąsiedzi, zapis współrzędnych wszystkich fragmentów).
//
// Obsługuje dwa przypadki z 12.4:
//   - kolekcja ma wektory, ale nie ma bazy (np. zaindeksowana przed Sesją 6),
//   - świadome przeliczenie bazy, gdy dane urosły.
// Normalna ścieżka dla nowych kolekcji zostaje w embedNextBatch (finished: true).

import { ok, fail } from '../../../../_lib/http.js';
import { buildCollectionProjection } from '@/lib/rag/map.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const result = await buildCollectionProjection(id);
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
