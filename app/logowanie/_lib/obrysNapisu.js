// =============================================================================
//  OBRYS NAPISU — dwie czyste funkcje geometryczne, zero DOM-u.
//
//  Prototyp liczy jedno i drugie na ImageData pobranym prosto z plotna
//  (linie 516-553), wiec bez przegladarki nie da sie tego ruszyc. Tutaj obie
//  biora ZWYKLA TABLICE BAJTOW kanalu alfa — jeden bajt na piksel, nie cztery.
//  Komponent wyciaga ten kanal raz, przy pomiarze, a w zamian caly skan konturu
//  i upraszczanie lamanej daje sie sprawdzic na wymyslonej bitmapie.
// =============================================================================

// Osiem kierunkow sasiedztwa, w kolejnosci zgodnej z ruchem wskazowek zegara.
// Prototyp, linia 519.
const KIERUNKI = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

// =============================================================================
//  sledzKontur(alfa, W, H, prog, minDlugosc) — skan Moore'a, linie 516-534.
//
//  Zwraca petle jako tablice punktow [x, y], BEZ upraszczania. Prototyp robi
//  jedno i drugie w jednym wyrazeniu (linia 535: `loops.map(l => simplify(l,1.7))`);
//  tutaj sa to dwa kroki, bo to dwie osobne rzeczy do sprawdzenia — komponent
//  sklada je z powrotem.
//
//  minDlugosc odsiewa smiec: pojedyncze piksele i dwupikselowe zadziory, ktore
//  przy antyaliasingu zawsze zostaja na brzegach liter. Prototyp ma tam
//  wpisane 30 (linia 533) i tyle jest domyslnie — wchodzi parametrem wylacznie
//  po to, zeby dalo sie sprawdzic ksztalt mniejszy niz cala litera. Wartosci
//  z prototypu nie zmieniamy, tylko ja wystawiamy.
// =============================================================================
export function sledzKontur(alfa, W, H, prog = 140, minDlugosc = 30) {
  const jestTusz = (x, y) =>
    x >= 0 && y >= 0 && x < W && y < H && alfa[y * W + x] > prog;

  const widziane = new Uint8Array(W * H);
  const petle = [];

  for (let y = 1; y < H - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      // Start tylko na GORNEJ krawedzi ksztaltu: piksel jest tuszem, nie byl
      // jeszcze odwiedzony, a nad nim jest pusto. Bez tego warunku wnetrze
      // litery zaczynaloby wlasna petle przy kazdym pikselu.
      if (!jestTusz(x, y) || widziane[y * W + x] || jestTusz(x, y - 1)) continue;

      const petla = [];
      let cx = x;
      let cy = y;
      let kier = 6;
      let straznik = 0;
      let znalezione;

      for (;;) {
        petla.push([cx, cy]);
        widziane[cy * W + cx] = 1;
        znalezione = false;

        for (let k = 0; k < 8; k += 1) {
          const nd = (kier + k) % 8;
          const nx = cx + KIERUNKI[nd][0];
          const ny = cy + KIERUNKI[nd][1];
          if (jestTusz(nx, ny)) {
            cx = nx;
            cy = ny;
            kier = (nd + 5) % 8;
            znalezione = true;
            break;
          }
        }

        // Straznik z prototypu: ksztalt patologiczny nie ma prawa zapetlic
        // przegladarki na amen.
        straznik += 1;
        if (!znalezione || (cx === x && cy === y) || straznik > 30000) break;
      }

      if (petla.length > minDlugosc) petle.push(petla);
    }
  }

  return petle;
}

// =============================================================================
//  uproscLamana(punkty, eps) — Douglas-Peucker, linie 539-553.
//
//  Wyrzuca punkty lezace blizej niz eps od cieciwy. Na obrysie napisu zbija
//  kilka tysiecy pikseli konturu do kilkuset wezlow — a to one sa rysowane
//  co klatke, wiec ten jeden przebieg decyduje o koszcie calej animacji.
// =============================================================================
export function uproscLamana(punkty, eps) {
  // Prototyp tego nie sprawdza, bo dostaje wylacznie petle dluzsze niz 30
  // punktow. Funkcja czysta moze dostac cokolwiek, a bez tej oslony wyrazenie
  // ponizej siegneloby punkty[-1] i zwrocilo undefined.
  if (punkty.length < 3) return punkty.slice();

  const rek = (a, b) => {
    if (b <= a + 1) return [];
    const [x1, y1] = punkty[a];
    const [x2, y2] = punkty[b];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dlugosc = Math.hypot(dx, dy) || 1;

    let najlepsza = -1;
    let indeks = -1;
    for (let i = a + 1; i < b; i += 1) {
      const [x, y] = punkty[i];
      const d = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / dlugosc;
      if (d > najlepsza) {
        najlepsza = d;
        indeks = i;
      }
    }

    return najlepsza < eps ? [] : rek(a, indeks).concat([indeks], rek(indeks, b));
  };

  return [0]
    .concat(rek(0, punkty.length - 1), [punkty.length - 1])
    .map((i) => punkty[i]);
}
