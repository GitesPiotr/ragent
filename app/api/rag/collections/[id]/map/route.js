// GET /api/rag/collections/[id]/map → getMapData (sekcja 10.1).
// Sam ODCZYT: ten endpoint nigdy nie buduje bazy rzutowania. Budowa to ~30 s pracy
// i zapis wszystkich fragmentów — GET, który po cichu to robi, byłby zaskoczeniem
// dla wołającego i kłóciłby się z 12.9 (użytkownik ma widzieć realny przebieg).
// Budowa idzie jawnym POST na .../map/build.
//
// ?neighbors=1 dołącza sąsiedztwo 2D — domyślnie POMIJANE, bo przy 1300 fragmentach
// to kilka MB na każde wejście (sekcja 9).

import { ok, fail } from '../../../_lib/http.js';
import { klientSesji } from '../../../_lib/klientSesji.js';
import { getMapData } from '@/lib/rag/map.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const includeNeighbors = url.searchParams.get('neighbors') === '1';
    const data = await getMapData(id, { includeNeighbors }, { client: await klientSesji() });
    return ok(data);
  } catch (err) {
    return fail(err);
  }
}
