// Rozwiązywanie aliasu `@/` dla skryptów uruchamianych gołym Node.
//
// DLACZEGO TO ISTNIEJE. `@/` jest aliasem Next.js z jsconfig.json — rozwiązuje
// go bundler, nie Node. Skrypty w tym katalogu dotąd rozmawiały wyłącznie
// z bazą i problemu nie miały, ale w chwili, gdy skrypt chce zaimportować
// cokolwiek z lib/providers/ albo lib/tools/, uderza w ścianę: DWANAŚCIE
// modułów w lib/ używa tego aliasu i bez niego nie da się załadować żadnego.
//
// DWIE RZECZY, KTÓRYCH NIE ROBIĘ:
//  • nie dopisuję pola `imports` do package.json — to plik współdzielony przez
//    aplikację, a alias jest potrzebny wyłącznie skryptom z konsoli;
//  • nie przepisuję importów w lib/ na względne — kod produkcyjny nie ma
//    zmieniać kształtu pod narzędzie diagnostyczne.
//
// KATALOG JAKO MODUŁ. Next rozwiązuje `@/lib/tools` na `lib/tools/index.js`,
// czego ESM w Node nie robi samo. Stąd trzy próby po kolei: ścieżka wprost,
// z dopisanym `.js`, i `/index.js`.
//
// Użycie — PRZED jakimkolwiek importem z lib/, bo hak działa tylko na moduły
// ładowane po jego rejestracji:
//
//     import "./_alias.mjs";
//     const { cos } = await import("../lib/…");

import { registerHooks } from "node:module";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Korzeń projektu: katalog wyżej niż scripts/.
const KORZEN = resolve(import.meta.dirname, "..");

// SPRAWDZAMY, ŻE TO PLIK, nie samo istnienie. `lib/tools` istnieje jako katalog,
// więc test na istnienie przepuszczał go dalej i Node odrzucał import katalogu.
function jestPlikiem(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function znajdz(sciezkaBezRozszerzenia) {
  const proby = [
    sciezkaBezRozszerzenia,
    `${sciezkaBezRozszerzenia}.js`,
    resolve(sciezkaBezRozszerzenia, "index.js"),
  ];
  return proby.find(jestPlikiem) || null;
}

// DRUGI PROBLEM, SZERSZY NIŻ ALIAS. Moduły w lib/ importują się nawzajem bez
// rozszerzenia — `lib/tools/index.js` robi `import { calculator } from
// "./calculator"`. To też jest rozwiązywanie bundlerowe, którego ESM w Node nie
// wykonuje. Sam alias więc nie wystarczy: hak musi domykać oba przypadki,
// inaczej ściana przesuwa się o jeden import dalej.
registerHooks({
  resolve(specyfikator, kontekst, dalej) {
    // 1. Alias @/ — liczony od korzenia projektu.
    if (specyfikator.startsWith("@/")) {
      const kandydat = znajdz(resolve(KORZEN, specyfikator.slice(2)));
      if (!kandydat) {
        throw new Error(
          `Alias @/ nie wskazuje na istniejący plik: „${specyfikator}". ` +
            `Szukałem w ${KORZEN}, także z .js i /index.js.`
        );
      }
      return dalej(pathToFileURL(kandydat).href, kontekst);
    }

    // 2. Reszta idzie normalnie. Dopiero gdy Node odmówi, próbujemy dołożyć
    //    rozszerzenie — kolejność jest istotna, bo nie chcemy zgadywać tam,
    //    gdzie zwykłe rozwiązanie działa.
    try {
      return dalej(specyfikator, kontekst);
    } catch (err) {
      const doRatowania =
        err?.code === "ERR_MODULE_NOT_FOUND" || err?.code === "ERR_UNSUPPORTED_DIR_IMPORT";
      if (!doRatowania || !specyfikator.startsWith(".") || !kontekst?.parentURL) throw err;

      const bazowy = resolve(fileURLToPath(kontekst.parentURL), "..", specyfikator);
      const kandydat = znajdz(bazowy);
      if (!kandydat) throw err;
      return dalej(pathToFileURL(kandydat).href, kontekst);
    }
  },
});
