# Narzędzia

## Definicja
Narzędzia to **zewnętrzne zdolności, które agent może wywołać, żeby zrobić coś, czego sam model nie potrafi** — np. wykonać obliczenia, pobrać dane, wyszukać informacje, połączyć się z innym systemem (integracja) albo sięgnąć do źródła wiedzy (RAG — wyszukanie potrzebnych fragmentów w bazie wiedzy przed wygenerowaniem odpowiedzi).

## Po co to
Sam model zna tylko to, na czym został wytrenowany — nie ma dostępu do Twoich danych ani do aktualnych informacji ze świata, a jego „pamięć" w rozmowie (okno kontekstu) jest ograniczona. Narzędzia dają agentowi to, czego modelowi brakuje: **aktualne dane, konkretną wiedzę i możliwość działania w środowisku**. Dzięki nim agent może realnie wykonywać zadania, a nie tylko generować tekst — bo najbardziej autonomiczna forma AI potrafi podejmować działania zgodne ze swoimi instrukcjami dzięki integracji z różnymi narzędziami.

## Jak decydować, jakie narzędzia dać agentowi
- **Czy agent potrzebuje dostępu do wiedzy/danych?** Tak — gdy pełni rolę analityka, doradcy lub odpowiada na podstawie faktów. Nie — gdy wykonuje zadania rutynowe, wcześniej zdefiniowane, albo pracuje na danych już przygotowanych przez inny krok/agenta.
- **Dawaj tylko to, co potrzebne.** Nadmiar źródeł i narzędzi zwiększa „szum" i obniża jakość odpowiedzi — agent musi przeszukiwać więcej, niż trzeba.
- **Uważaj na narzędzia podatne na błędy.** Wg materiałów wyszukiwanie w sieci (również „deep search") wykazuje **wysoki poziom halucynacji** — nie traktuj go jako pewnego źródła prawdy.
- **Dbaj o jakość źródeł.** Zasada „Garbage In – Garbage Out": jeśli dane wejściowe są słabe, wynik też będzie słaby. Źródła powinny być aktualne, spójne, kompletne i „czyste".

## Przykłady (jak to wygląda w praktyce)
Poniższe to tylko **ilustracje** pojęcia, nie jego istota:
- **Źródła wiedzy / RAG:** pliki PDF w bazie wiedzy (na etapie *proof of concept* najłatwiejsze do przetworzenia), linki do zasobów (intranet, SharePoint), dokumenty osadzone w prompcie, bazy danych i API dla danych dynamicznych.
- **Platforma GeneratorGPT:** dodanie pliku do analizy, łączenie tekstu z wielu kroków, logika warunkowa (instrukcje „jeśli…"), eksport wyniku do PDF.
- **Integracje no-code:** Make / n8n, poczta e-mail, kalendarz, arkusze Google, Google Docs, Slack — agent pobiera dane ze źródeł i rozsyła wyniki.

## Typowe błędy
- **Za dużo źródeł/narzędzi** → szum i gorsze odpowiedzi (agent przetwarza niepotrzebne informacje).
- **Poleganie na narzędziach o wysokim ryzyku halucynacji** (wyszukiwanie w sieci / deep search) jako na źródle prawdy.
- **Słabej jakości, nieaktualne lub sprzeczne dane** w podłączonych źródłach.
- **Włączanie narzędzi, których agent nie potrzebuje** → więcej narzędzi to większe zamieszanie i koszt; agent gubi się, po które sięgnąć.
- **Zbyt ogólny lub niejasny opis narzędzia** — model nie wie, kiedy po nie sięgnąć, więc używa go w złym momencie albo wcale.
- **Oczekiwanie, że agent użyje narzędzia, którego mu nie daliśmy** (np. liczenie na wyszukiwanie w sieci, gdy narzędzie web jest wyłączone).
- **Brak myślenia o błędach narzędzia** — gdy narzędzie zwróci błąd albo dziwny wynik, agent powinien sobie z tym poradzić, a nie się zaciąć.

## Krótki przykład
Agent do obsługi zapytań e-mail: **odczytuje** treść wiadomości (integracja z pocztą), **wyszukuje** odpowiedź w firmowej bazie wiedzy z plików PDF (RAG), **przygotowuje** odpowiedź i **wysyła** ją do klienta (integracja). Model sam nie zna treści maila ani firmowych dokumentów — wykonać to zadanie pozwalają mu dopiero narzędzia.
