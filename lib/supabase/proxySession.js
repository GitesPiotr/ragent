import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Odswieza sesje na podstawie ciasteczek zadania i zwraca:
//   { user, response } — gdzie `response` ma juz DOPISANE odswiezone ciasteczka.
//
// To jest jedyne miejsce, ktore przedluza sesje. Token dostepu wygasa po ~1h;
// tutaj jest wymieniany refresh tokenem przy zwyklym ruchu, dzieki czemu
// uzytkownik loguje sie raz i nie jest wyrzucany w trakcie pracy.
//
// WAZNE: kazda odpowiedz zwracana przez proxy musi pochodzic z tego `response`
// (albo przenosic jego ciasteczka), inaczej odswiezona sesja przepadnie.
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured) {
    return { user: null, response, configured: false };
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Ciasteczka trafiaja i do zadania (dla dalszego kodu w tym samym
        // przebiegu), i do odpowiedzi (zeby przegladarka je zapamietala).
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() weryfikuje token u dostawcy — nie ufamy samej zawartosci ciasteczka.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user: user ?? null, response, configured: true };
}
