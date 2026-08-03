import { NextResponse } from "next/server";
import { pobierzKatalogModeli } from "@/lib/openrouter/pobierz";

// Katalog modeli OpenRoutera — pośrednik między przeglądarką a
// https://openrouter.ai/api/v1/models.
//
// DOSTĘP: trasa jest chroniona przez proxy.js, które przepuszcza bez sesji
// wyłącznie /logowanie, /rejestracja i /api/auth/*. Wszystko inne, łącznie
// z tym adresem, dostaje 401 z JSON-em. NIE dokładamy tu drugiego sprawdzenia
// sesji — byłoby to drugie miejsce z tą samą regułą, a takie pary się
// rozjeżdżają. (Sprawdzone wywołaniem bez ciasteczka — patrz raport rundy 3.)
//
// NAZWY PÓL W KOPERCIE: `models` i `error`, tak jak w /api/models (Ollama) —
// żeby dwie listy modeli w tej samej aplikacji nie nazywały tego samego
// inaczej. Pola specyficzne dla katalogu są po polsku, jak reszta rdzenia.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // ?odswiez=1 pomija ważny cache. Do przycisku „odśwież listę" i do
  // sprawdzenia, że cache w ogóle coś zmienia.
  const odswiez = searchParams.get("odswiez") === "1";

  try {
    const wynik = await pobierzKatalogModeli({ odswiez });
    return NextResponse.json({
      models: wynik.modele,
      podsumowanie: wynik.podsumowanie,
      cache: {
        zCache: wynik.zCache,
        przeterminowany: wynik.przeterminowany,
        pobraneO: new Date(wynik.pobraneO).toISOString(),
        // Gdy oddajemy przeterminowaną kopię, mówimy CZEMU odświeżenie
        // nie wyszło. Bez tego „przeterminowany: true" jest nie do
        // zdiagnozowania bez wchodzenia w logi serwera.
        bladOdswiezenia: wynik.bladOdswiezenia || null,
      },
      error: null,
    });
  } catch (blad) {
    // ŚWIADOMA RÓŻNICA WZGLĘDEM /api/models (Ollama), które przy awarii
    // oddaje 200 z `{ models: [], error }`. Tutaj awaria to STATUS BŁĘDU
    // i pusta lista nie pada nigdy: lista modeli, która wygląda na pustą
    // przy odpowiedzi 200, czyta się jak „OpenRouter nie ma modeli" —
    // i tak właśnie zostałaby zinterpretowana przez interfejs.
    // 502, bo zawiódł serwis, od którego zależymy, a nie zapytanie klienta.
    return NextResponse.json(
      {
        models: null,
        podsumowanie: null,
        cache: null,
        error:
          blad?.message ||
          "Nie udało się pobrać katalogu modeli z OpenRoutera.",
        kod: blad?.code || "openrouter_katalog_blad",
      },
      { status: 502 },
    );
  }
}
