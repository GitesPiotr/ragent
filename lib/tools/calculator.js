import { evaluate } from "mathjs";

// Narzedzie: kalkulator.
// Kazde narzedzie ma: id/name, description i input_schema (dla modelu)
// oraz funkcje execute (wykonywana po stronie serwera).
//
// =============================================================================
//  KONTRAKT execute(input, ctx) — WZORZEC DLA NOWYCH NARZEDZI
//
//  Kalkulator ctx-u NIE UZYWA (liczy z samego wejscia) i wlasnie dlatego opis
//  stoi tutaj: to najkrotsze narzedzie w projekcie, wiec czyta sie je jako
//  szablon. Kazde execute dostaje DWA argumenty:
//
//    input — argumenty od modelu, wg input_schema powyzej. NIEZAUFANE:
//            model potrafi zmyslic pole albo typ. Sprawdzaj, zanim uzyjesz.
//
//    ctx   — kontekst zadania, skladany w app/api/chat/route.js i przepuszczany
//            przez lib/providers/index.js do wszystkich trzech dostawcow:
//
//      ctx.user    { id, email } — Z SESJI, zweryfikowane przez getUser().
//                  JEDYNE pole, na ktorym wolno oprzec decyzje o dostepie
//                  do danych. Zawsze obecne w rozmowie z agentem.
//
//      ctx.agent   caly obiekt agenta — OD KLIENTA, NIEZAUFANY. Przychodzi
//                  w ciele POST i nikt go nie porownuje z baza; da sie podmienic
//                  knowledge_file_ids, tools, a nawet id. Wolno go uzywac
//                  WYLACZNIE do wyboru PODZBIORU tego, co uzytkownik i tak ma
//                  prawo zobaczyc. NIGDY do autoryzacji.
//                  UWAGA: przy rozmowie z GOLYM MODELEM (app/czaty/page.js,
//                  modelRunner) ten obiekt NIE MA POLA `id`. Nie zakladaj,
//                  ze istnieje — czytaj przez ctx.agent?.id.
//
//      ctx.db      klient Supabase Z SESJA uzytkownika (klucz anon + ciasteczko),
//                  tworzony raz w trasie. Narzedzie, ktore czyta dane konta,
//                  MUSI uzyc wlasnie jego — wtedy RLS dokleja owner_id =
//                  auth.uid() i izolacja stoi na bazie. NIE wolno zjezdzac
//                  na domyslnego klienta rdzenia (service_role, BYPASSRLS).
//                  Nie da sie go zbudowac w narzedziu: cookies() z next/headers
//                  dziala tylko w kontekscie zadania, a narzedzia wykonuja sie
//                  w petli tool-use, juz po zwroceniu strumienia.
//
//      ctx.sources tablica { url, title } — kanal do UI. Narzedzie DOPISUJE
//                  (push), nigdy nie podmienia calej tablicy: dostawca trzyma
//                  do niej referencje i podmiana zerwalaby polaczenie.
//
//  ctx BYWA NIEPELNY. Wolania spoza trasy czatu (np. app/api/mentor/route.js)
//  ida z domyslka { sources: [] }, wiec ctx.user i ctx.agent moga nie istniec.
//  Narzedzie, ktore ich potrzebuje, ma zwrocic CZYTELNY TEKST BLEDU dla modelu,
//  a nie rzucic wyjatkiem — executeTool i tak zamieni wyjatek na tekst, ale
//  wlasny komunikat powie modelowi, co poszlo nie tak.
// =============================================================================
export const calculator = {
  id: "calculator",
  name: "calculator",
  description:
    "Oblicza wynik wyrażenia matematycznego. Używaj do WSZELKICH obliczeń liczbowych " +
    "(mnożenie, dzielenie, potęgi, pierwiastki, procenty). Przykłady wyrażeń: " +
    "'3847 * 291', 'sqrt(144) + 10', '(2+3)^4'.",
  input_schema: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description:
          "Wyrażenie matematyczne do obliczenia, np. '3847 * 291'. " +
          "Używaj notacji zrozumiałej dla parsera mathjs.",
      },
    },
    required: ["expression"],
  },
  // WAZNE: liczymy przez mathjs.evaluate (bezpieczny parser), NIE przez eval.
  execute({ expression }) {
    if (!expression || typeof expression !== "string") {
      return "Błąd: nie podano wyrażenia do obliczenia.";
    }
    const result = evaluate(expression);
    return String(result);
  },
};
