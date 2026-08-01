// Klient Supabase z SESJĄ zalogowanego użytkownika — jedyne źródło klienta dla tras
// w app/api/rag/. Folder z prefiksem "_" jest prywatny w App Routerze (nie tworzy trasy).
//
// =============================================================================
//  PO CO TO ISTNIEJE
//
//  Rdzeń w lib/rag/ domyślnie sięga po klienta na kluczu service_role
//  (lib/rag/db.js). service_role ma BYPASSRLS, więc dopóki zapytania szły tym
//  kluczem, polityki z supabase/016_rls_rag.sql nie miały czego pilnować —
//  każde konto widziałoby kolekcje, dokumenty i zapytania wszystkich pozostałych.
//
//  Trasy wołają więc klientSesji() i wstrzykują wynik do rdzenia przez deps.client.
//  Klient stoi na kluczu ANON + ciasteczku sesji, więc baza zna tożsamość pytającego
//  i dokłada do każdego zapytania warunek owner_id = auth.uid().
//
//  TO JEST CAŁA IZOLACJA W TYM MODULE. Trasa, która pominie ten helper i pozwoli
//  rdzeniowi wziąć klienta domyślnego, wraca do stanu sprzed rundy 3b — po cichu,
//  bo działać będzie tak samo, tylko bez granicy między kontami.
//
//  CZEGO TU NIE MA: sprawdzania, czy użytkownik jest zalogowany. Robi to proxy.js
//  (matcher łapie /api/*, brak sesji → 401 JSON), a dublowanie tej kontroli w 17
//  trasach dałoby 17 miejsc do rozjechania się z jednym miejscem prawdy.
// =============================================================================

import { createClient } from '@/lib/supabase/server';

export async function klientSesji() {
  const client = await createClient();

  // createClient() zwraca null, gdy brakuje NEXT_PUBLIC_SUPABASE_URL albo
  // NEXT_PUBLIC_SUPABASE_ANON_KEY. Kod no_key mapuje się w http.js na 503
  // — konfiguracja to nie jest błąd żądania, więc 4xx byłoby mylące.
  if (!client) {
    const e = new Error(
      'Supabase nie jest skonfigurowane. Uzupełnij NEXT_PUBLIC_SUPABASE_URL i NEXT_PUBLIC_SUPABASE_ANON_KEY w .env.local.'
    );
    e.code = 'no_key';
    throw e;
  }

  return client;
}
