// =============================================================================
//  OBRAZY EKRANU LOGOWANIA WYCIETE Z PROTOTYPU
//
//  W docs/prototyplogowania.html oba obrazy sa wklejone jako base64 wprost
//  w znacznik <image>. Razem 421 KB w dokumencie HTML, ktory przegladarka musi
//  sciagnac i sparsowac w calosci, zanim cokolwiek narysuje — i ktorego nie da
//  sie zapamietac w pamieci podrecznej osobno od znacznikow.
//
//  Skrypt, a nie recznie wyklejone pliki, bo prototyp jest zrodlem prawdy
//  i bedzie sie jeszcze zmienial. Po kazdej zmianie grafiki wystarczy to
//  uruchomic zamiast odtwarzac kadrowanie z pamieci.
//
//  DLACZEGO WEBP. Zmierzone na tych plikach:
//                    base64   PNG effort 10   WebP q90
//    helm             252 KB      126 KB        14 KB
//    wizjer           170 KB       39 KB         7 KB
//  <image> w SVG przyjmuje WebP we wszystkich obecnych przegladarkach.
//  Powrot na PNG to zmiana jednej linii nizej.
//
//  UWAGA NA HELM: nie ma kanalu alfa (3 kanaly), a jego wlasne tlo to #0c1220.
//  To nie jest przypadek — dzieki temu na tle tej samej barwy nie widac szwu
//  wokol obrazu. Ekran logowania MUSI stac na #0c1220, nie na --bg aplikacji
//  (#040611). Nie konwertowac tego na przezroczystosc bez decyzji o wygladzie
//  miekkich krawedzi renderu.
//
//  Uruchomienie:  node scripts/wytnij-obrazy-logowania.mjs
// =============================================================================

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PROTOTYP = "docs/prototyplogowania.html";
const KATALOG = "public/logowanie";
const JAKOSC = 90;

// id w prototypie -> nazwa pliku wynikowego
const OBRAZY = [
  ["helmet", "helm"],
  ["visorOff", "wizjer"],
];

const html = readFileSync(PROTOTYP, "utf8");

// Szukamy po id, NIE po numerze linii: numer przesunie sie przy pierwszej
// edycji prototypu, a id jest tym, czym sie te obrazy rozroznia.
function wytnij(id) {
  const re = new RegExp(
    `<image[^>]*\\bid="${id}"[^>]*\\bhref="data:image/(png|webp|jpeg);base64,([^"]+)"`,
  );
  const m = html.match(re);
  if (!m) throw new Error(`Nie znalazlem obrazu o id="${id}" w ${PROTOTYP}`);
  return Buffer.from(m[2], "base64");
}

mkdirSync(KATALOG, { recursive: true });

for (const [id, nazwa] of OBRAZY) {
  const zrodlo = wytnij(id);
  const meta = await sharp(zrodlo).metadata();
  const webp = await sharp(zrodlo).webp({ quality: JAKOSC }).toBuffer();

  const sciezka = `${KATALOG}/${nazwa}.webp`;
  writeFileSync(sciezka, webp);

  const zysk = (100 - (webp.length / zrodlo.length) * 100).toFixed(0);
  console.log(
    `${sciezka.padEnd(28)} ${meta.width}x${meta.height}  ` +
      `${(zrodlo.length / 1024).toFixed(0)} KB -> ${(webp.length / 1024).toFixed(0)} KB  (-${zysk}%)`,
  );
}
