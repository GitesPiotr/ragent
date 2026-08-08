# Model (LLM)

## Definicja
Model językowy (LLM, *Large Language Model*) to **„mózg" agenta** — przetwarza dane, analizuje kontekst, rozumie intencje użytkownika i formułuje odpowiedzi. Ważne: **agent ≠ tylko model** — model to jeden z jego elementów. Ta sama persona, te same zasady i te same dokumenty dadzą różny efekt na różnych modelach.

## Po co to
Wybór modelu przekłada się bezpośrednio na trzy rzeczy naraz: **jakość odpowiedzi, koszt działania i to, jak trudne zadania agent udźwignie**. Dobrze dobrany model = lepszy efekt przy rozsądnym koszcie. Źle dobrany objawia się albo przepalonym budżetem przy prostych zadaniach, albo agentem, który gubi wątek przy trudnych.

## Skąd biorą się modele w tej aplikacji
Model wybierasz w karcie **Model AI** — najpierw dostawcę, potem konkretny model z listy. **Lista pochodzi z modeli włączonych na Twoim koncie** (Ustawienia → Modele językowe), a nie z tego tekstu. Dlatego nie znajdziesz tu żadnych nazw: oferta dostawców zmienia się szybciej niż materiały szkoleniowe, a nazwa przepisana z kursu bywa modelem, którego już nie ma. **Aktualne nazwy są zawsze na liście w aplikacji.**

Przy każdym modelu na liście widać dwie rzeczy, na które warto patrzeć: czy przyjmuje ręczną temperaturę i czy dostawca ma ustawiony klucz. Model bez klucza można zaznaczyć, ale rozmowa z agentem zwróci błąd.

## Jak wybrać model
- **Zacznij od najtańszego i najszybszego.** Modele lekkie („mini") wystarczają w **ok. 80%** zastosowań — obsługa typowych pytań, przepisywanie tekstu, proste podsumowania, robocze wersje dokumentów. Do budowy agentów nadają się szczególnie dobrze, bo agent odpowiada wiele razy dziennie i koszt się mnoży.
- **Po mocniejszy sięgaj wtedy, gdy widzisz konkretny powód.** Powody, które naprawdę go uzasadniają: złożone rozumowanie w wielu krokach, analiza długich albo sprzecznych dokumentów, wnioski i porównania zamiast przepisywania, zadania, w których pomyłka dużo kosztuje.
- **Do faktów wybieraj model zachowawczy, do tekstów — swobodniejszy.** Agent od danych, liczb i regulaminów ma nie zmyślać; agent od treści marketingowych ma proponować warianty. To ta sama różnica, którą ustawia się temperaturą — tyle że zaczyna się już przy wyborze modelu.
- **Sprawdź okno kontekstu**, jeśli agent ma dostawać dużo tekstu: długa persona, obszerne zasady, wskazane pliki z Bazy wiedzy i historia rozmowy muszą się zmieścić naraz. Za mały model po prostu zgubi początek.
- **Miej plan B.** Model potrafi przestać działać, podrożeć albo zniknąć z oferty. Warto z góry wiedzieć, na co przełączysz agenta — zmiana modelu to jedno kliknięcie w karcie „Model AI".
- **Możesz łączyć modele w jednym projekcie** — jeden agent na tańszym modelu do obsługi bieżących pytań, drugi na mocniejszym do analiz.

## Co znaczy „model nie przyjmuje temperatury"
Część nowszych modeli **sama dobiera poziom losowości** i nie pozwala ustawić go ręcznie. Przy takim modelu suwak temperatury w kreatorze nic nie zmienia — nie jest zepsuty, po prostu ten model go nie obsługuje. Przy każdym modelu na liście widać, czy temperaturę przyjmuje. Jeśli zależy Ci na ręcznym sterowaniu losowością, wybierz model, który to umie. Więcej w pojęciu **„Temperatura"**.

## Typowe błędy
- **Najmocniejszy i najdroższy model do prostych zadań** — przepala budżet i spowalnia odpowiedzi, choć tańszy w zupełności by wystarczył.
- **Błąd odwrotny: najtańszy model do zadań wymagających rozumowania** — agent częściej się myli, gubi wątek i wyciąga płytkie wnioski.
- **Ignorowanie kosztów i limitów API** przy intensywnym korzystaniu — przy dużej skali potrafią drastycznie wpłynąć na budżet.
- **Brak planu awaryjnego** na wypadek awarii, limitu albo wycofania modelu z oferty.
- **Założenie, że każdy model przyjmuje te same ustawienia** — patrz wyżej: część z nich nie przyjmuje ręcznej temperatury.
- **Ignorowanie okna kontekstu** — wybór modelu, który nie pomieści potrzebnej ilości tekstu.
- **Zmiana modelu bez ponownego testu** — ta sama konfiguracja na innym modelu potrafi odpowiadać zauważalnie inaczej. Po zmianie warto przejść do karty „Test agenta".

## Krótki przykład
**Agent „Asystent biurowy"** odpowiada na powtarzalne pytania pracowników i przepisuje notatki — tu wystarczy model tańszy i szybszy, bo zadania są proste, a zapytań dużo.

**Agent „Analityk ofert"** dostaje kilka długich ofert i ma wskazać mocne strony oraz ryzyka każdej z nich — tu opłaca się model mocniejszy: wymaga porównywania, wyciągania wniosków i utrzymania w głowie całości dokumentów naraz.
