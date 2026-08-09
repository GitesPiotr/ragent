// =============================================================================
//  IKONY APLIKACJI Z ragent-glowa.png
//
//  Skrypt, a nie recznie zrobione pliki, bo zrodlo bedzie sie jeszcze zmieniac
//  i wtedy trzeba odtworzyc CALY zestaw naraz — inaczej karta przegladarki
//  i ekran glowny telefonu rozjada sie na miesiace, zanim ktos to zauwazy.
//
//  DLACZEGO KRAZEK, A NIE SAMA GLOWA. Glowa przeskalowana do 32x32 ma srednia
//  jasnosc 56/255: kontrast 10.49:1 wobec jasnego paska kart, ale tylko 1.38:1
//  wobec ciemnego. Bez podkladu znika w ciemnym motywie przegladarki.
//
//  DLACZEGO GRANATOWY, A NIE CYJANOWY. Krazek byl najpierw --signal #35DCFF
//  i to bylo zle. Glowa ma trzy jasne elementy — siatke druciana po lewej
//  i swiecacy wizjer #A6FCFA — ktore na cyjanie daja 1.13:1 i 1.40:1, czyli
//  rozpuszczaja sie w tle. Zostawal sam ciemny helm.
//
//  Na --surface #0C1428 jest odwrotnie:
//    siatka na krazku             12.67:1
//    wizjer na krazku             15.64:1
//    krazek na jasnym pasku kart  16.46:1
//    krazek na ciemnym pasku       1.14:1  <- wtapia sie
//  Przy ciemnym pasku kart krazek przestaje byc widoczny jako ksztalt, ale
//  siatka i wizjer staja wtedy wprost na #202124: 11.13:1 i 13.74:1. Ginie helm
//  (1.41:1 na granacie) — sylwetke niesie wizjer, i to wystarcza w obu motywach.
//
//  MARGINES 6%, nie 10%: przy 16px czytelnosc ksztaltu jest wazniejsza niz
//  zapas przy krawedzi. Przy tej wartosci poza kolo wychodzi 0.2% pikseli
//  glowy (same czubki helmu) — sprawdzone pomiarem.
//
//  Uruchomienie:  node scripts/zrob-ikony.mjs
// =============================================================================

import { writeFileSync } from "node:fs";
import sharp from "sharp";

const ZRODLO = "public/ragent-glowa.png";
const KRAZEK = "#0c1428"; // --surface
const MARGINES = 0.06;

// Jedna ikona: krazek na calym plotnie + glowa wpasowana z marginesem.
async function ikona(bok) {
  const wnetrze = Math.round(bok * (1 - 2 * MARGINES));

  const glowa = await sharp(ZRODLO)
    .resize(wnetrze, wnetrze, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  const tlo = Buffer.from(
    `<svg width="${bok}" height="${bok}" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="${bok / 2}" cy="${bok / 2}" r="${bok / 2}" fill="${KRAZEK}"/>` +
      `</svg>`,
  );

  return sharp(tlo)
    .composite([{ input: glowa, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// KONTENER ICO SKLADANY RECZNIE, bo sharp nie zapisuje tego formatu.
// Uklad: naglowek 6 B, po 16 B na wpis katalogu, potem dane obrazow.
// W srodku siedza gotowe PNG-i — PNG-in-ICO jest wspierane od Visty i jest
// dzis zwyklym sposobem na ikone wielorozmiarowa.
function zlozIco(obrazy) {
  const naglowek = Buffer.alloc(6);
  naglowek.writeUInt16LE(0, 0); // zarezerwowane
  naglowek.writeUInt16LE(1, 2); // typ: 1 = ikona
  naglowek.writeUInt16LE(obrazy.length, 4);

  let offset = 6 + 16 * obrazy.length;
  const wpisy = [];

  for (const { bok, png } of obrazy) {
    const w = Buffer.alloc(16);
    // 0 znaczy 256 — stad modulo, choc przy 16/32/48 nigdy nie zadziala.
    w.writeUInt8(bok % 256, 0);
    w.writeUInt8(bok % 256, 1);
    w.writeUInt8(0, 2); // liczba kolorow palety: 0 = bez palety
    w.writeUInt8(0, 3); // zarezerwowane
    w.writeUInt16LE(1, 4); // plaszczyzny
    w.writeUInt16LE(32, 6); // bitow na piksel
    w.writeUInt32LE(png.length, 8);
    w.writeUInt32LE(offset, 12);
    offset += png.length;
    wpisy.push(w);
  }

  return Buffer.concat([naglowek, ...wpisy, ...obrazy.map((o) => o.png)]);
}

const cele = [
  ["app/icon.png", 512], // Next robi z tego <link rel="icon" type="image/png">
  ["app/apple-icon.png", 180], // ekran glowny iOS
];

for (const [sciezka, bok] of cele) {
  writeFileSync(sciezka, await ikona(bok));
  console.log(`${sciezka.padEnd(22)} ${bok}x${bok}`);
}

const doIco = [];
for (const bok of [16, 32, 48]) doIco.push({ bok, png: await ikona(bok) });
writeFileSync("app/favicon.ico", zlozIco(doIco));
console.log("app/favicon.ico        16 + 32 + 48");
