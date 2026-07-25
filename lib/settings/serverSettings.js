// Walidacja ustawień PRZYCHODZĄCYCH OD KLIENTA po stronie serwera.
// Ustawienia z przeglądarki nie są widoczne w kodzie serwerowym, więc klient
// przesyła je w żądaniu — ale serwer NIGDY nie ufa im ślepo: sprawdza zakres /
// listę dozwolonych i w razie czego używa fallbacku (env / stałe).
import { getModelsForProvider } from "@/lib/config/models";
import { MENTOR_MODEL } from "@/lib/config/mentor";
import { KNOWLEDGE_CHAR_LIMIT } from "@/lib/agent/systemPrompt";
import { OLLAMA_BASE_URL } from "@/lib/providers/ollama";
import {
  KNOWLEDGE_LIMIT_MIN,
  KNOWLEDGE_LIMIT_MAX,
} from "@/lib/settings/defaults";

// Model mentora — tylko z listy Anthropic. Inaczej: wartość efektywna z env/stałej.
export function resolveMentorModel(raw) {
  if (
    typeof raw === "string" &&
    getModelsForProvider("anthropic").some((m) => m.id === raw)
  ) {
    return raw;
  }
  return MENTOR_MODEL;
}

// Limit znaków wiedzy — liczba w rozsądnym zakresie. Inaczej: stała domyślna.
export function resolveKnowledgeLimit(raw) {
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  if (!Number.isFinite(n)) return KNOWLEDGE_CHAR_LIMIT;
  return Math.round(
    Math.min(KNOWLEDGE_LIMIT_MAX, Math.max(KNOWLEDGE_LIMIT_MIN, n)),
  );
}

// Adres Ollamy — musi być poprawnym URL http(s). Inaczej: wartość z env/stałej.
export function resolveOllamaUrl(raw) {
  if (typeof raw === "string") {
    try {
      const u = new URL(raw.trim());
      if (u.protocol === "http:" || u.protocol === "https:") {
        // Bez końcowego ukośnika — reszta kodu skleja ścieżki /api/...
        return raw.trim().replace(/\/+$/, "");
      }
    } catch {
      /* zły URL — fallback niżej */
    }
  }
  return OLLAMA_BASE_URL;
}
