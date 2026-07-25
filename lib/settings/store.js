// Odczyt i zapis ustawień — JEDNA para funkcji. Dziś: localStorage.
// Jutro (po logowaniu): tu wpina się źródło z bazy per użytkownik.
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  THEMES,
  KNOWLEDGE_LIMIT_MIN,
  KNOWLEDGE_LIMIT_MAX,
  DEFAULT_AGENT_PROVIDERS,
} from "./defaults";
import { getModelsForProvider } from "@/lib/config/models";

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

// Nadpisuje DEFAULT_SETTINGS tylko ZNANYMI, poprawnymi polami. Nieznane klucze
// i błędne typy są ignorowane — dzięki temu stary/uszkodzony wpis nie wysadzi UI.
export function sanitizeSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const out = { ...DEFAULT_SETTINGS };

  if (isHttpUrl(s.ollamaUrl)) out.ollamaUrl = s.ollamaUrl.trim();
  if (THEMES.includes(s.theme)) out.theme = s.theme;
  if (typeof s.showDebugPanel === "boolean") out.showDebugPanel = s.showDebugPanel;

  // Model mentora — tylko z listy Anthropic.
  if (
    typeof s.mentorModel === "string" &&
    getModelsForProvider("anthropic").some((m) => m.id === s.mentorModel)
  ) {
    out.mentorModel = s.mentorModel;
  }
  if (typeof s.autoOpenMentor === "boolean") out.autoOpenMentor = s.autoOpenMentor;

  // Domyślny dostawca + model nowego agenta.
  if (DEFAULT_AGENT_PROVIDERS.includes(s.defaultProvider)) {
    out.defaultProvider = s.defaultProvider;
  }
  if (
    typeof s.defaultModel === "string" &&
    getModelsForProvider(out.defaultProvider).some((m) => m.id === s.defaultModel)
  ) {
    out.defaultModel = s.defaultModel;
  } else {
    // Model niespójny z dostawcą — bierzemy pierwszy z listy dostawcy.
    const first = getModelsForProvider(out.defaultProvider)[0];
    if (first) out.defaultModel = first.id;
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
export function readSettings() {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(settings) {
  if (typeof window === "undefined") return;
  try {
    const clean = sanitizeSettings(settings);
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* zapis niemożliwy — pomijamy */
  }
}
