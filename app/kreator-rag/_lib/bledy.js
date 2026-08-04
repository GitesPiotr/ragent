// Kody błędów z sekcji 10.2 → zdanie dla człowieka (Sesja 10, punkt 3).
//
// Rdzeń `lib/rag/` mówi po polsku, ale mówi do DEWELOPERA: „ustaw RAG_EMBED_MODEL",
// „migracja kolumny + przeindeksowanie", „vector(1024)". To są właściwe komunikaty
// w logu serwera i bezużyteczne w oknie użytkownika AIDEAS, który nie wie, czym jest
// Ollama ani kolumna `rag_chunks.embedding`.
//
// Dlatego warstwa UI tłumaczy kod na dwa zdania: CO SIĘ STAŁO i CO Z TYM ZROBIĆ.
// Szczegół techniczny (oryginalny komunikat + kod) zostaje doklejony na końcu —
// bez niego diagnostyka byłaby uboższa, a to wciąż narzędzie dla siebie.
//
// Świadomie BEZ zależności od Reacta: to czysta funkcja, którą da się przetestować
// i wywołać z dowolnego miejsca.

const OPISY = {
  no_key: {
    co: 'Aplikacja nie ma dostępu do bazy danych.',
    rada:
      'Brakuje adresu albo klucza Supabase. Uzupełnij RAG_SUPABASE_URL i RAG_SUPABASE_SERVICE_KEY ' +
      'w pliku .env.local, a potem uruchom serwer od nowa — zmiany w .env.local działają dopiero po restarcie.',
  },
  ollama_unavailable: {
    co: 'Nie udało się połączyć z Ollamą, czyli programem, który zamienia tekst na wektory.',
    rada:
      'Sprawdź, czy Ollama jest uruchomiona i czy pobrany jest model wskazany w konfiguracji. ' +
      'Bez niej można wgrywać i czytać dokumenty, ale nie da się ich zaindeksować ani przeszukać. ' +
      'Możesz też utworzyć kolekcję na modelu w chmurze — działa bez Ollamy.',
  },
  // OSOBNY KOD OD `no_key` WYŻEJ, I TO JEST SEDNO TEGO WPISU.
  // `no_key` znaczy w tej aplikacji „brak dostępu do bazy" i ma pod sobą radę
  // o RAG_SUPABASE_URL. Gdy w rundzie 1 doszedł chmurowy dostawca embeddingów,
  // brak JEGO klucza zaczął wpadać w ten sam kod — użytkownik widziałby wtedy
  // zdanie o kluczu Supabase, choć brakuje zupełnie innego. Dwa różne braki
  // wymagają dwóch różnych rad, więc mają dwa kody.
  no_embed_key: {
    co: 'Brakuje klucza do dostawcy embeddingów w chmurze.',
    rada:
      'Uzupełnij OPENROUTER_API_KEY w pliku .env.local i uruchom serwer od nowa — ' +
      'zmiany w .env.local działają dopiero po restarcie. Alternatywnie utwórz kolekcję ' +
      'na modelu lokalnym (Ollama), który klucza nie wymaga.',
  },
  dim_mismatch: {
    co: 'Rozmiar wektorów zapisanych w bazie nie zgadza się z bieżącym ustawieniem.',
    rada:
      'To znaczy, że baza powstała dla innego modelu. Nie zapisuj nic do czasu ujednolicenia — ' +
      'trzeba albo wrócić do poprzedniego ustawienia, albo przebudować kolumnę wektorów i zaindeksować dokumenty od nowa.',
  },
  // ZNACZENIE ZMIENIONE W RUNDZIE 3. Do rundy 2 ten kod znaczył „kolekcja
  // zbudowana innym modelem niż obecnie ustawiony" i radził zmienić ustawienie.
  // Odkąd kolekcja napędza własnego dostawcę, taka rozbieżność NIE JEST błędem —
  // dwie kolekcje na dwóch dostawcach działają obok siebie przy jednej
  // konfiguracji. Został jeden przypadek: dostawca, dla którego aplikacja nie ma
  // implementacji. Stara rada („ustaw model kolekcji") byłaby dziś szkodliwa —
  // odsyłałaby do zmiennej, która niczego już nie steruje.
  model_mismatch: {
    co: 'Ta kolekcja korzysta z dostawcy embeddingów, którego ta wersja aplikacji nie obsługuje.',
    rada:
      'Nie da się jej ani zaindeksować, ani przeszukać. Załóż kolekcję od nowa, wybierając ' +
      'dostawcę z listy, i wgraj do niej dokumenty ponownie.',
  },
  no_text: {
    co: 'W tym pliku nie ma tekstu do odczytania.',
    rada:
      'To zwykle skan albo zdjęcie dokumentu. Potrzebny jest plik z warstwą tekstową — ' +
      'sam obraz nie da się przeszukiwać.',
  },
  limit_exceeded: {
    co: null, // komunikat rdzenia podaje konkretny limit i jest już zrozumiały
    rada: 'Zmniejsz plik albo podnieś limit RAG_MAX_FILE_MB w konfiguracji i uruchom serwer od nowa.',
  },
  not_found: {
    co: null, // „Kolekcja nie istnieje." / „Dokument nie istnieje." — wystarczy
    rada: 'Element mógł zostać usunięty w innej karcie przeglądarki. Odśwież stronę.',
  },
  invalid_input: {
    co: null, // rdzeń mówi wprost, czego brakuje — generyczny wstęp tylko by zaszumił
    rada: null,
  },
  internal: {
    co: 'Coś poszło nie tak po stronie serwera.',
    rada: 'Jeśli błąd się powtarza, zajrzyj do konsoli serwera — tam jest pełny ślad.',
  },
};

// error: { code, message } z koperty 10.2. Zwraca gotowy tekst do pokazania.
export function komunikatBledu(error) {
  if (!error) return 'Wystąpił nieoczekiwany błąd.';
  if (typeof error === 'string') return error;

  const kod = error.code || 'internal';
  const szczegol = (error.message || '').trim();
  const opis = OPISY[kod] || OPISY.internal;

  const czesci = [];
  if (opis.co) czesci.push(opis.co);
  else if (szczegol) czesci.push(szczegol);
  if (opis.rada) czesci.push(opis.rada);

  let tekst = czesci.join(' ');
  if (!tekst) tekst = szczegol || 'Wystąpił nieoczekiwany błąd.';

  // Szczegół techniczny doklejamy tylko wtedy, gdy nie jest już całym zdaniem wyżej.
  const ogon = opis.co && szczegol ? `${szczegol} · kod: ${kod}` : `kod: ${kod}`;
  return `${tekst} (${ogon})`;
}
