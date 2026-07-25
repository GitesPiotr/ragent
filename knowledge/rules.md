# Zasady

## Definicja
Zasady to reguły, które określają, **co agent powinien i czego nie powinien robić** oraz **jak ma działać i komunikować się**. Nadają jego odpowiedziom spójność i przewidywalność.

## Po co to
- **Spójność i przewidywalność** — odpowiedzi agenta są konsekwentne i zgodne z oczekiwaniami.
- **Ograniczenie halucynacji** — zasady pomagają uniknąć sytuacji, w których agent tworzy odpowiedzi nieprawdziwe lub nieadekwatne.
- **Łatwiejsze testowanie i iteracja** — gdy agent robi coś dziwnego, łatwiej znaleźć przyczynę, odwołując się do zasad.

## Jak o tym decydować w praktyce
Dobre zasady powinny dotyczyć:
- **Zakresu działania** — co wolno, a czego nie (np. „Nie interpretuj danych medycznych").
- **Stylu komunikacji** — ton wypowiedzi (np. „Używaj tonu formalnego, bez emotek").
- **Priorytetów** — co robić najpierw (np. „Najpierw analizuj dane, potem rekomenduj").
- **Formatu outputu** — jak prezentować odpowiedzi (np. „Zawsze wypisuj w punktach", „Zakończ podsumowaniem w trzech zdaniach").
- **Źródeł prawdy** — z czego agent może korzystać (np. „Korzystaj wyłącznie z dokumentów źródłowych").

**Powiązanie z krokami/zadaniami agenta:** każda zasada wiąże się z rolą agenta i z jego zadaniami. Projektując listę kroków, pamiętaj, że:
- każdy krok powinien zaczynać się od **czasownika działania** („zbierz dane", „porównaj raporty", „napisz streszczenie"),
- każde zadanie musi być **mierzalne** (łatwo ocenić, czy wykonane poprawnie),
- **kolejność** działań ma być logiczna i przewidywalna (Zbierz → Przeanalizuj → Zarekomenduj),
- **ograniczaj liczbę kroków** — prostota jest skuteczniejsza i łatwiejsza w testowaniu.

## Typowe błędy
- **Zbyt ogólne zasady** — np. „Bądź pomocny". Zasady muszą być konkretne i mierzalne.
- **Sprzeczne zasady** — np. „Pisz krótko" i jednocześnie „Dodaj pełne uzasadnienie". Zasady nie mogą sobie przeczyć.
- **Zasady niemożliwe do weryfikacji** — np. „Nie pomijaj niczego". Zasada powinna dać się sprawdzić przez testy i obserwację działania agenta.

## Krótki przykład
**Agent: Asystent zarządu — zasady działania:**
> - Używaj języka formalnego.
> - Ogranicz się do faktów z dokumentów źródłowych.
> - Nigdy nie twórz treści domyślnie — opieraj się na danych.
> - Podsumuj treść na końcu każdego dokumentu.
> - Nie używaj skrótów ani kolokwializmów.
