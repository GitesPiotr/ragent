import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Wylogowanie: kasuje sesje po stronie Supabase i czysci ciasteczka.
// Trasa jest pod /api/auth/*, wiec proxy jej nie blokuje — inaczej wylogowanie
// dzialaloby tylko dla zalogowanych, co samo w sobie jest prawda, ale przy
// wygaslej sesji uzytkownik nie mialby jak wyczyscic ciasteczek.
export async function POST() {
  const supabase = await createClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  return NextResponse.json({ ok: true });
}
