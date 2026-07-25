import { NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchOllamaModels } from "@/lib/providers/ollama";
import { resolveOllamaUrl } from "@/lib/settings/serverSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostyka połączeń — sprawdza NA ŻYWO stan usług. Kluczy API nigdy nie
// zwracamy — jedynie informację, czy są USTAWIONE (obecność zmiennej env).
// Adres Ollamy przychodzi z ustawień przeglądarki (walidowany serwerowo).

async function checkSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      status: "error",
      detail: "Brak konfiguracji (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).",
    };
  }
  try {
    // Lekki strzał: liczba wierszy bez pobierania danych (HEAD).
    const { error } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true });
    if (error) {
      return {
        status: "warn",
        detail: `Odpowiada, ale zapytanie zwróciło błąd: ${error.message}`,
      };
    }
    return { status: "ok", detail: "Połączono, baza odpowiada." };
  } catch (e) {
    return {
      status: "error",
      detail: `Brak połączenia: ${e?.message || "nieznany błąd"}`,
    };
  }
}

function checkKey(name, { required }) {
  const set = Boolean(process.env[name]?.trim());
  if (set) return { status: "ok", detail: "Klucz ustawiony." };
  return {
    status: required ? "error" : "warn",
    detail: required
      ? "Klucz NIE jest ustawiony (wymagany m.in. przez mentora)."
      : "Klucz nie jest ustawiony (opcjonalny).",
  };
}

async function checkOllama(baseUrl) {
  const { models, error } = await fetchOllamaModels(baseUrl);
  if (error) {
    return { status: "warn", detail: error, models: [], baseUrl };
  }
  return {
    status: models.length > 0 ? "ok" : "warn",
    detail:
      models.length > 0
        ? `Działa. Wykryte modele: ${models.length}.`
        : "Działa, ale nie wykryto żadnych modeli.",
    models: models.map((m) => m.id),
    baseUrl,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ollamaUrl = resolveOllamaUrl(searchParams.get("ollamaUrl"));

  const [supabaseStatus, ollamaStatus] = await Promise.all([
    checkSupabase(),
    checkOllama(ollamaUrl),
  ]);

  return NextResponse.json({
    supabase: supabaseStatus,
    anthropic: checkKey("ANTHROPIC_API_KEY", { required: true }),
    openai: checkKey("OPENAI_API_KEY", { required: false }),
    ollama: ollamaStatus,
  });
}
