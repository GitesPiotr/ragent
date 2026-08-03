// Katalog modeli OpenRoutera: normalizacja odpowiedzi API na kształt aplikacji
// oraz etykiety liczone z danych.
//
// CZYSTE FUNKCJE, BEZ IMPORTÓW. Dwa powody:
//  • dają się przetestować bez sieci i bez bundlera — `node --test` nie
//    rozwiązuje aliasu `@/`, więc moduł z takim importem wywala test na
//    ERR_MODULE_NOT_FOUND, zanim cokolwiek sprawdzi (nadepnięte w rundzie 2),
//  • pobieranie i cache siedzą osobno (pobierz.js), bo to inna odpowiedzialność.

// =============================================================================
//  KSZTAŁT REKORDU — DLACZEGO TEN, A NIE CZWARTY NOWY
//
//  W aplikacji żyją dziś TRZY kształty rekordu modelu:
//    1. lib/config/models.js  → { id, label, supportsTemperature, verified, requiresKey }
//    2. /api/models (Ollama)  → { id, label }
//    3. RunnerPicker          → { key, value, kind, name }
//
//  Trzeci NIE jest konkurentem: to model widoku budowany z jednego z dwóch
//  pierwszych, z polami pod obsługę listy rozwijanej. Zostaje, gdzie jest.
//
//  Zostają więc dwa, a drugi jest PODZBIOREM pierwszego — `{ id, label }` to
//  dokładnie te pola z MODELS_BY_PROVIDER, które da się ustalić dla modelu
//  lokalnego. Wybieram więc pierwszy jako bazę i DOKŁADAM do niego pola
//  katalogowe. Dzięki temu kod, który dziś czyta `m.id` i `m.label` (siedmiu
//  czytelników z rozpoznania), działa z tym rekordem bez zmian.
//
//  CZEGO ŚWIADOMIE NIE PRZENOSZĘ z MODELS_BY_PROVIDER:
//   • `supportsTemperature` — dla OpenRoutera odpowiada na to
//     modelSupportsTemperature(), które zwraca `true` dla całego dostawcy
//     (lib/config/models.js). Pole w rekordzie byłoby DRUGIM źródłem tej samej
//     odpowiedzi i pierwszą okazją, żeby oba się rozjechały.
//   • `requiresKey` — to własność DOSTAWCY, nie modelu. Przy 336 modelach
//     powtarzalibyśmy tę samą stałą 336 razy.
//   • `verified` — ręczne oznaczenie „sprawdzone u nas" wymaga trwałości
//     (rundy dalej). Rekord z katalogu jest odczytem z zewnątrz i nie ma
//     gdzie tego trzymać; dołoży się je przy scalaniu z ustawieniami.
// =============================================================================

// Ceny w API OpenRoutera przychodzą jako NAPIS z ceną ZA JEDEN token
// („0.000001”). Trzymamy je przeliczone NA MILION TOKENÓW i mówi o tym nazwa
// pola — inaczej każdy czytelnik mnożyłby przez 1e6 po swojemu, a prędzej czy
// później któryś by tego nie zrobił i pokazał cenę milion razy za niską.
const TOKENY_W_MLN = 1_000_000;

function naLiczbe(wartosc) {
  if (wartosc === null || wartosc === undefined || wartosc === "") return null;
  const n = Number(wartosc);
  return Number.isFinite(n) ? n : null;
}

function cenaZaMln(surowa) {
  const n = naLiczbe(surowa);
  return n === null ? null : n * TOKENY_W_MLN;
}

// Człon przed ukośnikiem w identyfikatorze („anthropic/claude-haiku-4.5”).
// To NIE jest `provider` w rozumieniu aplikacji — tam dostawcą jest
// „openrouter”. To wytwórca modelu, i tak jest nazwany.
export function wytworcaZId(id) {
  const s = String(id || "");
  const i = s.indexOf("/");
  return i > 0 ? s.slice(0, i) : "";
}

// Czy model jest darmowy: OBIE ceny zerowe. Jedna zerowa to nie „darmowy",
// tylko model, który nie liczy sobie za wejście albo za wyjście — i nazwanie
// go darmowym byłoby kosztowną pomyłką.
export function czyDarmowy({ cenaWejsciaZaMln, cenaWyjsciaZaMln }) {
  return cenaWejsciaZaMln === 0 && cenaWyjsciaZaMln === 0;
}

// =============================================================================
//  DEKLARACJA, NIE FAKT
//
//  `supported_parameters` z katalogu OpenRoutera JEST NIEWIARYGODNE i to jest
//  zmierzone, nie przypuszczane: `openrouter/fusion` nie wymienia „tools",
//  a wywołał narzędzia poprawnie, ze źródłami (runda 2). Dlatego pole nazywa
//  się `deklarujeTools`, a nie `supportsTools` — i dlatego katalog NIE JEST
//  po tej fladze filtrowany. Filtr ukryłby modele, które działają.
//
//  Nazwa pola ma to mówić bez czytania komentarza, a etykieta dla użytkownika
//  (etykietaNarzedzi) mówi to wprost słowami.
// =============================================================================
export function deklarujeTools(parametry) {
  return Array.isArray(parametry) && parametry.includes("tools");
}

// --- ETYKIETY LICZONE Z DANYCH -----------------------------------------------
//
// Wszystkie trzy w JEDNYM miejscu i z testami. Wpisane ręcznie przy rekordzie
// rozjechałyby się z danymi przy pierwszej zmianie cennika.

// Gdzie model się wykonuje. Dziś dwie odpowiedzi, bo dwóch dostawców ma
// katalog dynamiczny; statyczni (Anthropic, OpenAI) też są „w chmurze".
export function etykietaGdzie(dostawca) {
  return dostawca === "ollama" ? "lokalny" : "w chmurze";
}

// Ile kosztuje. „darmowy z limitem", a nie samo „darmowy": modele `:free`
// w OpenRouterze mają dzienne limity zapytań i przemilczenie tego zamienia
// się w telefon „dlaczego agent przestał odpowiadać po południu".
export function etykietaKosztu(model) {
  const we = model?.cenaWejsciaZaMln;
  const wy = model?.cenaWyjsciaZaMln;
  if (we === null || we === undefined || wy === null || wy === undefined) {
    return "koszt nieznany";
  }
  if (czyDarmowy(model)) return "darmowy z limitem";
  return `płatny · $${formatCeny(we)} / $${formatCeny(wy)} za 1 mln tokenów`;
}

// Ceny bywają rzędu setnych centa i rzędu dziesiątek dolarów za milion tokenów.
// Stała liczba miejsc po przecinku albo zaokrągliłaby tanie do zera, albo
// zasypała drogie zerami — więc liczba miejsc zależy od rzędu wielkości.
function formatCeny(v) {
  if (v === 0) return "0";
  if (v < 0.01) return v.toFixed(4);
  if (v < 1) return v.toFixed(3);
  if (v < 100) return v.toFixed(2);
  return String(Math.round(v));
}

// Co powiedzieć o narzędziach. Słowo „deklaruje" jest tu celowe i ma trafić
// przed oczy użytkownika — patrz komentarz przy deklarujeTools().
export function etykietaNarzedzi(model) {
  // Strona negatywna brzmi „bez deklaracji", a nie „nie deklaruje obsługi
  // narzędzi" — bo w interfejsie stoi jako krótka etykieta obok modelu,
  // gdzie długie zdanie się nie mieści. Ważniejsze: „bez deklaracji" mówi
  // o BRAKU INFORMACJI, a nie o braku możliwości, i to jest tu cała różnica.
  // 66 modeli nie ma tej flagi, a co najmniej jeden z nich narzędzia wywołuje.
  return model?.deklarujeTools ? "deklaruje obsługę narzędzi" : "bez deklaracji";
}

// --- NORMALIZACJA -------------------------------------------------------------

// Jeden rekord z API OpenRoutera → rekord w kształcie aplikacji.
// Zwraca null dla wpisu bez identyfikatora — taki rekord jest bezużyteczny
// i lepiej go odsiać niż wpuścić do listy z pustym `id`.
export function znormalizujModel(surowy) {
  const id = surowy && typeof surowy.id === "string" ? surowy.id.trim() : "";
  if (!id) return null;

  const cennik = surowy.pricing || {};
  const cenaWejsciaZaMln = cenaZaMln(cennik.prompt);
  const cenaWyjsciaZaMln = cenaZaMln(cennik.completion);

  const model = {
    // --- pola wspólne z lib/config/models.js ---
    id,
    label: (surowy.name && String(surowy.name).trim()) || id,

    // --- pola katalogowe ---
    // `provider` w rozumieniu APLIKACJI — zawsze "openrouter". To NIE to samo
    // co `wytworca` niżej: przez OpenRoutera idzie model Anthropica, ale
    // dostawcą, którego klucz go uruchamia, jest OpenRouter. Pole jest tu po
    // to, żeby rekord dało się zapisać do allowed_models bez dokładania
    // dostawcy przez wołającego — czyli bez miejsca, w którym da się pomylić.
    provider: "openrouter",
    wytworca: wytworcaZId(id),
    kontekst: naLiczbe(surowy.context_length),
    cenaWejsciaZaMln,
    cenaWyjsciaZaMln,
    deklarujeTools: deklarujeTools(surowy.supported_parameters),
  };

  model.darmowy = czyDarmowy(model);
  // Etykiety liczone RAZ, po stronie serwera. Interfejs ma je renderować,
  // a nie wyliczać po swojemu — inaczej wracamy do kilku źródeł prawdy.
  model.gdzie = etykietaGdzie("openrouter");
  model.koszt = etykietaKosztu(model);
  model.narzedzia = etykietaNarzedzi(model);

  return model;
}

// Cała odpowiedź API → lista rekordów, posortowana.
//
// SORTOWANIE STABILNE I JAWNE: najpierw wytwórca, potem etykieta. API oddaje
// modele w kolejności dodania, która dla oglądającego listę nie znaczy nic,
// a zmienia się przy każdym nowym modelu — czyli lista skakałaby między
// odczytami bez żadnego powodu.
export function znormalizujKatalog(odpowiedz) {
  const surowe = Array.isArray(odpowiedz?.data) ? odpowiedz.data : [];
  return surowe
    .map(znormalizujModel)
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.wytworca.localeCompare(b.wytworca) || a.label.localeCompare(b.label),
    );
}

// Podsumowanie katalogu — do nagłówka listy i do raportu z rundy.
export function podsumujKatalog(modele) {
  const lista = Array.isArray(modele) ? modele : [];
  return {
    lacznie: lista.length,
    zDeklaracjaNarzedzi: lista.filter((m) => m.deklarujeTools).length,
    darmowe: lista.filter((m) => m.darmowy).length,
  };
}
