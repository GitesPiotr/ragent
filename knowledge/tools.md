# Narzędzia

## Definicja
Narzędzia to **zdolności, które agent może wywołać w trakcie rozmowy, żeby zrobić coś, czego sam model nie potrafi** — policzyć, sprawdzić bieżącą datę, poszukać informacji w internecie albo zajrzeć do Twoich dokumentów. Agent **sam decyduje**, kiedy po narzędzie sięgnąć; Ty decydujesz tylko, które ma do dyspozycji.

## Po co to
Model zna wyłącznie to, na czym został wytrenowany. Nie wie, który dziś mamy dzień, nie zna Twoich dokumentów, a rachunki „liczy" tak samo, jak pisze zdania — zgadując najbardziej prawdopodobny ciąg znaków. Narzędzia zamykają tę lukę: dają agentowi **pewny wynik zamiast prawdopodobnego**, dostęp do aktualnych informacji i do Twojej wiedzy.

## Jakie narzędzia są w tej aplikacji
W karcie **Narzędzia** włączasz je przełącznikami. Są trzy:

- **Kalkulator** — liczy działania matematyczne zamiast zgadywać wynik (mnożenie, dzielenie, procenty, potęgi, pierwiastki). Włącz go zawsze, gdy agent ma podawać kwoty, ilości albo cokolwiek policzonego. Model bez kalkulatora potrafi podać liczbę, która wygląda poprawnie i poprawna nie jest.
- **Data / czas** — zwraca bieżącą datę i godzinę (czas serwera). Potrzebne przy terminach, dniach tygodnia, wyliczaniu „ile zostało do…". Bez tego narzędzia agent nie ma pojęcia, kiedy z nim rozmawiasz.
- **Wyszukiwanie w internecie** — agent sięga po aktualne informacje z sieci i podaje źródła. Pod jednym przełącznikiem działają **dwa mechanizmy**, wybierane automatycznie po modelu agenta: dla modeli Claude wyszukiwanie odbywa się po stronie dostawcy (Anthropic), a dla modeli lokalnych (Ollama) — przez wyszukiwarkę uruchomioną po stronie serwera. Dla ciebie to jedno ustawienie; różnica dotyczy tylko kosztu i tego, co trzeba mieć skonfigurowane. **Wyszukiwanie nie działa dla modeli z OpenRoutera i OpenAI** — przy takim modelu przełącznik jest wyszarzony.

Czwarte narzędzie ma **własną kartę**, obok Bazy wiedzy:

- **Przeszukiwanie dokumentów (RAG)** — agent przeszukuje wskazaną kolekcję Twoich dokumentów i dostaje z niej tylko te fragmenty, które pasują do pytania, razem z nazwą pliku i sekcją. Nie leży w „Narzędziach", bo to nie jest narzędzie pokroju kalkulatora, tylko drugie źródło wiedzy agenta — dlatego stoi przy Bazie wiedzy, od której różni się sposobem działania. **Całą rzecz opisuje osobne pojęcie „RAG (wyszukiwanie w dokumentach)"** — tam jest różnica wobec Bazy wiedzy, rzecz o kolekcjach i typowe błędy.

## Jak decydować, jakie narzędzia dać agentowi
- **Zacznij od pytania: czego agent nie potrafi sam?** Jeśli ma liczyć — kalkulator. Jeśli ma odpowiadać na podstawie Twoich dokumentów — Baza wiedzy albo RAG. Jeśli ma znać dzisiejszą datę — data/czas.
- **Dawaj tylko to, co potrzebne.** Każde zbędne narzędzie to dodatkowy wybór, przed którym staje model przy każdym pytaniu — i szansa, że sięgnie po niewłaściwe. Nadmiar źródeł i narzędzi zwiększa „szum" i obniża jakość odpowiedzi.
- **Uważaj na wyszukiwanie w sieci.** Wyszukiwanie (również „deep search") wykazuje **wysoki poziom halucynacji** — nie traktuj go jako pewnego źródła prawdy. Do rzeczy, które muszą się zgadzać, lepsze są Twoje własne dokumenty.
- **Dbaj o jakość źródeł.** Zasada „Garbage In – Garbage Out": jeśli dane wejściowe są słabe, wynik też będzie słaby. Dokumenty, które dajesz agentowi, powinny być aktualne, spójne i kompletne.
- **Powiedz w zasadach, kiedy narzędzia używać.** Samo włączenie przełącznika nie zmusza agenta do sięgnięcia po narzędzie. Zasada w rodzaju „każdy wynik liczbowy licz kalkulatorem, nigdy w pamięci" bardzo pomaga.

## Typowe błędy
- **Za dużo narzędzi naraz** → agent gubi się, po które sięgnąć, a odpowiedzi robią się gorsze.
- **Oczekiwanie, że agent użyje narzędzia, którego mu nie daliśmy** — np. liczenie na to, że sprawdzi coś w internecie, gdy wyszukiwanie jest wyłączone. Agent wtedy nie powie „nie mam narzędzia", tylko odpowie z własnej wiedzy.
- **Poleganie na wyszukiwaniu w sieci jak na źródle prawdy** — patrz wyżej: to narzędzie o wysokim ryzyku halucynacji.
- **Włączone przeszukiwanie dokumentów bez wskazanej kolekcji** — agent nie ma czego przeszukać i przy każdym pytaniu powie, że nie ma dostępu do dokumentów. Wygląda na włączone, działa jak wyłączone.
- **Słabej jakości albo nieaktualne dokumenty** w podłączonych źródłach — agent zacytuje stary cennik równie pewnie jak nowy.

## Krótki przykład
**Agent „Asystent ofertowy"** ma włączony **Kalkulator** i **Przeszukiwanie dokumentów** ze wskazaną kolekcją „Cenniki".

Pytanie: *„Ile wyjdzie 12 sztuk z oferty jesiennej?"*
Agent najpierw **przeszukuje kolekcję** i znajduje cenę jednostkową we właściwym cenniku, potem **liczy kalkulatorem** 12 × tę cenę, a na końcu podaje wynik razem z nazwą pliku, z którego wziął cenę.

Bez tych dwóch narzędzi ten sam agent zgadłby cenę z ogólnej wiedzy i pomnożył ją w pamięci — dając odpowiedź, która brzmi tak samo pewnie, a bywa nieprawdziwa w obu składnikach.
