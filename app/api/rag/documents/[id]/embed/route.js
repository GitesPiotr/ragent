// POST /api/rag/documents/[id]/embed → embedNextBatch — liczy JEDNĄ partię.
// GET  /api/rag/documents/[id]/embed → sam odczyt postępu, BEZ liczenia czegokolwiek.
// Oba zwracają { done, total, finished }. Ollama niedostępna → ollama_unavailable (503).

import { ok, fail } from '../../../_lib/http.js';
import { klientSesji } from '../../../_lib/klientSesji.js';
import { embedNextBatch, getEmbedProgress } from '@/lib/rag/documents.js';

export const dynamic = 'force-dynamic';

// LIMIT CZASU TAKI SAM JAK PRZY RECZNYM PRZELICZENIU — i to jest naprawa, nie ozdoba.
//
// Ostatnia partia dokumentu robi WIECEJ niz policzenie wektorow: po niej idzie
// refreshProjectionAfterIndexing, czyli pelne PCA calej kolekcji plus zapis
// wspolrzednych. Zmierzone lokalnie na 560 fragmentach: sama ta partia trwala 9,1 s.
// /map/build (przycisk „Przelicz mape") deklaruje maxDuration = 300, a ta trasa
// nie deklarowala nic — czyli automatyczne przeliczenie dostawalo domyslny limit
// platformy (na Vercel 10-15 s), a reczne piec minut. Przy kilkuset fragmentach
// automat konczyl sie ubiciem funkcji PO zapisaniu statusu `ready`, wiec `finished`
// nigdy juz nie wracalo i baza zostawala nieaktualna na zawsze.
export const maxDuration = 300;

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const result = await embedNextBatch(id, { client: await klientSesji() });
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

// Klient woła to PRZED pętlą indeksowania, żeby pasek startował od stanu bazy
// (np. 4/7 po przerwaniu), a nie od 0/0.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const result = await getEmbedProgress(id, { client: await klientSesji() });
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
