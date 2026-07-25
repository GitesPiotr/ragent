import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Czy konfiguracja w .env.local w ogole jest uzupelniona.
// Bez tego createClient rzuca wyjatkiem JUZ przy imporcie modulu, co w Next.js
// konczy sie bialym ekranem. Wolimy null + czytelny komunikat w UI.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// KLIENT PRZEGLADARKI.
//
// createBrowserClient (z @supabase/ssr) zamiast zwyklego createClient, bo trzyma
// sesje w CIASTECZKACH, a nie w localStorage. Dzieki temu te sama sesje widzi
// takze kod serwerowy (trasy API i proxy) — localStorage jest niedostepny
// po stronie serwera, wiec bez tego logowanie nie doszloby na serwer.
//
// Nazwa pliku i eksport `supabase` celowo BEZ ZMIAN — cala warstwa lib/data/*
// (29 funkcji) importuje go tak samo jak dotad i nie wymaga zadnej edycji.
//
// Kod SERWEROWY nie moze uzywac tego klienta — patrz lib/supabase/server.js.
export const supabase = isSupabaseConfigured
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : null;

// Komunikat dla UI, gdy klucze nie sa uzupelnione.
export const SUPABASE_CONFIG_ERROR =
  "Brak konfiguracji Supabase. Uzupełnij NEXT_PUBLIC_SUPABASE_URL i NEXT_PUBLIC_SUPABASE_ANON_KEY w pliku .env.local, a potem zrestartuj serwer (START.bat).";
