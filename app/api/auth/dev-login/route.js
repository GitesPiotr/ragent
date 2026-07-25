import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LOGOWANIE DEWELOPERSKIE — jednym klikiem, ale BEZ tylnych drzwi.
//
// To NIE jest obejscie uwierzytelniania. Endpoint wykonuje DOKLADNIE to samo
// signInWithPassword co zwykly formularz — tyle ze dane logowania bierze
// z .env.local, zeby nie trzeba bylo ich wpisywac przy kazdym starcie.
// Zle haslo albo nieistniejace konto = odmowa, tak samo jak w formularzu.
// Powstala sesja jest zwyczajna sesja uzytkownika: po wlaczeniu RLS bedzie
// podlegac tym samym politykom co kazda inna.
//
// TRZY BEZPIECZNIKI:
//   1. 404 na produkcji (NODE_ENV === "production"),
//   2. 404 gdy brakuje DEV_LOGIN_EMAIL / DEV_LOGIN_PASSWORD,
//   3. przycisk w UI pokazuje sie dopiero, gdy GET potwierdzi dostepnosc.
//
// Zmienne NIE maja prefiksu NEXT_PUBLIC_, wiec nigdy nie trafiaja do przegladarki.

function devLoginAvailable() {
  if (process.env.NODE_ENV === "production") return false;
  return Boolean(process.env.DEV_LOGIN_EMAIL && process.env.DEV_LOGIN_PASSWORD);
}

// Czy pokazac przycisk. Zwraca wylacznie true/false — nigdy emaila ani hasla.
export async function GET() {
  return NextResponse.json({ available: devLoginAvailable() });
}

export async function POST() {
  if (!devLoginAvailable()) {
    // 404, a nie 403 — na produkcji ten endpoint ma nie istniec.
    return NextResponse.json({ error: "Nie znaleziono." }, { status: 404 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Brak konfiguracji Supabase. Uzupełnij .env.local." },
      { status: 500 },
    );
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.DEV_LOGIN_EMAIL,
    password: process.env.DEV_LOGIN_PASSWORD,
  });

  if (error) {
    return NextResponse.json(
      {
        error:
          "Logowanie deweloperskie nie powiodło się. Sprawdź, czy konto z DEV_LOGIN_EMAIL " +
          "istnieje w Supabase (Authentication → Users) i czy hasło w .env.local się zgadza. " +
          `Szczegóły: ${error.message}`,
      },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
