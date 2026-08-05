# RAG w AIDEAS — jak to jest złożone

Dokument dla kogoś, kto wraca do tego kodu po pół roku. Opisuje stan **po
zakończeniu integracji**, nie historię decyzji — ta jest w komunikatach commitów
na gałęzi `feature/rag-rdzen`.

Specyfikacja samego modułu: `docs/rag-SPEC.md`. Ten plik opisuje **styk** modułu
z AIDEAS.

---

## Co gdzie leży

| katalog | zawartość | uwagi |
|---|---|---|
| `lib/rag/` | rdzeń: kolekcje, dokumenty, cięcie, embeddingi, wyszukiwanie, pojęcia | 18 modułów + 17 plików `*.test.js`. **Nie zna Reacta, Next.js ani `window`** (SPEC sekcja 3) |
| `lib/mapview/` | czysta geometria widoku mapy i grafu | 5 modułów + 4 testy. Świadomie POZA `lib/rag/` |
| `app/api/rag/` | 17 tras HTTP + `_lib/http.js`, `_lib/klientSesji.js` | cienka warstwa: walidacja → rdzeń → odpowiedź |
| `app/kreator-rag/` | panel: diagnostyka, kolekcje, mapa fragmentów, graf wiedzy | 13 plików, własny `kreator-rag.module.css` |
| `lib/tools/rag_search.js` | narzędzie agenta | jedyne miejsce, gdzie czat spotyka RAG |
| `components/creator/sections/RagSection.js` | sekcja kreatora agenta | włącznik + wybór kolekcji; **własna karta, między „Bazą wiedzy" a „Narzędziami"** |
| `supabase/rag/` | 9 skryptów SQL modułu (schemat, funkcje) | uruchamiane ręcznie, **nie** przez migracje AIDEAS |
| `supabase/016..019` | migracje styku | opis niżej |
| `scripts/` | narzędzia z konsoli + `zestawy/nordwind.json` | patrz „Skrypty" |
| `docs/rag-SPEC.md` | specyfikacja modułu | z notami po wdrożeniu przy dwóch miejscach |

---

## Model powiązania

**Agent wskazuje jedną kolekcję.** Kolumna `agents.rag_collection_id` (uuid,
nullable, **bez klucza obcego**). `NULL` = agent nie korzysta z RAG.

Zakresem wyszukiwania jest **cała** kolekcja — `documentIds` przekazywane do
rdzenia jest zawsze `null`. Wyboru podzbioru dokumentów nie ma: kolekcja **jest**
jednostką organizacyjną, więc dzielenie jej w kreatorze agenta znaczyłoby, że
użytkownik utrzymuje ten sam podział w dwóch miejscach.

**Baza wiedzy i Kreator RAG to dwa osobne narzędzia.** Baza wiedzy dokleja pliki
do promptu w całości; Kreator RAG ma własne kolekcje i własne wgrywanie. Żaden
plik nie żyje w obu miejscach naraz.

### Dlaczego bez klucza obcego

Granica z sekcji 3 SPEC działa **w obie strony**. Moduł RAG ma zakaz kluczy obcych
do tabel AIDEAS — i konsekwentnie tabele AIDEAS nie wiążą się kluczem z `rag_*`.
Powód jest ten sam po obu stronach: oba zbiory mają dać się wdrożyć, zmigrować
i skasować osobno. Klucz obcy zamieniłby „dwa moduły w jednej bazie" w „jeden
schemat".

### Konsekwencja: wskazania osierocone

Skasowanie kolekcji, na którą wskazuje agent, **nie robi nic** — nikt tego nie
pilnuje. `rag_collection_id` zostaje z identyfikatorem, którego już nie ma.

Objaw jest łagodny i to nie przypadek: narzędzie sięga po kolekcję klientem
z sesją, więc RLS zwraca brak wiersza tak samo dla kolekcji **skasowanej**, jak
dla **cudzej**. Agent mówi wtedy, że kolekcja jest niedostępna — nie milczy
i nie zgaduje.

Kaskady nie ma **świadomie**: to pytanie produktowe, nie schematowe. Skasowanie
kolekcji używanej przez pięciu agentów powinno przede wszystkim **zapytać**.
Propozycja rozwiązania (modal z listą agentów, potem jawny update) jest w nagłówku
`supabase/019_agent_kolekcja.sql`. **Niezaimplementowana.**

---

## Trzy tryby wiedzy i czym się przełączają

Przełącznikiem jest **`agents.tools`** — żadnej dodatkowej kolumny, żadnej migracji.

W kreatorze agenta obsługuje to **osobna karta „RAG"**, stojąca przy „Bazie wiedzy",
a nie w „Narzędziach": obie karty odpowiadają na to samo pytanie — skąd agent bierze
treść dokumentów — i różnią się tylko sposobem (doklejanie vs wyszukiwanie).
Konsekwencja dla kodu: `agents.tools` jest **wspólną** kolumną dwóch kart, więc
zdjęcie jednej z nich nie może czyścić całej tablicy (`MasterDetailCreator.removeParameter`).

| tryb | konfiguracja | co dostaje model |
|---|---|---|
| **1 — pliki w prompcie** | `knowledge_mode: 'selected'`, bez `rag_search` | pełna treść wskazanych plików, limit 24 000 znaków |
| **2 — retrieval** | `knowledge_mode: 'none'`, `tools: ['rag_search']` + kolekcja | fragmenty zwrócone przez wyszukiwanie, z nazwą pliku i stroną |
| **3 — oba naraz** | `knowledge_mode: 'selected'` **i** `rag_search` | jedno i drugie |

Tryb 3 jest świadomy — **nie ma żadnego `if`-a wykluczającego** `buildKnowledgeBlock`.

> **Uwaga praktyczna.** W trybie 3 treść pliku jest już w prompcie, więc model
> często **nie widzi potrzeby** wołania `rag_search` i odpowiada z doklejonego
> tekstu. Przy małym pliku nieszkodliwe; przy dużym oznacza, że retrieval nie
> ruszy, dopóki treść mieści się w limicie.

### Akapit o szumie bliskim

Gdy agent ma `rag_search`, do promptu wchodzi akapit ze SPEC 18.0 (sekcja
`rag_szum` w `lib/agent/systemPrompt.js`, między `knowledge` a `web_search`).

Jest cytowany **znak w znak** — 764 znaki, 14 linii. Nie parafrazować przy
refaktorach: to kontrakt, nie sugestia stylistyczna. Zgodność da się sprawdzić
programowo, porównując literał z blokiem ` ```text ` w SPEC 18.0.

**Po co:** moduł RAG nie umie odróżnić „blisko tematycznie" od „odpowiada na
pytanie" i nigdy nie będzie umiał. Podnoszenie `RAG_MIN_SCORE` **nie jest
alternatywą** — pomiary w SPEC pokazują szum bliski o score 0,6275 i 0,6433,
wyżej niż siedem z dziesięciu pytań, na które korpus ma prawdziwą odpowiedź.

---

## Klient bazy — najważniejsza decyzja styku

Rdzeń przy braku `deps.client` sięga po `getSupabaseClient()`, czyli klucz
**`service_role` z `BYPASSRLS`**.

**Warstwa HTTP tego nie robi.** Wszystkie 17 tras budują klienta z sesją
(`app/api/rag/_lib/klientSesji.js`) i wstrzykują go przez `deps.client`. Dzięki
temu RLS dokleja `owner_id = auth.uid()` do każdego zapytania, a błąd w wyliczeniu
`collectionId` kończy się pustym wynikiem, a nie cudzymi danymi. **Izolacja stoi
na bazie, nie na poprawności kodu.**

Narzędzie `rag_search` dostaje ten sam klient przez `ctx.db` — tworzony **raz**
w `app/api/chat/route.js`, zanim ruszy strumień. Nie może zbudować go sobie samo:
`createClient()` czyta ciasteczka przez `cookies()` z `next/headers`, co działa
wyłącznie w kontekście żądania, a narzędzia wykonują się w pętli tool-use, już po
zwróceniu strumienia.

`getSupabaseClient()` **zostaje** — jako ścieżka dla skryptów z konsoli.

### `ctx` narzędzi

`{ user, agent, db, sources }` — pełny kontrakt opisany w `lib/tools/calculator.js`
(celowo tam: to najkrótsze narzędzie, czyta się je jak szablon).

- `ctx.user` — z sesji, zweryfikowane przez `getUser()`. **Jedyne** pole, na
  którym wolno oprzeć decyzje o dostępie.
- `ctx.agent` — od klienta, **niezaufany**. Tylko do wyboru zakresu. Przy rozmowie
  z gołym modelem **nie ma pola `id`**.
- `ctx.sources` — narzędzie **dopisuje** (`push`), nigdy nie podmienia tablicy:
  dostawca trzyma do niej referencję.

---

## Migracje

| plik | co robi | uruchomione |
|---|---|---|
| `016_rls_rag.sql` | `owner_id` + RLS na 6 tabelach `rag_*`, polityki `rag_<tabela>_wlasne`, `execute` dla `authenticated` na 5 funkcjach, polityka bucketu `rag-files` | tak |
| `017_rls_rag_storage_fix.sql` | poprawka polityki bucketu — `objects.name` zamiast `name` | tak |
| `018_rag_integracja.sql` | `rag_documents.external_ref`, `heading_path` w indeksie FTS, `revoke` dla `anon` | tak |
| `019_agent_kolekcja.sql` | `agents.rag_collection_id` + indeks częściowy | tak |
| `021_embed_provider.sql` | `rag_collections.embed_provider` (`not null`, domyślnie `ollama`), wypełnienie istniejących wierszy, dopiero potem zacieśnienie do `not null` | tak |

**`016` nie da się uruchomić ponownie** — jego warunek wstępny przerywa migrację,
gdy tabele `rag_*` nie są puste. Dlatego poprawka polityki poszła osobnym plikiem.

**`rag_documents.external_ref` (018) jest dziś NIEUŻYWANE.** Zostało po wycofanym
modelu „plik z Bazy wiedzy indeksuje się do kolekcji konta". Migracji kasującej
świadomie nie ma: nieużywana kolumna nie robi nic, dopóki ktoś jej nie wypełni,
a jej usunięcie byłoby nieodwracalne.

**`heading_path` w FTS (018)** naprawiło zapytania o numer paragrafu. Założenie
z `session-hybrid-search.sql` („numer artykułu siedzi w treści") jest prawdziwe
dla Kodeksu i **fałszywe** dla dokumentów z numeracją w nagłówkach — regulaminów,
umów, norm. Zmierzone: fragmentów z „§ ⟨liczba⟩" w **treści** — 0 ze 108.

---

## Wyniki pomiaru

Zestaw kontrolny: `scripts/zestawy/nordwind.json`. Agent w trybie 2, anthropic
`claude-haiku-4-5`, `temperature 0.2`, każde pytanie w **osobnej** rozmowie.

### Runda 10 — 24 pytania

```
fałszywy alarm   (odmówił, choć odpowiedź była)          0 / 10
przeoczenie      (odpowiedział, choć odpowiedzi nie było) 0 / 14
poprawna odmowa  (nie było i powiedział to wprost)       14 / 14
```

Trafienia: **10/10** we właściwy paragraf. Szum daleki: **8/8** odmów, narzędzie
ani razu nie wołane. Szum bliski: **6/6 przeszło próg 0,45** (top score
0,4829–0,6058) — każda odmowa to zasługa akapitu, nie progu.

Punkt odniesienia: w samej warstwie wyszukiwania było **25%** poprawnych odmów.

### Runda 11 — identyfikatory

Pytanie samym `§ 45` dawało **1/4** — model prosił o doprecyzowanie zamiast
wyszukać. Po dopisaniu reguły („odwołanie do jednostki redakcyjnej JEST pytaniem
kompletnym") — **4/4**, każdy przekazany dosłownie.

Regresja czysta: 3/3 trafień, 3/3 odmów, rachunek nadal idzie do kalkulatora.

### Czego te liczby nie mówią

Że tak będzie zawsze. 24 pytania to za mało na ocenę stabilności, a każde
uruchomienie to osobne losowanie. **Kryterium alarmu** przy kolejnym przebiegu
jest zapisane w `nordwind.json`: różnica o jedno pytanie nie jest regresją; alarm
dopiero poniżej 12/14 albo przy **jakimkolwiek przeoczeniu**.

---

## Pułapki, które kosztowały rundę

Cztery rzeczy, na których ta integracja się potknęła. Każda ma wspólną cechę:
**objaw nie wskazywał na przyczynę**.

### 1. `split_part(c.name)` zamiast `split_part(objects.name)`

Polityka RLS bucketu miała w podzapytaniu samo `name`. Postgres rozstrzyga nazwę
w **najbliższym zakresie**, a tam stał alias `c` (czyli `rag_collections`, które
**ma własną kolumnę `name`** — nazwę kolekcji). Warunek znaczył „id kolekcji =
pierwszy segment nazwy kolekcji" i był zawsze fałszywy.

Składnia bez zarzutu, zero ostrzeżeń z Postgresa, a objaw to `new row violates
row-level security policy` — **identyczny** z brakiem uprawnień. Diagnoza szła
w stronę kluczy i sesji.

> **Reguła:** w polityce RLS z podzapytaniem do innej tabeli **kwalifikuj kolumny
> tabeli chronionej**. `objects.name` nie da się pomylić; `name` — owszem.

### 2. `FULL_COLUMNS` bez nowej kolumny

`lib/data/agents.js` ma listę kolumn używaną **i do odczytu, i do `.select()` po
zapisie**. `rag_collection_id` trafiło do `stateAgentToDbPatch`, ale nie na tę
listę — zapis przechodził, a wartość nigdy nie wracała.

Maskowało to `tools`: przełącznik narzędzia utrzymywał się poprawnie, więc objaw
wyglądał na „zapisuje się połowicznie", a nie na brakującą kolumnę w `SELECT`.

> **Reguła:** dokładając kolumnę agenta, dopisz ją w **trzech** miejscach —
> `initialState`, `agentMapping` (obie strony), `FULL_COLUMNS`.

### 3. Podgląd fragmentów ucięty do 240 znaków

Budując zestaw kontrolny, sprawdzałem tematy w `preview` z `/chunks`. To pole jest
**ucięte**. `§ 96` w podglądzie kończy się na „Uzyskanie oceny końcowej 4,5 lub
wyższ…", a dalszy ciąg mówi wprost o nagrodzie uznaniowej.

Cztery z ośmiu pytań „szumu bliskiego" trafiły w tematy **obecne** w dokumencie.
Bez weryfikacji zaraportowałbym dwa przeoczenia, które przeoczeniami nie są.

> **Reguła:** do sprawdzania obecności treści używaj pola `content` z wyszukiwania,
> nie `preview` z `/chunks`.

### 4. `_zrodlo-rag` liczone podwójnie

`node --test` skanuje całe drzewo. Dopóki katalog źródłowy modułu leżał w repo,
każdy plik testowy był liczony dwa razy: **842 testy zamiast 417**. To samo
z `eslint` — 31 błędów zamiast 5, bo ESLint 9 nie czyta `.gitignore`.

> **Reguła:** liczby z `npm test` i `npm run lint` są prawdziwe tylko wtedy, gdy
> w drzewie nie ma kopii kodu. Przy wątpliwości: `find . -name "*.test.js" -not
> -path "./node_modules/*"`.

---

## Skrypty

W `scripts/`: `_env.mjs` (wczytanie `.env.local`), cztery diagnostyczne
(`diag-margines`, `diag-prog`, `diag-kondycja`, `diag-sieroty`) i trzy robocze
(`uruchom-pojecia`, `uruchom-normalizacje`, `kopia-pojec`).

**Granica biegnie po rodzaju operacji, nie po skrypcie.** Pod `service_role`
`auth.uid()` jest `NULL`, a `owner_id` ma `NOT NULL`:

- **`insert` PADA** — `uruchom-pojecia` (na pierwszej partii, **po** policzeniu
  pojęć przez model, czyli po najdroższej części pracy), `kopia-pojec` przy
  **odtwarzaniu** kopii.
- **`select`, `update`, `delete` działają** — cała diagnostyka,
  `uruchom-normalizacje`, `kopia-pojec` przy zrzucie.

Nienaprawione. Kierunki: podawać `owner_id` jawnie z argumentu, albo logować
skrypt jako użytkownika.

---

## Embeddingi przez OpenRouter

Cykl RAG-embed (rundy 0–5). Do tej pory moduł liczył wektory wyłącznie lokalną
Ollamą — czyli aplikacja postawiona na serwerze albo pokazywana zdalnie nie
działała wcale. Po cyklu wybór drogi zapada **przy zakładaniu kolekcji**
i zostaje z nią na stałe.

### Zasada: kolekcja jest źródłem prawdy dla własnego embedowania

Para `(embed_provider, embed_model)` zapisana w wierszu kolekcji **napędza**
trzy miejsca:

| miejsce | co robi parą kolekcji |
|---|---|
| `lib/rag/documents.js` — `embedNextBatch` | liczy wektory fragmentów |
| `lib/rag/search.js` — `searchCollection` | liczy wektor zapytania |
| `lib/rag/concepts.js` — `extractConceptsForDocument` | liczy wektory etykiet pojęć |

Mapowanie mieszka w jednym miejscu: `embedConfigDlaKolekcji` w
`lib/rag/embedding.js`. Bierze parę z kolekcji, resztę — partię, prefiksy, adres
Ollamy, klucz OpenRoutera — ze środowiska, bo to właściwości maszyny, a nie
wyboru użytkownika.

> **`RAG_EMBED_PROVIDER` i `RAG_EMBED_MODEL` są DOMYŚLNYMI DLA NOWYCH kolekcji.
> Nie sterują istniejącymi.** Kolekcja chmurowa indeksuje się i przeszukuje przez
> OpenRoutera także wtedy, gdy serwer stoi na `ollama` — i odwrotnie.

**Zmierzone obok siebie**, przy jednej konfiguracji serwera (`RAG_EMBED_PROVIDER=ollama`),
z podsłuchem globalnego `fetch`, oba wyszukiwania w jednym `Promise.all`:

```
hosty dotknięte w tym samym oknie: localhost:11434 + openrouter.ai
LOKALNA top=0.6451  › § 99. Kotwica pomiarowa rundy 3
CHMURA  top=0.6451  › § 99. Kotwica pomiarowa rundy 3
```

### Dlaczego pojęcia też idą z pary kolekcji

Wektory pojęć porównuje się wyłącznie **między sobą**, nigdy z wektorami
fragmentów — więc pytanie „czy mogą zostać na konfiguracji serwera" było realne.
Nie mogą, z dwóch powodów:

1. **`rag_concepts` ma `collection_id`.** Przestrzeń wektorowa pojęć jest per
   kolekcja, nie globalna. Kolekcja przerobiona raz przy jednym, raz przy drugim
   ustawieniu serwera dostałaby w jednej kolekcji wektory z dwóch dróg.
2. **Obietnica kolekcji chmurowej.** Bez tego dokument zaindeksowałby się przez
   OpenRoutera, a pojęcia wywróciłyby się na `ollama_unavailable`. Kolekcja
   działająca w połowie jest gorsza od niedziałającej — awaria wychodzi dopiero
   przy mapie pojęć.

Model **pojęć** (czatowy, ten wymyślający etykiety) zostaje na przypisaniach
konta. Kolekcja pamięta parę embeddingów, nie model językowy.

### `baai/bge-m3` to ten sam plik wag co lokalny

Zmierzone (runda 0), nie założone — pięć prawdziwych fragmentów, ta sama treść
policzona obiema drogami:

```
cosinus lokalny ↔ chmurowy        0,999987 – 0,999993
kontrola negatywna (dwa różne
fragmenty tą samą drogą)          0,389
wymiar                            1024 z obu stron
```

Kontrola negatywna jest tu istotna: bez niej „0,9999" nie dowodziłoby niczego
poza tym, że metryka w ogóle działa. Konsekwencja praktyczna: **próg
`RAG_MIN_SCORE = 0,45` obowiązuje bez zmian niezależnie od wyboru**, a wybór
dotyczy DROGI, nie jakości. Potwierdzone niezależnie w rundzie 3 — obie kolekcje
zwróciły identyczny top score `0.6451`.

**Dokładanie kolejnych modeli do oferty wymaga POMIARU, nie tylko wpisu**: inny
model to inna skala podobieństw, czyli próg do dostrojenia od nowa
(`scripts/diag-prog.mjs`).

### Prędkość: transport 4,5×, pełna ścieżka ~3×

Ten sam plik, 193 fragmenty, 7 partii po 32, pełna ścieżka HTTP → trasa → rdzeń
→ transport. Dwie serie w odwróconej kolejności, żeby wykluczyć rozgrzewkę:

| seria | ollama | openrouter | iloraz |
|---|---|---|---|
| 1 (lokalna pierwsza) | 114 911 ms (595,4 ms/fr.) | 37 022 ms (191,8 ms/fr.) | **3,10×** |
| 2 (chmurowa pierwsza) | 110 120 ms (570,6 ms/fr.) | 38 609 ms (200,0 ms/fr.) | **2,85×** |

Runda 0 zmierzyła na samym transporcie **4,5×**. Przez pełną ścieżkę zysk jest
o jedną trzecią mniejszy i **to nie jest sprzeczność** — różnicę rozcieńcza to,
co obie drogi mają wspólne: **193 osobne `UPDATE`-y wektorów do Supabase**,
jeden na fragment. Kto planuje na podstawie liczby z transportu, przeszacuje.

### Strażnik: co zostało, a co zniknęło

**Zniknęło** `niezgodnoscModelu()` — porównanie pary kolekcji z konfiguracją
serwera. Straciło sens w chwili, w której kolekcja zaczęła napędzać własnego
dostawcę: „kolekcja mówi `openrouter`, serwer `ollama`" nie jest już
niezgodnością, tylko normalną sytuacją, i to dokładnie tą, dla której cały cykl
powstał.

**Zostało** `nieobslugiwanaPara()` — jedyne pytanie, na które odpowiedź dalej
brzmi „nie da się": czy rdzeń **umie zbudować** dostawcę zapisanego w kolekcji.
`openai` i `voyage` to od Sesji 4 zaślepki. Odmowa (`model_mismatch`) idzie
**przed** zmianą statusu dokumentu, więc nie zostawia go w martwym `embedding`.

**Rdzeń NIE porównuje modelu z ofertą aplikacji.** Oferta
(`lib/config/modeleEmbeddingow.js`) to warstwa AIDEAS, a granica z sekcji 3 SPEC
działa w obie strony. Pilnuje jej **trasa przy zakładaniu**
(`app/api/rag/collections/route.js`) — jedyne miejsce, gdzie ma to sens, bo po
zapisie nikt pary już nie zweryfikuje wobec listy. Praktyczna konsekwencja:
kolekcja na `ollama/mxbai-embed-large` sprzed cyklu jest spoza dzisiejszej
oferty, a napędzana własną parą **działa poprawnie** — odmowa byłaby regresją.

### Dwa etapy Kreatora: indeksowanie wymagane, pojęcia opcjonalne

Widok kolekcji pokazywał dwa paski postępu obok siebie — wektory i pojęcia —
i nic nie mówiło, że drugi jest opcjonalny. **Agent korzysta wyłącznie
z wektorów.** Pomiar 14/14 z rundy 10 (wyżej w tym dokumencie) zrobiono na
kolekcji, w której główny dokument miał **0/107 pojęć**.

Po zmianie: pasek etapów u góry widoku, etap 1 „Indeksowanie" oznaczony jako
**wymagany**, etap 2 „Pojęcia i graf" jako **opcjonalny** i nieosiągalny, dopóki
etap 1 nie jest gotowy (`inert`, nie sam `opacity` — inaczej przyciski zostają
osiągalne Tabem). Etap 1 kończy się komunikatem **„Kolekcja gotowa dla agenta"**
wraz z miejscem, w którym tę kolekcję wskazać.

Reguła ukończenia mieszka w `app/kreator-rag/_lib/etapy.js` — czysta funkcja,
poza Reactem, 17 testów. Etap 2 jest ukończony **dopiero przy komplecie pojęć we
wszystkich zindeksowanych dokumentach**; próg „cokolwiek" kazałby kolekcji TEST
ogłosić się ukończoną przy 8 pojęciach na 107.

**Wybór modelu do pojęć obowiązuje tylko na to jedno wywołanie** i nie zapisuje
się w przypisaniach konta: zasięg kontrolki musi zgadzać się z zasięgiem skutku,
a ta stoi w widoku jednej kolekcji. Domyślna wartość pochodzi z roli
`rag_pojecia`. Zmierzone: przebieg poszedł na `openrouter/anthropic/claude-haiku-4.5`,
a przypisanie po nim dalej wskazywało `ollama/mistral-nemo`.

### Weryfikacja końca do końca — bez Ollamy

Pełny przebieg na kolekcji `openrouter/baai/bge-m3`: założenie → 193 fragmenty →
indeksowanie → „Kolekcja gotowa dla agenta" → wskazanie agentowi → pytanie
z dokumentu (odpowiedź z cytowaniem pliku i ścieżki nagłówkowej) → pytanie spoza
dokumentu (**odmowa**, mimo że model zna odpowiedź z kodeksu pracy).

Połączenia TCP do `:11434` przez cały przebieg: **zero w oknie indeksowania
i zero przez 7 min 40 s pracy agenta**. Jedyne trafienia to dwa impulsy po ~3 s
przy wejściu na strony Kreatora RAG — sonda diody diagnostyki
(`PrzyciskDiagnostyki` → `/api/rag/status` → `checkOllama`). To pomiar zdrowia,
nie ścieżka indeksowania ani wyszukiwania.

### Otwarte po cyklu RAG-embed

1. **`documents.js` nie mapuje błędu wymiaru pgvectora na `dim_mismatch`.**
   `throwDb` zna tylko `22P02`, więc rozjazd wymiaru przy zapisie wektora poleci
   surowym `internal` z komunikatem Postgresa. Dziś nie boli, bo **oba modele
   oferty mają 1024** — zaboli przy pierwszym modelu o innym wymiarze.
   `search.js` taką gałąź ma (`throwRpc`), `documents.js` nie.
2. **Znacznik „na żywo" nie pojawia się przy dokumencie mieszczącym się w jednej
   partii.** Jedyna partia ma `finished: true`, więc nie ma czego oznaczać —
   całość trwa ~4 s. Zmierzone: 0/30 próbek przy 7 fragmentach. Świadomie bez
   sztucznego minimalnego czasu wyświetlania: udawanie stanu, którego nie ma,
   jest gorsze niż jego brak.
3. **Dioda diagnostyki świeci na czerwono przy wyłączonej Ollamie, choć kolekcje
   chmurowe działają.** `checkOllama` nie wie nic o parach kolekcji. Do decyzji
   produktowej: czy dioda ma mierzyć środowisko, czy zdatność do pracy.
4. **Wyciąganie pojęć nie miało pokrycia testowego na ścieżce produkcyjnej.**
   `ReferenceError` w `concepts.js` (brak importu `embedConfigFromGlobal`) żył od
   rundy 1 i **żaden test go nie widział**, bo wszystkie wstrzykują
   `deps.provider`. Naprawione, ale luka w pokryciu została.
5. **Oferta ma dwie pozycje i obie są tym samym plikiem wag.** Pierwszy naprawdę
   inny model wymaga przemierzenia progu — patrz akapit o równoważności wyżej.

---

## Motyw jasny Kreatora RAG

Kreator RAG był jedyną zakładką w motywie ciemnym — moduł powstał jako osobna
aplikacja. Przestylowanie na jasny (gałąź `feature/rag-jasny-motyw`, dwie rundy)
nie zmieniło ani jednej linii rachunku; zmieniło wyłącznie warstwę wyglądu.

### Gdzie siedzą kolory — cztery miejsca, nie jedno

**Canvas nie czyta zmiennych CSS.** `ctx.fillStyle` przyjmuje gotową wartość,
a `var(--tekst)` jest dla niego napisem bez znaczenia; nie ma tam kaskady ani
dziedziczenia. Sprawdzone: w całym `app/kreator-rag/` **nie ma ani jednego
`getComputedStyle`**, więc nic nie mostkuje CSS do płótna.

Konsekwencja, od której zaczyna każdy, kto będzie ruszał motyw: **przemalowanie
`.panel` w `kreator-rag.module.css` nie zmieni ani jednego piksela mapy i grafu.**

| co | gdzie | uwaga |
|---|---|---|
| kolory płótna mapy | `MapaFragmentow.jsx`, stała `PALETA` na górze pliku | 8 pól: `siatka`, `podpis`, `wyroznienie`, `obrysPodpisu`, `przygaszony`, `most`, `fallback` |
| kolory płótna grafu | `GrafWiedzy.jsx`, stała `PALETA` | ten sam zestaw pól i te same wartości |
| kolory interfejsu (panele, karty, przyciski) | `kreator-rag.module.css`, zmienne w `.panel` | `--tlo`, `--karta`, `--obwod`, `--tekst`, `--przygaszony`, `--ok`, `--blad`, `--nieznane` |
| **paleta dokumentów** | `lib/rag/map.js:33-36` | eksportowana przez `kolorDokumentu()`, wspólna dla mapy i grafu (`graph.js:140`) |
| kolor zastępczy fragmentu | `lib/mapview/edges.js`, stała `ZASTEPCZY` | `#71717a`, musi się zgadzać z `PALETA.fallback` w obu komponentach |

Ani `PALETA`, ani zmienne `.panel` nie mają pola na tło płótna: płótna są
**przezroczyste**, tło daje `.mapa-obudowa`. Graf malował kiedyś własny gradient
i był przez to jedynym widokiem, którego tła nie dało się zmienić z CSS —
zastąpione przez `ctx.clearRect` (samo usunięcie `fillRect` nie wystarczy: przy
przerysowaniu w tym samym rozmiarze przeglądarka nie czyści płótna sama i węzły
zostawiają smugi).

### Kryteria doboru palety dokumentów

Poprzedni zestaw powstał pod tło `#0f1115` i na białym przestał działać: **osiem
z dziesięciu kolorów schodziło poniżej kontrastu 3:1** (najgorszy `#8fce00` = 1,83;
`#d1a53a` = 2,20; `#ff8b4c` = 2,22). Punkt o kontraście 2:1 wobec tła nie jest
„nieco bledszy" — po nałożeniu krycia przygaszenia znika.

Nowy zestaw spełnia trzy warunki, każdy policzony (kontrast WCAG + CIE76):

1. **kontrast wobec `#fafafa` ≥ 3:1** — minimum 3,53 (`#0891b2`), maksimum 8,61,
2. **odległość od koloru mostu `#b45309` ≥ 25 dE** — minimum 31,9 (`#dc2626`);
   most musi zostać rozpoznawalny obok każdego dokumentu,
3. **wzajemna rozróżnialność ≥ 25 dE** — minimum 27,8 dla całego zestawu.

Do tego dwie reguły jakościowe:

- **jedna rodzina barw na pozycję** — bez dwóch odcieni tej samej fuksji, bo
  „ten sam kolor, ciemniejszy" nie jest kategorią czytelną z mapy,
- **kolejność jest wynikiem, nie alfabetem** — dokumenty dostają kolory po
  indeksie, więc najczęściej sąsiadują pozycje 1-2 i 2-3; ułożone tak, żeby
  najmniejsza odległość między **sąsiadami** była największa (wyszło 91 dE).

Dodając kolor do palety: sprawdź wszystkie trzy warunki, nie tylko kontrast.

### REGUŁA: krycia podnosi się, nie obniża

Wszystkie `globalAlpha` w obu komponentach były strojone pod tło `#0f1115`.
Na ciemnym tle kolor z kryciem 0,12 daje punkt słaby, ale obecny — kolor jest
jaśniejszy od tła, więc zostaje widoczny. **Na jasnym tle to samo krycie zbiega
do bieli.** Przygaszenie zamienia się w kasowanie.

Najgorszy przypadek: `alfaPodstawowa` na mapie. Po wyszukaniu 107 punktów
znikało i zostawało jedno trafienie na pustej planszy — czyli wyszukiwanie
kasowało kontekst, zamiast go przygaszać.

| miejsce | ciemne tło | jasne tło |
|---|---|---|
| mapa, `alfaPodstawowa` (punkty) | `0,12 / 0,85` | **`0,28 / 0,9`** |
| mapa, krawędzie 2D | `0,07 / 0,16` | `0,18 / 0,32` |
| mapa, sąsiedzi pod kursorem 2D | `0,85` | `0,9` |
| mapa, gasnące podświetlenie świeżej krawędzi | `× 0,9` | `× 0,95` |
| mapa, krawędzie 3D | `0,05 / 0,12` | `0,15 / 0,28` |
| mapa, sąsiedzi pod kursorem 3D | `0,9` | `0,95` |
| mapa, przygaszenie 3D | `0,18` | `0,32` |
| mapa, kubełki głębi | `0,28 + 0,62 k` | `0,45 + 0,5 k` |
| graf, wygaszona krawędź | `0,05 / 0,3` | `0,18 / 0,45` |
| graf, wygaszony węzeł (pusty) | `0,12` (`0,42`) | `0,3` (`0,5`) |
| graf, wygaszony podpis | `0,12` | `0,3` |

Kryterium, według którego dobrane: **przygaszony element ma być widoczny jako
element, tylko wyraźnie słabszy od wyróżnionego.** Nie „ledwo widoczny".

Ta sama zasada dotyczy obwódek. Obrys trafienia na mapie miał `max(1, √zoom)` —
przy zoomie 1× to 1 px wokół kółka o promieniu ~2,2 px, czyli obrys ginął.
Po zmianie: `max(1,8, 1,8 × √zoom)`, promień wyróżnienia `r × 2,2` zamiast `r × 1,9`.

I przycisków: `opacity: 0.5` działało na ciemnym tle (półprzezroczysty przycisk
zostawał ciemniejszy od tła), na białym dawało ducha. Wyłączony przycisk ma
teraz własne tło `#f4f4f5`, obwód `#e4e4e7` i tekst `#a1a1aa`.

### Poświata niesie informację tylko w dwóch miejscach

Na ciemnym tle `shadowBlur` rozjaśniał tło i czytał się jako świecenie. Na jasnym
rozjaśnić nie ma czego — ten sam efekt czyta się jako **rozmycie**, czyli jakby
węzeł był nieostry. Cały graf wyglądał na rozmazany.

**W obu komponentach nie ma już ani jednego `shadowBlur` i `shadowColor`.**
Zastąpione obrysami tam, gdzie poświata coś znaczyła:

| element | było | jest |
|---|---|---|
| most | `shadowBlur: 18` | obrys `#18181b`, grubość 2,5 |
| dokument z pojęciami | `shadowBlur: 16` | obrys `#18181b`, grubość 1,5 |
| pojęcie pod kursorem | `shadowBlur: 5` | obrys `#18181b`, grubość 1,5 |
| fragment pod kursorem | `shadowBlur: 12` | obrys `#18181b`, grubość 1,5 |
| krawędź podświetlona | `shadowBlur: 9` | `lineWidth × 1,8` |
| **zwykłe pojęcie** | `shadowBlur: 5` | **nic — bez zamiennika** |

Ostatni wiersz jest celowy i warto go rozumieć: **wszystkie** zwykłe pojęcia
miały tę samą poświatę, więc nie odróżniała niczego od niczego. Była ozdobą
i znika bez zamiennika. Obrys dostaje wyłącznie to, co ma być wyróżnione.

> **Pułapka, na którą warto uważać.** W rundzie 1 obrys mostu został wpisany
> w `PALETA.most` — czyli dokładnie tym samym kolorem co wypełnienie węzła.
> Obrys istniał w kodzie i nie istniał na ekranie. Nie dało się tego złapać
> wcześniej, bo kolekcja testowa nie ma ani jednego mostu; wyszło dopiero po
> tymczasowym wymuszeniu flagi `most`. Rozróżnienie mostu niesie **wypełnienie**
> `#b45309`; obrys je wzmacnia i musi kontrastować z jednym i z drugim.

### Pomiar 12.9 na żywej pętli indeksowania

Reguły „punkty na mapie nie mogą się ruszać" pilnował dotąd tylko przegląd diffu.
Zmierzone po przestylowaniu: `reindex` dokumentu na 5 fragmentów zdjął mapę
ze 120 na 115 punktów, zapisane współrzędne wszystkich 115, ponowne zaindeksowanie
z przycisku „Indeksuj" i porównanie.

```
punktów przed 115, po 120, nowych 5, wspólnych 115
RUSZONE 0, największa zmiana 0
baza PCA nieprzeliczona (builtAt bez zmian)
```

5 z 120 to ~4%, poniżej progu 30% z 12.4, więc nie zadziałał nawet **dozwolony**
wyjątek (przejście na nowe pozycje po przeliczeniu bazy). Punkty po prostu stały,
a nowe pięć pojawiło się na swoich współrzędnych.

### Otwarte po przestylowaniu

1. **Fuksja `#c026d3` i róż `#db2777`** stoją w palecie na pozycjach 3 i 5,
   a ich wzajemne dE to 27,8 — najniższa para w zestawie, dokładnie na progu.
   **Wymaga kolekcji z pięcioma dokumentami**, żeby zobaczyć je obok siebie.
2. **Podpis dokumentu bez pojęć jest pełnokryty, a węzeł przygaszony do 0,5.**
   Reguła „przygasić węzeł, nie podpis" jest udokumentowana i celowa, ale na
   jasnym tle kontrast między nimi urósł i szara kostka z czarnym podpisem czyta
   się jak błąd renderowania. Do decyzji produktowej, nie do naprawy w ciemno.
3. **Siatka grafu `rgba(24,24,27,.05)`** jest na granicy widoczności — widać ją
   na zrzutach, ale przy jaśniejszym monitorze może zniknąć.
4. **Most nie został sprawdzony na prawdziwych danych** — tylko na wymuszonych.
   **Wymaga kolekcji, w której dokumenty dzielą pojęcia** (pięć dokumentów
   z policzonymi pojęciami i uruchomioną normalizacją).
5. **Poświaty dokumentów i układanie wielu węzłów** oglądane były na trzech
   dokumentach, z czego jeden bez pojęć. **Wymaga kolekcji z pięcioma dokumentami.**

---

## Co zostaje otwarte

1. **Próg `RAG_MIN_SCORE = 0,45` nie ma na tym korpusie pustego pasa.** Szum
   bliski sięga 0,6058 — wyżej niż część pytań poprawnych. Akapit to nadrabia,
   ale sam próg jest przecięciem w środku rozkładu, nie w przerwie. Do
   przemierzenia: `scripts/diag-prog.mjs`.
2. **Kaskada przy kasowaniu kolekcji** — opisana w `019`, niezaimplementowana.
3. **Skrypty piszące do bazy** — patrz wyżej.
4. **`rag_diag` jest `SECURITY DEFINER`** i jako jedyna funkcja modułu nie podlega
   politykom. Dziś oddaje tylko obecność pgvector i wymiar kolumny.
5. **Wywołanie narzędzia zależy od modelu.** Reguły w `description` podniosły
   niezawodność do 5/5 i 4/4, ale to instrukcja dla modelu, nie gwarancja z kodu.
   **Przy zmianie modelu pomiar trzeba powtórzyć.**
6. **N+1 przy odczycie stanu** — nie dotyczy już Bazy wiedzy (wycofane), ale wzorzec
   „jedno żądanie na pozycję" wróci, gdy panel zacznie pokazywać stan wielu kolekcji.

### Znalezione po drodze, nienaprawione

Cztery rzeczy zauważone przy integracji i przestylowaniu, których nie było
w żadnym spisie. Przy każdej pochodzenie, bo od niego zależy, czyj to dług.

7. **Graf nie odświeża się w trakcie wyciągania pojęć.**
   *Luka modułu RAG* — nie zastana usterka AIDEAS i nie skutek wpięcia w AIDEAS;
   oba pliki przyszły razem z modułem.
   `GrafWiedzy.jsx` nie ma żadnego odpytywania, a jego `wczytaj` zależy wyłącznie
   od `[collectionId, progDanych, tylkoMosty]` — zmiana danych w bazie nie jest
   żadnym z tych trzech. Do tego graf mieszka na `/kolekcje/[id]/graf`, a pętla
   ekstrakcji (`usePojecia`) na stronie kolekcji, która grafu nie renderuje.
   `usePojecia` zwraca `{ postep, wyciagaj, przerwij, wczytajPostep }` — **nie ma
   odpowiednika `onPartia`**, którym `useIndeksowanie` karmi mapę. Żeby zobaczyć
   nowe pojęcia, trzeba wejść na `/graf` ponownie albo ruszyć suwakiem progu.
   Naprawa wymagałaby kanału zwrotnego w `usePojecia` **i** wspólnej strony dla
   obu widoków — czyli decyzji układu, nie poprawki.

8. **`app/ustawienia/page.js:389` używa `styles.content`, którego nie ma w arkuszu.**
   *Zastana usterka AIDEAS* — potwierdzone na `master`: ta sama linia, a
   `ustawienia.module.css` nie ma reguły `.content`.
   Do HTML-a trafia `className="undefined"`. Działa **przypadkiem**: `.layout` jest
   gridem `210px 1fr`, więc drugie dziecko ląduje w drugiej kolumnie bez własnych
   stylów. Zadziała inaczej, gdy ktoś ruszy układ.

9. **`app/logowanie/auth.module.css` nie ma ani jednej reguły motywu ciemnego.**
   *Zastana usterka AIDEAS* — arkusz jest sprzed integracji, RAG go nie dotyka.
   Przy `data-theme="dark"` `body` dostaje `#0a0a0a`, ale `.screen` maluje na nim
   `#fafafa`, a karta `#fff`. Logowanie i rejestracja zostają jasne w ciemnym
   motywie. To jedyne dwa ekrany aplikacji bez wariantu ciemnego.

10. **`sections.module.css` ma dwie sprzeczne reguły ciemne na `.dropZone`.**
    *Zastana usterka AIDEAS* — potwierdzone na `master`: te same numery linii,
    sprzeczność jest starsza niż sekcja RAG w kreatorze agenta.
    Linia 757 ustawia tło `#17132e` (fioletowe), linia 807 — w regule zbiorczej
    `.segmented, .dropZone` — nadpisuje je na `#131318` (szare). Wygrywa druga,
    bo stoi później. Efekt: strefa uploadu w kreatorze agenta jest w ciemnym
    motywie **szara zamiast fioletowej**, wbrew intencji obu reguł. To realna
    usterka wizualna, nie tylko nieporządek.

11. **`lib/tools/rag_search.js:174-175` odsyła do nieistniejącego miejsca.**
    *Dług po zmianie w AIDEAS* — komunikat był prawdziwy, gdy powstawał.
    Gdy agent ma włączone `rag_search`, ale nie ma wskazanej kolekcji, narzędzie
    zwraca modelowi instrukcję kończącą się słowami: *„zaproponuj, żeby wybrał ją
    w kreatorze agenta (sekcja «Narzędzia», przy przełączniku «Przeszukiwanie
    dokumentów»)"*. **RAG ma własną kartę w kreatorze od rundy „Sekcja RAG
    w kreatorze agenta"** — w Narzędziach nie ma po nim śladu.
    Tekst idzie DO MODELU, więc agent powtarza go użytkownikowi własnymi słowami
    i odsyła go w miejsce, którego nie ma. Wyszło na jaw dopiero przy sprawdzaniu
    OpenRoutera, bo trzeba było celowo odtworzyć stan „RAG bez kolekcji".
    Naprawa to jedno zdanie, ale trzeba pamiętać, że **komunikat narzędzia jest
    częścią promptu**, a nie tekstem interfejsu — nie znajdzie go nikt, kto
    przeszukuje komponenty.

12. **Model, który nie wywołał `rag_search`, i tak wypowiada się o zawartości
    dokumentów.** *Luka mechanizmu, nie usterka konkretnego pliku.*
    Zmierzone przy OpenRouterze, ale dotyczy wszystkich dostawców.
    Agent z włączonym `rag_search` i wskazaną kolekcją, którego model **nie
    zdecydował się** wywołać narzędzia, odpowiedział: *„Nie mam w dostępnych
    dokumentach firmy Nordwind informacji o lokalizacji apteczki. Polecam:
    zapytać przełożonego…"* — czyli wypowiedział zdanie o zawartości plików,
    których nigdy nie otworzył. Nie skłamał świadomie i nie wywalił się;
    po prostu zgadł, a zdanie brzmi jak wynik udanego wyszukiwania.

    **Dwa tryby awarii dają dziś prawie identyczny obraz:**

    | | RAG zepsuty (brak kolekcji) | model nie wywołał narzędzia |
    |---|---|---|
    | `toolCalls` | 1 wpis z `result` | **puste** |
    | `sources` | puste | puste |
    | plakietka w UI | jest | **nie ma** |
    | treść odpowiedzi | mówi wprost, co naprawić | brzmi jak puste wyszukiwanie |

    Rozróżnienie **istnieje w danych** — `rag_search` w `agent.tools` przy zerowej
    liczbie `toolCalls` to stan jednoznaczny i wykrywalny po stronie serwera,
    w `app/api/chat/route.js`, gdzie i tak składany jest wynik. Dziś nikt go nie
    sprawdza, a jedynym sygnałem dla użytkownika jest **brak** plakietki, czyli
    nieobecność, którą trzeba zauważyć.

    Sekcja 5 SPEC opisuje niezawodność wywołania narzędzia jako zależną od modelu
    („instrukcja dla modelu, nie gwarancja z kodu", pozycja 5 wyżej). Ta pozycja
    jest jej drugą stroną: skoro gwarancji nie ma, brak wywołania powinien być
    **widoczny**, a nie milczący. **Do zrobienia po katalogu modeli** — dopiero
    wtedy będzie wiadomo, które modele zawodzą i jak często.

    **Zmierzone w rundzie 7 OpenRoutera (2026-08-03).** Dane, na które ta pozycja
    czekała, już są: przy pytaniach odpowiadalnych `claude-haiku-4.5` i
    `qwen3.7-flash` mają **0 niewywołań na 14**, a `mistral-nemo` **14 na 14**.
    Rozpiętość jest więc zero-jedynkowa, nie stopniowa — model albo woła
    narzędzie zawsze, albo nigdy. To upraszcza wykrywanie: nie trzeba progu ani
    statystyki, wystarczy jeden przypadek. Zestaw kontrolny ma od tej rundy
    kryterium odrzucające oparte właśnie na tym (`nordwind.json`, klucz
    `KRYTERIUM ODRZUCAJACE — NIEWYWOLANIE NARZEDZIA`).

13. **`MAX_TOOL_ITERATIONS = 5` kończy się PUSTĄ odpowiedzią, nie komunikatem.**
    *Luka mechanizmu — we wszystkich czterech dostawcach naraz.*
    Zmierzone w rundzie 7: `qwen/qwen3.7-flash` przy pytaniu „jakie są zasady
    odpowiedzialności materialnej za powierzone mienie" wykonał 5 wywołań
    `rag_search`, wyczerpał limit i zwrócił **pusty tekst**. Dla użytkownika to
    puste okno bez słowa wyjaśnienia — objaw nie do odróżnienia od zawieszenia.

    **Bezpiecznik istnieje i ZADZIAŁAŁ — ma tylko o jedno piętro za mało.**
    Po pętli każdy dostawca robi jedno dodatkowe wywołanie bez narzędzi, żeby
    użytkownik cokolwiek dostał (`openrouter.js:287`, `anthropic.js:195`,
    `openai.js:275`, `ollama.js:182`). To wywołanie poszło i **też wróciło
    puste**, a wtedy kończy je wszędzie ten sam wzorzec:

    ```js
    finalText = data?.choices?.[0]?.message?.content ?? "";
    ```

    `?? ""` zamienia brak treści w pusty napis, po czym funkcja zwraca
    `{ text: "" }` bez żadnego dalszego sprawdzenia. **Nie ma drugiego piętra:**
    nikt nie pyta, czy ratunkowe wywołanie samo czegoś nie zwróciło. Nie jest to
    zatem „bezpiecznik nie zadziałał", tylko „bezpiecznik nie ma warunku na
    własną porażkę" — i to w czterech plikach niezależnie, bo wzorzec był
    kopiowany.

    Dlaczego akurat to pytanie: model wpadł w pętlę przeformułowań (pięć różnych
    zapytań o to samo — „zasady odpowiedzialności materialnej", „odpowiedzialność
    materialna pracownika", „powierzone mienie pracownikowi"…), bo w korpusie nie
    ma odpowiedzi, a jest dużo materiału sąsiedniego. Czyli limit wyczerpuje się
    najłatwiej dokładnie tam, gdzie poprawną odpowiedzią jest **odmowa** —
    i zamiast odmowy użytkownik dostaje pustkę.

    **Opisane, nienaprawione.** Naprawa to jedno zdanie zastępcze przy pustym
    wyniku, ale w czterech plikach naraz — czyli albo cztery kopie, albo
    wspólne miejsce, którego dziś nie ma. To decyzja układu, nie poprawka.

14. **Model może wyemitować wywołanie narzędzia jako TEKST, nie jako `tool_calls`.**
    *Właściwość modelu, nie usterka naszego kodu — ale objaw myli.*
    Zmierzone w rundzie 7 na `mistralai/mistral-nemo` przez OpenRoutera. Model
    zamiast pola `tool_calls` wpisuje do `content`:

    ```
    [{"name": "rag_search", "arguments": {"pytanie": "gdzie znajduje się apteczka…"}}]
    ```

    Klient tego **nie rozpoznaje i nie powinien** — to niezgodne z kontraktem
    OpenAI-compatible, a parsowanie treści w poszukiwaniu wywołań byłoby
    zgadywaniem, które przy pierwszej odpowiedzi cytującej JSON zacznie wywoływać
    narzędzia bez powodu. Narzędzie więc nie rusza, model „wierzy", że wyszukał,
    i dopowiada wynik z głowy — ze zmyśloną nazwą pliku, numerem strony i cytatem.

    **To NIE jest brak umiejętności modelu:** ten sam Nemo wywołuje `calculator`
    poprawnie (3847 × 291 = 1119477, jedno wywołanie, pole `tool_calls`).
    Sprawdzona i **odrzucona** hipoteza, że winna jest długość `description`
    narzędzia `rag_search` (2321 znaków): opis 2321 zn. zawiódł, opis 58 zn.
    **też** zawiódł, opis 175 zn. zadziałał. Nie ma tu progu do wyregulowania.

    **Dlaczego to trzeba odróżnić w diagnostyce.** Objaw jest identyczny jak
    pozycja 12 — zero `toolCalls`, brak plakietki, odpowiedź brzmiąca jak wynik
    wyszukiwania — ale przyczyna i wniosek są inne:

    | | model nie chce wołać (poz. 12) | model woła tekstem (ta pozycja) |
    |---|---|---|
    | `toolCalls` | puste | puste |
    | `content` | zwykła proza | **zawiera JSON z `"name"` i `"arguments"`** |
    | co z tym zrobić | wzmocnić `description`, zmierzyć ponownie | **odrzucić model** — nie da się tego naprawić promptem |

    Rozróżnienie jest tanie: `content` pasujący do `/"name"\s*:\s*"(rag_search|calculator|datetime)"/`
    przy zerowym `toolCalls` to ten drugi przypadek i tylko ten. Warto, żeby
    diagnostyka to wypisywała, zanim ktoś spędzi rundę na strojeniu opisu
    narzędzia dla modelu, który nigdy go nie wywoła.

15. **Tabela `model_assignments` nadal niczego nie napędza.**
    *Dług z rundy 4, niezamknięty przez rundę 6.*
    Migracja 020 utworzyła `model_assignments` z trzema rolami
    (`agent_domyslny`, `rag_pojecia`, `mentor`), karta „Modele językowe"
    je zapisuje i pokazuje, a `znormalizujPrzypisania` waliduje względem listy
    dopuszczonych. **Żaden czytelnik ich nie używa.** Model mentora dalej
    pochodzi z `settings.mentorModel` (localStorage przeglądarki), model do pojęć
    RAG z `lib/rag/config.js`, a domyślny model agenta z `lib/settings/defaults.js`.

    Runda 6 podpięła **listę dopuszczonych** (`allowed_models`) do wszystkich
    siedmiu czytelników i na tym świadomie się zatrzymała: przypisania dotykają
    domyślek w trzech miejscach naraz, a każde z nich bywa nadpisane zmienną
    środowiskową — zapisanie w bazie ich AKTUALNEJ wartości zamroziłoby ją tam
    (to samo uzasadnienie, dla którego `znormalizujPrzypisania` zwraca `null`,
    a nie podstawia konkretny model).

    Stan jest więc spójny, ale mylący: użytkownik ustawia przypisanie, widzi
    zapisane potwierdzenie i **nic się nie zmienia**. To gorsze niż brak pola.
    Do rozstrzygnięcia: albo podpiąć przypisania, albo oznaczyć je w karcie jako
    nieaktywne do czasu podpięcia.

    > **ZAMKNIĘTE w rundzie 8 (2026-08-03).** Wybrano pierwsze wyjście:
    > przypisania podpięte do wszystkich trzech ról. Kolejność rozstrzygania —
    > przypisanie → localStorage/env → stała w kodzie — siedzi w jednej czystej
    > funkcji (`lib/settings/przypisaniaModeli.js`). Model pojęć wchodzi do
    > rdzenia RAG przez `deps.conceptOverride`, czyli samą konfigurację, żeby
    > granica z sekcji 3 SPEC została nietknięta w obie strony. Obie sekcje
    > Ustawień, które te same wartości trzymały wcześniej, dostały notkę
    > mówiącą, że są przesłonięte, co wygrywa i gdzie to zmienić — bez tego
    > choroba przeniosłaby się o jedno pole dalej.

16. **Zmiana modelu pojęć w trakcie liczenia rozdziela dokument między dwa
    modele bez śladu w bazie.** *Mechanizm sprzed rundy 8 — ale próg wyzwolenia
    właśnie się obniżył.*

    `rag_concepts` zapisuje etykietę i wektor, nie zapisuje **czym została
    wyprodukowana**. Dostawca pojęć jest rozstrzygany raz na PARTIĘ
    (`extractConceptsForDocument` liczy jedną partię i kończy), więc zmiana
    między partiami przechodzi bez śladu w środku dokumentu.

    **Co zmieniła runda 8.** Sam mechanizm jest starszy i został nietknięty:
    rozstrzyganie dalej dzieje się raz na partię, nie doszedł żaden nowy
    przeplot. Zmieniło się to, jak łatwo w to wejść. Przedtem zmiana modelu
    wymagała edycji `.env.local` i restartu serwera — a restart i tak przerywał
    trwającą ekstrakcję, więc rozjazd wewnątrz jednego dokumentu był mało
    prawdopodobny. Teraz to **przełącznik w interfejsie**, działający od
    następnej partii przy biegnącym liczeniu.

    **Reprodukowane, nie teoretyczne.** Przy weryfikacji punktu (d) rundy 8
    `regulamin-pracy-nordwind.pdf` dostał fragmenty 1–4 z pojęciami od
    `anthropic/claude-haiku-4.5` przez OpenRoutera, a 5–8 od lokalnego
    `mistral-nemo` — po wyczyszczeniu przypisania w trakcie. Różnica jest
    widoczna gołym okiem i idzie dokładnie wzdłuż linii, którą instrukcja
    systemowa nazywa błędem: Haiku dał „siedziba główna przy ulicy Bukowskiej
    187 w Poznaniu", mistral-nemo „zatrudnianie", „obowiązki", „pracodawca" —
    czyli ogólniki z listy **ŹLE** w `zbudujInstrukcje`. Dokument ma więc dziś
    pojęcia dwóch różnych klas jakości i **nic w bazie tego nie odróżnia**.

    **Naturalna naprawa: kolumna z modelem przy `rag_concepts`**, wzorem
    `embed_model` w `rag_collections`. Tam ten sam problem został rozwiązany
    dokładnie tak i z tego samego powodu — wektory policzone różnymi modelami
    nie są porównywalne, więc model jest częścią danych, a nie konfiguracji.
    Przy pojęciach stawka jest niższa (nie unieważnia to korpusu), ale pytanie
    „czy ten graf pojęć powstał jednym modelem" powinno mieć odpowiedź
    w bazie, a nie w pamięci osoby, która klikała.

17. **`plainto_tsquery` nie wymaga SĄSIEDZTWA lexemów, więc identyfikator
    z dwóch członów łapie fragmenty o innym identyfikatorze.**
    *Ograniczenie precyzji, nie usterka — właściwy fragment i tak wchodzi
    w topK.* Znalezione przy rundzie „Identyfikatory ze znakiem łączącym".

    Parser Postgresa tnie `P-03` na dwa lexemy: `'p'` i `'-03'`, a
    `plainto_tsquery` łączy je operatorem AND — czyli pyta „fragment zawiera
    oba", nie „zawiera je obok siebie". Fragment o **A-03**, w którym gdzieś
    dalej pada `parametrem P-24`, ma u siebie i `'p'`, i `'-03'`, więc pasuje
    tak samo dobrze jak fragment definiujący P-03. Zmierzone na kolekcji
    z dokumentacją KMX-410, zapytanie `P-03`:

    ```
    0.4687  7.3 Alarm uszkodzenia czujnika      ← o A-03
    0.4672  13.6 Praca awaryjna przy uszkodzeniu ← o A-03
    0.4632  6.2 Opóźnienia załączania           ← WŁAŚCIWY, „Parametr P-03 ustawia…"
    ```

    Lexem `'p'` jest w tym dokumencie pospolity (`P-01`…`P-45`), więc całą
    selektywność niesie drugi człon.

    **`phraseto_tsquery` dałoby wymóg sąsiedztwa** (`'p' <-> '-03'`) i te
    fragmenty by odpadły. Zmiana dotyczy `rag_search_chunks_text`, czyli
    **wymaga migracji SQL uruchamianej ręcznie** — dlatego nie weszła razem
    z poprawką w `hybryda.js`, która żadnej zmiany w bazie nie potrzebowała.
    Przed zamianą trzeba sprawdzić, czy sąsiedztwo nie wycina przypadków,
    w których człony rozdziela znak interpunkcyjny.

18. **Identyfikator wieloczłonowy BEZ znaku łączącego dalej rozpada się na
    osobne tokeny łączone AND-em.** *Zachowanie sprzed rundy „Identyfikatory
    ze znakiem łączącym" — ta runda go nie dotyka i nie pogarsza.*

    `art. 5 ust. 1` daje `["5", "1"]`, bo między członami stoi słowo, a nie
    znak łączący. Do `plainto_tsquery` idzie `5 1`, czyli „fragment zawiera
    5 oraz 1" — warunek, który spełnia wiele fragmentów z zupełnie innych
    powodów. Zmierzone w kolekcji TEST: ścieżka tekstowa wskazała `§ 93`
    (0.3883), a **właściwy `§ 5` wszedł ścieżką WEKTOROWĄ** ze score 0.4768.

    Wynik jest więc poprawny, ale niesie go drugi sygnał, nie ten, który
    miał go nieść. Rozwiązanie wymagałoby rozumienia, że „ust." wiąże liczbę
    z poprzednią — czyli wiedzy o polskich konwencjach prawnych, której ta
    funkcja świadomie nie ma (patrz komentarz przy `identyfikatoryZapytania`).
    Zapisane jako znany kształt, nie jako zadanie.

19. **Mignięcie niewłaściwego tła przy starcie strony.**
    *Zastana usterka AIDEAS, nie skutek rundy o motywie ciemnym —* mechanizm
    jest starszy niż Kreator RAG i dotyczy **całej aplikacji**, nie mapy.
    Zauważone dopiero teraz, bo do tej rundy panel RAG nie miał motywu
    ciemnego i nie było czego z czym porównać.

    **Mechanizm.** Pierwszy render idzie z `DEFAULT_SETTINGS`
    (`lib/settings/SettingsContext.js:35`), czyli z motywem `"auto"`.
    Odczyt z `localStorage` dzieje się dopiero w efekcie po zamontowaniu
    (`:43-47`), a `applyTheme` w kolejnym (`:67-69`). Do tego czasu na
    `<html>` **nie ma atrybutu `data-theme`**, więc obowiązuje gałąź
    `@media (prefers-color-scheme: dark)`. `app/layout.js` nie ma żadnego
    skryptu, który ustawiłby atrybut przed hydratacją.

    **KIEDY TO WIDAĆ — nie zawsze, i to jest istotne dla naprawy.** Skoro
    brak atrybutu oddaje głos preferencji systemu, mignięcie pojawia się
    **wyłącznie wtedy, gdy ustawienie wymuszone różni się od preferencji OS**:
    wymuszony ciemny na jasnym systemie daje błysk bieli, wymuszony jasny na
    ciemnym — błysk czerni. Przy ustawieniu „Auto (system)", czyli domyślnym,
    mignięcia nie ma w ogóle, bo pierwsza klatka i docelowa są tym samym.

    **Naprawa: skrypt odczytujący motyw z `localStorage` przed hydratacją**,
    w `app/layout.js`, ustawiający `data-theme` synchronicznie. To wzorzec
    znany z bibliotek motywów i jedyny, który działa — każde rozwiązanie
    po stronie Reacta jest z definicji po pierwszej klatce.

    **Poza zakresem cyklu o mapie**, bo zmienia zachowanie startu całej
    aplikacji, a nie tylko tej zakładki. Wymaga też decyzji o tym, co zrobić
    przy wyłączonym JavaScripcie i przy niedostępnym `localStorage`
    (tryb prywatny części przeglądarek rzuca przy odczycie).
