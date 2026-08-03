import { znormalizujKatalog, podsumujKatalog } from "./katalog.js";

// Pobranie katalogu modeli z OpenRoutera + cache po stronie serwera.
//
// IMPORT WZGLĘDNY I Z ROZSZERZENIEM — oba człony są konieczne, żeby ten plik
// dał się przetestować gołym `node --test`:
//  • alias `@/` rozwiązuje Next, nie Node (nadepnięte w rundzie 2),
//  • ścieżki bez rozszerzenia też rozwiązuje Next, nie Node — „./katalog"
//    kończy się tym samym ERR_MODULE_NOT_FOUND, tyle że o jeden krok dalej.
// Reszta projektu pisze importy bez rozszerzenia; tutaj jest inaczej celowo.

const ADRES_KATALOGU = "https://openrouter.ai/api/v1/models";

// Ile czekamy na OpenRoutera, zanim uznamy, że nie odpowie. Bez tego nasza
// trasa wisi tyle, ile wisi cudza — a użytkownik patrzy w kręcące się kółko
// i nie wie, że to nie nasza wina.
const LIMIT_CZASU_MS = 10_000;

// =============================================================================
//  CACHE: GDZIE I NA JAK DŁUGO
//
//  GDZIE — PAMIĘĆ PROCESU (zmienna modułowa). Rozważane były trzy miejsca:
//
//   • baza danych — odpada. Wymagałaby migracji i decyzji o RLS dla danych,
//     które są PUBLICZNE i IDENTYCZNE dla każdego konta (ten sam cennik dla
//     wszystkich). RLS w tym projekcie pilnuje własności wierszy przez
//     account_id; tabela bez właściciela byłaby wyłomem w regule, którą
//     domykaliśmy przez całą sesję bezpieczeństwa. Duży koszt, zerowy zysk.
//
//   • plik na dysku — odpada. Przeżywa restart procesu, ale NIE przeżywa
//     wdrożenia (nowy kontener = pusty dysk), więc kupuje mniej, niż się
//     wydaje, a dokłada zapis, uprawnienia i sprzątanie.
//
//   • pamięć procesu — wybrane. Cena pudła w cache to JEDNO zapytanie HTTP
//     do publicznego endpointu, ~300 ms. Przy kilku instancjach każda trzyma
//     własną kopię i to jest w porządku: kopie są wymienne, bo dane są
//     publiczne i te same. Kod: jedna zmienna, zero infrastruktury.
//
//  NA JAK DŁUGO — GODZINA. Katalog OpenRoutera zmienia się rzędu kilku razy
//  w tygodniu (nowe modele, korekty cen). Doba byłaby wygodniejsza dla nas
//  i denerwująca dla użytkownika, który właśnie przeczytał o nowym modelu
//  i nie widzi go na liście. Godzina daje najwyżej 24 pobrania na dobę na
//  instancję — koszt żaden — i mieści całą sesję pracy w jednym pobraniu.
// =============================================================================
const WAZNOSC_MS = 60 * 60 * 1000;

// Stan cache. Trzymamy też `pobraneO`, żeby dało się powiedzieć wprost, jak
// stare są dane — „świeże" bez daty to obietnica, której nie da się sprawdzić.
let cache = null; // { modele, podsumowanie, pobraneO }
// Jedno pobranie na raz. Bez tego pięć równoczesnych wejść na listę modeli
// przy zimnym cache wystrzeliwuje pięć identycznych zapytań do OpenRoutera.
let wPolocie = null;

function czyWazny(wpis) {
  return Boolean(wpis) && Date.now() - wpis.pobraneO < WAZNOSC_MS;
}

async function pobierzZSieci() {
  // Endpoint /models jest PUBLICZNY — sprawdzone wywołaniem bez nagłówka
  // Authorization. Świadomie NIE wysyłamy tu OPENROUTER_API_KEY: katalog nie
  // zależy od konta, a klucz wysłany bez potrzeby to klucz w cudzych logach.
  // Skutek uboczny jest pożądany: listę modeli widać także wtedy, gdy klucz
  // nie jest jeszcze skonfigurowany.
  let odp;
  try {
    odp = await fetch(ADRES_KATALOGU, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(LIMIT_CZASU_MS),
      cache: "no-store",
    });
  } catch (przyczyna) {
    // BEZ TEGO OPAKOWANIA użytkownik dostaje „fetch failed" — dosłownie tyle
    // rzuca Node przy braku sieci albo nieistniejącej domenie. Zmierzone:
    // trasa oddawała 502 z takim właśnie ciałem. Status i brak udawanej listy
    // były poprawne, ale komunikat nie nadawał się do pokazania.
    const err = new Error(
      przyczyna?.name === "TimeoutError"
        ? `OpenRouter nie odpowiedział w ciągu ${LIMIT_CZASU_MS / 1000} s. Spróbuj ponownie za chwilę.`
        : "Nie można połączyć się z OpenRouterem, żeby pobrać listę modeli. Sprawdź połączenie z internetem.",
    );
    err.code = "openrouter_katalog_polaczenie";
    err.cause = przyczyna;
    throw err;
  }

  if (!odp.ok) {
    const err = new Error(
      `OpenRouter odpowiedział ${odp.status} przy pobieraniu katalogu modeli.`,
    );
    err.code = "openrouter_katalog_http";
    err.status = odp.status;
    throw err;
  }

  const dane = await odp.json();
  const modele = znormalizujKatalog(dane);

  // Odpowiedź 200 z pustą listą to NIE jest poprawny katalog — OpenRouter ma
  // zawsze setki modeli. Puste `data` oznacza, że dostaliśmy coś innego, niż
  // się spodziewamy (strona błędu, przekierowanie, zmiana kształtu API).
  // Wpuszczenie tego do cache zamroziłoby pustą listę na godzinę.
  if (modele.length === 0) {
    const err = new Error(
      "OpenRouter zwrócił pusty katalog modeli — odpowiedź nie ma spodziewanego kształtu.",
    );
    err.code = "openrouter_katalog_pusty";
    throw err;
  }

  return { modele, podsumowanie: podsumujKatalog(modele), pobraneO: Date.now() };
}

// Zwraca katalog modeli. Rzuca wyjątek, jeśli nie ma czym odpowiedzieć —
// świadomie, żeby trasa nie miała jak zwrócić pustej listy ze statusem 200.
//
// `odswiez: true` pomija ważny cache (przycisk „odśwież listę").
export async function pobierzKatalogModeli({ odswiez = false } = {}) {
  if (!odswiez && czyWazny(cache)) {
    return { ...cache, zCache: true, przeterminowany: false };
  }

  if (!wPolocie) {
    wPolocie = pobierzZSieci().finally(() => {
      wPolocie = null;
    });
  }

  try {
    cache = await wPolocie;
    return { ...cache, zCache: false, przeterminowany: false };
  } catch (blad) {
    // OpenRouter nie odpowiada, ale mamy starą kopię — oddajemy JĄ, wyraźnie
    // oznaczoną jako przeterminowaną. Stara prawdziwa lista jest dla
    // użytkownika warta więcej niż błąd, pod warunkiem że wie, że jest stara.
    if (cache) {
      return {
        ...cache,
        zCache: true,
        przeterminowany: true,
        bladOdswiezenia: blad.message,
      };
    }
    // Nie ma nic. Wyjątek leci wyżej — pustej listy nie udajemy.
    throw blad;
  }
}

// Do testów i do ręcznego sprawdzenia, że cache faktycznie działa.
export function wyczyscCacheKatalogu() {
  cache = null;
  wPolocie = null;
}
