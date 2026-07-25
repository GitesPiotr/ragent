# Raport źródeł — baza wiedzy mentora AIDEAS

Ten plik jest zapisem pochodzenia wiedzy. Dla każdego pojęcia: z których plików PDF pochodzi, gdzie nastąpiło scalenie oraz jak rozstrzygnięto rozbieżności i braki w materiałach. Wszystkie pozycje są domknięte — w plikach wiedzy nie ma już otwartych miejsc do uzupełnienia.

Materiały źródłowe: szkolenie **AIDEAS Vibe Coding, 2025**. Pliki PDF traktowane jako tylko-do-odczytu (nie modyfikowane).

---

## persona.md
**Źródła PDF:**
- `Część zespołowa - Trzeci krok.pdf` — źródło główne (definicja persony, 4 elementy opisu: rola/stanowisko, styl komunikacji, zakres odpowiedzialności, cechy; 3 przykłady person; typowe błędy).
- `MODUŁ 4 - Jak zbudować własnych agentów.pdf` — „Rola i osobowość" jako element definicji agenta (wsparcie).
- `MODUŁ 4 - Czym są Agenty AI.pdf` — asystent/agent może mieć osobowość i zasady (tło).
- `MODUŁ 3 - Od zera do AJ mastera.pdf` — „Rola" w strukturze promptu (wsparcie).
- `MODUŁ 4 - Agenty AI są wśród nas.pdf` — „dostosowanie osobowości i tonu" (tło).

**Miejsca scalenia:** trzon w całości z Trzeciego kroku (najpełniejszy); pozostałe pliki tylko potwierdzają, nie dodają nowej treści — brak powtórzeń przeniesionych do pliku.

---

## model.md
**Źródła PDF:**
- `Część zespołowa - Piąty krok.pdf` — źródło główne (LLM jako „mózg" agenta, mini vs. standardowe, kryteria wyboru, dopasowanie modelu do zadania, plan B, nazwy modeli).
- `MODUŁ 3 - Zastosowanie różnych modeli LLM.pdf` — mini vs. duże, kryteria wyboru, koszty, „ok. 80%" skuteczności mini (scalenie).
- `MODUŁ 3 - Co to AI Pogłębienie.pdf` — tokeny i koszty (ilustracja proporcji $45,000 vs $270,000), fine-tuning (wsparcie).

**Miejsca scalenia:** Piąty krok + Moduł 3 „Zastosowanie modeli LLM" mocno się pokrywają (mini vs. duże, kryteria, koszty) — scalone w jedną spójną sekcję bez powtórzeń. Liczba „ok. 80%" pochodzi z Modułu 3; nazwy modeli i kryteria dopasowania z Piątego kroku.

**Adnotacja o aktualności:** na górze pliku, zgodnie z poleceniem (materiały 2025 — zasady aktualne, nazwy/wersje/ceny mogły się zmienić).

**Wartości liczbowe/nazwy odzyskane z obrazów slajdów** (ekstrakcja tekstu gubiła cyfry — wartości odczytane z renderu PNG z pełną pewnością, przepisane wiernie, bez „poprawiania" na nowsze):
- Mini: GPT-4o-mini, Mistral Small, Google Gemini 2.0 Flash *(Piąty krok, s. 5)*
- Standardowe: GPT-4o, Gemini 2.0 Pro *(Piąty krok, s. 6)*
- Opisy: GPT-4o (OpenAI/Microsoft) *(s. 8)*, Gemini Pro 2.0 (Google) *(s. 9)*, LLaMA (Meta) + Claude 3 (Anthropic) *(s. 11)*
- Dopasowanie: fakty → „Claude i Gemini" *(s. 13)*; kreatywność → „GPT-4" *(s. 14)*; duże dane → „Claude 3.5 i Gemini Pro" *(s. 15)*
- Koszt za 20 000 tokenów: GPT-4o-mini $45,000 vs GPT-4o $270,000 *(Moduł 3 „Co to AI Pogłębienie", s. 12)*

**Uwaga (niespójność nazewnictwa w samych materiałach — do ewentualnego ujednolicenia ręcznego):** slajdy zapisują różnie: „GPT-4o" vs „GPT-4"; „Gemini 2.0 Pro" vs „Gemini Pro 2.0" vs „Gemini Pro"; „Claude 3" vs „Claude 3.5". W pliku zachowano każde wystąpienie wiernie ze slajdu.

**Braki w materiałach i sposób ich domknięcia:**
- Materiały AIDEAS nie mają osobnego slajdu „typowe błędy" dla wyboru modelu. Trzy pierwsze punkty tej sekcji w model.md wyprowadzono z materiałów kursu (sekcje o kosztach i planie B). Sekcję **uzupełniono następnie o cztery punkty spoza materiałów AIDEAS** — pochodzą z ogólnych, aktualnych dobrych praktyk budowania agentów: dobór mocy modelu do trudności zadania (w obie strony), różnice w przyjmowaniu parametrów przez nowsze modele oraz okno kontekstu. Notka atrybucyjna w pliku zawęża pochodzenie z kursu do trzech pierwszych punktów, żeby nie przypisywać materiałom AIDEAS treści, których w nich nie ma.
- Uwaga jakościowa: kwoty $45,000 / $270,000 opisane w pliku jako **ilustracja proporcji**, nie realny cennik (zgodnie z poleceniem — mentor nie ma podawać ich laikowi jako stawek).

---

## temperature.md
**Źródła PDF:**
- `Część zespołowa - Szósty krok.pdf` — źródło główne i **wersja przyjęta** (skala 0–1, trzy zakresy, zastosowania, top-p/max tokens, typowe błędy, przykłady agentów z konkretnymi wartościami).
- `MODUŁ 3 - Co to AI Pogłębienie.pdf` — druga, rozbieżna skala temperatury (patrz sprzeczność niżej).
- `MODUŁ 4 - Jak zbudować własnych agentów.pdf` — temperatura jako parametr agenta ofertowego (tło).
- `MODUŁ 5 - Promptowanie zaawansowane.pdf` — „temperatura generowania" przy samokonsystencji/ensemblingu (tło).

**Miejsca scalenia:** przyjęto wersję z Szóstego kroku jako główną (spójna z suwakiem 0–1 w aplikacji, ma konkretne przykłady). Wersja z Modułu 3 świadomie zachowana jako rozbieżność, nie usunięta.

**Wartości odzyskane z obrazów slajdów** (Szósty krok): skala 0 = maks. przewidywalność, 1 = wysoka losowość *(s. 3)*; 0–0.3 *(s. 4)*, 0.4–0.6 *(s. 5)*, 0.7–1.0 *(s. 6)*; przykłady: raport zarządu 0.2 *(s. 7)*, analiza marketingowa 0.4–0.5 *(s. 8)*, pomysły na kampanię 0.7–0.9 *(s. 9)*.

**Korekta spoza materiałów AIDEAS (stan na 2026):** materiały kursu zakładają, że temperaturę ustawia się dla każdego modelu. To już nieaktualne — **nowsze modele (np. Opus 4.8, Sonnet 5) nie przyjmują ręcznej temperatury i same dobierają poziom losowości**. Do `temperature.md` dopisano z tego powodu sekcję „Kiedy temperatury nie ustawia się wcale" oraz jeden punkt w „Typowych błędach"; treści te **nie pochodzą z materiałów AIDEAS**, tylko z aktualnego stanu API dostawców. Wiedza o skali 0–1 została zachowana bez zmian — dla modeli, które temperaturę przyjmują, pozostaje poprawna. Odpowiada temu flaga `supportsTemperature` w `lib/config/models.js`.

**Rozstrzygnięcia:**
- **ROZSTRZYGNIĘTE: obowiązuje skala 0–1 (Szósty krok); skala z Modułu 3 zachowana tylko jako kontekst historyczny.** Dwie różne skale temperatury w materiałach:
  - **Szósty krok** (obowiązująca): niska **0–0.3**, średnia **0.4–0.6**, wysoka **0.7–1.0** (skala 0–1).
  - **MODUŁ 3 – Co to AI Pogłębienie** (s. 14): niska **0.2–0.5**, średnia **0.7–1.0**, wysoka **1.5 i więcej** (skala >1).
  - Rozbieżność: przedział 0.7–1.0 raz jest „wysoką/kreatywną", raz „średnią" temperaturą. **Decyzja:** w tej aplikacji obowiązuje skala 0–1 (suwak kreatora 0–1, API dostawców przyjmuje temperaturę w tym zakresie); wersja z Modułu 3 zachowana wyłącznie jako kontekst historyczny. Odzwierciedlone też w treści `temperature.md`.

---

## rules.md
**Źródła PDF:**
- `Część zespołowa - Siódmy krok.pdf` — źródło główne (po co zasady; czego dotyczą: zakres, styl, priorytety, format outputu, źródła prawdy; przykłady; typowe błędy).
- `Część zespołowa - Drugi krok.pdf` — projektowanie kroków/zadań agenta (czasownik działania, mierzalność, logiczna kolejność, ograniczenie liczby kroków) — scalone jako praktyka projektowania zasad działania.
- `MODUŁ 4 - Jak zbudować własnych agentów.pdf` — „Zasady generowania treści" jako element definicji agenta (wsparcie).

**Miejsca scalenia:** Siódmy krok (czego mają dotyczyć zasady) + Drugi krok (jak projektować kroki-zadania) połączone jako komplementarne; brak powtórzeń.

**Rozbieżności i braki:** żadnych — pojęcie w pełni pokryte w materiałach.

---

## tools.md
**Definicja przyjęta wg polecenia:** narzędzia = zewnętrzne zdolności, które agent wywołuje (obliczenia, dane, wyszukiwanie, integracje, RAG). GeneratorGPT, Make/n8n, mail, baza wiedzy z PDF potraktowane jako **przykłady**, nie główny temat.

**Źródła PDF:**
- `Część zespołowa - Czwarty krok.pdf` — baza wiedzy / źródła danych agenta (PDF, linki, dokumenty w prompcie, bazy danych i API; minimalizacja szumu; jakość i aktualność źródeł; halucynacje).
- `Część zespołowa - Dziewiąty krok.pdf` — funkcje platformy GeneratorGPT (dodaj plik, połącz tekst, logika warunkowa, output/PDF).
- `MODUŁ 5 - Rozwój AI bez użycia kodu.pdf` — integracje no-code (Make/n8n, mail, kalendarz, arkusze Google, Google Docs, Slack).
- `MODUŁ 4 - Czym są Agenty AI.pdf` — agent może mieć integrację z narzędziami i podejmować działania; okno kontekstu jest ograniczone.
- `MODUŁ 5 - Promptowanie zaawansowane.pdf` — RAG (Retrieval-Augmented Generation) jako sięganie do bazy wiedzy przed odpowiedzią.
- `MODUŁ 3 - Od zera do AJ mastera.pdf` / `MODUŁ 4 - Jakość danych.pdf` — „Garbage In – Garbage Out", jakość danych wejściowych (wsparcie).

**Miejsca scalenia:** pojęcie „narzędzia" jest w materiałach **rozproszone** (nie ma jednego slajdu). Złożone z: (a) źródeł wiedzy/danych (Czwarty krok, RAG), (b) funkcji platformy (Dziewiąty krok), (c) integracji no-code (Rozwój bez kodu) — ujęte jako przykłady wokół jednej definicji zewnętrznych zdolności.

**Braki w materiałach i sposób ich domknięcia:**
- Materiały AIDEAS nie mają jednego, dedykowanego slajdu o „narzędziach" rozumianych jako wywoływane zdolności agenta. Trzy pierwsze punkty sekcji „Typowe błędy" w tools.md wyprowadzono z materiałów o bazie wiedzy, źródłach danych i integracjach. Sekcję **uzupełniono następnie o cztery punkty spoza materiałów AIDEAS** — pochodzą z ogólnych, aktualnych dobrych praktyk budowania agentów: dobór zestawu narzędzi do potrzeb, jakość opisu narzędzia, oczekiwania wobec narzędzi niepodłączonych oraz zachowanie agenta przy błędzie narzędzia. Punkty te celowo nie mają odniesienia do slajdów — nie pochodzą z kursu.

---

## Pojęcia obecne w materiałach, ale POZA piątką (świadomie pominięte)
Sygnalizuję dla porządku — nie destylowane do osobnych plików: **Kontekst / baza wiedzy** (częściowo wykorzystany w tools.md jako źródła danych), **Format odpowiedzi**, **testowanie / cykl PDCA** (Ósmy i Dziesiąty krok), **OKR** (Pierwszy krok).

## Uwaga techniczna o ekstrakcji
Nazwy plików PDF miały polskie znaki w formie zdekomponowanej (NFD), a ekstraktor tekstu gubił wszystkie cyfry. Wszystkie wartości liczbowe i nazwy modeli w model.md i temperature.md odczytano z **renderu stron PDF do obrazu** i przepisano wiernie. Fragmenty niemożliwe do jednoznacznego odczytania zostałyby odnotowane jako braki do ręcznego uzupełnienia — w tej kuracji takich braków w warstwie liczbowej nie było, wszystkie kluczowe wartości udało się odczytać z pełną pewnością.
