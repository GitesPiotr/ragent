// Lista modeli dopuszczonych przez konto — ODCZYT PO STRONIE SERWERA.
//
// Bliźniak GET-u z app/api/settings/models/route.js, ale wołany bezpośrednio
// przez inne trasy (dziś: mentor). Trasa nie może odpytać samej siebie
// HTTP-em — nie miałaby jak przekazać ciasteczka sesji, a i tak byłoby to
// żądanie sieciowe do własnego procesu po dane, które leżą jedno zapytanie dalej.
//
// TOŻSAMOŚĆ WYŁĄCZNIE Z SESJI, tak samo jak w tamtej trasie: żadnego owner_id
// z ciała żądania, filtrowanie robi RLS z migracji 020.
//
// ZWRACA null, GDY NIE DA SIĘ USTALIĆ (brak Supabase, brak sesji, brak tabel).
// Nie pustą tablicę — bo pusta znaczy „konto świadomie nic nie wybrało"
// i włącza fallback na MODELS_BY_PROVIDER, a to zupełnie inna decyzja niż
// „nie wiemy". Ten sam wzorzec co przy niedostępnych modelach w rundzie 5.
import { createClient } from "@/lib/supabase/server";

export async function wczytajDopuszczone() {
  try {
    const supabase = await createClient();
    if (!supabase) return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("allowed_models")
      .select("provider, model_id, label")
      .order("provider")
      .order("model_id");

    // Brak tabel (migracja 020 nieuruchomiona) też jest „nie wiem", a nie
    // „konto nic nie ma" — inaczej mentor zacząłby po cichu proponować modele
    // z listy domyślnej jako jedyne dostępne.
    if (error) return null;
    return data || [];
  } catch {
    return null;
  }
}
