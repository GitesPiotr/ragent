import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxySession";

// PROXY (Next.js 16).
//
// UWAGA NA NAZWE: w Next.js 16 konwencja `middleware` zostala PRZEMIANOWANA na
// `proxy` — plik musi nazywac sie proxy.js, a funkcja `proxy`. Plik o nazwie
// middleware.js nie zostalby uruchomiony (i nie zglosilby bledu — ochrona tras
// po prostu by nie dzialala). Runtime to nodejs i nie jest konfigurowalny.
//
// Odpowiada za DWIE rzeczy:
//   1. odswiezenie sesji przy kazdym zadaniu (przedluzenie logowania),
//   2. szlaban: brak sesji -> przekierowanie na /logowanie.
//
// Zgodnie z dokumentacja Next.js proxy robi wylacznie kontrole OPTYMISTYCZNA
// (czyta sesje z ciasteczka). Wlasciwa izolacja danych to RLS — kolejne sesje.

// Trasy dostepne BEZ zalogowania. Wszystko inne jest chronione, lacznie z /api/*.
const PUBLIC_PATHS = ["/logowanie", "/rejestracja"];
// Endpointy logowania musza byc otwarte, inaczej nie dalo by sie zalogowac.
const PUBLIC_API_PREFIX = "/api/auth/";

function isPublicPath(pathname) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith(PUBLIC_API_PREFIX)) return true;
  return false;
}

// Przenosi CIASTECZKA odswiezonej sesji na inna odpowiedz (401 / redirect).
//
// UWAGA: nie wolno kopiowac calych naglowkow z NextResponse.next() — jest tam
// wewnetrzny naglowek x-middleware-next, ktory kaze Next.js KONTYNUOWAC do
// trasy. Skopiowany na odpowiedz 401 skutecznie ja unieważnia i zadanie
// przechodzi dalej, tak jakby ochrony nie bylo.
function withSessionCookies(target, sessionResponse) {
  for (const cookie of sessionResponse.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  const { user, response, configured } = await updateSession(request);

  // Brak konfiguracji Supabase w .env.local — nie blokujemy ruchu, bo aplikacja
  // i tak pokaze wlasny, czytelny komunikat o brakujacych kluczach.
  if (!configured) return response;

  const publicPath = isPublicPath(pathname);

  // Niezalogowany na trasie chronionej -> ekran logowania.
  if (!user && !publicPath) {
    // API odpowiada 401 (JSON), a nie przekierowaniem — przekierowanie w odpowiedzi
    // na fetch() bylo by dla klienta nieczytelne.
    if (pathname.startsWith("/api/")) {
      return withSessionCookies(
        NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 }),
        response,
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/logowanie";
    url.search = "";
    // Dokad wrocic po zalogowaniu.
    if (pathname && pathname !== "/") url.searchParams.set("powrot", pathname);
    return withSessionCookies(NextResponse.redirect(url), response);
  }

  // Zalogowany na ekranie logowania/rejestracji -> do aplikacji.
  if (user && PUBLIC_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/projekty";
    url.search = "";
    return withSessionCookies(NextResponse.redirect(url), response);
  }

  return response;
}

export const config = {
  // Pomijamy zasoby statyczne — proxy nie ma po co mielic przy kazdym pliku.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
