# Wejście i wyjście

## Definicja
Wejście i wyjście określa, **co agent przyjmuje** (np. samo pytanie, pytanie plus dokument) i **w jakim formacie odpowiada** — zwykły tekst, markdown albo JSON.

## Po co to
- Format odpowiedzi decyduje, czy wynik nadaje się do wklejenia, wyświetlenia czy przetworzenia przez inny program.
- Ustalone wejście oznacza mniej nieporozumień co do tego, czego agent oczekuje.

## Jak o tym decydować w praktyce
- **Tekst** — do rozmowy i odpowiedzi czytanych przez człowieka.
- **Markdown** — gdy przydają się nagłówki, listy i pogrubienia (raporty, podsumowania).
- **JSON** — gdy odpowiedź ma trafić do innego systemu i musi mieć stałą strukturę.

## Typowe błędy
- **Wybór JSON „na wszelki wypadek"** — utrudnia czytanie odpowiedzi człowiekowi.
- **Format sprzeczny z osobowością** — agent „piszący swobodnie" i wymuszony sztywny JSON będą się gryźć.
