// Modele dopuszczone przez konto -> lista do wyboru w interfejsie.
//
// JEDNO MIEJSCE NA REGULE, KTORA WCZESNIEJ BYLA W SIEDMIU. Przed ta runda
// kazdy czytelnik listy modeli mial wlasna: ModelSection bral
// MODELS_BY_PROVIDER, RunnerPicker twardo Anthropic, mentor budowal z tego
// tekst do promptu, a store.js sprawdzal wzgledem tej samej zaszytej listy.
// Cztery kopie tej samej decyzji to cztery miejsca, w ktorych moze sie
// rozjechac.
//
// CZYSTE FUNKCJE, IMPORTY WZGLEDNE — powod ten sam co w rundach 2-5:
// `node --test` nie rozwiazuje aliasu `@/`. Reguly ponizej zmieniaja to,
// co uzytkownik widzi na czterech ekranach, wiec maja byc sprawdzone testem.
import { MODELS_BY_PROVIDER } from "../config/models.js";
import { kluczModelu } from "./modeleKonta.js";

export { kluczModelu };

// =============================================================================
//  KSZTALT REKORDU: { id, label }
//
//  Baza trzyma { provider, model_id, label }, MODELS_BY_PROVIDER trzyma
//  { id, label, supportsTemperature, verified, requiresKey }, Ollama oddaje
//  { id, label }, a katalog OpenRoutera kilkanascie pol. Cztery ksztalty dla
//  jednego pojecia „model do wyboru".
//
//  Sprowadzam je do NAJMNIEJSZEGO WSPOLNEGO, czyli { id, label } — bo to
//  jedyne, co da sie uczciwie podac dla kazdego zrodla. Reszta pol nie znika,
//  tylko przestaje udawac czesc listy:
//   • supportsTemperature -> modelSupportsTemperature(provider, id), ktore
//     zna odpowiedz takze dla modeli spoza MODELS_BY_PROVIDER (i ktorego
//     ta runda nie rusza),
//   • verified/requiresKey -> dotycza DOSTAWCY, nie modelu z listy konta;
//     czyta je dalej ModelSection ze statycznej listy tego dostawcy.
// =============================================================================

// --- ZRODLO LISTY -------------------------------------------------------------

// Trzy mozliwe zrodla, i nazwa zrodla WRACA RAZEM Z LISTA.
// Interfejs musi umiec powiedziec, na co uzytkownik patrzy: „to sa Twoje
// modele" i „to sa domyslne, bo swoich jeszcze nie wybrales" to dwie rozne
// wiadomosci, a lista wyglada tak samo.
export const ZRODLO = {
  KONTO: "konto", // z listy dopuszczonych (Ustawienia -> Modele jezykowe)
  DOMYSLNE: "domyslne", // MODELS_BY_PROVIDER — konto nie ma nic wlasnego
  PUSTE: "puste", // dostawca bez statycznej listy i bez wyboru konta
};

// Wiersze bazy -> { id, label } dla JEDNEGO dostawcy.
export function modeleKonta(dopuszczone, provider) {
  return (Array.isArray(dopuszczone) ? dopuszczone : [])
    .filter((m) => m?.provider === provider && m?.model_id)
    .map((m) => ({ id: m.model_id, label: m.label || m.model_id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Czy konto wybralo cokolwiek — dla CALEGO konta, nie dla jednego dostawcy.
// Pytanie „czy uzytkownik byl juz w Ustawieniach" ma jedna odpowiedz; gdyby
// liczyc per dostawca, konto z samym OpenRouterem dostawaloby przy Anthropic
// komunikat „nie wybrales jeszcze zadnego modelu", co jest nieprawda.
export function kontoMaModele(dopuszczone) {
  return Array.isArray(dopuszczone) && dopuszczone.length > 0;
}

// =============================================================================
//  REGULA FALLBACKU — JEDNA, TU.
//
//  Konto BEZ ani jednego dopuszczonego modelu dostaje MODELS_BY_PROVIDER.
//  To nie jest wygoda, tylko warunek tego, zeby ta runda nie zepsula
//  dzialajacej aplikacji: uzytkownik, ktory nigdy nie wszedl w Ustawienia,
//  ma dalej moc stworzyc agenta. Pusta lista „bo nic nie wybrales" zamienia
//  kreator w slepy zaulek dla kazdego istniejacego konta.
//
//  KONTO, KTORE COS WYBRALO, DOSTAJE DOKLADNIE TO. Bez doklejania domyslnych
//  „na wszelki wypadek" — wybor modeli jest wtedy bez znaczenia, a lista
//  w Ustawieniach klamie.
//
//  UWAGA NA ROZNICE: fallback patrzy na CALE konto (kontoMaModele), a lista
//  na jednego dostawce. Konto z samym OpenRouterem widzi u Anthropic pusto
//  — i tak ma byc, bo swiadomie nie dopuscilo tam nic.
// =============================================================================
export function listaModeli(dopuszczone, provider) {
  if (!kontoMaModele(dopuszczone)) {
    const domyslne = MODELS_BY_PROVIDER[provider] ?? [];
    return {
      modele: domyslne.map((m) => ({ id: m.id, label: m.label })),
      zrodlo: domyslne.length > 0 ? ZRODLO.DOMYSLNE : ZRODLO.PUSTE,
    };
  }
  const moje = modeleKonta(dopuszczone, provider);
  return { modele: moje, zrodlo: moje.length > 0 ? ZRODLO.KONTO : ZRODLO.PUSTE };
}

// --- OLLAMA: PRZECIECIE Z TYM, CO NAPRAWDE CHODZI -----------------------------

// Ollama to jedyny dostawca, u ktorego lista konta moze klamac w druga strone:
// model bywa dopuszczony w Ustawieniach, a potem usuniety z dysku
// (`ollama rm`). Pokazanie go do wyboru konczy sie bledem dopiero przy
// rozmowie, wiec przecinamy liste konta z ta, ktora oddaje demon.
//
// Wynik rozroznia DWA PUSTE, bo znacza co innego dla uzytkownika:
//  • demon nie ma nic          -> „pobierz model" (stan `empty` maszyny stanow)
//  • demon ma, ale nic nie jest dopuszczone -> „wlacz je w Ustawieniach"
export function modeleOllamy(dopuszczone, zDemona) {
  const zywe = (Array.isArray(zDemona) ? zDemona : [])
    .filter((m) => m?.id)
    .map((m) => ({ id: m.id, label: m.label || m.id }));

  if (!kontoMaModele(dopuszczone)) {
    return { modele: zywe, zrodlo: ZRODLO.DOMYSLNE, odfiltrowane: 0 };
  }

  const wybrane = new Set(
    modeleKonta(dopuszczone, "ollama").map((m) => m.id),
  );
  const przeciecie = zywe.filter((m) => wybrane.has(m.id));
  return {
    modele: przeciecie,
    zrodlo: ZRODLO.KONTO,
    odfiltrowane: zywe.length - przeciecie.length,
  };
}

// --- MENTOR -------------------------------------------------------------------

// =============================================================================
//  DOSTAWCA MENTORA ZOSTAJE STALA "anthropic". MODEL — z listy konta.
//
//  ROZSTRZYGNIECIE I POWOD (pytanie z punktu 3 rundy 6):
//
//  Tryb prowadzenia mentora robi DWA wywolania, a drugie leci ze structured
//  output (GUIDED_PROPOSAL_SCHEMA -> responseFormat). Sprawdzone w kodzie
//  dostawcow, nie zalozone:
//   • anthropic.js:119  — output_config.format, DZIALA i jest sprawdzone,
//   • openai.js:213     — komentarz wprost: „NIEZWERYFIKOWANE i obecnie
//                          NIEUZYWANE",
//   • openrouter.js:241 — przekazuje response_format dalej, ale czy model go
//                          uszanuje, zalezy od modelu docelowego,
//   • ollama.js         — responseFormat NIE JEST NAWET PRZEKAZYWANY
//                          (lib/providers/index.js:42 go nie podaje).
//
//  Konsekwencja zlego dostawcy nie jest wyjatkiem: etap 2 oddaje proze
//  zamiast JSON-a, `JSON.parse` rzuca, a trasa ma na to lapacz i zwraca
//  `{ message, step: null, proposal: null }`. Mentor nadal odpowiada — tylko
//  PRZESTAJE COKOLWIEK PROPONOWAC, po cichu i na zawsze. To dokladnie ta
//  klasa awarii, przed ktora ostrzega punkt 4: widac ja jako „dziwne
//  zachowanie", a nie jako blad.
//
//  Dlatego prowadzenie mentora jest funkcja, ktora dziala tylko u Anthropic,
//  a nie preferencja do wyboru.
//
//  CO ZOSTAJE OTWARTE: model mentora dalej pochodzi z `settings.mentorModel`
//  (localStorage przegladarki), a NIE z roli `mentor` w model_assignments.
//  Tabela z rundy 4 jest zapisywana i pokazywana w Ustawieniach, ale zadnego
//  zachowania nie napedza. Runda 6 podpiela liste dopuszczonych (allowed_models)
//  — przypisania to osobna decyzja i osobna zmiana, bo dotyka domyslek
//  w trzech miejscach naraz (lib/settings/defaults.js, lib/config/mentor.js,
//  lib/rag/config.js), a kazde z nich potrafi byc nadpisane zmienna
//  srodowiskowa.
// =============================================================================
export const DOSTAWCA_MENTORA = "anthropic";

// Modele, ktore wolno postawic jako mentora: dopuszczone przez konto ORAZ
// od Anthropic. Konto bez wlasnego wyboru dostaje statyczna liste Anthropic.
export function modeleMentora(dopuszczone) {
  return listaModeli(dopuszczone, DOSTAWCA_MENTORA);
}

// Czy dany identyfikator wolno uzyc jako model mentora.
//
// UWAGA — TU `null` NIE PRZEPUSZCZA WSZYSTKIEGO, inaczej niz przy walidacji
// ustawien w store.js. To sa dwa rozne pytania i mialy dwie rozne odpowiedzi:
//
//   store.js pyta „czy wolno ZOSTAWIC to, co uzytkownik ma zapisane" —
//     tam brak listy musi znaczyc „nie ruszaj", bo nadpisanie kasuje dane.
//   ta funkcja pyta „co WYSLAC do API" — tu brak listy nie moze znaczyc
//     „wyslij cokolwiek".
//
// Przy `null` odpowiedz daje listaModeli(), ktora bez listy konta cofa sie
// na MODELS_BY_PROVIDER.anthropic — czyli DOKLADNIE to sprawdzenie, ktore
// stalo tu przed runda 6. Awaria odczytu bazy nie rozluznia wiec walidacji
// serwera, tylko wraca do zachowania sprzed podpiecia.
export function czyModelMentoraDozwolony(model, dopuszczone) {
  if (typeof model !== "string" || !model.trim()) return false;
  return modeleMentora(dopuszczone).modele.some((m) => m.id === model);
}

// --- TEKST DO PROMPTU MENTORA -------------------------------------------------

// =============================================================================
//  NAJDELIKATNIEJSZE MIEJSCE CALEJ RUNDY (punkt 4).
//
//  To NIE JEST funkcja interfejsu. Jej wynik wchodzi do TRESCI promptu
//  mentora, czyli do zdania, ktore czyta model. Blad nie objawi sie
//  wyjatkiem ani pusta lista — objawi sie tym, ze mentor zaproponuje model,
//  ktorego nie ma, albo przestanie proponowac cokolwiek.
//
//  DLATEGO KSZTALT LINII ZOSTAJE CO DO ZNAKU taki, jak byl przed runda 6:
//     "- <id> (<label>) — <temperatura>"
//  Zmienia sie WYLACZNIE to, skad biora sie pozycje. Gdyby zmienic i zrodlo,
//  i format naraz, nie dalo by sie potem powiedziec, ktora z dwoch zmian
//  odpowiada za inne zachowanie mentora.
//
//  Naglowki grup tez zostaja („Anthropic:", „Lokalne (Ollama):"), ale doszedl
//  trzeci przypadek: konto moze dopuscic modele OpenRoutera, ktorych ten tekst
//  wczesniej nie znal. Naglowek bierze sie z nazwy dostawcy, a nie z wpisanej
//  listy — inaczej doklejenie dostawcy w przyszlosci znow ominie to miejsce.
// =============================================================================
export const NAZWY_DOSTAWCOW = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  ollama: "Lokalne (Ollama)",
};

// Kolejnosc grup — stala, zeby prompt nie zmienial sie miedzy wywolaniami
// przy tej samej zawartosci konta. Model dostajacy raz taka, raz inna
// kolejnosc to niepotrzebny szum w czyms, co ma byc powtarzalne.
const KOLEJNOSC = ["anthropic", "openai", "openrouter", "ollama"];

// Co stoi w nawiasie po identyfikatorze.
//
// DLA OLLAMY TO NIE JEST ETYKIETA MODELU, TYLKO NAPIS „lokalny, Ollama" —
// i zostaje nim CELOWO. Tak wygladal ten tekst przed runda 6
// (app/api/mentor/route.js:168) i zasada tej funkcji brzmi: zmieniamy zrodlo
// pozycji, nie ich format. Gdyby zmienic oba naraz, nie dalo by sie ustalic,
// ktora zmiana odpowiada za inne zachowanie mentora.
//
// OpenRouter nie ma „przed" — tej grupy w promptcie wczesniej nie bylo —
// wiec dostaje etykiete, jak Anthropic i OpenAI.
function opis(provider, label) {
  return provider === "ollama" ? "lokalny, Ollama" : label;
}

// Jedna linia opisu modelu. `temperaturaTak` podaje WOLAJACY, bo odpowiedz
// zna modelSupportsTemperature() z lib/config/models.js — a tej funkcji
// (i jej czterech czytelnikow) ta runda nie rusza.
//
// `brakKlucza` — NAZWA BRAKUJACEJ ZMIENNEJ albo nic. Doklejane na koncu linii,
// bo mentor czytal do tej pory liste, w ktorej model bez klucza wyglada
// DOKLADNIE tak samo jak model gotowy do uzycia: identyfikator, etykieta,
// temperatura. Proponowal go wiec jak kazdy inny, a blad wychodzil dopiero
// przy pierwszej rozmowie z agentem — u agenta, nie u mentora, wiec bez
// szansy, zeby ktokolwiek powiazal jedno z drugim.
//
// BEZ TEGO POLA LINIA ZOSTAJE ZNAK W ZNAK TAKA, JAK BYLA. Sufiks pojawia sie
// wylacznie tam, gdzie klucza faktycznie brakuje — dzieki temu test przypinajacy
// format („PRZED/PO: format linii nie zmienil sie co do znaku") dalej opisuje
// prawde o zwyklym przypadku.
function linia(provider, id, label, temperaturaTak, brakKlucza) {
  const temp = temperaturaTak
    ? "temperatura: tak"
    : "temperatura: NIE (model sam dobiera losowość)";
  const klucz = brakKlucza
    ? ` — BRAK KLUCZA ${brakKlucza}: tego modelu NIE DA SIĘ uruchomić`
    : "";
  return `- ${id} (${opis(provider, label)}) — ${temp}${klucz}`;
}

// Buduje tekst listy modeli do promptu mentora.
//
//   grupy — [{ provider, modele: [{id,label}], brakKlucza }] w dowolnej kolejnosci
//           (brakKlucza = nazwa brakujacej zmiennej srodowiskowej albo nic)
//   czyTemperatura(provider, id) -> boolean
//   ollamaNiedostepna — komunikat zamiast grupy lokalnej (albo null)
// =============================================================================
//  DOPASOWANIE IDENTYFIKATORA MODELU DO KATALOGU — DLA PROPOZYCJI MENTORA.
//
//  Mentor proponuje model TEKSTEM, przepisanym z listy powyzej przez drugi
//  model (ekstraktor). Panel z takiej propozycji ustawial dotad SAM `model`,
//  zostawiajac `provider` bez zmian — a lista w prompcie zawiera takze modele
//  OpenAI, OpenRoutera i Ollamy. Agent dostawal wiec model jednego dostawcy
//  wyslany do drugiego i wywracal sie dopiero przy pierwszej rozmowie.
//
//  Zeby ustawic dostawce, trzeba wiedziec, CZYJ jest ten model — i tylko
//  katalog to wie. Stad ta funkcja.
//
//  DWA STOPNIE DOPASOWANIA, W TEJ KOLEJNOSCI:
//   1. dokladne — jedyne, ktore liczy sie dla OpenRoutera, gdzie identyfikator
//      ma postac "dostawca/model" i kropki w nim SA znaczace,
//   2. tolerancyjne — male litery i kropki potraktowane jak myslniki, bo
//      wiedza AIDEAS i etykiety pisza „Haiku 4.5", a identyfikator brzmi
//      „claude-haiku-4-5"; ekstraktor myli te dwie postacie.
//
//  ZWRACANE `id` JEST ZAWSZE Z KATALOGU, nie z wypowiedzi modelu. To jest
//  cel drugiego stopnia: do kreatora ma trafic identyfikator, ktory istnieje,
//  a nie ten, ktory ladnie wygladal w zdaniu.
//
//  Brak trafienia -> null. Wolajacy ma wtedy NIE proponowac niczego: model
//  spoza katalogu to albo literowka, ktorej nie da sie odgadnac, albo nazwa
//  wymyslona — a cicha podmiana dostawcy jest dokladnie ta awaria, ktora ta
//  funkcja ma zamykac.
// =============================================================================
function znormalizujId(id) {
  return String(id).toLowerCase().replace(/\./g, "-");
}

// katalog — [{ provider, id }] w kolejnosci, w ktorej mentor widzial modele.
// Przy dwoch trafieniach wygrywa PIERWSZE, czyli ten sam porzadek, ktory
// uzytkownik czytal w wypowiedzi mentora.
//
// ZWRACA WPIS Z KATALOGU, nie skrojona pare {provider, id}. Wolajacy dokleja
// do pozycji takze inne fakty o modelu (dzis: `brakKlucza`) i musi je odzyskac
// razem z trafieniem — inaczej szukalby tego samego wpisu drugi raz.
export function dopasujModel(katalog, id) {
  if (typeof id !== "string" || !id.trim()) return null;
  const lista = (Array.isArray(katalog) ? katalog : []).filter(
    (m) => m?.provider && typeof m?.id === "string" && m.id,
  );

  const szukany = id.trim();
  const dokladne = lista.find((m) => m.id === szukany);
  if (dokladne) return dokladne;

  const luzny = znormalizujId(szukany);
  return lista.find((m) => znormalizujId(m.id) === luzny) || null;
}

export function tekstDostepnychModeli(grupy, czyTemperatura, ollamaNiedostepna) {
  const wg = new Map(
    (Array.isArray(grupy) ? grupy : []).map((g) => [
      g.provider,
      { modele: g.modele || [], brakKlucza: g.brakKlucza || null },
    ]),
  );
  const lines = [];

  for (const provider of KOLEJNOSC) {
    const { modele, brakKlucza } = wg.get(provider) || {
      modele: [],
      brakKlucza: null,
    };

    if (provider === "ollama" && modele.length === 0) {
      // Zdanie zostaje co do slowa takie jak przed runda 6 — z „nie proponuj
      // modeli lokalnych" wlacznie. To jest INSTRUKCJA dla modelu, nie opis
      // stanu, i jej usuniecie zmienialoby zachowanie mentora.
      lines.push(
        `${NAZWY_DOSTAWCOW.ollama}: niedostępne${
          ollamaNiedostepna ? ` (${ollamaNiedostepna})` : ""
        } — nie proponuj modeli lokalnych.`,
      );
      continue;
    }
    if (modele.length === 0) continue;

    lines.push(`${NAZWY_DOSTAWCOW[provider] || provider}:`);
    for (const m of modele) {
      lines.push(
        linia(
          provider,
          m.id,
          m.label,
          czyTemperatura(provider, m.id),
          brakKlucza,
        ),
      );
    }
  }

  return lines.join("\n");
}
