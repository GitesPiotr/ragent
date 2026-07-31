// GET    /api/rag/collections/[id]     → getCollection
// PATCH  /api/rag/collections/[id]     → archiveCollection / restoreCollection
// DELETE /api/rag/collections/[id]     → deleteCollection
// W Next 15 params jest asynchroniczne — stąd await params.

import { ok, fail } from '../../_lib/http.js';
import {
  getCollection,
  archiveCollection,
  restoreCollection,
  deleteCollection,
} from '@/lib/rag/collections.js';
import { czyNormalizacjaOczekuje } from '@/lib/rag/normalize-concepts.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const collection = await getCollection(id);
    // Stan pośredni potoku dociągnięty TAM, GDZIE POWSTAJE PRZYCZYNA — na ekranie,
    // z którego wgrywa się dokumenty. Napis w grafie chroni tego, kto patrzy na graf;
    // nie chroni tego, kto wgrywa plik i idzie dalej, a to on właśnie zostawia pojęcia
    // niescalone. Dwa odczyty head-count, bez transferu wierszy.
    const normalizacjaOczekuje = await czyNormalizacjaOczekuje(id, {
      concepts_normalized_at: collection.conceptsNormalizedAt,
    });
    return ok({ collection: { ...collection, normalizacjaOczekuje } });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    // Sekcja 9 przewiduje archiveCollection / restoreCollection — bez ogólnego update.
    const action = body && body.action;
    let collection;
    if (action === 'archive' || (body && body.status === 'archived')) {
      collection = await archiveCollection(id);
    } else if (action === 'restore' || (body && body.status === 'active')) {
      collection = await restoreCollection(id);
    } else {
      const e = new Error('Nieobsługiwana zmiana. Użyj action: "archive" albo "restore".');
      e.code = 'invalid_input';
      throw e;
    }
    return ok({ collection });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const result = await deleteCollection(id);
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
