// Wspolny katalog modeli dla karty „Modele jezykowe": OpenRouter + lokalne,
// w JEDNYM ksztalcie rekordu, plus wyszukiwanie, filtry i licznik.
//
// CZYSTE FUNKCJE, BEZ IMPORTOW POZA WZGLEDNYMI. Powod ten sam co w rundach
// 2-4: `node --test` nie rozwiazuje aliasu `@/`. Dzieki temu wyszukiwarka
// i filtry — czyli to, co najlatwiej zepsuc po cichu — sa sprawdzane testem,
// a nie klikaniem.

// Etykiety i klucz porownania biore Z ISTNIEJACYCH MIEJSC, zamiast zakladac
// trzecie. etykietaGdzie/etykietaNarzedzi powstaly w rundzie 3 przy katalogu
// OpenRoutera, kluczModelu w rundzie 4 przy trwalosci — obie warstwy mowia
// o tych samych modelach, wiec drugi zestaw tych samych funkcji bylby
// pierwszym miejscem, w ktorym etykieta rozjedzie sie z ta z listy.
//
// Sciezki wzgledne i z rozszerzeniem — inaczej `node --test` ich nie znajdzie.
import { etykietaGdzie, etykietaNarzedzi } from "../openrouter/katalog.js";
import { kluczModelu } from "./modeleKonta.js";

export { etykietaGdzie, etykietaNarzedzi, kluczModelu };

// =============================================================================
//  MODELE LOKALNE W TYM SAMYM KSZTALCIE CO KATALOG OPENROUTERA
//
//  /api/models (Ollama) oddaje { id, label } i nic wiecej — nie ma tam ani
//  cennika, ani listy obslugiwanych parametrow. To NIE ZNACZY, ze mozna te
//  pola wypelnic zerami i zapomniec:
//
//   • koszt = "darmowy", bez "z limitem". Model chodzi na wlasnej maszynie,
//     wiec nie ma ani oplaty, ani dziennego limitu zapytan — to inna sytuacja
//     niz model `:free` w OpenRouterze i etykieta ma je rozroznic.
//   • narzedzia = BRAK DEKLARACJI, a nie "nie obsluguje". Ollama nie publikuje
//     odpowiednika supported_parameters, wiec nie wiemy — i tak trzeba to
//     napisac. Wpisanie "nie obsluguje" byloby zmyslaniem faktu, ktorego
//     nikt nie sprawdzil.
//   • cen NIE ustawiamy na 0 tylko dlatego, ze sa darmowe: null znaczy
//     „nie dotyczy", a 0 znaczyloby „zmierzone zero" i wpadloby w te sama
//     galaz co darmowy model chmurowy.
// =============================================================================
export function znormalizujLokalne(modele) {
  const lista = Array.isArray(modele) ? modele : [];
  return lista
    .map((m) => {
      const id = typeof m?.id === "string" ? m.id.trim() : "";
      if (!id) return null;
      return {
        id,
        label: (m.label && String(m.label).trim()) || id,
        provider: "ollama",
        wytworca: "",
        kontekst: null,
        cenaWejsciaZaMln: null,
        cenaWyjsciaZaMln: null,
        deklarujeTools: false,
        darmowy: true,
        gdzie: etykietaGdzie("ollama"),
        koszt: "darmowy",
        narzedzia: etykietaNarzedzi({ deklarujeTools: false }),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));
}

// --- WYSZUKIWANIE -------------------------------------------------------------

// Po nazwie ORAZ identyfikatorze. Jedno i drugie, bo uzytkownik szukajacy
// „haiku" ma trafic na „Anthropic: Claude Haiku 4.5", a szukajacy
// „anthropic/" — na wszystkie modele tego wytworcy po samym identyfikatorze.
//
// Bez rozroznienia wielkosci liter — i BEZ zdejmowania ogonkow, swiadomie.
// Zdejmowanie diakrytykow nic tu nie kupuje: identyfikatory i nazwy modeli
// sa w calosci ASCII, wiec jedyne ogonki w grze bylyby te wpisane przez
// uzytkownika, a te i tak nie maja do czego pasowac. Kosztowaloby za to
// regex z niewidocznymi znakami laczacymi w zrodle — a takich pulapek
// w tym projekcie bylo juz dosc (patrz naglowek openrouter-naglowki.js).
function doPorownania(s) {
  return String(s || "").toLowerCase();
}

export function pasujeDoSzukania(model, fraza) {
  const f = doPorownania(fraza).trim();
  if (!f) return true;
  return (
    doPorownania(model.id).includes(f) || doPorownania(model.label).includes(f)
  );
}

// --- FILTRY -------------------------------------------------------------------

export const FILTRY_DOMYSLNE = {
  fraza: "",
  // =========================================================================
  //  TYLKO Z DEKLARACJA NARZEDZI — DOMYSLNIE WYLACZONY, I TO JEST DECYZJA.
  //
  //  Zmierzone w rundzie 2: 66 z 336 modeli nie wymienia „tools"
  //  w supported_parameters, a `openrouter/fusion` — jeden z tych 66 —
  //  wywolal narzedzia poprawnie, ze zrodlami. Filtr wlaczony domyslnie
  //  schowalby 66 pozycji, w tym co najmniej jedna dzialajaca, i zrobilby
  //  to bez slowa. Uzytkownik moze go wlaczyc; my go nie narzucamy.
  // =========================================================================
  tylkoZNarzedziami: false,
  tylkoDarmowe: false,
  tylkoWlaczone: false,
  wytworca: "", // pusty = wszyscy
};

// Jedno miejsce, w ktorym filtry sa stosowane. Kolejnosc nie ma znaczenia
// dla wyniku (wszystkie sa koniunkcja), ma za to dla czytania: od najtanszego
// sprawdzenia do najdrozszego.
export function odfiltruj(modele, filtry, wlaczoneKlucze) {
  const f = { ...FILTRY_DOMYSLNE, ...(filtry || {}) };
  const wlaczone = wlaczoneKlucze instanceof Set ? wlaczoneKlucze : new Set();

  return (Array.isArray(modele) ? modele : []).filter((m) => {
    if (f.tylkoZNarzedziami && !m.deklarujeTools) return false;
    if (f.tylkoDarmowe && !m.darmowy) return false;
    if (f.wytworca && m.wytworca !== f.wytworca) return false;
    if (f.tylkoWlaczone && !wlaczone.has(kluczModelu(m.provider, m.id))) {
      return false;
    }
    return pasujeDoSzukania(m, f.fraza);
  });
}

// Lista wytworcow do listy rozwijanej — z DANYCH, nie wpisana.
// Katalog OpenRoutera ma ich kilkadziesiat i zmieniaja sie bez naszego udzialu.
export function wytworcyZKatalogu(modele) {
  const zbior = new Set(
    (Array.isArray(modele) ? modele : []).map((m) => m.wytworca).filter(Boolean),
  );
  return [...zbior].sort((a, b) => a.localeCompare(b));
}

// Licznik „N z M, wlaczonych: K".
//  N — po filtrach, M — caly katalog, K — wlaczone SPOSROD WIDOCZNYCH.
//
// K liczymy z widocznych, nie z calosci konta, bo licznik stoi nad ta lista
// i ma opisywac to, na co uzytkownik patrzy. Inaczej przy filtrze „tylko
// darmowe" pokazywalby „wlaczonych: 7" nad lista, w ktorej wlaczone sa dwa.
export function policz(wszystkie, widoczne, wlaczoneKlucze) {
  const wlaczone = wlaczoneKlucze instanceof Set ? wlaczoneKlucze : new Set();
  const w = Array.isArray(widoczne) ? widoczne : [];
  return {
    widoczne: w.length,
    wszystkie: Array.isArray(wszystkie) ? wszystkie.length : 0,
    wlaczone: w.filter((m) => wlaczone.has(kluczModelu(m.provider, m.id))).length,
  };
}

// --- WLACZONE, ALE NIEDOSTEPNE ------------------------------------------------

// =============================================================================
//  MODELE Z BAZY, KTORYCH NIE MA W BIEZACYM KATALOGU.
//
//  Lista dopuszczonych zyje w bazie i przezywa katalog. Model, ktory zniknal
//  z OpenRoutera (albo zostal usuniety z Ollamy), zostaje wlaczony na koncie,
//  ale NIE MA GO W ZADNYM WIERSZU LISTY — czyli nie ma przelacznika, ktorym
//  dalo by sie go wylaczyc. Stan bez wyjscia w interfejsie jest gorszy niz brak
//  funkcji: konto liczy model, ktorego uzytkownik nie widzi i nie moze ruszyc.
//
//  KATALOG, KTORY SIE NIE WCZYTAL, NIE JEST KATALOGIEM PUSTYM. `null` znaczy
//  „nie wiem" i nie daje werdyktu o zadnym modelu tego dostawcy. Gdyby przyjac
//  tu pusta tablice, kazda czkawka OpenRoutera oglaszalaby, ze wszystkie modele
//  konta zniknely u dostawcy — a one sa na miejscu.
//
//  DWA POWODY, BO SA TO DWIE ROZNE SYTUACJE:
//   • "znikl"       — katalog tego dostawcy MAMY i modelu w nim nie ma.
//   • "brak-katalogu" — ta karta w ogole nie pokazuje katalogu tego dostawcy
//     (baza przyjmuje tez anthropic i openai — patrz PROVIDERS w
//     lib/config/models.js). Model nie zniknal; my go tu nie listujemy.
//     Napisanie „zniknal z katalogu dostawcy" byloby w tym wypadku falszem.
//
//  Wynik ma KSZTALT REKORDU KATALOGU ({ id, label, provider }), a nie wiersza
//  bazy ({ model_id }) — dzieki temu wchodzi prosto w te sama funkcje
//  przelaczania i te sama blokade przypisan, co zwykly wiersz listy.
// =============================================================================
export function niedostepneWlaczone(dopuszczone, katalogi) {
  const mapa = katalogi && typeof katalogi === "object" ? katalogi : {};

  const znane = new Map();
  for (const [provider, lista] of Object.entries(mapa)) {
    if (!Array.isArray(lista)) continue; // null/undefined = brak werdyktu
    znane.set(provider, new Set(lista.map((m) => kluczModelu(m.provider, m.id))));
  }

  // ANI JEDEN KATALOG SIE NIE WCZYTAL — nie orzekamy o niczym. Bez tego progu
  // sam brak argumentu (albo dwa rownoczesne bledy sieci) oglaszalby wszystkie
  // modele konta jako niedostepne. „Nic nie wiem" to nie to samo co „nic nie ma".
  if (znane.size === 0) return [];

  const wynik = [];
  for (const m of Array.isArray(dopuszczone) ? dopuszczone : []) {
    if (!m?.provider || !m?.model_id) continue;

    const maKatalog = Object.prototype.hasOwnProperty.call(mapa, m.provider);
    const zbior = znane.get(m.provider);

    let powod = null;
    if (!maKatalog) powod = "brak-katalogu";
    else if (zbior && !zbior.has(kluczModelu(m.provider, m.model_id))) powod = "znikl";
    if (!powod) continue; // jest w katalogu albo katalog sie nie wczytal

    wynik.push({
      id: m.model_id,
      // Migawka nazwy z bazy to jedyne, co zostalo — katalogu z nazwa juz nie
      // ma. Gdy i jej brak, identyfikator jest lepszy niz pusty wiersz.
      label: m.label || m.model_id,
      provider: m.provider,
      powod,
    });
  }

  return wynik.sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label),
  );
}

// Wyjasnienie do wiersza. Krotkie, bo stoi przy przelaczniku, a nie zamiast
// niego — uzytkownik ma z tego zrozumiec, czemu model jest tu, a nie na liscie.
export function wyjasnienieNiedostepnego(powod, provider) {
  if (powod === "brak-katalogu") {
    return `Ta karta nie pokazuje katalogu dostawcy ${provider} — model jest włączony na koncie, ale nie da się go stąd wybrać.`;
  }
  return "Model zniknął z katalogu dostawcy — jest włączony na koncie, ale nie da się go już wybrać.";
}

// --- BLOKADA WYLACZENIA -------------------------------------------------------

// Nazwy zadan do komunikatu. Klucze zgodne z lib/settings/modeleKonta.js.
export const NAZWY_ZADAN = {
  agent_domyslny: "domyślny model agenta",
  rag_pojecia: "model do pojęć RAG",
  mentor: "model mentora",
};

// Do ktorych zadan przypisany jest dany model. Pusta tablica = wolno wylaczyc.
//
// SPRAWDZAMY PRZED ZAPISEM, nie po. Klucz obcy w bazie ma „on delete set null",
// wiec wylaczenie przypisanego modelu PRZESZLOBY — po cichu zerujac
// przypisanie. Uzytkownik zobaczylby udany zapis i zniknietą konfiguracje.
export function zadaniaKorzystajace(provider, modelId, przypisania) {
  const klucz = kluczModelu(provider, modelId);
  return Object.entries(przypisania || {})
    .filter(([, v]) => v && kluczModelu(v.provider, v.model_id) === klucz)
    .map(([rola]) => rola);
}

// Komunikat blokady. Mowi, DO KTOREGO zadania model jest przypisany —
// „nie mozna wylaczyc" bez tej informacji zostawia uzytkownika ze zgadywanka,
// ktore z trzech pol odpiac.
export function komunikatBlokady(role) {
  const nazwy = (role || []).map((r) => NAZWY_ZADAN[r] || r);
  if (nazwy.length === 0) return null;
  const lista =
    nazwy.length === 1
      ? nazwy[0]
      : `${nazwy.slice(0, -1).join(", ")} i ${nazwy[nazwy.length - 1]}`;
  return `Nie można wyłączyć — ten model jest przypisany jako ${lista}. Najpierw zmień przypisanie.`;
}
