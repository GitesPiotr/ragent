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

  // Odczyt po zamontowaniu (klient).
  useEffect(() => {
    const stored = readSettings();
    setSettings(stored);
    setLoaded(true);
  }, []);

  // Motyw stosujemy do <html> zawsze, gdy się zmieni.
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = sanitizeSettings({ ...prev, ...patch });
      writeSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ settings, updateSettings, loaded }),
    [settings, updateSettings, loaded],
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
