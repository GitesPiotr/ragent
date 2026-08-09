// Odmiana rzeczownika „kolekcja" przez liczebnik.
//
// Bez tego licznik wypisuje „5 kolekcje" i „22 kolekcji". Polski ma trzy formy
// i wyjątek, o którym łatwo zapomnieć: 12–14 zachowuje się jak 5, mimo że
// końcówka wygląda jak 2–4.
//
//   1                       → kolekcja
//   2, 3, 4, 22, 23, 24…    → kolekcje
//   0, 5–21, 25–31…         → kolekcji
//
// Czysta funkcja, bez Reacta i bez DOM — dlatego da się ją przetestować
// na wszystkich stu pierwszych liczbach zamiast na trzech przykładach.

export function odmianaKolekcji(n) {
  if (n === 1) return "kolekcja";

  const dwieOstatnie = n % 100;
  const ostatnia = n % 10;

  // Wyjątek 12–14 sprawdzany PRZED końcówką, bo inaczej „13" wpadłoby
  // w regułę dla 2–4.
  if (ostatnia >= 2 && ostatnia <= 4 && !(dwieOstatnie >= 12 && dwieOstatnie <= 14)) {
    return "kolekcje";
  }

  return "kolekcji";
}
