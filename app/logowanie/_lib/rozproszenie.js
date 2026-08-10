// =============================================================================
//  ROZPROSZENIE — faza i amplituda oscylacji kazdej kropki i kazdego wielokata.
//
//  Prototyp losuje te dwie liczby przy BUDOWIE elementow (linie 326 i 329),
//  czyli przy wejsciu do modulu, i trzyma je razem z referencja do elementu
//  SVG. Tutaj sa same liczby: element dokleja komponent, ktory je juz ma
//  z JSX.
//
//  LOSOWOSC WCHODZI PARAMETREM, tak samo jak rand w harmonogram.js i z tego
//  samego powodu: funkcja jest czysta wzgledem argumentow, wiec da sie ja
//  sprawdzic atrapa, a produkcja dostaje prawdziwy Math.random. GENERATORA
//  NIE ZIARNUJEMY — rozsyp ma byc za kazdym razem inny.
//
//  KOLEJNOSC WYWOLAN rand JEST CZESCIA KONTRAKTU: na element dwa wywolania,
//  najpierw ph, potem am. Najpierw przechodza wszystkie kropki, potem
//  wszystkie wielokaty — dokladnie tak jak dwie petle prototypu.
//
//  WZORY NA ph I am ROZNIA SIE MIEDZY KROPKA A WIELOKATEM i tak ma zostac.
//  Kropka: am = 0,6 + rand()*0,9. Wielokat: am = 0,5 + rand()*0,8, czyli
//  spokojniej — wielokat jest wiekszy, wiec ten sam ruch rzucalby sie
//  w oczy mocniej.
// =============================================================================
export function zbudujRozproszenie(kropki, trojkaty, { rand = Math.random } = {}) {
  // Prototyp, linia 326.
  const zKropek = kropki.map((d) => ({
    x: d.x,
    y: d.y,
    ph: rand() * 6.28,
    am: 0.6 + rand() * 0.9,
    rot: false,
  }));

  // Prototyp, linie 328-329. Wielokat oscyluje wokol SRODKA CIEZKOSCI swoich
  // punktow — to jest takze srodek obrotu, stad rot.
  const zWielokatow = trojkaty.map((t) => {
    const cx = t.pts.reduce((s, q) => s + q[0], 0) / t.pts.length;
    const cy = t.pts.reduce((s, q) => s + q[1], 0) / t.pts.length;
    return {
      x: cx,
      y: cy,
      ph: rand() * 6.28,
      am: 0.5 + rand() * 0.8,
      rot: true,
    };
  });

  return [...zKropek, ...zWielokatow];
}
