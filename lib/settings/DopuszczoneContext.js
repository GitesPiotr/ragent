"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Lista modeli dopuszczonych przez konto — JEDNO pobranie na aplikacje.
//
// DLACZEGO KONTEKST, A NIE FETCH W KAZDYM KOMPONENCIE: czytelnikow jest
// czterech (ModelSection, RunnerPicker i dwie sekcje Ustawien), a lista jest
// ta sama. Cztery osobne pobrania to nie tylko cztery zadania, ale tez cztery
// moznliwe odpowiedzi — komponenty pokazywalyby rozne listy w tym samym
// momencie, zaleznie od tego, ktore zadanie wrocilo pierwsze.
//
// LEZY NAD SettingsProvider, i to jest wymuszone: sanitizeSettings musi
// dostac te liste, zeby wiedziec, czy zapisany model wolno zostawic
// (patrz lib/settings/store.js). Odwrotna kolejnosc dostawcow zrobilaby
// z tego cykl.
//
// =============================================================================
//  KONTEKST JEST TEZ PISARZEM, NIE TYLKO CZYTELNIKIEM (runda 9).
//
//  Do tej rundy istnialo `przeladuj`, ale NIKT go nie wolal, a karta „Modele
//  jezykowe" trzymala WLASNA kopie listy i po zapisie odswiezala tylko ja.
//  Skutek widoczny dla uzytkownika: model wlaczony w Ustawieniach nie
//  pojawial sie w kreatorze, w Czatach ani w sekcjach Mentor/Domyslne az do
//  przeladowania strony (F5) — dostawca stoi w app/layout.js, wiec zadna
//  nawigacja go nie montuje ponownie.
//
//  Lekarstwem NIE jest doklejenie pobrania do kazdego czytelnika: czterech
//  czytelnikow pobierajacych po swojemu to dokladnie ten stan, przed ktorym
//  ten kontekst powstal, tylko drozszy. Zamiast tego ZAPIS PRZECHODZI TEDY.
//  Jedno miejsce zmienia liste, wiec jedno miejsce ja aktualizuje, a wszyscy
//  czytelnicy dostaja nowa wartosc tym samym renderem.
//
//  Pobran nie przybywa: nowy stan bierze sie z ODPOWIEDZI NA PUT (trasa
//  oddaje zapisana liste), a nie z dodatkowego GET-a po zapisie.
// =============================================================================

const DopuszczoneContext = createContext(null);

// Trzy stany, bo znacza co innego dla wywolujacego:
//   ladowanie — jeszcze nie wiemy,
//   gotowe    — wiemy; `dopuszczone` jest tablica (mozliwe, ze pusta),
//   brak      — nie dowiemy sie (401, brak tabel, awaria sieci).
//
// „gotowe z pusta tablica" i „brak" to NIE TO SAMO. Pierwsze znaczy „konto
// swiadomie nic nie wybralo", drugie „nie mamy prawa nic twierdzic". Reguly
// w dopuszczoneModele.js rozrozniaja te przypadki, wiec kontekst tez musi.
export const STAN = { LADOWANIE: "ladowanie", GOTOWE: "gotowe", BRAK: "brak" };

// Ksztalt odpowiedzi -> ksztalt stanu. Jedno miejsce, bo odpowiedzi sa dwie
// (GET i PUT) i musza wpasc do kontekstu identycznie. PUT oddaje `dopuszczone`
// bez `created_at`, ale zaden czytelnik tego pola nie uzywa — liczy sie
// { provider, model_id, label }.
function zeStanu(d) {
  return {
    dopuszczone: Array.isArray(d?.dopuszczone) ? d.dopuszczone : [],
    przypisania: d?.przypisania || {},
  };
}

// Samo pobranie — BEZ setState, zeby dalo sie go uzyc i z efektu,
// i z recznego przeladowania, nie powielajac ciala funkcji.
//
// 401 (wylogowany) i 503 (brak migracji 020) to sytuacje NORMALNE, a nie
// bledy do pokazania: aplikacja ma dzialac dalej na domyslnych
// z MODELS_BY_PROVIDER, a nie zatrzymac sie na czerwonym pasku w kreatorze.
//
// KOMUNIKAT MIMO TO WRACA — jako `blad`, obok stanu BRAK. Nie po to, zeby go
// wszedzie pokazywac (kreator i Czaty maja go ignorowac), tylko dlatego, ze
// JEDNO miejsce ma prawo go pokazac: karta „Modele jezykowe" w Ustawieniach.
// Tam „nie wiem" bez powodu jest bezuzyteczne — to strona, na ktorej ta liste
// sie naprawia, a „Uruchom 020_modele_konta.sql" jest jedyna wskazowka, jak.
async function pobierz() {
  try {
    const res = await fetch("/api/settings/models", { cache: "no-store" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        blad: d?.error || `Nie udało się odczytać listy modeli (HTTP ${res.status}).`,
      };
    }
    return { dane: zeStanu(d) };
  } catch (e) {
    return { blad: e?.message || "Nie udało się odczytać listy modeli." };
  }
}

export function DopuszczoneProvider({ children }) {
  const [stan, setStan] = useState(STAN.LADOWANIE);
  const [dane, setDane] = useState({ dopuszczone: [], przypisania: {} });
  const [blad, setBlad] = useState(null);

  // Jedno przyjecie wyniku pobrania — z efektu i z `przeladuj` tak samo.
  const przyjmij = useCallback((wynik) => {
    if (wynik.dane) {
      setDane(wynik.dane);
      setBlad(null);
      setStan(STAN.GOTOWE);
    } else {
      setBlad(wynik.blad || null);
      setStan(STAN.BRAK);
    }
  }, []);

  useEffect(() => {
    let zywy = true;
    (async () => {
      const wynik = await pobierz();
      if (zywy) przyjmij(wynik);
    })();
    return () => {
      zywy = false;
    };
  }, [przyjmij]);

  // Reczne przeladowanie — wolane z procedur obslugi zdarzen (np. z przycisku
  // „Spróbuj ponownie" po nieudanym odczycie), nigdy z efektu.
  const wczytaj = useCallback(async () => {
    przyjmij(await pobierz());
  }, [przyjmij]);

  // =========================================================================
  //  ZAPIS — JEDYNA DROGA, KTORA ZMIENIA LISTE.
  //
  //  Stan bierze sie Z ODPOWIEDZI SERWERA, a nie z tego, co wyslalismy:
  //  trasa potrafi odrzucic model spoza listy dostawcow albo wyczyscic
  //  przypisanie do modelu, ktory ten sam zapis usuwa. Nasza kopia zadania
  //  klamalaby wtedy az do przeladowania strony.
  //
  //  BLAD ZAPISU LECI WYJATKIEM, inaczej niz blad odczytu. To nie jest
  //  niekonsekwencja: nieudany odczyt znaczy „dzialaj na domyslnych" i ma byc
  //  cichy, a nieudany zapis znaczy „to, co wlasnie kliknales, sie nie stalo"
  //  — cichy zostawilby przelacznik w pozycji, ktorej nie ma w bazie.
  //  Stanu przy bledzie NIE RUSZAMY: w kontekscie zostaje ostatnia wartosc
  //  potwierdzona przez serwer.
  // =========================================================================
  const zapisz = useCallback(async (dopuszczone, przypisania) => {
    const res = await fetch("/api/settings/models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dopuszczone, przypisania }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d?.error || "Nie udało się zapisać.");
    setDane(zeStanu(d));
    setBlad(null);
    setStan(STAN.GOTOWE);
    return d;
  }, []);

  const value = useMemo(
    () => ({
      // Tablica do budowania list — przy „brak" pusta, czyli wlacza sie
      // fallback na MODELS_BY_PROVIDER (patrz listaModeli()).
      dopuszczone: dane.dopuszczone,
      przypisania: dane.przypisania,
      stan,
      // Powod stanu BRAK, dla jedynego miejsca, ktore ma prawo go pokazac.
      blad,
      // Do WALIDACJI, nie do wyswietlania: null znaczy „nie wiem" i zabrania
      // orzekania. Rozroznienie jest tu, a nie u wywolujacego, zeby nikt
      // nie musial pamietac, ze pusta tablica przy stanie BRAK klamie.
      doWalidacji: stan === STAN.GOTOWE ? dane.dopuszczone : null,
      przeladuj: wczytaj,
      zapisz,
    }),
    [dane, stan, blad, wczytaj, zapisz],
  );

  return (
    <DopuszczoneContext.Provider value={value}>
      {children}
    </DopuszczoneContext.Provider>
  );
}

// Bez rzucania przy braku dostawcy — inaczej kazdy komponent czytajacy liste
// modeli wymagalby owiniecia takze w testach i w miejscach, ktore o modelach
// nic nie wiedza. Brak dostawcy = „nie wiem", czyli domyslne.
//
// ZAPIS JEST TU WYJATKIEM I RZUCA. Cicha atrapa odczytu jest bezpieczna
// („nie wiem" -> domyslne), cicha atrapa zapisu nie: karta Ustawien dostalaby
// sukces, przestawilaby przelacznik i nic nie trafiloby do bazy.
const PUSTY = {
  dopuszczone: [],
  przypisania: {},
  stan: STAN.BRAK,
  blad: null,
  doWalidacji: null,
  przeladuj: () => {},
  zapisz: async () => {
    throw new Error(
      "Zapis modeli poza DopuszczoneProvider — brak dostawcy w drzewie.",
    );
  },
};

export function useDopuszczone() {
  return useContext(DopuszczoneContext) ?? PUSTY;
}
