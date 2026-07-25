import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Czy konfiguracja w .env.local w ogole jest uzupelniona.
// Bez tego createClient rzuca wyjatkiem JUZ przy imporcie modulu, co w Next.js
// konczy sie bialym ekranem. Wolimy null + czytelny komunikat w UI.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Komunikat dla UI, gdy klucze nie sa uzupelnione.
export const SUPABASE_CONFIG_ERROR =
  "Brak konfiguracji Supabase. Uzupełnij NEXT_PUBLIC_SUPABASE_URL i NEXT_PUBLIC_SUPABASE_ANON_KEY w pliku .env.local, a potem zrestartuj serwer (START.bat).";
