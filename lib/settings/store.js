// Odczyt i zapis ustawień — JEDNA para funkcji. Dziś: localStorage.
// Jutro (po logowaniu): tu wpina się źródło z bazy per użytkownik.
// Ścieżki względne i Z ROZSZERZENIEM — inaczej `node --test` ich nie znajdzie.
// Powód ten sam co w rundach 2-5: reguła „czego nie wolno nadpisać" niżej
// decyduje o tym, czy użytkownik traci zapisane ustawienie, więc ma być
// sprawdzona testem, a nie klikaniem.
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  THEMES,
  KNOWLEDGE_LIMIT_MIN,
  KNOWLEDGE_LIMIT_MAX,
  DEFAULT_AGENT_PROVIDERS,
} from "./defaults.js";
import { listaModeli } from "./dopuszczoneModele.js";

function clampNumber(value, min, max, fallback) {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// =============================================================================
//  SPRAWDZANIE MODELU WZGLEDEM LISTY, KTORA PRZYCHODZI ASYNCHRONICZNIE
//
//  PROBLEM (postawiony wprost w rundzie 6): ta funkcja jest SYNCHRONICZNA
//  i wola ja `writeSettings` przy kazdej zmianie ustawien, a lista modeli
//  dopuszczonych przez konto przychodzi z trasy — czyli pozniej, i czasem
//  wcale (wylogowany, brak migracji 020).
//
//  CZEGO NIE ZROBILEM I DLACZEGO:
//   • nie zrobilem z tego funkcji async — `writeSettings` jest wolane
//     w reducerze SettingsContext, gdzie nie ma na co czekac,
//   • nie odpytalem trasy stad — to warstwa localStorage, bez sieci,
//   • nie wsadzilem listy do localStorage jako podrecznej kopii — byloby
//     to PIATE miejsce, w ktorym zyje lista modeli, i jedyne bez wlasciciela.
//
//  CO ZROBILEM: lista jest PARAMETREM, a jej brak ma wlasne znaczenie.
//     dopuszczone === null  ->  „NIE WIEM": sprawdzamy tylko typ, wartosci
//                               NIE NADPISUJEMY,
//     dopuszczone === []/[…] ->  werdykt wiazacy: model spoza listy leci
//                               na fallback.
//
//  TO NIE JEST OSTROZNOSC, TYLKO WARUNEK POPRAWNOSCI. Poprzednia wersja przy
//  nieznanym modelu PODMIENIALA go na pierwszy z zaszytej listy. Gdyby
//  zostawic to zachowanie przy nieznanej liscie, uzytkownik z domyslnym
//  modelem `openrouter/fusion` traciłby go na `claude-opus-4-8` przy kazdym
//  zapisie ustawien — cicho, bo zapis konczylby sie sukcesem.
//
//  Ostatecznym straznikiem i tak jest serwer: resolveMentorModel() w trasie
//  mentora ma liste z bazy i orzeka wiazaco. Ta funkcja pilnuje ksztaltu,
//  a nie uprawnien.
// =============================================================================
export function sanitizeSettings(raw, { dopuszczone = null } = {}) {
  const s = raw && typeof raw === "object" ? raw : {};
  const out = { ...DEFAULT_SETTINGS };
  const wiemy = Array.isArray(dopuszczone);

  if (isHttpUrl(s.ollamaUrl)) out.ollamaUrl = s.ollamaUrl.trim();
  if (THEMES.includes(s.theme)) out.theme = s.theme;
  if (typeof s.showDebugPanel === "boolean") out.showDebugPanel = s.showDebugPanel;

  // Model mentora — z modeli Anthropic dopuszczonych przez konto.
  // Dostawca mentora zostaje stala; uzasadnienie w dopuszczoneModele.js.
  if (typeof s.mentorModel === "string" && s.mentorModel) {
    const wolno =
      !wiemy ||
      listaModeli(dopuszczone, "anthropic").modele.some(
        (m) => m.id === s.mentorModel,
      );
    if (wolno) out.mentorModel = s.mentorModel;
  }
  if (typeof s.autoOpenMentor === "boolean") out.autoOpenMentor = s.autoOpenMentor;

  // Domyślny dostawca + model nowego agenta.
  if (DEFAULT_AGENT_PROVIDERS.includes(s.defaultProvider)) {
    out.defaultProvider = s.defaultProvider;
  }
  if (typeof s.defaultModel === "string" && s.defaultModel) {
    const lista = wiemy ? listaModeli(dopuszczone, out.defaultProvider).modele : null;
    if (!lista || lista.some((m) => m.id === s.defaultModel)) {
      out.defaultModel = s.defaultModel;
    } else if (lista.length > 0) {
      // Model niespójny z listą dostawcy — bierzemy pierwszy z tej listy.
      out.defaultModel = lista[0].id;
    }
    // Lista pusta przy ZNANEJ zawartości konta (nic nie dopuszczono u tego
    // dostawcy): zostaje DEFAULT_SETTINGS.defaultModel. Podmiana na „pierwszy
    // z listy" nie ma tu czego wziąć, a wyzerowanie pola dałoby pusty <select>.
  }

  out.defaultTemperature = clampNumber(
    s.defaultTemperature,
    0,
    1,
    DEFAULT_SETTINGS.defaultTemperature,
  );
  out.knowledgeCharLimit = Math.round(
    clampNumber(
      s.knowledgeCharLimit,
      KNOWLEDGE_LIMIT_MIN,
      KNOWLEDGE_LIMIT_MAX,
      DEFAULT_SETTINGS.knowledgeCharLimit,
    ),
  );

  return out;
}

// Odczyt — TYLKO po stronie klienta (localStorage). Na serwerze / przy braku
// dostępu zwraca wartości domyślne (SSR-safe).
//
// Bez listy dopuszczonych: odczyt dzieje się przy montowaniu, zanim trasa
// zdąży odpowiedzieć. Uzgodnienie z listą robi SettingsContext, gdy lista
// dojdzie — tam jest jedyne miejsce, które w ogóle wie, że lista istnieje.
export function readSettings(opcje) {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw), opcje);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(settings, opcje) {
  if (typeof window === "undefined") return;
  try {
    const clean = sanitizeSettings(settings, opcje);
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* zapis niemożliwy — pomijamy */
  }
}
