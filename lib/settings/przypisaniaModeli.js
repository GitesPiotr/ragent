// Ktory model do ktorego zadania — JEDNA REGULA KOLEJNOSCI dla trzech rol.
//
// CZYSTE FUNKCJE, IMPORTY WZGLEDNE Z ROZSZERZENIEM — powod ten sam co
// w rundach 2-7: `node --test` nie rozwiazuje aliasu `@/`, a ta regula
// decyduje o tym, ktory model naprawde odpowiada uzytkownikowi.

// =============================================================================
//  KOLEJNOSC ROZSTRZYGANIA — TA SAMA DLA WSZYSTKICH TRZECH ROL
//
//      1. PRZYPISANIE Z BAZY        (model_assignments, migracja 020)
//      2. DOTYCHCZASOWE ZRODLO      (localStorage albo zmienna srodowiskowa)
//      3. STALA W KODZIE            (defaults.js / mentor.js / rag/config.js)
//
//  PRZYPISANIE `null` ZNACZY „ODESLIJ DO KODU", A NIE „UZYJ null".
//  To decyzja z rundy 4 i trzymamy sie jej co do joty. Uzasadnienie stamtad,
//  bo jest nadal aktualne: domyslki zyja w trzech miejscach i kazde bywa
//  nadpisane zmienna srodowiskowa. Zapisanie w bazie ich AKTUALNEJ wartosci
//  zamrozilo by ja — zmiana MENTOR_MODEL w .env.local przestala by cokolwiek
//  zmieniac dla kont, ktore raz zapisaly ustawienia. Null odsyla do tamtych
//  miejsc, zamiast kopiowac ich zawartosc.
//
//  KAZDY SZCZEBEL MOZE ODPASC OSOBNO. Przypisanie niekompletne (sam dostawca
//  bez modelu) albo odrzucone przez walidator NIE przeskakuje od razu do
//  stalej — schodzi o JEDEN szczebel, do dotychczasowego zrodla. Inaczej
//  jedno zle przypisanie kasowaloby ustawienie, ktore uzytkownik ma zapisane
//  i widzi w interfejsie.
//
//  ZRODLO WRACA RAZEM Z WYNIKIEM. Bez tego nie da sie odpowiedziec na jedyne
//  pytanie, ktore uzytkownik zada, gdy cos pojdzie nie tak: „dlaczego mowi
//  do mnie TEN model". Interfejs i logi maja to czym wypisac.
// =============================================================================

export const ZRODLO = {
  PRZYPISANIE: "przypisanie",
  USTAWIENIA: "ustawienia", // localStorage albo zmienna srodowiskowa
  STALA: "stala",
  BRAK: "brak",
};

// Czy kandydat nadaje sie do uzycia. Para (dostawca, model) MUSI byc pelna:
// sam model bez dostawcy nie mowi, dokad wyslac zadanie, a sam dostawca bez
// modelu nie mowi, o co poprosic.
function kompletny(k) {
  return Boolean(
    k &&
      typeof k.provider === "string" &&
      k.provider.trim() &&
      typeof k.model === "string" &&
      k.model.trim(),
  );
}

// Pierwszy kandydat, ktory jest kompletny I przechodzi walidator.
//
// `czyDozwolony(provider, model)` jest opcjonalny — bez niego liczy sie sama
// kompletnosc. Podaje go wolajacy, bo warunek „wolno" jest inny dla kazdej
// roli: mentor musi byc od Anthropic, model agenta musi byc na liscie
// dopuszczonych, a model pojec nie ma dzis zadnego ograniczenia poza tym,
// ze dostawca musi byc obslugiwany przez rdzen RAG.
export function rozstrzygnij(kandydaci, czyDozwolony) {
  const lista = Array.isArray(kandydaci) ? kandydaci : [];
  for (const k of lista) {
    if (!kompletny(k)) continue;
    const provider = k.provider.trim();
    const model = k.model.trim();
    if (czyDozwolony && !czyDozwolony(provider, model)) continue;
    return { provider, model, zrodlo: k.zrodlo || ZRODLO.BRAK };
  }
  return { provider: null, model: null, zrodlo: ZRODLO.BRAK };
}

// Wiersz przypisan z bazy -> kandydat. Kluczowe miejsce, w ktorym `null`
// zamienia sie w „pomin ten szczebel", a nie w wartosc.
export function zPrzypisania(przypisania, rola) {
  const p = przypisania?.[rola];
  if (!p) return null; // brak roli albo jawny null — odsylamy dalej
  return {
    zrodlo: ZRODLO.PRZYPISANIE,
    provider: p.provider,
    model: p.model_id ?? p.model,
  };
}
