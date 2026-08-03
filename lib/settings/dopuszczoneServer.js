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
import { przypisaniaDoOdpowiedzi } from "@/lib/settings/modeleKonta";

export async function wczytajDopuszczone() {
  return (await wczytajModeleKonta()).dopuszczone;
}

// Lista dopuszczonych ORAZ przypisania — JEDNYM przejściem.
//
// Obie rzeczy naraz, bo obie potrzebują tej samej sesji i tego samego klienta,
// a wołający potrzebuje ich razem: trasa mentora waliduje model względem listy
// i jednocześnie czyta przypisaną rolę. Dwa osobne wywołania to dwa razy
// `getUser()` i okno, w którym jedno widzi stan sprzed zapisu, a drugie po.
//
// `przypisania` to obiekt trzech ról (wartości albo null), NIGDY null jako
// całość — brak wiersza w bazie znaczy „konto nic nie przypisało", czyli trzy
// nulle, a to stan poprawny. `dopuszczone` przeciwnie: null znaczy „nie wiem"
// (brak sesji, brak tabel), bo od tego zależy, czy wolno cokolwiek orzekać.
export async function wczytajModeleKonta() {
  const puste = { dopuszczone: null, przypisania: przypisaniaDoOdpowiedzi(null) };
  try {
    const supabase = await createClient();
    if (!supabase) return puste;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return puste;

    const [lista, wiersz] = await Promise.all([
      supabase
        .from("allowed_models")
        .select("provider, model_id, label")
        .order("provider")
        .order("model_id"),
      supabase.from("model_assignments").select("*").maybeSingle(),
    ]);

    // Brak tabel (migracja 020 nieuruchomiona) też jest „nie wiem", a nie
    // „konto nic nie ma" — inaczej mentor zacząłby po cichu proponować modele
    // z listy domyślnej jako jedyne dostępne.
    if (lista.error) return puste;

    return {
      dopuszczone: lista.data || [],
      // maybeSingle: konto, które nigdy nic nie zapisało, NIE MA wiersza
      // przypisań i to jest stan poprawny, a nie błąd (tak samo jak w GET
      // /api/settings/models).
      przypisania: przypisaniaDoOdpowiedzi(wiersz.error ? null : wiersz.data),
    };
  } catch {
    return puste;
  }
}
