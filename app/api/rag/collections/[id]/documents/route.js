// GET /api/rag/collections/[id]/documents → listDocuments

import { ok, fail } from '../../../_lib/http.js';
import { klientSesji } from '../../../_lib/klientSesji.js';
import { listDocuments } from '@/lib/rag/documents.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const klient = await klientSesji();
    const documents = await listDocuments(id, { client: klient });

    // =============================================================================
    //  builtAt PRZY LIŚCIE DOKUMENTÓW — KANAŁ, KTÓRY NIE ZAMYKA SIĘ Z INDEKSOWANIEM
    //
    //  Mapa dowiadywała się o przeliczeniu bazy wyłącznie z `GET /embed`, a ten jest
    //  odpytywany tylko dopóki `indeksujeSie`. Przeliczenie zachodzi natomiast
    //  DOKŁADNIE w chwili, gdy indeksowanie się kończy — więc jedyny kanał zamykał
    //  się w tej samej sekundzie, w której miał coś przynieść. Zmierzone: serwer
    //  przeliczył bazę w 66,2 s, okno zauważyło to w 103,4 s (37,2 s później),
    //  i to nie dzięki `builtAt`, tylko przypadkiem — przez domknięcie po pulsie.
    //
    //  Ta lista jest pobierana pulsem BEZWARUNKOWYM (jego brama to `osadzona ||
    //  postepTutaj`, bez `indeksujeSie`), więc chodzi także po zakończeniu.
    //  Dokładamy `builtAt` tutaj i wykrywanie przestaje zależeć od stanu, który
    //  samo ma opisywać. ZERO nowych żądań — pole dosiada się do istniejącego.
    //
    //  `->>` wyciąga samo pole tekstowe; `GET /collections/{id}` zwróciłby całą bazę
    //  rzutowania (`mean` + `components`, ponad cztery tysiące liczb).
    let builtAt = null;
    try {
      const { data: coll } = await klient
        .from('rag_collections')
        .select('projection->>builtAt')
        .eq('id', id)
        .single();
      if (coll) builtAt = coll.builtAt ?? null;
    } catch {
      // Lista dokumentów nie ma prawa paść przez odczyt pomocniczy.
    }

    return ok({ documents, builtAt });
  } catch (err) {
    return fail(err);
  }
}
