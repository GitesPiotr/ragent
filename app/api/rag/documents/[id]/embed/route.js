// POST /api/rag/documents/[id]/embed → embedNextBatch — liczy JEDNĄ partię.
// GET  /api/rag/documents/[id]/embed → sam odczyt postępu, BEZ liczenia czegokolwiek.
// Oba zwracają { done, total, finished }. Ollama niedostępna → ollama_unavailable (503).

import { ok, fail } from '../../../_lib/http.js';
import { embedNextBatch, getEmbedProgress } from '@/lib/rag/documents.js';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const result = await embedNextBatch(id);
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
    const result = await getEmbedProgress(id);
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
