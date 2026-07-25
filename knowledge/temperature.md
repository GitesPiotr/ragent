# Temperatura

## Definicja
Temperatura to parametr modelu, który działa jak **suwak kreatywności** — decyduje, czy odpowiedzi agenta będą bardziej przewidywalne, czy bardziej zaskakujące. Na skali **0–1**: **0** = maksymalna przewidywalność (odpowiedzi spójne, ale mniej kreatywne), **1** = wysoka losowość i swoboda (odpowiedzi zróżnicowane i kreatywne, ale mniej przewidywalne).

## Po co to
Temperatura dostraja agenta do charakteru zadania — pozwala przesunąć go w stronę **precyzji** (gdy liczy się zgodność z faktami i brak dygresji) albo w stronę **kreatywności** (gdy potrzebujesz nowych pomysłów i różnorodności).

## Jak o tym decydować w praktyce
Trzy zakresy i ich zastosowania:
- **0–0.3 (niska)** — odpowiedzi spójne i konkretne. Do zadań formalnych i precyzyjnych: raporty dla zarządu, analizy audytoryjne, opisy procesów — bez dygresji i bez odbiegania od tematu.
- **0.4–0.6 (średnia)** — równowaga między przewidywalnością a elastycznością. Do analiz marketingowych, przygotowywania materiałów roboczych, rekomendacji.
- **0.7–1.0 (wysoka)** — odpowiedzi bardziej kreatywne i mniej przewidywalne. Do zadań twórczych: burze mózgów, treści marketingowe, eksperymenty kreatywne.

**Temperatura a inne parametry:**
- **Top-p** — pozwala modelowi wybierać z ograniczonego zbioru odpowiedzi, co dodatkowo stabilizuje generowanie.
- **Max tokens** — kontroluje długość odpowiedzi.

## Kiedy temperatury nie ustawia się wcale
Nie każdy model przyjmuje ręcznie ustawianą temperaturę. **Nowsze modele — na przykład Opus 4.8 i Sonnet 5 — same dobierają poziom losowości** i tego parametru nie przyjmują. Przy takim modelu temperatury po prostu się nie ustawia: opisane wyżej zakresy 0–0.3 / 0.4–0.6 / 0.7–1.0 wtedy nie mają zastosowania, bo model dopasowuje losowość samodzielnie do charakteru zadania.

Ręczne ustawianie temperatury działa natomiast w modelach, które ten parametr przyjmują — na przykład w Haiku 4.5 oraz w modelach lokalnych. Tam wszystko opisane powyżej obowiązuje bez zmian.

**W praktyce:** najpierw sprawdź, czy wybrany model w ogóle przyjmuje temperaturę. Jeśli tak — dobierz wartość według trzech zakresów. Jeśli nie — pomiń ten krok i zadbaj o precyzję inaczej: dokładniejszym opisem osobowości agenta i jasnymi zasadami.

## Typowe błędy
- **Zbyt wysoka temperatura w zadaniach formalnych** (np. raporty, audyty) → odpowiedzi nielogiczne, rozwlekłe, odbiegające od tematu. Rozwiązanie: ustaw **0–0.3**.
- **Zbyt niska temperatura w zadaniach kreatywnych** (np. treści marketingowe, burze mózgów) → odpowiedzi nudne i powtarzalne. Rozwiązanie: ustaw **0.7–1.0**.
- **Założenie, że każdy model przyjmuje temperaturę** → przy modelach, które dobierają losowość samodzielnie (np. Opus 4.8, Sonnet 5), nie ma czego ustawiać, a próba narzucenia wartości kończy się błędem. Rozwiązanie: sprawdź wybrany model i przy takich modelach pomiń ten krok.

## Krótki przykład
- Agent przygotowujący **raport dla zarządu** → temperatura **0.2** (wymagana precyzja i spójność, bez dygresji).
- Agent **analizujący dane marketingowe i formułujący sugestie** → **0.4–0.5** (równowaga przewidywalności i elastyczności).
- Agent **generujący pomysły na kampanię marketingową** → **0.7–0.9** (potrzebna duża kreatywność i różnorodność).

---

## Rozstrzygnięcie skali temperatury
> W tej aplikacji obowiązuje skala 0–1 (wersja z Szóstego kroku:
> 0–0.3 / 0.4–0.6 / 0.7–1.0), ponieważ suwak temperatury w kreatorze działa
> w zakresie 0–1, a API dostawców — w modelach, które temperaturę przyjmują —
> oczekuje jej właśnie w tym zakresie.
> Skala z Modułu 3 (do 1.5 i więcej) jest podana wyłącznie jako kontekst
> historyczny z materiałów AIDEAS i NIE ma zastosowania w tej aplikacji.

Dla kontekstu — druga, **nieobowiązująca** skala z materiałów AIDEAS (`MODUŁ 3 – Co to AI Pogłębienie`): niska **0.2–0.5**, średnia **0.7–1.0**, wysoka **1.5 i więcej**. Zachowana wyłącznie informacyjnie; w tej aplikacji jej nie stosujemy.
