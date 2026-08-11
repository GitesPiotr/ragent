# Ekran logowania RAGent — etap B: animacja

> Dokument roboczy etapu B. Etap A zamknięty i scalony do `master`.
> **Etap B zamknięty.** B0 do B6 wykonane, B7 **odpadł po pomiarze** (sekcja 4),
> B8 odwołany zakresowo. Scena animuje się w całości, razem z ruchem
> ograniczonym.
> Wersja z 11 sierpnia 2026, po sesji 5.

---

## 1. Gdzie jesteśmy

Ekran logowania **działa i wygląda docelowo, ale jest nieruchomy.** Widać głowę
agenta, napis RAGent i pierścień wokół panelu — wszystko statycznie, jak ostatnia
klatka animacji. Logowanie, obsługa błędów i powrót pod właściwy adres działają.

Nikt poza tobą nie wie, że czegoś brakuje. To jest stan, na którym można stać
dowolnie długo.

**Adresy i gałęzie**

| co | gdzie |
|---|---|
| repozytorium | `github.com/GitesPiotr/ragent` (**publiczne**) |
| produkcja | `ragent-zeta.vercel.app` — stoi na `feature/tryb-demo`, nie na `master` |
| gałąź scalona (etap A) | `feature/etap-4b-logowanie` → `master` (commit `54c22b8`) |
| gałąź robocza (etap B) | `feature/etap-b-animacja`, odbita od `master` na `f14443b` |
| prototyp | `docs/prototyplogowania.html` — **źródło prawdy dla wartości** |

Prototyp ma być czytany, nie odtwarzany z opisu. Zawiera zmierzone stałe
(`-6,78%` podciągnięcia napisu, `0,334` rozmiaru, `viewBox 624 649`), których
nie da się zgadnąć. Kopia w repozytorium jest identyczna z tą, na której
powstawał etap A — sprawdzone porównaniem sum kontrolnych po normalizacji
końców linii.

**Efektów tej pracy nie widać na produkcji.** Wdrożona jest gałąź pokazowa,
więc etap B testuje się wyłącznie lokalnie na `localhost:3000`.

**Push wstrzymany.** Od sesji 1 commity zostają lokalne; całą historię
wypchniemy dopiero po domknięciu animacji. Konsekwencja, o której łatwo
zapomnieć: **commit lokalny to publikacja odroczona, nie prywatna.** Zakaz
danych wrażliwych obowiązuje ostrzej, nie luźniej — nic, czego nie chcemy
w publicznym repozytorium, nie ma prawa wejść do żadnego commitu, bo historia
poleci w całości. Znika też zdalna kopia zapasowa: do czasu pierwszego pusha
jedynym egzemplarzem pracy jest dysk lokalny.

---

## 2. Co zrobił etap A

Osiem commitów. Kolejność miała znaczenie: zasób przed użyciem.

| commit | co |
|---|---|
| A0 | prototyp do repozytorium — bez tego reszta jest nieodtwarzalna |
| A1 | dwa obrazy wycięte z base64 do `public/logowanie/` jako WebP |
| A2 | Space Grotesk tylko na trasie logowania |
| A3 | scena i paleta własna, bez tokenów aplikacji |
| A4 | formularz na nowej scenie, logika bez zmian |
| A5 | rejestracja: trasa zostaje, formularz wyłączony |
| A6 | podgląd `?podglad=1` dla zalogowanego, tylko poza produkcją |

### Decyzje, które obowiązują dalej

**Ekran logowania jest ZAWSZE ciemny**, niezależnie od `data-theme`.

Uzasadnienie jest jedno i nie zmieniło się od etapu A: **hełm to nieprzezroczysty
prostokąt bez kanału alfa**, a jego własne tło to `#0c1220`. Ilustracja jest
z natury ciemna i na jasnym tle pokazuje szew. To wystarcza.

> **Uwaga historyczna, żeby nikt nie szukał nieistniejącego.** Pierwotna wersja
> tego dokumentu i komentarza w `logowanie.module.css` opierała decyzję na tym,
> że domyślnym motywem aplikacji jest „auto", więc nowy użytkownik na jasnym
> systemie zobaczyłby stary wygląd na Arialu jako pierwszy ekran. Commit
> `c2377a4` zmienił domyślkę na ciemną i ta przesłanka przestała obowiązywać.
> Decyzja stoi na przesłance wyżej, która się nie zmieniła. Poprawione w B0.

**Paleta prototypu to literały na elemencie ekranu, nigdy w `:root`.** Dwie nazwy
przemianowane, bo kolidowały z globalnymi:

| prototyp | nowa nazwa | dlaczego |
|---|---|---|
| `--line #6ee7e0` | `--siatka` | globalne `--line` to kolor każdej ramki w aplikacji |
| `--bg #0c1220` | `--tlo` | globalne `--bg` to `#040611` |
| `--ink` | zostaje | wartość identyczna, kolizja pozorna |

**`--tlo` nie jest kwestią gustu.** Hełm to nieprzezroczysty prostokąt bez kanału
alfa, a `#0c1220` to kolor zmierzony z jego rendera. Postawienie ekranu na `--bg`
aplikacji da widoczny prostokąt wokół głowy. Gdyby ktoś kiedyś „poprawił" to
na token — właśnie dlatego nie wolno.

**`color-scheme: dark` jawnie na elemencie ekranu.** Bez tego autouzupełnianie
Chrome w motywie jasnym wstawia biały prostokąt w środek granatowej sceny.

**Ciemność sięga poza `.ekran` — dwie reguły na końcu `globals.css` (B0).**
`.ekran` maluje się nieprzezroczyście na `100dvh`, więc w widocznym obszarze
przykrywa wszystko. Poza jego zasięgiem zostają dwie rzeczy i obie idą
z `<html>`/`<body>`: pasek przewijania okna (barwy z `color-scheme` na `:root`)
i kanwa okna (tło z `<body>`, bo `html` nie ma własnego). Stąd:

```css
:root:has([data-ekran="logowanie"]) { color-scheme: dark; }
body:has([data-ekran="logowanie"]) { background: #0c1220; }
```

Trzy rzeczy, które trzeba o nich wiedzieć:

- **Muszą zostać na końcu pliku.** `:root:has([data-ekran="…"])` ma specyficzność
  0-2-0, dokładnie tyle samo co `:root[data-theme="light"]` wyżej. Remis
  rozstrzyga kolejność w źródle. Przeniesione w górę przestają działać
  w motywie jasnym, czyli w jedynym, w którym są potrzebne.
- **Selektor idzie po atrybucie, nie po klasie**, bo nazwa `.ekran` pochodzi
  z modułu CSS i jest haszowana przy budowaniu. Znacznik `data-ekran` stoi
  w `app/logowanie/page.js`.
- **Druga reguła celowo przegrywa w motywie ciemnym.** `body:has(…)` ma 0-1-1,
  a poświata na `body` (`:root[data-theme="dark"] body`) 0-2-1. Tak ma być:
  w ciemnym kanwa jest ciemna sama z siebie, a gradient ma zostać. Nie wyrównuj
  tej asymetrii ani podnoszeniem specyficzności, ani `!important` — zgasisz
  poświatę.

**Krój: Space Grotesk tylko dla napisu RAGent**, reszta na Instrument Sans.
Deklarowany w `app/logowanie/layout.js`, nie w layoucie głównym — inaczej byłby
wstępnie ładowany na wszystkich trasach. Zweryfikowane liczbą plików woff2:
12 na `/logowanie`, 10 na pozostałych.

**Zachowane co do joty z poprzedniej wersji:** podział `LoginPage`/`LoginForm`
z barierą `<Suspense>`, `readableAuthError`, `router.replace(powrot)` +
`router.refresh()`, prawdziwy `<form onSubmit>`, logowanie deweloperskie.

### Układ — poprawka, która wyszła dopiero na żywo

Pierwotny próg „poniżej 600 px ukryj głowę" **działał dokładnie tam, gdzie był
napisany, i był postawiony w złym miejscu.** Głowa przestaje się mieścić przy
980 px, gdy układ składa się do jednej kolumny, nie przy 600. W paśmie 601–980
strona miała 1163 px wysokości niezależnie od szerokości — formularz wychodził
123 px poza okno.

Rozwiązanie bez progów, oparte na tym, że hełm (624:649) i pierścień (1:1) są
prawie kwadratowe, więc ograniczenie szerokości ogranicza wysokość:

```css
.glowaWnetrze { max-width: min(760px, 60dvh); }
.pierscien    { max-width: clamp(400px, 62dvh, 460px); }
@media (max-width: 980px) and (max-height: 1160px) { .glowa { display: none } }
```

Podłoga pierścienia to 400 px — poniżej 360 px `clamp()` przestaje ustępować
i formularz wchodzi w kreski.

Napis dostał rampę zamiast skoku: `min(100px, calc((100vw - 56px) / 3.6))`,
gdzie 3,557 to zmierzona szerokość słowa „RAGent" na piksel rozmiaru kroju.

**Jeden przypadek pozostaje minimalnie ujemny:** przy oknie 900 × 500 pusty
akapit błędu (`min-height: 14px`) wystaje 4 px pod krawędź. Wszystkie elementy
sterujące są widoczne. Świadomie nie poprawiane — obniżenie podłogi do 380 px
pogorszyłoby wszystkie wąskie okna dla jednego przypadku. To jest zarazem
jedyny przypadek, w którym ekran logowania ma co przewijać, czyli jedyny,
w którym widać pasek przewijania — stąd reguły z B0.

### Przebłysk gotowej sceny przed startem — ta sama kategoria

Znane, potwierdzone okiem, **zostawione z powodem**.

Przy każdym wejściu z przeładowaniem — a więc przy każdym `F5` — przez ułamek
sekundy widać gotową scenę, zanim animacja ruszy od zera. `/logowanie` jest
prerenderowane jako `○ (Static)`, a etap A3 renderuje w JSX **klatkę końcową**,
świadomie, żeby ekran bez JavaScriptu wyglądał docelowo. `useEffect` biegnie po
pierwszym malowaniu, więc przeglądarka zdąży pokazać to, co przyszło z serwera.

**Nie naprawiamy tego**, bo jedyne prawdziwe lekarstwo to renderować w JSX
klatkę **początkową**, czyli pustą scenę — a wtedy każdy bez JavaScriptu i każdy,
u kogo skrypt nie dojdzie, zobaczyłby pusty ekran zamiast docelowego. Wada
trwała zamiast chwilowej. Druga droga, `useLayoutEffect`, odpada osobno: React
ostrzega przy budowaniu, że nie działa na serwerze, a trasa jest prerenderowana.

Szczegóły i historia tej decyzji stoją w komentarzu nad efektem indeksującym
w `app/logowanie/_components/Glowa.jsx`.

---

## 3. Co pokazał zwiad — i dlaczego etap B to nie jest przenoszenie

To jest najważniejsza część tego dokumentu. **Prototyp działa idealnie i to nic
nie znaczy dla etapu B.**

Prototyp wczytuje się raz, animacja rusza raz, strona nigdy się nie odmontowuje.
W tych warunkach żaden z poniższych błędów nie występuje. Wszystkie pojawiają się
dopiero w Reakcie, przy wejściu i wyjściu z trasy.

### Cztery moduły i cztery problemy

Prototyp ma `HeadMesh`, `RAGentMark`, `RAGentRing`, `RAGentAuth` — wszystkie
sięgają po `document`/`window` **na poziomie modułu**, czyli natychmiast po
wczytaniu.

**Problem 1 — `'use client'` nie wystarcza.** Komponenty klienckie są też
prerenderowane na serwerze podczas `npm run build`, gdzie `document` nie istnieje.
Kod z linii 319–337 (budowa węzłów SVG), 665–701 (pierścień) i 706+ (elementy
formularza) wykonuje się przy wejściu do modułu. Musi trafić do `useEffect`
albo do modułu ładowanego dynamicznie z `ssr: false`.

> **Potwierdzone pomiarem, i jest gorzej, niż brzmi.** `npm run build` oznacza
> `/logowanie` jako `○ (Static)` — trasa jest prerenderowana przy budowaniu.
> Dostęp do `document` na poziomie modułu **nie wysypie `npm run dev`, tylko
> `npm run build`**, czyli najpóźniej, jak się da. Bezpieczna ścieżka to
> `next/dynamic` z `ssr: false`: powłoka dalej prerenderuje się na `○`,
> a kod klienta wchodzi osobnym kawałkiem.

**Problem 2 — React nie może zarządzać tymi dziećmi.** Moduły dobudowują elementy
przez `createElementNS` + `appendChild`. Bezpieczny wzorzec: grupy zostają w JSX
trwale puste, z `ref`, wypełnia je efekt. Jeśli React kiedykolwiek wyrenderuje
im dzieci, wymiecie wszystko.

**Problem 3 — podwójne montowanie w Strict Mode.** React 19 montuje → odmontowuje
→ montuje ponownie. `next.config.mjs` nie wyłącza Strict Mode, więc obowiązuje
domyślnie. Konkretne skutki:

- pierścień dostałby **96 kresek zamiast 48** — *rozbrojone w A3*, bo
  `Pierscien.jsx` liczy kreski w JSX, nie przez `createElementNS`
- `scat`, `nodes`, `edges`, `welds` to tablice na poziomie modułu (linie 324,
  331–332, 352) — narastają, więc drugie montowanie animuje **276 węzłów
  i 580 krawędzi** zamiast 138 i 290
- dwie pętle `requestAnimationFrame` naraz, obie mutujące to samo `t` — animacja
  jedzie dwa razy szybciej i zżera dwa razy więcej procesora
- `window.HeadMesh` i pozostałe trzy to globalne singletony przypisywane przy
  wejściu do modułu; druga instancja nadpisuje pierwszą, a pętla pierwszej
  dalej chodzi

**Lekarstwem nie jest wyłączenie Strict Mode.** Lekarstwem jest stan w `ref`,
pełne sprzątanie w funkcji czyszczącej i budowanie idempotentne — czyszczenie
kontenera przed wypełnieniem.

**Problem 4 — pętla `rAF` nie ma warunku stopu.** Linia 411 wywołuje
`requestAnimationFrame(frame)` bezwarunkowo, z komentarzem „wznowienie zawsze,
choćby wyżej coś padło". W Reakcie to znaczy: **każde montowanie zostawia pętlę
na zawsze.**

### Moduły rozmawiają przez `window`

`frame()` woła `window.RAGentMark.at(t)` (410), `RAGentMark` czyta
`window.HEAD_TIMING` przy wejściu do modułu (458), `RAGentAuth` woła `HeadMesh`
i `RAGentRing`. W przeglądarce decyduje kolejność znaczników `<script>`,
w bundlerze — kolejność importów. To musi zostać zastąpione jednym hookiem
zegara albo referencjami, inaczej działanie zależy od przypadku.

### Rusztowanie, którego nie wolno usunąć naiwnie

Nagłówek prototypu wymienia cztery rzeczy do usunięcia: stałą `DEV`, blok
`.dev-status`, jego reguły CSS i `#devbar`. **Ta lista jest niekompletna,
a wykonana dosłownie — psuje prototyp.**

`#devbar` trzyma dziesięć identyfikatorów czytanych przez moduł głowy, **dziewięć
bez zabezpieczenia**: `pr` (404, 433), `play` (413), `loop` (415), `wl` (416),
`sc` (417), `dir` (418, 427), `helm` (419, 428), `eye` (421, 424),
`preset` (432), `devbar` (827). Linie 413–433 wykonują się przy wejściu do modułu,
więc usunięcie `#devbar` rzuca `TypeError` natychmiast i `window.HeadMesh` nigdy
nie powstaje — animacja po prostu nie rusza. Do tego `btn` z linii 413 jest
używany w `frame()` w linii 408, poza `try/catch`, więc zatrzymałby pętlę `rAF`
na amen.

Osobno: `document.getElementById('pr').value = …` siedzi w linii 404, wewnątrz
`apply()`, czyli **w gorącej ścieżce, 60 razy na sekundę**, żeby przesuwać suwak
panelu deweloperskiego.

**Czego nie ma na liście, a jest robocze:**

- `#appScreen` / `.app` / `.app__inner` / `#logout` (CSS 204–210, HTML 282–288)
  — zaślepka docelowego widoku, czytana bez zabezpieczenia w linii 713.
  W aplikacji sukces to `router.replace(powrot)`, więc cały ten ekran
  i funkcje `enterApp()`/`reset()` odpadają
- globalny `addEventListener('error')` (658–662) — wpisuje **dowolny** błąd
  aplikacji do `#loginErr`. Nie może przetrwać
- skrót klawiszowy `D` (823–830)
- `DEV = true` wyłącza także walidację (linia 777), więc przestawienie jej
  zmienia zachowanie w dwóch miejscach

**Pozycja odwrotna:** brak `<form>` w prototypie (wyjaśniony w liniach 38–43)
to obejście dla `file://`. W aplikacji jest prawdziwy `<form onSubmit>`
i ma zostać — działa z menedżerami haseł i obsługuje Enter.

### Wydajność — ryzyko jest gdzie indziej, niż się wydaje

| źródło kosztu | przewidywana skala | co pokazał pomiar (sesja 5) |
|---|---|---|
| 443 elementy SVG, każdy z `setAttribute` co klatkę | ~890 zapisów atrybutów na klatkę ≈ **53 000/s** przy 60 fps | **skala się zgadza, koszt nie potwierdzony.** Layout 143,5 ms (2,3%) i ani jedna pozycja siatki pod nim |
| `getComputedStyle` w pętli rysującej płótna (592, 606–607) | setki wymuszonych odczytów stylu na klatkę | zdjęte w B4 — odczyt wyszedł poza pętlę |
| `trace()` (516–536) — skan Moore'a po `getImageData` + Douglas-Peucker | ~117 000 pikseli, **synchronicznie**, w oknie pierwszego malowania | **92 690 pikseli**, a najdroższy okazał się `getImageData`, nie skan Moore'a |
| `mix-blend-mode: screen` na `#flare` (230) | osobna warstwa kompozycji, potrafi wyłączyć szybkie ścieżki GPU | nie mierzone osobno, nie wypłynęło w zestawieniu |

Szacunek 890 zapisów na klatkę **zostaje jako opis skali** — liczba elementów
i zapisów jest prawdziwa. Zmierzony koszt tej skali jednak **nie potwierdza**:
zapisy dzieją się, ale nie kosztują tego, czego się po nich spodziewano.
Rozstrzygnięcie i przyczyna — przy kryterium B7 w sekcji 4.

Zwiad typował tak: *najgroźniejsze jest `trace()` razem z budową 443 węzłów,
bo oba są synchroniczne i dzieją się przed pierwszym malowaniem, czyli
dokładnie wtedy, gdy użytkownik chce zacząć pisać w polu e-mail.* Kierunek był
trafny — koszt faktycznie siedzi w oknie pierwszego malowania i faktycznie
w obsłudze napisu — ale **konkretny winowajca był wskazany źle** (patrz niżej:
`getImageData`, nie skan Moore'a).

**Pomiar z sesji 5.** Dławienie procesora 4× potwierdzone, nagranie 7,08 s,
pełne przeładowanie z animacją:

| pozycja | czas | udział |
|---|---|---|
| Scripting | 4037 ms | 57% |
| Rendering | 1615 ms | 23% |
| Painting | 649 ms | 9% |
| Recalculate Style | 781,3 ms | 12,3% |
| Layout | 143,5 ms | 2,3% |
| Paint | 296,5 ms | 4,7% |
| Pre-paint | 143,1 ms | 2,2% |
| mediana klatek | 60–63/s | — |

**Najdroższa pozycja renderowania to `Recalculate Style`, i nie stoi za nią
siatka.** Pod nią siedzi `ZnakRAGent.useEffect` z linii 200 — czyli **napis**,
który po B4 jest już na canvas. Siatka głowy, dla której planowano B7, nie
pojawia się w tym zestawieniu wcale.

Obrazy są najmniejszym problemem — po wyjęciu z base64 ważą 21 KB łącznie.

---

## 4. Plan etapu B

Gałąź `feature/etap-b-animacja` odbita od `master` na `f14443b`.

| commit | zakres | stan |
|---|---|---|
| **B0** | ekran ciemny także poza własnym pudełkiem, uzasadnienie motywu poprawione | zamknięty (`1ab7d79`) |
| **B0b** | dokument przekazania do repozytorium | zamknięty (`61755d9`) |
| **B1** | harmonogram jako czyste funkcje + test danych siatki | zamknięty (`b6fe574`) |
| **B2** | jeden zegar sceny: `rAF` z warunkiem stopu i sprzątaniem | zamknięty (`a6a63f2`) |
| **B3** | głowa: animacja, budowanie idempotentne | zamknięty (`4cb7f0f`) |
| **B4** | znak RAGent na płótnie, `getComputedStyle` poza pętlą | zamknięty (`6c90d54`) |
| **B5** | pierścień, próg 2000 ms, animacja raz na dokument | zamknięty (`2347b80`) |
| — | cofnięcie progu z 600 na 2000 | zamknięty (`5e28f42`) |
| **B6** | `prefers-reduced-motion` obejmuje całą scenę i zdejmuje próg logowania | zamknięty (`e2d5715`) |
| **B7** | siatka na canvas | **ODPADA** — pomiar sesji 5 nie spełnił żadnego kryterium |

> **B8 odwołany — decyzja zakresowa, nie brak czasu.** Miganie pierścienia
> i czerwone oko przy nieudanym logowaniu było **rozszerzeniem poza etap B**,
> nie luką w nim: etap B miał przenieść animację z prototypu, a prototyp
> takiego zachowania nie ma. Wycena: 2–4 h pracy w większości wizualnej,
> z granicą trzech błysków na sekundę jako warunkiem, nie sugestią.
> Gdyby kiedyś wróciło, ma wrócić **jako osobny etap**, a nie doklejone
> do animacji — inaczej etap B nigdy się nie kończy.

B1 skurczył się wobec pierwotnego planu, bo dane siatki (138 węzłów, 290 krawędzi,
11 kropek, 4 wielokąty) weszły już w A3 i renderują się statycznie w klatce
końcowej.

### Co zostawił B1 do odebrania w B3

**`ostatniSzew` bez szwów zwraca `null`, nie `-Infinity`.** Prototyp liczy
`Math.max()` z pustej listy i dostałby `-Infinity`, co poszłoby prosto do
przezroczystości hełmu. Na obecnych danych przypadek nie może wystąpić
(15 szwów), ale kontrakt jest jawny — **i `null` ma być obsłużony jawnie,
a nie wpuszczony w arytmetykę.** W JavaScripcie `null` w działaniu koerkuje się
do zera, więc `(t - null) / 700` z linii 399 dałoby `t / 700` i spawy zapaliłyby
się od pierwszej klatki. To jest dług B1 do spłacenia w B3.

**`SPAW_MS` (`WELD` w prototypie) celowo nie wchodzi do `CALOSC_MS`.** Sprawdzone
w źródle, linia 353: `DUR()` sumuje pięć składników, spawów wśród nich nie ma.
Zablokowane testem, który padnie, gdyby ktoś „poprawił" sumę.

**Nieznany kierunek rzuca wyjątkiem** — świadome odstępstwo od prototypu.
Tam `dir` szedł z `<select>` o trzech ustalonych wartościach (linie 296–300:
`ltr`, `rtl`, `rand`) i literówka nie miała skąd wejść; tutaj kierunek jest
zwykłym parametrem podawanym z kodu, a ciche losowanie dawałoby animację
wyglądającą prawie dobrze. Czyli błąd, który sam się nie zgłasza.

### Decyzje podjęte, obowiązujące

**Animacja raz na dokument.** Pierwsze wejście gra pełne 4220 ms
(700 + 2400 + 420 + 300 + 400), kolejne wchodzą na klatce końcowej.

Znacznik to **zwykła zmienna na poziomie modułu** w `ZegarSceny.jsx` — jedyny
stan modułowy w całym etapie B i jedyny dozwolony. Powód: potrzebujemy czasu
życia **dłuższego niż montowanie komponentu, krótszego niż karta**, a moduł
ładuje się raz na dokument i ginie razem z nim. To jest dokładnie ten czas,
wyrażony wprost, bez magazynu i bez sprzątania.

| co robi użytkownik | co widzi |
|---|---|
| F5, wpisanie adresu, nowa karta | nowy dokument → **pełny przebieg** |
| nawigacja klientowa tam i z powrotem | ten sam dokument → klatka końcowa |

Był tu wcześniej `sessionStorage` i okazał się **za trwały**: przeżywał
odświeżenie, więc po pierwszym wejściu w danej karcie animacji nie dało się już
zobaczyć inaczej niż w nowej karcie. Przy okazji odpadł `try/catch` — zmienna
nie rzuca w trybie prywatnym.

> **Pułapka:** znacznik trzeba stawiać **po zakończeniu przebiegu**,
> nie przy montowaniu. Przy montowaniu podwójne montowanie Strict Mode zapisze
> go przy pierwszym i odczyta przy drugim — animacja nie zagra ani razu
> w trybie deweloperskim i będziesz szukał błędu tam, gdzie go nie ma.

**Nieudane logowanie nie wznawia animacji.** Pierścień się zeruje, oko gaśnie,
głowa i napis stoją. To najczęstszy przypadek powrotu na ten ekran.

**`minMs` zostaje na 2000 — po nieudanej próbie skrócenia do 600.** Historia
jest tu ważniejsza od wyniku, bo pokusa wróci. Prototyp trzyma pierścień
w ruchu minimum 2 sekundy nawet wtedy, gdy Supabase odpowie w 200 ms, więc
skrócenie progu oszczędzało około 1,2 s przy **każdym** logowaniu — podatek
płacony codziennie. Odstępstwo weszło w B5 świadomie i z dobrym uzasadnieniem.

Zmierzone 629 ms okazało się jednak **za krótkie, żeby przebieg pierścienia
był w ogóle widoczny**: 48 kresek zapala się i gaśnie, zanim oko zarejestruje
to jako ruch. Animacja, której nie widać, nie płaci za swoją cenę — zostaje
sam koszt kodu i sama zwłoka, bez tego, po co ta zwłoka była. Próg wrócił do
wartości źródłowej (prototyp, linia 726: `minMs: 2000`) w commicie `5e28f42`.

**Próg jest DOLNĄ GRANICĄ, nie dodatkiem** — to się nie zmieniło. Pierścień
i uwierzytelnienie idą równolegle przez `Promise.all`, więc przy odpowiedzi
wolniejszej niż próg nie dokłada nic. Zmierzony narzut ponad próg: **29 ms**
(przy progu 600 odpowiedź natychmiastowa dała 629 ms, a odpowiedź po 1500 ms
dała 1527 ms, nie 2100).

**`prefers-reduced-motion` obejmuje wszystkie trzy komponenty** (prototyp
przeskakuje na koniec tylko głowę, linia 441), i wtedy próg 2000 ms znika.

**Panel deweloperski nie jest przenoszony** — patrz sekcja o rusztowaniu.

### Kryterium B7 — ustalone przed pomiarem

**Poniższy blok zostaje w dokumencie dokładnie w tym brzmieniu, w jakim był
zapisany PRZED pomiarem.** O to chodzi: ma być widać, że próg nie został
dopasowany do wyniku.

> Nagranie 6 s od wczytania w DevTools → Performance, dławienie procesora 4×.
> Przechodzimy na canvas, jeśli zachodzi którekolwiek:
> **(a)** mediana klatek poniżej 50 fps,
> **(b)** „Recalculate Style" + „Layout" przekracza 30% czasu nagrania,
> **(c)** w płomieniach w ogóle pojawia się Layout.

Kryterium (c) prawie na pewno zadziała: zapis atrybutów geometrii SVG
(`x1`, `y1`, `cx`, `cy`) unieważnia układ w każdej obecnej przeglądarce.
Planuj czas tak, jakby B7 był w zakresie.

### Rozstrzygnięcie — B7 ODPADA

Pomiar sesji 5: dławienie 4× potwierdzone, nagranie 7,08 s, pełne przeładowanie
z animacją.

| kryterium | próg | zmierzone | spełnione |
|---|---|---|---|
| **(a)** mediana klatek | poniżej 50 fps | **60–63/s** | NIE |
| **(b)** Recalculate Style + Layout | ponad 30% | **14,6%** (12,3 + 2,3) | NIE |
| **(c)** Layout w płomieniach | w ogóle obecny | obecny, 143,5 ms | **formalnie tak, ale nie nasz** |

**Kryterium (c) jest jedynym, które wymaga rozstrzygnięcia, i rozstrzyga się
na NIE.** Pod wierszem `Layout` stoją wyłącznie pozycje Reacta i routera:
`commitLayoutEffectOnFiber`, `flushLayoutEffects`, `useLayoutEffect`,
`InnerLayoutRouter`, `OuterLayoutRouter`. **Ani jedna z animacji siatki.**
To narzut montowania komponentów, a nie przeliczanie układu wywołane zapisem
atrybutów — czyli nie to, co kryterium (c) miało wyłapać.

**Przewidywanie „kryterium (c) prawie na pewno zadziała" było BŁĘDNE, i to
u podstawy.** Opierało się na założeniu, że zapis `x1`, `y1`, `cx`, `cy`
unieważni układ dokumentu. **Atrybuty geometrii wewnątrz SVG układem dokumentu
nie ruszają** — przeglądarka rozlicza wnętrze SVG osobno, własnym mechanizmem,
i zapis do nich nie unieważnia układu strony. Zdanie z kryterium mówiło
o zachowaniu przeglądarki, którego przeglądarki nie mają.

**Gdzie naprawdę siedzi koszt:** najdroższą pozycją renderowania jest
`Recalculate Style` (781,3 ms), a pod nią `ZnakRAGent.useEffect` z linii 200 —
czyli **napis, który po B4 jest już na canvas**. Siatka głowy, którą B7 miał
naprawiać, w zestawieniu nie pojawia się wcale. B7 celował w element, który
nie był problemem.

### Trzy razy w tym etapie przewidywanie wydajności rozminęło się z pomiarem

Warto to zapisać razem, bo pojedynczo każdy przypadek wygląda na drobiazg,
a razem układają się we wzór:

1. **117 000 pikseli okazało się 92 690.** Szacunek zawyżony o jedną czwartą.
2. **Najdroższy w obsłudze napisu okazał się `getImageData`, nie skan Moore'a.**
   Zwiad wskazywał na algorytm, a płacimy za odczyt bufora.
3. **Layout od zapisu atrybutów SVG nie wystąpił wcale.** Nie „był mniejszy,
   niż sądzono" — nie było go w ogóle, bo opierał się na nieistniejącym
   zachowaniu przeglądarki.

**Wniosek dla następnego etapu:** kryterium ustalać przed pomiarem — to się
sprawdziło i zostaje. Ale **przewidywań wyniku nie zapisywać jako niemal
pewnych.** „Prawie na pewno zadziała" kosztowało tu zaplanowaną sesję 6
i o mało nie kosztowało 2–3 godzin przepisywania siatki na canvas, która
działa dobrze. Przewidywanie ma być hipotezą do sprawdzenia, nie wnioskiem
zapisanym z góry.

---

## 5. Co sprawdzić w przeglądarce po etapie B

**To musi zrobić człowiek.** Testy przechodzą przy każdym z tych błędów.

**Cykl życia — tu mieszkają błędy podwójnego montowania:**

1. Policzyć `<line>` w pierścieniu w panelu Elements — ma być **48, nie 96**
2. Policzyć dzieci grupy siatki — ma być **428** (138 kółek + 290 kresek),
   nie 856. To liczba dotycząca **wyłącznie grupy siatki**, nie całej głowy:
   wszystkich animowanych elementów jest 443, bo dochodzi 15 w rozproszeniu
   (sekcja 6)
3. Wejść i wyjść z `/logowanie` **pięć razy pod rząd**, sprawdzić, czy liczba
   elementów nie rośnie i czy w Performance nie ma kilku równoległych pętli `rAF`.
   **Nawigacją klientową, nie przeładowaniem** — przeładowanie zeruje DOM
   i nie sprawdza niczego
4. Odmontować w trakcie animacji (przejść na inną trasę w 2. sekundzie) — brak
   błędów w konsoli, brak pętli chodzącej dalej

**Zachowanie animacji:**

5. Pierwsze wejście w nowej karcie: pełny przebieg 4220 ms
6. Odświeżenie `F5`: **znowu pełny przebieg** — znacznik ginie razem
   z dokumentem. Powtórzyć trzy razy pod rząd
7. Nowa karta: pełny przebieg. Nawigacja klientowa tam i z powrotem, **bez
   przeładowania**: klatka końcowa, bez odgrywania
8. Błędne hasło: pierścień się zeruje, oko gaśnie, głowa i napis stoją

**Ruch ograniczony:**

9. DevTools → Rendering → `prefers-reduced-motion: reduce`, przeładować:
   trzy komponenty statyczne, logowanie bez opóźnienia

**Wydajność:**

10. Nagranie 6 s przy dławieniu 4×, ocena według kryterium B7
11. Frame Rendering Stats w trakcie animacji
12. Pomiar `trace()` — jednorazowy, ale wypada w oknie pierwszego malowania
13. Lighthouse, **Total Blocking Time** — to ta jedna liczba, która pokazuje,
    czy ekran blokuje pisanie w polu
14. Zmiana rozmiaru okna w trakcie animacji — `measure()` przelicza obrys przy
    każdej zmianie szerokości, więc przeciąganie krawędzi to najgorszy przypadek

**Motyw (zamknięte w B0, zostaje jako regresja):**

15. Motyw jasny w Ustawieniach → `/logowanie`: `data-theme` na `<html>` to
    `light`, ale `getComputedStyle(document.documentElement).colorScheme` zwraca
    `dark`, tło `body` to `#0c1220`, pasek przewijania ciemny. W motywie ciemnym
    poświata `radial-gradient` na `body` **nietknięta**. Na `/ustawienia` nic
    się nie zmienia.

**Podgląd dla zalogowanego:** `?podglad=1` działa tylko poza produkcją.
Bez parametru `proxy.js` wyrzuca z `/logowanie` na `/projekty`.

---

## 6. Rozkład na sesje

Pierwotny szacunek mówił 4–8 godzin, po dołożeniu B0 i B0b urealniony na 7–11,
potem na 8,5–12,5 po dołożeniu B8. B8 wypadł z zakresu, potem **B7 odpadł po
pomiarze**. **Etap zamknął się w ~10 godzinach, na pięciu sesjach.** Podaję
liczbę, która się obroni, nie tę, która ładniej wygląda.

| sesja | zakres | czas | stan |
|---|---|---|---|
| **1** | B0, B0b, B1 | ~90 min | **wykonana** — trzy commity, `npm test` 759 → 788, zero animacji |
| **2** | B2, B3 | ~140 min | **wykonana** — pierwsza animacja na ekranie, testy → 841 |
| **3** | B4, B5 | ~150 min | **wykonana** — napis na płótnie, pierścień, oko, animacja raz na dokument, testy → 888 |
| **4** | próg 2000 (`5e28f42`), dokument (`3ec82a1`), B6 (`e2d5715`) | ~120 min | **wykonana** — testy → 895, B8 odwołany |
| **5** | przegląd punktów z sekcji 5, pomiar pod kryterium B7 | ~90 min | **wykonana** — B7 odpadł, **etap B zamknięty** |

**Sesja 6 (B7, siatka na canvas) NIE POWSTAŁA.** Była warunkowa i warunek nie
zaszedł — pomiar z sesji 5 nie spełnił żadnego z trzech kryteriów. Zaoszczędzone
2–3 godziny to nie jest praca odłożona, tylko praca, która okazała się
niepotrzebna: siatka nie była wąskim gardłem.

**Sesje 1 i 5 były bezpieczne o dowolnej porze** — kod testowalny automatycznie
i czytanie liczb z DevTools.

**Sesje 2 i 3 wymagały patrzenia i nie nadawały się na późny wieczór.**
Błędy cyklu życia Reacta nie rzucają wyjątków — objawiają się grzejącym laptopem
po piątym wejściu na stronę. Zmęczona głowa ich nie zauważy, a piąte wejście to
dokładnie ten test, który się wtedy pomija.

**Sesja 5 była bramką i zadziałała jako bramka** — rozstrzygnęła zakres, zamiast
go rozszerzyć. Bramka, która zawsze przepuszcza, nie jest bramką.

**Największym pojedynczym kawałkiem etapu było B3:** animuje 443 elementy SVG
(428 w grupie siatki — 290 kresek i 138 kółek — plus 15 w rozproszeniu), do tego
budowanie idempotentne i okręgi spawów przez referencję. B5 miało pułapkę ze
znacznikiem „już grano" opisaną wyżej. Oba przeszły przegląd sesji 5 bez uwag.

---

## 7. Zasady pracy

- **Zawsze najpierw plan, zatrzymanie, „zatwierdzam", dopiero kod.**
  Zatwierdzanie edycji pojedynczo, nie w trybie auto.
- **Commity etapami, po każdym zatrzymanie i sprawdzenie w przeglądarce.**
- **Bez pusha do odwołania.** Po commicie: `git status --short`,
  `git log --oneline -3`, zatrzymanie. Całą historię wypychamy po domknięciu
  animacji.
- **Zero danych wrażliwych w jakimkolwiek commicie.** Repozytorium jest
  publiczne, a commit lokalny to publikacja odroczona. Żadnych kluczy, haseł,
  tokenów, identyfikatorów konta demonstracyjnego ani treści zapytań do bazy.
  Pomiary z żywej aplikacji streszczamy jakościowo.
- **Testy w przeglądarce robi człowiek.** Claude Code nie widzi ekranu.
  Zrzuty ekranu są najskuteczniejszą metodą.
- **Mierzymy zamiast oceniać na oko.** Przy etapie A to wielokrotnie odwróciło
  decyzję: kontrast wizjera policzony z hexa dawał 15,64:1, zmierzony
  na wygenerowanym pliku 16 px — 8,89:1, bo piksel uśrednia się z tłem.
  W etapie B odwróciło uzasadnienie B0: przewidywany biały overscroll okazał się
  niewidoczny w Chrome na Windowsie, bo tam nie ma gumowego przewijania —
  obronił się wyłącznie jasny pasek przewijania.
- **Prototyp jest źródłem prawdy dla wartości.** Claude Code ma go czytać,
  nie odtwarzać z opisu. Dotyczy wartości, nie architektury: prawdziwy `<form>`,
  brak panelu deweloperskiego i przemianowane `--siatka`/`--tlo` to celowe
  odstępstwa, które mają zostać. Skrócony próg logowania był tu wymieniony jako
  czwarte i **został cofnięty** — patrz sekcja 4.
- **Odstępstwa od planu mają być zgłaszane, nie wykonywane po cichu.**
  W etapie A dwa razy odstępstwo było lepsze od instrukcji. W B1 pięć razy.

---

## 8. Instrukcja startu następnej sesji

1. Wklej ten dokument jako pierwszą wiadomość w nowym czacie.
2. Dopisz jedno zdanie: od czego chcesz zacząć. Następny w kolejce:
   **przegląd punktów z sekcji 5 i pomiar pod kryterium B7**.
3. Miej otwarte: aplikację na `localhost:3000` (wylogowaną albo z `?podglad=1`),
   terminal z Claude Code w katalogu projektu.
4. Jeśli coś w tym dokumencie rozminie się z rzeczywistością — najpierw
   `git status` i `git log --oneline -10`, potem decyzje.

**Kopia zapasowa.** Dopóki nie pushujemy, jedynym egzemplarzem pracy jest dysk
lokalny. Kopia folderu projektu przed każdą sesją to trzydzieści sekund.
