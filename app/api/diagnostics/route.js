import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchOllamaModels } from "@/lib/providers/ollama";
import { resolveOllamaUrl } from "@/lib/settings/serverSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostyka połączeń — sprawdza NA ŻYWO stan usług. Kluczy API nigdy nie
// zwracamy — jedynie informację, czy są USTAWIONE (obecność zmiennej env).
// Adres Ollamy przychodzi z ustawień przeglądarki (walidowany serwerowo).

async function checkSupabase() {
  const supabase = isSupabaseConfigured ? await createClient() : null;
  if (!supabase) {
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

// KTO PYTA BAZE Z POZIOMU SERWERA.
//
// To NIE jest to samo co "jestem zalogowany w przegladarce". Sprawdza, czy sesja
// z ciasteczka dociera do KODU SERWEROWEGO — a wiec czy trasy API (ta,
// /api/knowledge/upload oraz loadKnowledgeFilesForAgent uzywany przez /api/chat
// i /api/agent/prompt-preview) pytaja baze JAKO TY, czy anonimowo.
//
// Dopoki RLS jest wylaczony, roznicy nie widac — anonim widzi to samo co Ty.
// Po wlaczeniu RLS anonim nie zobaczy NICZEGO, a objawi sie to pustymi listami
// bez zadnego bledu. Dlatego sprawdzamy to ZAWCZASU, osobnym wskaznikiem.
//
// Wszystkie trasy serwerowe uzywaja tej samej fabryki createClient(), wiec
// wynik ponizej jest reprezentatywny dla nich wszystkich.
//
// getUser() (nie getSession()) — weryfikuje token po stronie Supabase.
async function checkAccount() {
  const supabase = isSupabaseConfigured ? await createClient() : null;
  if (!supabase) {
    return {
      status: "error",
      detail: "Brak konfiguracji (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).",
    };
  }
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        status: "error",
        detail:
          "Serwer NIE widzi Twojej sesji — zapytania do bazy idą anonimowo. " +
          "Wyloguj się i zaloguj ponownie. Jeśli to nie pomoże, nie włączaj " +
          "izolacji danych (RLS): trasy serwerowe przestałyby widzieć dane.",
      };
    }

    return {
      status: "ok",
      detail: `Serwer pyta bazę jako: ${user.email || "(konto bez adresu e-mail)"} · id: ${user.id}`,
    };
  } catch (e) {
    return {
      status: "error",
      detail: `Nie udało się sprawdzić sesji na serwerze: ${e?.message || "nieznany błąd"}`,
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

  const [supabaseStatus, accountStatus, ollamaStatus] = await Promise.all([
    checkSupabase(),
    checkAccount(),
    checkOllama(ollamaUrl),
  ]);

  return NextResponse.json({
    supabase: supabaseStatus,
    account: accountStatus,
    anthropic: checkKey("ANTHROPIC_API_KEY", { required: true }),
    openai: checkKey("OPENAI_API_KEY", { required: false }),
    openrouter: checkKey("OPENROUTER_API_KEY", { required: false }),
    ollama: ollamaStatus,
  });
}
