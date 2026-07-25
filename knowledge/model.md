# Model (LLM)

> **Źródło: materiały AIDEAS 2025.** Zasady wyboru modelu są aktualne; konkretne nazwy i wersje modeli oraz ceny mogły się zmienić — zweryfikuj bieżące wersje u dostawcy.

## Definicja
Model językowy (LLM, *Large Language Model*) to **„mózg" agenta** — przetwarza dane, analizuje kontekst, rozumie intencje użytkownika i formułuje odpowiedzi. Ważne: **agent ≠ tylko model** — model to jeden z jego elementów.

## Po co to
Wybór modelu przekłada się bezpośrednio na jakość odpowiedzi, koszty działania i to, jak trudne zadania agent udźwignie. Dobrze dobrany model = lepszy efekt przy rozsądnym koszcie.

## Jak o tym decydować w praktyce
**Modele mini vs. standardowe:**
- **Mini** — tańsze i szybsze; wystarczają w **ok. 80%** zastosowań; „nadają się szczególnie do budowy agentów AI", gdzie liczą się niskie koszty operacyjne. Dobre do zadań, które nie wymagają przetwarzania dużej ilości danych ani unikatowych odpowiedzi.
- **Standardowe** — lepsze przy analizie złożonych danych i tworzeniu bardziej zróżnicowanych odpowiedzi.

**Kryteria wyboru modelu:**
- **Cel użycia** — do czego model ma służyć (chat, generowanie tekstu, analizy).
- **Stopień skomplikowania zadania** — czy potrzebne są zaawansowane funkcje.
- **Koszty** — licencja, utrzymanie, przetwarzanie danych, limity API.
- **Moc obliczeniowa** — czy masz zasoby do obsługi wybranego modelu.

**Dopasowanie modelu do rodzaju zadania (wg materiałów):**
- **Dokładność faktów** → „Claude i Gemini" (bardziej zachowawcze, mniej skłonne do nieprawdziwych odpowiedzi).
- **Kreatywność i styl** → „GPT-4" (bardziej ludzkie, ale mniej przewidywalne odpowiedzi — reklamy, treści marketingowe, teksty twórcze).
- **Praca z dużą ilością danych i dokumentów** → „Claude 3.5 i Gemini Pro" (zaprojektowane do złożonych analiz; „GPT-4" jest tu słabszy).

**Przykładowe modele wymienione w materiałach** (nazwy przepisane wiernie ze slajdów — nie zmieniaj ich na nowsze):
- Mini: **GPT-4o-mini, Mistral Small, Google Gemini 2.0 Flash**
- Standardowe: **GPT-4o, Gemini 2.0 Pro**
- Dodatkowo wspominane: **GPT-4o (OpenAI / Microsoft)**, **Gemini Pro 2.0 (Google)**, **Mistral**, **LLaMA (Meta)**, **Claude 3 (Anthropic)**.
- *(Materiały niespójnie zapisują niektóre nazwy — patrz `_sources.md`.)*

**Warto pamiętać o planie B** — jeśli model przestanie działać lub przekroczy limity, miej gotowy model alternatywny. Można też łączyć modele w jednym projekcie (np. jeden do przetwarzania danych, drugi do generowania treści).

## Typowe błędy
*(Materiały nie mają osobnego slajdu „typowe błędy" dla modelu — trzy pierwsze punkty wynikają z sekcji o kosztach i wyborze modelu.)*
- Wybór dużego, drogiego modelu tam, gdzie w zupełności wystarczy model mini (niepotrzebny koszt).
- Ignorowanie kosztów i limitów API przy intensywnym korzystaniu — przy dużej skali potrafią drastycznie wpłynąć na budżet.
- Brak planu awaryjnego (planu B) na wypadek awarii lub przekroczenia limitów modelu.
- Sięganie po najmocniejszy i najdroższy model do prostych zadań — przepala budżet i spowalnia odpowiedzi, choć tańszy model w zupełności by wystarczył.
- Błąd odwrotny: najtańszy i najszybszy model do zadań wymagających złożonego rozumowania — agent częściej się myli i gubi wątek.
- Zakładanie, że każdy model przyjmuje te same ustawienia — nowsze modele (np. Opus 4.8, Sonnet 5) nie przyjmują ręcznej temperatury i same dobierają poziom losowości.
- Ignorowanie okna kontekstu — wybór modelu, który nie pomieści potrzebnej ilości tekstu (długie instrukcje, wiedza, historia rozmowy).

## Krótki przykład
- **Model mini** — przygotowanie treści komunikacji, postów w mediach społecznościowych, roboczej wersji briefu na bazie szablonu.
- **Model duży** — analiza złożonych ofert od różnych agencji, aby wskazać mocne strony i ograniczenia każdej z nich.

**Ilustracja proporcji kosztów** (nie jest to realny cennik — pokazuje jedynie skalę różnicy mini vs. duży model; liczby przepisane wiernie ze slajdu): koszt wygenerowania 20 000 tokenów tekstu — **GPT-4o-mini: $45,000** wobec **GPT-4o: $270,000**. Wniosek z materiałów: przy dużej skali użycia optymalizacja wyboru modelu ma kluczowe znaczenie dla budżetu.
