"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DEFAULT_SETTINGS } from "./defaults";
import { readSettings, writeSettings, sanitizeSettings } from "./store";
import { useDopuszczone, STAN } from "./DopuszczoneContext";

// JEDNO źródło ustawień dla całej aplikacji. Komponenty czytają przez
// useSettings() i nie dotykają localStorage same z siebie.
//
// SSR-safe (jak resizer): pierwszy render = DEFAULT_SETTINGS (identycznie na
// serwerze i kliencie -> brak błędu hydracji). Odczyt z localStorage dopiero
// w useEffect po zamontowaniu.
const SettingsContext = createContext(null);

// Ustawia/zdejmuje data-theme na <html>. "auto" -> brak atrybutu (decyduje OS).
function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  // `doWalidacji` to tablica DOPIERO, gdy lista naprawdę doszła; wcześniej
  // (i przy 401 / braku migracji) jest null, czyli „nie wiem".
  const { doWalidacji, stan } = useDopuszczone();

  // Odczyt po zamontowaniu (klient). BEZ listy — jeszcze jej nie ma, a
  // sanitizeSettings bez listy niczego nie nadpisuje (patrz store.js).
  useEffect(() => {
    const stored = readSettings();
    setSettings(stored);
    setLoaded(true);
  }, []);

  // UZGODNIENIE Z LISTĄ — WYLICZANE, NIE PRZECHOWYWANE.
  //
  // Przed rundą 6 samoleczenie ustawień (model spoza listy -> pierwszy z listy)
  // działo się przy odczycie, bo lista była pod ręką. Teraz przychodzi później,
  // więc kuszące było dopisanie efektu, który po jej nadejściu nadpisuje stan.
  // ZROBIŁEM INACZEJ, i to nie ze względu na lintera: efekt zapisujący stan
  // przy wczytaniu oznacza zapis do localStorage na każdym wejściu na stronę,
  // a przy okazji drugi render zanim ktokolwiek zobaczy wartość właściwą.
  //
  // Wartość uzgodniona jest funkcją stanu i listy, więc może być liczona
  // w renderze. Do localStorage trafia dopiero przy realnej zmianie
  // (updateSettings), gdzie i tak zapisujemy.
  const efektywne = useMemo(() => {
    if (stan !== STAN.GOTOWE) return settings;
    return sanitizeSettings(settings, { dopuszczone: doWalidacji });
  }, [settings, stan, doWalidacji]);

  // Motyw stosujemy do <html> zawsze, gdy się zmieni — ALE DOPIERO PO ODCZYCIE
  // Z localStorage.
  //
  // Bez bramki na `loaded` ten efekt odpala się na PIERWSZYM commicie, gdy
  // `settings` to jeszcze DEFAULT_SETTINGS: odczyt siedzi w efekcie
  // zadeklarowanym wyżej, a jego wynik dochodzi dopiero następnym renderem.
  // Skutek dla kogoś z zapisanym „jasny": skrypt w layout.js maluje jasno,
  // ten efekt nadpisuje na ciemno, po czym wraca na jasno — czyli mignięcie
  // ciemnym u osoby, która wybrała jasny. Dopóki domyślką było „auto",
  // nie było tego widać, bo applyTheme("auto") tylko zdejmuje atrybut.
  //
  // Bramka nie opóźnia niczego, co widać: do chwili odczytu na <html> stoi
  // atrybut wypisany przez serwer i poprawiony przez skrypt, czyli ta sama
  // wartość, którą ten efekt i tak by ustawił.
  useEffect(() => {
    if (!loaded) return;
    applyTheme(efektywne.theme);
  }, [efektywne.theme, loaded]);

  const updateSettings = useCallback(
    (patch) => {
      setSettings((prev) => {
        const next = sanitizeSettings({ ...prev, ...patch }, { dopuszczone: doWalidacji });
        writeSettings(next, { dopuszczone: doWalidacji });
        return next;
      });
    },
    [doWalidacji],
  );

  const value = useMemo(
    () => ({ settings: efektywne, updateSettings, loaded }),
    [efektywne, updateSettings, loaded],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (ctx === null) {
    throw new Error("useSettings musi być użyte wewnątrz SettingsProvider");
  }
  return ctx;
}
