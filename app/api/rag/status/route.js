// Cienki endpoint diagnostyczny: bez logiki, tylko wywołanie rdzenia i odpowiedź.
// Klucz service_role żyje wyłącznie tutaj i w rdzeniu — nigdy w kliencie.

import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/rag/status.js';

// Diagnostyka musi pokazywać stan bieżący — bez cache'owania.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // getStatus() z założenia nie rzuca: stany poszczególnych podsystemów
    // (no_key, ollama_unavailable) są zaszyte w danych, nie w kopercie błędu —
    // dzięki temu jeden niedziałający element nie wywraca całej odpowiedzi.
    const data = await getStatus();
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
