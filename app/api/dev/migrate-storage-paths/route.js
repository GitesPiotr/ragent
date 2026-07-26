import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
//  TRASA JEDNORAZOWA — migracja sciezek w Storage.
//  Sesja 5 tematu logowanie/konta/RLS, Etap C.
//
//  PO CO: do Etapu B pliki lezaly w Storage pod <project_id>/<nazwa>.
//  Nowy upload zapisuje je pod <owner_id>/<nazwa>, a polityka bucketu
//  (migracja 013) bedzie sprawdzac wlasnie pierwszy segment sciezki.
//  Pliki wgrane wczesniej musza wiec zmienic sciezke — inaczej w chwili
//  podmiany polityki stana sie dla wlasciciela NIEWIDOCZNE
//  i NIEKASOWALNE, czyli trwalymi sierotami w buckecie.
//
//  URUCHAMIAC PRZED migracja 013, nigdy po. Dopoki obowiazuje stara,
//  otwarta polityka aideas_knowledge_all, wszystkie operacje ponizej sa
//  dozwolone. Po podmianie polityki juz nie beda.
//
//  TA TRASA CZYTA WIERSZE PRZEZ SESJE, wiec widzi wylacznie pliki
//  ZALOGOWANEGO konta (RLS). Przy kilku kontach trzeba ja uruchomic
//  raz na kazdym z nich.
//
//  DO SKASOWANIA po zakonczeniu Sesji 5 (Etap G). Historia gita ja zachowa.
//
//  ------------------------------------------------------------
//  SPOSOB DZIALANIA — wariant OSTROZNY.
//
//  Nie uzywamy storage.move(), tylko rozbijamy go na kroki, zeby zrodlo
//  istnialo do samego konca:
//
//      1. copy(stara, nowa)          — zrodlo nietkniete
//      2. WERYFIKACJA rozmiaru       — czy kopia na pewno sie udala
//      3. update knowledge_files     — wiersz wskazuje juz na kopie
//      4. remove([stara])            — dopiero teraz kasujemy zrodlo
//
//  Kolejnosc 3 przed 4 jest celowa: w zadnym momencie wiersz w bazie nie
//  wskazuje na plik, ktorego nie ma. Najgorsze, co moze zostac po awarii,
//  to nadmiarowa kopia pod stara sciezka — widoczna w raporcie i mozliwa
//  do skasowania recznie.
//
//  Krok 4 NIE wykonuje sie, jesli krok 2 zawiedzie. Wtedy plik zostaje
//  w dwoch miejscach, a raport pokazuje blad — nic nie ginie.
//
//  ------------------------------------------------------------
//  DWA TRYBY:
//    GET  — PROBA NA SUCHO. Tylko odczyt: pokazuje, co by sie stalo.
//    POST — wykonanie.
//
//  Trasa jest IDEMPOTENTNA — mozna ja uruchamiac wielokrotnie. Kolejne
//  uruchomienie na zmigrowanym koncie zwroci same "juz-ok".
// ============================================================

const BUCKET = "knowledge";

// Ta trasa nie ma prawa istniec na produkcji — tak samo jak /api/auth/dev-login.
function dostepna() {
  return process.env.NODE_ENV !== "production";
}

function rozbijSciezke(sciezka) {
  const czesci = String(sciezka || "").split("/");
  const nazwa = czesci.pop() || "";
  return { folder: czesci.join("/"), nazwa };
}

// Czy obiekt istnieje i ile wazy. list() z parametrem search zwraca metadane
// w jednym strzale — dzieki temu nie potrzebujemy osobnego info(), ktorego
// nie ma w starszych wersjach Storage.
async function opiszObiekt(supabase, folder, nazwa) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(folder, { limit: 100, search: nazwa });

  if (error) return { blad: error.message || "nieznany błąd" };

  const trafienie = (data || []).find((o) => o.name === nazwa);
  if (!trafienie) return { istnieje: false };

  return { istnieje: true, rozmiar: trafienie.metadata?.size ?? null };
}

// Ustala, co trzeba zrobic z jednym wierszem — BEZ wykonywania czegokolwiek.
// Dzieki temu proba na sucho i wykonanie ida dokladnie ta sama sciezka kodu
// i nie moga sie rozjechac.
async function zaplanuj(supabase, user, wiersz) {
  const staraSciezka = wiersz.file_path || "";
  const { folder: staryFolder, nazwa } = rozbijSciezke(staraSciezka);
  const nowaSciezka = `${user.id}/${nazwa}`;

  const wspolne = {
    id: wiersz.id,
    file_name: wiersz.file_name,
    z: staraSciezka,
    na: nowaSciezka,
  };

  if (!nazwa) {
    return { ...wspolne, plan: "blad", powod: "Pusta ścieżka w file_path." };
  }
  if (staraSciezka === nowaSciezka) {
    return { ...wspolne, plan: "pomin", powod: "Już w nowym schemacie." };
  }

  const zrodlo = await opiszObiekt(supabase, staryFolder, nazwa);
  if (zrodlo.blad) {
    return { ...wspolne, plan: "blad", powod: `Nie udało się sprawdzić źródła: ${zrodlo.blad}` };
  }

  const cel = await opiszObiekt(supabase, user.id, nazwa);
  if (cel.blad) {
    return { ...wspolne, plan: "blad", powod: `Nie udało się sprawdzić celu: ${cel.blad}` };
  }

  if (!zrodlo.istnieje && !cel.istnieje) {
    return {
      ...wspolne,
      plan: "blad",
      powod: "Nie ma obiektu ani pod starą, ani pod nową ścieżką. Wiersz jest duchem — nie ruszam go.",
    };
  }

  // Zrodlo zniknelo, ale kopia jest — poprzednie uruchomienie przerwalo sie
  // miedzy krokiem 4 a zapisem wiersza. Wystarczy poprawic sam wiersz.
  if (!zrodlo.istnieje && cel.istnieje) {
    return { ...wspolne, plan: "napraw-wiersz", powod: "Plik jest już pod nową ścieżką, nieaktualny był tylko wiersz." };
  }

  // Oba istnieja — albo poprzednie uruchomienie przerwalo sie po kopii,
  // albo (teoretycznie) doszlo do kolizji nazw. Rozstrzyga rozmiar.
  if (zrodlo.istnieje && cel.istnieje) {
    const zgodne =
      zrodlo.rozmiar != null &&
      cel.rozmiar != null &&
      Number(zrodlo.rozmiar) === Number(cel.rozmiar);

    if (!zgodne) {
      return {
        ...wspolne,
        plan: "blad",
        powod: `Pod nową ścieżką leży już INNY plik (${cel.rozmiar} B wobec ${zrodlo.rozmiar} B). Nie nadpisuję — rozstrzygnij ręcznie.`,
      };
    }
    return { ...wspolne, plan: "dokoncz", powod: "Kopia już istnieje i zgadza się rozmiarem — zostaje poprawić wiersz i skasować źródło." };
  }

  return {
    ...wspolne,
    plan: "kopiuj",
    powod: "Kopiuj → zweryfikuj → popraw wiersz → skasuj źródło.",
    rozmiar_zrodla: zrodlo.rozmiar,
  };
}

// Wykonuje plan ustalony wyzej. Zwraca ten sam obiekt z dopisanym `status`.
async function wykonaj(supabase, user, krok) {
  const { folder: staryFolder, nazwa } = rozbijSciezke(krok.z);

  try {
    if (krok.plan === "pomin") return { ...krok, status: "juz-ok" };
    if (krok.plan === "blad") return { ...krok, status: "blad" };

    // 1. KOPIA (tylko gdy jej jeszcze nie ma).
    if (krok.plan === "kopiuj") {
      const { error } = await supabase.storage
        .from(BUCKET)
        .copy(krok.z, krok.na);

      if (error) {
        return { ...krok, status: "blad", powod: `Kopiowanie nie powiodło się: ${error.message}. Źródło nietknięte.` };
      }
    }

    // 2. WERYFIKACJA — kopia musi istniec i zgadzac sie rozmiarem ze zrodlem.
    //    Bez tego kroku nie wolno skasowac zrodla.
    if (krok.plan === "kopiuj" || krok.plan === "dokoncz") {
      const zrodlo = await opiszObiekt(supabase, staryFolder, nazwa);
      const cel = await opiszObiekt(supabase, user.id, nazwa);

      if (!cel.istnieje) {
        return { ...krok, status: "blad", powod: "Po kopiowaniu nie widzę pliku pod nową ścieżką. Źródło nietknięte." };
      }
      if (
        zrodlo.istnieje &&
        zrodlo.rozmiar != null &&
        cel.rozmiar != null &&
        Number(zrodlo.rozmiar) !== Number(cel.rozmiar)
      ) {
        return {
          ...krok,
          status: "blad-weryfikacji",
          powod: `Kopia ma ${cel.rozmiar} B, źródło ${zrodlo.rozmiar} B. ŹRÓDŁA NIE KASUJĘ — rozstrzygnij ręcznie.`,
        };
      }
    }

    // 3. WIERSZ wskazuje na kopie. Robimy to PRZED kasowaniem zrodla, zeby
    //    w zadnym momencie wiersz nie wskazywal na nieistniejacy plik.
    const { error: bladWiersza } = await supabase
      .from("knowledge_files")
      .update({ file_path: krok.na })
      .eq("id", krok.id);

    if (bladWiersza) {
      return {
        ...krok,
        status: "blad",
        powod: `Kopia gotowa, ale nie udało się zapisać wiersza: ${bladWiersza.message}. Źródła NIE skasowałem — uruchom ponownie.`,
      };
    }

    if (krok.plan === "napraw-wiersz") {
      return { ...krok, status: "naprawiono-wiersz" };
    }

    // 4. DOPIERO TERAZ kasujemy zrodlo.
    const { error: bladKasowania } = await supabase.storage
      .from(BUCKET)
      .remove([krok.z]);

    if (bladKasowania) {
      return {
        ...krok,
        status: "zmigrowany-zostala-kopia",
        powod: `Plik jest pod nową ścieżką i wiersz jest poprawny, ale starego obiektu nie udało się skasować: ${bladKasowania.message}. Skasuj go ręcznie w panelu Storage.`,
      };
    }

    return { ...krok, status: "zmigrowany" };
  } catch (e) {
    return { ...krok, status: "blad", powod: e?.message || "Nieoczekiwany błąd." };
  }
}

async function obsluz(czyWykonac) {
  if (!dostepna()) {
    return NextResponse.json({ error: "Nie znaleziono." }, { status: 404 });
  }

  const supabase = isSupabaseConfigured ? await createClient() : null;
  if (!supabase) {
    return NextResponse.json(
      { error: "Brak konfiguracji Supabase. Uzupełnij .env.local." },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 });
  }

  // RLS sprawia, ze widac tylko wlasne wiersze — stad koniecznosc uruchomienia
  // trasy osobno na kazdym koncie.
  const { data: wiersze, error } = await supabase
    .from("knowledge_files")
    .select("id, file_name, file_path, size")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: `Nie udało się pobrać listy plików: ${error.message}` },
      { status: 500 },
    );
  }

  const pliki = [];
  for (const wiersz of wiersze ?? []) {
    const krok = await zaplanuj(supabase, user, wiersz);
    pliki.push(czyWykonac ? await wykonaj(supabase, user, krok) : krok);
  }

  const licz = (predykat) => pliki.filter(predykat).length;

  return NextResponse.json({
    tryb: czyWykonac ? "WYKONANIE" : "PRÓBA NA SUCHO (nic nie zmieniono)",
    konto: `${user.email || "(bez e-maila)"} · ${user.id}`,
    podsumowanie: {
      wierszy_widocznych: pliki.length,
      juz_w_nowym_schemacie: licz((p) => p.plan === "pomin"),
      do_zrobienia: licz((p) => ["kopiuj", "dokoncz", "napraw-wiersz"].includes(p.plan)),
      zmigrowanych: licz((p) => String(p.status || "").startsWith("zmigrowany")),
      naprawionych_wierszy: licz((p) => p.status === "naprawiono-wiersz"),
      // Migracja sie udala, ale stary obiekt zostal w buckecie — do recznego
      // skasowania w panelu. Nie jest to blad, ale nie jest to tez czysto.
      zostala_stara_kopia: licz((p) => p.status === "zmigrowany-zostala-kopia"),
      bledow: licz((p) => String(p.status || p.plan).startsWith("blad")),
    },
    pliki,
  });
}

// PROBA NA SUCHO — tylko odczyt.
export async function GET() {
  return obsluz(false);
}

// WYKONANIE.
export async function POST() {
  return obsluz(true);
}
