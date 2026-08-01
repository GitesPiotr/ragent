// Kolejność odpowiedzi na odczyty grafu — CZYSTY JS, bez fetch i bez window.
//
// USTERKA, KTÓRA TO WYMUSIŁA: przy szybkim przełączeniu trybu widok osiadał na trwałe
// w stanie „interfejs mówi «tylko mosty», dane są z progu 2". Nie był to stan przejściowy
// — pod spodem stało „układanie zatrzymane", czyli widok OGŁASZAŁ GOTOWOŚĆ, pokazując
// dane innego trybu, niż deklarował. Licznik „pokazano 157 z 565" jest w tym widoku
// nośnikiem prawdy (12.9), więc jeśli kłamie raz na dwadzieścia wejść, nie można się
// na nim opierać wcale.
//
// DLACZEGO NAPRAWA JEST DETERMINISTYCZNA, A NIE „NIE UDAŁO SIĘ POWTÓRZYĆ": wyścig
// znika nie wtedy, gdy przestaje się objawiać, tylko wtedy, gdy odpowiedź niepasująca
// do aktualnego pytania NIE MA JAK trafić na ekran. Stąd dwa niezależne warunki, oba
// sprawdzane przed użyciem odpowiedzi:
//
//   • NUMER ŻĄDANIA — odpowiedź starsza niż ostatnie wysłane pytanie jest odrzucana,
//     nawet jeśli dotyczy tego samego trybu (dwa kliknięcia w to samo miejsce),
//   • KLUCZ ŻĄDANIA — odpowiedź opisująca inny próg albo tryb jest odrzucana, nawet
//     gdyby numery się zgadzały (np. po przebudowie komponentu).
//
// Drugi warunek nie jest zbędny wobec pierwszego: numer pilnuje KOLEJNOŚCI, klucz
// pilnuje TOŻSAMOŚCI. Usterka polegała na rozjeździe tożsamości, więc to ona jest
// tu sprawdzana wprost, a nie wnioskowana z licznika.

// Klucz opisuje, o CO pytamy — nie kiedy. Ten sam próg daje ten sam klucz, więc
// odpowiedź na powtórzone pytanie jest wymienna, a na inne pytanie już nie.
export function kluczZadania({ minMentions, tylkoMosty } = {}) {
  if (tylkoMosty) return 'mosty';
  const n = Math.trunc(Number(minMentions));
  return 'prog:' + (Number.isFinite(n) ? n : 1);
}

// Czy odpowiedź wolno pokazać. `odpowiedz` i `biezace` to pary { nr, klucz }.
export function czyPrzyjac(odpowiedz, biezace) {
  if (!odpowiedz || !biezace) return false;
  return odpowiedz.nr === biezace.nr && odpowiedz.klucz === biezace.klucz;
}
