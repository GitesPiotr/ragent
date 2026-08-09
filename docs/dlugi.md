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

## Weryfikacja

### Skrót logowania deweloperskiego nigdy nie został wykonany

Po przeniesieniu na nowy ekran logowania kod skrótu (`SkrotDeweloperski`
w `app/logowanie/page.js`) **nie wykonał się ani razu**, bo w `.env.local`
nie ma `DEV_LOGIN_EMAIL` ani `DEV_LOGIN_PASSWORD` i endpoint słusznie zwraca
`available: false`.

Żeby sprawdzić: dopisać obie zmienne, zrestartować serwer, wejść na
`/logowanie`. Przycisk ma się pojawić pod pierścieniem.
