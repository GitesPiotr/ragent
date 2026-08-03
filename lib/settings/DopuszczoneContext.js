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

// Samo pobranie — BEZ setState, zeby dalo sie go uzyc i z efektu,
// i z recznego przeladowania, nie powielajac ciala funkcji.
//
// 401 (wylogowany) i 503 (brak migracji 020) to sytuacje NORMALNE, a nie
// bledy do pokazania: aplikacja ma dzialac dalej na domyslnych
// z MODELS_BY_PROVIDER, a nie zatrzymac sie na czerwonym pasku w kreatorze.
async function pobierz() {
  try {
    const res = await fetch("/api/settings/models", { cache: "no-store" });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      dopuszczone: Array.isArray(d.dopuszczone) ? d.dopuszczone : [],
      przypisania: d.przypisania || {},
    };
  } catch {
    return null;
  }
}

export function DopuszczoneProvider({ children }) {
  const [stan, setStan] = useState(STAN.LADOWANIE);
  const [dane, setDane] = useState({ dopuszczone: [], przypisania: {} });

  useEffect(() => {
    let zywy = true;
    (async () => {
      const wynik = await pobierz();
      if (!zywy) return;
      if (wynik) {
        setDane(wynik);
        setStan(STAN.GOTOWE);
      } else {
        setStan(STAN.BRAK);
      }
    })();
    return () => {
      zywy = false;
    };
  }, []);

  // Reczne przeladowanie — wolane z procedur obslugi zdarzen (np. po zapisie
  // listy w Ustawieniach), nigdy z efektu.
  const wczytaj = useCallback(async () => {
    const wynik = await pobierz();
    if (wynik) {
      setDane(wynik);
      setStan(STAN.GOTOWE);
    } else {
      setStan(STAN.BRAK);
    }
  }, []);

  const value = useMemo(
    () => ({
      // Tablica do budowania list — przy „brak" pusta, czyli wlacza sie
      // fallback na MODELS_BY_PROVIDER (patrz listaModeli()).
      dopuszczone: dane.dopuszczone,
      przypisania: dane.przypisania,
      stan,
      // Do WALIDACJI, nie do wyswietlania: null znaczy „nie wiem" i zabrania
      // orzekania. Rozroznienie jest tu, a nie u wywolujacego, zeby nikt
      // nie musial pamietac, ze pusta tablica przy stanie BRAK klamie.
      doWalidacji: stan === STAN.GOTOWE ? dane.dopuszczone : null,
      przeladuj: wczytaj,
    }),
    [dane, stan, wczytaj],
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
const PUSTY = {
  dopuszczone: [],
  przypisania: {},
  stan: STAN.BRAK,
  doWalidacji: null,
  przeladuj: () => {},
};

export function useDopuszczone() {
  return useContext(DopuszczoneContext) ?? PUSTY;
}
