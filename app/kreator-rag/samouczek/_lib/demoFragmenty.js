// DANE DEMO CIĘCIA — ten sam regulamin zapisany dwa razy.
//
// TREŚĆ JEST WYMYŚLONA i taka ma zostać. To nie jest zrzut z prawdziwego
// dokumentu ani wynik prawdziwego wyszukiwania — to ilustracja jednej różnicy:
// co się dzieje, gdy zdanie zostanie przecięte na granicy fragmentu, a co, gdy
// dokument ma nagłówki. Kwoty, symbole formularzy i numery paragrafów są
// zmyślone.
//
// Zero DOM, zero Reacta — dzięki temu dane dają się przetestować, a komponent
// zostaje samą warstwą wyświetlania.
//
// WYRÓŻNIENIE JAKO TEKST, NIE JAKO ZNACZNIK. Prototyp trzymał w treści <mark>,
// co w Reakcie wymagałoby wstrzykiwania HTML-a. Zamiast tego fragment podaje
// `wyroznij` — dosłowny wycinek własnego tekstu, który komponent sam owija.
// Test pilnuje, żeby ten wycinek naprawdę w tekście występował: literówka
// zamieniłaby wyróżnienie w ciche nic.

export const WERSJE = ["zle", "dobrze"];

export const DEMO = {
  // Dokument bez nagłówków, cięty po długości. Zdania przechodzą przez granicę
  // fragmentu — i to jest cała pointa tej wersji.
  zle: {
    fragmenty: [
      {
        tekst:
          "Regulamin pracy zdalnej obowiązuje wszystkich pracowników zatrudnionych na umowę o pracę. " +
          "Pracownik może wykonywać pracę zdalnie po uzgodnieniu z bezpośrednim przełożonym, w wymiarze " +
          "nieprzekraczającym trzech dni w tygodniu. Za pracę wykonywaną w sobotę przysługuje",
      },
      {
        tekst:
          "dodatek w wysokości 87 zł za każdy rozpoczęty dzień. W niedzielę oraz w dni ustawowo wolne " +
          "dodatek nie przysługuje. Wniosek o pracę zdalną składa się na formularzu",
      },
      {
        tekst:
          "KW-3 dostępnym w intranecie. Rozpatrzenie wniosku trwa do 4 dni roboczych od daty złożenia " +
          "kompletnych dokumentów.",
      },
    ],
    odp: {
      sobota: {
        trafiony: 0,
        ok: false,
        tytul: "Agent nie znajdzie odpowiedzi",
        tresc:
          "Wyszukiwarka trafiła we fragment ze słowami „w sobotę przysługuje”, ale kwota 87 zł została " +
          "odcięta i wylądowała w następnym fragmencie. Agent widzi pytanie i urwane zdanie — nie ma " +
          "czego odpowiedzieć.",
      },
      formularz: {
        trafiony: 1,
        ok: false,
        tytul: "Agent nie znajdzie odpowiedzi",
        tresc:
          "To samo w drugą stronę: fragment kończy się na „na formularzu”, a symbol KW-3 jest już " +
          "w kolejnym. Cięcie przebiegło w środku zdania.",
      },
    },
  },

  // Ten sam tekst z nagłówkami paragrafów. Fragment pokrywa się z sekcją,
  // a nagłówek dokleja się do niego przy indeksowaniu.
  dobrze: {
    fragmenty: [
      {
        tytul: "§ 17. Zasady ogólne",
        tekst:
          "Regulamin pracy zdalnej obowiązuje wszystkich pracowników zatrudnionych na umowę o pracę. " +
          "Pracownik może wykonywać pracę zdalnie po uzgodnieniu z bezpośrednim przełożonym, w wymiarze " +
          "nieprzekraczającym trzech dni w tygodniu.",
      },
      {
        tytul: "§ 18. Dodatki za pracę w dni wolne",
        tekst:
          "Za pracę wykonywaną w sobotę przysługuje dodatek w wysokości 87 zł za każdy rozpoczęty dzień. " +
          "W niedzielę oraz w dni ustawowo wolne dodatek nie przysługuje.",
        wyroznij: "87 zł",
      },
      {
        tytul: "§ 19. Tryb składania wniosku",
        tekst:
          "Wniosek o pracę zdalną składa się na formularzu KW-3 dostępnym w intranecie. Rozpatrzenie trwa " +
          "do 4 dni roboczych od daty złożenia kompletnych dokumentów.",
        wyroznij: "KW-3",
      },
    ],
    odp: {
      sobota: {
        trafiony: 1,
        ok: true,
        tytul: "Agent odpowie: 87 zł",
        tresc:
          "Fragment zawiera i pytanie, i odpowiedź, i nagłówek „§ 18. Dodatki za pracę w dni wolne”. " +
          "Agent wie, czego dotyczy kwota, i nie pomyli soboty z niedzielą.",
      },
      formularz: {
        trafiony: 2,
        ok: true,
        tytul: "Agent odpowie: formularz KW-3",
        tresc:
          "Nagłówek „§ 19. Tryb składania wniosku” dołącza się do fragmentu przy indeksowaniu. Dzięki temu " +
          "zadziała też pytanie „co mówi § 19?”, w którym nie pada ani słowo z treści.",
      },
    },
  },
};

// Kolejność pytań na liście. Osobno od DEMO, bo obie wersje muszą oferować
// DOKŁADNIE te same pytania — inaczej przełącznik gubiłby wybór.
export const PYTANIA = [
  { id: "sobota", tresc: "Ile wynosi dodatek za pracę w sobotę?" },
  { id: "formularz", tresc: "Na jakim formularzu składa się wniosek?" },
];

// Dzieli tekst na części wokół wyróżnianego wycinka. Zwraca listę
// { tekst, wyrozniony } — komponent owija tylko te z flagą.
// Brak `wyroznij` albo wycinek nieobecny w tekście → jedna część, bez wyróżnień.
export function podzielNaWyroznienia(tekst, wyroznij) {
  if (!wyroznij) return [{ tekst, wyrozniony: false }];
  const i = tekst.indexOf(wyroznij);
  if (i === -1) return [{ tekst, wyrozniony: false }];

  const czesci = [];
  if (i > 0) czesci.push({ tekst: tekst.slice(0, i), wyrozniony: false });
  czesci.push({ tekst: wyroznij, wyrozniony: true });
  const reszta = tekst.slice(i + wyroznij.length);
  if (reszta) czesci.push({ tekst: reszta, wyrozniony: false });
  return czesci;
}
