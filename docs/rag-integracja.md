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
