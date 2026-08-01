// GET/PUT /api/settings/models — lista modeli wlaczonych przez uzytkownika
// i przypisania "ktory model do czego", trwale w bazie (migracja 020).
//
// =============================================================================
//  TOZSAMOSC WYLACZNIE Z SESJI
//
//  owner_id NIE JEST PRZYJMOWANE Z CIALA ZADANIA i nie ma tu ani jednej
//  linii, ktora by je stamtad czytala. Bierze sie z dwoch miejsc naraz:
//    • getUser() — weryfikuje token po stronie Supabase (lib/supabase/server.js:44:
//      getSession() ufa ciasteczku, ktore moglo zostac podrobione),
//    • default auth.uid() na kolumnie + polityka RLS z migracji 020 — czyli
//      nawet gdyby ktos kiedys dopisal owner_id do insertu, baza odrzuci wiersz
//      niezgodny z sesja.
//
//  Dwie warstwy sa tu celowo. Sama sesja bez RLS chroni tylko tak dobrze, jak
//  dobrze napisano kazde zapytanie; samo RLS bez getUser() nie da czytelnego
//  401, tylko pusta liste.
//
//  ZAPIS JEST CALOSCIOWY (PUT, nie PATCH). Lista dopuszczonych i przypisania
//  ida razem, bo przypisanie musi wskazywac model Z TEJ SAMEJ listy. Przy
//  dwoch osobnych zapisach istnialoby okno, w ktorym lista jest juz nowa,
//  a przypisanie wskazuje model wlasnie usuniety — i odwrotnie, zaleznie
//  od kolejnosci, ktorej klient nie ma powodu znac.
//
//  UI TEGO JESZCZE NIE UZYWA. Rundy 5 i 6 — patrz naglowek migracji 020.
// =============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PROVIDERS } from "@/lib/config/models";
import {
  znormalizujDopuszczone,
  znormalizujPrzypisania,
  przypisaniaDoOdpowiedzi,
} from "@/lib/settings/modeleKonta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function blad(message, status) {
  return NextResponse.json({ error: message }, { status });
}

// Wspolny poczatek obu metod: klient, sesja, czytelny komunikat przy braku
// jednego albo drugiego.
async function polacz() {
  const supabase = await createClient();
  if (!supabase) {
    return { odpowiedz: blad("Brak konfiguracji Supabase. Uzupełnij .env.local.", 503) };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { odpowiedz: blad("Wymagane zalogowanie.", 401) };

  return { supabase, user };
}

// Czy blad znaczy "migracji 020 jeszcze nie uruchomiono".
//
// SPRAWDZONE NA ZYWO, NIE ZGADNIETE. Pierwsza wersja tej funkcji patrzyla
// na kod 42P01 i tekst "does not exist" — czyli na to, co zglasza POSTGRES.
// Zapytanie nie dochodzi jednak do Postgresa: odbija sie o PostgREST, ktory
// trzyma wlasny podreczny opis schematu i odpowiada
//   PGRST205: Could not find the table 'public.allowed_models' in the schema cache
// Zadne z dwoch pierwotnych sprawdzen tego nie lapalo i uzytkownik dostawal
// ten napis wprost, ze statusem 500.
//
// Warianty postgresowe zostaja — trafia sie, gdy zapytanie idzie z pominieciem
// podrecznego opisu (rpc, wywolania serwerowe).
function czyBrakTabel(err) {
  const kod = err?.code || "";
  const tekst = err?.message || "";
  return (
    kod === "PGRST205" ||
    kod === "42P01" ||
    /schema cache/i.test(tekst) ||
    /does not exist/i.test(tekst)
  );
}

const BRAK_TABEL =
  "Tabele modeli konta nie istnieją. Uruchom supabase/020_modele_konta.sql w SQL Editorze.";

export async function GET() {
  const { supabase, odpowiedz } = await polacz();
  if (odpowiedz) return odpowiedz;

  // Bez filtra po wlascicielu — robi to RLS (migracja 020), tak samo jak
  // w /api/knowledge/[id]. Dopisanie .eq("owner_id", user.id) byloby drugim
  // miejscem z ta sama regula.
  const { data: dopuszczone, error: bladListy } = await supabase
    .from("allowed_models")
    .select("provider, model_id, label, created_at")
    .order("provider")
    .order("model_id");

  if (bladListy) {
    if (czyBrakTabel(bladListy)) return blad(BRAK_TABEL, 503);
    return blad("Nie udało się odczytać listy modeli: " + bladListy.message, 500);
  }

  // maybeSingle, nie single: konto, ktore nigdy nic nie zapisalo, NIE MA
  // wiersza przypisan i to jest stan poprawny, a nie blad.
  const { data: wiersz, error: bladPrzypisan } = await supabase
    .from("model_assignments")
    .select("*")
    .maybeSingle();

  if (bladPrzypisan) {
    if (czyBrakTabel(bladPrzypisan)) return blad(BRAK_TABEL, 503);
    return blad("Nie udało się odczytać przypisań: " + bladPrzypisan.message, 500);
  }

  return NextResponse.json({
    dopuszczone: dopuszczone || [],
    przypisania: przypisaniaDoOdpowiedzi(wiersz),
  });
}

export async function PUT(request) {
  const { supabase, user, odpowiedz } = await polacz();
  if (odpowiedz) return odpowiedz;

  let cialo;
  try {
    cialo = await request.json();
  } catch {
    return blad("Nieprawidłowe ciało żądania (oczekiwano JSON).", 400);
  }

  // --- 1) Lista dopuszczonych --------------------------------------------
  // Lista dostawcow z JEDNEGO miejsca — lib/config/models.js. Baza jej nie
  // powtarza (uzasadnienie w migracji 020).
  const { przyjete, odrzucone: odrzuconeModele } = znormalizujDopuszczone(
    cialo?.dopuszczone,
    { dostawcy: PROVIDERS.map((p) => p.id) },
  );

  // --- 2) Przypisania, sprawdzane wzgledem NOWEJ listy --------------------
  // Wzgledem nowej, nie zapisanej — inaczej dalo by sie przypisac model,
  // ktory to samo zadanie wlasnie usuwa z listy.
  const { wiersz, odrzucone: odrzuconePrzypisania } = znormalizujPrzypisania(
    cialo?.przypisania,
    przyjete,
  );

  // --- 3) Zapis listy: usun to, czego nie ma, dopisz reszte ---------------
  //
  // KOLEJNOSC JEST TRESCIOWA — i to jest jej uzasadnienie:
  //   1. kasujemy modele wypisane z listy,
  //   2. dopisujemy nowe modele,
  //   3. DOPIERO POTEM zapisujemy przypisania (dalej, punkt 4).
  //
  // Przypisania musza isc OSTATNIE, bo klucze obce z migracji 020 maja
  // "on delete set null": skasowanie modelu PO zapisaniu przypisania do niego
  // wyzerowaloby je z powrotem, a odpowiedz twierdzilaby, ze sie zapisalo.
  //
  // PostgREST nie ma czytelnego "delete where (provider, model_id) not in
  // (pary)". Zamiast walczyc ze skladnia filtrow czytamy stan i kasujemy po
  // identyfikatorach — jedno zapytanie wiecej, ale warunek jest w JavaScripcie,
  // gdzie widac go wprost.
  const zachowaj = przyjete.map((m) => `${m.provider}:${m.model_id}`);

  const { data: obecne, error: bladOdczytu } = await supabase
    .from("allowed_models")
    .select("id, provider, model_id");

  if (bladOdczytu) {
    if (czyBrakTabel(bladOdczytu)) return blad(BRAK_TABEL, 503);
    return blad("Nie udało się odczytać listy modeli: " + bladOdczytu.message, 500);
  }

  const maZostac = new Set(zachowaj);
  const doKasacji = (obecne || [])
    .filter((m) => !maZostac.has(`${m.provider}:${m.model_id}`))
    .map((m) => m.id);

  if (doKasacji.length > 0) {
    const { error } = await supabase
      .from("allowed_models")
      .delete()
      .in("id", doKasacji);
    if (error) return blad("Nie udało się usunąć modeli: " + error.message, 500);
  }

  if (przyjete.length > 0) {
    // upsert po (owner_id, provider, model_id) — unikat z migracji 020.
    //
    // owner_id PODAJEMY JAWNIE, mimo ze kolumna ma default auth.uid().
    // Powod jest praktyczny: kolumna konfliktowa musi byc w danych, zeby
    // PostgREST mial czym rozstrzygnac ON CONFLICT. Poleganie na defaulcie
    // dzialaloby albo nie, zaleznie od wersji — a to nie jest rzecz, ktora
    // chce sie odkrywac na produkcji.
    //
    // TO NIE JEST WYLOM W "TOZSAMOSC WYLACZNIE Z SESJI": user.id pochodzi
    // z getUser(), czyli z tokenu zweryfikowanego u Supabase, a nie z ciala
    // zadania. Gdyby ktos podmienil te wartosc, polityka RLS z migracji 020
    // (with check auth.uid() = owner_id) odrzuci wiersz.
    const doZapisu = przyjete.map((m) => ({ ...m, owner_id: user.id }));
    const { error } = await supabase
      .from("allowed_models")
      .upsert(doZapisu, { onConflict: "owner_id,provider,model_id" });
    if (error) {
      if (czyBrakTabel(error)) return blad(BRAK_TABEL, 503);
      return blad("Nie udało się zapisać listy modeli: " + error.message, 500);
    }
  }

  // --- 4) Zapis przypisan -------------------------------------------------
  // Jeden wiersz na konto, owner_id jest kluczem glownym — stad upsert
  // bez pytania, czy wiersz juz istnieje. owner_id podajemy tu JAWNIE,
  // bo onConflict potrzebuje wartosci kolumny konfliktowej w danych;
  // wartosc bierze sie z sesji (user.id), nie z ciala zadania.
  const { error: bladZapisu } = await supabase
    .from("model_assignments")
    .upsert(
      { owner_id: user.id, ...wiersz, updated_at: new Date().toISOString() },
      { onConflict: "owner_id" },
    );

  if (bladZapisu) {
    if (czyBrakTabel(bladZapisu)) return blad(BRAK_TABEL, 503);
    return blad("Nie udało się zapisać przypisań: " + bladZapisu.message, 500);
  }

  // Odrzucone wracaja JAWNIE. Bez tego zapis przypisania do modelu spoza
  // listy wyglada dla uzytkownika jak sukces, a przypisanie znika.
  return NextResponse.json({
    dopuszczone: przyjete,
    przypisania: przypisaniaDoOdpowiedzi(wiersz),
    odrzucone: {
      modele: odrzuconeModele,
      przypisania: odrzuconePrzypisania,
    },
  });
}
