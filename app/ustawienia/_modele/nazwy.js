// Nazwy i opisy trzech zadan — warstwa widoku.
//
// DLACZEGO OSOBNO OD lib/settings/katalogModeli.js: tam NAZWY_ZADAN sluza
// do zbudowania KOMUNIKATU BLOKADY („przypisany jako model mentora") i musza
// wpasowac sie w zdanie. Tutaj potrzebne sa tytul wiersza i akapit
// wyjasniajacy, do czego to zadanie sluzy. To dwa rozne teksty o tym samym,
// a nie jeden tekst w dwoch miejscach — sklejenie ich dalo by albo tytul
// wielkosci akapitu, albo komunikat blokady bez sensu gramatycznego.
//
// Kolejnosc ROL jest jedna i pochodzi z rdzenia (lib/settings/modeleKonta.js),
// zeby karta nie ustawiala wlasnej.
export { ROLE } from "@/lib/settings/modeleKonta";

export const NAZWY_ZADAN_PELNE = {
  agent_domyslny: {
    tytul: "Domyślny model agenta",
    opis:
      "Podpowiadany przy tworzeniu nowego agenta. Nie zmienia agentów, które już istnieją — te mają swój model zapisany przy sobie.",
  },
  rag_pojecia: {
    tytul: "Model do pojęć RAG",
    opis:
      "Wyciąga pojęcia z fragmentów przy indeksowaniu w Kreatorze RAG. Pracuje na treści dokumentów, więc model lokalny trzyma ją w całości u Ciebie.",
  },
  mentor: {
    tytul: "Model mentora",
    opis:
      "Napędza podpowiedzi mentora w kreatorze. Zadanie jest krótkie i tekstowe — tańszy model zwykle wystarcza.",
  },
};
