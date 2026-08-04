// Modele embeddingów OFEROWANE przy tworzeniu kolekcji.
//
// DLACZEGO TU, A NIE W lib/rag/: to nie jest opis tego, co rdzeń POTRAFI —
// `createEmbeddingProvider` obsługuje Ollamę z dowolnym modelem, jaki ktoś
// pobrał. To jest opis tego, co APLIKACJA OFERUJE do wyboru, czyli decyzja
// produktowa. Granica z sekcji 3 SPEC działa w obie strony: rdzeń nie wie
// o AIDEAS, a AIDEAS nie wpisuje swojej oferty do rdzenia.
//
// Wzorem lib/config/models.js, który trzyma ofertę modeli czatu i tak samo
// jest czytany przez interfejs ORAZ przez trasy.
//
// CZYSTY JS, BEZ `server-only`: ten sam plik czyta komponent kliencki
// (formularz) i trasa (walidacja). Nie ma tu żadnego sekretu — klucze
// czyta lib/rag/config.js, tu są wyłącznie nazwy i teksty.

export const DOSTAWCA_LOKALNY = 'ollama';
export const DOSTAWCA_CHMUROWY = 'openrouter';

// =============================================================================
//  DWIE POZYCJE — I TO JEST CAŁA LISTA.
//
//  Oba wpisy to TEN SAM PLIK WAG, co zmierzone, nie założone: cosinus
//  0,999987–0,999993 na pięciu prawdziwych fragmentach, przy kontroli
//  negatywnej 0,389 między dwoma różnymi fragmentami tą samą drogą (runda 0).
//  Wymiar 1024 z obu stron. Dzięki temu próg 0.45 obowiązuje bez zmian
//  niezależnie od wyboru — i dlatego wybór dotyczy DROGI, nie jakości.
//
//  Dokładanie tu kolejnych modeli wymaga POMIARU, nie tylko wpisu: inny model
//  to inna skala podobieństw, czyli próg do dostrojenia od nowa
//  (scripts/diag-prog.mjs, patrz komentarz przy RAG_MIN_SCORE w rag/config.js).
// =============================================================================
export const MODELE_EMBEDDINGOW = [
  {
    provider: DOSTAWCA_LOKALNY,
    model: 'bge-m3',
    etykieta: 'bge-m3',
    gdzie: 'lokalny',
    koszt: 'bez kosztów',
    // Jedno zdanie o TYM, CO TO ZNACZY W PRAKTYCE — nie o tym, czym jest model.
    opis:
      'Nic nie wychodzi na zewnątrz, ale wymaga uruchomionej Ollamy — bez niej ' +
      'nie zaindeksujesz ani nie wyszukasz.',
    domyslny: true,
  },
  {
    provider: DOSTAWCA_CHMUROWY,
    model: 'baai/bge-m3',
    etykieta: 'baai/bge-m3',
    gdzie: 'w chmurze',
    koszt: '$0,01 za mln tokenów',
    opis:
      'Ten sam model, działa bez Ollamy — przydatne, gdy aplikacja stoi ' +
      'na serwerze.',
    domyslny: false,
  },
];

export const DOMYSLNY_MODEL_EMBEDDINGOW =
  MODELE_EMBEDDINGOW.find((m) => m.domyslny) || MODELE_EMBEDDINGOW[0];

// =============================================================================
//  WALIDACJA PARY — SERWER NIE UFA CIAŁU ŻĄDANIA
//
//  Wzorzec z lib/settings/serverSettings.js:2: „serwer NIGDY nie ufa im ślepo".
//  Tu jest to szczególnie istotne, bo wybór jest NIEODWRACALNY: para trafia do
//  kolekcji na stałe i pilnuje jej strażnik zgodności. Przyjęcie pary spoza
//  oferty dałoby kolekcję, której nikt potem nie przeszuka — bo konfiguracja
//  serwera nigdy nie będzie jej odpowiadać.
//
//  SPRAWDZAMY PARĘ, NIE POLA OSOBNO. `openrouter` + `bge-m3` to dwie wartości,
//  z których każda z osobna jest na liście, a razem nie znaczą nic: pod tą
//  nazwą OpenRouter nie ma modelu. Walidacja pola po polu przepuściłaby to.
// =============================================================================
export function znajdzModelEmbeddingow(provider, model) {
  const p = typeof provider === 'string' ? provider.trim() : '';
  const m = typeof model === 'string' ? model.trim() : '';
  if (!p || !m) return null;
  return MODELE_EMBEDDINGOW.find((x) => x.provider === p && x.model === m) || null;
}

// Lista dozwolonych par w postaci do komunikatu błędu. Wypisujemy je wprost,
// żeby odmowa mówiła, co JEST wolno — sama informacja „nieobsługiwana para"
// zostawia pytającego z zgadywanką.
export function dozwoloneParyOpis() {
  return MODELE_EMBEDDINGOW.map((m) => `${m.provider}/${m.model}`).join(' albo ');
}
