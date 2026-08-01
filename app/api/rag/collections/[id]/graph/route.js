// GET /api/rag/collections/[id]/graph → getGraphData (sekcja 10.1, Sesja 9).
//
// Sam ODCZYT. Odpowiedź to dziesiątki węzłów, nie tysiące: fragmenty dociąga dopiero
// .../concepts/[conceptId]/chunks po kliknięciu pojęcia. Rozstrzygnięcie skali opisuje
// komentarz w lib/rag/graph.js.
//
// PARAMETRY (Sesja 10):
//   ?minMentions=N  — próg wystąpień; mosty go omijają. Brak parametru = wszystko.
//   ?tylkoMosty=1   — wyłącznie pojęcia sięgające ≥2 dokumentów.
//
// Filtr jest PARAMETREM ODCZYTU, nie nowym zasobem: to nadal „graf tej kolekcji",
// tylko rzadszy. Domyślna wartość progu siedzi w widoku, nie tutaj — trasa oddaje to,
// o co ją poproszono, a rdzeń nie zgaduje, co się komu ładnie rysuje.

import { ok, fail } from '../../../_lib/http.js';
import { klientSesji } from '../../../_lib/klientSesji.js';
import { getGraphData } from '@/lib/rag/graph.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const q = new URL(request.url).searchParams;
    const surowy = q.get('minMentions');
    // Brak parametru i pusty parametr znaczą „bez progu". Wartość niepustą oddajemy
    // rdzeniowi BEZ oczyszczania — walidacja jest jedna, w getGraphData, żeby
    // „?minMentions=abc" nie zamieniło się po cichu w domyślną jedynkę.
    return ok(
      await getGraphData(id, {
        client: await klientSesji(),
        ...(surowy === null || surowy === '' ? {} : { minMentions: surowy }),
        tylkoMosty: q.get('tylkoMosty') === '1',
      })
    );
  } catch (err) {
    return fail(err);
  }
}
