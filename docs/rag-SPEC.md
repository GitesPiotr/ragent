# SPEC — Projekt RAG (samodzielne narzędzie + moduł do AIDEAS)

> **Dokument budowy dla Claude Code.** Wrzuć do repozytorium nowego projektu jako `SPEC.md`.
> Buduj **w kolejności sesji**. Każda sesja ma testowalne DoD.
> Ten projekt powstaje **osobno** od aplikacji AIDEAS i zostanie do niej później wpięty —
> dlatego sekcja 3 jest nienegocjowalna.
>
> **Zasada nadrzędna:** dokument ma rozstrzygać decyzje projektowe, żebyś nie musiał
> podejmować ich w trakcie kodowania. Jeśli natrafisz na rzecz nierozstrzygniętą —
> **zatrzymaj się i zapytaj**, zamiast wybierać po swojemu.

---

## 1. Cel

Narzędzie zamieniające wgrane dokumenty w **przeszukiwalną bazę wektorową (RAG)**
z **wizualizacją grafu wiedzy**. Dwie role:

1. **Samodzielna aplikacja** — wgrywasz pliki, budujesz bazę, przeszukujesz, oglądasz graf.
2. **Moduł do AIDEAS** — rdzeń (`lib/rag/`) trafia później do AIDEAS jako silnik bazy
   wiedzy agentów, zastępując doklejanie całej treści plików do promptu (dziś twardy
   limit 24 000 znaków).

Dwa warianty, oba objęte planem:
- **Wariant 1** — RAG wektorowy + mapa punktów.
- **Wariant 2** — pojęcia wyciągane z tekstu + graf wiedzy (dokument → fragment → pojęcie).

Schemat bazy projektowany **od razu pod wariant 2**.

---

## 2. Stack (zamknięty)

| Obszar | Decyzja |
|---|---|
| Framework | **Next.js (App Router), JavaScript** — ten sam co AIDEAS |
| Baza | **Supabase / PostgreSQL + `pgvector`** |
| Pliki | **Supabase Storage** |
| Embeddingi | **wybór w Sesji 1** (bake-off) — domyślny kandydat `bge-m3` |
| Ekstrakcja | `unpdf` (pdf), `mammoth` (docx) |
| Pojęcia (wariant 2) | model językowy, domyślnie Anthropic Haiku |
| Wizualizacja | **Canvas 2D**, bez bibliotek grafowych |
| Testy | `node:test` lub `vitest` — sekcja 13 |
| Język UI | polski |

---

## 3. ZASADY GRANICY (nienegocjowalne)

1. **Zero wiedzy o AIDEAS.** Projekt nie zna pojęć „agent", „projekt AIDEAS", „mentor".
   Operuje własnym pojęciem: **kolekcja**.
2. **Żadnych odwołań do tabel AIDEAS.** Klucze obce wyłącznie między `rag_*`.
   Powiązanie zewnętrzne: pole `external_ref` (tekst, bez FK).
3. **Trzy warstwy, ściśle rozdzielone:**
   - `lib/rag/` — rdzeń, czysty JS, **jedyne miejsce dotykające bazy i modeli**,
   - `app/api/rag/*` — warstwa HTTP: walidacja + wywołanie rdzenia, zero logiki,
   - UI — **nigdy** nie sięga do bazy ani rdzenia bezpośrednio; wyłącznie przez HTTP.

   Oraz `lib/mapview/` — **pomocniki widoku**: czysta geometria i przekształcenia danych
   dla mapy (krawędzie, rzut 3D), testowalne bez przeglądarki, bez `window`, DOM i canvasa.
   Nie należą do rdzenia i **nie są kopiowane przy integracji z AIDEAS** — Sesja I1 kopiuje
   wyłącznie `lib/rag/` i `app/api/rag/`. Rysowanie zostaje w komponencie strony.
4. **Konfiguracja przez zmienne środowiskowe**, nigdy na sztywno.
5. **Prefiks `rag_` we wszystkich nazwach tabel.**
6. **Sekrety wyłącznie po stronie serwera.** Klucz `service_role`, klucz modelu do pojęć —
   nigdy w kodzie klienta, nigdy z przedrostkiem `NEXT_PUBLIC_`.

**Test zgodności (przed integracją):** czy w `lib/rag/` występuje słowo „agent"/„projekt"
w znaczeniu AIDEAS, import Reacta/Next.js, odwołanie do `window`, albo import spoza
`lib/rag/` i bibliotek zewnętrznych? Jeśli tak — granica złamana.

---

## 4. Środowisko uruchomieniowe

Rozstrzygnij **przed Sesją 1** — wpływa na wybór dostawcy embeddingów i na sekcję 10.

| Scenariusz | Embeddingi | Konsekwencja |
|---|---|---|
| **Lokalnie** (dziś: AIDEAS przez `START.bat`) | Ollama, `http://localhost:11434` | darmowe, dokumenty nie opuszczają maszyny |
| **Hosting** (np. Vercel) | dostawca chmurowy przez API | serwer nie dosięgnie `localhost`; **funkcje mają limit czasu** — patrz 10.3 |

**Wniosek:** dostawca embeddingów musi być wymienny za jednym interfejsem (sekcja 9),
wybierany zmienną środowiskową. Zmiana dostawcy **nie może** wymagać zmian poza jednym plikiem.

**Uwaga krytyczna:** różni dostawcy mają różne wymiary wektorów. Zmiana po zbudowaniu
bazy = migracja kolumny + **przeindeksowanie wszystkiego**.

---

## 5. Konfiguracja (`.env.local`)

```
# --- Baza ---
RAG_SUPABASE_URL=                # jeśli puste: NEXT_PUBLIC_SUPABASE_URL
RAG_SUPABASE_SERVICE_KEY=        # tylko serwer, NIGDY NEXT_PUBLIC_
RAG_TABLE_PREFIX=rag_
# Uwaga: klucz anon NIE jest używany. Architektura trójwarstwowa oznacza, że do bazy
# sięga wyłącznie serwer kluczem service_role. Brak klucza anon jest zamierzony.

# --- Embeddingi (ustalane w Sesji 1) ---
RAG_EMBED_PROVIDER=ollama        # ollama | openai | voyage
RAG_EMBED_MODEL=bge-m3
RAG_EMBED_DIM=1024               # MUSI zgadzać się z modelem i ze schematem
RAG_EMBED_BATCH=32
RAG_EMBED_DOC_PREFIX=            # prefiks dla dokumentów, jeśli model wymaga
RAG_EMBED_QUERY_PREFIX=          # prefiks dla zapytań, jeśli model wymaga
RAG_OLLAMA_URL=http://localhost:11434

# --- Pliki ---
RAG_MAX_FILE_MB=25               # powyżej: błąd limit_exceeded

# --- Cięcie tekstu ---
RAG_CHUNK_SIZE=900
RAG_CHUNK_MAX=1400
RAG_CHUNK_MIN=150
RAG_CHUNK_OVERLAP=150
RAG_PREPEND_HEADINGS=true

# --- Rzutowanie 2D ---
RAG_PROJECTION_MIN_CHUNKS=50     # próg zbudowania bazy rzutowania (sekcja 12.4)
RAG_MAP_NEIGHBORS=3              # ilu sąsiadów na fragment w widoku połączeń (12.6)

# --- Wyszukiwanie ---
RAG_TOP_K=5
RAG_MIN_SCORE=0.35

# --- Wariant 2 ---
RAG_CONCEPT_PROVIDER=anthropic
RAG_CONCEPT_MODEL=claude-haiku-4-5
RAG_CONCEPT_PER_CHUNK=3
RAG_CONCEPT_MERGE_THRESHOLD=0.88
```

---

## 6. Wybór modelu embeddingów — DECYZJA BLOKUJĄCA (Sesja 1)

**Nie twórz schematu bazy przed rozstrzygnięciem** — wymiar wektora jest częścią
definicji kolumny.

**Problem:** wszystkie dokumenty są **po polsku**. Modele trenowane głównie na
angielskim (np. `nomic-embed-text`) działają, ale zauważalnie gorzej — objawia się to
nie błędem, lecz „średnią trafnością".

**Kandydaci (zweryfikuj w dokumentacji, nie z pamięci):**

| Model | Wymiar | Uwagi |
|---|---|---|
| `bge-m3` | 1024 | wielojęzyczny, dobry na polskim — **domyślny kandydat**, nie wymaga prefiksów |
| `multilingual-e5-large` | 1024 | wielojęzyczny; **wymaga prefiksów** `query:` / `passage:` |
| `mxbai-embed-large` | 1024 | mocny, głównie angielski |
| `nomic-embed-text` | 768 | lekki, **wymaga prefiksów** `search_document:` / `search_query:` |

### 6.1 PREFIKSY — obowiązkowy krok bake-offu

Część modeli wymaga prefiksów rozróżniających **tekst dokumentu** od **zapytania**.
Użycie modelu bez wymaganego prefiksu **cicho psuje trafność** — bez błędu, bez śladu w logach.

Dla zwycięskiego modelu:
1. Sprawdź w oficjalnej dokumentacji, czy wymaga prefiksów i jakich.
2. Zapisz je w `RAG_EMBED_DOC_PREFIX` / `RAG_EMBED_QUERY_PREFIX`.
3. Provider musi mieć **dwie osobne metody**: `embedDocuments()` i `embedQuery()`
   (sekcja 9). Jedna funkcja `embed(texts)` nie ma gdzie zmieścić tego rozróżnienia.
4. W bake-offie porównaj wariant z prefiksami i bez — dla modeli, które ich wymagają,
   różnica jest widoczna.

### 6.2 Procedura bake-offu

1. Pobierz kandydatów do Ollamy, **zweryfikuj rzeczywisty wymiar** wektora.
2. Przygotuj **10–15 polskich zdań** z realnej dziedziny (urlop, hasło, delegacja, sprzęt)
   plus **5 zapytań sformułowanych inaczej** niż zdania (synonimy, mowa potoczna) —
   np. zdanie „przysługuje 26 dni urlopu wypoczynkowego", zapytanie „ile mam wolnego".
3. Policz podobieństwa; sprawdź, czy **trafne pary plasują się wyżej** niż niepowiązane.
4. Sprawdź prefiksy wg 6.1.
5. Zmierz czas embedowania 100 fragmentów.
6. **Przedstaw tabelę i rekomendację, poczekaj na moją decyzję.**

_DoD:_ tabela porównawcza (trafność, wpływ prefiksów, czas), rekomendacja,
zatwierdzony model, wymiar i prefiksy.

---

## 7. Schemat bazy

Skrypty SQL uruchamiam **ja, ręcznie** w Supabase → SQL Editor. Wygeneruj je i powiedz
wyraźnie, kiedy uruchomić. Nie zakładaj dostępu do bazy.

### 7.1 Wymiar wektora — literał, nie zmienna

**Postgres nie czyta zmiennych środowiskowych.** W skrypcie musi być literał, np.
`vector(1024)`. Dlatego skrypt schematu **generujesz po Sesji 1**, z podstawionym
zatwierdzonym wymiarem.

**To samo dotyczy prefiksu tabel.** `RAG_TABLE_PREFIX` jest konfigurowalny, ale w skrypcie
SQL musi być literałem — skrypt generujesz z podstawionym prefiksem, tak samo jak z wymiarem.

**Kontrola startowa (obowiązkowa):** `/api/rag/status` odpytuje katalog Postgresa
o rzeczywisty wymiar kolumny `rag_chunks.embedding` i porównuje z `RAG_EMBED_DIM`.
Rozbieżność → błąd `dim_mismatch` z komunikatem, **zanim** dojdzie do pierwszego zapisu.
Odczyt katalogu idzie przez wąską, tylko-do-odczytu funkcję RPC `rag_diag` (`SECURITY
DEFINER`, allowlista kolumn, `execute` tylko dla `service_role`; instalowaną ręcznie już
w Sesji 0, patrz `sql/session-0-diagnostyka.sql`), bo klient Supabase nie sięga `pg_catalog`
bezpośrednio.

```sql
create extension if not exists vector;
```

### `rag_collections`
```
id             uuid pk default gen_random_uuid()
name           text not null
description    text
external_ref   text            -- hak integracyjny (id projektu z aplikacji zewnętrznej)
                               -- BEZ klucza obcego; indeks unikalny częściowy
status         text not null default 'active'    -- 'active' | 'archived'
embed_model    text            -- model użyty do zbudowania
embed_dim      int
projection     jsonb           -- baza rzutowania 2D — struktura w sekcji 12
created_at, updated_at  timestamptz default now()
```

### `rag_documents`
```
id              uuid pk
collection_id   uuid not null → rag_collections(id) on delete cascade
file_name       text not null
file_path       text
mime_type       text
size_bytes      bigint
page_count      int
char_count      int
chunk_count     int not null default 0
extracted_text  text            -- pełny tekst po ekstrakcji (sekcja 8.4)
                                -- pozwala przeciąć na nowo bez pobierania pliku
status          text not null default 'pending'
                -- 'pending'|'extracting'|'chunking'|'chunked'|'embedding'|'ready'|'no_text'|'error'
error_message   text
created_at, updated_at
```

### `rag_chunks`
```
id             uuid pk
document_id    uuid not null → rag_documents(id) on delete cascade
collection_id  uuid not null → rag_collections(id) on delete cascade
chunk_index    int not null
content        text not null    -- czysty tekst; DOKŁADNY wycinek extracted_text
heading_path   text             -- "Rozdział 3 › 3.2 Urlopy"
page_from      int              -- null dla docx (brak stron)
page_to        int
char_start     int not null     -- offset w rag_documents.extracted_text
char_end       int not null
token_estimate int              -- długość content w znakach / 4 (przybliżenie)
embedding      vector(<WYMIAR Z SESJI 1>)   -- literał!
coord_x        real
coord_y        real
coord_z        real             -- trzecia składowa; używana w widoku 3D (12.8)
neighbors      jsonb            -- sąsiedztwo 2D: [{id, dist2d}] (sekcja 12.6)
created_at
unique (document_id, chunk_index)
```

### 7.2 Indeksy — świadoma decyzja

```
btree on collection_id
btree on document_id
```

**Indeksu wektorowego NIE tworzymy.** Przy docelowej skali (~2000 fragmentów) skan
sekwencyjny jest szybszy, a `ivfflat` na małym zbiorze potrafi **pogorszyć trafność**
(przeszukuje tylko część list). Indeks wektorowy (`hnsw`) dopiero powyżej **~50 000
fragmentów**, jako osobne, świadome zadanie z pomiarem przed i po.

### `rag_concepts` *(tworzone w wariancie 1, wypełniane w 2)*
```
id                uuid pk
collection_id     uuid not null → rag_collections(id) on delete cascade
label             text not null
label_normalized  text not null
embedding         vector(<WYMIAR>)
mention_count     int default 0
coord_x, coord_y, coord_z  real          -- środek ciężkości fragmentów pojęcia (12.5)
merged_into       uuid → rag_concepts(id)   -- null dla kanonicznych (sekcja 14, Sesja 8)
created_at
unique (collection_id, label_normalized)
```

### `rag_chunk_concepts`
```
chunk_id    uuid → rag_chunks(id) on delete cascade
concept_id  uuid → rag_concepts(id) on delete cascade
weight      real default 1
primary key (chunk_id, concept_id)
```

**RLS:** projekt jednoużytkownikowy — **wyłącz RLS** dla tabel `rag_*` (Supabase włącza
domyślnie i zablokuje zapis). Komentarz: `-- TODO: owner_id + RLS przy logowaniu`.

---

## 8. Algorytm cięcia tekstu

Kod pojedzie do drugiego projektu i wpływa wprost na trafność. **Implementuj dokładnie tak.**

### 8.1 Wejście: bloki, nie płaski tekst
```
{ type: 'heading'|'paragraph'|'list', level?: 1..6, text: string, page: number|null }
```
- `unpdf` — zachowaj podział na strony; nagłówek rozpoznaj heurystycznie
  (krótka linia, brak kropki na końcu).
- `mammoth` — HTML: `h1..h6` → heading z poziomem, `p`/`li` → paragraph, `page: null`.
- `.md` — nagłówki po `#`.
- `.txt` — paragrafy dzielone pustymi liniami.
- **`.csv` — traktuj wierszami, nie akapitami:** pierwszy wiersz to nagłówek kolumn;
  każdy fragment zawiera **powtórzony nagłówek** + tyle wierszy, ile mieści się
  w `RAG_CHUNK_SIZE`. Bez tego CSV daje jeden ogromny blok cięty twardo i bezużyteczny.

### 8.2 Ścieżka nagłówków
Utrzymuj stos nagłówków wg poziomu. Dla fragmentu zapisz `heading_path` (np.
`"Rozdział 3 › 3.2 Urlopy"`).

Jeśli `RAG_PREPEND_HEADINGS=true`, **tekst wysyłany do embedowania** to
`{heading_path}\n{content}` — ale w kolumnie `content` zapisz **sam tekst bez prefiksu**.
Powód: offsety zostają zgodne, a nagłówek istotnie poprawia trafność.

### 8.3 Reguły składania
1. Akumuluj bloki, dopóki długość ≤ `RAG_CHUNK_SIZE`.
2. Przekroczenie → zamknij fragment **przed** blokiem (nie tnij bloku bez potrzeby).
3. **Nagłówek zawsze zamyka bieżący fragment i otwiera nowy.** Fragment nigdy nie
   przechodzi przez nagłówek. (To gwarantuje, że `content` jest ciągłym wycinkiem —
   patrz 8.4 — i poprawia trafność.)
4. **Blok > `RAG_CHUNK_MAX`:** tnij po zdaniach (`.!?` + spacja/nowa linia) do
   `RAG_CHUNK_SIZE`. Pojedyncze zdanie > `RAG_CHUNK_MAX` → tnij twardo co `RAG_CHUNK_SIZE`.
5. **Zakładka:** przenieś ostatnie `RAG_CHUNK_OVERLAP` znaków, **przycięte wstecz do
   granicy zdania**. Zakładka nie przechodzi przez nagłówek.
6. **Fragment < `RAG_CHUNK_MIN`:** scal z poprzednim (jeśli pierwszy — z następnym).
   **Scalanie nigdy nie przekracza nagłówka** (reguła 3 ma pierwszeństwo). Jeśli po obu
   stronach krótkiego fragmentu stoi nagłówek, fragment zostaje krótki. Bez tego
   zastrzeżenia niezmiennik z 8.4 pęka: w wycinku znalazłby się tekst nagłówka.
7. Nagłówek nigdy nie tworzy fragmentu samodzielnie — wchodzi wyłącznie w `heading_path`.

### 8.4 `extracted_text` i offsety — jednoznaczna definicja

**To musi być zdefiniowane raz i identycznie w obu miejscach**, inaczej test z sekcji 13
sypie się w sposób trudny do diagnozy.

- `extracted_text` = **wszystkie bloki (łącznie z nagłówkami) połączone dokładnie
  separatorem `"\n\n"`**, w kolejności wystąpienia. Bez dodatkowych spacji, bez trim
  poszczególnych bloków poza usunięciem białych znaków z brzegów każdego bloku.
- `char_start`/`char_end` — offsety w `extracted_text`.
- **Niezmiennik (testowany):** `extracted_text.slice(char_start, char_end) === content`,
  znak w znak. Dzięki regule 8.3.3 (nagłówek zamyka fragment) wycinek zawiera wyłącznie
  bloki akapitowe i jest ciągły.
- `page_from` = strona pierwszego bloku fragmentu, `page_to` = ostatniego.
  Dla docx: oba `null`, cytowanie opiera się na `heading_path`.

### 8.5 Determinizm
Ten sam plik i konfiguracja **muszą** dać identyczny podział. Żadnej losowości.

---

## 9. API rdzenia (`lib/rag/`)

```js
// --- kolekcje ---
createCollection({ name, description, externalRef, embedModel }) → collection
  // embedModel opcjonalny; gdy nie podany, kolekcja dziedziczy globalny RAG_EMBED_MODEL.
  // Wymiaru NIE podaje się ręcznie — funkcja odpytuje model o rzeczywisty wymiar wektora
  // (jak w bake-offie z sekcji 6.2) i zapisuje go razem z modelem, aby embed_model
  // i embed_dim zawsze były spójne. Umożliwia to trzymanie w jednej bazie kolekcji
  // na różnych modelach (różny wymiar) bez migracji.
  // Model kolekcji jest NIEZMIENNY po utworzeniu (zmiana = nowa kolekcja + przeindeksowanie),
  // bo wszystkie wektory w kolekcji muszą pochodzić z jednego modelu.
listCollections({ includeArchived }) → collection[]
getCollection(id) → collection
getCollectionByExternalRef(ref) → collection | null      // integracja z AIDEAS
archiveCollection(id) / restoreCollection(id)
deleteCollection(id)            // kaskada: Storage → chunks → documents → collection

// --- dokumenty ---
ingestFile({ collectionId, file }) → document
  // ekstrakcja → cięcie → zapis fragmentów BEZ wektorów; status 'chunked'
  // file_name = ORYGINALNA nazwa (ogonki, spacje) — idzie do cytowań.
  // file_path = {collectionId}/{documentId}/sanitizeStorageName(file_name) — patrz 10.a.3.
sanitizeStorageName(nazwa) → string        // czysta funkcja; wyłącznie klucz Storage
embedNextBatch(documentId) → { done, total, finished, newChunks?, recalculated? }
  // liczy JEDNĄ partię (RAG_EMBED_BATCH) fragmentów bez wektora; wznawialne
  // newChunks    — fragmenty, które TA partia zrzutowała, w kształcie getMapData().chunks.
  //                Dzięki temu otwarta mapa rysuje nowe punkty i połączenia BEZ odpytywania
  //                całej kolekcji (12.4, 12.6). Brak pola = nic nowego nie doszło.
  // recalculated — baza rzutowania została przeliczona, czyli RUSZYŁY SIĘ WSZYSTKIE
  //                współrzędne. Lista przyrostowa wtedy nie wystarcza: klient dociąga
  //                całość raz i animuje przejście (12.4).
reindexDocument(documentId, { rechunk = false })
  // rechunk=false → czyści wektory ORAZ coord_x/coord_y/coord_z, status 'chunked'
  //                 (dalej przez embedNextBatch). Bez czyszczenia współrzędnych
  //                 na mapie zostałyby punkty w starych miejscach.
  // rechunk=true  → ponowne cięcie: re-ekstrakcja ORYGINAŁU ze Storage (nie z płaskiego
  //                 extracted_text — ten nie zachowuje typów bloków ani stron, więc gubiłby
  //                 heading_path i page_from/to). Po to trzymamy oryginał w Storage. Potem jw.
listDocuments(collectionId) → document[]
deleteDocument(documentId)

// --- wyszukiwanie ---
searchCollection({ collectionId, query, topK, minScore, documentIds })
  → { hits: [{ chunkId, documentId, fileName, headingPath, pageFrom, pageTo,
               content, score }], noResults: boolean }

// --- wizualizacja: MAPA (Sesja 6) ---
getMapData(collectionId, { includeNeighbors = false })
  → { documents: [{ id, name, color }],
      chunks:    [{ id, x, y, z, documentId, preview, pageFrom,
                    neighbors?: [{ id, dist2d }] }],   // tylko gdy includeNeighbors
      concepts?: [{ id, label, x, y, z, mentionCount }], // tylko Sesja 6b (12.5)
      viewport:  { xMin, xMax, yMin, yMax, zMin, zMax },
      projectionBuilt: boolean, chunkCount: number }
  // gdy projectionBuilt=false → mapa jeszcze nie istnieje (12.4), UI pokazuje licznik
  // ROZMIAR ODPOWIEDZI: `preview` przycięty do ~120 znaków (służy tylko do dymka).
  // Sąsiedzi domyślnie POMIJANI — tryb połączeń jest w Sesji 6b. Przy 2000 fragmentów
  // pełna odpowiedź z sąsiadami i długimi podglądami to kilka MB na każde wejście.

// ⚠️ REGUŁA DLA WSZYSTKICH FUNKCJI ZWRACAJĄCYCH POJĘCIA:
//    zwracaj WYŁĄCZNIE pojęcia kanoniczne — filtr `merged_into is null`.
//    Bez tego graf i listy pokażą „urlop", „urlopy" i „dni wolne" jako trzy węzły,
//    czyli duplikaty, których usunięcie jest celem Sesji 8.
//    searchByConcept, dostając id pojęcia SCALONEGO, rozwiązuje je do kanonicznego
//    przed wyszukaniem (powiązania zostały przepięte w kroku 4 algorytmu Sesji 8) —
//    nigdy nie zwraca pustki z tego powodu.

// --- wizualizacja: GRAF (Sesja 9) ---
getGraphData(collectionId)
  → { documents: [{ id, name, color, chunkCount }],
      concepts:  [{ id, label, mentionCount }],
      edges:     [{ documentId, conceptId, weight }] }
  // weight = liczba fragmentów TEGO dokumentu przypisanych do TEGO pojęcia.
  // Graf NIE zwraca fragmentów — zgodnie z rozstrzygnięciem skali w Sesji 9.
  // Fragmenty pobiera się dopiero po kliknięciu pojęcia, przez searchByConcept.

// --- wariant 2 ---
extractConceptsForDocument(documentId)
normalizeConcepts(collectionId) → { merged: [{from, into}], conceptCount }
searchByConcept({ collectionId, conceptId, limit = 30 })
  → { chunks: [{ chunkId, documentId, fileName, headingPath, pageFrom, content }],
      total: number }
  // `limit` domyślnie 30: popularne pojęcie może mieć 300+ fragmentów, a graf
  // wysypałby je wszystkie naraz. UI pokazuje wprost „pokazano 30 z 312" —
  // zgodnie z 12.9 nie udajemy, że to wszystko.
  // ⭐ to jest funkcja wywoływana po KLIKNIĘCIU POJĘCIA w grafie (Sesja 9):
  //    zwraca fragmenty danego pojęcia, które graf dorysowuje jako promienie

// --- dostawca embeddingów (wymienny) ---
createEmbeddingProvider(config) → {
  name, dim,
  embedDocuments(texts: string[]) → number[][],   // stosuje RAG_EMBED_DOC_PREFIX
  embedQuery(text: string) → number[]             // stosuje RAG_EMBED_QUERY_PREFIX
}
```

**Reguła:** rdzeń nie zna Reacta, Next.js ani `window`. Czysty JS + klient Supabase.

---

## 10. Warstwa HTTP (`app/api/rag/*`)

Cienka: walidacja → rdzeń → odpowiedź. Klucz `service_role` używany **wyłącznie tutaj**.

### 10.1 Endpointy

| Metoda | Ścieżka | Rdzeń |
|---|---|---|
| GET / POST | `/api/rag/collections` | list / create |
| GET / PATCH / DELETE | `/api/rag/collections/[id]` | get / update / delete |
| GET | `/api/rag/collections/[id]/documents` | listDocuments |
| POST | `/api/rag/collections/[id]/ingest` | ingestFile (multipart) — **tylko ekstrakcja + cięcie** |
| POST | `/api/rag/documents/[id]/embed` | embedNextBatch — **jedna partia** |
| POST | `/api/rag/documents/[id]/reindex` | reindexDocument |
| DELETE | `/api/rag/documents/[id]` | deleteDocument |
| POST | `/api/rag/collections/[id]/search` | searchCollection |
| GET | `/api/rag/collections/[id]/map` | getMapData (Sesja 6) |
| GET | `/api/rag/collections/[id]/graph` | getGraphData (Sesja 9); `?minMentions=N`, `?tylkoMosty=1` — filtr progu (9b) |
| GET | `/api/rag/collections/[id]/concepts/[conceptId]/chunks` | searchByConcept |
| POST | `/api/rag/collections/[id]/concepts/extract` | extractConceptsForDocument — **`documentId` w ciele żądania** |
| POST | `/api/rag/collections/[id]/concepts/normalize` | normalizeConcepts |
| GET | `/api/rag/status` | diagnostyka: baza, Ollama, model, **kontrola wymiaru** |

### 10.2 Błędy
Zawsze `{ error: { code, message } }`, komunikat po polsku. Kody:
`no_key`, `ollama_unavailable`, `dim_mismatch`, `model_mismatch`, `no_text`,
`limit_exceeded` (plik > `RAG_MAX_FILE_MB`), `not_found`, `invalid_input`.

### 10.3 Indeksowanie partiami — dlaczego tak

Pojedyncze żądanie trwające całe indeksowanie **zostanie ubite** przez limit czasu
funkcji na hostingu, zostawiając dokument w statusie `embedding` na zawsze.
NDJSON pokazuje postęp, ale **nie rozwiązuje limitu czasu**.

Dlatego:
1. `POST /ingest` kończy się po ekstrakcji i cięciu → status `chunked`.
2. Klient w pętli woła `POST /documents/[id]/embed`; każde wywołanie liczy **jedną partię**
   i zwraca `{ done, total, finished }`.
3. Gdy `finished: true` → status `ready`.
4. **Wznawialność:** `embedNextBatch` pobiera fragmenty `where embedding is null`.
   Przerwanie w dowolnym momencie nie psuje niczego — kolejne wywołanie kontynuuje.
5. Ta sama ścieżka obsługuje `reindex` (czyści wektory → status `chunked` → pętla).
6. **Postęp w UI** karmi się odpowiedziami z pętli — nie animacją na timerze.

*(Opcjonalnie, tylko dla trybu lokalnego: `?stream=1` na `/embed` może zwracać NDJSON
i przetworzyć całość w jednym żądaniu. Domyślnie wyłączone.)*

---

## 11. Wyszukiwanie: score, próg, brak trafień

**`score` = podobieństwo**, nie odległość. pgvector operatorem `<=>` zwraca odległość
cosinusową; rdzeń **zawsze** zwraca `score = 1 - distance`, zakres `[0,1]`, wyżej = lepiej.
UI i agent nigdy nie widzą odległości. Sortowanie malejąco po `score`.

**Próg:** odrzucaj poniżej `RAG_MIN_SCORE` (start `0.35`, dostroić po Sesji 5).
Gdy nic nie zostaje: `{ hits: [], noResults: true }`.

### 11.0 ⛔ GRANICA MODUŁU RAG — przeczytaj to przed podłączeniem do agenta

**To jest najważniejszy zapis w tej sekcji i pierwsza rzecz, którą powinien przeczytać
ktoś wpinający ten moduł w agenta.**

**TEZA.** Informacji potrzebnej do odróżnienia „blisko tematycznie" od „odpowiada na
zadane pytanie" **nie ma w tekście fragmentu ani w jego podobieństwie do pytania.**
Jest w wiedzy o świecie — w tym, że amoksycylina to inny lek niż lenalidomid, a rękojmia
to inna instytucja niż przedawnienie roszczeń pracowniczych. **Warstwa wyszukiwania tej
wiedzy nie ma i żadna jej odmiana mieć nie będzie.**

To nie jest przypuszczenie. **Trzy metody, trzy ściany, każda zmierzona na dwóch
rozłącznych dziedzinach (prawo pracy + RODO; onkologia + psychiatria):**

| metoda | wynik | gdzie |
|---|---|---|
| **próg podobieństwa** | klasy przeplatają się w OBU dziedzinach; przerwa −0,1694 i −0,0751 | 11.1e |
| **reranker** (3 modele Cohere) | przerwa **ujemna w sześciu przypadkach na sześć**; najmocniejszy model daje tyle, co sam wektor | 11.1f |
| **reguła „termin nieobecny w korpusie"** | zero fałszywych alarmów **nieosiągalne** łącznie na obu kolekcjach; najlepszy kompromis 3 z 15 szumu przy 1 fałszywym | 11.1h |
| **kształt rozkładu** (6 miar) | przerwa **ujemna we wszystkich 12 przypadkach**; na korpusie powtarzającym treść hipoteza wręcz się **odwraca** | 11.1i |

Pierwsze trzy metody mierzyły **WYSOKOŚĆ** — próg wektorowy, wynik rerankera, obecność
terminu. Każda była inną wersją pytania „jak blisko". Czwarta mierzyła **KSZTAŁT**, czyli
inną wielkość: czy pytanie z odpowiedzią ma wyraźnego zwycięzcę, a pytanie bez odpowiedzi
płaskie czoło. **Też nie.**

Każda z nich zawodzi **z tego samego powodu**, tylko widzianego z innej strony. Pytanie
o działania niepożądane amoksycyliny trafia we fragment, który **naprawdę jest** o
działaniach niepożądanych. Pytanie o przedawnienie z rękojmi trafia w przedawnienie
**naprawdę** ze stosunku pracy. Podmiot to jedno słowo, cała reszta zdania pasuje —
i pasuje słusznie.

**Sprawdzono zarówno wysokość podobieństwa, jak i kształt jego rozkładu. Temat jest
zamknięty; piątej metody nie szukamy.**

> ## KONSEKWENCJA, WPROST
>
> **Decyzja „tego nie ma w dokumentach" należy do MODELU ODPOWIADAJĄCEGO, nie do modułu
> RAG.**
>
> Zakres `noResults` jest pełny i wyczerpuje się na dwóch przypadkach:
> 1. pytanie **spoza dziedziny** korpusu (sufit szumu dalekiego 0,4085–0,4198, stabilny
>    między dziedzinami — patrz 11.1e);
> 2. **zero trafień pełnotekstowych** dla zapytania z identyfikatorem (reguła negatywna
>    z 11.2).
>
> **Poza tymi dwoma przypadkami moduł RAG nie odmawia i nie ma jak odmówić.** Kto
> projektuje na nim odpowiedzi, musi obsłużyć resztę po swojej stronie — gotowy akapit
> do promptu agenta jest w sekcji 18.

### 11.1 Próg `RAG_MIN_SCORE` — wartość, margines i czym go mierzono

**Obowiązuje `0.45`.** Przemierzone dwukrotnie **27.07.2026** metodą z Sesji 5 (9 pytań
trafnych kontra 4 spoza bazy, w tym jedno „z pogranicza") — drugi raz po zmianie poziomów
nagłówków z 10.a.7, która przeliczyła wektory Kodeksu i RODO.

| | przed 10.a.7 | **po 10.a.7** | źródło |
|---|---|---|---|
| sufit szumu | 0,4105 | **0,4124** | „jaki jest kurs euro do złotego" |
| najsłabsze poprawne trafienie | 0,4581 | **0,4581** | „gdzie znajduje się apteczka" → `05-instrukcja-bhp.pdf` |
| przerwa między nimi | 0,0476 | 0,0457 | |
| **margines progu** | **0,0081** | **0,0081** | 0,4581 − 0,45 |

Najsłabsze poprawne trafienie nie drgnęło, bo `05-instrukcja-bhp.pdf` nie miał ani jednej
zmienionej ścieżki — jego wektor jest ten sam. Sufit szumu podniósł się o 0,0019, czyli
w granicach nieistotności. **Próg zostaje.**

_Co się w tym pomiarze zmieniło i dlaczego to bez znaczenia:_ trafienia z RODO zyskały
po 0,006–0,007 (`usunięcie danych` 0,6730 → 0,6797, `inspektor ochrony danych`
0,6881 → 0,6955), bo numer artykułu w `heading_path` wchodzi do embedowanego tekstu (8.2).
Najlepsze trafienie Kodeksu spadło o 0,0032. Ruch idzie w obie strony i nie zbliża się
do progu.

_Uwaga na osad:_ nowym najmocniejszym szumem jest fragment `M. SCHULZ` (podpis pod RODO)
— znany osad reguły prefiksu z 10.a.5. Trzyma się przy 0,4124 i 0,3202, czyli bezpiecznie
pod progiem, ale wypłynął z niewidoczności na pierwsze miejsce wśród pytań spoza bazy.

**MARGINES JEST CIASNY: 0,0081** od progu do najsłabszego poprawnego trafienia.
Podniesienie progu choćby do `0.46` kasuje odpowiedź o apteczce. **Przy każdej większej
zmianie korpusu próg trzeba PRZEMIERZYĆ, a nie zakładać, że skoro działał, to działa.**

_Czym mierzyć:_ `node scripts/diag-prog.mjs "pytanie" --topk N`.

> **OSTRZEŻENIE O STARYCH LICZBACH.** Do 27.07.2026 `diag-prog.mjs` (i pozostałe
> `diag-*.mjs`) **zaniżały score o ~0,09**. Loader `.env.local` skopiowany do sześciu
> skryptów obcinał komentarz wzorcem `/\s+#.*$/`, czyli wymagał białego znaku przed `#`;
> spacje po `=` zjadał wcześniej `\s*`, więc przy linii
> `RAG_EMBED_DOC_PREFIX=            # prefiks…` wartością prefiksu stawał się **tekst
> komentarza**, doklejany do każdego embedowanego zapytania. `next dev` (dotenv) parsował
> to poprawnie, więc **aplikacja i dane w bazie były zawsze w porządku** — potwierdzone
> porównaniem z zapisanym wektorem (podobieństwo `1.000000` do embedowania bez prefiksu).
> Zepsute były wyłącznie pomiary z konsoli. Naprawa: wspólny loader `scripts/_env.mjs`,
> zachowanie zgodne z dotenv.
>
> Dowód skali: fraza „ile dni urlopu" — skrypt przed naprawą `0,5491`, UI `0,6399`,
> skrypt po naprawie `0,6452`.
>
> **Nie porównuj liczb sprzed 27.07.2026 z dzisiejszymi.** Wartości progowe z Sesji 5
> (sufit szumu `0,4100`, najsłabsze poprawne `0,4843`) pochodzą z zepsutego narzędzia.

_Pułapka metodyczna, w którą przy tym wpadliśmy:_ z faktu, że skrypt zaniżał o ~0,09,
wyciągnięto wniosek, że próg jest o tyle za niski. Pomiar tego nie potwierdził, bo
**zmieniły się dwie rzeczy naraz**: naprawa narzędzia podniosła score, a usunięcie
z korpusu „Ludzi bezdomnych" (1257 fragmentów prozy, najlepsze dopasowanie dla pytań
o sernik czy olej) obniżyło sufit szumu. Efekty w przybliżeniu się zniosły. To ta sama
lekcja co przy regule B w 10.a.5: **wniosek z pomiaru wymaga, żeby zmieniła się jedna
rzecz.**

_Czego próg NIE potrafi i nie będzie potrafił:_ przy zapytaniach o identyfikator
(`art. 36`) wyszukiwanie wektorowe zwraca śmieci ze score **wyższym** niż najsłabsze
poprawne trafienie — „U S T A W A z dnia 26 czerwca 1974 r." `0,5079`, „Rozdział I"
`0,4899` wobec apteczki `0,4581`. **Żaden próg nie rozdziela tych klas**: każdy, który
wycina śmieć, wycina wcześniej poprawną odpowiedź. To nie jest kwestia kalibracji —
score wektorowy nie zawiera potrzebnej informacji. Stąd wyszukiwanie hybrydowe (11.2).

**To jest kluczowe dla AIDEAS:** narzędzie agenta musi umieć powiedzieć „nie znalazłem
tego w dokumentach" zamiast podać pięć przypadkowych fragmentów. Bez progu RAG zawsze
zwraca `topK` — również na pytania spoza bazy — co zamienia odpowiedź w konfabulację.

### 11.1a Szum BLISKI — próg nie odróżnia „blisko tematycznie" od „odpowiada na pytanie"

**Zmierzone 29.07.2026** (`scripts/diag-margines.mjs`), korpus 8 dokumentów po dołożeniu
RODO. Powtórka pomiaru z 11.1 metodą jeden do jednego dała liczby **identyczne**: sufit
szumu dalekiego `0,4085` (było `0,4124`), najsłabsze poprawne `0,4581` (bez zmiany),
margines `0,0081`. Podwojenie korpusu progu nie ruszyło. **Próg zostaje `0.45`.**

Ale ten pomiar testuje rzecz zbyt łatwą. Pytania kontrolne spoza bazy („jak upiec sernik",
„stolica Australii") **nie dzielą z korpusem leksyki**, więc ich score spada sam z siebie.
Dołożona druga klasa — **pytania prawnicze o dziedziny, których w korpusie nie ma**
(podatki, prawo karne, budowlane, konsumenckie, ZUS) — daje obraz odwrotny:

| | score | co wyszło na wierzch |
|---|---|---|
| sufit szumu **bliskiego** | **0,6275** | „termin przedawnienia roszczeń z tytułu rękojmi" → Kodeks, `Art. 291` (przedawnienie ze **stosunku pracy**) |
| | 0,5451 | „obowiązki informacyjne wobec konsumenta" → Kodeks, `Art. 67⁵` (**praca zdalna**) |
| | 0,5414 | „zasiłek pogrzebowy z ZUS" → Kodeks, `Art. 93` (**odprawa pośmiertna**) |
| | 0,5332 | „termin złożenia zeznania PIT" → RODO, sprawozdanie Komisji |
| najsłabsze **poprawne** | 0,4581 | „gdzie znajduje się apteczka" |

**Margines wynosi −0,1694.** Siedem pytań bez poprawnej odpowiedzi w korpusie dostaje
score **wyższy** niż realna odpowiedź. Klasy się przeplatają na całej długości rozkładu.
**Żadna wartość progu ich nie rozdziela** — każda, która wycina szum bliski, wycina
wcześniej odpowiedź o apteczce.

To **ta sama właściwość** co przy zapytaniach o identyfikator (akapit wyżej), a nie nowa
usterka: **score wektorowy nie zawiera informacji potrzebnej do odróżnienia „blisko
tematycznie" od „odpowiada na pytanie"**, gdy korpus jest jednorodny leksykalnie. Cały
korpus to polski tekst prawny; „przepisy", „termin", „obowiązek", „wniosek" są w nim
wszędzie. Odpowiedzią jest **drugi sygnał albo reranker, nigdy przesuwanie granicy.**

**Konsekwencja do zapamiętania, zanim odkryje ją produkcja:**
> `noResults` chroni przed pytaniami **spoza dziedziny**, nie przed pytaniami
> **z sąsiedniej dziedziny prawa**.

Ranking jest zdrowy — we wszystkich 10 pytaniach trafnych cel wyszedł na **pozycji 1**.
Psuje się wyłącznie zdolność powiedzenia „nie znalazłem". Nie jest to więc usterka
wyszukiwania do załatania, tylko **zmierzona właściwość, która wchodzi do planu integracji**.

_Nie mierzy tego sufit szumu dalekiego._ Gdyby liczyć tylko jego, wynik brzmiałby
„margines +0,0081, wszystko w porządku" — i byłby prawdziwy, i nic by nie znaczył.
**Zestaw kontrolny musi zawierać pytania z sąsiedniej dziedziny, nie tylko o serniku.**

### 11.0a FAKT O KORPUSIE: wzrost liczby mostów nie jest dowodem, że graf działa lepiej

**Zmierzone 29.07.2026, po dołożeniu RODO i po normalizacji.** Mostów **15 → 51**.
Ta liczba jest prawdziwa i **myląca**, jeśli czytać ją jako „graf znalazł 36 nowych
powiązań merytorycznych". Cały przyrost siedzi w **jednej parze dokumentów** — RODO ↔
Kodeks pracy daje **38 z 51** mostów — a znaczna część z nich to zbieżność językowa,
nie treściowa.

Dwa mechanizmy produkują fałszywe mosty. **Rozróżnienie jest istotne, bo drugi jest
groźniejszy i ujawnia się dopiero po scaleniu.**

**Mechanizm 1 — wspólna leksyka prawnicza.** Identyczna etykieta znormalizowana, różne
znaczenie. Most powstaje z definicji (`unique (collection_id, label_normalized)`), bez
żadnego udziału wektorów:

> „przepisy", „termin", „wniosek", „umowa", „zgoda", „informacja", „obowiązki",
> „kryteria", „wymagania", „oświadczenie", „postępowanie"

Most „termin" nie mówi, że RODO i Kodeks pracy coś łączy — mówi, że **oba są tekstami
prawnymi**. Osobno: „Dziennik Urzędowy Unii Europejskiej" to **metadana publikacyjna**,
nie pojęcie z treści.

**Mechanizm 2 — scalanie etykiet fleksyjnie zbieżnych, znaczeniowo rozłącznych.** Most
powstaje przez `normalizeConcepts`, gdy dwie etykiety z różnych dokumentów wyglądają na
odmianę tego samego słowa, a znaczą co innego:

| podobieństwo | scalenie | dlaczego fałszywe |
|---|---|---|
| **0,9518** | „uzgodnienie" [Kodeks] → „uzgodnienia" [RODO] | w Kodeksie uzgodnienie warunków pracy, w RODO uzgodnienia współadministratorów (art. 26) |
| 0,8879 | „środki ochrony" [RODO] → „środki ochrony indywidualnej" [Kodeks] | w RODO zabezpieczenia prawne, w Kodeksie sprzęt ochronny |

> **Mechanizm 2 jest groźniejszy z dwóch.** Pierwszy widzi każdy, kto spojrzy na etykietę
> „termin" i zapyta „termin czego". Drugi **wygląda na czystą odmianę gramatyczną**
> i nie budzi podejrzeń — „uzgodnienie"/„uzgodnienia" ma **najwyższe podobieństwo
> z całej ósemki nowych mostów**, a znaczenia są rozłączne.

To domyka sprawę progu `0.88` mocniej niż wcześniejsze pomiary: **gdyby istniała
jakakolwiek wartość odcinająca błędy, ta para leżałaby po złej stronie każdej z nich.**

**Mosty prawdziwe też są** — „dane osobowe", „środki techniczne", „kwalifikacje
zawodowe", „dane osobowe dzieci", „okres przechowywania". Bilans ośmiu mostów powstałych
przez scalanie: **5 prawdziwych, 1 sporny, 2 fałszywe.**

**Decyzja: scalamy mimo to, BEZ listy wykluczeń.** Powód nie jest taki, że te dwa mosty
są nieszkodliwe — są fałszywe i o tym wiadomo. Powód jest taki, że **mechanizm wykluczeń
to furtka omijająca pomiar**: raz zbudowany, przy każdym kolejnym wątpliwym scaleniu
podpowiada „dopisz do listy" zamiast „zmierz". Dwa błędy na 51 mostów w widoku
**diagnostycznym**, który nie leży na ścieżce odpowiedzi, nie są tego warte.

**Warunki powrotu do tematu — przy następnym powiększeniu korpusu policz, nie zgaduj:**
1. **Wykluczenia mostów:** jeśli mostów fałszywych z mechanizmu 2 będzie *więcej niż
   kilka* — budujemy listę, a pomiar będzie jej uzasadnieniem.
2. **Identyfikatory przepisów:** dziś **3 pary identyfikator↔identyfikator nad progiem
   z 741 możliwych**, przy 39 etykietach z identyfikatorem na 1066 pojęć (3,7%).
   Reguła negatywna („pojęcia z identyfikatorem nie podlegają scalaniu") została
   **odrzucona**, bo z tych trzech par jedna jest scaleniem **poprawnym**
   („dyrektywa 95/46/WE"), więc reguła wycięłaby ją razem z dwoma złymi — czyli robiłaby
   to, co ten projekt odrzuca: usuwała błędy kosztem poprawnych trafień, bez sygnału,
   który je rozdziela. **Ale zjawisko jest systematyczne**: dwa ustępy tego samego
   artykułu różni jedna cyfra przy identycznej reszcie, więc etykiet przybywa liniowo,
   a par wewnątrz jednego aktu **kwadratowo**. Przy następnym dużym akcie prawnym
   **policz te pary ponownie** (`scripts/sym-normalizacja-nasucho.mjs`). Jeśli urosną
   nieproporcjonalnie — wracamy, z pomiarem, nie z przeczuciem.

### 11.1c Pomiar progu dla dowolnej kolekcji — zestaw kontrolny jest częścią pomiaru

`scripts/diag-margines.mjs <zestaw.json> [--kolekcja N] [--dokumenty a,b]`. Zestawy leżą
w `scripts/zestawy/*.json` i **są wersjonowane razem z kodem**, bo zmiana sformułowania
pytania rusza score o ~0,15 — osiemnaście razy więcej niż cały margines (11.1b).

**Zasady układania zestawu**, wszystkie wyprowadzone z pomyłek popełnionych naprawdę:
1. **Pytania jak od użytkownika, nie przepisane z dokumentu.** Parafraza zdania z tekstu
   zawyża score i unieważnia porównanie.
2. **Szum bliski musi być naprawdę bliski** — sąsiednia dziedzina, wspólna leksyka, brak
   poprawnej odpowiedzi w korpusie. Sufit liczony na „jak upiec sernik" **niczego nie
   mierzy**: takie pytanie nie dzieli z korpusem ani jednego słowa, więc jego score
   spada bez udziału progu.
3. **Co najmniej jedno pytanie o stałym sformułowaniu** jako kontrola porównywalności
   (dla Regulaminów `art. 154` = `0,4389`).

_Przed pomiarem uruchom `scripts/diag-kondycja.mjs <kolekcja>`._ Sprawdza dwie klasy
problemów, z których **druga jest niewidoczna w licznikach**:
- **indeksowanie** — fragmenty bez wektora, dokumenty z zerem fragmentów;
- **jakość tekstu** — udział polskich znaków diakrytycznych, słowa okaleczone przez
  ekstrakcję, udział fragmentów w innych językach.

> **„932 fragmenty, 932 z wektorem" wygląda na zdrową kolekcję i nią nie jest**, jeśli
> ekstrakcja zgubiła diakrytyki albo dokument jest w innym języku. Wektor policzy się
> z każdego tekstu — także z „Sporód wszystkich gospodarstw rodzinnych 62% stanowiy te
> tworzone wycznie". **Fragment bez wektora ma tę przewagę, że widać, że go nie ma.**

### 11.1d Wykrywanie okaleczonego tekstu — DWA SYGNAŁY, nie inne progi na jednym

**Sam udział diakrytyków nie nadaje się do niczego poza raportem.** Mierzy POLSKOŚĆ,
nie jakość: poprawny angielski daje `0,0%` i wygląda identycznie jak okaleczony polski
(`1,4%`). Zmierzone: **4 fałszywe alarmy na 8 przypadków** (angielski, niemiecki, czeski,
łotewski — wszystkie poprawne, wszystkie oskarżone). Wykrywanie języka po ZNAKACH też
zawodzi: `ä ö ü` nie odróżnia niemieckiego od estońskiego.

To ten sam wzorzec co przy progu wyszukiwania (11.1a) i przy scalaniu pojęć: **jeden
sygnał nie rozdziela klas, więc potrzebny jest drugi — nie inne progi na tym samym.**

**Drugi sygnał: polskie słowa funkcyjne POZBAWIONE DIAKRYTYKÓW** — „i", „w", „na", „do",
„oraz", „przez", „dla", „jest", „nie". Nie mają czego stracić przy uszkodzeniu kodowania,
więc **przeżywają je nietknięte** i mierzą „to jest polszczyzna" niezależnie od tego, czy
warstwa znaków ocalała. Rozpoznawanie języka po SŁOWACH jest przy okazji odporne na to,
na czym poległo rozpoznawanie po znakach: „der/die/und" wobec „ja/on/ning".

Zmierzone (`scripts/wer-miara-okaleczenia.mjs`, 13 próbek):

| | słowa funkcyjne PL | diakrytyki |
|---|---|---|
| polski poprawny (8 dokumentów) | 18,0–24,8% | 3,9–6,6% |
| polski okaleczony (GUS) | 26,5% | **1,4%** |
| nie polski (Beko, angielski, niemiecki) | 0,0–6,9% | 0,0–2,4% |

**Oba sygnały rozdzielają, każdy swoją parę klas:** słowa funkcyjne oddzielają polski od
niepolskiego z przerwą **11,1 pkt** (18,0 wobec 6,9), diakrytyki oddzielają poprawny od
okaleczonego **w obrębie polszczyzny** z przerwą **2,5 pkt** (3,9 wobec 1,4). Progi
`≥ 8%` i `< 2,5%` leżą w środku przerw.

Reguła jest **trójdzielna**, i to jest jej sedno:
- dużo słów funkcyjnych + normalne diakrytyki → **polski poprawny**;
- dużo słów funkcyjnych + prawie zero diakrytyków → **OKALECZONY**;
- mało słów funkcyjnych → **reguła MILCZY** (to nie polszczyzna, nie ma o czym orzekać).

**Wynik: 0 fałszywych alarmów, 0 przeoczeń, 1 wstrzymanie** (`03-pracownicy.csv` — tabela
imion i stanowisk, poniżej 100 słów; reguła milczy z powodu długości i jest to zachowanie
zamierzone).

_Pułapka w liczeniu tej skuteczności:_ pierwsza wersja podsumowania wrzuciła CSV do klasy
„polski poprawny", przez co dolny kraniec klasy spadł do `0,0%` słów funkcyjnych i miara
ogłosiła **„NIE ROZDZIELA"**. Reguła na tym dokumencie **milczy**, więc wliczanie go do
rozdzielności mierzyło coś, czego reguła nie robi. **Skuteczność liczy się wyłącznie na
próbkach, na których reguła się wypowiada** — inaczej wstrzymanie się jest karane jak błąd.

_Odrzucony kandydat, przez pomiar:_ „zgodność dwóch implementacji ekstrakcji". Na GUS
`unpdf` i `pdftotext` zgadzają się na **150 ze 171 stron i wszystkie 150 jest
uszkodzonych**. Zgodność dwóch narzędzi nie dowodzi poprawności, tylko tego, że oba czytają
tę samą złą warstwę tekstową — miara mówiłaby „w porządku" dokładnie tam, gdzie problem
jest największy.

#### Jak liczyć skuteczność reguły odsiewającej — TRZY LICZNIKI, NIGDY JEDEN

**Dotyczy każdej przyszłej reguły odsiewającej, nie tylko tej.**

| licznik | co znaczy | ile kosztuje |
|---|---|---|
| **fałszywy alarm** | dobry materiał oskarżony | najwięcej — po nim regułę się wyłącza |
| **przeoczenie** | zły materiał przepuszczony | to, przed czym reguła miała chronić |
| **wstrzymanie** | reguła milczy, bo nie ma podstaw do orzeczenia | **zero — to zachowanie zamierzone** |

Zsumowanie ich w jedną liczbę („4 błędy na 8") **każe poprawiać regułę tam, gdzie
zachowuje się prawidłowo.** Zdarzyło się to naprawdę: pierwsza wersja podsumowania
miary z 11.1d wciągnęła `03-pracownicy.csv` (tabela imion, 0 słów funkcyjnych, reguła
milczy z powodu długości) do klasy „polski poprawny", przez co dolny kraniec klasy
spadł do `0,0%` i miara ogłosiła **„NIE ROZDZIELA"** — o dobrej regule, na podstawie
złej arytmetyki.

> **Skuteczność liczy się WYŁĄCZNIE na próbkach, na których reguła się wypowiada.**
> Inaczej wstrzymanie się od głosu jest karane jak pomyłka, a reguła uczy się orzekać
> tam, gdzie nie ma danych.

#### REGUŁA: miara liczona TAK SAMO po obu stronach porównania

Porównując „przed" z „po", obie strony muszą być mierzone **tą samą definicją sukcesu**.
Brzmi trywialnie i nie jest.

Przy pomiarze rerankera (11.1f) pierwsza wersja liczyła pozycję **tego konkretnego
fragmentu**, który był celem w porządku wektorowym. Po przeszeregowaniu na czele może
stać **inny, równie poprawny** — fraza „administrator" występuje w kilkudziesięciu
fragmentach RODO. Skutek: reranker dostawał **6 z 10** zamiast 10 z 10 i wychodziło, że
psuje ranking na Regulaminach, podczas gdy on go **zachowuje**.

Poprawna definicja: cel = **pierwszy fragment zawierający frazę**, wyszukiwany tak samo
w obu uporządkowaniach.

> **Jeśli „po" jest oceniane surowszą definicją niż „przed", pomiar mierzy różnicę
> definicji, nie różnicę metod.** Wynik wygląda przy tym całkowicie wiarygodnie.

#### REGUŁA: skrypt pomiarowy IMPORTUJE mierzoną funkcję, nigdy jej nie odtwarza

**Dwa wystąpienia, oba znalezione dopiero przez rozjazd liczb:**

| skrypt | co odtwarzał | skutek |
|---|---|---|
| `sym-normalizacja.mjs` | własna kopia `grupuj` bez pierwszeństwa ziaren, odczyt bez `.range()` | symulacja opisywała algorytm, którego nie ma w kodzie — stąd fałszywy alarm o łańcuchu scaleń |
| `wer-miara-okaleczenia.mjs` | własna, szersza lista słów funkcyjnych | Beko dostawało 6,9% w skrypcie i 6,5% w aplikacji |

Za drugim razem różnica **nie zmieniła werdyktu — ale to czysty przypadek, nie zasługa.**

Do tego dochodzi trzecie źródło rozjazdu tej samej liczby: skrypt składał tekst
z `rag_chunks`, a zapis liczono z `extracted_text`. Cięcie usuwa żywe paginy, więc to
po prostu **inny tekst** (6,8% wobec 6,5%).

> **Trzy liczby dla jednego dokumentu miały trzy różne przyczyny: inną implementację,
> inne pole w komunikacie i inne źródło tekstu.** Żadnej z nich nie widać w wyniku —
> widać dopiero, gdy ktoś zestawi liczby obok siebie i zapyta, czemu się różnią.
>
> **Skrypt pomiarowy importuje mierzoną funkcję z `lib/` i czyta to samo źródło danych
> co produkcja.** Kopia algorytmu nie jest symulacją algorytmu.

#### Dokument powtarzający treść rozprasza ranking — właściwość, nie usterka

`revlimid-epar-product-information_pl.pdf` (718 fragmentów) zawiera tę samą treść
**trzy razy**: w charakterystyce produktu, w ulotce dla pacjenta i w oznakowaniu
opakowania. Skutek zmierzony: **cel na pozycji 1 wypada 7 z 10**, wobec 10 z 10 na
Regulaminach, a „na co pomaga revlimid" ląduje na **pozycji 17**.

To nie jest wada wyszukiwania — „poprawna odpowiedź" nie jest w takim dokumencie
**jednym miejscem**, więc każda miara „czy cel jest na pozycji 1" zaniża wynik z definicji.
**Wróci przy każdym dokumencie o tej budowie** (EPAR-y, ChPL z ulotką, instrukcje
wielojęzyczne, umowy z załącznikami powtarzającymi definicje). Przy ocenie jakości
odpowiedzi na takim korpusie trzeba brać na to poprawkę, a przy układaniu zestawu
kontrolnego — dobierać frazy celu tak, żeby trafiały w jedno miejsce, albo dopuszczać
kilka poprawnych.

_Niespodzianka z materiału dowodowego — i cofnięta teza o „powtarzającym się wzorcu":_
`ludzie-bezdomni.pdf`, plik usunięty z korpusu jako „uszkodzone kodowanie", **wychodzi
dziś poprawnie naszą własną ekstrakcją**: 19,7% słów funkcyjnych, **8,5% diakrytyków**,
najwyższy wynik w całym zestawie.

**GUS jest więc PIERWSZYM potwierdzonym wystąpieniem uszkodzenia warstwy tekstowej,
nie drugim.** Narracja o powtarzającym się wzorcu była nadinterpretacją i została
wycofana przez pomiar.

_Hipoteza bez rozstrzygnięcia, warta odnotowania:_ projekt ma udokumentowaną pułapkę
z **kluczami Storage, które muszą być ASCII** (stąd sanityzacja nazw w `documents.js`),
a „Ludzie bezdomni" to nazwa z polskimi znakami. Możliwe, że problem dotyczył wtedy
**warstwy nazwy pliku, nie treści**. **Nie sprawdzone i nie do sprawdzenia** — dowodem
z tamtego razu był wynik, nie zapis. To jest właśnie argument za tym, żeby oznaczenie
jakości było **trwałe i liczbowe**: gdyby wtedy zapisano pomiar, dziś byłaby odpowiedź.

#### ⚠ REGUŁA 10.a.1 JEST NIEZWERYFIKOWANA — nie powoływać się na nią jako na zabezpieczenie

Reguła „udział liter **spoza** polskiego alfabetu > 2%" (`udzialPodejrzanychLiter`
w `documents.js`) szuka znaków **podmienionych**. Nowa reguła 11.1d szuka znaków
**zgubionych**. Przypadki są rozłączne i obie zostają w kodzie.

Ale stan dowodowy 10.a.1 jest taki:

- **daje `0,0%` na wszystkich jedenastu dokumentach korpusu**, w tym na GUS —
  bo GUS nie ma liter obcych, ma brak liter polskich;
- jej jedyne znane zadziałanie to skazanie `ludzie-bezdomni.pdf`, a ten plik
  **wychodzi dziś poprawnie** (8,5% diakrytyków, najwyżej w zestawie);
- próg 2% został opisany jako „zmierzony na korpusie", ale korpusem był ten sam
  jeden plik, którego diagnoza się nie potwierdza.

> **Nikt nie ma prawa powoływać się na 10.a.1 jako na działające zabezpieczenie,
> dopóki nie pokaże się przypadek, który ta reguła faktycznie łapie.** Nie usuwamy —
> koszt utrzymania jest zerowy, a przypadek „znaki podmienione" jest realny (widzieliśmy
> go w `pdftotext` na GUS: `SKáAD`, `budĪetów`). Ale traktowanie jej jako pokrycia dla
> klasy „uszkodzony tekst" jest dziś nieuprawnione.

### 11.1e Czy `0.45` jest właściwością MODELU, czy KORPUSU — pomiar na drugiej dziedzinie

**Zmierzone 29.07.2026** na kolekcji TEST zawężonej do dwóch zdrowych dokumentów
medycznych (ChPL trazodonu + EPAR Revlimidu, 774 fragmenty czystego polskiego tekstu).
GUS i Beko **wyłączone z pomiaru** — pierwszy ma uszkodzoną warstwę tekstową, drugi jest
obcojęzyczny; liczenie sufitu szumu wobec nich dałoby liczbę nie do zinterpretowania.

| | Regulaminy (prawo) | TEST (medycyna) | różnica |
|---|---|---|---|
| sufit szumu **dalekiego** | 0,4085 | **0,4198** | +0,011 |
| sufit szumu **bliskiego** | 0,6275 | **0,6433** | +0,016 |
| najsłabsze poprawne | 0,4581 | **0,5682** | +0,110 |
| margines nad progiem `0.45` | +0,0081 | **+0,1182** | |
| cel na pozycji 1 | 10 z 10 | **7 z 10** | |
| przerwa poprawne − szum bliski | −0,1694 | **−0,0751** | |

**ODPOWIEDŹ: sufit szumu jest właściwością MODELU, a nie korpusu.** Obie liczby szumu
przeniosły się między zupełnie rozłącznymi dziedzinami z dokładnością **0,011–0,016** —
przy zmianie tematyki z prawa pracy na onkologię i psychiatrię. To zdumiewająco stabilne
i znaczy, że `bge-m3` ma własną „podłogę podobieństwa" niezależną od tego, co się w nim
zanurza.

**Próg `0.45` jest więc przenaszalny — ale przenosi się razem z wadą.**

> **Sufit szumu BLISKIEGO przebił najsłabsze poprawne trafienie DRUGI RAZ, w drugiej
> dziedzinie.** Prawo: 0,6275 wobec 0,4581. Medycyna: 0,6433 wobec 0,5682.
> **To nie jest właściwość polskiego korpusu prawnego. To właściwość metody.**

Pytanie „jakie są działania niepożądane amoksycyliny" — leku, którego w korpusie **nie
ma** — dostaje `0,6433` i wygrywa z siedmioma z dziesięciu pytań, na które korpus ma
odpowiedź. „Jaka jest dawka metforminy" trafia w dawkowanie lenalidomidu (`0,5752`).
Podmiot się zmienia, cała reszta zdania zostaje, a wektor mierzy głównie resztę.

**Konsekwencja dla planu: reranker (albo inny drugi sygnał) przestaje być opcją.**
Próg per kolekcja **nie rozwiązuje tego problemu** — w obu dziedzinach klasy się
przeplatają, więc osobna wartość dla każdej kolekcji przesunęłaby granicę wewnątrz
przeplotu, nie poza niego. Zostaje jako polisa na dziedziny o innej podłodze, nie jako
lekarstwo na to.

_Uczciwie o słabszej stronie tego pomiaru:_ **cel na pozycji 1 wypadł 7 z 10, nie 10 z 10.**
Trzy pytania mają cel niżej („na co pomaga revlimid" — pozycja 17). EPAR ma 718 fragmentów
i powtarza te same treści w charakterystyce, ulotce i oznakowaniu opakowania, więc wiele
fragmentów jest niemal identycznych; „poprawna odpowiedź" nie jest tam jednym miejscem.
Nie psuje to wniosku o suficie szumu, ale znaczy, że **ranking na tym korpusie jest
słabszy niż na Regulaminach** i przy ocenie jakości odpowiedzi trzeba to wziąć poprawkę.

### 11.1f RERANKER ZMIERZONY — NIE ROZDZIELA KLAS. Nie wdrażamy.

**Zmierzone 29.07.2026**, `scripts/wer-reranker.mjs`. OpenRouter `/rerank`, trzy modele
Cohere, oba zestawy kontrolne przepisane co do znaku (34 zapytania), 40 kandydatów
ze ścieżki wektorowej z progiem zerowym na zapytanie, 105 wywołań.

Pytanie było jedno: **czy istnieje wartość wyniku rerankera, która oddziela szum bliski
od trafnych** — tam, gdzie wektory dają przeplot.

| model | kolekcja | najniższy trafny | najwyższy szum | **przerwa** | cel na 1 |
|---|---|---|---|---|---|
| `rerank-v3.5` | Regulaminy | 0,3501 | 0,5206 | **−0,1705** | 10 z 10 |
| `rerank-v3.5` | TEST | 0,1579 | 0,5395 | **−0,3816** | 4 z 10 |
| `rerank-4-fast` | Regulaminy | 0,5035 | 0,7481 | **−0,2445** | 9 z 10 |
| `rerank-4-fast` | TEST | 0,3360 | 0,7611 | **−0,4251** | 3 z 10 |
| `rerank-4-pro` | Regulaminy | 0,7784 | 0,8853 | **−0,1069** | 10 z 10 |
| `rerank-4-pro` | TEST | 0,6989 | 0,7998 | **−0,1009** | 3 z 10 |

**PRZERWA UJEMNA W KAŻDYM Z SZEŚCIU PRZYPADKÓW. Reranker nie rozdziela tych klas.**

Najmocniejszy model (`4-pro`) daje przerwę **−0,1069 / −0,1009** wobec przerwy wektorowej
**−0,1694 / −0,0751**. Czyli: na Regulaminach nieco lepiej, na TEST nieco gorzej —
**w granicach tego, co dawał sam wektor.** Reranker jest tu wart tyle co próg, który nie
rozdziela klas.

_Dlaczego to nie jest zaskoczenie po fakcie:_ reranker to model uczony na
„czy ten fragment odpowiada na to pytanie". Pytanie o **działania niepożądane
amoksycyliny** postawione korpusowi o lenalidomidzie trafia we fragment, który JEST
o działaniach niepożądanych — po prostu innego leku. Cross-encoder ma dostęp do tej
samej informacji co bi-encoder i myli się w ten sam sposób: **podmiot to jedno słowo,
a reszta zdania pasuje idealnie.**

**Koszt i opóźnienie** (istotne, mimo negatywnego werdyktu — na wypadek powrotu do tematu):

| | |
|---|---|
| opóźnienie na zapytanie | mediana **419 ms**, średnia 467 ms, maks 1612 ms |
| koszt pomiaru (105 wywołań) | $0,1925 |
| koszt na 1000 zapytań | **$1,83** |
| cennik jednostkowy | v3.5 $0,001 · 4-fast $0,002 · 4-pro $0,0025 za wywołanie |

**RERANKER LOKALNY NIE ISTNIEJE W TEJ INSTALACJI.** Ollama 0.32.5 nie ma endpointu
rerankingu — `POST /api/rerank` i `POST /v1/rerank` zwracają **404** — a spośród dziesięciu
zainstalowanych modeli żaden nie jest cross-encoderem (trzy embeddingowe: `bge-m3`,
`nomic-embed-text`, `mxbai-embed-large`; reszta to modele generatywne i wizyjne).

> **To dotyka obietnicy pracy offline i trzeba to zapisać wprost:** gdyby reranking
> kiedyś wszedł, przełącznik przy tej funkcji ma **dwie pozycje — wyłączony i OpenRouter**,
> a nie trzy. Cała reszta potoku (embeddingi, pojęcia) chodzi lokalnie; reranking byłby
> pierwszym elementem wymagającym sieci przy KAŻDYM zapytaniu, nie tylko przy indeksowaniu.

_Pułapka w tym pomiarze, złapana i naprawiona:_ pierwsza wersja śledziła **ten konkretny**
fragment, który był celem w porządku wektorowym. Po przeszeregowaniu na czele może stać
INNY, równie poprawny — fraza „administrator" występuje w kilkudziesięciu fragmentach
RODO. Tamta wersja liczyła rerankerowi jako porażkę to, że wybrał inny dobry fragment,
i zaniżała „cel na pozycji 1" z **10 na 6**. **Miara musi być liczona tak samo po obu
stronach porównania.**

_Uczciwie o granicy tego pomiaru:_ na TEST „cel na pozycji 1" spada do 3–4 z 10, ale
korpus EPAR powtarza tę samą treść w charakterystyce, ulotce i oznakowaniu, a dopasowanie
celu po frazie jest tam surowsze niż w rzeczywistości (fragment o kapsułce 5 mg jest
poprawną odpowiedzią na pytanie o zawartość kapsułki, a fraza go nie łapie). **Wniosek
o przerwie tego nie dotyczy** — dla pytań szumu nie ma poprawnej odpowiedzi, więc
najwyższy wynik jest jednoznaczny.

### 11.1h Reguła „termin nieobecny w korpusie" — ZMIERZONA, NIE DZIAŁA w tej postaci

**Zmierzone 29.07.2026**, `scripts/wer-regula-negatywna.mjs`, oba zestawy kontrolne,
34 pytania, bez dotykania wyszukiwania.

Kandydat: rozszerzyć regułę negatywną z 11.2 (dziś: zero trafień pełnotekstowych przy
zapytaniu z identyfikatorem → `noResults`) na **terminy wyróżniające**. „Metformina",
„amoksycylina" — zero wystąpień w korpusie, więc korpus tego tematu nie obejmuje,
niezależnie od podobieństwa. Dwa warianty × sześć długości rdzenia (`simple` bez
polskiego słownika, więc dopasowanie dokładne musi zawodzić na odmianie):

| rdzeń | wariant „dowolny brakujący" | | wariant „najdłuższy brakujący" | |
|---|---|---|---|---|
| | Regulaminy | TEST | Regulaminy | TEST |
| dokł. | 7/8 szumu, **4 fałsz.** | 7/7, **7 fałsz.** | 1/8, **1 fałsz.** | 5/7, **3 fałsz.** |
| 4 | 4/8, **1 fałsz.** | 6/7, **2 fałsz.** | 0/8, 0 fałsz. | 3/7, **1 fałsz.** |
| 5 | 5/8, **2 fałsz.** | 7/7, **3 fałsz.** | 0/8, 0 fałsz. | 4/7, **1 fałsz.** |
| 6 | 7/8, **3 fałsz.** | 7/7, **4 fałsz.** | 0/8, 0 fałsz. | 4/7, **1 fałsz.** |
| 7–8 | 7/8, **4 fałsz.** | 7/7, **7 fałsz.** | 0/8, **1 fałsz.** | 4/7, **3 fałsz.** |

**ŻADNA kombinacja wariantu i długości rdzenia nie daje zera fałszywych alarmów na obu
kolekcjach naraz.** Najlepszy kompromis („najdłuższy", rdzeń 4) łapie **3 z 15** pytań
szumu przy 1 fałszywym alarmie. To nie jest 7 z 7 przy zerze — **nie wdrażamy.**

**Dlaczego zawodzi, i to jest ciekawsze niż liczby.** Dwie osobne przyczyny:

1. **Korpus 8400 różnych słów nie zawiera większości polszczyzny.** Wariant „dowolny
   brakujący" odrzuca pytania trafne przez słowa, które nigdy nie miały tam być:
   „kiedy", „mogę", „robi", „chore", „pomaga". To nie są terminy wyróżniające — to
   zwykła polszczyzna, której akurat nie ma w tych dokumentach.
2. **Na Regulaminach szum bliski UŻYWA SŁOWNICTWA Z KORPUSU.** „Jaki jest termin
   przedawnienia roszczeń z tytułu rękojmi" — `termin`, `przedawnienie`, `roszczenia`
   są w Kodeksie pracy (art. 291!), brakuje wyłącznie `rękojmi`. Dlatego wariant
   „najdłuższy" łapie tam **zero z ośmiu**: najdłuższe słowo pytania jest obecne.

> **Reguła zależy od tego, czy sąsiednia dziedzina dzieli z korpusem SŁOWNIK, czy tylko
> SKŁADNIĘ.** Medycyna wobec medycyny: nazwy leków są rozłączne, reguła coś łapie
> (4–6 z 7). Prawo wobec prawa: słownik jest wspólny, reguła nie łapie nic. **To jest
> ta sama granica, o którą rozbił się próg i reranker** — dwie dziedziny prawa są
> naprawdę podobne, na każdym poziomie, jaki umiemy zmierzyć.

_Co z tego zostaje:_ pomysł nie jest martwy, ale wymagałby **listy częstości ogólnej
polszczyzny** (żeby odróżnić „słowo rzadkie w języku i nieobecne w korpusie" od „słowo
pospolite, którego akurat tu nie ma") albo **rozpoznawania nazw własnych**. Oba to
osobne zadania z własnym pomiarem, nie wariant tej reguły.

### 11.3 Dziennik wyszukiwań — obserwowalność

**Wdrożone 29.07.2026.** `sql/session-log-wyszukiwan.sql` (migracja ręczna),
`lib/rag/search-log.js`, wyłącznik `RAG_SEARCH_LOG=off`, domyślnie włączony.

**Po co:** dziś nie wiadomo, o co ludzie pytali, co dostali i ile to trwało. Po
integracji jest to **jedyny sposób, żeby dowiedzieć się, co nie działa**, zamiast
zgadywać z pojedynczych skarg. Braku takiego zapisu nie da się nadrobić wstecz —
nie odtworzy się tego, czego nikt nie zapisał.

Zapisywane: zapytanie, kolekcja, `document_ids`, `top_k`, `min_score`, liczba wyników,
**pierwszy i ostatni wynik**, czy ruszyła ścieżka hybrydowa, ile odsiano bliźniaków,
czas w ms, `no_results` wraz z **powodem** (`prog` albo `regula_negatywna`).

> #### ⚠ TA TABELA ZAWIERA TREŚĆ ZAPYTAŃ UŻYTKOWNIKÓW
>
> „Czy mogę zwolnić pracownicę w ciąży", „jaka dawka przy niewydolności nerek",
> „ile wynosi moja odprawa" — to nie jest telemetria, tylko zapis tego, o co kto pytał.
> **Wyciek tej tabeli jest gorszy niż wyciek samych dokumentów:** dokumenty bywają
> publiczne, pytania nigdy.
>
> **PRZY I1 `rag_search_log` MUSI TRAFIĆ NA LISTĘ OBJĘTĄ RLS**, razem z `rag_documents`
> i `rag_chunks`. Bez tego polityki obejmą wiedzę, ale nie ślad po korzystaniu z niej.

**Czego celowo nie ma:** identyfikatora użytkownika. RAG nie wie nic o kontach
(sekcja 3), a dołożenie takiej kolumny teraz przesądzałoby o modelu powiązania, który
należy do I1. Kolumna `owner_ref` jest przygotowana i **zostaje `NULL`** — test tego
pilnuje, żeby nie wypełnił jej ktoś „przy okazji".

**Zapis nie może zepsuć wyszukiwania — i to jest właściwość, nie deklaracja.**
`zapiszWyszukiwanie` nie rzuca, nie jest oczekiwane (`await`) i ma **dwie osłony**:
`.catch` na odrzuconą obietnicę oraz `try/catch` wokół samego `client.from(...)`, które
wykonuje się synchronicznie. Pierwsza wersja miała tylko pierwszą z nich i deklarowała
w nagłówku regułę, której sama nie spełniała — **złapał to test, nie przegląd kodu.**

_Odwrotność reguły „brak danych wstrzymuje werdykt":_ tam brak danych ma zatrzymać
wniosek, tu brak zapisu nie ma prawa zatrzymać odpowiedzi. Różnica jest w tym, co jest
produktem — tam wnioskiem, tu odpowiedzią dla użytkownika.

**Panelu nie ma i najprawdopodobniej nie będzie potrzebny.** Cztery zapytania SQL do
obejrzenia dziennika są w komentarzu na końcu pliku migracji; najważniejsze z nich to
**pytania bez odpowiedzi pogrupowane po treści** — powtarzające się tam zapytanie znaczy
albo brakujący dokument, albo próg za wysoko, albo pytanie z sąsiedniej dziedziny (11.0).
Trzy różne przyczyny, jedna lista.

### 11.1k Odsiew powtórzonych fragmentów — WDROŻONY, ale NIE progiem wektorowym

**Zmierzone 29.07.2026**, `scripts/wer-blizniaki.mjs`: 1575 par z czoła wyników,
34 pytania, oba zestawy. Bez sieci i bez modelu — wektory już są w bazie.

**Problem:** EPAR powtarza tę samą treść w charakterystyce, ulotce i oznakowaniu.
„Ile lenalidomidu jest w jednej kapsułce" ma 14 fragmentów w odległości 0,02 od
pierwszego — agent dostaje pięć wyników, z których kilka to ta sama treść.

#### Krok 1: dwie klasy istnieją, ale NIE tam, gdzie się ich spodziewano

| klasa (wyznaczona STRUKTURALNIE, nie z podobieństwa) | n | mediana | maks |
|---|---|---|---|
| sąsiedzi z cięcia (ten sam dokument, Δ`chunk_index` = 1) | 88 | 0,8106 | **0,9668** |
| pozostałe pary | 1487 | 0,6788 | **1,0000** |

Bliźniaki są **dosłowne**: `1.0000` to ten sam tekst co do znaku, w innym miejscu
dokumentu. Ale klasy **zachodzą na siebie** — jeden sąsiad z cięcia sięga 0,9668,
bo zakładka 150 znaków to z definicji wspólna treść.

#### Krok 2: klasa rozstrzygająca przewraca pomysł progu wektorowego

Pary o **identycznym tekście poza liczbami** — 22 znalezione, najwyższa:

| podobieństwo | A | B |
|---|---|---|
| **0,9911** | „Zalecana dawka początkowa lenalidomidu wynosi **10 mg** doustnie raz na dobę…" | „…wynosi **25 mg** doustnie raz na dobę…" |
| 0,9886 | „Revlimid **25 mg** kapsułki twarde" | „Revlimid **2,5 mg** kapsułki twarde" |

**Każdy dopuszczalny próg musi więc leżeć powyżej 0,9911.** A powyżej tej wartości:

| próg | par odsianych | z tego tekst IDENTYCZNY co do znaku |
|---|---|---|
| ≥ 0,992 | 29 | 26 |
| ≥ 0,995 | 27 | **26** |
| ≥ 0,9999 | 26 | **26** |

> **W bezpiecznym zakresie próg wektorowy robi dokładnie to, co porównanie tekstu —
> tyle że z możliwością pomyłki o dawkę.** Dlatego wdrożono **porównanie znormalizowanej
> treści**, bez progu: nie ma czego stroić i nie da się skasować „10 mg" dlatego,
> że wybrano już „25 mg".

Oba warunki wdrożenia z góry spełnione: **0 z 20 pytań trafnych nie traci właściwego
fragmentu** (na każdym progu od 0,95 wzwyż), a reguła nie ma parametru, więc pytanie
o „jedną wartość działającą na obu kolekcjach" znika.

#### Zabezpieczenia

- **Odsiew idzie PRZED przycięciem do `topK`**, a zapytanie do bazy pobiera `3 × topK`
  kandydatów. Bez tego usunięte powtórki zostawiałyby dziury: prośba o pięć wyników,
  odpowiedź z trzema.
- **Wyłącznik `RAG_DEDUP=off`**, domyślnie włączony. Przy `off` limit w SQL wraca
  do dokładnie `topK` — gwarancja „bez identyfikatora zachowanie bit w bit dzisiejsze"
  (11.2) jest przez to zachowana konstrukcją, a nie obietnicą.
- **`odsiane` w wyniku `searchCollection`** — usunięcie ma być widoczne, nie ciche.
- **Zachowany fragment niesie POCHODZENIE odsianych** (`takzeW`: plik, strona,
  `innyDokument`). Powód dotyczy CYTOWAŃ: gdy identyczna treść stoi w dwóch dokumentach
  (regulamin 2023 i 2024, instrukcja w dwóch wersjach), ciche wyrzucenie jednego znaczy,
  że agent zacytuje jedną wersję i nikt się nie dowie o drugiej. **Zbieżność dwóch
  dokumentów co do znaku bywa sama w sobie informacją.** Zachowywany jest fragment
  o najwyższym wyniku, remis rozstrzyga `chunkId` — ta sama zasada co przy ziarnach
  w normalizacji pojęć.
- _Zmierzone dziś:_ **26 z 26 par o identycznym tekście leży w TYM SAMYM dokumencie,
  zero między plikami.** Pole `takzeW` jest więc dziś zabezpieczeniem na przyszłość,
  a nie odpowiedzią na istniejący problem — i tak ma zostać opisane, żeby nikt go nie
  usunął jako „nieużywanego".
- **Test regresyjny na parze różniącej się dawką** (`hybryda.test.js`), plus terminy
  i kwoty. Normalizacja obejmuje wyłącznie białe znaki i wielkość liter; **cyfry,
  jednostki i interpunkcja zostają.**

_Dlaczego to jest ten rzadki przypadek, w którym pomiar dał ROZWIĄZANIE, a nie zakaz:_
cztery poprzednie pomiary szukały sygnału, którego nie było. Ten znalazł sygnał
**mocniejszy niż zakładany** — powtórzenia okazały się dosłowne, więc nie trzeba ich
wykrywać przybliżeniem.

### 11.1j Materiał dowodowy — co leży w repo i dlaczego akurat to

Korpus testowy (`/testy-rag/`) jest w repozytorium **tylko dla danych syntetycznych** —
tak mówi komentarz w `.gitignore` i ta reguła zostaje w mocy. Od 29.07.2026 jest
**jeden świadomy wyjątek.**

#### `warunki_zycia_rodzin_w_polsce.pdf` — W REPO, NIE USUWAĆ PRZY PORZĄDKACH

To **jedyny znany egzemplarz uszkodzonej warstwy tekstowej**: 150 ze 171 stron bez
polskich znaków diakrytycznych, potwierdzone dwiema niezależnymi implementacjami
(`unpdf` i `pdftotext`). Na nim stoją dwa pomiary — **11.1d** (wykrywanie okaleczonego
tekstu) i **11.1h** (reguła „termin nieobecny w korpusie").

> **Nie jest to korpus, tylko MATERIAŁ DOWODOWY.** Przy ponownym pobraniu ze strony GUS
> można dostać wersję z **naprawioną** warstwą tekstową — i wtedy oba pomiary przestają
> być odtwarzalne, bo dowód znika. Dokładnie to stało się już raz: `ludzie-bezdomni.pdf`
> usunięto z korpusu jako „uszkodzone kodowanie", a gdy po miesiącach wrócono do sprawy,
> plik okazał się zdrowy (8,5% diakrytyków) i **pierwotnej diagnozy nie da się już
> zweryfikować**, bo dowodem był wynik, nie zapis.

#### Pozostałe trzy — POZA repo, odtwarzalne ze źródeł

| plik | źródło |
|---|---|
| `revlimid-epar-product-information_pl.pdf` | EMA, karta produktu Revlimid, sekcja *Product information* (wersja polska) |
| `CHARAKTERYSTYKA PRODUKTU LECZNICZEGO.pdf` | URPL, Rejestr Produktów Leczniczych — ChPL trazodonu |
| `InstrukcjaBeco.pdf` | strona producenta (Beko), instrukcja obsługi chłodziarki, wydanie wielojęzyczne |

Te trzy są **odtwarzalne**: przy ponownym pobraniu dostaniemy równoważny dokument, bo
zależy nam na ich treści i budowie (proza medyczna; dokument powtarzający treść w trzech
częściach; dokument wielojęzyczny), a nie na konkretnym uszkodzeniu.

### 11.1i Kształt rozkładu — ZMIERZONY, nie działa. Granica biegnie MIĘDZY KORPUSAMI.

**Zmierzone 29.07.2026**, `scripts/wer-ksztalt-rozkladu.mjs`, oba zestawy, 34 pytania,
40 kandydatów z progiem zerowym. Bez sieci, bez przeliczania.

Hipoteza: pytanie, na które korpus **ma** odpowiedź, powinno mieć **wyraźnego zwycięzcę**;
pytanie z sąsiedniej dziedziny — **płaskie czoło**. Sześć miar (cztery zamówione, dwie
warianty, jedna dorzucona):

| miara | Regulaminy | TEST |
|---|---|---|
| odstaw 1−2 | −0,0488 ✗ | −0,0304 ✗ |
| odstaw 1−2 znormalizowany | −0,0918 ✗ | −0,0549 ✗ |
| odstaw od czoła | −0,0620 ✗ | −0,0594 ✗ |
| rozrzut czoła | −0,0421 ✗ | −0,0326 ✗ |
| grubość czoła (± 0,02) | −1 ✗ | **−13** ✗ |
| maks. skok w pierwszej 10 *(dorzucona)* | −0,0366 ✗ | −0,0458 ✗ |

**Przerwa ujemna we wszystkich dwunastu przypadkach. Żadna miara nie przechodzi.**
Warunek zaliczenia był ustalony **przed** pomiarem: przerwa dodatnia, zero fałszywych
alarmów, ta sama granica na obu kolekcjach.

#### Ale to nie jest ten sam rodzaj porażki na obu korpusach

Porównanie **średnich klasowych** rozstrzyga, czy hipoteza jest *słaba*, czy *nieprawdziwa*:

| | Regulaminy | TEST |
|---|---|---|
| miar wskazujących kierunek **zgodny** z hipotezą | **6 z 6** | 2 z 6 |
| miar **ODWRÓCONYCH** | 0 | **4 z 6** |

> **Na Regulaminach hipoteza jest PRAWDZIWA, tylko za słaba** — wszystkie sześć miar
> rozdziela klasy w średniej (np. odstaw 1−2: 0,0434 wobec 0,0156), ale krańce zachodzą
> na siebie, więc granicy nie ma.
>
> **Na TEST hipoteza jest ODWRÓCONA** — pytania trafne mają czoło **grubsze** niż szum
> (3,0 wobec 2,4 fragmentu).

**To jest dokładnie ta pułapka, którą przewidziano przed pomiarem.** `revlimid-epar` ma
tę samą treść w charakterystyce, ulotce i oznakowaniu, więc pytanie **trafne** dostaje
kilkanaście niemal identycznych poprawnych fragmentów. „Ile lenalidomidu jest w jednej
kapsułce" ma **14 fragmentów w odległości 0,02** od pierwszego — i wszystkie są poprawne.

**Granica przebiega między KORPUSAMI, nie między klasami pytań.** Miara kształtu mierzy
**czy dokument powtarza treść**, a nie **czy korpus zna odpowiedź**. To jest ta druga,
bezużyteczna informacja z dwóch, o które pytano — bo żeby jej użyć, trzeba by wiedzieć
z góry, czy korpus jest powtarzalny, a to zależy od dokumentów, nie od pytania.

_Wniosek metodyczny:_ nawet gdyby ktoś w przyszłości zmierzył kształt na korpusie bez
powtórzeń i dostał rozdzielenie, **byłaby to reguła działająca warunkowo na budowie
dokumentów** — a więc niespełniająca warunku „dowolne uporządkowane pliki działają
bez strojenia".

### 11.1g Próg per kolekcja — ODRZUCONY POMIAREM, nie z gustu

Propozycja „skoro dziedziny się różnią, dajmy każdej kolekcji własny `RAG_MIN_SCORE`"
brzmi jak oczywistość. **Pomiar ją obala z dwóch stron naraz.**

**Po pierwsze, dziedziny się NIE różnią tam, gdzie miałoby to znaczenie.** Sufity szumu
przeniosły się między prawem pracy a onkologią z dokładnością 0,011–0,016:

| | Regulaminy | TEST |
|---|---|---|
| sufit szumu dalekiego | 0,4085 | 0,4198 |
| sufit szumu bliskiego | 0,6275 | 0,6433 |

To jest właściwość `bge-m3`, nie korpusu (11.1e). Osobna wartość dla kolekcji nie miałaby
z czego wynikać.

**Po drugie, i to jest argument rozstrzygający: w OBU dziedzinach klasy się przeplatają.**
Próg per kolekcja przesunąłby granicę **wewnątrz przeplotu**, nie poza niego — czyli
kupowałby jedne błędy za drugie, bez sygnału, który je rozdziela. To ten sam wzorzec, co
przy identyfikatorach (11.1) i przy scalaniu pojęć: **żaden próg nie naprawi sygnału,
który nie zawiera potrzebnej informacji.**

Zostaje wyłącznie jako **polisa** na dziedzinę o innej podłodze podobieństwa — takiej
nie znaleziono. Nie jest lekarstwem na przeplot i **nie wolno go tak przedstawiać.**

### 11.1b Pomiar progu zależy od SFORMUŁOWANIA pytania — zestaw przepisuj co do znaku

Zmierzone przy okazji 11.1a i warte osobnego akapitu, bo kosztowało jedno błędne podejście:

| pytanie | score celu |
|---|---|
| „gdzie znajduje się apteczka" | **0,4581** |
| „gdzie znajduje się apteczka **pierwszej pomocy**" | **0,6052** |

Ten sam cel, ten sam korpus, ten sam model. **Różnica 0,1471 za samo doprecyzowanie
pytania — osiemnaście razy więcej niż cały margines progu (0,0081).**

Kto w przyszłości przemierzy próg **własnym** zestawem pytań, dostanie inną liczbę i uzna
ją za regresję albo za poprawę. Nie będzie ani jednym, ani drugim.

> **Zestaw kontrolny do progu jest częścią pomiaru, nie jego dekoracją. Przepisuj pytania
> CO DO ZNAKU** z `scripts/wer-hybryda.mjs` / `scripts/diag-margines.mjs`. Zmiana
> sformułowania unieważnia porównanie z historią równie skutecznie jak zepsuty loader
> `.env.local` (ostrzeżenie wyżej) — z tą różnicą, że nic nie krzyczy.

_Kontrola porównywalności, która to potwierdziła:_ `art. 154` dał score wektorowy `0,4389`
— **co do czwartej cyfry** tę samą liczbę co przed dołożeniem RODO. Dopiero ta zgodność
dowiodła, że poprzedni pomiar był już po naprawie `_env.mjs` i wolno go zestawiać.
Jedno zapytanie o stałym sformułowaniu jest tańszym dowodem porównywalności niż cały
zestaw — **trzymaj w zestawie co najmniej jedno takie.**

**Kontrola spójności:** przed wyszukiwaniem porównaj `rag_collections.embed_model`
z konfiguracją. Rozbieżność → `model_mismatch` z jasnym komunikatem, nigdy ciche
porównywanie niekompatybilnych wektorów.

### 11.2 Wyszukiwanie hybrydowe — wektory + pełny tekst

**Problem:** wektory nie radzą sobie z **dokładnymi identyfikatorami**. Zmierzone:
`art. 36` dawało najlepsze trafienie `0,5303` z RODO zamiast z Kodeksu pracy, a
`art. 9999` (numer nieistniejący) zwracał przypis o dyrektywach EWG ze score `0,4516`,
czyli **powyżej progu**. Progu to nie naprawi — patrz „czego próg nie potrafi" w 11.1.

**`score` SIĘ NIE ZMIENIA.** To nadal podobieństwo wektorowe w `[0,1]`, porównywane
z `RAG_MIN_SCORE`. Fuzja działa na **kolejność i na wpuszczenie**, nie na tę liczbę —
próg dostrojony pomiarem na skali wektorowej znaczy dokładnie to co znaczył.

**Nowe pola trafienia:** `tekstRank` (`ts_rank_cd`, `null` gdy ścieżka nieaktywna)
i `trafionePrzez` = `wektor` \| `tekst` \| `oba`.

**Trzy reguły:**

1. **Ścieżka tekstowa uruchamia się TYLKO dla zapytań z identyfikatorem** — tokenem
   zawierającym cyfrę. Bez wiedzy o „artykułach" i o polszczyźnie; działa tak samo dla
   `Section 3` czy `ISO 9001`. **To ona czyni `noResults` bezpiecznym z konstrukcji:**
   `jak upiec sernik` nie ma cyfry, więc RPC tekstowe nie jest nawet wołane i zachowanie
   jest bit w bit dzisiejsze. Bez tego warunku słownik `simple` — jedyny dostępny, polskiego
   na tej instancji nie ma — przepuszczałby „jak" jako pełnoprawny token, bo nie zna stop-słów.
2. **Dopasowanie tekstowe wpuszcza poniżej progu i idzie w wynikach PRZED trafieniami
   tematycznymi.** Wpuszczanie jest konieczne: cel `art. 36` ma score `0,4462`, czyli pod
   progiem, i bez tego nigdy by się nie pokazał, choć zawiera dokładnie ten numer.
   Porządek: **najpierw dopasowania dokładne (malejąco po `score`), potem tematyczne
   (malejąco po `score`)**.
3. **Zapytanie z identyfikatorem + ZERO trafień tekstowych → `noResults`.** Pytano o rzecz
   dokładną, której nie ma; podobieństwo tematyczne nie jest odpowiedzią. Warunek jest
   celowo ostry — jedno trafienie wystarczy, by wrócić do trybu normalnego.

**Dlaczego przynależność, a nie fuzja rang (RRF).** Zmierzone: przy zapytaniu jednotokenowym
`ts_rank_cd` niesie prawie zero informacji — pięć wyników miało dwie wartości (0,2 i 0,1,
czyli dwa i jedno wystąpienie tokenu). Co gorsza premiuje **częstość**, więc artykuł, który
JEST trzydziesty szósty i wspomina swój numer raz, przegrywa z fragmentami, które go cytują
gęsto. Porządek tekstowy jest bezwartościowy; cenna jest sama **przynależność** do zbioru.

**Dlaczego reguła jawna, a nie wzmocnienie score o stałą.** Pierwsza wersja podbijała score
o `+0,05` i sortowała po wartości wzmocnionej. Odrzucona: stałą trzeba było dobierać tak,
żeby cel „akurat" przeskoczył szum — przy `art. 154` przeskakiwał o **0,0009**. Reguła jawna
daje ten sam efekt bez balansowania na krawędzi, a kolejność da się wypowiedzieć jednym
zdaniem.

#### Limit udziału grupy tekstowej — `UDZIAL_GRUPY_TEKSTOWEJ = 0.5`

Grupa dopasowań dokładnych zajmuje **najwyżej połowę miejsc** (zaokrąglenie w górę,
minimum 1). Nadmiarowe dopasowania nie znikają — lądują za trafieniami tematycznymi.

**To zabezpieczenie, nie parametr do strojenia.** Bez niego, przy zapytaniu
`ile dni urlopu w 2024 roku`, token `2024` daje **21 dopasowań** (przypisy typu
`U. z 2024 r. poz. 834, 1089, 1222`), które zajmują **wszystkie pięć miejsc**, a właściwy
`Art. 152` — o score `0,5606`, czyli najmocniejszy sensowny wynik — **wypada z wyników
całkowicie**. Nie zostaje przy tym żaden sygnał, że coś przepadło. Zmierzone:

| porządek | `art. 154` | `art. 6720` | `ile dni urlopu w 2024 roku` |
|---|---|---|---|
| wzmocnienie `+0,05` | cel poz. 3 | cel poz. 1, szum 3 | cel poz. 3 |
| grupowanie bez limitu | cel poz. 2 | cel poz. 1, szum 0 | **CEL WYPADA** |
| **grupowanie z limitem** | **cel poz. 2** | **cel poz. 1, szum 2** | **cel poz. 5** |

Wartość „połowa" nie została dobrana pomiarem — wynika z kształtu problemu: dopasowanie
dokładne ma pierwszeństwo, ale nie może wyprzeć całej odpowiedzi. **Kto rozważa usunięcie
limitu jako zbędnego: powyższy pomiar jest powodem, dla którego istnieje.**

> **UWAGA: kolejność NIE jest monotoniczna po `score`.** Gdy ścieżka tekstowa jest aktywna,
> `score` maleje **wewnątrz każdej grupy**, ale między grupami nie — na ekranie widać np.
> `0,4389` nad `0,4899`. To nie jest usterka: „najpierw dopasowania dokładne, potem
> tematyczne". Wyjaśnia to pole `trafionePrzez`, a UI oznacza takie trafienia etykietą
> **„dopasowanie dokładne"**. Żadna wartość porządkująca nie opuszcza rdzenia — na zewnątrz
> jedzie jeden `score`, ten sam, który porównuje się z progiem.

**Głębokość fuzji: 200 kandydatów wektorowych** (przy `topK` = 5). Cel bywa daleko
w rankingu wektorowym i dopiero wzmocnienie go wyciąga — zmierzone pozycje przed fuzją:
`co mówi art. 36 kodeksu pracy` **8**, `art. 36` **31**, `art. 154` **58**.

**Koszt: zero przeliczania wektorów.** Kolumna `content_tsv` jest `GENERATED ALWAYS`
z `content`, indeks GIN, osobna funkcja `rag_search_chunks_text`
(`sql/session-hybrid-search.sql`).

_Znane ograniczenie 1 — zakres._ Hybryda obejmuje **wyłącznie identyfikatory**. Nazwy
własne, rzadkie terminy i cytaty dosłowne pozostają przy samych wektorach — zapytanie bez
cyfry nie uruchamia ścieżki tekstowej. To świadomy zakres: tak wygląda zdiagnozowany
problem i tak `noResults` zostaje bezpieczne.

_Znane ograniczenie 2 — „zawiera" to nie „jest"._ Ścieżka tekstowa odpowiada na pytanie
**„czy fragment zawiera ten identyfikator"**, a nie **„czy fragment JEST tym artykułem"**.
Fragment powołujący się na przepis jest z jej punktu widzenia tak samo dobry jak sam
przepis. Zmierzone na `art. 154`: pierwsze miejsce zajmuje fragment ze str. 106–107
zawierający `„wymiaru wynikającego z art. 154 § 1 i 2"`, a właściwy Art. 154 ze str. 103
jest drugi.

To **ten sam wzorzec, co w pierwotnej diagnozie `ts_rank_cd`** (fragmenty cytujące numer
biją artykuł, który go nosi) — grupowanie ograniczyło jego skutek, ale go nie usunęło,
bo tkwi w samym sygnale, nie w sposobie ważenia.

**Świadomie nie naprawiamy.** Rozróżnienie „jest tym przepisem" od „powołuje się na
ten przepis" wymagałoby wiedzy o tym, jak akty prawne cytują same siebie — czyli strojenia
pod konkretną dziedzinę, tak samo jak odłożony wariant C2 z 10.a.6. Skutek jest przy tym
łagodny: właściwy artykuł nadal jest w wynikach i wysoko, a fragment powołujący się na
niego bywa użyteczną odpowiedzią sam w sobie.

_Weryfikacja:_ `scripts/wer-hybryda.mjs` — 11 przypadków, wszystkie zdane.

---

## 12. Rzutowanie 2D — struktura i reguły

**Metoda: PCA** (deterministyczna, czysty JS). UMAP/t-SNE jako możliwa podmiana za tym
samym interfejsem.

### 12.1 Struktura `rag_collections.projection`

```json
{
  "method": "pca",
  "mean": [ /* dim liczb — wektor średniej, do centrowania */ ],
  "components": [
    [ /* dim liczb — pierwsza składowa */ ],
    [ /* dim liczb — druga składowa */ ],
    [ /* dim liczb — trzecia składowa (widok 3D) */ ]
  ],
  "viewport": { "xMin": -0.42, "xMax": 0.51, "yMin": -0.38, "yMax": 0.44,
                "zMin": -0.35, "zMax": 0.39 },
  "embedModel": "bge-m3",
  "chunkCount": 812,
  "builtAt": "2026-07-24T12:00:00Z"
}
```

**`viewport` jest obowiązkowy.** Współrzędne z PCA są w jednostkach przestrzeni
wektorowej, canvas potrzebuje pikseli. Jeśli skalę liczyć przy każdym rysowaniu
z bieżącego zakresu punktów, **dołożenie jednego odległego fragmentu przeskaluje cały
obraz** i wszystkie istniejące punkty przesuną się na ekranie — mimo niezmienionych
`coord_x/y` w bazie. To złamałoby DoD Sesji 6.

Reguła: `viewport` liczony **razem z bazą** jako 5. i 95. percentyl `coord_x`/`coord_y`/`coord_z`;
punkty poza zakresem **przycinaj do brzegu** przy rysowaniu. Skala zmienia się
**wyłącznie przy przeliczeniu bazy**, nigdy przy dorzuceniu punktu.

**Wektor średniej jest obowiązkowy.** Bez centrowania nowe fragmenty rzutują się
w innym miejscu niż reszta mapy.

### 12.2 Rzutowanie
```
v0 = v - mean
coord_x = dot(v0, components[0])
coord_y = dot(v0, components[1])
coord_z = dot(v0, components[2])     // tylko do widoku 3D (12.8)
```
Licz **trzy** składowe od razu — koszt jest znikomy, a dołożenie trzeciej później
oznaczałoby przeliczenie współrzędnych wszystkich fragmentów.

### 12.3 Konwencja znaku (obowiązkowa)
Składowe PCA są określone z dokładnością do znaku — bez ustalenia konwencji przeliczenie
bazy **obróci lub odbije lustrzanie całą mapę**, co łamie DoD Sesji 6.

Reguła deterministyczna: dla każdej składowej znajdź indeks elementu o **największej
wartości bezwzględnej**; jeśli ten element jest ujemny, **odwróć znak całej składowej**.

### 12.4 Kiedy powstaje baza i kiedy się ją przelicza

Indeksowanie idzie partiami po `RAG_EMBED_BATCH` (10.3), więc moment zbudowania bazy
musi być rozstrzygnięty wprost — inaczej albo powstanie z 32 wektorów (kiepska),
albo dopiero na końcu (mapa nie może rysować się na żywo).

**Reguła:**
- Nowa zmienna: `RAG_PROJECTION_MIN_CHUNKS=50`.
- Dopóki kolekcja ma mniej niż `RAG_PROJECTION_MIN_CHUNKS` fragmentów z wektorem,
  **baza nie powstaje**, a fragmenty mają `coord_x/y = null`. UI pokazuje
  „za mało danych do mapy (N/50)" zamiast pustego płótna.
- **Kiedy sprawdzać próg:** na końcu `embedNextBatch`, gdy zwraca `finished: true`
  (koniec dokumentu) — wtedy policz liczbę fragmentów z wektorem w kolekcji i w razie
  potrzeby zbuduj bazę. Nie sprawdzaj po każdej partii.
  > **Uwaga, ta reguła dotyczy WYŁĄCZNIE sprawdzania progu i decyzji o przeliczeniu.**
  > Rzut nowych fragmentów istniejącą bazą dzieje się **po każdej partii** — patrz punkt
  > niżej („każda kolejna partia dostaje współrzędne od razu") oraz 12.6. Sesja 6b
  > przegapiła to rozróżnienie: rzutowanie wywoływane tylko przy `finished: true`
  > sprawiało, że dokument na 1283 fragmenty nie dawał mapie ani jednego punktu przez
  > 40 partii, a „połączenia na żywo" nie miały z czego powstać.
- W chwili osiągnięcia progu: zbuduj bazę i **policz współrzędne wstecz dla wszystkich**
  istniejących fragmentów. Od tego momentu mapa rysuje się na żywo, a każda kolejna
  partia dostaje współrzędne od razu.
- **Przypadki brzegowe:** przy mniej niż **3** fragmentach PCA nie ma z czego wyznaczyć
  dwóch składowych — mapa niedostępna, komunikat wprost. Jeśli kolekcja ma między 3
  a `RAG_PROJECTION_MIN_CHUNKS` fragmentów i **wszystkie dokumenty są w statusie `ready`**
  (indeksowanie skończone), zbuduj bazę z tego, co jest — mała kolekcja też ma mieć mapę.

**Przeliczanie:**
- Nowe fragmenty rzutuj istniejącą bazą — natychmiast i spójnie z mapą.
- Przelicz bazę przy **zmianie o > 30%** względem `chunkCount` — **w którąkolwiek
  stronę**; wtedy zaktualizuj `coord_x/y` **wszystkich** fragmentów i pojęć oraz
  `builtAt`/`chunkCount`.
  > **Poprawka Sesji 10 (punkt 5).** Do tej pory warunek brzmiał `liczba > bazowa * 1.3`
  > i patrzył **wyłącznie na przyrost** — ubytek nie odpalał przeliczenia nigdy.
  > Zmierzone na realnej bazie: po usunięciu „Ludzi bezdomnych" i po ponownych cięciach
  > baza rzutowania była policzona z **3091** fragmentów, gdy w kolekcji zostało **1043**.
  > Rzut pozostaje wtedy matematycznie poprawny, ale osie przestają maksymalizować
  > wariancję istniejących punktów: mapa zbija się w kąt, a `builtFrom` podaje liczbę,
  > której już nie ma. Warunek jest teraz symetryczny (`bazaNieaktualna` w `map.js`).
  >
  > **Druga warstwa tej samej jednokierunkowości — świadomie NIE naprawiona w kodzie:**
  > `refreshProjectionAfterIndexing` wołane jest wyłącznie **po zaindeksowaniu partii**.
  > Usunięcie dokumentu nie woła go wcale, więc nawet symetryczny próg nie zadziała
  > w chwili kasowania. Nie przeliczamy bazy wewnątrz usuwania celowo: pełne PCA przy
  > kasowaniu dokumentu na 1455 fragmentów zablokowałoby operację, a DoD Sesji 10 wymaga
  > czegoś odwrotnego. Zamiast tego `getMapStatus` zwraca flagę `nieaktualna`, a UI mówi
  > wprost, z ilu fragmentów pochodzi układ i ile ich jest teraz, oraz proponuje
  > „Przelicz mapę". Indeksowanie naprawia się samo, ubytek wymaga jednego kliknięcia.
- Przeliczenie **realnie przesuwa układ** — główne osie zmieniają się wraz z danymi
  i to jest zachowanie poprawne. Konwencja znaku (12.3) usuwa jedynie przypadkowe
  odbicia lustrzane. **UI powinno animować przejście współrzędnych**, żeby zmiana
  nie wyglądała na awarię.

### 12.5 Współrzędne pojęć — do czego służą

**Graf (Sesja 9) ICH NIE UŻYWA** — układa węzły fizyką, bez wspólnego układu z mapą.
Jedynym odbiorcą `rag_concepts.coord_x/y/z` jest **opcjonalne pokazanie pojęć na mapie
w Sesji 6b**: romb w miejscu, gdzie skupiają się fragmenty danego pojęcia.

**Sposób wyznaczania: środek ciężkości fragmentów**, do których pojęcie należy — nie
rzutowanie własnego wektora pojęcia. Powody: wektor jednego słowa i wektor akapitu na
900 znaków mają różną charakterystykę, więc rzutowane pojęcia potrafią skupić się
z dala od swoich fragmentów; a środek ciężkości z definicji leży **między nimi**,
co jest tym, co chcemy pokazać. Przy okazji odpada liczenie embeddingów pojęć na potrzeby
mapy (nadal są potrzebne do scalania w Sesji 8).

Aktualizuj je przy przeliczeniu bazy rzutowania (12.4), razem ze współrzędnymi fragmentów.

### 12.6 Połączenia na mapie (widok przełączalny)

Mapa ma **dwa tryby**, przełączane w UI:
- **Punkty** (domyślny) — same fragmenty, skupiska widoczne przez bliskość.
- **Połączenia** — każdy fragment połączony z `RAG_MAP_NEIGHBORS` najbliższymi
  znaczeniowo fragmentami.

**Sąsiedzi zapisywani** w `rag_chunks.neighbors` jako `[{id, dist2d}]`.
*(Uwaga na nazewnictwo: `dist2d` to odległość w rzucie 2D — **nie mylić** ze `score`
z sekcji 11, które jest podobieństwem cosinusowym w pełnym wymiarze. To dwie różne
wielkości i nie wolno ich zestawiać.)*

Nie liczy się ich **na każdą klatkę** (przy 2000 fragmentów to ~4 mln porównań na klatkę).
Policzenie raz, przy zdarzeniu, to kilkadziesiąt milisekund i jest całkowicie w porządku.

Trzy sytuacje:
- **Przyrostowo, dla nowego fragmentu** (w trakcie indeksowania) — porównanie jednego
  punktu z istniejącymi, ułamek milisekundy. Dzięki temu **połączenia powstają na żywo**.
- **Pełne przeliczenie i zapis** — przy budowie bazy rzutowania i jej przeliczeniu (12.4).
- **Widok 3D — liczony w przeglądarce, trzymany w pamięci, NIE zapisywany do bazy.**
  Kolumna `neighbors` trzyma wyłącznie sąsiedztwo 2D. Przełączenie widoku nie może
  wywoływać masowego zapisu ~2000 wierszy.

**Uczciwość nazewnictwa (por. 12.9):** sąsiedztwo liczone przyrostowo jest **niesymetryczne** —
nowy punkt znajduje swoich najbliższych, ale listy punktów istniejących nie są aktualizowane,
więc punkt A może mieć bliższego sąsiada i „nie wiedzieć" o tym do pełnego przeliczenia.
Krawędzie są deduplikowane, więc obraz pozostaje sensowny, ale **nie nazywaj tego
w UI „k najbliższych sąsiadów"** — właściwa etykieta to **„połączenia znaczeniowe"**.
Pełne przeliczenie (przy przebudowie bazy) porządkuje sąsiedztwa.

**Gdzie liczyć podobieństwo:** w **przestrzeni 2D** (na `coord_x/y`), nie w pełnym wymiarze.
Powody: liczy się w milisekundach zamiast dziesiątek sekund, a linie łączą punkty, które
użytkownik **widzi** jako bliskie — co jest spójne wizualnie. Prawdziwe sąsiedztwo
w pełnym wymiarze pokazuje wyszukiwanie (sekcja 11), nie mapa.

**Rysowanie:** linie cienkie i półprzezroczyste, kolor uśredniony z obu końców.
Krawędzie deduplikowane (A→B i B→A to jedna linia).

**Połączenia na żądanie** (działa w obu trybach): najechanie na punkt podświetla jego
sąsiadów mocniejszą linią i przygasza resztę — to najczytelniejszy sposób pokazania,
że sąsiedztwo nie jest przypadkowe (np. sąsiedzi fragmentu o urlopie pochodzą
z trzech różnych plików).

### 12.7 Przybliżanie i przesuwanie

- **Zoom** kółkiem myszy, wyśrodkowany na kursorze; zakres skali **0.5×–8×**.
- **Przesuwanie** przeciągnięciem (kursor `grab`/`grabbing`).
- **Reset widoku** — przycisk oraz dwukrotne kliknięcie w puste tło.
- Transformacja ekranowa liczona z `projection.viewport` (12.1) — **skala widoku nigdy
  nie wpływa na `coord_x/y` w bazie**.
- Przy przybliżeniu: promienie punktów i grubość linii **nie rosną liniowo** ze skalą
  (inaczej przy 8× powstanie plama) — skaluj je pierwiastkiem ze skali.
- Powyżej ~3× pokazuj przy punktach skrócone podpisy (nazwa pliku + strona).

### 12.8 Widok 3D (opcjonalny, przełączalny)

Mapa ma przełącznik **2D / 3D**. To ten sam zbiór punktów — 2D używa dwóch pierwszych
składowych, 3D dodaje trzecią (`coord_z`).

- **Rzut perspektywiczny** z sortowaniem po głębi: punkty dalsze rysowane najpierw,
  mniejsze i bledsze. Bez tego chmura wygląda płasko.
- **Obrót**: przeciągnięciem myszą; po zakończeniu indeksowania delikatny obrót
  automatyczny (pokazuje, że to przestrzeń, a nie obrazek).
- **Sąsiedzi przeliczani przy przełączeniu widoku** — w trzech wymiarach najbliżsi bywają
  inni niż w dwóch.
- **Domyślny widok to 2D.** 3D wygląda lepiej na prezentacji, ale czyta się gorzej:
  punkty się zasłaniają, głębia myli się z odległością, trafienie w konkretny punkt
  jest trudniejsze. Traktuj 3D jako widok pokazowy, nie roboczy.

### 12.9 UCZCIWOŚĆ WIZUALIZACJI — wymóg nadrzędny

Wizualizacja ma pokazywać **realny przebieg budowy bazy**, a nie efektowną animację.
To jest wymóg produktowy: narzędzie ma uczyć, jak RAG działa naprawdę.

**ZAKRES: ta sekcja dotyczy MAPY (Sesja 6), nie grafu (Sesja 9).**
Na mapie współrzędne są policzone z góry, więc **jakikolwiek ruch punktów byłby kłamstwem**.
W grafie układ liczy algorytm force-directed — węzły przemieszczają się, zanim symulacja
się ustabilizuje, i to **jest prawdziwe działanie algorytmu**, a nie ozdobnik. Ruch węzłów
w grafie jest dozwolony i pożądany.

**Zakazane:** animacje sterowane licznikiem czasu, punkty „lecące" z losowych pozycji
i „układające się" w skupiska, sztuczne fazy porządkowania. **Takiego etapu nie ma** —
fragment dostaje współrzędne od razu poprawne, skupiska nie powstają, tylko wychodzą
z rzutowania.

**Wymagany przebieg (odzwierciedla stan faktyczny):**

| Etap | Co widać |
|---|---|
| ekstrakcja i cięcie | licznik fragmentów, brak mapy |
| embedding poniżej progu | licznik „N / `RAG_PROJECTION_MIN_CHUNKS`", **mapy nadal nie ma** |
| przekroczenie progu | baza zbudowana → **cała mapa pojawia się naraz**, z połączeniami |
| kolejne partie | nowe punkty **od razu na właściwym miejscu**, ich połączenia rysowane na żywo (krótkie podświetlenie nowej krawędzi) |
| przeliczenie bazy (12.4) | wszystkie punkty **płynnie przechodzą** na nowe pozycje, z komunikatem |

Wszystkie te zdarzenia pochodzą z pętli indeksowania (10.3), nie z timera.

**Prototypy w repozytorium — przypisanie zakresów:**

| Plik | Sesja | Co z niego brać | Czego NIE brać |
|---|---|---|---|
| `rag-realny-2d3d.html` | **Sesja 6 (+6b)** | pełny przebieg, przełącznik 2D/3D, tryb połączeń, zoom, podświetlanie sąsiadów | **skalowania ekranowego** — prototyp skaluje na sztywno (`W*.34*cam.s`), bo sztuczne wektory leżą w zakresie −1…1; w implementacji transformacja MUSI brać się z `projection.viewport` (12.1), inaczej jeden odległy punkt przeskaluje obraz i złamie DoD Sesji 6. **Oraz `Math.random()` w `buildBasis()`** — to atrapa PCA, żeby osie w ogóle drgnęły; naprawdę zmieniają się dlatego, że zmieniły się dane. Losowość w tym miejscu to dokładnie to, czego zakazuje 12.9. |
| `rag-graf-pro.html` | **Sesja 9** | wygląd węzłów, krawędzi, poświat, podświetleń i ścieżki zapytania | **sekwencji budowy** — pokazuje fragmenty jako węzły i buduje graf w trakcie indeksowania, czego Sesja 9 nie robi |

W UI zastrzeżenie: rzut z wielu wymiarów na płaszczyznę jest uproszczeniem — odległości
na ekranie są poglądowe.

---

## 13. Testy

`lib/rag/` pojedzie do drugiego projektu — musi mieć testy jednostkowe. Minimum:

**Cięcie tekstu** (fixture'y):
- akapit > `RAG_CHUNK_MAX` dzieli się po zdaniach,
- pojedyncze zdanie > max tnie się twardo,
- fragment < `RAG_CHUNK_MIN` scalany,
- zakładka nie przekracza nagłówka,
- **`extracted_text.slice(char_start, char_end) === content`** dla każdego fragmentu,
- fragment nigdy nie przechodzi przez nagłówek,
- CSV: każdy fragment zawiera powtórzony nagłówek kolumn,
- **scalanie krótkiego fragmentu nie przekracza nagłówka** (8.3.6),
- determinizm: to samo wejście → identyczny wynik.

**Normalizacja pojęć:** „urlop"/„urlopy"/„Urlop" → jedno kanoniczne; pojęcia odległe
znaczeniowo nie scalone; **idempotencja** — powtórne uruchomienie nic nie zmienia;
**pierwszeństwo ziaren** — po dołożeniu pojęcia o wyższym `mention_count` niż istniejące
kanoniczne nie powstaje łańcuch `merged_into`.

**Score:** `1 - distance`, zakres `[0,1]`, sortowanie malejąco, próg odcina poprawnie.

**Rzutowanie:** ten sam wektor + ta sama baza → te same współrzędne; konwencja znaku
daje identyczny wynik przy powtórnym liczeniu PCA na tych samych danych.

`npm test` czysty przed zakończeniem każdej sesji.

---

## 14. Plan sesji

### Wariant 1

**Sesja 0 — środowisko i diagnostyka.**
Projekt Next.js (JS, App Router), klient Supabase wg sekcji 5, `.env.local`, `.gitignore`.
`/api/rag/status` + ekran diagnostyki (baza, Ollama, modele). Instrukcje dla mnie:
`pgvector`, `ollama pull`.
_DoD:_ aplikacja startuje; diagnostyka pokazuje realny stan; brak konfiguracji daje
czytelny komunikat, nie crash.

**Sesja 1 — BAKE-OFF MODELU (blokująca).**
Procedura z sekcji 6, łącznie z **testem prefiksów (6.1)**. **Nie twórz schematu.**
_DoD:_ tabela porównawcza (trafność, prefiksy, czas), rekomendacja, zatwierdzony model,
wymiar i prefiksy.

**Sesja 2 — schemat + rdzeń kolekcji + warstwa HTTP.**
Skrypt SQL **z podstawionym literałem wymiaru** (7.1), indeksy wg 7.2 (bez wektorowego),
RLS off. `lib/rag/` — kolekcje. `/api/rag/collections*`. Kontrola `dim_mismatch`
w `/status`. UI listy kolekcji.
_DoD:_ tworzę kolekcję, zapisuje się, przeżywa odświeżenie; `/status` wykrywa
niezgodność wymiaru; UI nie dotyka bazy bezpośrednio.

**Sesja 3 — wgrywanie, ekstrakcja, cięcie (+ testy).**
Upload (limit `RAG_MAX_FILE_MB`), ekstrakcja wg 8.1 (pdf, docx, txt, md, **csv wierszami**),
zapis `extracted_text` wg 8.4, cięcie wg 8.2–8.5, `rag_chunks` bez wektorów, status `chunked`.
Testy chunkera (sekcja 13).
Dodatkowo: PDF z warstwą tekstową tylko na części stron **nie** dostanie `no_text`,
a będzie w praktyce bezużyteczny. Gdy `char_count` jest nieproporcjonalnie mały
względem `page_count` (np. < 200 znaków na stronę), oznacz dokument ostrzeżeniem
w UI („dokument wygląda na częściowo zeskanowany — rozpoznano mało tekstu").

_DoD:_ wgrywam PDF, DOCX i CSV; widzę fragmenty z `heading_path` i stronami;
`npm test` przechodzi; skan → `no_text` bez crasha; PDF częściowo zeskanowany →
ostrzeżenie; plik > limitu → `limit_exceeded`.

**Sesja 4 — embeddingi partiami.**
`createEmbeddingProvider` z `embedDocuments`/`embedQuery` i prefiksami (6.1);
implementacja Ollama + zaślepka chmurowa. `embedNextBatch` + endpoint `/embed`,
pętla po stronie klienta z paskiem postępu, wznawialność wg 10.3.
_DoD:_ po wgraniu pliku klikam „indeksuj", widzę postęp partiami; **przerwanie
i ponowne uruchomienie kontynuuje od miejsca przerwania**; wyłączona Ollama →
czytelny komunikat.

**Sesja 5 — wyszukiwanie.**
`searchCollection` wg sekcji 11 (score, próg, `noResults`), kontrola `model_mismatch`,
filtr po dokumentach, UI z nazwą pliku, `heading_path`, stroną i wynikiem.
_DoD:_ pytanie o rzecz obecną tylko w jednym pliku zwraca fragment z tego pliku;
pytanie spoza bazy zwraca „nie znalazłem", nie pięć losowych fragmentów.

**Sesja 6 — mapa punktów (rdzeń).**
PCA wg sekcji 12 — **trzy składowe**, struktura `projection`, `viewport`, konwencja znaku;
zapis `coord_x/y/z` i `neighbors` (2D). `getMapData` + `GET /api/rag/collections/[id]/map`.
Canvas z mapą (kolor = dokument), najechanie pokazuje fragment i źródło, zapytanie
podświetla trafienia, zoom i przesuwanie (12.7).

**Element obowiązkowy: uczciwy przebieg wg 12.9.** Wzorzec: `rag-realny-2d3d.html`.

*Uwaga: `neighbors` liczone i zapisywane są już tutaj, choć korzysta z nich dopiero
Sesja 6b. To celowe — dołożenie ich później oznaczałoby przeliczenie i zapis dla
wszystkich fragmentów. **To nie jest martwy kod, nie usuwaj go.***

_DoD (sprawdzalne):_
- dwukrotne policzenie PCA na tych samych danych daje **identyczne** współrzędne,
- dodanie pliku **bez** przeliczania bazy: nowe punkty w spójnych miejscach, istniejące
  **nie ruszają się wcale**,
- przeliczenie bazy zmienia układ **ciągle, bez odbicia lustrzanego**; UI animuje przejście,
- poniżej progu `RAG_PROJECTION_MIN_CHUNKS` widzę licznik „za mało danych do mapy",
  po przekroczeniu współrzędne pojawiają się dla wszystkich fragmentów wstecz,
- **przebieg jest uczciwy (12.9):** żaden element nie jest sterowany timerem,
- zoom i przesuwanie działają; reset wraca do widoku wyjściowego; skala nie zmienia
  `coord_x/y/z` w bazie.

**Sesja 6b — widoki mapy (opcjonalna, była do odłożenia — ZROBIONA).**
Rozszerzenia wizualne mapy, oddzielone od Sesji 6 świadomie: **żadne z nich nie wpływa
na jakość wyszukiwania**, a razem potrafią zająć więcej czasu niż cała reszta wariantu 1.
Rób je dopiero, gdy Sesja 5 (próg `RAG_MIN_SCORE`) jest dostrojona.
- **tryb połączeń** (12.6) — przełącznik punkty/połączenia, połączenia powstające na żywo
  w trakcie indeksowania, podświetlanie sąsiadów po najechaniu,
- **widok 3D** (12.8) — przełącznik 2D/3D, rzut perspektywiczny, sortowanie po głębi,
  obrót myszą; sąsiedzi 3D liczeni **w przeglądarce**, bez zapisu do bazy,
- **pojęcia na mapie** (12.5, jeśli wariant 2 jest już zrobiony) — romby w środku
  ciężkości ich fragmentów; `getMapData` zwraca je w polu `concepts`.

_DoD:_ przełącznik pokazuje i ukrywa połączenia; przy 2000 fragmentów mapa z połączeniami
pozostaje płynna; nowe połączenia rysują się na żywo z krótkim podświetleniem;
przełącznik 2D/3D działa, w 3D punkty mają głębię, obrót działa, **przełączenie widoku
nie zapisuje niczego do bazy**.

**ZAMKNIĘTA — DoD potwierdzone klikaniem (2026-07-26).** Sprawdzone na żywo: brak regresji
Sesji 6 (zoom, przesuwanie, dymki, determinizm po „Przelicz bazę"), przełącznik połączeń,
widok 3D z głębią i obrotem, brak zapisu do bazy przy przełączeniu widoku (checksum
`coord_x/y/z` + `neighbors` przed i po identyczny), płynność przy 3091 fragmentach
i ~7000 krawędzi, indeksowanie z listy dokumentów widoczne na mapie na żywo w jednym
widoku, układ jednokolumnowy na wąskim ekranie.

Nazewnictwo „połączenia znaczeniowe" z 12.6 dotrzymane. Cztery rozstrzygnięcia
warte zapamiętania:
- **Indeksowanie odpala się ze strony mapy**, nie tylko ze strony kolekcji — inaczej
  „na żywo" wymagało dwóch kart. Pętla z 10.3 siedzi w `app/_hooks/useIndeksowanie.js`,
  jedna implementacja dla obu stron.
- **Mapa jest komponentem, nie stroną.** `app/_components/MapaFragmentow.jsx` trzyma
  całość (dane, rysowanie, interakcja); `/kolekcje/[id]/mapa` to otoczka z nagłówkiem,
  a ten sam komponent stoi przyklejony w prawej kolumnie strony kolekcji, żeby dało się
  klikać „Indeksuj" w liście i patrzeć na powstające punkty w jednym widoku. Prop
  `osadzona` przełącza cały tryb wbudowany; osadzona mapa **nie odpytuje niczego sama** —
  odpowiedzi `/embed` podaje jej rodzic przez `onApi().naPartie`.
- **Nowe punkty przychodzą w odpowiedzi `POST /embed`** (`newChunks`), nie z odpytywania.
  Pierwsza wersja ciągnęła `/map?neighbors=1` co 2 s: przy 3091 fragmentach 1,6 MB
  na odczyt, czyli ~1,4 GB na jedno 29-minutowe przeindeksowanie. Po zmianie cały
  przebieg to ~3,3 MB. Odpytywanie zostało jako ścieżka zapasowa (indeksowanie z innej
  karty): co 5 s pytanie o sam postęp, a odczyt mapy dopiero gdy licznik drgnie i **bez**
  `neighbors=1` — nowe punkty dostają wtedy połączenia po najbliższym pełnym wczytaniu.
- **Odsłanianie partii po kolei świadomie odrzucone** (12.9): kolejność liczenia w Ollamie
  jest prawdziwa, ale moment odsłonięcia byłby wymyślony, bo aplikacja dowiaduje się
  o fragmentach dopiero po powrocie całej partii. Zostało uczciwe wejście punktu:
  rozjaśnienie z przezroczystości **na swoim miejscu**, 600 ms.

> **Po Sesji 6 wariant 1 jest kompletny i użyteczny** — działający RAG z mapą.
> Sesja 6b to rozszerzenia wizualne; można je zrobić później albo wcale. **Zrobione
> 26.07.2026** — razem z nią weszła naprawa rzutowania po każdej partii, która była
> luką w Sesji 6 względem 12.4 (patrz uwaga przy tamtej regule).

### Wariant 2

> ✅ **WARIANT 2 KOMPLETNY (27.07.2026)** — Sesje 7, 8 i 9 zamknięte. Pojęcia
> wyciągane, normalizowane i pokazywane w grafie. Pojęcia istnieją dla pięciu
> małych dokumentów; **Kodeks i RODO świadomie nieprzepuszczone** (~2,5 h na modelu
> lokalnym), co zostawia otwarte dwie rzeczy wymagające tego materiału: strojenie
> `RAG_CONCEPT_MERGE_LEXICAL_MIN` i punkt DoD Sesji 9 o fragmentach z różnych
> dokumentów.

**Sesja 7 — wyciąganie pojęć.** ✅ ZAMKNIĘTA (27.07.2026)
Model zwraca `RAG_CONCEPT_PER_CHUNK` pojęć na fragment (odpowiedź strukturalna, bez prozy).
Praca partiami (ten sam wzorzec co 10.3), uruchamialne dla istniejących dokumentów.

Rozstrzygnięcia:
- **Scalanie identycznych etykiet dzieje się TUTAJ, przy zapisie**, nie w Sesji 8.
  Ograniczenie `unique (collection_id, label_normalized)` uniemożliwia powstanie
  dwóch takich wierszy, więc użyj:
  `insert ... on conflict (collection_id, label_normalized) do update set
  mention_count = rag_concepts.mention_count + 1`.
- **Embeddingi pojęć licz przez `embedDocuments`** (nie `embedQuery`). Wektory pojęć
  są porównywane wyłącznie między sobą, więc liczy się spójność prefiksu, a nie to,
  czy pojęcie „jest zapytaniem".

_DoD:_ fragmenty mają pojęcia; lista pojęć kolekcji z licznikami; powtórne wystąpienie
tej samej etykiety zwiększa `mention_count`, nie tworzy duplikatu.

#### Rozstrzygnięcia Sesji 7 (luki w SPEC wypełnione pomiarem)

**Dostawca: domyślnie `ollama`, nie `anthropic`.** Powód jest produktowy, nie techniczny —
przy narzędziu dla różnych użytkowników treść ich dokumentów nie wychodzi na zewnątrz.
Obie implementacje istnieją za jednym interfejsem (`lib/rag/concepts-provider.js`);
przełączenie to zmiana `RAG_CONCEPT_PROVIDER`, bez dotykania kodu. **Struktura odpowiedzi
jest WYMUSZANA, nie proszona:** Ollama dostaje schemat JSON w parametrze `format`
(gramatyka dekodera), Anthropic — `output_config.format` z `json_schema`.

_Koszt do porównania:_ `claude-haiku-4-5` to **$1 / 1M wejścia, $5 / 1M wyjścia**
→ ≈ **0,75 USD** za kolekcję „Regulaminy" (~1000 fragmentów). Prompt caching **nic tu nie
daje** — minimalny cache'owalny prefiks Haiku 4.5 to 4096 tokenów, instrukcja ma ~250.
Model lokalny: **~19 s na fragment** (z embedowaniem nowych pojęć) → Kodeks pracy ≈ 2,5 h.
Wybór jest więc między dwiema i pół godziny a 75 centami i wysłaniem treści na zewnątrz.

**`label_normalized`** (SPEC tego nie definiował):

```
NFC → trim → zwinięcie białych znaków → małe litery
    → zdjęcie otaczających cudzysłowów → zdjęcie końcowej interpunkcji
```

**Bez usuwania diakrytyków i bez stemmingu:** „Urlop" = „urlop", ale „urlop" ≠ „urlopu" —
sklejanie form fleksyjnych to robota normalizacji wektorowej z Sesji 8. **NFC jest konieczne
i nieoczywiste:** polskie „ą" bywa jednym punktem kodowym albo złożeniem „a" + ogonek;
bez normalizacji dwie wizualnie identyczne etykiety mają różne bajty, `unique` ich nie
łączy i w grafie stają dwa węzły nie do odróżnienia okiem. Ta sama klasa pułapki co
warianty odstępów w paginie RODO (10.a.2).

**`mention_count` WYPROWADZANY z `count(*)`, nie inkrementowany — odejście od litery SPEC.**
Zalecane `on conflict … do update set mention_count = mention_count + 1` **nie jest
idempotentne**, a wznawialność czyni powtórzenia normalnym trybem pracy, nie wyjątkiem.
`rag_chunk_concepts` ma klucz główny `(chunk_id, concept_id)`, więc powiązanie jest
idempotentne — licznik nie. Po dwóch przerwanych przebiegach „urlop" pokazałby 40 wystąpień
przy 25 fragmentach i **nic by tego nie wykryło**: liczba wygląda wiarygodnie, a graf kłamie
o wadze węzła. Przeliczane po każdej partii (nie przy odczycie), bo pojęcia czyta też graf
z Sesji 9 i agregat na każde wejście kosztowałby więcej.

**Fragmenty śmieciowe: próg LICZBY WYRAZÓW, nie długości.** Wyraz = token o co najmniej
dwóch literach. Domyślnie **8** (`RAG_CONCEPT_MIN_WORDS`).

_Dlaczego nie długość — zmierzone na „Regulaminach":_ próg 200 znaków flaguje 36 fragmentów,
z czego **17 to prawdziwa treść**, w tym cały rozdział o reklamacjach z `05-instrukcja-bhp.pdf`
(149 znaków, 1 z 5 fragmentów) i reguła o urlopie z `01-regulamin-pracy.md` (139 znaków).
Mały dokument straciłby 20% treści i **nikt by tego nie zauważył**. Liczba wyrazów flaguje
19 fragmentów i wszystkie są śmieciem („Rozdział I" ×10, „M. SCHULZ", „(uchylony)"). Histogram
ma pustą przerwę: śmieci ≤6 wyrazów, treść ≥10, **między 7 a 9 nie ma niczego** — próg 8 leży
w środku przerwy, nie jest dostrojony do wyniku.

_Reguła „≥2 litery" jest nośna:_ bez niej `"U S T A W A z dnia 26 czerwca 1974 r."` liczy się
jako 12 wyrazów i przechodzi; z nią ma 2 („dnia", „czerwca") i wypada.

**Próg siedzi w ZAPYTANIU** (`rag_chunks_without_concepts`, `sql/session-7-concepts.sql`),
nie w kodzie po pobraniu. Inaczej pominięte śmieci wracałyby jako kandydaci przy każdym
wywołaniu — nigdy nie dostaną pojęć, więc nigdy nie znikną — i pętla nie zwróciłaby
`finished`. Skończoność jest własnością konstrukcji, nie kodu wołającego.

**`RAG_CONCEPT_PER_CHUNK`: 2, nie 3 ze specyfikacji.** Zmierzone na `01-regulamin-pracy.md`
(7 fragmentów), mistral-nemo:

| | przy 3 | przy 2 |
|---|---|---|
| różnych pojęć | 18 | **13** (−28%) |
| pojęć na fragment | 2,57 | 1,86 |
| węzłów o „urlop" | 6 | 4 |
| węzłów o „nadliczb" | 2 | **1** |

**Trzecia pozycja okazała się śmietnikiem.** W sześciu z siedmiu fragmentów przejście na 2
usunęło dokładnie tę etykietę, która nie niosła treści: „dyspozycja" (wyrwane z „pozostaje
w dyspozycji pracodawcy"), „przedłużony urlop", „godziny nadliczbowe" (wariant „pracy
nadliczbowej"). Model, który **musi** zwrócić trzy pojęcia, gdy widzi dwa, dopycha wariantem
drugiego albo słowem wyrwanym z kontekstu.

> ⚠️ **OBSERWACJA WAŻNIEJSZA NIŻ SAME 28% — KONSEKWENCJA DLA SESJI 8.**
> Model **nie zrezygnował z dopychania, tylko przeniósł je do WNĘTRZA etykiety.**
> Fragment o prawie do urlopu dał przy 3 czystą frazę `„urlop wypoczynkowy"`, a przy 2 —
> `„prawo do urlopu wypoczynkowego"` i `„nieprzerwany urlop"`, czyli **dwie frazy dłuższe
> i bardziej opisowe**. Mając mniej miejsc, upchnął więcej treści w każde.
>
> To ma bezpośrednią konsekwencję dla normalizacji wektorowej: **dłuższe frazy opisowe mogą
> być trudniejsze do sklejenia niż krótkie warianty.** „urlop" i „urlop wypoczynkowy" leżą
> blisko; „urlop" i „prawo do urlopu wypoczynkowego" niekoniecznie, bo druga niesie dodatkowe
> znaczenie („prawo do"). Przy `RAG_CONCEPT_MERGE_THRESHOLD = 0,88` to może zadecydować
> o tym, czy pojęcia się połączą. Jeśli Sesja 8 nie skleja rodziny urlopowej, ten wynik jest
> pierwszym miejscem, gdzie szukać przyczyny — a obniżenie `PER_CHUNK` **nie jest** wtedy
> lekarstwem, tylko możliwym źródłem.

> ⚠️ **DOMKNIĘCIE TEJ OBSERWACJI (Sesja 9): LIMIT OBCINA WEDŁUG POZYCJI W TEKŚCIE,
> NIE WEDŁUG WAŻNOŚCI.**
>
> Powyższy wynik sugerował, że przy 3 do puli wpada śmieć, a przy 2 zostaje treść —
> czyli że model porządkuje etykiety malejąco po istotności. **Tak nie jest.**
> Zmierzone na `03-pracownicy.csv` (jeden fragment, 617 znaków, sześć kolumn),
> wołając dostawcę bezpośrednio, bez zapisu do bazy:
>
> | `PER_CHUNK` | etykiety |
> |---|---|
> | 2 | Imię · Stanowisko |
> | 4 | Imię · Nazwisko · Dział · Stanowisko |
> | 6 | Imię · Nazwisko · Dział · Stanowisko · Data zatrudnienia · **Wymiar urlopu** |
>
> Model idzie **po kolei od początku tekstu**. W prozie wygląda to jak porządkowanie
> po ważności, bo zdanie tematyczne stoi zwykle na początku. **W dokumencie
> tabelarycznym, gdzie każda kolumna jest równorzędnym pojęciem, obcięcie jest
> całkowicie arbitralne** — „Wymiar urlopu" przepada nie dlatego, że jest mniej
> istotny niż „Imię", tylko dlatego, że stoi w szóstej kolumnie.
>
> Konsekwencja praktyczna: `PER_CHUNK = 2` jest dobrany do prozy regulaminowej
> i **nie przenosi się na dane tabelaryczne**. Gdyby kiedyś liczyły się pojęcia
> z CSV-ów, limit musi zależeć od struktury fragmentu, a nie być stały.
> Skrypt: `scripts/sym-mosty-perchunk.mjs`.

**Wyciek przykładów z instrukcji — pułapka, która byłaby niewidoczna.** Pierwsza wersja
instrukcji używała przykładów z prawa pracy („ekwiwalent za urlop", „wypowiedzenie
zmieniające"). Zmierzone na `05-instrukcja-bhp.pdf`: dla fragmentu o **porażeniu prądem**
mistral-nemo zwrócił dokładnie te etykiety — przepisał przykłady zamiast czytać fragment.
Groźne jest nie przepisywanie, tylko to, że **na docelowym korpusie byłoby niewidoczne**:
w Kodeksie pracy „ekwiwalent za urlop" wygląda wiarygodnie pod dowolnym fragmentem.
Przykłady pochodzą teraz z **obcej dziedziny** (kuchnia), bo takie słowa nie mogą wystąpić
w żadnym dokumencie kolekcji i każdy wyciek rzuca się w oczy. Jest na to test.

**Wybór modelu lokalnego: `mistral-nemo`.** Porównane na tych samych 5 fragmentach BHP:

| model | czas/fragm. | wielowyrazowe | dyskwalifikacja |
|---|---|---|---|
| **mistral-nemo** | 14,4 s | **9/15** | — |
| qwen2.5:7b | 13,6 s | 5/15 | chybia temat (przy fragmencie o dymie i iskrzeniu dał „urządzenie", „zasilanie", „przełożony") |
| llama3.1:8b | 14,4 s | 4/15 | **gubi diakrytyki** („urzadzenia", „dowod") i zwraca dopełniacz („usterek") |

Brak ogonka nie jest kwestią estetyki: `label_normalized` nie dodaje diakrytyków, a normalizacja
wektorowa z Sesji 8 też ich nie scali — „dowod" zostaje osobnym węzłem grafu na zawsze.

_Znane ograniczenie — kolekcje mieszane językowo._ Reguła „etykieta zawsze po polsku"
oznacza, że dokument w innym języku dostanie etykiety **tłumaczone**. To decyzja świadoma:
pojęcia są per kolekcja (`unique (collection_id, label_normalized)`), a graf ma być spójny
wewnątrz niej — etykiety w języku źródła rozbiłyby go na nieprzecinające się zbiory.

**Sesja 8 — normalizacja pojęć (najtrudniejsza) + testy.** ✅ ZAMKNIĘTA (27.07.2026)

Algorytm — **implementuj dokładnie tak**:
1. **Zabezpieczenie:** identyczne `label_normalized` scalaj bezwarunkowo.
   W praktyce nic nie znajdzie — ograniczenie `unique (collection_id, label_normalized)`
   i `on conflict` z Sesji 7 nie dopuszczają duplikatów. Zostaw jako siatkę bezpieczeństwa.
2. **Grupowanie wektorowe — nie porównania parami.** Porównania parami dają błędną
   przechodniość („urlop"≈„urlopy", „urlopy"≈„dni wolne" **nie** znaczy
   „urlop"≈„dni wolne"). Zamiast tego:
   - **PIERWSZEŃSTWO ZIAREN:** pojęcia, które są już kanoniczne dla kogokolwiek
     (istnieje wiersz z `merged_into = ich id`), **zawsze pozostają ziarnami**,
     niezależnie od `mention_count`. Dopiero po nich sortuj resztę malejąco po
     `mention_count` (remis → alfabetycznie).
     *Powód:* bez tej reguły ponowne uruchomienie po dołożeniu dokumentów tworzy łańcuchy.
     Jeśli „urlop" jest kanoniczne dla „urlopy", a nowe „dni wolne" uzbiera wyższy
     `mention_count`, stałoby się ziarnem i wchłonęło „urlop" — powstałby łańcuch
     „urlopy" → „urlop" → „dni wolne", czyli dokładnie to, czemu ma zapobiegać punkt 3.
   - iteruj: pierwsze nieprzypisane pojęcie z tak posortowanej listy zostaje **ziarnem**,
   - do jego grupy trafiają wszystkie nieprzypisane pojęcia o podobieństwie
     do **ziarna** (nie do siebie nawzajem) ≥ `RAG_CONCEPT_MERGE_THRESHOLD`,
   - powtarzaj do wyczerpania.
3. **Kanoniczne** = ziarno grupy. Pozostałe dostają `merged_into = id_kanonicznego`.
   **Kanoniczne ma zawsze `merged_into = null`** — to gwarantuje brak łańcuchów.
4. **Przepięcie powiązań:** `rag_chunk_concepts` scalonych pojęć przepnij na kanoniczne.
   Klucz główny to `(chunk_id, concept_id)`, więc konieczne
   `insert ... on conflict (chunk_id, concept_id) do nothing`, potem usuń stare wiersze.
5. **`mention_count` kanonicznego** = suma wartości wszystkich scalonych.
6. **Idempotencja:** pomijaj pojęcia, które już mają `merged_into`. Powtórne uruchomienie
   nie zmienia niczego i nie tworzy łańcuchów.
7. Zwróć raport `{ merged: [{from, into}], conceptCount }`.

_DoD:_ liczba pojęć w rzędzie dziesiątek, nie setek; duplikaty scalone; raport widoczny
w UI; **drugie uruchomienie zwraca pustą listę scaleń**; **po dołożeniu dokumentu
z nowymi pojęciami i ponownym uruchomieniu nie powstają łańcuchy `merged_into`**
(każde scalone wskazuje na pojęcie z `merged_into = null`); `npm test` czysty.

#### Rozstrzygnięcia Sesji 8

_Zweryfikowane na 18 pojęciach z `01-regulamin-pracy.md`:_ 18 → 16 pojęć, drugie
uruchomienie **0 scaleń**, **zero łańcuchów**. Algorytm (punkty 1–7) zaimplementowany
dokładnie wg SPEC w `lib/rag/normalize-concepts.js`.

**ROZPOZNANA PRZYCZYNA, DLA KTÓREJ SAM PRÓG NIE WYSTARCZA — nie strójcie go w nieskończoność.**

Sesja 8 była projektowana pod **warianty fleksyjne** („urlop"/„urlopy"/„Urlop").
Sesja 7 produkuje natomiast **frazy semantycznie rozszerzone** — „prawo do urlopu",
„wymiar urlopu", „coroczny urlop". Te naprawdę leżą dalej i **bge-m3 ma rację**:
„wymiar urlopu" nie jest inną formą „urlopu", tylko innym pojęciem. Zmierzone:

| para | podobieństwo |
|---|---|
| „urlop wypoczynkowy" ↔ „urlop" | **0,8911** ← jedyna nad progiem 0,88 |
| „wymiar urlopu" ↔ „urlop" | 0,8311 |
| „prawo do urlopu" ↔ „urlop" | 0,8281 |
| „przedłużony urlop" ↔ „urlop" | 0,7868 |
| „coroczny urlop" ↔ „urlop" | 0,7483 |

Im więcej fraza niesie ponad rdzeń, tym dalej leży. Zejście do 0,70 skleja rodzinę,
ale zaczyna zgarniać rzeczy niepowiązane. **To ten sam wzorzec co przy identyfikatorach
w 11.1: żaden próg nie rozdziela klas, bo sygnał nie zawiera potrzebnej informacji.**

**DRUGI SYGNAŁ: nakładanie leksykalne** (`RAG_CONCEPT_MERGE_LEXICAL`, **domyślnie
wyłączony**). Reguła: `cos ≥ mergeThreshold` **ALBO** (`cos ≥ mergeLexicalMin` **AND**
wspólny rdzeń ≥ `stemMin` liter). Nakładanie jest warunkiem **dodatkowym, nigdy
zastępczym** — sam wspólny rdzeń nie scala niczego.

_Separacja zmierzona na 153 parach:_ pary **ze** wspólnym rdzeniem ≥5 liter — średnia
0,7790, maks **0,9287**; pary **bez** — średnia 0,5329, maks **0,7200**. Żadna para bez
wspólnego rdzenia nie przekracza 0,72.

_Co by dołożył przy `mergeLexicalMin = 0,82`:_ „praca nadliczbowa" ← „godziny nadliczbowe"
(0,8643), „urlop" ← „wymiar urlopu" (0,8311), „urlop" ← „prawo do urlopu" (0,8281).
Razem 18 → 13 zamiast 18 → 16.

> ⚠️ **CZEGO DRUGI SYGNAŁ NIE NAPRAWIA — żeby nikt nie odkrywał tego na Kodeksie.**
> „coroczny urlop" (0,7483) i „przedłużony urlop" (0,7868) **zostają osobno mimo
> wspólnego rdzenia**, bo leżą poniżej `mergeLexicalMin`. Rodzina urlopowa schodzi
> z sześciu węzłów do **trzech, nie do jednego**. To granica tego, co drugi sygnał
> potrafi, a nie usterka do naprawienia obniżaniem progu.

**PARY, KTÓRE MUSZĄ ZOSTAĆ ROZDZIELONE — mają testy regresyjne, nie komentarze.**

| para | podobieństwo | margines do 0,82 | co ją chroni |
|---|---|---|---|
| „umowa o pracę" ↔ „umowa zlecenia" | 0,8072 | **0,0128** | tylko próg — wspólna głowa „umowa" |
| „pracodawca" ↔ „pracownik" | 0,7958 | **0,0242** | tylko próg — dzielą rdzeń „praco" (5 liter) |
| „godzina pracy" ↔ „godziny nadliczbowe" | 0,7575 | 0,0625 | tylko próg — dzielą „godzin" (6 liter) |
| „umowa o pracę" ↔ „umowa najmu" | 0,7416 | 0,0784 | tylko próg — wspólna głowa „umowa" |

Groźne są dwie pierwsze: **ktoś kiedyś obniży `mergeLexicalMin` do 0,79, bo „rodzina urlopowa
się nie skleja", i połączy dwie strony stosunku pracy w jeden węzeł grafu** — a przy 0,80
skleją się dwie różne podstawy zatrudnienia. Testy w `lib/rag/normalize-concepts.test.js`
zapalą się wtedy czerwono. Jest tam też test pokazujący, że przy 0,75 wpadają wszystkie —
jako zapis, gdzie leży granica.

> ⚠️ **WZORZEC: WSPÓLNA GŁOWA RZECZOWNIKOWA, KRÓTKI WYRÓŻNIK.**
>
> Osobna klasa zagrożenia od par typu „pracodawca"/„pracownik". Tam wspólny jest
> **przedrostek jednego wyrazu**; tutaj wspólny jest **cały wyraz niosący większość
> znaczenia** („umowa", „stanowisko", „okres"), a rozróżnia je krótki wyróżnik
> („o pracę" / „najmu"). Wektor uśrednia po wyrazach, więc im dłuższa wspólna głowa
> i krótszy wyróżnik, tym wyżej ląduje para — **niezależnie od tego, czy chodzi
> o tę samą dziedzinę**. To ta sama własność bge-m3, przez którą „wymiar urlopu"
> leży daleko od „urlopu", tylko działająca w drugą stronę.
>
> **Drugi sygnał tu nie pomaga i nigdy nie pomoże:** wspólna głowa jest wspólnym
> rdzeniem z definicji, więc `dzielaRdzen` zwraca dla tej klasy zawsze `true`.
> Broni wyłącznie próg wektorowy.
>
> **PRÓG TEŻ NIE ROZDZIELA TEJ KLASY** — zmierzone, nie przypuszczane:
>
> | para | podobieństwo | ta sama rzecz? |
> |---|---|---|
> | „stanowisko pracy" ↔ „stanowisko służbowe" | **0,8933** | ❌ nie (BHP kontra hierarchia) |
> | „urlop wypoczynkowy" ↔ „urlop" | 0,8911 | ✅ tak |
> | „umowa o pracę" ↔ „umowa zlecenia" | 0,8072 | ❌ nie |
>
> Para **błędna leży wyżej niż poprawna**. Żadne przesunięcie progu ich nie rozdzieli —
> to ograniczenie sygnału wektorowego, nie kwestia strojenia. Ten sam objaw, co przy
> identyfikatorach w Sesji 5 i przy odsiewaniu śmieci w Sesji 7: **gdy klasy nachodzą
> na siebie na osi sygnału, odpowiedzią jest drugi sygnał, nie inna granica.**
> Kandydat na ten drugi sygnał: porównywać **wyróżniki osobno**, nie całe etykiety —
> niezmierzone, do rozważenia razem ze strojeniem `mergeLexicalMin` na Kodeksie.
>
> `stanowisko pracy` **jest** w kolekcji (z `05-instrukcja-bhp.pdf`), `stanowisko
> służbowe` nie — dlatego to scalenie jeszcze nie zaszło. Chroni nas dziś skład
> korpusu, nie reguła. Test `ZNANY DEFEKT` w `normalize-concepts.test.js` asertuje
> zachowanie **błędne**, żeby naprawa zapaliła się czerwono.

> ⚠️ **NORMALIZACJA JEST NIEODWRACALNA — nie ma „cofnij scalenie".**
>
> Punkt 4 algorytmu przepina `rag_chunk_concepts` na kanoniczne (`upsert`
> z `ignoreDuplicates`), a potem **kasuje stare wiersze**. Wyczyszczenie samego
> `merged_into` przywróci węzeł do grafu **bez ani jednego fragmentu** i zostawi
> zawyżony `mention_count` na kanonicznym.
>
> Co gorsza, w ogólnym przypadku **nie da się tego odtworzyć z bazy**: gdy fragment
> był powiązany z OBOMA pojęciami, po `upsert` + `delete` zostaje jeden wiersz
> i informacja, do którego pojęcia należał pierwotnie, przestaje istnieć.
>
> Jedyna pełna droga naprawy: skasować oba pojęcia i **wyciągnąć je od nowa**
> dla dotkniętych dokumentów. Uwaga na pułapkę — `rag_chunks_without_concepts`
> zwraca fragmenty **bez ani jednego** powiązania, więc dopóki fragment wisi przy
> kanonicznym, nie wróci jako kandydat. Kasowanie pojęcia usuwa powiązania kaskadą
> (`on delete cascade`), więc kolejność jest: skasuj pojęcia → wyciągnij od nowa.
>
> **Wniosek na przyszłość:** przed uruchomieniem normalizacji na dużym korpusie
> warto mieć zrzut `rag_chunk_concepts`, bo to jedyny moment, w którym ta informacja
> jeszcze istnieje.

_Nieoczywiste przy okazji:_ „praca"/„pracownik" mają wspólny przedrostek tylko **4** litery
(piąta to „a" kontra „o"), więc przy `stemMin = 5` w ogóle nie kwalifikują się jako wspólny
rdzeń. Dlatego test regresyjny na „pracodawca"/„pracownik" jest nośny, a na „praca"/„pracownik"
nie byłby.

**`mention_count` kanonicznego z `count(*)`, nie z sumy — kontynuacja odejścia z Sesji 7.**
SPEC (punkt 5) mówi „suma wartości wszystkich scalonych". Jeśli jednak fragment był
powiązany z „urlop" **i** z „urlop wypoczynkowy", po przepięciu ma **jedno** powiązanie
(klucz główny `(chunk_id, concept_id)`), a suma powiedziałaby 2. `mention_count` ma znaczyć
„w ilu fragmentach pojęcie wystąpiło" — suma zawyżałaby je dokładnie o współwystąpienia,
czyli **najczęściej tam, gdzie scalanie zadziałało najlepiej**.

_Strojenie `mergeLexicalMin` odłożone:_ 18 pojęć z jednego dokumentu to za mało — wartość
0,82 opiera się na trzech parach. Wymaga materiału z Kodeksu, tak samo jak `RAG_MIN_SCORE`
wymagał go w Sesji 5.

**Sesja 9 — graf.** ✅ ZAMKNIĘTA (27.07.2026) — z jednym punktem DoD odłożonym, patrz niżej.

**Rozstrzygnięcie skali (obowiązkowe):** fizyka force-directed liczy odpychanie
każdy-z-każdym. Prototyp działa przy ~100 węzłach; przy 2000 fragmentów to nie 20×,
lecz **400× więcej pracy** (~4 mln par na klatkę) — przeglądarka stanie.

**Wybrane rozwiązanie: graf pokazuje wyłącznie dokumenty i pojęcia** (dziesiątki węzłów),
a **fragmenty pojawiają się dopiero po kliknięciu pojęcia** — jako promienie wychodzące
z klikniętego węzła. To jest najprostsze i najczytelniejsze: graf wiedzy ma pokazywać,
że dokumenty łączą się przez pojęcia, a nie renderować dwa tysiące kropek.
*(Barnes–Hut albo układ liczony raz i zapisany zostają jako alternatywy, gdyby kiedyś
trzeba było pokazać wszystko naraz.)*

`getGraphData` zwraca **dokumenty, pojęcia i krawędzie dokument↔pojęcie** z wagą
(liczba fragmentów danego dokumentu przypisanych do pojęcia). Kliknięcie pojęcia
wywołuje `searchByConcept` i dorysowuje jego fragmenty jako promienie.

Wizualizacja force-directed — **wygląd** wg `rag-graf-pro.html` (węzły, krawędzie,
poświaty, podświetlenia, ścieżka zapytania), ale **nie jego sekwencja budowy**: tamten
prototyp pokazuje fragmenty jako węzły i buduje graf w trakcie indeksowania, czego
ta sesja nie robi.

**Ruch węzłów jest tu dozwolony** — to działanie algorytmu układania, nie animacja
ozdobna (por. zakres w 12.9). Mapa wszystkich fragmentów pozostaje osobnym widokiem
z Sesji 6, gdzie fizyki nie ma.

_DoD:_ graf z prawdziwych danych, **wyłącznie pojęcia kanoniczne** (`merged_into is null`);
klikam pojęcie i widzę jego fragmenty z różnych dokumentów; **graf zachowuje płynność
przy ~10 dokumentach i ~60 pojęciach oraz po rozwinięciu najliczniejszego pojęcia**;
przy pojęciu z 300+ fragmentami widzę „pokazano 30 z 312", a nie 300 węzłów naraz.

_DoD potwierdzone na żywo:_ graf z 8 dokumentów, 42 pojęć kanonicznych i 42 krawędzi
(kolekcja „Regulaminy"), czytelny i płynny, struktura jednoznaczna. Pojęcia scalone
w Sesji 8 („urlop wypoczynkowy", „godzina pracy") **nie pojawiają się** jako węzły.
Kliknięcie pojęcia dorysowuje jego fragmenty z pełną ścieżką nagłówków.

> ⏸ **JEDEN PUNKT DoD ODŁOŻONY: „fragmenty z RÓŻNYCH dokumentów".**
> Na obecnych danych **żadne pojęcie nie łączy dwóch dokumentów** — graf to pięć
> rozłącznych gwiazd. Nie jest to usterka widoku: pięć plików testowych ma rozłączne
> tematy. Punkt zostaje do sprawdzenia po przepuszczeniu Kodeksu przez pojęcia,
> gdzie mosty („pracownik", „urlop", „pracodawca" wspólne z `01-regulamin-pracy.md`)
> będą prawdziwe. Legenda widoku mówi to wprost — „brak pojęć wspólnych" zamiast
> udawania, że tak ma być.

**Skalowanie: promień pierwiastkiem, grubość krawędzi LINIOWO.** Rozróżnienie wynika
z wymiaru wielkości i było zmierzone, nie wybrane z gustu. Promień węzła koduje
wartość przez **pole**, rosnące z kwadratem — stąd pierwiastek, dzięki któremu CSV
o jednym fragmencie ma 7,7 px obok Kodeksu na 22 px. Grubość linii jest wielkością
**jednowymiarową**, więc liniowa jest wierna: przy realnych wagach 1–3 pierwiastek
dawał rozpiętość 1,78 px na całym zakresie danych (różnicy nie było widać), liniowo
wychodzi 2,80 px. Obie skale **normalizowane do maksimum w grafie**, nie do wartości
bezwzględnej — to samo załatwia obawę o „linię przez pół ekranu" po Kodeksie.

**Pojęcia wspólne kolorem, nie rozmiarem.** Rozmiar koduje już `mentionCount`;
doładowanie go stopniem węzła zlałoby dwie zmienne w jedną nieczytelną i nie dałoby
się odróżnić „częste w jednym pliku" od „rzadkie, ale wspólne" — a to drugie jest
sensem widoku. Pojęcie z jednego dokumentu dziedziczy jego kolor (widać pochodzenie),
most dostaje złoto z poświatą i **podpis widoczny zawsze**.

**Dokumenty bez pojęć zostają w grafie, przygaszone.** Kodeks i RODO to 1014 fragmentów
kolekcji — ukrycie ich w widoku nazwanym „graf kolekcji" byłoby kłamstwem tej klasy,
którą wyklucza 12.9. Widać je jako szare kwadraty z prawdziwym `chunkCount` i podpisem
„0 pojęć", czyli także jako informację o tym, gdzie robota nie jest zrobiona.

**Fizyka wygasza się po zbiegnięciu** (30 spokojnych klatek), dogrzewa po przeciągnięciu
węzła, zmianie danych i rozwinięciu pojęcia. To konsekwencja tej samej zasady, z której
wynika zakaz z 12.9, tylko z drugiej strony: skoro ruch ma **znaczyć**, że układ jest
liczony, to po zbiegnięciu musi ustać. Rozstawienie startowe jest deterministyczne
(okrąg, nie `Math.random()` — por. zarzut wobec `buildBasis()` prototypu mapy).

> ⚠️ **MOSTÓW NIE DA SIĘ WYPRODUKOWAĆ STROJENIEM PROGU — argument rozstrzygający.**
>
> Zmierzone na 652 parach pojęć **z różnych dokumentów** (`scripts/diag-mosty.mjs`):
> najwyższa para międzydokumentowa to **0,7647** („pracownik" ↔ „stanowisko pracy"),
> a par ≥ 0,80 jest **zero**.
>
> Tymczasem **„pracodawca" ↔ „pracownik" = 0,7958 leży POWYŻEJ każdej z nich.**
> Próg dość niski, żeby zbudować choćby jeden most, **najpierw skleiłby dwie strony
> stosunku pracy** — czyli dokładnie tę parę, która ma test regresyjny. Po drodze
> wpadłby też fałszywy przyjaciel „okres zatrudnienia" ↔ „okres wypowiedzenia"
> (0,7457, dwie różne dziedziny prawa).
>
> **To samo rozstrzygnięcie, co przy identyfikatorach (Sesja 5) i przy scalaniu pojęć
> (Sesja 8): gdy klasy nachodzą na siebie na osi sygnału, odpowiedzią jest drugi
> sygnał albo więcej danych — nigdy inna granica.** Czwarte wystąpienie tego wzorca.
>
> Sprawdzone też piętro niżej, w surowym tekście (`scripts/diag-slowa.mjs`): słowo
> „pracownik" występuje w **trzech** dokumentach, ale w 02 i 05 wyłącznie jako
> **adresat obowiązku** („Polityka obowiązuje wszystkich pracowników"), nie jako temat.
> Oznaczenie go tam twierdziłoby, że polityka bezpieczeństwa jest o pracownikach —
> **model miał rację, że tego nie zrobił.** Brak mostów wynika z danych, nie z rozjazdu
> słownictwa i nie z progu.

> ✅ **ODŁOŻONY PUNKT DoD DOMKNIĘTY (28.07.2026), po przepuszczeniu Kodeksu.**
> Mostów jest **15**, wszystkie sięgają dwóch dokumentów: „pracodawca" (28 wystąpień),
> „urlop" (10), „pracownik" (9), „czas pracy" (8), „godziny nadliczbowe" i „wniosek
> pracownika" (7), „wymiar urlopu" (6), „okres wypowiedzenia" i „okres zatrudnienia"
> (5), „zasady bezpieczeństwa", „stanowiska pracy", „regulamin" (3), „działalność
> gospodarcza", „praca nadliczbowa", „akcja ratownicza" (2). Powstały dokładnie tak,
> jak zapowiadał argument powyżej: **z danych, nie ze strojenia progu.**

### Sesja 9b — próg skali PRZYSZEDŁ OD STRONY POJĘĆ, NIE FRAGMENTÓW (28.07.2026)

**Rozstrzygnięcie skali z Sesji 9 chroniło przed złym zagrożeniem.** Zabezpieczało
przed 2000 fragmentów jako węzłami, a DoD wymagał płynności „przy ~10 dokumentach
i ~60 pojęciach". Kodeks dał **565 pojęć kanonicznych z jednego dokumentu** — 573 węzły,
czyli dziesięciokrotność liczby, pod którą pisano DoD. Zagrożenie weszło tą stroną,
której nikt nie pilnował, bo policzono koszt fragmentów, a nie pojęć.

**Ale przyczyną braku zbieżności NIE była liczba par.** Zmierzone
(`scripts/sym-skala-grafu.mjs`, `scripts/sym-fizyka-grafu.mjs`): 573 węzły to 163 878
par na klatkę i **2,36 ms** — siedmiokrotny zapas w budżecie 16,7 ms. Barnes–Hut
przyspieszyłby to, co i tak się mieści, i dlatego go tu nie ma. Prawdziwe przyczyny
były cztery, wszystkie w fizyce:

1. `rozstawNaOkregu` wołane ze **stałą 24** — 573 węzły lądowały na 24 punktach.
2. Brak dolnej granicy odległości w odpychaniu: `d²` przycinane do 1 px² dawało siłę
   1600 px/klatkę, a tłumienie 0,86 nasyca prędkość na 7,1× siły (~11 400 px/klatkę).
   Szczyt energii **1,9 × 10⁸**. To była największa dźwignia.
3. Przy `dx = dy = 0` kierunek siły wychodził `0/0`, więc węzły w jednym punkcie
   **nie odpychały się wcale** i zostawały w sobie na zawsze.
4. Przycięcie do płótna zatrzymywało pozycję, ale **nie prędkość**.

**Warunek zbieżności mierzył nie to, co widać** (piąta zmiana, osobno, bo to zmiana
definicji sukcesu): `krok` doliczał kwadrat prędkości **przed** przycięciem pozycji,
więc węzeł wciśnięty w ścianę wnosił ruch, którego nie wykonywał — przy 573 węzłach
wynik 2,63 przy faktycznym przesunięciu 0,078 px/klatkę. Teraz `krok` zwraca
`{ ruch, maks }` liczone z **faktycznego przesunięcia po przycięciu**. Zmianę pilnuje
**przypadek kontrolny**: układ odtworzony ze starą siłą musi dalej wychodzić na
niewyciszony — inaczej nie dałoby się odróżnić „naprawiliśmy układanie" od „kryterium
przestało narzekać".

**Dwa progi, nie jeden.** `PROG_MAKS` istnieje, bo przy 573 węzłach średnia daje się
rozcieńczyć: żeby zmieścić się pod 0,02 przy n = 573, suma kwadratów przesunięć musi
zejść poniżej 11,46, a **jeden** węzeł drgający 3,3 px/klatkę (200 px/s) daje 10,89.
Pięciuset spokojnych węzłów wystarczyłoby, żeby ukryć jednego wariata.

**„Wyciszenie" nie jest równowagą i widok tego nie udaje.** Zmierzone: gdyby po
wygaszeniu pozwolić fizyce chodzić dalej 2000 klatek, węzły przesunęłyby się jeszcze
do 319 px (573 węzły) i 109 px (165). Największa gwiazda ma **538 liści** na okręgu
sprężyny, na którym mieści się ich kilkadziesiąt (1,3 px na pojęcie) — pełnej równowagi
tam nie ma, jest wolne pełzanie. Dlatego legenda mówi **„układanie zatrzymane"**,
a nie „układ zbiegł".

**Filtr progu: w rdzeniu, z mostami omijającymi próg.** `getGraphData` przyjmuje
`minMentions` i `tylkoMosty`; gdyby filtr siedział w rysowaniu, przeglądarka i tak
ściągałaby 565 pojęć i liczyła dla nich fizykę. **Most (≥2 dokumenty) zostaje
niezależnie od `mention_count`** — bez tej reguły próg 3 ucinał trzy mosty, a próg 5
sześć z piętnastu, czyli filtr ucinałby dokładnie to, po co ten widok istnieje.

| próg | pojęć | mostów | węzłów | odstęp | wyciszenie |
|---|---|---|---|---|---|
| ≥ 1 | 565 | 15 | 573 | 29 px | 1432 klatki (24 s) — **węzły się zlewają** |
| ≥ 2 | 157 | 15 | 165 | 54 px | 236 klatek (3,9 s) |
| ≥ 3 | 86 | 15 | 94 | 72 px | 168 klatek (2,8 s) |
| ≥ 5 | 40 | 15 | 48 | 100 px | 577 klatek (9,6 s) |
| tylko mosty | 15 | 15 | 23 | 145 px | 407 klatek (6,8 s) |

> ⚠️ **PO CO ISTNIEJE TEN FILTR — CZYTELNOŚĆ, NIE ZBIEŻNOŚĆ.** Zapisane wprost, bo
> pierwotna motywacja jest już NIEPRAWDZIWA i wprowadziłaby w błąd. Filtr powstał
> przeciw drganiu obrazu, ale drganie miało inną przyczynę (cztery usterki fizyki
> wyżej) i zostało naprawione u źródła — **po naprawach zbiega nawet pełne 573 węzły
> w 1432 klatkach**. Kto zmierzy dziś próg 1, zobaczy, że zbiega, i jeśli zostanie
> tu stara motywacja, usunie filtr — kasując ochronę przed **nieczytelnym** widokiem
> w przekonaniu, że kasuje obejście problemu z wydajnością.
>
> Filtr zostaje, bo przy 29 px na węzeł **węzły się zlewają** (sam romb pojęcia ma do
> 28 px średnicy), a nie bo przeglądarka nie wyrabia. Uściślenie tej liczby niżej,
> w sekcji 9d — nie dotyczy ona podpisów pojęć, bo tych się nie rysuje.

**Domyślna dwójka wynika z CZYTELNOŚCI, nie z kosztu fizyki** — po naprawach zbiega
nawet 573 węzły. Przy 29 px na węzeł **romby pojęć zlewają się ze sobą**, bo sam węzeł
ma do 28 px średnicy (uściślenie w sekcji 9d: ta liczba opisuje WĘZŁY, nie podpisy). „Tylko mosty" **nie** jest stanem domyślnym: kolekcja bez mostów
otwierałaby się jako sam zbiór dokumentów bez ani jednego pojęcia — a taki stan miały
Regulaminy przed Kodeksem. Domyślny widok, który dla całej klasy kolekcji nie pokazuje
nic, wygląda na usterkę.

**`totals: { concepts, shown, bridges }` istnieje dla 12.9, nie pod rysunek** — bez
liczby przed filtrem widok nie ma z czego napisać „pokazano 157 z 565 pojęć". To jedyne
nowe pole w kontrakcie z sekcji 9.

**Stabilne sortowanie to wymóg 12.9, nie kosmetyka.** Kolejność wierszy decyduje
o kolorze dokumentu i o pozycji startowej węzła w spirali, więc jej rozjazd znaczyłby
inny układ grafu przy tych samych danych. PostgREST nie obiecuje stabilności przy
remisie, a po Kodeksie **setki pojęć mają `mention_count = 1`**, czyli remis jest regułą.
Klucze rozstrzygające: `rag_concepts` → `id`, `rag_documents` → `id`, `rag_chunk_concepts`
→ `concept_id`. Rozstawienie startowe przeszło z okręgu na **spiralę Fermata** (kąt
złoty), nadal deterministyczną — `rozstawNaOkregu` zostaje w `lib` wyłącznie jako punkt
odniesienia przypadku kontrolnego.

### Sesja 9c — powtarzalność układu i przypięte dokumenty (28.07.2026)

> ⚠️ **TABELA WYŻEJ BYŁA LICZONA NA ZŁEJ SZEROKOŚCI.** Płótno w symulacji miało 900 px,
> a w przeglądarce ma **864 px** (`canvas.clientWidth` przy oknie 1536 px, po przeniesieniu
> legendy do własnej kolumny). Szerokość wchodzi i w siłę do środka, i w położenie ścian,
> więc pomiar na 900 px opisywał inny układ niż widziany. Tabela niżej jest na 864 px
> i **ona obowiązuje**; poprzednia zostaje w historii jako pomiar przy 900 px.

**UKŁAD NIE BYŁ POWTARZALNY — dwa wejścia dawały dwa różne obrazy.** Zgłoszone jako
blokujące. Hipoteza „krok fizyki na zmiennym `dt` z `requestAnimationFrame`" **odpada
przez przeczytanie kodu**: `krok` nie ma ani jednego odwołania do czasu — prędkości
i tłumienie są na klatkę, więc krok jest ze stałym `dt` z definicji. Przyczyny były dwie,
obie zmierzone (`scripts/diag-powtarzalnosc.mjs`):

1. **`szer` czytane w KAŻDEJ klatce.** Przed ułożeniem strony `clientWidth` to 0, więc
   wchodziła wartość zapasowa; ile klatek poleciało na złej szerokości, zależało od
   szybkości maszyny. Sześć różnych układów, węzeł odjeżdżał do **65 px**. Naprawa:
   szerokość mierzona **raz na przebudowę** (`ResizeObserver`, zaokrąglona do piksela)
   i zapamiętana razem z układem; pętla liczy fizykę na tej samej szerokości, na której
   rozstawiła węzły.
2. **Przełączenie progu albo trybu dziedziczyło pozycje z niedokończonego układu.**
   23 węzły brały pozycje z układu 165 węzłów zatrzymanego tam, gdzie akurat był, gdy
   człowiek kliknął. Sześć układów, odejście do **471 px**. To była przyczyna dominująca.

**REGUŁA DZIEDZICZENIA: tylko w obrębie TYCH SAMYCH DANYCH.** Pierwsza wersja tej reguły
brzmiała „dziedzicz tylko z układu wyciszonego" i **test ją odrzucił**: przy 165 węzłach
układ wycisza się w ~200 klatkach, więc klik po 30 klatkach (0,5 s) trafiał w gałąź „od
spirali", a po 200 (3,3 s) w gałąź „dziedzicz" — znowu dwa układy z tych samych danych.
Granica wyciszenia sama leży w czasie, więc nie może być rozróżnieniem. Właściwym
rozróżnieniem jest **źródło węzłów**, i to potwierdza pomiar: przebudowa przy tych samych
danych zbiega do TEGO SAMEGO układu niezależnie od chwili, a przebudowa na inny zbiór
węzłów rozjeżdża się. Zmiana progu i trybu startuje więc od spirali; rozwinięcie pojęcia
dziedziczy.

> **Konsekwencja, która ma być świadoma, nie niespodzianką:** po przeciągnięciu węzła
> układ się dogrzewa, więc ruszenie suwaka w tym oknie wystartuje od spirali — czyli
> skok, nie płynne przejście. **Tak ma być**: powtarzalność jest tu ważniejsza od ciągłości.

> ⚠️ **CZEGO NIE WOLNO OBIECAĆ.** „Ten sam układ z tych samych danych" jest prawdą
> **na tej samej maszynie i w tej samej przeglądarce**. Przy 165 węzłach zaburzenie
> **0,01 px rozjeżdża układ końcowy o 9,3 px** — tysiąckrotne wzmocnienie — więc różnice
> w zaokrąglaniu zmiennoprzecinkowym czy w szerokości płótna dają inny obraz na innym
> sprzęcie. Obietnica szersza niż stan faktyczny byłaby tym samym błędem co napis „brak
> pojęć przy tym progu" dla dokumentu, który pojęć nie ma policzonych.
> **Dlatego test powtarzalności porównuje DWA PRZEBIEGI W TYM SAMYM PROCESIE, nigdy
> zaszytych współrzędnych** — test na stałych liczbach padłby na cudzym sprzęcie
> i zostałby usunięty jako uciążliwy, czyli zniknęłoby dokładnie to, co miał chronić.

**DOKUMENTY NIE PODLEGAJĄ FIZYCE — pierścień w kolejności `created_at`.** Trzy powody,
każdy zmierzony:

- **podpisy:** para „01-regulamin-pracy.md" ↔ „D20250277Lj.pdf" kończyła **52–55 px**
  od siebie w KAŻDYM przebiegu (podpisy potrzebują ~90 px). Na pierścieniu: **114 px**,
  stale, na każdym progu;
- **zbieżność:** w trybach rzadkich wygaszanie trzymał **węzeł dokumentu** (przy ≥5
  „06-skan-zaswiadczenie.pdf", przy mostach „05-instrukcja-bhp.pdf"), a osiem dokumentów
  odpowiadało za **27 % i 43 %** całego ruchu, będąc 8 z 48 i 8 z 23 węzłów. Stąd brała
  się niemonotoniczność: 94 węzły 168 klatek, ale 48 węzłów 577;
- **powtarzalność:** pozycja dokumentu jest teraz funkcją danych z definicji.

Realizacja przez **istniejący mechanizm `trzymany`** — węzeł stoi, ale nadal odpycha
pojęcia. Żadna siła się nie zmienia. Pod 12.9 jest to **uczciwsze, nie mniej**: pozycja,
która rozjeżdżała się o 471 px między przebiegami, wyglądała na znaczącą, a nie niosła
żadnej informacji. Pierścień mówi wprost, że położenie dokumentu to rama, nie pomiar;
znaczenie niosą pojęcia wokół i złote mosty pomiędzy.

**TABELA ODBIORU — płótno 864×620, dokumenty przypięte** (`scripts/sym-pierscien.mjs`):

| próg | węzłów | klatek do wyciszenia | ostatni ruchliwy | odstęp dokumentów | mediana odstępu pojęć | zlanych par węzłów |
|---|---|---|---|---|---|---|
| ≥ 1 | 573 | 1143 (19,1 s) | pojęcie | 114 px | 29 px | **195** |
| ≥ 2 | 165 | 322 (5,4 s) | pojęcie | 114 px | 44 px | 0 |
| ≥ 3 | 94 | 463 (7,7 s) | pojęcie | 114 px | 54 px | 0 |
| ≥ 5 | 48 | 305 (5,1 s) | pojęcie | 114 px | 63 px | 0 |
| mosty | 23 | 299 (5,0 s) | pojęcie | 114 px | 60 px | 0 |

**Anomalia zniknęła.** Dowodem jest **skrócenie 678 → 305 i 617 → 299 klatek** przy ≥5
i mostach. Kolumna „ostatni ruchliwy: pojęcie" **nie jest już dowodem** — przypięty
dokument nie może nią być z definicji; zostaje jako kontrola, że nic innego nie zaczęło
trzymać wygaszania.

**Przypięcie NIE pogarsza tłoku** (pytanie zadane wprost): przy progu 1 nakładających
się par jest 195 wobec 190 bez przypięcia, mediana odstępu 29 px w obu wariantach.
Promień pierścienia (0,24 krótszego wymiaru) **dobrany pomiarem** — tabela wymiany
odstępu podpisów na tłok pojęć siedzi w komentarzu przy `PIERSCIEN_UDZIAL`.
**195 zlanych par węzłów przy progu 1 to potwierdzenie, po co jest filtr**: ten tryb
jest nieczytelny z powodu gęstości i żadna zmiana układania tego nie naprawi.

### Sesja 9d — co jest naprawdę rysowane, i wyścig odpowiedzi (28.07.2026)

> ⚠️ **UŚCIŚLENIE MIARY CZYTELNOŚCI — poprzednie sformułowanie było nieprecyzyjne.**
> Kolumna liczyła odległości między **WĘZŁAMI** pojęć (romby zlewają się przy odstępie
> mniejszym niż 28 px średnicy) i jako taka jest prawidłowa. Opisywana była jednak jako
> „nakładanie podpisów", a **podpisów pojęć się nie rysuje**: reguła z Sesji 9 mówi
> `w.most || pod kursorem || rozwinięte`, więc przy progu 2 na płótnie jest **23 podpisy**
> (15 mostów + 8 dokumentów), a 142 pojęcia są bezimiennymi rombami. Uzasadnienie filtra
> „dla czytelności" nie może stać na liczbie opisującej etykiety, których nie ma na ekranie.

**Czytelność mierzona na tym, co RYSOWANE** (`scripts/sym-pierscien.mjs`; szerokość tekstu
przybliżona 0,55 × rozmiar czcionki na znak — do porównań, nie do wyroków):

| próg | rysowanych podpisów | podpis↔podpis | podpis↔węzeł pojęcia | zlanych par węzłów |
|---|---|---|---|---|
| ≥ 1 | 23 | 12 | **79** | 195 |
| ≥ 2 | 23 | 3 | **27** | 0 |
| ≥ 3 | 23 | 5 | 14 | 0 |
| ≥ 5 | 23 | 3 | 9 | 0 |
| mosty | 23 | 2 | 2 | 0 |

Filtr stoi więc na **dwóch** miarach, obie liczone na rysowanym obrazie: romby przestają
się zlewać (195 → 0) i podpisy przestają wpadać pod chmurę węzłów (79 → 27). Obie spadają
skokowo między progiem 1 a 2, więc domyślna dwójka ma podstawę w obu.

> ⚠️ **DOMYŚLNA DWÓJKA JEST ZMIERZONA NA KORPUSIE 565 POJĘĆ i po dołożeniu RODO
> nie obowiązuje.** Tabela wyżej opisuje stan historyczny — pomiar na korpusie
> znormalizowanym (993 pojęcia) jest niżej.

#### Powtórka na korpusie po RODO i po normalizacji — 993 pojęcia, 51 mostów

**Zmierzone 29.07.2026**, `scripts/sym-czytelnosc-po-rodo.mjs`, płótno 864×620:

| próg | pojęć | zlane pary | mediana | podpis↔węzeł | podpis↔podpis |
|---|---|---|---|---|---|
| ≥ 1 | 993 | 962 | 23 px | 225 | 49 |
| ≥ 2 | 276 | 44 | 37 px | 61 | 24 |
| ≥ 3 | 164 | **3** | 44 px | 24 | 24 |
| ≥ 4 | 121 | **0** | 47 px | 26 | 19 |
| ≥ 5 | 93 | 0 | 50 px | 9 | 24 |
| ≥ 6 | 86 | 0 | 51 px | 19 | 17 |

**Z trzech miar rozdziela klasy już tylko jedna.** „Zlane pary węzłów" spada
962 → 44 → 3 → **0** i nasyca się na **czwórce**. Pozostałe dwie są na tym korpusie
**niemonotoniczne** i nie nadają się do wyboru progu:
- podpis↔podpis: 24 → 24 → 19 → **24** → 17,
- podpis↔węzeł: 61 → 24 → **26** → 9 → **19**.

Przed normalizacją podpis↔węzeł jeszcze opadał gładko (37 → 31 → 25 → 13 → 4); po
scaleniu przestał. **Wybór domyślnej na podstawie którejkolwiek z tych dwóch byłby
wyborem szumu.**

_Odrzucone przewidywanie, zapisane, żeby nie wrócić do niego drugi raz:_ przed
normalizacją przewidywano, że scalanie **wzmocni argument za trójką**, bo usuwa pojęcia.
Kierunek był dobry, wniosek zły. Scalanie przenosi wystąpienia na ocalałe pojęcia, więc
próg ≥ 2 przepuszcza ich **więcej** (265 → 276), a punkt nasycenia przesunął się
**z 3 na 4**. Trójka zostawia 3 zlane pary. **Przewidywanie nie zastąpiło pomiaru i nie
było blisko.**

**OBOWIĄZUJE `PROG_DOMYSLNY = 4`** (`app/_components/GrafWiedzy.jsx`).

_Dlaczego 4, a nie 3, skoro na trójce zostają zaledwie 3 zlane pary:_ **kryterium
ustalono PRZED poznaniem wyniku** — próg to punkt, w którym jedyna rozdzielająca miara
się nasyca. Przy 565 pojęciach wypadało 3, teraz wypada 4. Zostanie przy 3 „bo to tylko
trzy pary" byłoby **zmianą kryterium w chwili, gdy zero przesunęło się o jedno oczko**,
czyli dopasowaniem reguły do wyniku.

_Koszt, żeby nie wyglądał na darmowy:_ **121 pojęć zamiast 164 — o 43 mniej w widoku**,
a te 3 zlane pary na trójce to 1,8% jej węzłów. Płacimy realną cenę za trzymanie się
kryterium. Łagodzą ją dwie rzeczy: suwak jest o jedno kliknięcie, a **mosty omijają
próg — wszystkie 51 widać na każdej wartości.**

> **DLA NASTĘPNEJ OSOBY PRZEMIERZAJĄCEJ PRÓG.** Z trzech miar rozdziela już tylko
> „zlane pary węzłów". Podpis↔podpis nie rozdzielał nigdy na tym korpusie, a
> **podpis↔węzeł przestał być monotoniczny dopiero po normalizacji** (61 → 24 → **26**
> → 9 → **19**; wcześniej opadał gładko 37 → 31 → 25 → 13 → 4). Jeśli rozmyje się także
> „zlane pary" — **nie ma na czym oprzeć wyboru, i wtedy trzeba to POWIEDZIEĆ, a nie
> wybrać najładniejszą liczbę.** To ten sam nakaz co przy progu wyszukiwania w 11.1a.

#### Podłoga kolizji podpisów — nieusuwalna żadnym progiem

**Zmierzone 29.07.2026, korpus 1066 pojęć / 43 mosty, płótno 864×620.**

Mosty **omijają próg** (`c.mentionCount >= minMentions || jestMostem(c.id)` w `graph.js`),
a podpis mostu rysuje się zawsze. Rysowanych podpisów jest więc **51 na każdym progu**
(43 mosty + 8 dokumentów) i liczba ta nie zależy od `minMentions`. W trybie „tylko mosty",
czyli w teoretycznym minimum, zostaje:

| | przy 43 mostach | **po normalizacji, 51 mostów** |
|---|---|---|
| rysowanych podpisów | 51 | **59** |
| kolizji podpis↔podpis | 13 (dok↔most 7, most↔most 6) | **16** (dok↔most 7, most↔most 9) |
| kolizji podpis↔węzeł pojęcia | 5 | **10** |

Podłoga **rośnie razem z liczbą mostów**, bo każdy most to jeden podpis więcej rysowany
bezwarunkowo. To nie jest regresja układu — to konsekwencja reguły „most omija próg".

**Żaden próg danych nie zejdzie poniżej tych liczb.** Przykłady zwrócone przez pomiar to
dokładnie te, które widać na żywo: `06-skan-zaswiadczenie` ↔ „środki bezpieczeństwa",
`01-regulamin-pracy.md` ↔ „wymiar urlopu", `D20250277Lj.pdf` ↔ „rozporządzenie".

> **Podniesienie `minMentions` NIE jest lekarstwem na nakładające się podpisy.**
> To osobny problem — **rozmieszczenie** podpisów, nie filtr danych. Gdyby czytać
> podniesienie progu jako naprawę tego, kolejny pomiar pokazałby „bez poprawy" i szukano
> by usterki tam, gdzie jej nie ma.

_Czego przy okazji NIE ma:_ **ściany nie przycinają niczego.** Najmniejszy prześwit między
brzegiem węzła a krawędzią płótna to **19,8 px** przy progu 2 i 19,0 px przy progu 3; zero
węzłów bliżej niż 8 px, zero podpisów poza płótnem, na każdym progu od 1 do 6. To, co
wygląda jak dotykanie ramy, jest zatrzymaniem ~20 px przed nią.

_Miara podpis↔podpis nie nadaje się do wyboru progu._ Na korpusie 1066 daje ciąg
18 → 13 → 11 → **14** → 10 dla progów 2→6: **niemonotoniczny**, w granicach błędu
przybliżenia szerokości tekstu (0,55 znaku). Wybór domyślnej na jej podstawie byłby
wyborem szumu. Rozdziela wyłącznie „zlane pary węzłów".

**PODPISY RYSOWANE NA KOŃCU, Z OBWÓDKĄ.** Wcześniej każdy podpis lądował na płótnie razem
ze swoim węzłem, więc kolejne romby i szprychy rysowały się NA NIM. Teraz podpisy idą
osobną warstwą po wszystkich węzłach, dokumenty na wierzchu pojęć, z obrysem w kolorze tła.
Obrys, nie prostokątne tło: tło zasłoniłoby węzły i krawędzie, czyli dane — ta sama zasada
co „przygasić, nie ukryć" przy dokumentach bez pojęć.

**Kolizji geometrycznych to nie zmienia** (węzeł nadal jest pod napisem) — zmienia
KOLEJNOŚĆ i KONTRAST, a tego nie da się zmierzyć bez canvasu, więc weryfikacja jest wzrokowa.

**Przygaszony dokument dostaje podpis PEŁNĄ KRYCIA.** To była właściwa przyczyna
nieczytelności „CELEX_32016R0679_PL_TXT" i „06-skan-zaswiadczenie.pdf": węzeł bez pojęć
rysuje się z kryciem 0,42 i ta sama wartość szła na jego nazwę, a szara nazwa nad jasną
chmurą rombów jest nieczytelna niezależnie od warstwy. Przygaszenie ma mówić „ten dokument
nie ma pojęć" — i mówi to kolorem węzła oraz legendą. **Przygaszona nazwa pliku nie jest
łagodniejszym sygnałem, tylko sygnałem straconym.**

> **WARIANT ODRZUCONY, z liczbami:** podpis dokumentu przesunięty promieniście na zewnątrz
> pierścienia („gwiazdy rosną do środka, więc na zewnątrz jest pusto"). Wyglądał na oczywistą
> poprawę, a wyszedł **neutralny albo gorszy: 79 → 83 kolizji przy progu 1, 27 → 29 przy
> progu 2**, bo pojęcia rozkładają się także na zewnątrz pierścienia. Zostaje za flagą
> w skrypcie pomiarowym, żeby nikt nie próbował go po raz drugi bez pomiaru.

**WYŚCIG ODPOWIEDZI — naprawiony deterministycznie, nie probabilistycznie.** Przy szybkim
przełączeniu trybu widok osiadał na trwałe w stanie „interfejs mówi «tylko mosty», dane są
z progu 2, licznik «pokazano 157 z 565»", i — co najgorsze — pod spodem stało **„układanie
zatrzymane"**, czyli widok OGŁASZAŁ GOTOWOŚĆ, pokazując dane innego trybu niż deklarowany.
Licznik jest w tym widoku nośnikiem prawdy (12.9), więc jeśli kłamie raz na dwadzieścia
wejść, nie można się na nim opierać wcale — „nie udało się powtórzyć" nie jest domknięciem.

Każdy odczyt dostaje **numer i klucz** (`lib/mapview/zadania.js`). Odpowiedź jest odrzucana,
gdy numer nie jest ostatnim wysłanym **albo** klucz nie opisuje aktualnego progu i trybu.
Numer pilnuje KOLEJNOŚCI, klucz pilnuje TOŻSAMOŚCI — usterka polegała na rozjeździe
tożsamości, więc jest sprawdzana wprost, a nie wnioskowana. `AbortController` przerywa
poprzedni odczyt, ale **nie jest zabezpieczeniem** (może nie zdążyć); warunkiem jest
sprawdzenie znacznika. Napis „wczytywanie…" gasi tylko odpowiedź na aktualne pytanie,
inaczej spóźniona ogłaszałaby gotowość widoku, który nadal czeka.

> ✅ **OPÓŹNIENIE LICZNIKA PRZY SZYBKIM PRZEŁĄCZANIU JEST DOPUSZCZALNE — dopóki widok
> mówi „wczytywanie danych…".** Przy kilkunastu kliknięciach pod rząd licznik nie nadąża
> i pokazuje stare liczby; to jest **prawidłowe**, bo jednocześnie widać, że praca trwa,
> a po zaprzestaniu klikania liczba sama dochodzi do właściwej. **Nie jest to usterka
> i nie wolno tego „naprawiać" blokowaniem przycisków na czas odczytu** — zablokowany
> przycisk odbiera sterowanie, a stary licznik z uczciwym napisem obok nie kłamie.
> Kłamstwem był wyłącznie stan „układanie zatrzymane" przy danych innego trybu.

**Poprawki do faktów zapisanych wyżej.** Rozbicie mostów: **11** × `01-regulamin-pracy.md`,
2 × `04-umowa-najmu.docx`, 2 × `05-instrukcja-bhp.pdf` = 15 (wcześniej podano błędnie 6+2+2,
co nie sumowało się do 15). Każdy most łączy dokładnie dwa dokumenty. RODO
(`CELEX_32016R0679_PL_TXT.pdf`) ma **504** fragmenty — `chunk_count` i faktyczna liczba
wierszy w `rag_chunks` zgadzają się, więc podawane gdzie indziej 503 nie odpowiada bazie.

### Co ta sesja mówi o METODZIE (notatka przekazania, 28.07.2026)

**Cztery razy pomiar obalił rozumowanie — i za każdym razem było to tanie, bo mierzyliśmy
PRZED zmianą, nie po niej.** Dwa razy pomylił się prowadzący, dwa razy wykonawca:

| teza | kto | co pokazał pomiar |
|---|---|---|
| „graf nie zbiega, bo za dużo par — trzeba Barnes–Hut" | wykonawca | 2,36 ms/klatkę przy 573 węzłach, siedmiokrotny zapas. Przyczyną był wybuch numeryczny na starcie |
| „układ nie jest powtarzalny, bo krok liczy na zmiennym `dt`" | prowadzący | `krok` nie ma ANI JEDNEGO odwołania do czasu — odrzucone przez przeczytanie, bez pomiaru |
| „dziedzicz pozycje tylko z układu wyciszonego" | prowadzący | granica wyciszenia sama leży w czasie: klik po 0,5 s i po 3,3 s dawał różne układy |
| „podpis dokumentu promieniście na zewnątrz pierścienia" | wykonawca | neutralnie albo gorzej: 79 → 83 kolizji, bo pojęcia są też na zewnątrz |

**Wniosek do stosowania dalej:** hipoteza jest tania, dopóki nie zostanie wdrożona.
Kolejność „pomiar → decyzja → zmiana" (widoczna w historii commitów tej sesji) wychodzi
taniej niż „zmiana → obrona zmiany", bo pozwala się mylić bez kosztu.

#### Dopisek 29.07.2026 — dry run normalizacji: trafione i nietrafione w jednej tabeli

Przed nieodwracalnym scalaniem pojęć puszczono **dry run importujący prawdziwe `grupuj`
z `lib/`** (nie kopię — patrz niżej). Przewidywania wobec tego, co zaszło naprawdę.
**Tabela zawiera oba rodzaje wyniku celowo: sama lista trafień byłaby świadectwem,
a nie zapisem.**

| przewidziane | zmierzone po scaleniu | |
|---|---|---|
| 993 pojęcia kanoniczne | **993** | ✓ |
| 51 mostów | **51** | ✓ |
| +8 nowych mostów, 0 traconych | **+8 / 0** | ✓ |
| 0 par kanonicznych nad progiem 0,88 | **0** (było 100) | ✓ |
| „normalizacja wzmocni argument za progiem grafu **3**" | punkt nasycenia przesunął się **na 4** | ✗ |

Cztery przewidywania co do jednego pojęcia, jedno chybione — i **chybione było
dokładnie to, które nie miało za sobą pomiaru, tylko rozumowanie.** Kierunek był dobry
(scalanie przenosi wystąpienia na ocalałe pojęcia, więc przez próg ≥ 2 przechodzi ich
*więcej*: 265 → 276), wniosek zły. **Przewidywanie nie zastąpiło pomiaru i nie było
blisko.**

**Dwie pułapki metody, obie wyłapane w tej rundzie:**

1. **Kopia algorytmu nie jest symulacją algorytmu.** Pierwszy szacunek skutków
   normalizacji (57 grup, 81 pojęć, groźny łańcuch „środki ochrony zdrowia" → „środki
   bezpieczeństwa" → „środki ochrony indywidualnej") był **artefaktem domknięcia
   przechodniego policzonego własnym union-findem**. Prawdziwe `grupuj` porównuje
   kandydatów **do ziarna**, nie między sobą, i takiego łańcucha wytworzyć nie może —
   mówi o tym komentarz w `normalize-concepts.js` wprost. Grupa to **gwiazda**, nie
   łańcuch. To ta sama klasa co cicha zerowa metryka: **miara opisująca co innego niż
   kod.** Stąd `scripts/sym-normalizacja-nasucho.mjs` importuje `grupuj` z `lib/`.
   (Istniejący `sym-normalizacja.mjs` nie nadawał się z dwóch niezależnych powodów:
   czyta pojęcia bez stronicowania — przy 1130 PostgREST ucina go na 1000 — i ma własną
   kopię `grupuj` bez pierwszeństwa ziaren.)

2. **Sufit szumu policzony na zbyt łatwych pytaniach** — patrz 11.1a. Wynik wychodził
   na korzyść i nikt by go nie podważył.

**Automatyczne scalanie po wyciągnięciu pojęć — ŚWIADOMIE ODŁOŻONE (29.07.2026).**
Wdrożono wyłącznie ostrzeżenie w widoku kolekcji (`normalizacjaOczekuje` tam, gdzie
wgrywa się dokumenty, nie tylko w grafie). Automatyczny dry run po wyciągnięciu pojęć
i przycisk „scal teraz" — odłożone.

_Uzasadnienie, żeby ktoś nie „dokończył" tego jako oczywistego usprawnienia:_ kopia
zapasowa (`scripts/kopia-pojec.mjs`) rozwiązuje **nieodwracalność**, więc gdyby to był
jedyny problem, automat byłby dobrym rozwiązaniem. Prawdziwy powód jest inny:
**automat kasuje moment, w którym ktokolwiek patrzy na wynik.** Przebieg z 29.07.2026
wyprodukował dwa fałszywe mosty („uzgodnienie"/„uzgodnienia" 0,9518, „środki ochrony"/
„środki ochrony indywidualnej" 0,8879) — zobaczono je **tylko dlatego, że dry run
wymusił przejrzenie listy przed zapisem**. Automatycznie wjechałyby do grafu jako
pełnoprawne mosty i nikt by ich nie zobaczył — nie dlatego, że są ukryte, tylko dlatego,
że nie byłoby chwili, w której się patrzy. **Kopia chroni przed nieodwracalnością,
nie przed niezauważeniem.** To ta sama furtka co lista wykluczeń mostów (11.0a):
raz zbudowana, zastępuje „zmierz" przez „puść".

_Wada wybranego wariantu, zapisana uczciwie:_ przy każdym nowym dokumencie ten sam błąd
może się powtórzyć. Znacznik sprawia, że będzie **widoczny** — dlatego napis stoi
w widoku kolekcji, gdzie powstaje przyczyna, a nie tylko w grafie, który jest widokiem
diagnostycznym i można go nie otworzyć.

**Weryfikacja kopii zapasowej wymaga testu NEGATYWNEGO.** `scripts/kopia-pojec.mjs`
sprawdza się cyklem zrzut A → przywrócenie → zrzut B → `A == B`. To za mało: identyczny
wynik dałby skrypt, który w ogóle nie czyta bazy. Dopiero **rozmyślne zepsucie jednego
wiersza** i sprawdzenie, że przywracanie tę różnicę widzi (dokładnie 1) i naprawia,
czyni z tego dowód. Ta sama reguła co przy „zero problemów wymaga takiego samego
sprawdzenia jak wynik zły".

#### REGUŁA: brak danych WSTRZYMUJE werdykt, nigdy go nie produkuje

**Trzy wystąpienia tej samej klasy błędu, w trzech różnych miejscach:**

| co zabrakło | jak się objawiło | co ogłaszał wynik |
|---|---|---|
| `.range()` przy odczycie | PostgREST oddał 1000 wierszy zamiast wszystkich | „policzone" — z części danych |
| promienie węzłów | `w.y + w.r + 14` dało `NaN`, porównania z `NaN` są fałszywe | „zero kolizji podpisów" na każdym progu |
| `pdftotext` poza `PATH` | `ENOENT` złapany, kod poszedł dalej z `0%` | „wina w pliku — żadne narzędzie nie wyciąga polskich znaków" |

**Wspólny mianownik: we wszystkich trzech wynik był ZGODNY Z OCZEKIWANIEM.** Dlatego
żaden nie wzbudził podejrzeń sam z siebie — wyglądał jak potwierdzenie hipotezy, którą
się właśnie miało. Trzeci był najgorszy, bo potwierdzał hipotezę postawioną rundę
wcześniej **przez tę samą osobę**, która pisała pomiar.

**Wszystkie trzy znalazły się w ten sam sposób: przez pytanie „dlaczego akurat zero",
zamiast przyjęcia dobrej wiadomości.**

> **REGUŁA DO STOSOWANIA: brak danych, brak narzędzia i brak pomiaru MUSZĄ dawać
> „nie wiem", nie liczbę.** Kod, który łapie wyjątek i idzie dalej z wartością
> domyślną, zamienia awarię w wynik. Praktycznie: `catch` wokół pomiaru albo rzuca
> dalej, albo ustawia `null` — nigdy `0`. Werdykt liczony z `null` ma brzmieć
> „NIEROZSTRZYGNIĘTE", a nie wybierać jedną ze stron.

**Osobno, o miarach: cicha zerowa metryka.** Pierwsza wersja pomiaru kolizji podpisów
dawała ZERO na każdym progu, bo węzły nie miały ustawionych promieni, `w.y + w.r + 14`
wychodziło `NaN`, a każde porównanie z `NaN` jest fałszywe. Wynik wyglądał wiarygodnie
i zgadzał się z tym, co chciałoby się usłyszeć. **Znalazł się tylko dlatego, że ktoś
zapytał „dlaczego wszędzie zero", zamiast przyjąć dobrą wiadomość.** Stąd strażnik
w `zachodza()`, który przy `NaN` rzuca błędem zamiast milczeć — i stąd reguła: **wynik
„zero problemów" wymaga takiego samego sprawdzenia jak wynik zły.** To ta sama klasa
błędu co odczyt bez `.range()`, który po cichu liczy z części danych.

**`shadowBlur` zmierzony, nie oszacowany** (`scripts/bench-poswiaty.html`, pomiar
w przeglądarce): poświaty kosztują **5,3 ms** procesora przy 573 węzłach i 1,8 ms przy
165, ale **faktyczna liczba klatek to 59,9 fps na każdej skali** — rysowanie nie łamie
budżetu i nie wymaga decyzji. Podłoga szumu tego pomiaru to kilka ms (widać ją po
sprzecznym odczycie „bez poświat" przy 573 węzłach), więc wniosek stawiamy tylko na
poziomie, który dane udźwigną: **poświaty zabierają zapas, nie klatki.**

**Sesja 10 — szlif i wydajność.** ✅ ZAMKNIĘTA (27.07.2026)
Obsługa błędów, usuwanie dokumentów i kolekcji z porządkowaniem Storage (bez sierot),
ponowne indeksowanie, zachowanie przy ~2000 fragmentów, przeliczanie bazy rzutowania.
_DoD:_ brak sierot; błędy czytelne; działa przy 2000 fragmentów.

_DoD potwierdzone na żywo:_ kolekcja „CZ" (1455 fragmentów, `Wykaz częstotliwości
Rife.pdf`) zaindeksowana do końca i skasowana w całości — interfejs nie zamarł,
katalog kolekcji zniknął ze Storage. Diagnostyka po operacji: 8 obiektów, 8 wierszy,
**zero sierot w każdej z czterech klas**. Największy pojedynczy dokument miał 1455
fragmentów, a cała kolekcja robocza 3091 — próg „~2000" przekroczony z zapasem.

**Usuwanie bez sierot w Storage.** ✅ ZAMKNIĘTE

`deleteDocument` sprzątał poprawnie od Sesji 3 (wiersz + kaskada FK na `rag_chunks`
+ obiekt w Storage; brak obiektu i brak `file_path` to normalne stany, nie błędy).
**`deleteCollection` nie ruszał Storage w ogóle** — komentarz „sprzątanie dojdzie
w późniejszej sesji" pochodził z Sesji 2, gdy plików jeszcze nie było. Każdy plik
skasowanej kolekcji zostawał w buckecie na zawsze, bo znikał jedyny wiersz, który
go wskazywał.

_Reguła:_ klucze do skasowania to **suma dwóch źródeł** — `file_path` z `rag_documents`
tej kolekcji oraz obchód prefiksu `{collectionId}/` w Storage. Każde źródło samo w sobie
ma dziurę: baza nie wie o obiektach, których wiersz już zniknął; obchód prefiksu nie
obejmie dokumentu ze ścieżką spoza prefiksu. Klucze zbierane są **przed** usunięciem
wiersza — kaskada FK kasuje `rag_documents`, czyli jedyny zapis o tym, gdzie leżą pliki.

_Sprzątanie jest nieblokujące_ (jak w `deleteDocument`): awaria Storage nie może
zablokować porządków w bazie. Ale w odróżnieniu od pojedynczego dokumentu **wynik jest
raportowany** (`plikowUsunietych` / `plikowNieusunietych`), a UI mówi wprost, ile plików
zostało osieroconych — cicha porażka przy kolekcji na kilkaset plików to dokładnie ten
wyciek, który ta zmiana likwiduje.

_Diagnostyka:_ `scripts/diag-sieroty.mjs` — cztery klasy rozjazdu: (A) obiekt bez wiersza,
(B) dokument z `file_path` wskazującym na nieistniejący obiekt (wygląda na sprawny,
dopóki ktoś nie kliknie „Przetnij od nowa"), (C) dokument bez `file_path`, (D) prefiks
po nieistniejącej kolekcji. Skrypt niczego nie usuwa.

_Stan zmierzony PRZED zmianą (27.07.2026):_ 9 obiektów, 9 wierszy, **zero sierot
w każdej klasie**. Wyciek istniał w kodzie, ale nigdy nie został wykonany — żadnej
kolekcji dotąd nie skasowano, a usuwane dokumenty szły przez poprawną ścieżkę.
Wykonana ścieżka była czysta, niewykonana dziurawa — dlatego diagnostyka na produkcji
nie zastępuje czytania kodu.

_Stan PO skasowaniu kolekcji „CZ":_ 8 obiektów, 8 wierszy, 1 kolekcja, nadal **zero
sierot**. Prefiks kolekcji zniknął ze Storage — reguła zadziałała na realnych danych,
nie tylko w teście.

**Czytelne komunikaty błędów.** ✅ ZAMKNIĘTE

Rdzeń `lib/rag/` mówi po polsku, ale **do dewelopera**: „ustaw RAG_EMBED_MODEL",
„migracja kolumny + przeindeksowanie", „vector(1024)". To właściwe komunikaty w logu
serwera i bezużyteczne dla użytkownika AIDEAS, który nie wie, czym jest Ollama ani
kolumna `rag_chunks.embedding`.

_Reguła:_ warstwa UI tłumaczy kod z 10.2 na dwa zdania — **co się stało** i **co z tym
zrobić** — a szczegół techniczny (oryginalny komunikat + kod) zostaje **obok**, nie
zamiast. Kody, których komunikat rdzenia jest już zrozumiały (`invalid_input`,
`limit_exceeded`, `not_found`), nie dostają generycznego wstępu, żeby go nie zaszumić.

`app/_lib/bledy.js` — czysta funkcja `komunikatBledu(error)`, bez zależności od Reacta,
używana we wszystkich 18 miejscach, gdzie UI pokazywało surowe `error.message`.
Test pilnuje, że **żaden kod nie jest jedyną treścią komunikatu**.

**Wydajność i sprzątanie.** ✅ ZAMKNIĘTE

DoD „~2000 fragmentów" odhaczone z zapasem — praca szła na 3091 fragmentach w kolekcji,
a największy pojedynczy dokument miał 1455. Jednokierunkowość reguły przeliczania bazy
rzutowania: patrz poprawka w 12.4.

_Usunięcie dużego dokumentu — potwierdzone na żywo._ Kolekcja „CZ" (1455 fragmentów
plus plik w Storage) skasowana w jednej operacji: bez limitu czasu, bez zamarcia
interfejsu. Ścieżka jest krótka z założenia — jeden `SELECT`, jeden `DELETE` z kaskadą
FK, jedno `remove` w Storage. Pomaga tu decyzja z Sesji 5: **nie ma indeksu wektorowego**
(skan sekwencyjny jest przy tej skali szybszy, a `ivfflat` pogorszyłby trafność — patrz
`sql/session-5-search.sql`), więc kaskada rusza wyłącznie dwa indeksy btree, bez
przebudowy struktury ANN.

_Poprawka przy okazji:_ przycisk „Usuń" nie miał stanu zajętości — zostawał klikalny,
więc drugie kliknięcie wysyłało drugie `DELETE` na już usunięty wiersz i wracało
`not_found` jako błąd na nieistniejący problem. Teraz blokuje się na czas operacji,
a przy dokumencie powyżej 500 fragmentów uprzedza, że to chwilę potrwa.

#### 10.a Zadania zebrane z realnych dokumentów (po Sesji 6)

Znalezione na kolekcji „Regulaminy" po dołożeniu prawdziwych PDF-ów (Kodeks pracy,
RODO, „Ludzie bezdomni", „Wykaz częstotliwości Rife"). **10.a.1 i 10.a.2 nie blokują
wariantu 1** — obie ścieżki działają, tylko dają gorszy materiał; zapisane, żeby nie
zginęły. **10.a.3 blokowało** (plik w ogóle się nie wgrywał) i jest już naprawione.

**Stan na zamknięcie Sesji 10:**

| | temat | stan |
|---|---|---|
| 10.a.1 | uszkodzone kodowanie tekstu z PDF | ✅ zamknięte |
| 10.a.2 | żywe paginy brane za nagłówki | ✅ zamknięte |
| 10.a.3 | polskie znaki w nazwie pliku łamały Storage | ✅ zamknięte |
| 10.a.4 | preambuły bez śródtytułów cytują się plikiem i stroną | ⚠ znane ograniczenie |
| 10.a.5 | kryterium „linia domknięta" selekcjonuje pod brak treści | ✅ zamknięte |
| 10.a.6 | kotwiczenie na schemacie numeracji (wariant C2) | ⏸ zmierzony kandydat |

**Co zostaje otwarte i dlaczego:**

- **10.a.4** — świadome ograniczenie, nie usterka. Preambuła RODO nie zawiera ani jednego
  nagłówka, więc nie ma tam tytułu sekcji do zacytowania; plik i strona pozostają
  poprawne i to one są użyteczną częścią cytowania. Wykrywanie numerów motywów w toku
  zdania byłoby strojeniem pod akty prawne Unii, a nie regułą ogólną.
- **10.a.6** — wariant C2 **zmierzony i działający**, ale wstrzymany świadomie: progi
  wyboru rodziny kotwiczącej są nieprzetestowane (a to serce reguły), zostaje
  niewyjaśniona zmiana 6 znaków w prozie i znany błąd `Art. 183c`/`183ca`, a wdrożenie
  wymaga pełnego reindeksu, powtórki bake-offu i ponownego sprawdzenia progu — czyli
  własnej rundy. **Decyzja: wracamy po integracji z AIDEAS**, gdy będzie widać, czy
  poziom rozdziału realnie nie wystarcza do cytowania. Do tego czasu obowiązuje
  strażnik z 10.a.5: prawda na grubszym poziomie zamiast fałszu na dokładnym.

**10.a.1 — wykrywanie uszkodzonego kodowania tekstu z PDF.** ✅ ZAMKNIĘTE
W `ludzie-bezdomni.pdf` (Wolne Lektury) litera „j" wydobywa się jako telugu `గ`,
a dwuznak „dz" jako `ǳ` (U+01F3): *„podobnie గak tysiące innych"*, *„bawiły się blade
ǳieci"*, *„proగekt"*. To właściwość **samego pliku** — własny krój z nietypowym
mapowaniem znaków; `unpdf` czyta to, co w PDF-ie jest, więc nie jest to błąd naszego kodu.

Konsekwencja jest jednak nasza: wektory tego dokumentu powstają z zepsutego tekstu,
więc wyszukiwanie w nim jest gorsze, a fragmenty pokazywane użytkownikowi zawierają
krzaki. To dokładnie „Garbage In, Garbage Out" z sekcji 15.

_Zrobione (Sesja 10)._ `udzialPodejrzanychLiter()` liczy udział podejrzanych liter
**wśród liter**, nie wśród wszystkich znaków — interpunkcja, cyfry i typografia (`¹`, `—`,
`„"`) są w porządku i tylko rozwadniałyby wynik. Podejrzana litera to taka spoza łacinki
podstawowej, Latin-1 i Latin Extended-A; łapie to zarówno telugu `గ`, jak i `ǳ` (U+01F3).
Powyżej **2%** dokument dostaje ostrzeżenie, liczone w locie w `mapDocument`, bez nowej
kolumny — tak samo jak `warning` o skanie. Dokument z obiema wadami dostaje oba zdania.

_Pomiar na korpusie — próg 2% rozdziela go bez marginesu błędu:_ `05-instrukcja-bhp.pdf`,
`CELEX` (RODO), `D20250277Lj` (Kodeks pracy), `06-skan`, `01-regulamin.md`,
`02-polityka.txt`, `04-umowa.docx` → **0,000%**; `ludzie-bezdomni.pdf` → **2,835%**.

**10.a.2 — żywe paginy brane za nagłówki.** ✅ ZAMKNIĘTE
W `CELEX_32016R0679_PL_TXT.pdf` (RODO) większość fragmentów preambuły ma `heading_path`
w rodzaju `4.5.2016 L 119/1Dziennik Urzędowy Unii EuropejskiejPL` — czyli stopkę
Dziennika Urzędowego, nie tytuł sekcji. Heurystyka z 8.1 („krótka linia bez kropki
na końcu") bierze żywą paginę za nagłówek. Numery stron pozostają poprawne, a w części
artykułowej ścieżki są sensowne („Definicje", „Prawo dostępu przysługujące osobie,
której dane dotyczą") — problem dotyczy głównie preambuły.

To ta sama rodzina co potknięcie w `05-instrukcja-bhp.pdf`, gdzie urwane zdanie
z łamania strony trafiło do `heading_path`.

_Zrobione (Sesja 10)._ Trzy wzorce odrzucania kandydatów na nagłówek, wszystkie
zmierzone na realnym korpusie:

**A. Żywe paginy — USUWANE z dokumentu**, na poziomie bloków, przed złożeniem
`extracted_text` (niezmiennik 8.4 musi przetrwać). Kandydat odpada, gdy po normalizacji
powtarza się na **ponad połowie stron** i **≥70% jego wystąpień leży przy krawędzi**
(2 pierwsze albo 3 ostatnie linie). Reguła nie działa dla dokumentów krótszych niż
**5 stron**. Dwie rzeczy okazały się nieoczywiste:
- *Klucz musi usuwać białe znaki, nie tylko normalizować cyfry.* Stopka RODO ma dwa
  warianty odstępów na stronach parzystych i nieparzystych, więc każdy trafia na
  **dokładnie połowę** stron i próg „ponad połowa" nie łapie żadnego.
- *Sama powtarzalność nie wystarcza.* Po normalizacji cyfr wszystkie `Artykuł 1..99`
  zlewają się w jeden klucz obecny na 51 z 88 stron. Rozróżnia je pozycja: stopka leży
  przy krawędzi w **92%** wystąpień, `Artykuł N` w **8%**.

**Osłona:** nagłówek strukturalny (`Rozdział`, `Dział`, `Artykuł`, `Art.`, `Część`, `§`,
`Załącznik`, `Sekcja`, `Tytuł`, `Księga` + numer) **nigdy** nie jest usuwany, niezależnie
od powtarzalności i pozycji — inaczej dokument, w którym każdy rozdział zaczyna się od
nowej strony z tytułem u góry, straciłby prawdziwe nagłówki.

**B. Urwane zdania — DEGRADOWANE do akapitu**, nigdy usuwane (to prawdziwa treść, tylko
źle zaklasyfikowana). Cztery sygnały: zaczyna się małą literą; kończy przyimkiem albo
spójnikiem; kontynuuje długi poprzedni wiersz niezakończony kropką; jest kontynuowany
przez następny wiersz zaczynający się małą literą lub liczbą.

**C. Adnotacje w nawiasie — DEGRADOWANE do akapitu.** Linia ujęta w całości w nawias
okrągły lub kwadratowy to element aparatu wydawniczego, nie tytuł sekcji.

_Wynik:_ RODO — stopka usunięta 88×, `heading_path` wskazuje tytuły artykułów, zero
podejrzanych ścieżek. Kodeks pracy — usunięte `©Kancelaria Sejmu` i data, po 186×.
Reguła A ma **raport przy dokumencie** (co usunięto i ile razy), bo kasuje tekst.
Diagnostyka na danych z bazy: `scripts/diag-naglowki.mjs`. Zostało jedno ograniczenie —
patrz 10.a.4.

**10.a.3 — polskie znaki w nazwie pliku łamały zapis do Storage.** ✅ ZAMKNIĘTE

Wgranie `Wykaz częstotliwości Rife.pdf` kończyło się statusem `błąd` i zerem fragmentów:

```
Błąd zapisu pliku do magazynu (upload): Invalid key:
ab5dd243-…/c7d4859d-…/Wykaz częstotliwości Rife.pdf
```

_Przyczyna:_ Supabase Storage przyjmuje w kluczu obiektu tylko wąski zestaw ASCII, a nazwa
pliku szła do `file_path` bez zmian — z diakrytykami (`ę`, `ś`, `ł`, `ż`) i spacjami.
Dotyczyło to praktycznie każdego pliku polskiego użytkownika.

_Reguła (`sanitizeStorageName` w `lib/rag/documents.js`, czysta funkcja):_ transliteracja
polskich liter (`ł`/`Ł` osobną podmianą — NFD ich nie rozkłada), potem NFD + usunięcie
znaków łączących dla reszty łacinki (`é`, `ü`, `ç`); wszystko poza `[A-Za-z0-9._-]` → `-`;
zwinięcie powtórzonych `-`; obcięcie wiodących i końcowych `-` oraz `.`; **zachowane
rozszerzenie** (obcinamy rdzeń, nie ogon); limit segmentu 120 znaków; pusty wynik → `plik`.
Kolizji nie obsługujemy — `documentId` w ścieżce to UUID, więc dwie identycznie
zsanityzowane nazwy i tak lądują w osobnych katalogach.

_Granica poprawki:_ sanityzowany jest **wyłącznie ostatni segment `file_path`**.
`rag_documents.file_name` zostaje oryginalną nazwą — to ona idzie do cytowań w AIDEAS
i na listę dokumentów. Jeśli lista kiedykolwiek pokaże `Wykaz-czestotliwosci-Rife.pdf`,
sanityzacja weszła o jedno pole za daleko.

_Przy okazji sprawdzone:_ `deleteDocument` przechodzi po sierocie z nieudanego uploadu
(`file_path` jest `NULL`) oraz po wierszu, którego obiektu nie ma już w Storage —
sprzątanie Storage jest celowo nieblokujące. `reindexDocument({ rechunk: true })` pobiera
oryginał po zapisanym `file_path`, nie składa ścieżki z `file_name`. Poza tym `file_name`
nigdzie nie trafia do ścieżki ani URL-a.

_Wniosek o danych testowych:_ **korpus testowy musi zawierać plik o nazwie z polskimi
znakami i spacjami.** Cały korpus Sesji 3 miał nazwy wyłącznie ASCII bez spacji
(`01-regulamin-pracy.md`, `D20250277Lj.pdf`, `CELEX_32016R0679_PL_TXT.pdf`), więc ta
ścieżka nigdy nie została wykonana. To druga taka sytuacja po limicie 1000 wierszy
w PostgREST: błąd, którego nie dało się wykryć na zbyt uprzejmych danych testowych.

**10.a.4 — preambuły bez śródtytułów cytują się plikiem i stroną.** ZNANE OGRANICZENIE

Preambuła RODO — motywy `(1)`–`(173)`, około 38 stron i **231 z 503 fragmentów** — nie
zawiera ani jednego nagłówka. Cały ten obszar dziedziczy więc ostatni nagłówek sprzed
siebie: dziś `„ROZPORZĄDZENIA"`, czyli nazwę działu Dziennika Urzędowego ze strony
tytułowej. Wcześniej było to `„(Tekst mający znaczenie dla EOG)"` — po dołożeniu reguły
o adnotacjach w nawiasie (wzorzec C w 10.a.2) formułka przestała być nagłówkiem, ale stos
sięgnął po to, co stało jeszcze wcześniej.

_Czego świadomie NIE robimy:_ numery motywów (`(23)`, `(30)`) stoją **w toku zdania**,
nie w osobnej linii, więc ich wykrycie byłoby strojeniem pod akty prawne Unii, a nie
regułą ogólną. To samo dotyczy polowania na samo słowo `„ROZPORZĄDZENIA"`.

_Skutek dla cytowania w AIDEAS:_ fragmenty preambuły dają plik + stronę, a `heading_path`
niesie nazwę działu zamiast tytułu sekcji — **nie ma tam tytułu sekcji do zacytowania**.
Plik i strona pozostają poprawne i to one są w tym wypadku użyteczną częścią cytowania.

_Możliwe podejście, gdyby to kiedyś zaczęło przeszkadzać:_ ograniczyć **zasięg** nagłówka —
nagłówek pokrywający więcej niż jakiś ułamek dokumentu (tu 46%) nie pełni funkcji tytułu
sekcji i mógłby wypadać ze ścieżki. To reguła ogólna, ale dotyka `chunk.js`, nie ekstrakcji,
i wymaga własnego pomiaru na korpusie.

**10.a.5 — kryterium „linia domknięta" selekcjonuje pod BRAK treści.** ✅ ZAMKNIĘTE

Obserwacja ogólna o **regule B z 10.a.2** (urwane zdania), warta zapamiętania niezależnie
od tego, który wariant naprawy wybierzemy.

Reguła B odrzuca kandydata, który wygląda na urwany: zaczyna się małą literą, kończy
przyimkiem, kontynuuje poprzedni wiersz, jest kontynuowany przez następny. Działa
poprawnie i naprawiła `05-instrukcja-bhp.pdf`. Ale w `D20250277Lj.pdf` (Kodeks pracy)
ujawniła własność, której nie widać na dokumencie z prawdziwymi śródtytułami:

```
krótkie linie zaczynające się od "Art. N." / "§ N."   : 702
  PRZETRWAŁY jako nagłówek                            : 102  (w tym 98 stubów "(uchylony)")
  zdegradowane przez regułę B                         : 600  (w tym 0 stubów)
```

**Nagłówek, który coś zapowiada, z definicji wygląda na urwany — bo jest urwany;
zdanie ciągnie się w następnej linii. Nagłówek, który nie zapowiada niczego, jest
domknięty.** Kryterium „domkniętości" jest więc skorelowane odwrotnie z tym, o co chodzi:
przy takim składzie przepuszcza **wyłącznie** puste etykiety. W Kodeksie jedynymi
przetrwałymi nagłówkami artykułowymi zostały artykuły uchylone — **229 z 519 fragmentów
(44%)** dostało ścieżkę typu `„Art. 35. (uchylony)"` nad treścią artykułu następnego.
To gorsze niż stan sprzed 10.a.2: `„©Kancelaria Sejmu"` było oczywistym śmieciem,
`„Art. 35."` wygląda wiarygodnie i wysyła pod zły przepis.

To nie jest wada polskiego składu ani cecha aktów prawnych — to własność samego
kryterium. Każdy dokument, w którym marker sekcji stoi **w tej samej linii co treść**,
odwróci regułę B w ten sam sposób. RODO nie ma tego problemu (**0 z 503**) tylko dlatego,
że tam `Artykuł N` stoi w osobnej linii.

_Wniosek metodyczny:_ reguły odsiewające kandydatów na nagłówek trzeba mierzyć nie
liczbą odrzuconych śmieci, lecz **tym, co przeżyło** — reguła może mieć zerowy odsetek
fałszywych alarmów i mimo to zostawić sam osad.

_Miara:_ `scripts/diag-sciezki.mjs` (na danych z bazy) — klasyfikuje ostatni segment
ścieżki i zestawia go z markerem otwierającym treść fragmentu. Kluczowa liczba to
**sprzeczne / porównywalne**: Kodeks `93/94`, RODO `0/0`. Z tych 93 dziewięć to artefakt
miary (marker w treści jest odwołaniem w środku zdania, np. „przepisy art. 221c–221f"),
więc **realnych błędów ścieżki jest 84**.
`scripts/sym-warianty.mjs` (offline, na plikach z `testy-rag/`) porównuje warianty
naprawy; wariant `BAZA` musi odtworzyć liczbę fragmentów z bazy, inaczej wyniki są
bezwartościowe. `scripts/wer-straznik.mjs` weryfikuje wdrożoną regułę na prawdziwym
kodzie z `lib/rag/`.

_Zrobione — STRAŻNIK POKRYCIA RODZINY NUMERACYJNEJ._ Jeżeli nagłówki danej rodziny
numeracyjnej pokrywają **mniej niż połowę** jej wystąpień w dokumencie (przy co najmniej
**10** wystąpieniach), detekcja tej rodziny jest uznana za zepsutą i **wszystkie** jej
nagłówki są degradowane do akapitów. Ścieżka spada wtedy o poziom wyżej, na tytuł
rozdziału. Rodzina to znormalizowany prefiks numeracyjny (`art`, `§`, `artykuł`,
goła liczba) rozpoznawany **jednym wzorcem bez listy słów**.

Zmierzone pokrycia: Kodeks `art` 13,2% · `§` 5,3% · goła liczba 1,6% (wszystkie zepsute),
RODO goła liczba 0,2%, BHP i „Ludzie bezdomni" — strażnik nie rusza niczego. Próg 0,5
leży w bardzo szerokiej przerwie między tymi wartościami a rodziną zdrową.

**Degradacja nie rusza tekstu.** `buildExtractedText` łączy nagłówki i akapity tak samo,
więc zmienia się wyłącznie grupowanie w runy i `heading_path`. To był powód wyboru tego
wariantu: `extracted_text` zostaje **bajt w bajt**, offsety i niezmiennik 8.4 są
nienaruszone, a kosztem jest przecięcie **jednego** dokumentu zamiast reindeksu korpusu.

_Wynik na plikach (`scripts/wer-straznik.mjs`):_

| dokument | extracted_text | fragmentów | ścieżki „(uchylony)" | REALNE sprzeczności |
|---|---|---|---|---|
| Kodeks pracy | bez zmian | 519 → 510 | 229 → **9** | 84 → **0** |
| RODO | bez zmian | 503 → 504 | 0 → 0 | 0 → 0 |
| BHP | bez zmian | 5 → 5 | 0 → 0 | 0 → 0 |
| Ludzie bezdomni | bez zmian | 1047 → 1047 | 0 → 0 | 0 → 0 |

Pozostałe 9 ścieżek z adnotacją to jedna, autentyczna: `„Preambuła (uchylona)"` — tytuł
sekcji, nie stub. Kodeks cytuje się teraz rozdziałem („Urlopy wypoczynkowe", „Praca
zdalna") plus numerem strony, co do znalezienia przepisu wystarcza.

_Raport przy dokumencie:_ `niepewneRodziny` (rodzina, liczba nagłówków, wystąpień,
pokrycie). Strażnik nie kasuje tekstu, ale **odbiera ścieżkom poziom szczegółowości** —
bez raportu byłby niewidoczny, a to on decyduje, czy dokument cytuje się artykułem,
czy tylko rozdziałem.

_Znany osad:_ inicjał `„M. SCHULZ"` (podpis pod RODO) uchodzi za liczbę rzymską `M`,
bo kropka nie odróżnia inicjału od numeru sekcji (`„I. Wstęp"` ma ją tak samo). Jedno
wystąpienie na 402, bez wpływu na wynik; jest na to test, żeby zmiana była widoczna.

**10.a.6 — kotwiczenie na schemacie numeracji (wariant C2).** ZMIERZONY KANDYDAT

Strażnik z 10.a.5 osiąga zero błędów kosztem tego, że **przestaje cokolwiek twierdzić
na poziomie artykułu**. Docelowo chcemy poziom artykułu z powrotem — ale poprawnie.

_Reguła (zasymulowana, NIE wdrożona):_
1. **Rozpoznaj własny schemat numeracji dokumentu i kotwicz na KAŻDYM jego wystąpieniu,
   niezależnie od kształtu linii.** Marker w środku długiej linii („Art. 36. § 1. Okres
   wypowiedzenia…") rozpada się na nagłówek `Art. 36.` i akapit. Rodzinę kotwiczącą
   wybiera statystyka pliku, nie lista słów: w Kodeksie `art` ma 458 różnych numerów na
   478 wystąpień (96%), wobec `§` 6% i gołej liczby 10% — sekcjonuje ta pierwsza.
2. **Nagłówek pustej sekcji nie wchodzi na stos.** Po wprowadzeniu punktu 1 stuby
   „(uchylony)" stają się pustymi sekcjami i wypadają **za darmo**, bez żadnej reguły
   mówiącej cokolwiek o uchyleniu.
3. **Linia otwarta markerem rozpoznanej rodziny nigdy nie jest nagłówkiem prozą
   poziomu 1.** Albo kotwiczy, albo jest treścią. Bez tego 44 linie `„§ 5. (uchylony)"`
   lądują na poziomie 1 — PŁYTSZYM niż kotwica artykułu — i zdejmują ze stosu całą
   ścieżkę. Pierwsze podejście bez tego punktu dało **259** ścieżek z adnotacją, czyli
   gorzej niż stan wyjściowy.

_Zmierzone (Kodeks):_ 698 fragmentów (+35%), `extracted_text` 357 110 zn. (zmieniony),
ścieżki z adnotacją **9**, poziom artykułu dla **662 z 698**, realne sprzeczności **1**.
RODO, BHP i „Ludzie bezdomni" bez pogorszenia.

_Znany błąd:_ ścieżka `„Art. 183c."` nad treścią `Art. 183ca.` — wzorzec prefiksu
dopuszcza tylko jedną literę po numerze, więc `183ca` nie kotwiczy.

_Do zrobienia przed wdrożeniem:_
- progi wyboru rodziny kotwiczącej (≥20 wystąpień, ≥10 różnych numerów, ≥15%
  unikalności numerów) są **nieprzetestowane, a to serce reguły**,
- niewyjaśniona zmiana 6 znaków w „Ludziach bezdomnych" — reguła o numeracji nie ma
  prawa dotykać powieści,
- naprawa `Art. 183ca`,
- pełny reindeks korpusu + **powtórka bake-offu** (fragmentów przybywa 35%, więc
  0,7447 się ruszy) + ponowne sprawdzenie progu `RAG_MIN_SCORE`.

_Kiedy:_ po integracji z AIDEAS, gdy będzie widać, czy poziom rozdziału realnie nie
wystarcza do cytowania.

**10.a.7 — numer sekcji ginął, bo tytuł zrzucał go ze stosu.** ✅ ZAMKNIĘTE

`chunk.js` nadawał **wszystkim** nagłówkom z PDF poziom 1, a nagłówek zdejmuje ze stosu
każdy o poziomie równym lub wyższym. W RODO `Artykuł 36` i `Uprzednie konsultacje` to
dwie osobne linie nagłówkowe, więc tytuł zrzucał numer natychmiast po jego wejściu.

_Skutek:_ **tylko 53 z 503 fragmentów RODO** miały w `heading_path` jakąkolwiek cyfrę.
W 450 pozostałych numer artykułu wyparował z cytowania — agent podałby
„RODO › Uprzednie konsultacje" zamiast „RODO › Artykuł 36 › Uprzednie konsultacje".
To strata dokładnie tej jakości, o którą chodziło w 10.a.5.

_Reguła:_ nagłówek stojący bezpośrednio po **gołym markerze** jest jego tytułem i schodzi
o poziom głębiej. Goły marker (`Artykuł 36`, `Rozdział IV`) lokalizuje, ale nic nie mówi —
sam z siebie nie jest tytułem sekcji, tylko jej etykietą. Głębokość ograniczona do 6.

_Dlaczego NIE „każdy nagłówek po nagłówku" (wariant odrzucony po pomiarze):_ wersja
szeroka zagnieżdża sąsiadów z dwóch różnych sekcji. Na Kodeksie dawała ścieżki
`„Rozdział II › DZIAŁ ÓSMY › Uprawnienia…"` — twierdzące, że Dział VIII leży w Rozdziale II.
Realne sprzeczności ścieżki z treścią rosły **0 → 1**, a w prozie („Ludzie bezdomni")
reguła łączyła kolejne przypisy redakcyjne w fałszywe hierarchie: **188** zmienionych
ścieżek zamiast 10. Warunek „marker, po którym stoi NIE-marker" zawęża regułę do
jedynego układu, w którym zagnieżdżenie jest uzasadnione.

_Zmierzone (`scripts/sym-poziomy.mjs`, wariant kontrolny odtwarza stan bazy):_

| | przed | wariant szeroki | **wdrożony (zawężony)** |
|---|---|---|---|
| RODO — ścieżek z cyfrą | 53 / 503 | 269 | **269** |
| Kodeks — realne sprzeczności | 0 | 1 | **0** |
| Kodeks — średnia głębokość ścieżki | 1,00 | 2,03 | 1,35 |
| „Ludzie bezdomni" — ścieżek zmienionych | — | 188 | **10** |
| BHP — ścieżek zmienionych | — | 0 | **0** |

**`extracted_text` pozostaje identyczny** we wszystkich dokumentach, a liczba fragmentów
się nie zmienia — poziom nagłówka nie wpływa na granice runów (każdy nagłówek zamyka run
niezależnie od poziomu). Zmienia się wyłącznie `heading_path`.

_Koszt:_ `heading_path` wchodzi do tekstu embedowanego (8.2, `RAG_PREPEND_HEADINGS`),
więc fragmenty ze zmienioną ścieżką wymagają **przeliczenia wektorów**: Kodeks 176 z 510,
RODO 216 z 504. Ponownego cięcia wymaga tylko RODO — i to z innego powodu: w bazie leży
503 fragmenty, bo **RODO nie było przecinane po 10.a.5**, a strażnik pokrycia degraduje
tam jeden nagłówek (`M. SCHULZ`, patrz znany osad). Kodeks wystarczy przeliczyć.

**Sesja 11 (opcjonalna) — czat testowy.**
Pytanie → wyszukiwanie → odpowiedź z fragmentów, ze źródłami (plik + strona).

### Integracja z AIDEAS

**Sesja I1 — przeniesienie rdzenia.**
Kopiujesz `lib/rag/` + `app/api/rag/*`, uruchamiasz skrypty SQL (jeśli inna baza),
mapujesz **projekt AIDEAS → kolekcja** przez `external_ref`. Wgrywanie pliku w AIDEAS
wywołuje `ingestFile` + pętlę `embed`. Weryfikacja testu granicy (sekcja 3).
_DoD:_ pliki wgrywane w AIDEAS trafiają do bazy wektorowej; brak regresji.

**Sesja I2 — narzędzie agenta + wizualizacja.**
Narzędzie „przeszukaj bazę wiedzy" w `lib/tools/` wywołujące `searchCollection`;
**zastępuje** doklejanie treści do promptu (limit 24 000 znaków znika). Agent cytuje
źródła: plik + strona. `noResults` → „nie znalazłem w dokumentach". Widok grafu w AIDEAS.
_DoD:_ agent odpowiada z fragmentów i podaje źródła ze stroną; przy pytaniu spoza bazy
mówi wprost, że nie znalazł; działa dla Claude i modeli lokalnych.

**Razem: 11–12 sesji + 2 na integrację.**

---

## 15. Ryzyka

**Model embeddingów a polski** — rozbrojone bake-offem (Sesja 1). Pominięcie objawiłoby
się „średnią trafnością" bez oczywistej przyczyny.

**Prefiksy modelu** — użycie bez wymaganego prefiksu psuje trafność **cicho**, bez błędu.
Stąd obowiązkowy krok 6.1 i rozdzielenie `embedDocuments`/`embedQuery`.

**Normalizacja pojęć (Sesja 8)** — największe ryzyko wariantu 2. Bez klastrowania
i idempotencji graf rozpada się na duplikaty albo tworzy łańcuchy scaleń.

**Limit czasu funkcji na hostingu** — rozbrojony indeksowaniem partiami (10.3).
Pojedyncze długie żądanie zostawiłoby dokument w statusie `embedding` na zawsze.

**Zmiana modelu lub wymiaru** = migracja kolumny + przeindeksowanie. Stąd `embed_model`,
`embed_dim` w kolekcji, kontrola `dim_mismatch` i `model_mismatch`.

**Czas indeksowania** — ~150 stron to ~500–800 fragmentów; lokalnie minuty, nie sekundy.

**Struktura dokumentu** wpływa wprost na jakość cięcia. „Garbage In, Garbage Out".

**Pokusa efektownej animacji** — najprostsze rozwiązanie (timer + punkty lecące na miejsce)
wygląda dobrze i jest nieprawdziwe. Prototyp `rag-realny-2d3d.html` pokazuje, że uczciwy
przebieg jest równie efektowny: moment pojawienia się całej mapy po przekroczeniu progu
i połączenia rosnące na żywo dają kulminację bez fikcji.

**Brak autoryzacji.** RLS wyłączone. Przed publicznym wystawieniem: konta + RLS + izolacja.

---

## 16. Decyzje do weryfikacji (redline)

1. **JavaScript, nie TypeScript** (spójność z AIDEAS).
2. **`bge-m3` jako domyślny kandydat** — decyzja po bake-offie (Sesja 1).
3. **PCA zamiast UMAP**, z konwencją znaku wg 12.3.
4. **Pojęcia wyciągane Anthropic Haiku** — koszt jednorazowy rzędu kilkudziesięciu centów.
5. **Czat jako opcjonalna Sesja 11.**
6. **Domyślnie ta sama baza Supabase co AIDEAS**, prefiks `rag_`.
7. **Formaty v1: pdf, docx, txt, md, csv.** OCR, xlsx, html poza zakresem.
8. **Próg `RAG_MIN_SCORE=0.35`** — wartość startowa, dostroić po Sesji 5.
9. **Bez indeksu wektorowego** do ~50 000 fragmentów (7.2).
10. **Indeksowanie partiami zamiast jednego długiego żądania** (10.3) — nawet lokalnie,
    dla jednolitości i wznawialności.
11. **Próg `RAG_PROJECTION_MIN_CHUNKS=50`** — poniżej niego mapa jest niedostępna
    z komunikatem, zamiast rysować się z kilkudziesięciu wektorów (12.4).
12. **PCA liczy trzy składowe od razu** (12.2) — widok 3D jest opcją przełączalną,
    domyślnie 2D (12.8). Dołożenie trzeciej składowej później oznaczałoby przeliczenie
    współrzędnych wszystkich fragmentów.
13. **Wizualizacja mapy odzwierciedla realny przebieg** (12.9) — bez animacji sterowanych
    timerem. W grafie (Sesja 9) ruch węzłów jest dozwolony, bo to działanie algorytmu.
14. **Tryb połączeń i widok 3D wydzielone do Sesji 6b** — nie wpływają na jakość
    wyszukiwania, a potrafią pochłonąć więcej czasu niż reszta wariantu 1.
15. **Sąsiedztwo 3D liczone w przeglądarce, nie zapisywane do bazy** (12.6) — przełącznik
    widoku nie może wywoływać zapisu ~2000 wierszy.
16. **Funkcje zwracające pojęcia filtrują `merged_into is null`** (sekcja 9) — inaczej
    scalanie z Sesji 8 nie ma żadnego widocznego efektu.
17. **Współrzędne pojęć = środek ciężkości ich fragmentów** (12.5), nie rzut własnego
    wektora; jedyny odbiorca to opcjonalna warstwa pojęć na mapie w Sesji 6b.

---

## 16a. Kolejka — zadania odłożone z uzasadnieniem

### OCR dla PDF-ów bez użytecznej warstwy tekstowej

**Rozwiązuje DWA problemy naraz**, i to jest główny argument za osobną sesją:
- `warunki_zycia_rodzin_w_polsce.pdf` — 150 ze 171 stron bez polskich znaków,
  uszkodzenie potwierdzone dwiema niezależnymi implementacjami (11.1d);
- `06-skan-zaswiadczenie.pdf` — **zero fragmentów**, status `no_text`, czyli dokument,
  którego dziś w ogóle nie ma w wyszukiwaniu.

Droga: `unpdf.renderPageAsImage` → silnik OCR. Do rozstrzygnięcia: silnik (Tesseract
lokalnie wobec usługi), koszt na stronę, gdzie trzymać wynik.

> **NIGDY automatycznie na każdym PDF-ie.** OCR jest wolny i kosztowny, a większość
> PDF-ów ma poprawną warstwę tekstową. Uruchamiany na żądanie albo po wykryciu
> okaleczenia regułą z 11.1d.

_Odrzucone przy tej samej decyzji:_ **wymiana biblioteki ekstrakcji** (`unpdf` →
poppler). Pomiar strona po stronie: `pdftotext` czyta lepiej **6 stron ze 171**, z czego
5 to wahania wokół progu. Koszt — zewnętrzny plik binarny w potoku, wdrożenie na dwa
systemy, brak w przeglądarce — i **ryzyko regresji na 9 dokumentach, które dziś
działają**: inne składanie linii to inne granice fragmentów, czyli przecięcie całego
korpusu od nowa. Nieproporcjonalne do sześciu stron.

### Automatyczny dry run normalizacji i przycisk „scal teraz"

Patrz notatka o metodzie. Odłożone świadomie — wdrożono samo ostrzeżenie.

## 17. Pomysły na później

Rzeczy świadomie odłożone — nie należą do wariantu 1 ani 2, ale zapisane, żeby nie
zginęły. Każdy ma zapisany **warunek sensu**: kiedy w ogóle warto go budować.

**Kreator pierwszego uruchomienia.** Przy braku lokalnego modelu: wykrycie sprzętu
(RAM / VRAM / CPU), test wydajności embeddingu na tej maszynie, rekomendacja modelu
i instalacja przez Ollamę. Technicznie to rozbudowa `/api/rag/status` (już czyta listę
modeli z Ollamy) o odczyt parametrów maszyny — dołożenie warstwy, nie przebudowa rdzenia.
Model jest konfigurowalny globalnie i per kolekcja (sekcja 9), więc kreator tylko ustawia
istniejącą zmienną, niczego nie betonując.
_Warunek sensu:_ tylko jeśli embeddingi liczone są **lokalnie**. Gdyby docelowo szły
przez zdalne API, komputer użytkownika nic nie liczy i kreator jest bezprzedmiotowy.
Osobna sesja po wariancie 1.

**Rozbudowa zbioru testowego.** Bake-off Sesji 1 (14 zdań / 5 zapytań) wystarczył do
wyboru modelu — kontrast bge-m3 vs reszta był miażdżący (MRR 1,00 vs 0,34 vs 0,25).
Ale do **strojenia progu `RAG_MIN_SCORE`** (redline 8, dostrojenie po Sesji 5) przyda się
większy, bardziej zróżnicowany zbiór — także zapytania spoza bazy, żeby sprawdzić, czy
próg poprawnie zwraca `noResults` zamiast losowego fragmentu.
_Warunek sensu:_ przed Sesją 5, gdy dostrajasz próg na realnych dokumentach.

**RLS + konta + izolacja.** Baza AIDEAS ma dziś RLS wyłączony (potwierdzone w Sesji 0 —
ostrzeżenia „RLS Disabled in Public" na tabelach produkcyjnych). Jedynym zabezpieczeniem
danych jest to, że klucz service_role nie wychodzi do przeglądarki (architektura
trójwarstwowa, sekcja 3). To wystarcza do użytku wewnętrznego, ale NIE do publicznego
wystawienia. Przed udostępnieniem na zewnątrz: konta użytkowników, włączenie RLS,
izolacja kolekcji per użytkownik/organizacja.
_Warunek sensu:_ bezwzględnie przed jakimkolwiek publicznym wystawieniem aplikacji.
To nie jest „miłe do zrobienia" — to warunek bezpieczeństwa danych.

---

## 18. Kontrakt integracji z AIDEAS — tryby wiedzy agenta

Ta sekcja opisuje, jak agent w AIDEAS korzysta z wiedzy po wpięciu RAG. Jest
wymaganiem na projekt rdzenia (sekcja 9) i pola `external_ref` (sekcja 7), nie
zadaniem do wykonania teraz. Nie łamie zasad granicy (sekcja 3): rdzeń RAG nadal
nie wie nic o „agencie", „plikach agenta" ani trybach — cała logika trybów żyje
po stronie AIDEAS.

Agent w AIDEAS ma jedno pole **„tryb wiedzy"** o trzech wartościach:

- **Tryb 1 — tylko pliki doklejane.** Obecny mechanizm AIDEAS: pełna treść plików
  wstrzykiwana do promptu (limit ~24 000 znaków). Bez RAG. Zostaje bez zmian.
- **Tryb 2 — tylko RAG.** Agent korzysta wyłącznie z jednej podpiętej kolekcji;
  do promptu trafiają wyszukane fragmenty, nie pełna treść.
- **Tryb 3 — RAG + pliki.** Fragmenty z kolekcji RAG **oraz** pełny tekst plików
  doklejanych po starej ścieżce AIDEAS. Kontekst = wynik wyszukiwania + doklejone
  pliki.

### 18.a MODEL POWIĄZANIA — DECYZJA: konto → kolekcja, agent wybiera podzbiór

**Wybrane 29.07.2026.** `external_ref` kolekcji wskazuje na **konto**, nie na projekt
i nie na agenta. Agent trzyma u siebie listę `documentIds` i podaje ją przy wyszukiwaniu.

| wariant | dlaczego nie |
|---|---|
| projekt → kolekcja | idzie pod prąd migracji 015, która wyjęła wiedzę spod projektu |
| agent → kolekcja | dwaj agenci z tymi samymi dokumentami indeksują je **dwa razy** — przy Kodeksie pracy ~1,5 h maszyny i podwójne wektory za drugą kopię |
| **konto → kolekcja + podzbiór** | odwzorowuje AIDEAS po 015 (magazyn należy do konta, agent wskazuje pliki), **indeksowanie płacone raz** |

**Granica z sekcji 3 zostaje nienaruszona: RAG nie wie o agentach nic.** Dostaje listę
identyfikatorów dokumentów i tyle — kto ją złożył i dlaczego, jest sprawą AIDEAS.

**Technicznie nic nie blokuje** (sprawdzone, nie założone): `searchCollection` przyjmuje
`documentIds`, obie funkcje RPC — `rag_search_chunks` i `rag_search_chunks_text` — mają
`p_document_ids uuid[] default null` z warunkiem `(p_document_ids is null or
c.document_id = any (p_document_ids))`, a dwa testy w `search.test.js` sprawdzają, że
parametr **dociera do RPC**, nie tylko że funkcja go przyjmuje.

> #### ⚠ WARUNEK I1: BRAK LISTY ZNACZY „NIE SZUKAJ", NIE „SZUKAJ WE WSZYSTKIM"
>
> Dziś `documentIds = null` znaczy „cała kolekcja" i przy modelu **agent → kolekcja**
> było to poprawne. Przy modelu **konto → kolekcja** ta sama wartość znaczy coś zupełnie
> innego: **agent bez wybranej wiedzy dostałby cały magazyn konta.**
>
> Rozstrzygnięcie ma nastąpić **w warstwie AIDEAS albo w kontrakcie wywołania**, nie
> przez zmianę semantyki `null` w rdzeniu — rdzeń nie wie, czy pytający jest agentem.
> Kandydat: pole wymagane po stronie AIDEAS, a pusta lista → nie wołamy RAG w ogóle.
>
> **Nie zmieniać teraz. To warunek do spełnienia przy I1.**

_Do zapamiętania na później, bo za rok kogoś zaskoczy:_ dziś filtrowanie po dokumentach
jest **szybsze** niż jego brak, bo indeksu wektorowego celowo nie ma (7.2) i `ORDER BY
embedding <=> $1` skanuje sekwencyjnie — filtr zawęża zbiór PRZED sortowaniem. Gdyby
kiedyś doszedł `hnsw` (SPEC przewiduje go powyżej ~50 000 fragmentów), **sytuacja się
odwraca**: filtr po `document_id` przy indeksie ANN to klasyczny problem **pre- kontra
post-filtering** — indeks zwraca k najbliższych z całego zbioru, a filtr może z nich
zostawić zero. Wtedy trzeba to zmierzyć osobno i być może budować indeks per kolekcja
albo schodzić do skanu przy wąskim filtrze. **Dziś to nie jest problem i nie wolno tego
mylić z „nigdy nie będzie".**

### 18.0 AKAPIT DO PROMPTU AGENTA — gotowy do wklejenia przy I2

**Obowiązkowy w trybie 2 i 3.** Wynika wprost z granicy modułu opisanej w 11.0: moduł RAG
nie umie odróżnić „blisko tematycznie" od „odpowiada na pytanie" i **nigdy nie będzie
umiał**. Tę decyzję podejmuje model odpowiadający — poniższy akapit jest jedynym
miejscem, w którym to się dzieje.

```text
Fragmenty dokumentów poniżej zostały wybrane przez wyszukiwanie po PODOBIEŃSTWIE
ZNACZENIOWYM do pytania. Oznacza to, że mogą dotyczyć tego samego zagadnienia,
ale INNEGO PODMIOTU niż ten, o który pyta użytkownik — innego leku, innej ustawy,
innego urządzenia, innej instytucji prawnej.

Zanim odpowiesz, sprawdź dla każdego fragmentu, czy mówi o TYM, o co pyta
użytkownik, a nie tylko o tej samej KLASIE spraw.

Jeśli żaden fragment nie dotyczy pytanego podmiotu — powiedz wprost, że dokumenty
tego nie obejmują. NIE odpowiadaj przez analogię i nie przenoś ustaleń z jednego
podmiotu na drugi, nawet jeśli wyglądają na pokrewne. Możesz wskazać, co
dokumenty faktycznie zawierają, jeśli to pomocne.

Odpowiadając, cytuj nazwę pliku i stronę z metadanych fragmentu.
```

**Dwa przykłady z pomiarów, które tłumaczą to lepiej niż reguła** — warto zostawić je
w komentarzu przy prompcie, żeby nikt go nie skrócił jako oczywistości:

| pytanie użytkownika | co zwróciło wyszukiwanie | score |
|---|---|---|
| „jakie są działania niepożądane **amoksycyliny**" | działania niepożądane **lenalidomidu** | **0,6433** |
| „jaki jest termin przedawnienia roszczeń z tytułu **rękojmi**" | przedawnienie roszczeń **ze stosunku pracy**, art. 291 K.p. | **0,6275** |

W obu przypadkach **oba dokumenty są poprawne, wyszukiwanie zadziałało poprawnie,
a odpowiedź bez tego akapitu byłaby konfabulacją.** Score przewyższa tam siedem z dziesięciu
pytań, na które korpus ma prawdziwą odpowiedź — czyli żaden próg tego nie odetnie
(11.0, 11.1e).

**Zasady wynikające z tego modelu:**

1. **Jeden agent = jedna kolekcja RAG.** Powiązanie realizuje POJEDYNCZY
   `external_ref` (nie lista). W trybach 2 i 3 agent wskazuje dokładnie jedną
   kolekcję.
2. **Tryb 3 łączy DWA źródła, ale drugim źródłem NIE jest druga kolekcja RAG** —
   jest nim plik doklejany po stronie AIDEAS. RAG nadal obsługuje tylko jedną
   kolekcję.
3. **Składanie kontekstu (który zależy od trybu) realizuje AIDEAS, nie rdzeń RAG.**
   Rdzeń udostępnia wyłącznie czyste „wyszukaj fragmenty w tej kolekcji"; to, czy
   AIDEAS dołoży do nich doklejane pliki, jest poza wiedzą RAG.
4. **Limit ~24 000 znaków NIE znika** — dotyczy odtąd wyłącznie plikowej części
   trybów 1 i 3. RAG go nie likwiduje, bo z nim współistnieje (świadoma decyzja:
   elastyczność trzech trybów kosztem jednego mechanizmu).

**Konsekwencja dla API rdzenia (sekcja 9):** funkcja wyszukiwania musi działać na
pojedynczej kolekcji i być niezależna od tego, jak AIDEAS potem komponuje kontekst.
Żadna wiedza o trybach ani o plikach doklejanych nie wchodzi do `lib/rag/`.
