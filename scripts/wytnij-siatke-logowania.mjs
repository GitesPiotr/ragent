// =============================================================================
//  DANE SIATKI GLOWY WYCIETE Z PROTOTYPU
//
//  W docs/prototyplogowania.html siatka siedzi w jednej linii jako `const DATA=`
//  z 6 KB JSON-a. Skrypt przenosi ja do modulu, ktory da sie zaimportowac
//  i przetestowac, i ktory NIE DOTYKA DOM-u — prototyp buduje z tych danych
//  elementy SVG od razu przy wejsciu do modulu, co w Next.js wywrocilo by
//  budowanie (prerendering leci w Node, gdzie `document` nie istnieje).
//
//  Recznie tego nie da sie przepisac bez bledu, stad skrypt.
//
//  Uruchomienie:  node scripts/wytnij-siatke-logowania.mjs
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";

const PROTOTYP = "docs/prototyplogowania.html";
const CEL = "app/logowanie/_lib/siatka.js";

const html = readFileSync(PROTOTYP, "utf8");
const m = html.match(/^const DATA=(\{.*\});\s*$/m);
if (!m) throw new Error(`Nie znalazlem deklaracji "const DATA=" w ${PROTOTYP}`);

const D = JSON.parse(m[1]);

// Kilka krotek w wierszu, zeby plik dalo sie przejrzec w diffie, a nie tylko
// zaimportowac.
const para = (a) => `[${a.join(",")}]`;

const wiersze = (tab, na = 6) => {
  const out = [];
  for (let i = 0; i < tab.length; i += na) {
    out.push("  " + tab.slice(i, i + na).map(para).join(", ") + ",");
  }
  return out.join("\n");
};

const tresc = `// PLIK GENEROWANY — nie edytowac recznie.
// Zrodlo: ${PROTOTYP} (const DATA), skrypt: scripts/wytnij-siatke-logowania.mjs
//
// Geometria lewej polowy glowy: siatka punktow i polaczen w ukladzie
// wspolrzednych viewBox "0 0 624 649". Same liczby, zero DOM-u.
//
//   WEZLY     [x, y, magenta]        magenta 1 = wezel akcentowy
//   KRAWEDZIE [a, b, magenta]        a i b to indeksy w WEZLY
//   KROPKI    {x, y, r, m}           rozproszenie wokol siatki
//   TROJKATY  {pts, m}               male wielokaty w rozproszeniu
//
// Wezel jest „szwem" (styka sie z helmem), gdy x >= 306 — to prog z prototypu,
// linia 331. Na szwach zapalaja sie okregi spawow.

export const SZEW_X = 306;

export const WEZLY = [
${wiersze(D.nodes, 6)}
];

export const KRAWEDZIE = [
${wiersze(D.edges, 8)}
];

export const KROPKI = ${JSON.stringify(D.dots)};

export const TROJKATY = ${JSON.stringify(D.tris)};
`;

writeFileSync(CEL, tresc);
console.log(
  `${CEL}  wezly ${D.nodes.length}, krawedzie ${D.edges.length}, ` +
    `kropki ${D.dots.length}, trojkaty ${D.tris.length}`,
);
