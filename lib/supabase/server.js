import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// KLIENT SERWEROWY (trasy API, komponenty serwerowe).
//
// To FABRYKA, nie singleton — w odroznieniu od klienta przegladarki. Powod:
// klient serwerowy czyta ciasteczka przez cookies() z next/headers, a to jest
// dostepne WYLACZNIE w kontekscie zadania. Klient utworzony raz przy imporcie
// modulu nie mialby z czego odczytac sesji.
//
// Dziala na kluczu ANON + sesji zalogowanego uzytkownika z ciasteczek.
// service_role NIE jest tu uzywany i nie ma go w projekcie — zapytania ida
// z tozsamoscia uzytkownika, wiec po wlaczeniu RLS (kolejne sesje) beda
// podlegac tym samym politykom co zapytania z przegladarki.
export async function createClient() {
  if (!isSupabaseConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Wywolane z komponentu serwerowego, ktory nie moze pisac ciasteczek.
          // Odswiezanie sesji robi proxy.js, wiec mozna to bezpiecznie pominac.
        }
      },
    },
  });
}

// Zwraca zalogowanego uzytkownika albo null. Uzywa getUser() (nie getSession()),
// bo getUser() weryfikuje token po stronie Supabase — getSession() ufa
// ciasteczku, ktore moglo zostac podrobione.
export async function getUser() {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ?? null;
}
