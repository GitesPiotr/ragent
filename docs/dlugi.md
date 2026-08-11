# Długi

Rzeczy świadomie odłożone — nie usterki do zgłoszenia, tylko decyzje
z odroczonym skutkiem. Każda pozycja mówi, **co** zostało odłożone,
**dlaczego** i **co trzeba wiedzieć**, zanim się ją ruszy.

Lista powstała przy etapie 4b. Wcześniejsze pozycje pochodzą z przebudowy
wyglądu zmergowanej do `master` (`3a1cf6d`).

---

## Wygląd

### Pasek zapisu agenta i przycisk powrotu bez motywu ciemnego

`app/projekty/[projectId]/agenty/[agentId]/page.module.css` (15 reguł) oraz
`components/workspace/BackButton.module.css` (5 reguł) nie mają reguł ciemnych
i wciąż niosą fiolet starej palety (`#17132e`, `#3b2f6b`).

To ostatnie resztki po przebudowie — reszta arkuszy ma znacznik
`/* themeified */`. Robota mechaniczna, dwa małe pliki.

### Brakujące tokeny `--ok-soft` i `--ok-line`

W czterech miejscach stoi surowe `rgba(82, 240, 191, …)` rozpisane na składowe
`--ok`. To ten sam błąd, który przy `--err` i `--warn` kosztował osobną rundę:
zmiana samego `--ok` zostawiłaby zielone tła pod zmienionym tekstem.

Wzór jest gotowy — `--err-soft` / `--err-line` w `app/globals.css`.

### Ekran rejestracji zostaje jasny

`/rejestracja` nie ma reguł ciemnych i po etapie 4b jest jedynym ekranem
publicznym w starym wyglądzie, podczas gdy `/logowanie` jest zawsze ciemny.

Świadomie: to zaślepka, do której **nie prowadzi już żaden odnośnik**
(link ze stopki logowania zniknął razem z przebudową ekranu). Ktoś tam trafi
tylko z zakładki albo z historii.

### Komunikat błędu logowania przy niskim oknie

Przy oknie około **900 × 500** dolna krawędź formularza wypada 4 px pod
krawędzią widoku. Pod spodem jest wtedy wyłącznie **pusty akapit błędu**
(`min-height: 14px`) — wszystko, co się klika i czyta, zostaje widoczne:
przycisk kończy się 44 px nad krawędzią, podpowiedź o adresie 18 px nad.

Potwierdzone na żywo w trybie urządzeń, nie tylko rachunkiem: przy 360 × 640,
900 × 500, 1200 × 600 i 1400 × 500 przycisk „Zaloguj" jest widoczny bez
przewijania. Pomiary powyżej robione były w ramce, która nie ma pasków
przeglądarki — realne okno wypadło tak samo.

Ale **realny komunikat błędu przy tym oknie wyszedłby częściowo pod krawędź.**

Wiąże to podłoga `400px` w `clamp(400px, 62dvh, 460px)` na `.pierscien`.
Zejście do 380 px kupiłoby te 4 px, ale pogorszyłoby wąskie okna: nadmiar
formularza poza wolne pole rośnie wtedy z 15 px do 18 px. Świadomie zostaje
400 px — nie pogarszamy przypadku częstego dla rzadkiego.

**Do rozważenia osobno:** czy pusty akapit błędu ma w ogóle zajmować miejsce.
Dziś rezerwuje 14 px zawsze, żeby pojawienie się komunikatu nie przesuwało
formularza. Alternatywa to pozycjonowanie bezwzględne pod formularzem — wtedy
nic nie rezerwuje miejsca, ale komunikat nachodzi na kreski pierścienia.

---

### Logo w pasku bocznym jest LCP na `/projekty` i ładuje się leniwie

Next zgłasza ostrzeżenie: obraz `/ragent-pelne.png` w `components/workspace/Sidebar.js`
został wykryty jako największy element pierwszego malowania, a nie ma `priority`.

**Dlaczego `priority` zostało zdjęte.** Przy logo 24 px (`ragent-napis.png`)
`priority` dokładało do `<head>` wstępne pobranie obrazu, którego motyw jasny
nigdy nie pokazuje — z ostrzeżeniem w konsoli o nieużytym preloadzie. Przy
152 × 195 bilans się odwrócił: obraz jest teraz na tyle duży, że sam wyznacza
LCP w motywie ciemnym.

**Ile to realnie waży.** Źródło ma 171 KB, ale to nie jest to, co leci po sieci —
`next/image` obsługuje pliki z `public/` i przekodowuje je:

| żądanie | odpowiedź |
|---|---|
| `/_next/image?url=…&w=256` | 37 578 B WebP |
| `/_next/image?url=…&w=384` | 64 274 B WebP |
| surowy `/ragent-pelne.png` | 175 029 B PNG |

**Z tego wynika, że rekompresja źródła nic nie da** — Next i tak koduje od nowa.
To odpada jako rozwiązanie, choć wygląda kusząco.

**Opcje i ich realny koszt:**

- `loading="eager"` — ładuje od razu, ale **nie** dokłada `<link rel=preload>`,
  więc nie ma ostrzeżenia o nieużytym preloadzie. Cena: leniwy obraz pod
  `display: none` nigdy się nie pobiera (brak pudełka = brak przecięcia
  z widokiem), a `eager` pobiera zawsze. Motyw jasny zapłaciłby ~37 KB
  za obraz, którego nie widać.
- `priority` z warunkiem na motyw — wymaga odczytu motywu w JS. To dokładnie
  to, czego unikaliśmy: przy pierwszym renderze atrybutu `data-theme` jeszcze
  nie ma, a przy ustawieniu „Automatyczny" nie ma go nigdy, więc zgadywanie
  kończy się migotaniem albo złym wyborem.

**Czego nie sprawdziłem:** samego ostrzeżenia — `/projekty` wymaga zalogowania.
Warto przy okazji zobaczyć, czy logo jest LCP zawsze, czy tylko przy krótkiej
liście projektów. Jeśli tylko wtedy, dług jest węższy, niż się wydaje.

---

## Dane

### `rag_collections.updated_at` nie znaczy „ostatnia praca"

Kolumna **nie ma wyzwalacza** — w `supabase/rag/session-2-schema.sql:50` to zwykłe
`timestamptz not null default now()`. Rusza ją **jedno** miejsce w całym kodzie:
`setCollectionStatus` w `lib/rag/collections.js:169`, czyli archiwizacja
i przywracanie kolekcji.

**Czego NIE zmienia:** wgrania dokumentu, zaindeksowania, usunięcia pliku,
wyciągnięcia pojęć, przeliczenia mapy. Wszystkie te operacje dotykają
`rag_documents` i `rag_chunks`, nie wiersza kolekcji.

Znaleziono przy projektowaniu ekranu wejściowego Kreatora RAG: prototyp pokazywał
„ostatnia zmiana 2 dni temu", a ta data byłaby datą utworzenia albo ostatniego
archiwizowania. Dla kogoś, kto wczoraj wgrał dwadzieścia plików, po prostu
nieprawdziwa. **Datę usunięto z ekranu, został sam licznik kolekcji.**

Druga pułapka w tym samym miejscu: `listCollections` sortuje po **`created_at`**
(`lib/rag/collections.js:121`), nie po `updated_at`. Nawet gdyby data była
prawdziwa, `kolekcje[0].updatedAt` **nie jest** najświeższą — trzeba liczyć
maksimum z całej tablicy.

Trzy drogi, gdyby data kiedyś była potrzebna:
- liczyć `max(rag_documents.updated_at)` — drugie zapytanie albo endpoint
  podsumowania;
- dorobić wyzwalacz na `rag_collections` — nowa migracja, i dopiero od jej
  wykonania dane są prawdziwe (starych nie odtworzy);
- zostawić bez daty, jak teraz.

### Ostrzeżenie „brak tabeli `rag_search_log`" myli przyczynę

Przy każdym wyszukiwaniu ze skryptu konsolowego leci:

> `[rag] Dziennik wyszukiwań nie działa: brak tabeli rag_search_log.`
> `Uruchom sql/session-log-wyszukiwan.sql albo ustaw RAG_SEARCH_LOG=off.`

**Tabela istnieje.** Sprawdzone na żywo 2026-08-10: 140 wierszy, kolumna
`owner_id` na miejscu. Inaczej być nie mogło — `supabase/016_rls_rag.sql:127-131`
przerywa **całą** migrację RLS, gdy brakuje którejkolwiek z sześciu tabel `rag_*`,
a ta migracja przeszła.

Prawdziwy błąd zapisu to:

```
23502: null value in column "owner_id" of relation "rag_search_log"
       violates not-null constraint
```

`016` nadało `owner_id` wartość domyślną `auth.uid()` i więz `not null`
(`016_rls_rag.sql:254`, `:261`). Zapis **bez sesji użytkownika** — czyli
z klienta na kluczu `service_role`, jak w skryptach konsolowych — daje
`auth.uid() = NULL` i wiersz odpada.

**Dlaczego komunikat mówi co innego.** `lib/rag/search-log.js:72` rozpoznaje
„brak tabeli" po tym, że treść błędu zawiera napis `rag_search_log`. Zawiera go
**każdy** błąd zapisu do tej tabeli, łącznie z powyższym. Warunek nie odróżnia
więc „nie ma tabeli" od „tabela jest, ale odrzuciła wiersz", a osłona niżej
zamienia jedno i drugie na to samo ostrzeżenie.

**Czego to NIE dotyczy: produkcji.** Tam zapis idzie klientem z sesją
(`app/api/rag/collections/[id]/search/route.js:29`), `auth.uid()` ma wartość
i dziennik działa — 140 zapisanych wierszy jest na to dowodem. To usterka
diagnostyki, nie dziennika.

**Druga usterka w tym samym zdaniu:** ścieżka `sql/session-log-wyszukiwan.sql`
**nie istnieje**. Plik leży w `supabase/rag/session-log-wyszukiwan.sql`. Kto
uwierzy komunikatowi, szuka pliku pod adresem, którego nie ma. Ten sam zły adres
powtarza `docs/rag-SPEC.md:1099`.

Do naprawy przy okazji: rozpoznawać przypadki po `error.code` (`42P01` to brak
relacji, `23502` to złamany więz) zamiast po napisie w treści, i poprawić obie
ścieżki. Dopóki tego nie ma, **ostrzeżenia w skryptach konsolowych należy
ignorować** — nie znaczy tego, co pisze.

### Komunikat o progu 50 na mapie opisuje regułę, która już nie obowiązuje

`app/kreator-rag/_components/MapaFragmentow.jsx:2013-2035` rozgałęzia się na
`dane.chunkCount < dane.minChunks` i pisze jedno z dwojga:

> Mapa pojawi się po przekroczeniu progu **50** fragmentów z wektorem —
> i od razu **w całości, nie punkt po punkcie**.

> **Próg przekroczony.** Rzutowanie policzy się **po zakończeniu indeksowania**
> dokumentu — osie powstają raz, z całego zbioru, więc mapa czeka na komplet.

**Oba zdania są dziś nieprawdziwe dla ścieżki klienckiej**, i to w trzech
punktach naraz:

| co mówi napis | jak jest naprawdę |
|---|---|
| mapa czeka na **50** | widok buduje rzutowanie sam, gdy tylko `canBuild`, czyli od **3** fragmentów (`map.js:481`, `pca.js:29`); `buildCollectionProjection` też wymaga tylko 3 (`map.js:224-229`) |
| pojawi się **w całości** | pojawia się, a potem **przyrasta punkt po punkcie** — kolejne partie dokłada `dolaczFragmenty` |
| policzy się **po zakończeniu** | liczy się **w trakcie**, z warunku w `MapaFragmentow.jsx:818` |

**Próg 50 nie jest fikcją — tylko dotyczy czego innego.** Rządzi ścieżką
serwerową: `refreshProjectionAfterIndexing` buduje bazę przy `finished`, jeśli
liczba fragmentów sięga `config.projection.minChunks` (`map.js:410-412`). To ta
gałąź działa, gdy nikt nie patrzy na mapę. Napis opisuje ją, stojąc w widoku,
który jej nie używa.

**Skąd się to wzięło:** zdanie było prawdziwe, dopóki rzutowanie budował
wyłącznie serwer. Budowę z widoku dostało najpierw okno („wariant A"), a przy
naprawie podglądu osadzonego — także prawa kolumna strony kolekcji
(`9ebb546`). Tekst został z poprzedniego układu. Potwierdzone w przeglądarce
2026-08-10: przy pustej liście dokumentów i **bez** otwartego `?okno=1` punkty
narysowały się przy 70 fragmentach z wektorem, a licznik ruszył z zera.

**Dlaczego to nie jest kosmetyka:** to jest dokładnie ta klasa napisu, przed
którą ostrzega reguła 12.9 — interfejs twierdzi coś o mechanizmie, a mechanizm
robi co innego. Kto czyta „mapa pojawi się po 50", widzi ją przy 70 i nie wie,
czy to działa dobrze, czy źle. Poprzednia runda diagnozy potknęła się o ten
napis: został wzięty za opis zamiaru, a był opisem objawu.

Naprawa to sam tekst — **żadnej zmiany zachowania**. Trudność jest redakcyjna,
nie techniczna: komunikat musi mówić prawdę dla obu ścieżek naraz, nie
obiecywać kolejności, której nikt nie gwarantuje, i nie sugerować progu jako
warunku, skoro warunkiem jest `canBuild`. Warto przy okazji rozstrzygnąć, czy
ułamek `N / 50` ma nadal sens, skoro mianownik nie jest już tym, na co się
czeka.

### Zapis modeli konta przepisuje konfigurację jednego konta na drugie

**Zmierzone na żywo 2026-08-10, nie wydedukowane.** Konto `aideas@celebracja.com`
miało dziewięć modeli OpenRoutera i przypisanie agenta na `openai/gpt-5.6-terra`.
Po JEDNEJ zmianie roli „model do pojęć" w Ustawieniach miało sześć modeli —
**identycznych co do znaku z listą konta `pit321@op.pl`** — oraz jego przypisania
agenta i mentora. Osiem z dziewięciu modeli zostało skasowanych, w tym ten, na
którym stała cała demonstracja.

**Dlaczego to możliwe.** Zapis jest CAŁOŚCIOWY i sterowany stanem klienta.
`app/ustawienia/_modele/ModeleJezykowe.js:672-682` przy zmianie jednej roli
wysyła **całą listę** i **wszystkie trzy przypisania** ze stanu przeglądarki:

```js
zapisz(dopuszczone, { ...przypisania, [rola]: wybrany ? {…} : null });
```

Trasa (`app/api/settings/models/route.js:150-159`) kasuje wtedy każdy model
spoza przesłanej listy, dopisuje przesłane i dopiero na końcu zapisuje
przypisania. Jeśli `dopuszczone` pochodzi z **innego konta** — bo stan
`DopuszczoneContext` przeżył zmianę konta bez pełnego przeładowania — to
jedno kliknięcie przepisuje konfigurację jednego konta na drugie.

**Żadna osłona nie zawiodła i to jest najgorsze.** Klucz obcy złożony wytrzymał,
bo lista jest zapisywana PRZED przypisaniami (kolejność celowa, opisana w tej
trasie). Walidacja przypisań też przeszła, bo sprawdza je **względem nowej
listy, nie zapisanej** (`route.js:142-148`) — również celowo. Obie reguły
pilnują spójności WEWNĄTRZ żądania i robią to bez zarzutu. Żadna nie pyta, czy
przysłana lista ma cokolwiek wspólnego z listą tego konta sprzed sekundy.
Odpowiedź to `200`, bez ostrzeżenia; użytkownik widzi udany zapis.

**Czego to NIE dotyczy:** agentów. `agents` trzyma `provider` i `model` przy
sobie i nie ma klucza obcego do `allowed_models` — dowód wprost z bazy:
„Agent testowy" stoi na `anthropic/claude-opus-4-8`, którego na liście konta
nie ma i nie było. Rozmowa też nie sprawdza listy dopuszczonych.

**Dlaczego to nie jest drobiazg:** przy jednym użytkowniku to strata
konfiguracji do odtworzenia zapytaniem. Przy wielu to ścieżka, w której konto A
nadpisuje konto B — po cichu, ze statusem sukcesu. RLS tu nie pomoże, bo zapis
idzie z poprawną tożsamością; złe są DANE, nie uprawnienia.

Trzy kierunki naprawy, żadnego nie przesądzam:
- odświeżać listę przy zmianie tożsamości (leczy przyczynę, nie klasę błędu);
- zapis przyrostowy zamiast całościowego — osobno model, osobno przypisanie
  (znosi klasę błędu, ale trasa i tak musi sprawdzać przypisania względem
  listy, więc to nie jest zmiana kosmetyczna);
- znacznik wersji listy: klient odsyła wersję, którą przeczytał, serwer
  odrzuca zapis przy rozjeździe. Najmniej inwazyjne i jedyne, które chroni
  także przed dwiema kartami tego samego konta.

---

## Nazwa

### `AIdeas` w około 179 miejscach

Aplikacja nazywa się RAGent w tytule strony i w znaku w pasku bocznym.
W kodzie, komentarzach, migracjach i dokumentacji nadal jest `AIdeas`.
Większość to kosmetyka, ale **trzy miejsca mają skutek poza wyglądem**:

| miejsce | skutek zmiany |
|---|---|
| `lib/settings/defaults.js:6` | `SETTINGS_STORAGE_KEY = "aideas:settings"` — zmiana **kasuje wszystkim zapisane ustawienia** |
| `lib/providers/openrouter-naglowki.js:24-25` | nagłówek `X-Title` idzie na zewnątrz, widać go w cudzych statystykach OpenRoutera |
| `package.json:2` | `"name": "aideas-scaffold"` — pociąga `package-lock.json` |

Osobno: 47 wystąpień w `supabase/*.sql`, prawie wyłącznie w komentarzach
nagłówkowych. **Migracji już wykonanych nie należy edytować** — najwyżej
dopisać nową.

W `components/workspace/Sidebar.js` słowo `AIdeas` zostaje **celowo**: to tekst
zapasowy motywu jasnego, widoczny dopóki jasny nie zostanie przerobiony.

---

## Publikacja

### Brak pliku LICENSE

Repozytorium jest publiczne od 2026-08-09. Publiczne repozytorium **bez pliku
`LICENSE` oznacza domyślnie „wszystkie prawa zastrzeżone"** — nikt nie może
legalnie użyć, skopiować ani zmodyfikować kodu, mimo że go widzi. Jeśli to nie
jest zamierzone, trzeba dopisać licencję.

---

## Weryfikacja

### Skrót logowania deweloperskiego nigdy nie został wykonany

Po przeniesieniu na nowy ekran logowania kod skrótu (`SkrotDeweloperski`
w `app/logowanie/page.js`) **nie wykonał się ani razu**, bo w `.env.local`
nie ma `DEV_LOGIN_EMAIL` ani `DEV_LOGIN_PASSWORD` i endpoint słusznie zwraca
`available: false`.

Żeby sprawdzić: dopisać obie zmienne, zrestartować serwer, wejść na
`/logowanie`. Przycisk ma się pojawić pod pierścieniem.

To jedyna pozycja, która została z listy niesprawdzonych po etapie 4b.
Reszta przeszła na żywo, z sesją i w trybie urządzeń: złe hasło (polski
komunikat, pola odblokowane), powrót pod `?powrot=/czaty`, Enter w polu hasła,
furtka `?podglad=1` w obie strony, zaślepka `/rejestracja` oraz cztery rozmiary
okna — 360 × 640, 900 × 500, 1200 × 600 i 1400 × 500, w każdym przycisk
„Zaloguj" widoczny bez przewijania.
