// Cienki endpoint diagnostyczny: bez logiki, tylko wywołanie rdzenia i odpowiedź.
//
// Diagnostyka idzie klientem z SESJĄ, jak wszystkie pozostałe trasy — inaczej
// pokazywałaby stan bazy widziany kluczem service_role, czyli nie ten, w którym
// aplikacja naprawdę pracuje. rag_diag jest jedyną funkcją SECURITY DEFINER
// w module i supabase/016_rls_rag.sql nadaje jej execute dla roli authenticated
// właśnie po to, żeby ta trasa działała po przełączeniu.

import { NextResponse } from 'next/server';
import { klientSesji } from '../_lib/klientSesji.js';
import { getStatus } from '@/lib/rag/status.js';

// Diagnostyka musi pokazywać stan bieżący — bez cache'owania.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // getStatus() z założenia nie rzuca: stany poszczególnych podsystemów
    // (no_key, ollama_unavailable) są zaszyte w danych, nie w kopercie błędu —
    // dzięki temu jeden niedziałający element nie wywraca całej odpowiedzi.
    const data = await getStatus({ client: await klientSesji() });
    return NextResponse.json(data);
  } catch (err) {
    // Siatka bezpieczeństwa na wypadek nieprzewidzianej awarii samego endpointu.
    // Koperta wg sekcji 10.2: { error: { code, message } }, komunikat po polsku.
    return NextResponse.json(
      {
        error: {
          code: 'invalid_input',
          message: 'Nie udało się wykonać diagnostyki: ' + (err && err.message ? err.message : 'nieznany błąd.'),
        },
      },
      { status: 500 }
    );
  }
}
