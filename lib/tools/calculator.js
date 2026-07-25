import { evaluate } from "mathjs";

// Narzedzie: kalkulator.
// Kazde narzedzie ma: id/name, description i input_schema (dla modelu)
// oraz funkcje execute (wykonywana po stronie serwera).
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
