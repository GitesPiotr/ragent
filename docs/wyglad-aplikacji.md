# Wygląd aplikacji AIDEAS — dokumentacja wizualna

Dokument opisuje stan wizualny na dzień **2026-08-01**, gałąź `feature/rag-rdzen`,
commit `ddadc0e`. Celem jest odtworzenie wyglądu jako statyczny HTML **bez dostępu
do repozytorium** — dlatego każda wartość podana jest liczbowo, z plikiem i numerem
linii.

Zakres: 1 arkusz globalny (`app/globals.css`) + **16 arkuszy modułowych**
(`*.module.css`), łącznie ok. 5 500 linii CSS.

**Konwencja zapisu:** `plik:linia` odsyła do pojedynczej reguły, `plik:od-do` do bloku.
Ścieżki względem katalogu głównego projektu.

---

## 1. FUNDAMENT

### 1.1 `app/globals.css` — cała zawartość (63 linie)

To **jedyny** arkusz globalny. Nie zawiera żadnych klas — wyłącznie zmienne motywu,
reset i trzy reguły elementowe.

#### Zmienne `:root` (globals.css:3-7)

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
  color-scheme: light;
}
```

To **wszystkie** zmienne globalne aplikacji. Są dwie. Nie ma zmiennych na kolory
akcentu, odstępy, promienie ani typografię.

#### Reset (globals.css:52-56)

```css
* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}
```

Uwaga na kolejność: reguła `*` stoi **po** regule `body` (globals.css:41-50), ale
że dotyczy innych właściwości, kolejność nie ma tu skutku.

#### `html` (globals.css:31-33, 35-39)

```css
html            { height: 100%; }
html, body      { max-width: 100vw; overflow-x: hidden; }
```

#### `body` (globals.css:41-50)

```css
body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--foreground);          /* #171717 jasny / #ededed ciemny */
  background: var(--background);     /* #ffffff jasny / #0a0a0a ciemny */
  font-family: Arial, Helvetica, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

#### `a` (globals.css:58-61)

```css
a { color: inherit; text-decoration: none; }
```

Wszystkie linki dziedziczą kolor tekstu i nie mają podkreślenia — każde podkreślenie
w aplikacji jest dodawane lokalnie (np. `sections.module.css:1031`).

---

### 1.2 Motywy — jak działa `data-theme`

Atrybut `data-theme` ustawiany jest na `<html>`. Trzy stany:

| stan | atrybut | źródło |
|---|---|---|
| Auto | brak atrybutu | preferencja systemu (`prefers-color-scheme`) |
| Wymuszony ciemny | `data-theme="dark"` | przełącznik w /ustawienia |
| Wymuszony jasny | `data-theme="light"` | przełącznik w /ustawienia |

Wartości zmiennych w każdym motywie:

| zmienna | jasny | ciemny | linia (jasny / auto-ciemny / wymusz.-ciemny / wymusz.-jasny) |
|---|---|---|---|
| `--background` | `#ffffff` | `#0a0a0a` | globals.css:4 / :12 / :20 / :26 |
| `--foreground` | `#171717` | `#ededed` | globals.css:5 / :13 / :21 / :27 |
| `color-scheme` | `light` | `dark` | globals.css:6 / :14 / :22 / :28 |

Mechanika trzech bloków:

```css
@media (prefers-color-scheme: dark) {          /* globals.css:10-16 */
  :root:not([data-theme="light"]) { … }        /* auto: OS ciemny, user nie wymusił jasnego */
}
:root[data-theme="dark"]  { … }                /* globals.css:19-23 */
:root[data-theme="light"] { … }                /* globals.css:25-29 */
```

#### KOREKTA założenia z briefu

Brief zakłada, że *„arkusze modułowe używają `prefers-color-scheme` **zamiast**
`data-theme`"*. Tak **nie jest**. Każdy arkusz modułowy, który w ogóle ma motyw
ciemny, zawiera **oba** zestawy reguł — najpierw blok
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .klasa {…} }`,
a pod nim **dosłowną kopię** tych samych deklaracji jako `:root[data-theme="dark"] .klasa {…}`.
Każdy taki arkusz kończy się znacznikiem `/* themeified */` (np. Sidebar.module.css:140,
workspace.module.css:515, chats.module.css:1162).

Odtwarzając wygląd: **ciemny motyw to zawsze te same wartości**, niezależnie od tego,
czy przyszedł z systemu, czy z przełącznika. Duplikat istnieje tylko po to, by
wymuszenie z /ustawienia działało na systemie ustawionym na jasny.

Arkusze **z** motywem ciemnym (15): `layout.module.css`, `workspace.module.css`,
`page.module.css`, `wiedza.module.css`, `ustawienia.module.css`, `chats.module.css`,
`Avatar.module.css`, `AgentChat.module.css`, `ConceptBar.module.css`,
`MasterDetailCreator.module.css`, `sections.module.css`, `MentorPanel.module.css`,
`BackButton.module.css`, `FormModal.module.css`, `Sidebar.module.css`.

Arkusze **bez** motywu ciemnego (2):
- `app/logowanie/auth.module.css` — 159 linii, zero reguł ciemnych (patrz §9),
- `app/kreator-rag/kreator-rag.module.css` — celowo: panel jest ciemny **zawsze** (patrz §5).

---

### 1.3 Fonty

`app/layout.js:1` importuje `Geist` i `Geist_Mono` z `next/font/google`:

```js
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });   // layout.js:8-11
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] }); // layout.js:13-16
```

Zmienne trafiają na `<html>` (layout.js:28):
```jsx
<html lang="pl" className={`${geistSans.variable} ${geistMono.variable}`}>
```

#### Czy `body` ich używa — NIE

`globals.css:47` ustawia `font-family: Arial, Helvetica, sans-serif`. Zmienna
`--font-geist-sans` **nie jest** użyta na `body`. Geist wchodzi dopiero przez dwie
klasy kontenerów:

| selektor | plik:linia | wartość |
|---|---|---|
| `.shell` | `app/projekty/layout.module.css:5` | `font-family: var(--font-geist-sans)` |
| `.page` (kreator agenta) | `app/projekty/[projectId]/agenty/[agentId]/page.module.css:6` | `font-family: var(--font-geist-sans)` |

Skutki do odtworzenia 1:1:
- **Wszystkie ekrany z sidebarem** (/projekty, /agenty, /wiedza, /kreator-rag, /czaty, /ustawienia) → Geist Sans.
- **Kreator agenta** → Geist Sans (własna klasa `.page`).
- **/logowanie i /rejestracja** → **Arial**. Nie mają ani `.shell`, ani `.page` z fontem; `auth.module.css:5-12` nie ustawia `font-family`.
- **Kreator RAG** → **ani Geist, ani Arial**: `kreator-rag.module.css:30` nadpisuje `font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` na `.panel`, a `.panel` siedzi na tym samym elemencie co `.shell`-owy `.content` (`app/kreator-rag/layout.js:28`).

Geist Mono używany jest w **dwóch** miejscach, oba w podglądzie promptu:
`sections.module.css:465` (`.promptText`) i `:481` (`.promptRaw`), zapis
`var(--font-geist-mono), ui-monospace, monospace`.

Kreator RAG ma własny stos monospace, **bez** Geist Mono:
`ui-monospace, "Cascadia Code", Consolas, monospace` — 8 wystąpień
(kreator-rag.module.css:137, 158, 170, 221, 312, 331, 412, 463, 510, 534).

---

### 1.4 Czy istnieje skala odstępów / kolorów

**Nie.** Nie ma pliku z tokenami, nie ma zmiennych CSS na kolory ani odstępy poza
dwoma opisanymi w §1.1. Każda wartość jest wpisana **wprost** w każdym arkuszu.

Wyjątki — jedyne trzy miejsca ze zmiennymi lokalnymi:

1. **`.page` w Czatach** (`components/chats/chats.module.css:5-9`) — cztery zmienne
   dziedziczone przez avatary i plakietki:
   ```css
   --purple: #4b0fb4;  --purple-light: #f1ecfe;
   --navy: #3d5a80;    --navy-light: #e8eef7;
   ```
2. **`.panel` w Kreatorze RAG** (`app/kreator-rag/kreator-rag.module.css:17-24`) — osiem
   zmiennych po polsku (pełna lista w §5.1).
3. **`Avatar.module.css:20-37`** — czyta zmienne z punktu 1 z fallbackami
   (`var(--purple-light, #f1ecfe)`), więc działa też poza Czatami.

Praktyczny wniosek: makietę trzeba budować na **stałych wartościach**, nie na
zmiennych — repozytorium ich nie ma.

---

## 2. INWENTARZ KOLORÓW I ODSTĘPÓW

Zakres: wszystkie `*.module.css` + `globals.css`.

**Podsumowanie liczbowe: 145 różnych zapisów heksadecymalnych + 16 zapisów `rgba()` = 161 wartości kolorów.**
Zero `hsl()`.

### 2.1 Kolory — pełna lista wg liczby wystąpień

Liczba wystąpień liczy każdą deklarację osobno; ponieważ motyw ciemny jest
zduplikowany (§1.2), wartości „ciemne" mają zwykle liczbę **parzystą** i realnie
występują o połowę rzadziej.

#### Poziom 1 — rdzeń (10+ wystąpień)

| kolor | wyst. | rola | przykładowe pliki |
|---|---|---|---|
| `#a1a1aa` | 76 | tekst przygaszony (meta, hint, licznik) | 13 z 17 arkuszy |
| `#fff` | 69 | tło kart, tekst na fiolecie | wszystkie listy, karty, przyciski |
| `#c4b5fd` | 63 | obwód focus, hover karty, tekst fioletowy w ciemnym, disabled przycisku | 12 arkuszy |
| `#6d28d9` | 51 | fiolet ciemny: hover przycisku, tytuły, linki | 13 arkuszy |
| `#ededed` | 48 | tekst główny w motywie ciemnym | globals.css + 11 arkuszy |
| `#7c3aed` | 47 | **fiolet marki** — tło przycisku głównego, aktywne obwódki | 9 arkuszy |
| `#27272a` | 47 | obwód w ciemnym | 7 arkuszy |
| `#3f3f46` | 45 | tekst drugorzędny | 13 arkuszy |
| `#d4d4d8` | 44 | obwód pola/przycisku ghost, tło wyłączonego switcha | 11 arkuszy |
| `#ff8f8f` | 38 | czerwień w ciemnym (błąd) | 11 arkuszy |
| `#18181b` | 36 | tekst główny w jasnym | 10 arkuszy |
| `#71717a` | 31 | podtytuł, opis | 11 arkuszy |
| `#e4e4e7` | 29 | **obwód karty** — najczęstsza ramka | 8 arkuszy |
| `#2a1212` | 26 | tło błędu w ciemnym | 11 arkuszy |
| `#5a2a2a` | 24 | obwód błędu w ciemnym | 11 arkuszy |
| `#221a45` | 24 | tło aktywne fioletowe w ciemnym | 9 arkuszy |
| `#17171c` | 18 | tło pola formularza w ciemnym | 7 arkuszy |
| `#131318` | 18 | **tło karty w ciemnym** | 7 arkuszy |
| `#fef2f2` | 16 | tło błędu w jasnym | 8 arkuszy |
| `#f4f4f5` | 16 | tło hover neutralne, plakietka | 10 arkuszy |
| `#b91c1c` | 16 | czerwień tekstu (usuwanie, błąd) | 8 arkuszy |
| `#52525b` | 15 | etykieta, tekst segmentu | 10 arkuszy |
| `#1a1530` | 14 | tło aktywnej karty w ciemnym | 4 arkusze |
| `#17132e` | 14 | tło fioletowe najciemniejsze (dropZone, saveBar) | 5 arkuszy |
| `#a78bfa` | 13 | obwód pola po focusie | 6 arkuszy |
| `#fca5a5` | 12 | obwód błędu w jasnym | 7 arkuszy |
| `#3b2f6b` | 12 | obwód fioletowy w ciemnym | 5 arkuszy |
| `#27272e` | 12 | tło hover w ciemnym | 5 arkuszy |
| `#1c1c22` | 12 | tło przycisku ghost w ciemnym | 5 arkuszy |
| `#fbbf24` | 11 | żółty ostrzegawczy w ciemnym | 4 arkusze |
| `#faf5ff` | 11 | tło fioletowe najjaśniejsze | 5 arkuszy |
| `#ede9fe` | 10 | tło aktywne fioletowe w jasnym | 5 arkuszy |
| `#4ade80` | 10 | zieleń w ciemnym (status OK) | 5 arkuszy |
| `#262626` | 10 | obwód w ciemnym (MentorPanel, AgentChat) | 2 arkusze |

#### Poziom 2 — pomocnicze (4-9 wystąpień)

`#991b1b` (9, tekst błędu jasny) · `#111` (9, tekst w Mentorze/AgentChacie) ·
`#fcd34d` (8, żółty tekst ciemny) · `#f1ecfe` (8, plakietka fioletowa) ·
`#2a2a31` (8, obwód menu ciemny) · `#262233` (8, obwód sidebara ciemny) ·
`#fafafa` (7, tło ekranu logowania i `.promptRaw`) · `#999` (7, tekst przygaszony
w Mentorze) · `#c9c9d4` (6, tekst linku sidebara ciemny) · `#b45309` (6, pomarańcz
ostrzegawczy) · `#333` (6) · `#2a2350` (6) · `#1a1622` (6) · `#dc2626` (5, czerwień
hover) · `#92400e` (5, tekst notki ostrzegawczej) · `#15803d` (5, zieleń „zapisano") ·
`#fde68a` (4, obwód notki) · `#f5f3ff` (4) · `#eee` (4) · `#ececf3` (4) · `#ddd6fe` (4) ·
`#c7d2fe` (4) · `#aaa` (4) · `#9db6d8` (4) · `#93c5fd` (4) · `#666` (4) · `#5a4a14` (4) ·
`#4b0fb4` (4, fiolet Czatów) · `#3d5a80` (4, granat Czatów) · `#3730a3` (4, tekst
plakietki narzędzia) · `#2a2540` (4) · `#241c07` (4) · `#1e1838` (4) · `#1c1730` (4) ·
`#1a2433` (4) · `#0f0f13` (4) · `#0f0f0f` (4) · `#0e0e12` (4) · `#0a0a0a` (4)

#### Poziom 3 — pojedyncze (1-3 wystąpienia), 60+ wartości

`#ffffff` (3) · `#fffbeb` (3) · `#f6f5fb` (3) · `#f3ebff` (3) · `#e9e9ee` (3) ·
`#e8eef7` (3) · `#e5e5e5` (3) · `#ccc` (3) · `#fef3c7` · `#fdecec` · `#fbfaff` ·
`#f3c2c2` · `#f0f0f3` · `#eff6ff` · `#eef2ff` · `#d97706` · `#c9a3a3` · `#bfdbfe` ·
`#a30000` · `#7f3030` · `#78350f` · `#6b7280` · `#555` · `#4c3a86` · `#422006` ·
`#3f3a4d` · `#2a2f3a` · `#2a2440` · `#26262c` · `#2563eb` · `#211d2c` · `#1f1f24` ·
`#1e40af` · `#1e3a8a` · `#1e3a5f` · `#1e1b3a` · `#1a1a1a` · `#171717` · `#17132a` ·
`#16a34a` · `#15131d` · `#12151b` · `#12101c` · `#10233f` · `#0f1f3d` · `#0d0b16` ·
`#000` (po 2) oraz — po jednym wystąpieniu — `#fecaca`, `#faf9fe`, `#f0fdf4`,
`#ececf1`, `#ececf0`, `#ececef`, `#e6e8ec`, `#e5e7eb`, `#e5e5ea`, `#e5484d`,
`#d1a53a`, `#cfcfd6`, `#bbf7d0`, `#9db8ef`, `#9aa2b1`, `#9a9aa8`, `#37b26b`,
`#333a47`, `#2f3a4d`, `#232733`, `#1f2937`, `#1a1d24`, `#166534`, `#0f1115`, `#0b0d12`.

#### `rgba()` — wszystkie 16

| wartość | wyst. | zastosowanie |
|---|---|---|
| `rgba(16, 19, 26, 0.9)` | 5 | tło paneli na płótnie mapy (kreator-rag) |
| `rgba(0, 0, 0, 0.5)` | 5 | cień menu w ciemnym (chats) |
| `rgba(24, 24, 27, 0.05)` | 3 | cień nagłówka kreatora / ramy Czatów / karty ustawień |
| `rgba(24, 24, 27, 0.16)` | 2 | cień menu kontekstowego i listy rozwijanej |
| `rgba(16, 19, 26, 0.92)` | 2 | pasek postępu i info 3D na mapie |
| `rgba(0, 0, 0, 0.35)` | 2 | cień ramy Czatów w ciemnym |
| `rgba(24, 24, 27, 0.55)` | 1 | przesłona modala (FormModal.module.css:12) |
| `rgba(24, 24, 27, 0.28)` | 1 | cień modala |
| `rgba(24, 24, 27, 0.12)` | 1 | cień aktywnego segmentu w ustawieniach |
| `rgba(16, 19, 26, 0.97)` | 1 | dymek mapy |
| `rgba(124, 58, 237, 0.1)` | 1 | cień hover karty kreatora |
| `rgba(124, 58, 237, 0.09)` | 1 | cień hover karty listy |
| `rgba(124, 58, 237, 0.06)` | 1 | cień paska zapisu |
| `rgba(0, 0, 0, 0.15)` | 1 | cień przycisku mentora |
| `rgba(0, 0, 0, 0.08)` | 1 | cień panelu mentora |
| `rgba(0, 0, 0, 0.06)` | 1 | cień karty logowania |

### 2.2 Ile realnie jest odcieni szarości

To jest odpowiedź na pytanie z briefu. Szarości dzielą się na **trzy rozłączne rodziny**,
i to jest główny problem spójności palety.

**Rodzina A — rampa Zinc (Tailwind), spójna, 11 stopni.** Używana na ~90% powierzchni:

| stopień | wartość | typowa rola |
|---|---|---|
| 50 | `#fafafa` | tło ekranu logowania, `.promptRaw`, `.segmented` |
| 100 | `#f4f4f5` | hover neutralny, plakietka |
| 200 | `#e4e4e7` | **obwód karty** |
| 300 | `#d4d4d8` | obwód pola i przycisku ghost |
| 400 | `#a1a1aa` | tekst przygaszony |
| 500 | `#71717a` | podtytuł |
| 600 | `#52525b` | etykieta |
| 700 | `#3f3f46` | tekst drugorzędny |
| 800 | `#27272a` | obwód w ciemnym |
| 900 | `#18181b` | tekst główny |
| — | `#fff` / `#ffffff` | biel (dwa zapisy tego samego koloru) |

**Rodzina B — szarości „neutralne" spoza Zinc, 9 wartości.** Idealne szarości
(R=G=B), pochodzące ze startera Next.js i ze starszych komponentów:
`#000`, `#0a0a0a`, `#0f0f0f`, `#111`, `#171717`, `#1a1a1a`, `#262626`, `#333`,
`#555`, `#666`, `#999`, `#aaa`, `#ccc`, `#e5e5e5`, `#eee`, `#ededed`, `#fafafa`, `#ffffff`.
Skupione w `MentorPanel.module.css` i `AgentChat.module.css` (patrz §9).

**Rodzina C — szarości z domieszką fioletu/błękitu, 14 wartości.** Wpisywane
pojedynczo, każda w jednym miejscu:
`#e9e9ee` (obwód sidebara), `#fbfaff` (tło sidebara), `#9a9aa8` (etykieta grupy),
`#c9c9d4`, `#ececef`, `#ececf0`, `#ececf1`, `#ececf3`, `#e5e5ea`, `#cfcfd6`,
`#f6f5fb`, `#faf9fe`, `#f0f0f3`, `#26262c`, `#2a2a31`, `#1f1f24`, `#e6e8ec`,
`#9aa2b1`, `#6b7280`, `#1f2937`.

**Odpowiedź wprost:** spójną paletę **da się** złożyć — rodzina A jest kompletną,
regularną rampą Zinc i pokrywa większość interfejsu. Rodziny B i C to ok. **38 wartości
do zmapowania** na rampę A. Mapowanie przybliżone: `#111`/`#171717` → `#18181b`;
`#333` → `#3f3f46`; `#555`/`#666` → `#52525b`; `#999`/`#aaa` → `#a1a1aa`;
`#ccc` → `#d4d4d8`; `#eee`/`#e5e5e5` → `#e4e4e7`; `#ececf1/f0/ef/f3`, `#e9e9ee`,
`#e5e5ea` → `#e4e4e7`; `#f6f5fb`, `#faf9fe`, `#fbfaff`, `#f0f0f3` → `#fafafa`.

### 2.3 Paleta fioletu (marka)

Fiolet jest spójny **poza Czatami**:

| wartość | rola | plik przykładowy |
|---|---|---|
| `#7c3aed` | tło przycisku głównego, aktywna obwódka, `accent-color` suwaka | workspace.module.css:117 |
| `#6d28d9` | hover przycisku głównego, kolor tytułów i linków | workspace.module.css:125 |
| `#a78bfa` | obwód pola po focusie | sections.module.css:72 |
| `#c4b5fd` | `outline` focusa (2px), tło przycisku disabled, hover karty | sections.module.css:70 |
| `#ddd6fe` | obwód paska wiedzy i paska zapisu | ConceptBar.module.css:9 |
| `#ede9fe` | tło aktywnego linku sidebara, tło wartości suwaka | Sidebar.module.css:65 |
| `#f1ecfe` | tło plakietki roli i hover linku sidebara | workspace.module.css:278 |
| `#f5f3ff` | tło wybranego modelu, tło cytatu | sections.module.css:152 |
| `#faf5ff` | tło aktywnej karty, dropZone, saveBar | MasterDetailCreator.module.css:176 |
| `#f3ebff` | hover dropZone i paska wiedzy | sections.module.css:402 |

**Wyjątek — Czaty** używają innego fioletu: `--purple: #4b0fb4` (chats.module.css:6),
ciemniejszego i bardziej nasyconego niż `#7c3aed`. Patrz §9.

### 2.4 Border-radius — 12 wartości

| wartość | wyst. | gdzie |
|---|---|---|
| `8px` | 47 | **domyślny**: pola, przyciski, małe kontenery |
| `10px` | 23 | karty wewnętrzne (toolRow, modelOption, promptPart) |
| `12px` | 16 | karty list, formularz, dropZone |
| `999px` | 15 | plakietki, przełączniki, przycisk mentora |
| `6px` | 11 | drobne przyciski, znaczniki |
| `50%` | 8 | kółka (avatar, kropka statusu, knob) |
| `9px` | 6 | `.saveButton` (kreator), `.newButton`/`.input`/`.sendButton` (Czaty), `.errorBox`, `.navItem` |
| `7px` | 6 | segmenty, pozycje menu, `.renameInput`, `.titleInput` |
| `14px` | 6 | duże karty: modal, nagłówek kreatora, `.detail`, karta ustawień, rama Czatów, karta logowania |
| `4px` | 1 | `.body code` (ConceptBar.module.css:94) |
| `2px` | 1 | próbka legendy mapy (kreator-rag.module.css:443) |
| `0` | 1 | `.przelacznik button` (kreator-rag.module.css:550) |

### 2.5 Font-size — 18 wartości

| wartość | wyst. | typowa rola |
|---|---|---|
| `14px` | 57 | tekst bazowy pól i przycisków |
| `13px` | 52 | tekst drugorzędny, przyciski małe |
| `12px` | 38 | meta, licznik, notka |
| `12.5px` | 20 | hint, opis narzędzia |
| `13.5px` | 16 | opis karty, przycisk ghost w kreatorze |
| `11px` | 14 | etykieta wersalikowa, plakietka |
| `15px` | 10 | nagłówek karty, pola Mentora |
| `11.5px` | 7 | meta rozmowy, plakietka Czatów |
| `20px` | 6 | tytuł sekcji kreatora, nazwa agenta |
| `18px` | 5 | logo, tytuł Mentora, chevron |
| `17px` | 4 | tytuł rozmowy, ikona karty, `.removeCard` |
| `10.5px` | 4 | etykieta grupy w Czatach, `.statusTag` |
| `22px` | 2 | tytuł logowania, `h1` w kreatorze RAG |
| `16px` | 2 | tytuł karty listy, tytuł karty ustawień |
| `10px` | 2 | `.previewTag`, chip kompaktowy |
| `28px` | 1 | licznik na mapie (kreator-rag.module.css:536) |
| `26px` | 1 | `.title` list (workspace.module.css:14) |
| `24px` | 1 | `.pageTitle` ustawień (ustawienia.module.css:12) |

Wartości połówkowe (`13.5px`, `12.5px`, `11.5px`, `10.5px`) są **celowe i częste** —
43 wystąpienia łącznie.

### 2.6 Font-weight — 4 wartości

| wartość | wyst. |
|---|---|
| `600` | 63 |
| `700` | 40 |
| `800` | 8 — wyłącznie duże tytuły: `.title` list, `.agentName`, `.pickerTitle`, `.title` sekcji, `.pageTitle`, `.cardTitle` ustawień, `.brand` sidebara, `.ai` awatara |
| `500` | 2 — `.toolBadge` (AgentChat.module.css:85), `.statusClean` (page.module.css:91) |

Nie występuje `400` ani `normal` — waga bazowa pochodzi z przeglądarki.

### 2.7 Odstępy

#### `gap` — najczęstsze

| wartość | wyst. |
|---|---|
| `8px` | 30 |
| `10px` | 22 |
| `12px` | 16 |
| `6px` | 13 |
| `3px` | 9 |
| `4px` | 7 |
| `2px` | 6 |
| `9px` | 5 (wyłącznie Czaty) |
| `16px` | 5 |
| `5px`, `24px`, `20px`, `14px` | po 3 |
| `11px` | 2 |
| `7px`, `18px`, `22px`, `6px 14px` | po 1 |

#### `padding` — najczęstsze pary

| wartość | wyst. | typowe zastosowanie |
|---|---|---|
| `10px 12px` | 16 | pole formularza, dymek wiadomości, komunikat błędu |
| `2px 8px` | 9 | plakietka / chip |
| `6px 12px` | 7 | przycisk ghost / danger / primaryLink |
| `8px 10px` | 6 | link sidebara, pozycja menu |
| `14px 16px` | 5 | karta pliku, notka |
| `12px 14px` | 5 | wiersz narzędzia, karta modelu |
| `9px 12px`, `8px 12px`, `16px`, `11px 13px`, `0` | po 4 | |
| `9px 16px` | 3 | przycisk główny (`.primaryButton`) |
| `24px` | 3 | `.info` (stan pusty) |
| `26px 20px` | 2 | strefa uploadu |
| `10px 22px` | 2 | `.saveButton` |

#### `margin-bottom` — najczęstsze

`4px` (6) · `20px` (6) · `10px` (4) · `0` (4) · `24px` (3) · `8px`, `6px`, `2px`,
`18px`, `16px` (po 2) · `14px`, `12px` (po 1).

**Wniosek dla makiety:** odstępy trzymają się siatki 2px, z wyraźnymi „ulubionymi"
wartościami 8/10/12px dla gap i 8-16px dla padding. Skala jest nieformalna, ale
w praktyce spójna — inaczej niż paleta szarości.

---

## 3. UKŁAD STRONY

### 3.1 Shell aplikacji — sidebar + main

Plik: `app/projekty/layout.module.css` (31 linii). Współdzielony **dosłownie** przez
pięć layoutów: `app/projekty/layout.js:2`, `app/wiedza/layout.js:3`,
`app/czaty/layout.js:3`, `app/ustawienia/layout.js:2`, `app/kreator-rag/layout.js:4`.

```html
<div class="shell">
  <nav class="sidebar">…</nav>
  <main class="content">…</main>
</div>
```

#### `.shell` (layout.module.css:1-7)

| właściwość | wartość |
|---|---|
| `display` | `flex` |
| `min-height` | `100dvh` |
| `align-items` | `stretch` |
| `font-family` | `var(--font-geist-sans)` |
| `background` | `#ffffff` (jasny) / `#0a0a0a` (ciemny, :29 i :34) |

#### `.content` (layout.module.css:11-15)

| właściwość | wartość |
|---|---|
| `flex` | `1` |
| `min-width` | `0` |
| `padding` | `32px 28px 64px` (góra / boki / dół) |

Szerokości **nie ogranicza** — robią to poszczególne ekrany (`.listPage`
= `max-width: 960px`, workspace.module.css:4-6).

### 3.2 Sidebar

Plik: `components/workspace/Sidebar.module.css` (209 linii), komponent
`components/workspace/Sidebar.js`.

#### Struktura (Sidebar.js:66-144)

```html
<nav class="sidebar">
  <div class="brand">AIdeas</div>

  <div class="group">
    <span class="groupLabel">Obszar roboczy</span>
    <a class="link" href="/projekty">Projekty</a>
    <a class="link" href="/agenty">Agenty</a>
    <a class="link" href="/wiedza">Baza wiedzy</a>
    <a class="link" href="/kreator-rag">Kreator RAG</a>
    <a class="link" href="/czaty">Czaty</a>
  </div>

  <div class="bottom">
    <a class="link" href="/ustawienia"><span class="linkIcon">⚙</span>Ustawienia</a>
    <div class="account">
      <span class="accountEmail">adres@example.com</span>
      <button class="logoutButton">Wyloguj się</button>
    </div>
  </div>
</nav>
```

#### `.sidebar` (Sidebar.module.css:1-11)

| właściwość | jasny | ciemny |
|---|---|---|
| `width` | `220px` | — |
| `flex-shrink` | `0` | — |
| `min-height` | `100dvh` | — |
| `padding` | `24px 16px` | — |
| `border-right` | `1px solid #e9e9ee` | `#262233` (:81) |
| `background` | `#fbfaff` | `#0d0b16` (:80) |
| `display / direction / gap` | `flex` / `column` / `24px` | — |

#### `.brand` (Sidebar.module.css:13-18)

`font-size: 18px` · `font-weight: 800` · `color: #6d28d9` · `letter-spacing: -0.02em`.
**Brak reguły ciemnej** — fiolet `#6d28d9` zostaje w obu motywach.

#### `.groupLabel` (Sidebar.module.css:41-48)

`font-size: 11px` · `font-weight: 700` · `text-transform: uppercase` ·
`letter-spacing: 0.06em` · `color: #9a9aa8` · `margin-bottom: 4px`.
Bez wariantu ciemnego.

#### `.group` (Sidebar.module.css:20-24) — `flex column`, `gap: 4px`.

#### Link — trzy stany

| stan | selektor | linia | tło | kolor tekstu |
|---|---|---|---|---|
| zwykły (jasny) | `.link` | :50-57 | brak | `#3f3f46` |
| hover (jasny) | `.link:hover` | :59-62 | `#f1ecfe` | `#6d28d9` |
| aktywny (jasny) | `.active` | :64-67 | `#ede9fe` | `#6d28d9` |
| zwykły (ciemny) | :84-86 / :110-112 | | brak | `#c9c9d4` |
| hover (ciemny) | :88-91 / :114-117 | | `#1c1730` | `#c4b5fd` |
| aktywny (ciemny) | :93-96 / :119-122 | | `#221a45` | `#c4b5fd` |

Wspólne dla wszystkich stanów: `padding: 8px 10px` · `border-radius: 8px` ·
`font-size: 14px` · `font-weight: 600` · `text-decoration: none`.

Aktywność wynika z URL (Sidebar.js:50-58): `/projekty` porównaniem dokładnym,
`Agenty` przez `pathname.includes("/agenty")`, pozostałe przez `startsWith`.

#### `.linkIcon` (Sidebar.module.css:36-39)

`margin-right: 8px`, `font-size: 15px`. Jedyne użycie: ⚙ przy „Ustawienia"
(Sidebar.js:122-124).

#### Blok dolny

`.bottom` (Sidebar.module.css:27-34): `margin-top: auto` (dociska do dołu) ·
`flex column` · `gap: 4px` · `padding-top: 12px` · `border-top: 1px solid #e9e9ee`
(ciemny `#262233`, :132 i :137).

`.account` (Sidebar.module.css:143-150): `flex column` · `gap: 6px` ·
`margin-top: 10px` · `padding-top: 10px` · `border-top: 1px solid #ececf1`
(ciemny `#262233`, :185 i :198).

`.accountEmail` (Sidebar.module.css:152-158): `font-size: 11px` · `color: #71717a` ·
`overflow: hidden` · `text-overflow: ellipsis` · `white-space: nowrap`.
**Brak wariantu ciemnego** — `#71717a` na tle `#0d0b16` w obu motywach.

`.logoutButton` (Sidebar.module.css:160-181):

| stan | tło | obwód | kolor |
|---|---|---|---|
| zwykły (jasny) | `transparent` | `1px solid #d4d4d8` | `#52525b` |
| hover (jasny) | `#f4f4f5` | — | `#18181b` |
| disabled | — | — | `#a1a1aa`, `cursor: not-allowed` |
| zwykły (ciemny) | `transparent` | `#3f3a4d` | `#a1a1aa` |
| hover (ciemny) | `#211d2c` | — | `#ededed` |

Wymiary: `padding: 7px 10px` · `border-radius: 8px` · `font-size: 12px` ·
`font-weight: 600` · `text-align: left`. Tekst zmienia się na „Wylogowuję…"
w trakcie akcji (Sidebar.js:140).

### 3.3 Strona bez sidebara — /logowanie i /rejestracja

Te trasy **nie mają** żadnego layoutu z sidebarem. Renderują się bezpośrednio
w `body`. Arkusz: `app/logowanie/auth.module.css`, importowany też przez
`app/rejestracja/page.js:7`.

```html
<div class="screen">
  <div class="card">
    <div class="brand">AIdeas</div>
    <h1 class="title">Zaloguj się</h1>
    <p class="subtitle">…</p>
    <form class="form">…</form>
    <div class="footer">… <a class="link">Zarejestruj się</a></div>
  </div>
</div>
```

| element | plik:linia | wartości |
|---|---|---|
| `.screen` | auth.module.css:5-12 | `min-height: 100vh` · `flex` · `align-items/justify-content: center` · `padding: 24px` · `background: #fafafa` |
| `.card` | :14-22 | `max-width: 400px` · `background: #fff` · `border: 1px solid #e4e4e7` · `border-radius: 14px` · `padding: 32px` · `box-shadow: 0 1px 3px rgba(0,0,0,0.06)` |
| `.brand` | :24-31 | `font-size: 13px` · `font-weight: 600` · `letter-spacing: 0.04em` · `text-transform: uppercase` · `color: #7c3aed` · `margin-bottom: 6px` |
| `.title` | :33-38 | `font-size: 22px` · `font-weight: 700` · `color: #18181b` · `margin: 0 0 6px` |
| `.subtitle` | :40-45 | `font-size: 14px` · `color: #52525b` · `margin: 0 0 24px` · `line-height: 1.5` |
| `.form` | :47-51 | `flex column` · `gap: 16px` |
| `.field` | :53-57 | `flex column` · `gap: 6px` |
| `.label` | :59-63 | `font-size: 13px` · `font-weight: 600` · `color: #3f3f46` |
| `.footer` | :127-134 | `margin-top: 20px` · `padding-top: 20px` · `border-top: 1px solid #f4f4f5` · `font-size: 13px` · `color: #52525b` · `text-align: center` |
| `.link` | :136-144 | `color: #7c3aed` · `font-weight: 600` · bez podkreślenia; hover → podkreślenie |

**Cały ten ekran nie reaguje na motyw ciemny** — arkusz nie ma ani jednej reguły
motywu (patrz §9.1). Font: Arial (§1.3).

Pola i przyciski tego ekranu opisane są w §6.

---

## 4. EKRAN PO EKRANIE

### 4.1 `/projekty` — lista projektów

Plik: `app/projekty/page.js`, arkusz `app/projekty/workspace.module.css`.

```html
<div class="listPage">                      <!-- max-width: 960px -->
  <div class="headerRow">
    <div class="headerText">
      <h1 class="title">Projekty</h1>
      <p class="subtitle">Projekt to kontener na agentów…</p>
    </div>
    <button class="primaryButton headerAction">Nowy projekt</button>
  </div>

  <div class="error" role="alert">           <!-- warunkowo -->
    <div class="errorTitle">Problem z połączeniem z bazą</div>…
  </div>

  <div class="toolbar">
    <label class="toggleArchived"><input type="checkbox"> Pokaż archiwalne</label>
    <button class="ghostButton">Odśwież</button>
  </div>

  <div class="list">
    <div class="card">                       <!-- + cardArchived gdy archiwum -->
      <div class="cardTop">
        <h2 class="cardTitle"><a class="cardTitleLink">Nazwa</a></h2>
        <span class="badge">Archiwum</span>  <!-- warunkowo -->
      </div>
      <p class="cardDesc">Opis</p>
      <div class="cardMeta">Zmodyfikowano: 25.07.2026, 19:24</div>
      <div class="cardActions">
        <a class="ghostButton">Otwórz agentów →</a>
        <button class="ghostButton">Edytuj</button>
        <button class="ghostButton">Archiwizuj</button>
        <button class="dangerButton">Usuń trwale</button>
      </div>
    </div>
  </div>
</div>
```

| klasa | linia | wartości |
|---|---|---|
| `.listPage` | :4-6 | `max-width: 960px` |
| `.headerRow` | :33-39 | `flex` · `justify-content: space-between` · `align-items: flex-start` · `gap: 16px` · `margin-bottom: 20px` |
| `.headerAction` | :45-48 | `flex-shrink: 0` · `white-space: nowrap` |
| `.title` | :12-18 | `font-size: 26px` · `font-weight: 800` · `letter-spacing: -0.02em` · `color: #18181b` (ciemny `#ededed`, :349) |
| `.subtitle` | :20-24 | `font-size: 14px` · `color: #71717a` (ciemny `#a1a1aa`, :356) · `margin: 6px 0 0` |
| `.toolbar` | :328-334 | `flex` · `space-between` · `align-items: center` · `gap: 12px` · `margin-bottom: 12px` |
| `.toggleArchived` | :336-343 | `flex` · `gap: 6px` · `font-size: 13px` · `color: #52525b` (ciemny `#a1a1aa`) · `cursor: pointer` |
| `.list` | :211-215 | `flex column` · `gap: 12px` |
| `.card` | :217-223 | `padding: 16px` · `border: 1px solid #e4e4e7` · `border-radius: 12px` · `background: #fff` · `transition: box-shadow .15s, border-color .15s, transform .15s` |
| `.card:hover` | :225-228 | `border-color: #c4b5fd` · `box-shadow: 0 4px 14px rgba(124,58,237,0.09)` |
| `.card` ciemny | :371-374 | `background: #131318` · `border-color: #27272a` |
| `.cardArchived` | :230-233 | `background: #fafafa` · `opacity: 0.75` (ciemny `#0f0f13`, :376) |
| `.cardTop` | :235-240 | `flex` · `space-between` · `align-items: flex-start` · `gap: 12px` |
| `.cardTitle` | :242-247 | `font-size: 16px` · `font-weight: 700` · `color: #18181b` |
| `.cardTitleLink` | :249-257 | `color: #18181b`, bez podkreślenia; hover → `#6d28d9` + `underline` |
| `.cardDesc` | :259-265 | `font-size: 13.5px` · `line-height: 1.5` · `color: #52525b` · `white-space: pre-wrap` · `margin: 6px 0 0` |
| `.cardMeta` | :267-271 | `margin-top: 8px` · `font-size: 12px` · `color: #a1a1aa` |
| `.badge` | :284-293 | `padding: 2px 8px` · `border-radius: 999px` · `background: #f4f4f5` · `color: #71717a` · `font-size: 11px` · `font-weight: 700` · `uppercase` (ciemny `#27272a`/`#a1a1aa`, :409) |
| `.cardActions` | :295-300 | `flex` · `gap: 8px` · `margin-top: 12px` · `flex-wrap: wrap` |
| `.info` (pusty / ładowanie) | :319-326 | `padding: 24px` · `border: 1px dashed #d4d4d8` · `border-radius: 12px` · `text-align: center` · `color: #71717a` · `font-size: 14px` |
| `.error` | :303-312 | `padding: 14px 16px` · `margin-bottom: 20px` · `border: 1px solid #fca5a5` · `border-radius: 10px` · `background: #fef2f2` · `color: #991b1b` · `font-size: 14px` |
| `.errorTitle` | :314-317 | `font-weight: 700` · `margin-bottom: 4px` |

**Modal dodawania** — obudowa z `FormModal` (§6.4), pola wstrzykuje `ProjectModal`
(page.js:41-95): `.field` + `.label` „Nazwa (wymagana)" + `.input`, potem `.field`
+ `.label` „Opis" + `.textarea` (`min-height: 62px`, workspace.module.css:91-94).
Stopka: „Anuluj" (`.ghostButton`) i „Utwórz projekt" (`.primaryButton`).

**Modal kasowania** (page.js:428-466) — `tone="danger"`, submit czerwony.
Treść: dwa `<p class="confirmText">` (`font-size: 14px` · `line-height: 1.55` ·
`color: #3f3f46`, :195-200) i `<p class="confirmWarning">` (`font-size: 13.5px` ·
`font-weight: 600` · `color: #b91c1c`, :202-208).

### 4.2 `/agenty` oraz `/projekty/[id]/agenty`

Oba korzystają z `workspace.module.css`.

**`/agenty`** (`app/agenty/page.js`) — wariant uproszczony: `.header`
(`margin-bottom: 20px`, :8-10) zamiast `.headerRow`, brak przycisku akcji,
karty projektów z jednym `.primaryLink` „Zobacz agentów →".

**`/projekty/[id]/agenty`** — pełny wariant listy plus:

```html
<div class="backRow"><a class="backButton">← Wszystkie projekty</a></div>
```

`.backRow` = `margin-bottom: 10px` (:28-30).

Karta agenta różni się od karty projektu trzema rzeczami:
- `.roleTag` (:273-282) — `inline-block` · `margin-top: 8px` · `padding: 2px 8px` ·
  `border-radius: 999px` · `background: #f1ecfe` · `color: #6d28d9` ·
  `font-size: 12px` · `font-weight: 600` (ciemny `#221a45`/`#c4b5fd`, :414),
- pierwsza akcja to `.primaryLink` „Konfiguruj →" zamiast `.ghostButton`,
- modal tworzenia ma **trzy** pola: Nazwa, Rola, Opis (page.js:56-95).

`.primaryLink` (:134-148): `padding: 6px 12px` · `border: 1px solid #7c3aed` ·
`border-radius: 8px` · `background: #7c3aed` · `color: #fff` · `font-size: 13px` ·
`font-weight: 600`; hover → `#6d28d9` (tło i obwód). **Brak wariantu ciemnego.**

### 4.3 `/projekty/[id]/agenty/[id]` — kreator agenta

Trzy arkusze: `page.module.css` (rama), `MasterDetailCreator.module.css` (kreator),
`sections.module.css` (prawa kolumna).

#### Rama strony

```html
<div class="page">
  <main class="main">
    <a class="backButton">← Agenty — Projekt TEST</a>
    <div class="creator">…</div>
  </main>
  <aside class="panel">…</aside>       <!-- MentorPanel, position: fixed -->
  <button class="toggle">💡 Mentor</button>
</div>
```

| klasa | linia | wartości |
|---|---|---|
| `.page` | page.module.css:1-8 | `flex column` · `min-height: 100dvh` · `align-items: flex-start` · `font-family: var(--font-geist-sans)` · `background: #fafafa` (ciemny **`#000`**, :143 i :193) |
| `.main` | :19-30 | `flex column` · `flex: 1` · `width: 100%` · `max-width: 1180px` · `margin-left/right: auto` · `align-items: stretch` · `gap: 20px` · `padding: 28px 24px 60px` |
| `.pageResizing` | :11-13 | `user-select: none` (podczas przeciągania krawędzi mentora) |

Ekran leży pod `/projekty`, więc **ma sidebar** — `.page` siedzi wewnątrz `.content`,
stąd tło `#fafafa` na `#ffffff` i podwójny padding (32/28 z `.content` + 28/24 z `.main`).

Geometria mentora (page.js:20-24): `CREATOR_MAX = 1180`, `CREATOR_MIN = 700`,
`MENTOR_MIN = 280`, `MENTOR_MAX = 700`, `MENTOR_DEFAULT = 380`.
Przy otwartym mentorze `.main` dostaje style inline: `maxWidth: none`,
`width: <wyliczona>`, `marginLeft: <kotwica>`, `marginRight: 0` (page.js:216-224).

#### Nagłówek kreatora

```html
<div class="creator">
  <header class="header">
    <div class="nameBlock">
      <h1 class="agentName">Formalny</h1>
      <button class="editNameButton" title="Edytuj nazwę agenta">✏️</button>
      <!-- w trybie edycji zamiast obu: <input class="nameInput"> -->
    </div>
    <div class="headerActions">
      <span class="saveStatus"><span class="statusDirty">• Niezapisane zmiany</span></span>
      <button class="saveButton">Zapisz</button>
    </div>
  </header>
  <div class="error" role="alert">…</div>    <!-- warunkowo -->
  <div class="columns">…</div>
</div>
```

| klasa | linia | wartości |
|---|---|---|
| `.creator` | :1-6 | `flex column` · `gap: 20px` · `width: 100%` |
| `.header` | :9-22 | `position: sticky` · `top: 0` · `z-index: 20` · `flex` · `space-between` · `align-items: center` · `gap: 16px` · `padding: 14px 18px` · `border: 1px solid #e4e4e7` · `border-radius: 14px` · `background: #fff` · `box-shadow: 0 2px 12px rgba(24,24,27,0.05)` (ciemny `#131318`/`#27272a`, :355-361) |
| `.nameBlock` | :24-29 | `flex` · `align-items: center` · `gap: 8px` · `min-width: 0` |
| `.agentName` | :31-40 | `font-size: 20px` · `font-weight: 800` · `letter-spacing: -0.02em` · `color: #18181b` (ciemny `#ededed`) · `white-space: nowrap` · `text-overflow: ellipsis` |
| `.editNameButton` | :42-56 | `padding: 4px 6px` · `border: none` · `border-radius: 6px` · `background: transparent` · `font-size: 14px` · `opacity: 0.6`; hover → `#f4f4f5`, `opacity: 1` |
| `.nameInput` | :58-68 | `padding: 6px 10px` · `border: 1px solid #a78bfa` · `border-radius: 8px` · `font-size: 18px` · `font-weight: 700` · `min-width: 240px` (ciemny: tło `#17171c`, obwód `#7c3aed`) |
| `.headerActions` | :70-75 | `flex` · `align-items: center` · `gap: 12px` · `flex-shrink: 0` |
| `.saveStatus` | :77-80 | `font-size: 12.5px` · `font-weight: 600` |
| `.saveButton` | :95-113 | `padding: 10px 22px` · `border: none` · `border-radius: 9px` · `background: #7c3aed` · `color: #fff` · `font-size: 14px` · `font-weight: 700`; hover `#6d28d9`; **disabled `#d4d4d8`** (ciemny disabled `#3f3f46`/`#a1a1aa`, :441) |
| `.error` | :115-123 | `padding: 12px 16px` · `border: 1px solid #fca5a5` · `border-radius: 10px` · `background: #fef2f2` · `color: #991b1b` · `font-size: 13.5px` |

Cztery stany zapisu (MasterDetailCreator.js:146-159):

| tekst | klasa | jasny | ciemny |
|---|---|---|---|
| „Zapisuję…" | `.statusSaving` | `#6d28d9` (:82-84) | `#c4b5fd` (:437) |
| „✓ Zapisano" | `.statusSaved` | `#15803d` (:85-87) | `#4ade80` (:425) |
| „Błąd zapisu" | `.statusError` | `#b91c1c` (:88-90) | `#ff8f8f` (:429) |
| „• Niezapisane zmiany" | `.statusDirty` | `#b45309` (:91-93) | `#fbbf24` (:433) |

#### Układ dwukolumnowy

| klasa | linia | wartości |
|---|---|---|
| `.columns` | :126-131 | `display: grid` · `grid-template-columns: 300px 1fr` · `gap: 20px` · `align-items: start` |
| `.master` | :134-140 | `position: sticky` · `top: 84px` · `flex column` · `gap: 10px` |
| `.masterLabel` | :142-149 | `font-size: 11px` · `font-weight: 700` · `uppercase` · `letter-spacing: 0.06em` · `color: #a1a1aa` · `padding-left: 4px`; treść „Parametry agenta" |
| `.cards` | :151-155 | `flex column` · `gap: 8px` |
| `.detail` | :287-293 | `padding: 22px 24px` · `border: 1px solid #e4e4e7` · `border-radius: 14px` · `background: #fff` · `min-height: 460px` (ciemny `#131318`/`#27272a`) |

#### Karta parametru — stany

```html
<div class="card">                       <!-- + cardActive gdy wybrana -->
  <button class="cardButton">
    <span class="cardIcon">📚</span>
    <span class="cardText">
      <span class="cardLabel">Baza wiedzy</span>
      <span class="cardSummary">Dokumenty z magazynu, które ma czytać ten agent</span>
    </span>
  </button>
  <button class="removeCard" title="Usuń ten parametr">×</button>   <!-- tylko dodawalne -->
</div>
```

| element / stan | linia | wartości |
|---|---|---|
| `.card` | :157-166 | `position: relative` · `flex` · `align-items: stretch` · `border: 1px solid #e4e4e7` · `border-radius: 12px` · `background: #fff` · `overflow: hidden` · `transition: border-color .15s, box-shadow .15s, transform .15s` |
| `.card:hover` | :168-172 | `border-color: #c4b5fd` · `box-shadow: 0 4px 14px rgba(124,58,237,0.1)` · `transform: translateY(-1px)` |
| `.cardActive` | :174-178 | `border-color: #7c3aed` · `background: #faf5ff` · `box-shadow: 0 0 0 1px #7c3aed inset` |
| `.card` ciemna | :356-361 | `background: #131318` · `border-color: #27272a` |
| `.cardActive` ciemna | :385-388 | `background: #1a1530` · `border-color: #7c3aed` |
| `.card:hover` ciemna | :390-393 | `border-color: #6d28d9` |
| `.cardButton` | :180-192 | `flex: 1` · `align-items: flex-start` · `gap: 10px` · `padding: 12px 12px` · `background: transparent` · `text-align: left` · `font-family: inherit` |
| `.cardIcon` | :194-198 | `font-size: 17px` · `line-height: 1.2` · `flex-shrink: 0` |
| `.cardText` | :200-205 | `flex column` · `gap: 2px` · `min-width: 0` |
| `.cardLabel` | :207-215 | `flex` · `gap: 6px` · `flex-wrap: wrap` · `font-size: 14px` · `font-weight: 700` · `color: #18181b` (ciemny `#ededed`) |
| `.cardSummary` | :217-221 | `font-size: 12px` · `line-height: 1.4` · `color: #71717a` (ciemny `#a1a1aa`) |
| `.previewTag` | :223-233 | `padding: 1px 6px` · `border-radius: 999px` · `background: #fef3c7` · `color: #92400e` · `font-size: 10px` · `font-weight: 700` · `uppercase` · `letter-spacing: 0.03em` (ciemny `#422006`/`#fcd34d`) — **dziś nigdy nie widoczna**: wszystkie parametry mają `status: "ready"` (lib/creator/parameters.js:8) |
| `.removeCard` | :235-245 | `width: 30px` · `border-left: 1px solid #f4f4f5` · `background: transparent` · `color: #a1a1aa` · `font-size: 17px` · `line-height: 1`; hover → `#fef2f2` / `#b91c1c` (ciemny: obwód `#27272a`, hover `#2a1212` / `#ff8f8f`) |

#### „+ Dodaj parametr" i lista wyboru

| klasa | linia | wartości |
|---|---|---|
| `.addButton` | :252-262 | `padding: 11px 14px` · `border: 1px dashed #c4b5fd` · `border-radius: 12px` · `background: #faf5ff` · `color: #6d28d9` · `font-size: 13.5px` · `font-weight: 700` |
| `.addButton:hover` | :264-267 | `background: #ede9fe` · `border-color: #7c3aed` |
| `.addButtonActive` | :269-273 | `background: #ede9fe` · `border-style: solid` · `border-color: #7c3aed` |
| `.addButton:disabled` | :275-278 | `opacity: 0.5` · `cursor: not-allowed` |
| ciemny | :399-409 | tło `#17132e` · obwód `#3b2f6b` · tekst `#c4b5fd`; hover/aktywny tło `#221a45`, obwód `#7c3aed` |
| `.allAdded` | :280-284 | `font-size: 12px` · `color: #a1a1aa` · `text-align: center` |
| `.pickerTitle` | :295-300 | `font-size: 20px` · `font-weight: 800` · `color: #18181b` · `margin: 0 0 6px` |
| `.pickerHint` | :302-306 | `font-size: 13.5px` · `color: #71717a` · `margin: 0 0 18px` |
| `.pickerList` | :308-312 | `flex column` · `gap: 10px` |
| `.pickerItem` | :314-326 | `flex` · `align-items: flex-start` · `gap: 12px` · `padding: 14px 16px` · `border: 1px solid #e4e4e7` · `border-radius: 12px` · `background: #fff` |
| `.pickerItem:hover` | :328-332 | `border-color: #7c3aed` · `background: #faf5ff` · `transform: translateY(-1px)` |
| `.pickerIcon` | :334-337 | `font-size: 20px` · `line-height: 1.1` |

#### Kolejność kart

Z `lib/creator/parameters.js` (tablica `PARAMETERS`):

| # | id | ikona | etykieta | podpis | typ |
|---|---|---|---|---|---|
| 1 | `persona` | 🎭 | Osobowość | Kim jest agent i jak się komunikuje | stała |
| 2 | `model` | 🧠 | Model AI | Silnik, który generuje odpowiedzi | stała |
| 3 | `temperature` | 🌡️ | Temperatura | Jak bardzo kreatywnie agent odpowiada | stała |
| 4 | `rules` | 📋 | Zasady | Reguły, których agent zawsze przestrzega | dodawalna |
| 5 | `knowledgeBase` | 📚 | Baza wiedzy | Dokumenty z magazynu, które ma czytać ten agent | dodawalna |
| 6 | `rag` | 🔎 | RAG | Wyszukiwanie w kolekcjach dokumentów | dodawalna |
| 7 | `qa` | 💬 | Pytania i odpowiedzi | Gotowe pary pytanie–odpowiedź | dodawalna |
| 8 | `tools` | 🛠️ | Narzędzia | Co agent może wywołać w trakcie rozmowy | dodawalna |
| 9 | `io` | ↔️ | Wejście / Wyjście | Co przyjmuje i w jakim formacie odpowiada | dodawalna |
| 10 | `test` | 🧪 | Test agenta | Rozmowa z agentem i podgląd jego instrukcji | stała, **przypięta na dole** (`pinBottom`) |

Karty stałe (1-3) idą na górze, dodawalne w środku, `test` zawsze ostatnia
(MasterDetailCreator.js:58-60).

#### Pasek wiedzy nad każdym edytorem (ConceptBar.module.css)

```html
<div class="bars">
  <div class="bar">
    <button class="trigger" aria-expanded="false">
      <span class="triggerLabel"><span class="icon">💡</span>Czym jest Osobowość (persona)?</span>
      <span class="chevron">+</span>          <!-- rozwinięty: − -->
    </button>
    <div class="body">…markdown…</div>
  </div>
</div>
```

| klasa | linia | wartości |
|---|---|---|
| `.bars` | :1-6 | `flex column` · `gap: 8px` · `margin-bottom: 20px` |
| `.bar` | :8-13 | `border: 1px solid #ddd6fe` · `border-radius: 10px` · `background: #faf5ff` · `overflow: hidden` (ciemny `#17132e` / `#3b2f6b`, :100) |
| `.trigger` | :15-27 | `width: 100%` · `flex` · `space-between` · `gap: 12px` · `padding: 10px 14px` · `background: transparent` · `text-align: left` |
| `.trigger:hover` | :29-31 | `background: #f3ebff` (ciemny `#1e1838`) |
| `.triggerLabel` | :33-40 | `flex` · `gap: 8px` · `font-size: 13.5px` · `font-weight: 600` · `color: #6d28d9` (ciemny `#c4b5fd`) |
| `.icon` | :42-44 | `font-size: 14px` |
| `.chevron` | :46-51 | `font-size: 18px` · `font-weight: 700` · `color: #a78bfa` · `line-height: 1` |
| `.body` | :53-59 | `padding: 4px 16px 16px` · `border-top: 1px solid #ede9fe` · `font-size: 13.5px` · `line-height: 1.6` · `color: #3f3f46` (ciemny: `#2a2350` / `#c9c9d4`) |
| `.body h1/h2/h3` | :61-68 | `font-size: 14px` · `font-weight: 700` · `color: #18181b` · `margin: 14px 0 6px` |
| `.body p` | :70-72 | `margin: 8px 0` |
| `.body ul/ol` | :74-78 | `margin: 8px 0` · `padding-left: 20px` |
| `.body li` | :80-82 | `margin: 4px 0` |
| `.body blockquote` | :84-90 | `margin: 10px 0` · `padding: 8px 12px` · `border-left: 3px solid #c4b5fd` · `background: #f5f3ff` · `color: #52525b` |
| `.body code` | :92-97 | `padding: 1px 5px` · `border-radius: 4px` · `background: #ede9fe` · `font-size: 12.5px` |

Pasek pojawia się tylko wtedy, gdy pojęcie o danym `id` istnieje
(`ConceptBar.js:26` — przy braku zwraca `null`). Źródła: pliki `knowledge/*.md`
dla `persona`, `model`, `temperature`, `rules`, `tools` (lib/knowledge/concepts.js:6-12)
oraz `lib/knowledge/extraConcepts.js` dla `knowledgeBase`, `rag`, `qa`, `io`, `test`.

---

### 4.4 Sekcje kreatora — wspólny szkielet

Wszystkie dziesięć sekcji dzieli arkusz `components/creator/sections/sections.module.css`
i ten sam nagłówek:

```html
<div class="section">
  <div class="head">
    <h2 class="title"><span aria-hidden="true">🎭</span> Osobowość</h2>
    <p class="subtitle">…jedno-dwa zdania…</p>
  </div>
  …treść…
</div>
```

| klasa | linia | wartości |
|---|---|---|
| `.section` | :3-6 | `flex column` |
| `.head` | :8-10 | `margin-bottom: 4px` |
| `.title` | :12-21 | `font-size: 20px` · `font-weight: 800` · `letter-spacing: -0.01em` · `color: #18181b` · `flex` · `align-items: center` · `gap: 10px` (ciemny `#ededed`, :651) |
| `.subtitle` | :23-28 | `font-size: 13.5px` · `color: #71717a` · `line-height: 1.5` · `margin: 6px 0 16px` (ciemny `#a1a1aa`, :657) |
| `.field` | :30-35 | `flex column` · `gap: 6px` · `margin-bottom: 20px` |
| `.label` | :37-41 | `font-size: 13px` · `font-weight: 700` · `color: #3f3f46` (ciemny `#d4d4d8`, :664) |
| `.hint` | :43-47 | `font-size: 12.5px` · `color: #71717a` · `line-height: 1.5` (ciemny `#a1a1aa`) |
| `.counter` | :75-79 | `align-self: flex-end` · `font-size: 12px` · `color: #a1a1aa` |
| `.empty` | :205-212 | `padding: 18px` · `border: 1px dashed #d4d4d8` · `border-radius: 10px` · `text-align: center` · `color: #a1a1aa` · `font-size: 13px` (ciemny: obwód `#3f3f46`, tekst `#71717a`) |
| `.list` | :184-189 | `flex column` · `gap: 8px` · `margin-top: 12px` |
| `.errorBox` | :588-597 | `padding: 11px 13px` · `margin-bottom: 16px` · `border: 1px solid #fca5a5` · `border-radius: 9px` · `background: #fef2f2` · `color: #991b1b` · `font-size: 13px` |
| `.note` | :115-124 | `margin-top: 8px` · `padding: 10px 12px` · `border: 1px solid #fde68a` · `border-radius: 8px` · `background: #fffbeb` · `color: #78350f` · `font-size: 12.5px` (ciemny `#241c07` / `#5a4a14` / `#fcd34d`, :799) |

#### 4.4.1 Osobowość (`PersonaSection.js`)

Ikona 🎭. Jedno pole:
`.label` „Opis osobowości (system prompt)" → `.hint` „Ujmij cztery elementy…" →
`.textarea` → `.counter` „N znaków".

`.textarea` (:49-59 + :61-65): `padding: 10px 12px` · `border: 1px solid #d4d4d8` ·
`border-radius: 8px` · `font-size: 14px` · `background: #fff` · `color: #18181b` ·
**`min-height: 190px`** · `resize: vertical` · `line-height: 1.6`.
Focus (:67-73): `outline: 2px solid #c4b5fd` · `outline-offset: -1px` ·
`border-color: #a78bfa`. Ciemny (:668-674): tło `#17171c`, obwód `#3f3f46`, tekst `#ededed`.

#### 4.4.2 Model AI (`ModelSection.js`)

Ikona 🧠. Dwa pola: `.select` „Dostawca" oraz lista modeli.

```html
<div class="modelList">
  <label class="modelOption modelSelected">
    <input type="radio" name="agent-model">
    <span class="modelBody">
      <span class="modelName">Claude Opus 5</span>
      <span class="modelMeta">claude-opus-5 · temperatura: tak</span>
    </span>
  </label>
</div>
```

| klasa | linia | wartości |
|---|---|---|
| `.modelList` | :127-131 | `flex column` · `gap: 8px` |
| `.modelOption` | :133-143 | `flex` · `align-items: flex-start` · `gap: 10px` · `padding: 12px 14px` · `border: 1px solid #e4e4e7` · `border-radius: 10px` · `background: #fff` · `transition: border-color .15s, background .15s` |
| `.modelOption:hover` | :145-148 | `border-color: #c4b5fd` · `background: #faf5ff` (ciemny `#1a1530` / `#6d28d9`, :780) |
| `.modelSelected` | :150-154 | `border-color: #7c3aed` · `background: #f5f3ff` · `box-shadow: 0 0 0 1px #7c3aed inset` (ciemny `#1a1530`, :785) |
| `.modelBody` | :156-161 | `flex column` · `gap: 2px` · `min-width: 0` |
| `.modelName` | :163-167 | `font-size: 14px` · `font-weight: 700` · `color: #18181b` |
| `.modelMeta` | :169-172 | `font-size: 12px` · `color: #71717a` |

`.select` (:49-59): te same wartości co `.input`/`.textarea` — `padding: 10px 12px`,
obwód `#d4d4d8`, `border-radius: 8px`, `font-size: 14px`.

Notki: `.note` przy braku modeli Ollamy, przy modelach niesprawdzonych (⚠️ w treści).
Przycisk „Odśwież listę modeli" = `.button` ze stylem inline `marginTop: 10, alignSelf: "flex-start"`
(ModelSection.js:219).

#### 4.4.3 Temperatura (`TemperatureSection.js`)

Ikona 🌡️. Suwak w wierszu z wartością:

```html
<div class="sliderRow">
  <input type="range" class="slider" min="0" max="1" step="0.1">
  <span class="sliderValue">0.7</span>
</div>
<span class="tempHint">Kreatywność — burze mózgów, treści twórcze</span>
```

| klasa | linia | wartości |
|---|---|---|
| `.sliderRow` | :82-86 | `flex` · `align-items: center` · `gap: 14px` |
| `.slider` | :88-91 | `flex: 1` · `accent-color: #7c3aed` |
| `.slider:disabled` | :93-95 | `opacity: 0.4` |
| `.sliderValue` | :97-106 | `min-width: 42px` · `padding: 4px 8px` · `border-radius: 8px` · `background: #ede9fe` · `color: #6d28d9` · `font-size: 14px` · `font-weight: 700` · `text-align: center` (ciemny `#221a45` / `#c4b5fd`, :790) |
| `.tempHint` | :108-113 | `margin-top: 8px` · `font-size: 13px` · `font-weight: 600` · `color: #6d28d9` (ciemny `#c4b5fd`, :795) |

Trzy progi tekstu (TemperatureSection.js:14-18): ≤0.3 „Precyzja — raporty, analizy,
fakty"; ≤0.6 „Równowaga — materiały robocze, rekomendacje"; wyżej „Kreatywność —
burze mózgów, treści twórcze".

Gdy model nie przyjmuje temperatury: nad polem `.note`, etykieta zmienia się na
„Zapisana wartość (podgląd)", suwak `disabled`, `.tempHint` znika.

#### 4.4.4 Zasady (`RulesSection.js`)

Ikona 📋. Wiersz dodawania + lista.

| klasa | linia | wartości |
|---|---|---|
| `.addRow` | :175-178 | `flex` · `gap: 8px` |
| `.addRow .input` | :180-182 | `flex: 1` |
| `.listItem` | :191-203 | `flex` · `space-between` · `align-items: flex-start` · `gap: 12px` · `padding: 10px 12px` · `border: 1px solid #e4e4e7` · `border-radius: 8px` · `background: #fff` · `font-size: 13.5px` · `line-height: 1.5` · `color: #27272a` (ciemny `#131318` / `#27272a` / `#d4d4d8`, :676-684) |
| `.button` („Dodaj") | :302-320 | `padding: 10px 16px` · `border: none` · `border-radius: 8px` · `background: #7c3aed` · `color: #fff` · `font-size: 13.5px` · `font-weight: 600`; hover `#6d28d9`; disabled `#c4b5fd` |
| `.removeButton` („Usuń") | :322-338 | `padding: 4px 10px` · `border: 1px solid #e4e4e7` · `border-radius: 6px` · `background: #fff` · `color: #71717a` · `font-size: 12px` · `font-weight: 600`; hover → obwód `#fca5a5`, tekst `#b91c1c`, tło `#fef2f2` (ciemny `#1c1c22` / `#3f3f46` / `#a1a1aa`, :821) |

Stan pusty: `.empty` z tekstem „Brak zasad — dodaj pierwszą powyżej.".

#### 4.4.5 Pytania i odpowiedzi (`QaSection.js`)

Ikona 💬. Formularz (pole „Pytanie" typu `.input`, `.textarea` z inline
`minHeight: 110`, przycisk `.button` „Dodaj parę") + lista par.

```html
<div class="qaPair">                       <!-- style="opacity: 0.55" gdy wyłączona -->
  <div class="qaRow">
    <label class="qaToggle"><input type="checkbox"> Aktywna</label>
    <button class="removeButton">Usuń</button>
  </div>
  <span class="qaLabel">Pytanie</span>
  <p class="qaText">…</p>
  <span class="qaLabel">Odpowiedź</span>
  <p class="qaText">…</p>
</div>
```

| klasa | linia | wartości |
|---|---|---|
| `.qaPair` | :604-613 | `flex column` · `gap: 8px` · `padding: 14px` · `border: 1px solid #e4e4e7` · `border-radius: 10px` · `background: #fff` · `margin-bottom: 10px` |
| `.qaRow` | :623-630 | `flex` · `space-between` · `align-items: center` · `gap: 12px` · `padding-bottom: 8px` · `border-bottom: 1px solid #f4f4f5` (ciemny `#27272a`, :768) |
| `.qaToggle` | :632-640 | `flex` · `gap: 6px` · `font-size: 12.5px` · `font-weight: 600` · `color: #52525b` (ciemny `#a1a1aa`) |
| `.qaLabel` | :615-621 | `font-size: 11px` · `font-weight: 700` · `letter-spacing: 0.05em` · `uppercase` · `color: #a1a1aa` |
| `.qaText` | :642-648 | `font-size: 13.5px` · `line-height: 1.55` · `color: #27272a` · `white-space: pre-wrap` (ciemny `#d4d4d8`) |

Nagłówek listy: „Dodane pary (N, aktywne: M)" (QaSection.js:114-117).
Wyłączona para dostaje `opacity: 0.55` **stylem inline** (QaSection.js:132).

#### 4.4.6 Baza wiedzy (`KnowledgeBaseSection.js`)

Ikona 📚. Trzy bloki: wgrywanie, tryb, lista magazynu.

**Strefa uploadu** — `.dropZone` (:388-399): `display: block` · `padding: 26px 20px` ·
`border: 2px dashed #c4b5fd` · `border-radius: 12px` · `text-align: center` ·
`color: #6d28d9` · `font-size: 13.5px` · `font-weight: 600` · `background: #faf5ff`.
Hover (:401-404): `background: #f3ebff`, `border-color: #7c3aed`.
Ciemny (:757-766): tło `#17132e`, obwód `#3b2f6b`, tekst `#c4b5fd`; hover `#221a45` / `#7c3aed`.
W trakcie wgrywania `.dropZoneBusy` (:599-602): `opacity: 0.7` · `cursor: progress`,
a tekst zmienia się na „Wgrywam i wyciągam tekst…".

**Przełącznik trybu** — `.segmented` (:361-369): `flex` · `gap: 6px` · `padding: 4px` ·
`border: 1px solid #e4e4e7` · `border-radius: 10px` · `background: #fafafa` ·
`width: fit-content`. `.segment` (:371-381): `padding: 7px 14px` · `border-radius: 7px` ·
`background: transparent` · `color: #52525b` · `font-size: 13px` · `font-weight: 600`.
`.segmentActive` (:383-386): `background: #7c3aed` · `color: #fff`.
Dwie opcje: „Nie korzysta" / „Korzysta z wybranych".

**Lista plików**:

| klasa | linia | wartości |
|---|---|---|
| `.labelRow` | :1015-1020 | `flex` · `space-between` · `align-items: baseline` · `gap: 12px` |
| `.manageLink` | :1022-1033 | `font-size: 12.5px` · `font-weight: 600` · `color: #6d28d9` · `white-space: nowrap`; hover → podkreślenie (ciemny `#c4b5fd`, :1041) |
| `.fileRow` | :531-539 | `flex` · `align-items: flex-start` · `gap: 10px` · `padding: 11px 13px` · `border: 1px solid #e4e4e7` · `border-radius: 10px` · `background: #fff` |
| `.fileCheck` | :541-544 | `margin-top: 3px` · `flex-shrink: 0` |
| `.fileInfo` | :546-552 | `flex column` · `gap: 3px` · `flex: 1` · `min-width: 0` |
| `.fileName` | :554-559 | `font-size: 13.5px` · `font-weight: 700` · `color: #18181b` · `word-break: break-word` |
| `.fileMeta` | :561-564 | `font-size: 12px` · `color: #71717a` |
| `.fileNote` | :566-571 | `margin-top: 2px` · `font-size: 12px` · `line-height: 1.45` · `color: #92400e` (ciemny `#fcd34d`) |

Trzy statusy pliku (:573-586), etykiety z `KnowledgeBaseSection.js:30-34`:

| status | tekst | jasny | ciemny |
|---|---|---|---|
| `ready` | „Tekst wczytany" | `#15803d` | `#4ade80` |
| `no_text` | „Brak tekstu" | `#b45309` | `#fbbf24` |
| `error` | „Błąd odczytu" | `#b91c1c` | `#ff8f8f` |

Wszystkie trzy mają `font-weight: 600`.

#### 4.4.7 RAG (`RagSection.js`) — sekcja dodana 2026-08-01

Ikona 🔎. Opis u góry rozróżnia RAG i Bazę wiedzy (RagSection.js:110-119).
Dwa wiersze `.toolRow`:

```html
<div class="toolRow">
  <span class="toolInfo">
    <span class="toolName">Przeszukiwanie dokumentów</span>
    <span class="toolDesc">Agent sam decyduje, kiedy sięgnąć do kolekcji…</span>
    <span class="toolCost">💳 Bez kosztów zewnętrznych…</span>
  </span>
  <button role="switch" class="switch switchOn"><span class="switchKnob"></span></button>
</div>

<!-- drugi wiersz tylko przy włączonym przełączniku -->
<div class="toolRow">
  <span class="toolInfo">
    <span class="toolName">Przeszukiwana kolekcja</span>
    <span class="toolDesc">Agent przeszukuje CAŁĄ wskazaną kolekcję…</span>
    <span class="toolNote">⚠ Wyszukiwanie jest włączone, ale nie wskazano kolekcji…</span>
    <select class="select"><option>— nie wybrano —</option>…</select>
  </span>
</div>
```

Wartości `.toolRow`, `.toolInfo`, `.toolName`, `.toolDesc`, `.toolCost`, `.toolNote`,
`.switch` — wspólne z Narzędziami, opisane w §4.4.8 i §6.3.

Trzy stany komunikatu w `.toolNote`, wszystkie w tym samym stylu (RagSection.js:154-176):
brak wskazanej kolekcji, błąd wczytania listy, brak jakiejkolwiek kolekcji.

#### 4.4.8 Narzędzia (`ToolsSection.js`)

Ikona 🛠️. Po zmianie z 2026-08-01 **trzy** pozycje: Kalkulator, Data / czas,
Wyszukiwanie w internecie.

| klasa | linia | wartości |
|---|---|---|
| `.toolRow` | :215-225 | `flex` · `space-between` · `align-items: center` · `gap: 14px` · `padding: 12px 14px` · `border: 1px solid #e4e4e7` · `border-radius: 10px` · `background: #fff` · `margin-bottom: 8px` (ciemny `#131318` / `#27272a` / `#d4d4d8`, :676-684) |
| `.toolInfo` | :227-231 | `flex column` · `gap: 2px` |
| `.toolName` | :233-237 | `font-size: 14px` · `font-weight: 700` · `color: #18181b` (ciemny `#ededed`) |
| `.toolDesc` | :239-242 | `font-size: 12.5px` · `color: #71717a` (ciemny `#a1a1aa`) |
| `.toolCost` | :244-250 | `margin-top: 4px` · `font-size: 12px` · `line-height: 1.45` · `color: #b45309`; **bez wariantu ciemnego** |
| `.toolNote` | :252-262 | `margin-top: 4px` · `font-size: 12px` · `line-height: 1.45` · `color: #92400e` · `background: #fef3c7` · `border: 1px solid #fde68a` · `border-radius: 8px` · `padding: 6px 9px`; **bez wariantu ciemnego** |

Wyszukiwanie w internecie ma dostępność zależną od dostawcy
(ToolsSection.js:47-61): dla Anthropic zawsze aktywne, dla Ollamy zależnie od
klucza wyszukiwarki, dla reszty wyszarzone — wtedy przełącznik dostaje
`.switchDisabled` (`opacity: 0.45` · `cursor: not-allowed`, :281-284), a `.toolCost`
zostaje ukryty na rzecz `.toolNote`.

#### 4.4.9 Wejście / Wyjście (`IoSection.js`)

Ikona ↔️. Dwa bloki:
- **Format odpowiedzi** — `.segmented` z trzema `.segment`: Tekst / Markdown / JSON.
  Przy JSON dodatkowo `.note`.
- **Co agent przyjmuje** — trzy `.toolRow` z przełącznikami: Tekst, Pliki, Obrazy.

Te same klasy co §4.4.6 i §4.4.8.

#### 4.4.10 Test agenta (`TestSection.js`)

Ikona 🧪. Trzy części: notka o rolach, podgląd promptu, czat testowy.

**Notka o rolach** — `.roleNote` (:407-419): `flex` · `align-items: flex-start` ·
`gap: 10px` · `padding: 12px 14px` · `margin-bottom: 18px` ·
`border: 1px solid #bfdbfe` · `border-radius: 10px` · `background: #eff6ff` ·
`color: #1e40af` · `font-size: 13px` · `line-height: 1.55`.
Ciemny (:716-720): `#0f1f3d` / `#1e3a8a` / `#93c5fd`. Ikona ℹ️.
**Jedyny niebieski akcent w kreatorze.**

**Podgląd promptu**:

| klasa | linia | wartości |
|---|---|---|
| `.promptMeta` | :421-425 | `margin: 10px 0 8px` · `font-size: 12.5px` · `color: #71717a` |
| `.promptParts` | :427-431 | `flex column` · `gap: 10px` |
| `.promptPart` | :433-438 | `border: 1px solid #e4e4e7` · `border-radius: 10px` · `background: #fff` · `overflow: hidden` |
| `.promptPartHead` | :440-449 | `flex` · `space-between` · `align-items: baseline` · `gap: 10px` · `flex-wrap: wrap` · `padding: 8px 12px` · `background: #faf5ff` · `border-bottom: 1px solid #ede9fe` (ciemny `#17132e` / `#2a2350`, :727) |
| `.promptPartLabel` | :451-455 | `font-size: 13px` · `font-weight: 700` · `color: #6d28d9` (ciemny `#c4b5fd`) |
| `.promptPartSource` | :457-460 | `font-size: 11.5px` · `color: #a1a1aa` |
| `.promptText` | :462-473 | `padding: 11px 13px` · `font-family: var(--font-geist-mono), ui-monospace, monospace` · `font-size: 12px` · `line-height: 1.6` · `color: #27272a` · `white-space: pre-wrap` · `word-break: break-word` · `max-height: 240px` · `overflow-y: auto` |
| `.promptRaw` | :475-489 | `margin: 10px 0 0` · `padding: 14px` · `border: 1px solid #e4e4e7` · `border-radius: 10px` · `background: #fafafa` · monospace · `font-size: 12px` · `max-height: 420px` (ciemny `#0f0f13` / `#27272a` / `#d4d4d8`) |
| `.promptKnowledge` | :491-496 | `padding: 11px 13px` · `flex column` · `gap: 4px` |
| `.promptFile` | :498-501 | `font-size: 13px` · `color: #27272a` (ciemny `#d4d4d8`); prefiks 📄 |
| `.promptFileChars` | :503-506 | `color: #a1a1aa` · `font-size: 12px` |
| `.promptFileNote` | :508-513 | `margin-top: 4px` · `font-size: 12px` · `color: #a1a1aa` · `line-height: 1.45` |
| `.promptWarn` | :515-522 | `padding: 8px 13px` · `background: #fffbeb` · `border-top: 1px solid #fde68a` · `color: #92400e` · `font-size: 12px` (ciemny `#241c07` / `#5a4a14` / `#fcd34d`, :747) |
| `.testChat` | :524-528 | `margin-top: 22px` · `padding-top: 18px` · `border-top: 1px solid #e4e4e7` (ciemny `#27272a`) |

Ikony sekcji promptu (TestSection.js:17-23): `persona` 🎭, `rules` 📋, `qa` 💬,
`knowledge` 📚, `format` ↔️, domyślnie „•".

Przycisk „Pokaż jako jeden blok" / „Ukryj surowy tekst" to `.removeButton`
ze stylem inline `alignSelf: "flex-start", marginTop: 10` (TestSection.js:184).

**Czat testowy** — komponent `components/classic/AgentChat.js`, arkusz
`AgentChat.module.css` (257 linii). To **inny świat kolorystyczny** niż reszta
kreatora — patrz §9.3:

| klasa | linia | wartości |
|---|---|---|
| `.chat` | :1-9 | `flex column` · `gap: 12px` · `max-width: 640px` · `margin-top: 12px` · `padding-top: 24px` · `border-top: 1px solid #e5e5e5` |
| `.heading` | :11-15 | `font-size: 20px` · `font-weight: 600` |
| `.subheading` | :17-21 | `font-size: 13px` · `color: #666` |
| `.messages` | :23-34 | `flex column` · `gap: 10px` · `min-height: 120px` · `max-height: 420px` · `overflow-y: auto` · `padding: 12px` · `border: 1px solid #eee` · `border-radius: 10px` · `background: #fafafa` |
| `.message` | :42-50 | `max-width: 85%` · `padding: 10px 12px` · `border-radius: 12px` · `font-size: 14px` · `line-height: 1.5` · `white-space: pre-wrap` |
| `.user` | :52-57 | `align-self: flex-end` · **`background: #2563eb`** (niebieski!) · `color: #fff` · `border-bottom-right-radius: 4px` |
| `.assistant` | :59-65 | `align-self: flex-start` · `background: #fff` · `border: 1px solid #e5e5e5` · `color: #111` · `border-bottom-left-radius: 4px` |
| `.role` | :67-73 | `display: block` · `font-size: 11px` · `font-weight: 600` · `opacity: 0.7` · `margin-bottom: 2px` |
| `.toolBadge` | :76-86 | `inline-block` · `margin-top: 8px` · `padding: 2px 8px` · `border-radius: 999px` · `background: #eef2ff` · `border: 1px solid #c7d2fe` · `color: #3730a3` · `font-size: 12px` · `font-weight: 500` |
| `.sources` | :89-96 | `flex column` · `gap: 3px` · `margin-top: 10px` · `padding-top: 8px` · `border-top: 1px solid #e5e7eb` |
| `.sourcesTitle` | :98-104 | `font-size: 11.5px` · `font-weight: 700` · `uppercase` · `letter-spacing: 0.04em` · `color: #6b7280` |
| `.sourceLink` | :106-117 | `font-size: 12.5px` · `color: #6d28d9`; hover → podkreślenie |
| `.sourceDoc` | :291-297 | `font-size: 12.5px` · `color: #52525b`; **bez** podkreślenia i kursora — fragment RAG nie jest linkiem |
| `.loader` | :120-128 | `align-self: flex-start` · `flex` · `gap: 8px` · `font-size: 14px` · `color: #666` · `padding: 8px 12px` |
| `.dots span` | :135-141 | `6×6px` · `border-radius: 50%` · **`background: #999`** · `animation: blink 1.2s infinite both` (opóźnienia 0.2s / 0.4s) |
| `.error` | :162-169 | `padding: 10px 12px` · `border: 1px solid #f3c2c2` · `background: #fdecec` · `color: #a30000` · `border-radius: 8px` · `font-size: 14px` |
| `.input` | :176-188 | `flex: 1` · `padding: 10px 12px` · `border: 1px solid #ccc` · `border-radius: 8px` · `font-size: 15px` · `resize: vertical` · `min-height: 44px` · `max-height: 160px` |
| `.sendButton` | :190-205 | `padding: 0 20px` · `border-radius: 8px` · **`background: #2563eb`** · `color: #fff` · `font-size: 14px` · `font-weight: 600`; disabled `#9db8ef` |

### 4.5 `/wiedza` — magazyn plików

Pliki: `app/wiedza/page.js`, arkusze `wiedza.module.css` (własny, jako `styles`)
**oraz** `../projekty/workspace.module.css` (jako `shell`). Rama, nagłówek, błędy
i modal pochodzą z `workspace`, reszta z `wiedza`.

```html
<div class="listPage">                       <!-- shell -->
  <div class="header">
    <h1 class="title">Baza wiedzy</h1>
    <p class="subtitle">…</p>
  </div>

  <div class="uploadBox">                     <!-- styles -->
    <p class="uploadHint">…formaty, limit 4 MB…</p>
    <label class="dropZone">Kliknij, aby wybrać plik z dysku</label>
  </div>

  <div class="list">                          <!-- shell -->
    <div class="fileCard">                    <!-- styles -->
      <div class="fileMain">
        <span class="fileName">regulamin.pdf</span>
        <span class="fileMeta">240 KB · 25.07.2026 · <span class="statusReady">Tekst wczytany</span></span>
        <span class="fileNote">…</span>
        <span class="usage">Używają: <span class="agentTag">Formalny</span></span>
      </div>
      <button class="dangerButton">Usuń</button>   <!-- shell -->
    </div>
  </div>
</div>
```

| klasa | plik:linia | wartości |
|---|---|---|
| `.uploadBox` | wiedza:6-8 | `margin-bottom: 24px` |
| `.uploadHint` | :10-15 | `margin: 0 0 10px` · `font-size: 12.5px` · `line-height: 1.5` · `color: #71717a` (ciemny `#a1a1aa`) |
| `.dropZone` | :17-28 | `block` · `padding: 26px 20px` · `border: 2px dashed #c4b5fd` · `border-radius: 12px` · `text-align: center` · `color: #6d28d9` · `font-size: 13.5px` · `font-weight: 600` · `background: #faf5ff`; hover `#f3ebff` / `#7c3aed`. Ciemny (:148-157): tło **`#17132a`**, obwód **`#4c3a86`** — inne wartości niż w `sections.module.css` (§9.5) |
| `.fileCard` | :41-49 | `flex` · `align-items: flex-start` · `gap: 12px` · `padding: 14px 16px` · `border: 1px solid #e4e4e7` · `border-radius: 12px` · `background: #fff` (ciemny `#131318` / `#27272a`) |
| `.fileMain` | :51-57 | `flex column` · `gap: 4px` · `flex: 1` · `min-width: 0` |
| `.fileName` | :59-64 | `font-size: 14px` · `font-weight: 700` · `color: #18181b` · `word-break: break-word` |
| `.fileMeta` | :66-69 | `font-size: 12px` · `color: #71717a` |
| `.fileNote` | :71-75 | `font-size: 12px` · `line-height: 1.45` · `color: #92400e` (ciemny `#fbbf24`) |
| `.usage` | :93-98 | `margin-top: 6px` · `font-size: 12.5px` · `line-height: 1.5` · `color: #52525b` |
| `.usageNone` | :102-104 | `color: #a1a1aa` |
| `.usageUnknown` | :108-111 | `color: #b45309` · `font-weight: 600` (ciemny `#fbbf24`) |
| `.agentTag` | :113-122 | `inline-block` · `padding: 1px 8px` · `margin: 2px 4px 2px 0` · `border-radius: 999px` · `background: #f1ecfe` · `color: #6d28d9` · `font-size: 12px` · `font-weight: 600` (ciemny `#221a45` / `#c4b5fd`) |
| `.agentTagArchived` | :124-127 | `background: #f4f4f5` · `color: #71717a` (ciemny `#27272a` / `#a1a1aa`) |
| `.modalAgentList` | :130-136 | `margin: 8px 0 0` · `padding-left: 20px` · `font-size: 13.5px` · `line-height: 1.6` · `color: #3f3f46` |

Statusy pliku: `.statusReady` `#15803d`, `.statusWarn` `#b45309`, `.statusError`
`#b91c1c` (:77-90), wszystkie `font-weight: 600`; ciemne odpowiednio `#4ade80`,
`#fbbf24`, `#ff8f8f`.

**Modal kasowania** (page.js:333-366) — `FormModal` z `tone="danger"`. Treść:
`shell.confirmText`, lista agentów `<ul class="modalAgentList">` i
`shell.confirmWarning`.

### 4.6 `/czaty` — lista rozmów i okno czatu

Pliki: `app/czaty/page.js`, `components/chats/ConversationChat.js`,
`components/chats/ConversationRow.js`, `components/chats/RunnerPicker.js`,
`components/chats/Avatar.js`. Arkusz: `components/chats/chats.module.css` (1172 linie,
największy w projekcie) + `Avatar.module.css`.

#### Rama

`.page` (chats:5-21): definiuje cztery zmienne (§1.4), `display: flex` ·
**`height: calc(100vh - 120px)`** · `max-width: 1250px` · `margin: 0 auto` ·
`border: 1px solid #e4e4e7` · `border-radius: 14px` · `overflow: hidden` ·
`background: #fff` · `box-shadow: 0 2px 12px rgba(24,24,27,0.05)`.
Ciemny (:993-997): tło `#0e0e12`, obwód `#27272a`, cień `rgba(0,0,0,0.35)`.

#### Lewa kolumna

| klasa | linia | wartości |
|---|---|---|
| `.listCol` | :25-33 | `width: 260px` (fallback; realna szerokość inline, przesuwalna) · `flex-shrink: 0` · `height: 100%` · `flex column` · `gap: 10px` · `padding: 14px` |
| `.resizer` | :36-42 | `flex: 0 0 5px` · `align-self: stretch` · `cursor: col-resize` · `touch-action: none` |
| `.resizer::before` | :46-56 | linia `1px` pośrodku, `background: #e4e4e7` (ciemny `#27272a`), `transition: background .12s, width .12s` |
| hover/focus/aktywny | :58-63 | `width: 3px` · `background: var(--purple)` = `#4b0fb4` |
| `.newButton` | :74-89 | `width: 100%` · `padding: 9px 12px` · `border-radius: 9px` · `background: var(--purple)` · `color: #fff` · `font-size: 13px` · `font-weight: 700`; hover `filter: brightness(1.08)` |
| `.search` | :91-107 | `padding: 8px 11px` · `border: 1px solid #e4e4e7` · `border-radius: 8px` · `font-size: 13px` · `background: #fff`; focus `outline: 2px solid #c4b5fd`, obwód `#a78bfa` |
| `.convList` | :109-117 | `flex column` · `gap: 3px` · `flex: 1` · `overflow-y: auto` |
| `.groupLabel` | :217-224 | `padding: 8px 8px 3px` · `font-size: 10.5px` · `font-weight: 700` · `letter-spacing: 0.04em` · `uppercase` · `color: #a1a1aa`; treść „Przypięte" / „Ostatnie" |
| `.convItem` | :120-132 | `flex` · `align-items: center` · `gap: 4px` · `padding: 8px 6px 8px 10px` · `border-left: 3px solid transparent` · `border-radius: 8px` |
| `.convItem:hover` | :134-136 | `background: #f6f5fb` (ciemny `#1a1622`) |
| `.convItemActive` | :138-141 | `background: var(--purple-light)` = `#f1ecfe` · `border-left-color: var(--purple)` (ciemny `#221a45`) |
| `.convMenuBtn` | :160-175 | `26×26px` · `border-radius: 6px` · `color: #71717a` · `font-size: 18px` · **`opacity: 0`** — pokazuje się przy hover / na aktywnej / przy otwartym menu (:177-182) |
| `.convTitle` | :279-287 | `font-size: 13px` · `font-weight: 600` · `color: #18181b` · `ellipsis` |
| `.convMeta` | :289-297 | `flex` · `gap: 5px` · `margin-top: 2px` · `font-size: 11.5px` · `color: #71717a` |
| `.convDate` | :299-303 | `color: #a1a1aa` · `white-space: nowrap` |
| `.renameInput` | :198-214 | `padding: 5px 8px` · `border: 1px solid var(--purple)` · `border-radius: 7px` · `font-size: 13px` · `font-weight: 600` |
| `.pinIcon` | :190-195 | `flex-shrink: 0` · `margin-right: 4px` · `vertical-align: -1px` · `color: var(--purple)` |
| `.listInfo` | :309-314 | `padding: 16px 8px` · `color: #a1a1aa` · `font-size: 13px` · `text-align: center` |

**Menu kontekstowe** — `.actionMenu` (:227-237): `position: fixed` · `z-index: 50` ·
`min-width: 168px` · `padding: 5px` · `background: #fff` · `border: 1px solid #e4e4e7` ·
`border-radius: 10px` · `box-shadow: 0 10px 30px rgba(24,24,27,0.16)`.
`.actionItem` (:239-251): `width: 100%` · `padding: 8px 10px` · `border-radius: 7px` ·
`color: #18181b` · `font-size: 13px` · `text-align: left`; hover `#f6f5fb`.
`.actionDanger` (:259-266): `margin-top: 4px` · `padding-top: 9px` ·
`border-top: 1px solid #ececf3` · górne promienie wyzerowane · `color: #b91c1c`;
hover `#fef2f2`.

#### Nagłówek rozmowy

| klasa | linia | wartości |
|---|---|---|
| `.chatHeader` | :337-344 | `flex` · `align-items: center` · `gap: 11px` · `padding: 16px 20px` · `border-bottom: 1px solid #e4e4e7` (ciemny `#27272a`) |
| `.title` | :357-371 | `font-size: 17px` · `font-weight: 700` · `color: #18181b` · `background: none` · `border: none` · `cursor: text` · `ellipsis`; hover → `text-decoration: underline dotted` |
| `.titleInput` | :377-388 | `font-size: 17px` · `font-weight: 700` · `padding: 3px 8px` · `border: 1px solid var(--purple)` · `border-radius: 7px` · `max-width: 460px` |
| `.badges` | :390-396 | `flex` · `flex-wrap: wrap` · `gap: 6px` · `margin-top: 4px` |
| `.badge` | :398-403 | `padding: 2px 8px` · `border-radius: 999px` · `font-size: 11.5px` · `font-weight: 700` |
| `.badgeAgent` | :405-408 | `background: var(--purple-light)` · `color: var(--purple)` |
| `.badgeModelName` | :410-413 | `background: var(--navy-light)` = `#e8eef7` · `color: var(--navy)` = `#3d5a80` |
| `.badgeModel` | :415-419 | `background: #f4f4f5` · `color: #52525b` · `font-weight: 600` (ciemny `#27272a` / `#a1a1aa`) |
| `.badgeDeleted` | :421-424 | `background: #fef2f2` · `color: #b91c1c` (ciemny `#2a1212` / `#ff8f8f`) |
| `.counter` | :504-508 | `font-size: 12px` · `color: #a1a1aa` |
| `.deleteButton` | :510-524 | `padding: 5px 11px` · `border: 1px solid #fca5a5` · `border-radius: 8px` · `background: #fff` · `color: #b91c1c` · `font-size: 12.5px` · `font-weight: 600`; hover `#fef2f2` / `#dc2626` |

**Chip rozmówcy** (`.runner` + `.chip`, :428-495): `.chip` = `padding: 2px 8px` ·
`border-radius: 999px` · `font-size: 11px` · `font-weight: 700` · `line-height: 1.5`.
`.chipAgent` fiolet, `.chipModel` `#e8eef7`/`#3d5a80`, `.chipDeleted` czerwony.
Wariant kompaktowy (`.runnerCompact`, :488-495) zmniejsza chip do `10px` /
`padding: 1px 6px`, a nazwę do `11.5px`.

#### Wiadomości

| klasa | linia | wartości |
|---|---|---|
| `.messages` | :527-535 | `flex: 1` · `flex column` · `gap: 8px` · `overflow-y: auto` · `padding: 16px 20px` |
| `.msgRow` | :545-552 | `flex` · `align-items: flex-start` · `gap: 9px` · `width: 100%` · **`max-width: 820px`** · `margin: 0 auto` |
| `.msgBox` | :554-566 | `flex: 1` · `padding: 9px 12px` · `border: 1px solid #ececf3` · `border-radius: 10px` · `background: #faf9fe` · `font-size: 14px` · `line-height: 1.55` · `color: #18181b` · `white-space: pre-wrap` (ciemny `#15131d` / `#2a2540`) |
| `.msgUser .msgBox` | :568-570 | `background: #fff` (ciemny `#131318`) |
| `.msgToolBadge` | :573-584 | `inline-block` · `margin-top: 8px` · `padding: 2px 8px` · `border-radius: 999px` · `background: #eef2ff` · `border: 1px solid #c7d2fe` · `color: #3730a3` · `font-size: 11.5px` · `font-weight: 600` |
| `.msgSources` | :586-593 | `flex column` · `gap: 3px` · `margin-top: 9px` · `padding-top: 8px` · `border-top: 1px solid #ececf3` |
| `.msgSourcesTitle` | :595-601 | `font-size: 11px` · `font-weight: 700` · `uppercase` · `letter-spacing: 0.04em` · `color: #a1a1aa`; treść „ŹRÓDŁA:" |
| `.msgSourceLink` | :603-614 | `font-size: 12.5px` · `color: var(--purple, #6d28d9)`; hover → podkreślenie |
| `.msgSourceDoc` | :1165-1171 | `font-size: 12.5px` · `color: #71717a`; **bez** podkreślenia — fragment RAG |
| `.loaderRow` | :616-625 | `flex` · `gap: 9px` · `max-width: 820px` · `margin: 0 auto` · `color: #71717a` · `font-size: 13px` |
| `.dots span` | :632-638 | `6×6px` · `border-radius: 50%` · `background: var(--purple)` · `animation: blink 1.2s infinite both` |

Uwaga: **wiadomości nie są dymkami** — oba kierunki mają ten sam kształt
i szerokość, różnią się tylko tłem (`#faf9fe` agent / `#fff` użytkownik).
Rozróżnienie niesie awatar po lewej.

#### Stopka

| klasa | linia | wartości |
|---|---|---|
| `.footer` | :674-682 | `flex column` · `gap: 8px` · `padding: 12px 20px 14px` · `border-top: 1px solid #e4e4e7` · `background: #fff` (ciemny `#0e0e12`) |
| `.inputRow` / `.pickerRow` / `.footer .hint` | :685-692 | `width: 100%` · `max-width: 820px` · `margin` auto (wyrównanie do kolumny wiadomości) |
| `.input` | :699-711 | `flex: 1` · `padding: 10px 12px` · `border: 1px solid #d4d4d8` · `border-radius: 9px` · `font-size: 14px` · `resize: vertical` · `min-height: 44px` · `max-height: 160px` |
| `.sendButton` | :719-738 | `padding: 0 20px` · `border-radius: 9px` · `background: var(--purple)` · `color: #fff` · `font-size: 14px` · `font-weight: 700`; hover `brightness(1.08)`; disabled `#c4b5fd` |
| `.hint` | :858-861 | `font-size: 11.5px` · `color: #a1a1aa`; treść „Enter wysyła · Shift+Enter nowa linia" |

**Lista rozwijana rozmówcy** (`.dropdown*`, :747-856) — otwiera się **do góry**
(`bottom: calc(100% + 6px)`, :794), `max-height: 300px`, `padding: 6px`,
`border-radius: 10px`, cień `0 10px 30px rgba(24,24,27,0.16)`.
`.dropdownOptionActive` `#f6f5fb`, `.dropdownOptionSelected` `var(--purple-light)`.
`.dropdownError` (:847-856): `margin: 6px` · `padding: 8px 10px` ·
`border: 1px solid #fca5a5` · `background: #fef2f2` · `color: #991b1b` ·
`border-radius: 6px` · `font-size: 12.5px`.

#### Awatary (`Avatar.module.css`, `Avatar.js`)

`.circle` (:4-11): `inline-flex` · `align-items/justify-content: center` ·
`border-radius: 50%` · `flex-shrink: 0` · `line-height: 1`.
Rozmiar podawany stylem inline; ikona = `round(size × 0.56)`, tekst „AI" =
`round(size × 0.4)` (Avatar.js:58, 68).

| wariant | linia | tło | kolor |
|---|---|---|---|
| `.agentSoft` | :19-22 | `var(--purple-light, #f1ecfe)` | `var(--purple, #4b0fb4)` |
| `.agentFilled` | :24-27 | `var(--purple, #4b0fb4)` | `#fff` |
| `.modelSoft` | :30-33 | `var(--navy-light, #e8eef7)` | `var(--navy, #3d5a80)` |
| `.modelFilled` | :35-38 | `var(--navy, #3d5a80)` | `#fff` |
| `.user` | :41-44 | `#e5e5ea` | `#6b7280` |
| `.placeholder` | :47-51 | `#ececf0` | `#a1a1aa`, `border: 1px dashed #cfcfd6` |

Ciemny (:54-68): `.user` → `#2a2a31`/`#a1a1aa`, `.modelSoft` → `#1a2433`/`#9db6d8`,
`.placeholder` → `#26262c`/`#71717a`/`#3f3f46`. Warianty fioletowe **bez** wariantu ciemnego.

Użyte rozmiary: `38px` (nagłówek rozmowy), `30px` (wiersz listy, przycisk pickera),
`28px` (wiadomość agenta, `tone="filled"`), `24px` (pozycja listy rozwijanej).
Ikony to inline SVG: robot (agent/placeholder) i sylwetka (użytkownik), model = tekst „AI"
z `font-weight: 800` i `letter-spacing: 0.02em` (:13-16).

### 4.7 `/ustawienia`

Plik: `app/ustawienia/page.js`, arkusz `ustawienia.module.css` (618 linii).

```html
<div class="page">                            <!-- max-width: 1000px -->
  <h1 class="pageTitle">Ustawienia</h1>
  <div class="banner" role="note">
    <span class="bannerIcon">💡</span>
    <p class="bannerText">…</p>
  </div>
  <div class="layout">                        <!-- grid 210px 1fr -->
    <nav class="nav">
      <button class="navItem navItemActive"><span class="navIcon">🔌</span>Połączenia</button>
      …
    </nav>
    <div class="content">…karty…</div>        <!-- UWAGA: klasa nie istnieje, §9.6 -->
  </div>
</div>
```

| klasa | linia | wartości |
|---|---|---|
| `.page` | :1-8 | `width: 100%` · `max-width: 1000px` · `margin: 0 auto` · `flex column` · `gap: 18px` |
| `.pageTitle` | :10-16 | `font-size: 24px` · `font-weight: 800` · `letter-spacing: -0.02em` · `color: #18181b` (ciemny `#ededed`) |
| `.banner` | :19-27 | `flex` · `align-items: flex-start` · `gap: 10px` · `padding: 12px 16px` · `border: 1px solid #bfdbfe` · `border-radius: 12px` · `background: #eff6ff` (ciemny `#10233f` / `#1e3a5f`, :419) |
| `.bannerIcon` | :29-33 | `font-size: 15px` · `line-height: 1.5` |
| `.bannerText` | :35-40 | `font-size: 13px` · `line-height: 1.55` · `color: #1e40af` (ciemny `#93c5fd`) |
| `.layout` | :43-48 | `display: grid` · `grid-template-columns: 210px 1fr` · `gap: 22px` · `align-items: start` |
| `.nav` | :56-62 | `position: sticky` · `top: 20px` · `flex column` · `gap: 3px` |
| `.navItem` | :64-78 | `flex` · `gap: 9px` · `padding: 9px 11px` · `border-radius: 9px` · `background: transparent` · `color: #3f3f46` · `font-size: 14px` · `font-weight: 600` · `text-align: left` |
| `.navItem:hover` | :80-83 | `background: #f1ecfe` · `color: #6d28d9` (ciemny `#1c1730` / `#c4b5fd`) |
| `.navItemActive` | :85-88 | `background: #ede9fe` · `color: #6d28d9` (ciemny `#221a45` / `#c4b5fd`) |
| `.navIcon` | :90-92 | `font-size: 15px` |
| `.card` | :95-101 | `border: 1px solid #e4e4e7` · `border-radius: 14px` · `background: #fff` · `box-shadow: 0 2px 12px rgba(24,24,27,0.05)` · `padding: 6px 20px 8px` (ciemny `#131318` / `#27272a`) |
| `.cardHead` | :103-110 | `flex` · `space-between` · `align-items: center` · `gap: 12px` · `padding: 14px 0 12px` · `border-bottom: 1px solid #f0f0f3` (ciemny `#27272a`) |
| `.cardTitle` | :112-117 | `font-size: 16px` · `font-weight: 800` · `color: #18181b` |
| `.row` | :120-127 | `flex` · `space-between` · `align-items: center` · `gap: 24px` · `padding: 14px 0` · `border-bottom: 1px solid #f4f4f5` (ciemny `#1f1f24`); ostatni bez obwodu (:129-131) |
| `.rowLabel` | :137-142 | `display: block` · `font-size: 14px` · `font-weight: 600` · `color: #18181b` |
| `.rowDesc` | :144-149 | `margin: 3px 0 0` · `font-size: 12.5px` · `line-height: 1.5` · `color: #71717a` (ciemny `#a1a1aa`) |
| `.rowsDivider` | :155-159 | `height: 1px` · `background: #f0f0f3` · `margin: 4px 0` |

**Kontrolki** (:162-298): `.select` / `.textInput` / `.numberInput` — wspólne
`padding: 8px 11px` · `border: 1px solid #d4d4d8` · `border-radius: 8px` ·
`font-size: 13px`; szerokości: `.select` `min-width: 220px`, `.textInput`
`width: 260px; max-width: 60vw`, `.numberInput` `width: 120px`.
`.slider` `width: 180px`, `accent-color: #7c3aed`; `.sliderValue` `min-width: 30px` ·
`text-align: right` · `font-weight: 700` · `color: #6d28d9`.
`.secondaryButton` (:278-298): `padding: 7px 14px` · `border: 1px solid #d4d4d8` ·
`border-radius: 8px` · `background: #fff` · `color: #3f3f46` · `font-size: 13px`;
hover → obwód `#a78bfa`, tekst `#6d28d9`; disabled `opacity: 0.6`.

**Segmented motywu** (:215-244) — inny niż w kreatorze: `display: inline-flex` ·
`padding: 3px` · `gap: 3px` · `background: #f4f4f5`; `.segmentActive` =
`background: #fff` · `color: #6d28d9` · `box-shadow: 0 1px 3px rgba(24,24,27,0.12)`
(w kreatorze aktywny segment jest **fioletowy z białym tekstem** — §9.4).

**Przełącznik** `.toggle` (:247-276): `42×24px` (w kreatorze `44×24px`),
`border-radius: 999px`, tło `#d4d4d8` → `#7c3aed` gdy włączony;
`.toggleKnob` `18×18px`, `top/left: 3px`, `transform: translateX(18px)` gdy włączony
(w kreatorze `20px` — §9.4).

**Diagnostyka** (:301-394): `.statusRow` (`flex` · `gap: 11px` · `padding: 10px 0` ·
`border-bottom: 1px solid #f4f4f5`), `.dot` (`10×10px` · `border-radius: 50%` ·
`margin-top: 4px`), `.statusTag` (`padding: 1px 8px` · `border-radius: 999px` ·
`font-size: 10.5px` · `font-weight: 700` · `uppercase` · `color: #fff`),
`.modelChip` (`padding: 2px 8px` · `border-radius: 999px` · `background: #f1ecfe` ·
`color: #6d28d9` · `font-size: 11px`).

Trzy kolory statusu (:328-338, powtórzone dla `.statusTag` :364-372):
`.dotOk` `#16a34a` · `.dotWarn` `#d97706` · `.dotError` `#dc2626`.
**To trzeci komplet kolorów statusu w aplikacji** — patrz §9.2.

### 4.8 `/logowanie` i `/rejestracja`

Struktura i rama opisane w §3.3. Pozostałe elementy:

| klasa | linia | wartości |
|---|---|---|
| `.input` | auth:65-84 | `padding: 10px 12px` · `border: 1px solid #d4d4d8` · `border-radius: 8px` · `font-size: 14px` · `background: #fff` · `color: #18181b`; focus `outline: 2px solid #c4b5fd`, obwód `#a78bfa`; disabled tło `#f4f4f5`, tekst `#a1a1aa` |
| `.button` | :86-105 | `padding: 11px 16px` · `border-radius: 8px` · `background: #7c3aed` · `color: #fff` · `font-size: 14px` · `font-weight: 600`; hover `#6d28d9`; disabled `#c4b5fd` |
| `.error` | :107-115 | `padding: 10px 12px` · `border-radius: 8px` · `background: #fef2f2` · **`border: 1px solid #fecaca`** · `color: #991b1b` · `font-size: 13px` |
| `.info` | :117-125 | `padding: 10px 12px` · `border-radius: 8px` · `background: #f0fdf4` · `border: 1px solid #bbf7d0` · `color: #166534` · `font-size: 13px` — **jedyny zielony komunikat w aplikacji**, tylko na /rejestracja |
| `.devBlock` | :147-151 | `margin-top: 20px` · `padding-top: 20px` · `border-top: 1px dashed #d4d4d8` |
| `.devButton` | :153-174 | `width: 100%` · `padding: 10px 16px` · `border: 1px solid #d4d4d8` · `border-radius: 8px` · `background: #fff` · `color: #3f3f46` · `font-size: 13px` · `font-weight: 600`; hover tło `#fafafa`, obwód `#a1a1aa` |
| `.devHint` | :176-183 | `display: block` · `margin-top: 8px` · `font-size: 12px` · `color: #71717a` · `line-height: 1.5` · `text-align: center` |

Różnice /rejestracja (`app/rejestracja/page.js`): tytuł „Załóż konto", **trzy** pola
(Email, Hasło, Powtórz hasło), po sukcesie zamiast formularza pokazuje się
`.info` z `role="status"` i `.footer` z linkiem do logowania.
Blok deweloperski występuje **tylko** na /logowanie.

### 4.9 Panel mentora (`MentorPanel.js`, `MentorPanel.module.css`)

**Przycisk otwierania** `.toggle` (:2-20): `position: fixed` · `top: 16px` ·
`right: 16px` · `z-index: 1000` · `padding: 10px 16px` · `border-radius: 999px` ·
`background: #7c3aed` · `color: #fff` · `font-size: 14px` · `font-weight: 600` ·
`box-shadow: 0 2px 8px rgba(0,0,0,0.15)`; hover `#6d28d9`.
Treść: „💡 Mentor" (zamknięty) / „✕ Zamknij" (otwarty).

**Szuflada** `.panel` (:24-37): `position: fixed` · `top: 0` · `right: 0` ·
`z-index: 999` · `width: 380px` (fallback; realna inline) · `max-width: 96vw` ·
`height: 100dvh` · `flex column` · `background: #fff` ·
`border-left: 1px solid #e5e5e5` · `box-shadow: -4px 0 20px rgba(0,0,0,0.08)`.
Ciemny (:406-409): tło `#0f0f0f`, obwód `#262626`.

**Uchwyt** `.resizer` (:41-72): `position: absolute` na lewej krawędzi, `width: 5px`,
`cursor: col-resize`; linia `::before` przezroczysta, przy hover/focus/przeciąganiu
`width: 3px`, `background: #7c3aed`.

| klasa | linia | wartości |
|---|---|---|
| `.header` | :74-77 | `padding: 60px 20px 12px` (górny padding robi miejsce pod przycisk `.toggle`) · `border-bottom: 1px solid #eee` (ciemny `#262626`) |
| `.title` | :79-84 | `font-size: 18px` · `font-weight: 700` · `color: #6d28d9`; treść „Mentor AIDEAS" |
| `.subtitle` | :86-90 | `margin: 6px 0 0` · `font-size: 13px` · `color: #666` (ciemny `#999`) |
| `.backButton` | :93-102 | `margin-top: 6px` · `padding: 4px 8px` · `background: transparent` · `color: #6d28d9` · `font-size: 13px` · `font-weight: 600` |
| `.modePicker` | :104-110 | `flex: 1` · `flex column` · `gap: 12px` · `padding: 20px 16px` |
| `.modeButton` | :112-127 | `flex column` · `gap: 4px` · `padding: 16px` · `border: 1px solid #ddd6fe` · `border-radius: 12px` · `background: #f5f3ff` · `text-align: left`; hover `#ede9fe` / `#c4b5fd` (ciemny `#1a1530` / `#3b2f6b`) |
| `.modeTitle` | :129-133 | `font-size: 15px` · `font-weight: 700` · `color: #6d28d9` |
| `.modeDesc` | :135-138 | `font-size: 13px` · `color: #555` (ciemny `#aaa`) |
| `.messages` | :140-147 | `flex: 1` · `overflow-y: auto` · `padding: 16px` · `flex column` · `gap: 10px` |
| `.message` | :282-290 | `max-width: 90%` · `padding: 10px 12px` · `border-radius: 12px` · `font-size: 14px` · `line-height: 1.55` · `white-space: pre-wrap` |
| `.user` | :292-297 | `align-self: flex-end` · `background: #7c3aed` · `color: #fff` · `border-bottom-right-radius: 4px` |
| `.mentor` | :299-305 | `align-self: flex-start` · `background: #f5f3ff` · `border: 1px solid #ddd6fe` · `color: #111` · `border-bottom-left-radius: 4px` (ciemny `#1a1530` / `#3b2f6b` / `#ededed`) |
| `.role` | :307-313 | `font-size: 11px` · `font-weight: 600` · `opacity: 0.7` · `margin-bottom: 2px` |
| `.proposalCard` | :156-163 | `align-self: flex-start` · `max-width: 95%` · `padding: 10px 12px` · `border: 1px dashed #a78bfa` · `border-radius: 10px` · `background: #faf5ff` (ciemny `#17132e` / `#6d28d9`) |
| `.proposalHead` | :165-169 | `font-size: 12px` · `color: #6d28d9` · `margin-bottom: 6px` |
| `.proposalBody` | :171-177 | `font-size: 14px` · `color: #1f2937` · `margin-bottom: 10px` · `white-space: pre-wrap` (ciemny `#d4d4d8`) |
| `.acceptButton` | :188-202 | `padding: 8px 14px` · `border-radius: 8px` · `background: #7c3aed` · `color: #fff` · `font-size: 13px` · `font-weight: 600`; disabled `#c4b5fd` |
| `.appliedBadge` | :204-208 | `font-size: 13px` · `font-weight: 600` · `color: #15803d` (ciemny `#4ade80`) |
| `.pathButton` | :219-234 | `flex column` · `gap: 2px` · `padding: 12px 14px` · `border: 1px solid #a78bfa` · `border-radius: 10px` · `background: #faf5ff`; hover `#ede9fe` / `#7c3aed` |
| `.draftBox` | :248-254 | `flex column` · `gap: 8px` · `padding: 12px 16px 16px` · `border-top: 1px solid #eee` |
| `.draftInput` | :262-273 | `padding: 10px 12px` · **`border: 1px solid #ccc`** · `border-radius: 8px` · `font-size: 15px` · `min-height: 110px` · `max-height: 240px` · `color: #111` |
| `.error` | :357-365 | `margin: 0 16px` · `padding: 10px 12px` · `border: 1px solid #f3c2c2` · `background: #fdecec` · `color: #a30000` · `border-radius: 8px` · `font-size: 14px` |
| `.inputRow` | :367-372 | `flex` · `gap: 8px` · `padding: 12px 16px 16px` · `border-top: 1px solid #eee` |
| `.input` | :374-386 | `flex: 1` · `padding: 10px 12px` · `border: 1px solid #ccc` · `border-radius: 8px` · `font-size: 15px` · `resize: none` · `min-height: 44px` · `max-height: 140px` |
| `.sendButton` | :388-403 | `padding: 0 18px` · `border-radius: 8px` · `background: #7c3aed` · `color: #fff` · `font-size: 14px` · `font-weight: 600`; disabled `#c4b5fd` |
| `.dots span` | :330-336 | `6×6px` · `border-radius: 50%` · **`background: #a78bfa`** · `blink 1.2s` |
| `.empty` | :275-280 | `margin: auto` · `text-align: center` · `color: #999` · `font-size: 14px` |
| `.loader` | :315-323 | `align-self: flex-start` · `flex` · `gap: 8px` · `font-size: 14px` · `color: #666` · `padding: 8px 12px` |

Mentor **jest** dymkowy (wiadomość użytkownika fioletowa po prawej, mentora jasna
po lewej, oba ze ściętym rogiem `4px`) — inaczej niż Czaty (§4.6).

---

## 5. KREATOR RAG — osobny świat wizualny

Arkusz: `app/kreator-rag/kreator-rag.module.css` (671 linii). Klasy **po polsku**,
motyw **zawsze ciemny**, niezależnie od `data-theme`. Kolory żyją jako zmienne
na `.panel`, więc poza zakładką nie istnieją.

Podpięcie: `app/kreator-rag/layout.js:28` nakłada `.panel` na **ten sam element**
co `.content` z `layout.module.css` — dzięki temu ciemne tło sięga dołu okna.

### 5.1 Zmienne `.panel` (kreator-rag.module.css:17-24)

| zmienna | wartość | rola |
|---|---|---|
| `--tlo` | `#0f1115` | tło całej zakładki |
| `--karta` | `#1a1d24` | tło karty |
| `--obwod` | `#2a2f3a` | obwód karty, pola, znacznika |
| `--tekst` | `#e6e8ec` | tekst główny |
| `--przygaszony` | `#9aa2b1` | tekst drugorzędny, etykiety, nawigacja |
| `--ok` | `#37b26b` | zieleń: kropka OK, wypełnienie paska, mocny score |
| `--blad` | `#e5484d` | czerwień: kropka błędu, linia odcięcia, błąd formularza |
| `--nieznane` | `#d1a53a` | żółć: kropka nieznana, znacznik archiwum, średni score |

Wartości bazowe `.panel` (:28-30): `background: var(--tlo)` ·
`color: var(--tekst)` · `font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` ·
`line-height: 1.5`.

### 5.2 Reguły elementowe zawężone do `.panel`

Moduł powstał jako osobna aplikacja i malował dokument; tutaj każda taka reguła
została podpięta pod `.panel`:

| selektor | linia | wartości |
|---|---|---|
| `.panel *`, `::before`, `::after` | :39-43 | `box-sizing: border-box` |
| `.panel h1` | :45-48 | `font-size: 22px` · `margin: 0 0 4px` |
| `.panel button` | :50-59 | `background: #2a2f3a` · `color: var(--tekst)` · `border: 1px solid var(--obwod)` · `border-radius: 8px` · `padding: 8px 16px` · `font-size: 14px` · **`margin-bottom: 20px`** |
| `.panel button:hover` | :60-62 | `background: #333a47` |
| `.panel button:disabled` | :63-66 | `opacity: 0.5` · `cursor: default` |
| `.panel input[type='text']`, `.panel textarea` | :68-79 | `width: 100%` · `background: #12151b` · `color: var(--tekst)` · `border: 1px solid var(--obwod)` · `border-radius: 8px` · `padding: 8px 10px` · `font-size: 14px` · `margin-bottom: 10px` |
| `.panel textarea` | :80-83 | `min-height: 60px` · `resize: vertical` |
| `.panel label` | :84-89 | `display: block` · `font-size: 13px` · `color: var(--przygaszony)` · `margin-bottom: 4px` |

`margin-bottom: 20px` na **każdym** przycisku to cecha charakterystyczna tej
zakładki — dlatego rzędy przycisków (`.przyciski-rzad`, :194-201) zerują go
lokalnie.

### 5.3 Elementy wspólne

| klasa | linia | wartości |
|---|---|---|
| `.strona` | :91-95 | `max-width: 760px` · `margin: 0 auto` · `padding: 32px 20px 64px` |
| `.strona-szeroka` | :371-375 | `max-width: 1180px` · `margin: 0 auto` · `padding: 24px 20px 48px` |
| `.podtytul` | :98-102 | `color: var(--przygaszony)` · `margin: 0 0 24px` · `font-size: 14px` |
| `.karta` | :104-110 | `background: var(--karta)` · `border: 1px solid var(--obwod)` · `border-radius: 10px` · `padding: 16px 18px` · `margin-bottom: 14px` |
| `.naglowek-karty` | :112-118 | `flex` · `align-items: center` · `gap: 10px` · `font-weight: 600` · `font-size: 15px` |
| `.komunikat` | :130-134 | `color: var(--przygaszony)` · `font-size: 14px` · `margin: 8px 0 0` |
| `.kod` | :136-141 | monospace · `font-size: 12px` · `color: var(--nieznane)` · `margin-left: auto` |
| `.meta` | :161-167 | `color: var(--przygaszony)` · `font-size: 13px` · `margin-top: 24px` · `border-top: 1px solid var(--obwod)` · `padding-top: 16px` |
| `.nawigacja` | :175-191 | `flex` · `gap: 16px` · `margin-bottom: 24px` · `font-size: 14px`; linki `color: var(--przygaszony)`, hover `var(--tekst)`, `.aktywny` `var(--tekst)` + `font-weight: 600` |
| `.przyciski-rzad` | :194-201 | `flex` · `gap: 8px` · `flex-wrap: wrap`; przyciski w środku `margin-bottom: 0` |
| `.pusto` | :238-242 | `color: var(--przygaszony)` · `font-size: 14px` · `padding: 8px 0` |
| `.blad-formularza` | :244-248 | `color: var(--blad)` · `font-size: 13px` · `margin: 4px 0 10px` |
| `.checkbox-rzad` | :250-260 | `flex` · `align-items: center` · `gap: 8px` · `font-size: 14px` · `color: var(--przygaszony)` · `margin-bottom: 16px` |
| `.znacznik` | :225-232 | `inline-block` · `font-size: 11px` · `padding: 2px 8px` · `border-radius: 999px` · `border: 1px solid var(--obwod)` · `color: var(--przygaszony)` |
| `.znacznik.zarchiwizowana` | :233-236 | `color: var(--nieznane)` · `border-color: var(--nieznane)` |
| `.zastrzezenie` | :664-670 | `color: var(--przygaszony)` · `font-size: 12px` · `margin: 10px 0 0` · `border-left: 2px solid var(--obwod)` · `padding-left: 10px` |

### 5.4 `/kreator-rag` — diagnostyka

```html
<main class="strona">
  <nav class="nawigacja">
    <a class="aktywny">Diagnostyka</a> <a>Kolekcje</a>
  </nav>
  <h1>…</h1>
  <p class="podtytul">Sesja 0 — stan środowiska: Supabase, pgvector, Ollama.</p>
  <button>Odśwież</button>

  <div class="karta">
    <div class="naglowek-karty">
      <span class="kropka ok"></span>
      <span>Supabase</span>
      <span class="kod">200</span>
    </div>
    <p class="komunikat">…</p>
    <ul class="modele"><li>bge-m3</li>…</ul>
  </div>

  <div class="meta">…</div>
</main>
```

**Kropki statusu** `.kropka` (:120-128): `10×10px` · `border-radius: 50%` ·
`flex: 0 0 auto`. Trzy warianty: `.ok` → `var(--ok)` `#37b26b`,
`.blad` → `var(--blad)` `#e5484d`, `.nieznane` → `var(--nieznane)` `#d1a53a`.

**Lista modeli** `.modele` (:143-159): `list-style: none` · `flex` · `flex-wrap: wrap` ·
`gap: 8px` · `margin: 10px 0 0`; `li` = `background: #232733` ·
`border: 1px solid var(--obwod)` · `border-radius: 6px` · `padding: 4px 10px` ·
`font-size: 13px` · monospace.

### 5.5 `/kreator-rag/kolekcje`

Formularz „Nowa kolekcja" w `.karta`: pięć pól (Nazwa, Opis, `external_ref`,
Model embeddingów) — wszystkie stylowane regułami elementowymi z §5.2, bez
własnych klas. Pod formularzem `.blad-formularza` i `.przyciski-rzad`.

`.checkbox-rzad` z „Pokaż zarchiwizowane".

Lista kolekcji — każda w `.karta` z `.rzad-kolekcji` (:203-223):
`flex` · `align-items: flex-start` · `gap: 12px` · `justify-content: space-between`.
W środku `.tresc` (`min-width: 0`), `h3` (`margin: 0 0 2px` · `font-size: 15px`),
`.detale` (`color: var(--przygaszony)` · `font-size: 13px`; `code` w środku
monospace w `var(--tekst)`), oraz `.przyciski-rzad` z akcjami
(Przywróć / Archiwizuj / Usuń).

Znacznik `zarchiwizowana` (§5.3) przy nazwie.

### 5.6 `/kreator-rag/kolekcje/[id]`

**Układ dwukolumnowy** `.kolekcja-uklad` (:566-573): `display: grid` ·
`grid-template-columns: minmax(0, 1fr) minmax(0, 480px)` · `gap: 24px` ·
`align-items: start`. Prawa kolumna `.kolekcja-mapa` (:575-578):
`position: sticky` · `top: 16px`.

**Pasek postępu** — `.pasek` (:262-268): `height: 8px` · `background: #12151b` ·
`border: 1px solid var(--obwod)` · `border-radius: 999px` · `overflow: hidden`.
`.pasek-wypelnienie` (:269-273): `height: 100%` · `background: var(--ok)` ·
`transition: width 0.2s ease`. Używany dwukrotnie na stronie kolekcji
(page.js:770 i :790) — osobno dla indeksowania i osobno dla embeddingów, celowo
jako dwa paski, nie jeden.

**Wyszukiwarka** — formularz w `.karta` „Szukaj w dokumentach": pole tekstowe,
`.filtr-dokumentow` (:350-367: `flex` · `flex-wrap: wrap` · `gap: 6px 14px` ·
`margin: 4px 0 12px`; etykiety w środku `flex` · `gap: 6px` · `font-size: 13px` ·
`color: var(--tekst)` · `cursor: pointer`), `.checkbox-rzad` z trybem
diagnostycznym progu i `.przyciski-rzad` (Szukaj / Wyczyść).

**Wyniki**:

| klasa | linia | wartości |
|---|---|---|
| `.trafienie` | :277-282 | `border-top: 1px solid var(--obwod)` · `padding: 12px 0`; pierwsze bez obwodu |
| `.trafienie.odrzucone` | :286-288 | `opacity: 0.55` — wynik poniżej progu, widoczny tylko w diagnostyce |
| `.trafienie-naglowek` | :290-295 | `flex` · `align-items: baseline` · `gap: 8px` · `space-between` |
| `.trafienie-plik` | :296-301 | `font-size: 14px` · `font-weight: 600` · `overflow-wrap: anywhere` |
| `.trafienie-tresc` | :302-307 | `font-size: 13px` · `white-space: pre-wrap` · `margin-top: 6px` · `overflow-wrap: anywhere` |
| `.score` | :311-318 | monospace · `font-size: 13px` · `padding: 2px 8px` · `border-radius: 6px` · `border: 1px solid var(--obwod)` · `flex: 0 0 auto` |
| `.score.mocny` | :319 | `color` i `border-color` = `var(--ok)` |
| `.score.sredni` | :320 | `color` i `border-color` = `var(--nieznane)` |
| `.score.slaby` | :321 | `color: var(--przygaszony)` |
| `.linia-odciecia` | :324-340 | `flex` · `align-items: center` · `gap: 10px` · `margin: 14px 0 2px` · `color: var(--blad)` · `font-size: 12px` · monospace; `::before` i `::after` to kreski `height: 1px` · `background: var(--blad)` · `flex: 1` · `opacity: 0.6` |
| `.brak-trafien` | :342-348 | `border: 1px dashed var(--nieznane)` · `border-radius: 8px` · `padding: 14px 16px` · `color: var(--nieznane)` · `font-size: 14px` |

Linia odcięcia rysuje się dokładnie w miejscu, w którym `RAG_MIN_SCORE` tnie listę;
tekst „próg 0.45 — poniżej tej kreski nic nie wraca" (page.js:682).

### 5.7 Mapa i graf

Strony `/kreator-rag/kolekcje/[id]/mapa` i `/graf` istnieją, ale **nie mają wejścia
z nawigacji** — `.nawigacja` prowadzi tylko do Diagnostyki i Kolekcji.
Wejście: link `.mapa-pelny` z mapy osadzonej na stronie kolekcji (:602-605).

| klasa | linia | wartości |
|---|---|---|
| `.mapa-obudowa` | :377-383 | `position: relative` · `background: #0b0d12` · `border: 1px solid var(--obwod)` · `border-radius: 10px` · `overflow: hidden` |
| `.mapa-plotno` | :385-391 | `display: block` · `width: 100%` · **`height: 560px`** · `cursor: grab` · `touch-action: none`; przy przeciąganiu `.chwyt` → `cursor: grabbing` |
| `.mapa-dymek` | :396-409 | `position: absolute` · `pointer-events: none` · `max-width: 340px` · `background: rgba(16,19,26,0.97)` · `border: 1px solid var(--obwod)` · `border-radius: 8px` · `padding: 8px 10px` · `font-size: 12px` · `line-height: 1.45` · `box-shadow: 0 8px 24px rgba(0,0,0,0.5)` · `z-index: 3` |
| `.mapa-panel` (legenda) | :418-432 | `position: absolute` · `top/left: 10px` · `flex column` · `gap: 6px` · `background: rgba(16,19,26,0.9)` · `border-radius: 8px` · `padding: 8px 10px` · `font-size: 12px` · `z-index: 2` · `max-width: 260px` |
| `.legenda-wpis` | :433-439 | `flex` · `align-items: center` · `gap: 7px` · `color: var(--przygaszony)` |
| `.probka` | :440-445 | `10×10px` · `border-radius: 2px` · `flex: 0 0 auto` |
| `.mapa-sterowanie` | :447-461 | `position: absolute` · `top/right: 10px` · `flex` · `gap: 6px` · `z-index: 2`; przyciski `padding: 5px 10px` · `font-size: 12px` · tło `rgba(16,19,26,0.9)` · `margin-bottom: 0` |
| `.mapa-skala` | :462-470 | monospace · `font-size: 12px` · `color: var(--przygaszony)` · tło `rgba(16,19,26,0.9)` · `border-radius: 6px` · `padding: 5px 8px` |
| `.mapa-stan` | :523-532 | `flex` · wyśrodkowany · `height: 560px` · `flex-direction: column` · `gap: 10px` · `text-align: center` |
| `.mapa-licznik` | :533-537 | monospace · **`font-size: 28px`** · `color: var(--nieznane)` |
| `.przelacznik` | :541-562 | `flex` · `border: 1px solid var(--obwod)` · `border-radius: 6px` · `overflow: hidden`; przyciski w środku `border: none` · `border-radius: 0` · `padding: 5px 10px` · `font-size: 12px`; sąsiednie oddzielone `border-left`; `.wybrany` → `background: #2f3a4d` · `font-weight: 600` |
| `.mapa-postep` | :629-649 | `position: absolute` · `top: 10px` · `left: 50%` · `transform: translateX(-50%)` · `min-width: 260px` · tło `rgba(16,19,26,0.92)` · `border-radius: 6px` · `padding: 6px 12px` · `font-size: 12px` · `color: var(--nieznane)` |
| `.mapa-info-3d` | :651-662 | `position: absolute` · `bottom/left: 10px` · tło `rgba(16,19,26,0.92)` · `padding: 5px 10px` · `font-size: 12px` · `color: var(--nieznane)` |
| `.graf-uklad` | :477-484 | `display: grid` · `grid-template-columns: minmax(0, 260px) minmax(0, 1fr)` · `gap: 14px` · `align-items: start` |
| `.graf-legenda .mapa-panel` | :485-489 | `position: static` · `max-width: none` — legenda obok płótna, nie na nim |
| `.graf-suwak` | :498-521 | `flex` · `gap: 8px` · tło `rgba(16,19,26,0.9)` · `border-radius: 6px` · `padding: 4px 9px` · `font-size: 12px` · `color: var(--przygaszony)`; `span` monospace z `min-width: 34px` i `text-align: right`; `input[type=range]` `width: 96px` · **`accent-color: #fbbf24`** |
| `.mapa-belka` | :592-601 | `flex` · `align-items: baseline` · `gap: 10px` · `margin-bottom: 8px` · `font-size: 13px` |

**Mapa osadzona** (`.mapa-komponent.osadzona`, :609-624) zwęża panele:
legenda `max-height: 120px` · `max-width: 44%` · `font-size: 11px` · `padding: 6px 8px`;
sterowanie `max-width: 54%` · `flex-wrap: wrap` · `justify-content: flex-end`.

---

## 6. KOMPONENTY POWTARZALNE

### 6.1 Przyciski — pełny katalog

Aplikacja ma **13 różnych definicji przycisku**. Poniżej wszystkie, pogrupowane.

#### Główny (fioletowy, wypełniony)

| nazwa | plik:linia | padding | radius | font | tło / hover / disabled |
|---|---|---|---|---|---|
| `.primaryButton` | workspace:112-131 | `9px 16px` | `8px` | `14px/600` | `#7c3aed` / `#6d28d9` / `#c4b5fd` |
| `.primaryButton` | FormModal:94-112 | `9px 16px` | `8px` | `14px/600` | identyczne (celowa kopia, komentarz :93) |
| `.button` | sections:302-320 | `10px 16px` | `8px` | `13.5px/600` | `#7c3aed` / `#6d28d9` / `#c4b5fd` |
| `.saveButton` | MasterDetailCreator:95-113 | `10px 22px` | **`9px`** | `14px/700` | `#7c3aed` / `#6d28d9` / **`#d4d4d8`** |
| `.button` | auth:86-105 | `11px 16px` | `8px` | `14px/600` | `#7c3aed` / `#6d28d9` / `#c4b5fd` |
| `.acceptButton` | MentorPanel:188-202 | `8px 14px` | `8px` | `13px/600` | `#7c3aed` / — / `#c4b5fd` |
| `.sendButton` | MentorPanel:388-403 | `0 18px` | `8px` | `14px/600` | `#7c3aed` / — / `#c4b5fd` |
| `.newButton` | chats:74-89 | `9px 12px` | **`9px`** | `13px/700` | `var(--purple)` `#4b0fb4` / `brightness(1.08)` / — |
| `.sendButton` | chats:719-738 | `0 20px` | **`9px`** | `14px/700` | `var(--purple)` / `brightness(1.08)` / `#c4b5fd` |
| `.sendButton` | AgentChat:190-205 | `0 20px` | `8px` | `14px/600` | **`#2563eb`** / — / `#9db8ef` |
| `.toggle` (mentor) | MentorPanel:2-20 | `10px 16px` | `999px` | `14px/600` | `#7c3aed` / `#6d28d9` / — |

#### Drugorzędny (ghost)

| nazwa | plik:linia | padding | radius | font | tło / obwód / kolor |
|---|---|---|---|---|---|
| `.ghostButton` | workspace:150-169 | `6px 12px` | `8px` | `13px/600` | `#fff` / `#d4d4d8` / `#3f3f46`; hover `#f4f4f5` + `#a1a1aa`; disabled `opacity: 0.5` |
| `.ghostButton` | FormModal:135-154 | `6px 12px` | `8px` | `13px/600` | identyczne |
| `.backButton` | BackButton:4-24 | `6px 12px` | `8px` | `13px/600` | identyczne (komentarz :2 potwierdza zamiar) |
| `.removeButton` | sections:322-338 | `4px 10px` | `6px` | `12px/600` | `#fff` / `#e4e4e7` / `#71717a`; hover → `#fef2f2` / `#fca5a5` / `#b91c1c` |
| `.secondaryButton` | ustawienia:278-298 | `7px 14px` | `8px` | `13px/600` | `#fff` / `#d4d4d8` / `#3f3f46`; hover → obwód `#a78bfa`, tekst `#6d28d9` |
| `.devButton` | auth:153-174 | `10px 16px` | `8px` | `13px/600` | `#fff` / `#d4d4d8` / `#3f3f46`; hover tło `#fafafa`, obwód `#a1a1aa` |
| `.logoutButton` | Sidebar:160-181 | `7px 10px` | `8px` | `12px/600` | `transparent` / `#d4d4d8` / `#52525b` |
| `.panel button` | kreator-rag:50-66 | `8px 16px` | `8px` | `14px` | `#2a2f3a` / `var(--obwod)` / `var(--tekst)`; hover `#333a47`; disabled `opacity: 0.5` |

#### Nieodwracalny (danger)

| nazwa | plik:linia | wygląd |
|---|---|---|
| `.dangerButton` | workspace:173-192 | **obrys**: `#fff` / `1px solid #fca5a5` / `#b91c1c`; hover `#fef2f2` + `#dc2626` |
| `.dangerButton` | FormModal:115-133 | **wypełniony**: `#dc2626` / bez obwodu / `#fff`; hover `#b91c1c`; disabled `#fca5a5` |
| `.deleteButton` | chats:510-524 | obrys: `#fff` / `#fca5a5` / `#b91c1c`; `padding: 5px 11px`, `font-size: 12.5px` |

Rozdział jest celowy (komentarze workspace:171-172 i FormModal:114): akcja w karcie
jest obrysowa, submit w modalu wypełniony.

#### Pozostałe

`.modalClose` (FormModal:42-66) — `30×30px`, `border-radius: 8px`, `font-size: 20px`,
`color: #71717a`, hover `#f4f4f5`/`#18181b`. Treść `×`.
`.editNameButton` (MasterDetailCreator:42-56) — `padding: 4px 6px`,
`border-radius: 6px`, `opacity: 0.6`. Treść ✏️.
`.removeCard` (MasterDetailCreator:235-245) — `width: 30px`, obwód tylko z lewej.
Treść `×`.
`.convMenuBtn` (chats:160-175) — `26×26px`, `opacity: 0` do momentu hover.

### 6.2 Pola formularzy

Trzy niezależne definicje pola tekstowego:

| gdzie | plik:linia | padding | font-size | obwód | radius |
|---|---|---|---|---|---|
| listy (`.input`/`.textarea`) | workspace:80-101 | `9px 11px` | `14px` | `#d4d4d8` | `8px` |
| kreator (`.input`/`.textarea`/`.select`) | sections:49-73 | `10px 12px` | `14px` | `#d4d4d8` | `8px` |
| ustawienia (`.select`/`.textInput`/`.numberInput`) | ustawienia:162-180 | `8px 11px` | `13px` | `#d4d4d8` | `8px` |
| logowanie (`.input`) | auth:65-79 | `10px 12px` | `14px` | `#d4d4d8` | `8px` |
| Czaty (`.input`) | chats:699-717 | `10px 12px` | `14px` | `#d4d4d8` | `9px` |
| Czaty (`.search`) | chats:91-107 | `8px 11px` | `13px` | `#e4e4e7` | `8px` |
| Mentor (`.input`/`.draftInput`) | MentorPanel:262-273, 374-386 | `10px 12px` | `15px` | **`#ccc`** | `8px` |
| Kreator RAG | kreator-rag:68-79 | `8px 10px` | `14px` | `var(--obwod)` | `8px` |

**Focus** jest spójny wszędzie poza Mentorem i Kreatorem RAG (te nie mają reguły focus):
```css
outline: 2px solid #c4b5fd;
outline-offset: -1px;
border-color: #a78bfa;
```
(sections:67-73, workspace:96-101, auth:75-79, chats:103-107 i :713-717, ustawienia:174-180)

**Etykiety** — cztery warianty: `.label` w kreatorze `13px/700` `#3f3f46`
(sections:37-41), na listach `12px/600` `#52525b` (workspace:74-78), w logowaniu
`13px/600` `#3f3f46` (auth:59-63), w Kreatorze RAG `13px` `var(--przygaszony)`
z `display: block` (kreator-rag:84-89).

**Textarea — wysokości minimalne**: `62px` (listy), `190px` (kreator, domyślnie),
`110px` (QA, inline), `44px` (pole czatu), `110px` (`.draftInput` mentora),
`60px` (Kreator RAG).

### 6.3 Przełączniki `role="switch"`

Dwie implementacje, prawie identyczne:

| cecha | kreator (sections:265-299) | ustawienia (ustawienia:247-276) |
|---|---|---|
| klasa | `.switch` / `.switchOn` / `.switchKnob` | `.toggle` / `.toggleOn` / `.toggleKnob` |
| szerokość | **`44px`** | **`42px`** |
| wysokość | `24px` | `24px` |
| radius | `999px` | `999px` |
| tło wyłączony | `#d4d4d8` | `#d4d4d8` (ciemny `#3f3f46`) |
| tło włączony | `#7c3aed` | `#7c3aed` |
| knob | `18×18px`, `top/left: 3px`, `border-radius: 50%`, `#fff` | identycznie |
| przesunięcie | **`translateX(20px)`** | **`translateX(18px)`** |
| stan wyłączony | `.switchDisabled` → `opacity: 0.45`, `cursor: not-allowed` | brak |
| przejście | `background .15s`, `transform .15s` | identycznie |

Markup w obu przypadkach: `<button role="switch" aria-checked={bool} aria-label="…">`
z jednym `<span class="…Knob">` w środku.

### 6.4 Modal (`FormModal.js` + `FormModal.module.css`)

```html
<div class="modalOverlay">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="…">
    <div class="modalHeader">
      <h2 class="modalTitle" id="…">Nowy projekt</h2>
      <button class="modalClose" aria-label="Zamknij">×</button>
    </div>
    <form>
      <div class="modalBody">
        <div class="modalError" role="alert">…</div>   <!-- warunkowo -->
        …pola…
      </div>
      <div class="modalActions">
        <button class="ghostButton">Anuluj</button>
        <button class="primaryButton">Utwórz projekt</button>   <!-- lub dangerButton -->
      </div>
    </form>
  </div>
</div>
```

| klasa | linia | wartości |
|---|---|---|
| `.modalOverlay` | :3-14 | `position: fixed` · `inset: 0` · `z-index: 1100` · `flex` · `align-items: flex-start` · `justify-content: center` · `padding: 48px 16px` · `overflow-y: auto` · `background: rgba(24,24,27,0.55)` · `animation: overlayIn .15s ease-out` |
| `.modal` | :16-24 | `width: 100%` · `max-width: 520px` · `border: 1px solid #e4e4e7` · `border-radius: 14px` · `background: #fff` · `box-shadow: 0 18px 50px rgba(24,24,27,0.28)` · `animation: modalIn .16s ease-out` (ciemny `#131318` / `#27272a`) |
| `.modalHeader` | :26-33 | `flex` · `space-between` · `align-items: center` · `gap: 12px` · `padding: 16px 18px` · `border-bottom: 1px solid #ececef` (ciemny `#27272a`) |
| `.modalTitle` | :35-40 | `font-size: 15px` · `font-weight: 700` · `color: #6d28d9` (ciemny `#c4b5fd`) |
| `.modalBody` | :68-73 | `flex column` · `gap: 12px` · `padding: 18px` |
| `.modalError` | :76-84 | `padding: 10px 12px` · `border: 1px solid #fca5a5` · `border-radius: 8px` · `background: #fef2f2` · `color: #991b1b` · `font-size: 13px` · `line-height: 1.45` |
| `.modalActions` | :86-91 | `flex` · `justify-content: flex-end` · `gap: 8px` · `padding: 0 18px 18px` |

**Animacje** (:156-167): `overlayIn` = `opacity` 0→1; `modalIn` = `opacity` 0→1
plus `transform: translateY(-8px) scale(0.985)` → domyślny.
Przy `prefers-reduced-motion: reduce` (:169-174) obie wyłączone.

Zamykanie: `×`, Escape (FormModal.js:23-30), `mousedown` na tle (`onMouseDown`
zamiast `onClick` — komentarz FormModal.js:35-36), przycisk „Anuluj".

### 6.5 Karty

| typ | plik:linia | padding | radius | obwód | tło |
|---|---|---|---|---|---|
| karta listy | workspace:217-223 | `16px` | `12px` | `#e4e4e7` | `#fff` |
| karta pliku | wiedza:41-49 | `14px 16px` | `12px` | `#e4e4e7` | `#fff` |
| karta parametru | MasterDetailCreator:157-166 | `12px 12px` (na `.cardButton`) | `12px` | `#e4e4e7` | `#fff` |
| karta wyboru | MasterDetailCreator:314-326 | `14px 16px` | `12px` | `#e4e4e7` | `#fff` |
| karta modelu | sections:133-143 | `12px 14px` | `10px` | `#e4e4e7` | `#fff` |
| wiersz narzędzia | sections:215-225 | `12px 14px` | `10px` | `#e4e4e7` | `#fff` |
| para Q&A | sections:604-613 | `14px` | `10px` | `#e4e4e7` | `#fff` |
| wiersz pliku | sections:531-539 | `11px 13px` | `10px` | `#e4e4e7` | `#fff` |
| część promptu | sections:433-438 | 0 (padding w środku) | `10px` | `#e4e4e7` | `#fff` |
| karta ustawień | ustawienia:95-101 | `6px 20px 8px` | `14px` | `#e4e4e7` | `#fff` |
| nagłówek kreatora | MasterDetailCreator:9-22 | `14px 18px` | `14px` | `#e4e4e7` | `#fff` |
| `.detail` kreatora | MasterDetailCreator:287-293 | `22px 24px` | `14px` | `#e4e4e7` | `#fff` |
| karta logowania | auth:14-22 | `32px` | `14px` | `#e4e4e7` | `#fff` |
| `.karta` RAG | kreator-rag:104-110 | `16px 18px` | `10px` | `var(--obwod)` | `var(--karta)` |

Reguła nieformalna: **`14px` dla kart-kontenerów, `12px` dla kart list,
`10px` dla wierszy wewnątrz sekcji.** Trzymana konsekwentnie.

Tło ciemne karty to zawsze `#131318`, obwód `#27272a` — bez wyjątku.

### 6.6 Paski postępu

Jedyna implementacja: `.pasek` / `.pasek-wypelnienie` (kreator-rag:262-273), opis §5.6.
Poza Kreatorem RAG aplikacja nie ma pasków postępu — stan ładowania sygnalizują
teksty („Wczytuję projekty…") albo kropki `.dots`.

### 6.7 Znaczniki statusu — cztery komplety

| komplet | plik | OK | ostrzeżenie | błąd |
|---|---|---|---|---|
| kreator (`.statusReady/Warn/Error`) | sections:573-586 | `#15803d` | `#b45309` | `#b91c1c` |
| magazyn (`.statusReady/Warn/Error`) | wiedza:77-90 | `#15803d` | `#b45309` | `#b91c1c` |
| ustawienia (`.dotOk/Warn/Error`) | ustawienia:328-338 | **`#16a34a`** | **`#d97706`** | **`#dc2626`** |
| Kreator RAG (`--ok/--nieznane/--blad`) | kreator-rag:22-24 | **`#37b26b`** | **`#d1a53a`** | **`#e5484d`** |

Wersje ciemne pierwszych dwóch: `#4ade80` / `#fbbf24` / `#ff8f8f`.
Patrz §9.2.

### 6.8 Komunikaty błędu i ostrzeżenia

**Błąd — wariant „zinc/red", 8 kopii tych samych wartości**
(`background: #fef2f2` · `border: 1px solid #fca5a5` · `color: #991b1b`):
workspace:303-312 (`padding: 14px 16px`, radius `10px`, `14px`),
page.module.css:126-134 (identycznie),
MasterDetailCreator:115-123 (`12px 16px`, `10px`, `13.5px`),
sections:588-597 (`11px 13px`, `9px`, `13px`),
FormModal:76-84 (`10px 12px`, `8px`, `13px`),
chats:659-666 (`9px 12px`, `8px`, `13.5px`),
chats:847-856 (`.dropdownError`, `8px 10px`, `6px`, `12.5px`),
ustawienia:396-404 (`9px 12px`, `8px`, `13px`).
Ciemny wszędzie: `#2a1212` / `#5a2a2a` / `#ff8f8f`.

**Błąd — wariant „stary", 2 kopie** (`background: #fdecec` ·
`border: 1px solid #f3c2c2` · `color: #a30000`): MentorPanel:357-365,
AgentChat:162-169.

**Błąd — wariant logowania**: `#fef2f2` / **`#fecaca`** / `#991b1b` (auth:107-115).
Obwód różni się od pozostałych o jeden stopień.

**Ostrzeżenie żółte**: `.note` (sections:115-124) i `.previewBanner`
(sections:341-353) — `#fffbeb` / `#fde68a` / `#78350f`;
`.toolNote` (sections:252-262) — `#fef3c7` / `#fde68a` / `#92400e`;
`.promptWarn` (sections:515-522) — `#fffbeb` / `#fde68a` (tylko górny) / `#92400e`.
Ciemny: `#241c07` / `#5a4a14` / `#fcd34d`.

**Informacja niebieska**: `.roleNote` (sections:407-419) i `.banner`
(ustawienia:19-27) — `#eff6ff` / `#bfdbfe` / `#1e40af`. Ciemny `.roleNote`
`#0f1f3d`/`#1e3a8a`/`#93c5fd`, `.banner` `#10233f`/`#1e3a5f`/`#93c5fd` —
**dwa różne tła ciemne dla tego samego wzoru jasnego**.

**Informacja zielona**: `.info` (auth:117-125) — `#f0fdf4` / `#bbf7d0` / `#166534`.
Jedyne wystąpienie w aplikacji.

**Stan pusty**: `.info` (workspace:319-326 i page.module.css:117-124) —
`padding: 24px` · `border: 1px dashed #d4d4d8` · `border-radius: 12px` ·
`text-align: center` · `color: #71717a` · `font-size: 14px`;
`.empty` (sections:205-212) — `padding: 18px` · dashed `#d4d4d8` · radius `10px` ·
`color: #a1a1aa` · `13px`; `.emptyState` (chats:325-334) — `padding: 40px 24px` ·
dashed `#d4d4d8` · radius `12px` · `color: #71717a` · `14px` · `max-width: 420px`;
`.pusto` (kreator-rag:238-242) — bez obwodu.

### 6.9 Animacja „pisze…" (`.dots`)

Trzy kopie tej samej animacji, różniące się **wyłącznie kolorem kropki**:

| plik:linia | kolor |
|---|---|
| chats:632-638 | `var(--purple)` = `#4b0fb4` |
| MentorPanel:330-336 | `#a78bfa` |
| AgentChat:135-141 | `#999` |

Wspólne: `6×6px`, `border-radius: 50%`, `animation: blink 1.2s infinite both`,
opóźnienia `0.2s` i `0.4s` dla drugiej i trzeciej kropki, keyframes
`0%,80%,100% { opacity: 0.2 } 40% { opacity: 1 }`.

---

## 7. IKONY I EMOJI

Aplikacja **nie ma biblioteki ikon**. Poza dwoma inline SVG w awatarach wszystko
to emoji i znaki tekstowe.

### 7.1 Emoji sekcji kreatora

Każda ikona występuje **dwukrotnie**: w rejestrze parametrów (karta na liście)
i w nagłówku samej sekcji.

| emoji | znaczenie | rejestr | sekcja |
|---|---|---|---|
| 🎭 | Osobowość | parameters.js:15 | PersonaSection.js:25 |
| 🧠 | Model AI | parameters.js:24 | ModelSection.js:119 |
| 🌡️ | Temperatura | parameters.js:37 | TemperatureSection.js:37 |
| 📋 | Zasady | parameters.js:46 | RulesSection.js:41 |
| 📚 | Baza wiedzy | parameters.js:55 | KnowledgeBaseSection.js:164 |
| 🔎 | RAG | parameters.js:68 | RagSection.js:105 |
| 💬 | Pytania i odpowiedzi | parameters.js:77 | QaSection.js:60 |
| 🛠️ | Narzędzia | parameters.js:86 | ToolsSection.js:108 |
| ↔️ | Wejście / Wyjście | parameters.js:107 | IoSection.js:70 |
| 🧪 | Test agenta | parameters.js:95 | TestSection.js:86 |

Te same emoji (bez 🔎, 🧠, 🌡️, 🛠️, 🧪) wracają jako ikony części promptu
w podglądzie: `TestSection.js:17-23` — `persona` 🎭, `rules` 📋, `qa` 💬,
`knowledge` 📚, `format` ↔️, fallback „•".

Wszystkie renderowane w `<span aria-hidden="true">` — czytnik ekranu ich nie czyta.

### 7.2 Emoji w pozostałych miejscach

| emoji | gdzie | plik:linia | kontekst |
|---|---|---|---|
| 💡 | pasek wiedzy | ConceptBar.js:42 | ikona „Czym jest…?" |
| 💡 | przycisk mentora | MentorPanel.js:353 | „💡 Mentor" (zamknięty) |
| 💡 | baner ustawień | ustawienia/page.js:18 | `.bannerIcon` |
| 🔌 | ustawienia | ustawienia/page.js:16 | sekcja „Połączenia" |
| 🎨 | ustawienia | ustawienia/page.js:17 | sekcja „Wygląd" |
| 🤖 | ustawienia | ustawienia/page.js:19 | sekcja „Mentor" |
| 💳 | koszt narzędzia | ToolsSection.js:131, RagSection.js:131 | prefiks `.toolCost` |
| ⚠️ | ostrzeżenia | ModelSection.js:172, RagSection.js:155, ToolsSection (notka) | prefiks `.note` / `.toolNote` |
| ⚠️ | błędy inline | czaty/page.js:436 i :472, ustawienia/page.js:136, ConversationChat.js:205, MentorPanel.js:506, kolekcje/[id]/page.js:764 | prefiks komunikatu błędu |
| ℹ️ | notka o rolach | TestSection.js:96 | `.roleNote` |
| 📄 | plik w podglądzie | TestSection.js:147 | `.promptFile` |
| 🔧 | użycie narzędzia | ConversationChat.js:174, AgentChat.js:169 | `.msgToolBadge` / `.toolBadge` |
| ⚙ | Ustawienia | Sidebar.js:123 | `.linkIcon` |
| ✏️ | edycja nazwy | MasterDetailCreator.js:139 | `.editNameButton` |
| ✕ | zamknięcie mentora | MentorPanel.js:353 | „✕ Zamknij" |
| ✓ | status zapisu | MasterDetailCreator.js:151 | „✓ Zapisano" |

### 7.3 Znaki tekstowe

| znak | gdzie | znaczenie |
|---|---|---|
| `×` | `.modalClose` (FormModal.js:58), `.removeCard` (MasterDetailCreator.js:226) | zamknij / usuń |
| `→` | „Otwórz agentów →", „Konfiguruj →", „Zobacz agentów →", „Przejdź do projektów →" | kierunek nawigacji w przód |
| `←` | `BackButton` (`.arrow`) | nawigacja wstecz |
| `↗` | „Zarządzaj magazynem ↗" (KnowledgeBaseSection.js:276) | link otwierany w nowej karcie |
| `+` / `−` | `.chevron` w `ConceptBar` (ConceptBar.js:46) | zwiń / rozwiń |
| `⋯` | `.convMenuBtn` (Czaty) | menu akcji rozmowy |
| `•` | `.statusDirty` („• Niezapisane zmiany"), fallback ikony promptu | kropka stanu |
| `·` | separator w `.cardMeta`, `.modelMeta`, `.fileMeta`, `.promptPartSource`, `.hint` | rozdzielenie danych |
| `≥` | `.graf-suwak` (kreator-rag) | próg wystąpień |

### 7.4 SVG

Dwa inline SVG w `components/chats/Avatar.js`, oba `stroke`-owe, bez wypełnienia,
z `aria-hidden="true"`:
- **robot** (Avatar.js:15-22) — agent i placeholder,
- **sylwetka** (Avatar.js:39-42) — użytkownik.

Trzeci wariant awatara (model) to **tekst** „AI" z `font-weight: 800`
(Avatar.module.css:13-16), nie SVG.

---

## 8. RESPONSYWNOŚĆ

Aplikacja ma **8 zapytań medialnych rozmiarowych** i 3 progi. Do tego 15 bloków
`prefers-color-scheme: dark` (§1.2) i 1 blok `prefers-reduced-motion`.

### 8.1 Próg 720px

| plik:linia | co zmienia |
|---|---|
| `layout.module.css:17-25` | `.shell` → `flex-direction: column` (sidebar nad treścią); `.content` padding `32px 28px 64px` → **`20px 16px 48px`** |
| `Sidebar.module.css:69-76` | `.sidebar` → `width: 100%`, `min-height: auto`, `border-right: none`, `border-bottom: 1px solid #e9e9ee` |
| `Sidebar.module.css:98-102` (w bloku dark) i `:124-128` | w motywie ciemnym `border-bottom-color: #262233` |
| `ustawienia.module.css:50-54` | `.layout` → `grid-template-columns: 1fr` (nawigacja nad treścią) |

### 8.2 Próg 900px

| plik:linia | co zmienia |
|---|---|
| `MasterDetailCreator.module.css:344-352` | `.columns` → `grid-template-columns: 1fr` (lista parametrów nad edytorem); `.master` → `position: static` (koniec przyklejenia) |
| `page.module.css:32-36` | `.main` padding `28px 24px 60px` → **`20px 14px 40px`** |

### 8.3 Progi 980px i 1100px — tylko Kreator RAG

| plik:linia | co zmienia |
|---|---|
| `kreator-rag.module.css:490-494` | `.graf-uklad` → `grid-template-columns: minmax(0, 1fr)` — legenda schodzi nad płótno |
| `kreator-rag.module.css:580-588` | `.kolekcja-uklad` → jedna kolumna; `.kolekcja-mapa` → `position: static` |

### 8.4 `prefers-reduced-motion`

`FormModal.module.css:169-174` — wyłącza `overlayIn` i `modalIn`.
**Jedyne** takie zapytanie w aplikacji; animacje `blink` w trzech czatach
oraz `transition` na kartach i przełącznikach **nie** są wyłączane.

### 8.5 Czego nie ma

- Brak zapytań dla ekranów bardzo szerokich (>1400px) — szerokości ograniczają
  `max-width`: 960px (listy), 1000px (ustawienia), 1180px (kreator, `.strona-szeroka`),
  1250px (Czaty), 760px (`.strona` RAG), 820px (kolumna wiadomości), 520px (modal),
  400px (karta logowania).
- Panel mentora nie ma progu — ogranicza go `max-width: 96vw` (MentorPanel:30)
  i logika JS (`MENTOR_MIN = 280`, page.js:22).
- Rama Czatów ma stałą `height: calc(100vh - 120px)` (chats:14) **bez** żadnego
  progu — na niskim oknie to jedyna reguła decydująca o wysokości.

---

## 9. NIESPÓJNOŚCI

Sekcja najważniejsza dla odtworzenia. Każdy punkt = miejsce, w którym ta sama
rzecz wygląda inaczej w różnych częściach aplikacji.

### 9.1 Dwa ekrany bez motywu ciemnego

`app/logowanie/auth.module.css` (159 linii) **nie ma ani jednej reguły motywu**.
Przy `data-theme="dark"` `body` dostaje tło `#0a0a0a` (globals.css:20), ale
`.screen` maluje na nim `#fafafa` (auth:11), a karta `#fff` (auth:15) — ekran
logowania i rejestracji zostaje **jasny w ciemnym motywie**. Nie jest to widoczne
jako błąd (ekran jest samodzielny), ale odtwarzając makietę trzeba wiedzieć,
że to jedyne dwa ekrany bez wariantu ciemnego.

Kreator RAG jest odwrotnym przypadkiem — **zawsze ciemny**, też bez wariantu.

### 9.2 Cztery komplety kolorów statusu

Ta sama semantyka (OK / ostrzeżenie / błąd), cztery różne trójki — szczegóły w §6.7:

| kontekst | zieleń | żółć/pomarańcz | czerwień |
|---|---|---|---|
| kreator + magazyn | `#15803d` | `#b45309` | `#b91c1c` |
| ustawienia | `#16a34a` | `#d97706` | `#dc2626` |
| Kreator RAG | `#37b26b` | `#d1a53a` | `#e5484d` |
| (ciemny, dwa pierwsze) | `#4ade80` | `#fbbf24` | `#ff8f8f` |

Do zunifikowania: przyjąć trójkę kreatora (`#15803d` / `#b45309` / `#b91c1c`)
i przemapować pozostałe.

### 9.3 Trzy czaty, trzy palety

W aplikacji są trzy niezależne komponenty czatu, każdy z własnym wyglądem:

| cecha | Czaty (`chats.module.css`) | Mentor (`MentorPanel.module.css`) | Test agenta (`AgentChat.module.css`) |
|---|---|---|---|
| kolor akcentu | `#4b0fb4` (`--purple`) | `#7c3aed` | **`#2563eb`** (niebieski) |
| wiadomość użytkownika | `.msgBox` na `#fff`, **bez dymka** | dymek `#7c3aed`, biały tekst, prawy | dymek `#2563eb`, biały tekst, prawy |
| wiadomość agenta | `.msgBox` na `#faf9fe`, bez dymka | dymek `#f5f3ff` + obwód `#ddd6fe` | dymek `#fff` + obwód `#e5e5e5` |
| kropki loadera | `#4b0fb4` | `#a78bfa` | `#999` |
| obwód pola | `#d4d4d8` | `#ccc` | `#ccc` |
| font-size pola | `14px` | `15px` | `15px` |
| radius przycisku wyślij | `9px` | `8px` | `8px` |
| plakietka narzędzia | `.msgToolBadge` `11.5px/600` | — | `.toolBadge` `12px/500` |
| kolor błędu | `#fef2f2`/`#fca5a5`/`#991b1b` | `#fdecec`/`#f3c2c2`/`#a30000` | `#fdecec`/`#f3c2c2`/`#a30000` |

Plakietka narzędzia i lista źródeł są w Czatach i w Teście agenta **prawie**
identyczne (`#eef2ff` / `#c7d2fe` / `#3730a3`) — różnią się tylko rozmiarem
i wagą fontu.

**Do makiety:** jeśli chcesz jednego czatu, weź Czaty jako wzorzec (najnowszy,
najpełniejszy), ale zamień `#4b0fb4` na `#7c3aed`, żeby zgadzał się z resztą.

### 9.4 Ten sam komponent, inne wymiary

| komponent | kreator | ustawienia | różnica |
|---|---|---|---|
| przełącznik | `44×24px`, knob `translateX(20px)` | `42×24px`, knob `translateX(18px)` | 2px szerokości |
| segmented — aktywny | `background: #7c3aed`, `color: #fff` | `background: #fff`, `color: #6d28d9`, `box-shadow` | **odwrócona logika** |
| segmented — kontener | `gap: 6px`, `padding: 4px`, tło `#fafafa` | `gap: 3px`, `padding: 3px`, tło `#f4f4f5` | |
| segment | `padding: 7px 14px` | `padding: 6px 12px` | |

Aktywny segment to najpoważniejsza z tych różnic: w kreatorze wybór jest
**wypełniony fioletem**, w ustawieniach **biały z fioletowym tekstem**.

### 9.5 Ta sama klasa, dwie definicje

`.dropZone` istnieje w dwóch arkuszach — jasny motyw **identyczny**, ciemny **inny**:

| | sections.module.css | wiedza.module.css |
|---|---|---|
| jasny | `#faf5ff` / `2px dashed #c4b5fd` / `#6d28d9` | identycznie (:17-28) |
| hover jasny | `#f3ebff` / `#7c3aed` | identycznie |
| **ciemny** | `#17132e` / `#3b2f6b` / `#c4b5fd` (:757) | **`#17132a` / `#4c3a86`** / `#c4b5fd` (:148) |
| hover ciemny | `#221a45` / `#7c3aed` (:763) | **`#1e1838`** / `#7c3aed` (:154) |

Różnica jest o jeden bit w ostatniej cyfrze tła (`#17132e` vs `#17132a`) — czyli
najprawdopodobniej literówka przy kopiowaniu, nie decyzja.

Podobnie **`.dropZone` w sections.module.css ma dwie sprzeczne reguły ciemne**:
:757-761 ustawia tło `#17132e`, a :806-810 (`.segmented, .dropZone`) nadpisuje je
na `#131318`. Wygrywa druga, bo stoi później — więc realnie strefa uploadu
w kreatorze jest w ciemnym motywie **szara, nie fioletowa**, wbrew intencji.
To jest realna usterka wizualna, nie tylko nieporządek.

### 9.6 Martwe klasy

| klasa | plik:linia | stan |
|---|---|---|
| `.content` | używana w `ustawienia/page.js:389`, **nieobecna** w `ustawienia.module.css` | `className="undefined"` w HTML; działa tylko dlatego, że `.layout` to grid i drugie dziecko trafia w drugą kolumnę bez własnych stylów |
| `.chatArea` | MasterDetailCreator.module.css:339-342 | zdefiniowana, **nieużywana** w żadnym JS |
| `.previewBanner` | sections.module.css:341-353 | zdefiniowana, nieużywana |
| `.previewDisabled` | sections.module.css:355-359 | zdefiniowana, nieużywana |
| `.previewTag` | MasterDetailCreator.module.css:223-233 | używana warunkowo, ale warunek nigdy nie zachodzi — wszystkie parametry mają `status: "ready"` |
| `.saveBar`, `.saveInfo`, `.editingLabel`, `.statusLine`, `.statusClean`, `.saveButton`, `.errorTitle` | page.module.css:41-114, :136-139 | pozostałość po starym pasku zapisu; obecny `page.js` ich nie renderuje (pasek jest w nagłówku kreatora) |

### 9.7 Duplikaty wartości między arkuszami

Świadome (z komentarzem w kodzie):
- `.ghostButton` — trzy identyczne kopie (workspace, FormModal, BackButton jako `.backButton`); komentarze BackButton:2 i FormModal:93 potwierdzają zamiar.
- `.primaryButton` — dwie identyczne kopie (workspace, FormModal).

Niekomentowane:
- Focus pola (`outline: 2px solid #c4b5fd; outline-offset: -1px; border-color: #a78bfa`) — **6 kopii**.
- Blok błędu `#fef2f2`/`#fca5a5`/`#991b1b` — **8 kopii** o różnych paddingach i promieniach (§6.8).
- Animacja `blink` + `.dots` — **3 kopie** (§6.9).
- Ciemna karta `#131318` + `#27272a` — 7 arkuszy.
- Ciemny błąd `#2a1212` + `#5a2a2a` + `#ff8f8f` — 11 arkuszy.

### 9.8 Fonty niespójne

Trzy różne rodziny w jednej aplikacji (§1.3):
- **Geist Sans** — ekrany z sidebarem i kreator,
- **Arial** — logowanie i rejestracja (dziedziczone z `body`),
- **system-ui / Segoe UI** — Kreator RAG.

Do tego dwa stosy monospace: `var(--font-geist-mono), ui-monospace, monospace`
(podgląd promptu) i `ui-monospace, "Cascadia Code", Consolas, monospace`
(Kreator RAG, 10 wystąpień).

### 9.9 Dwa fiolety marki

`#7c3aed` (47 wystąpień, cała aplikacja) kontra `#4b0fb4` (Czaty, `--purple`).
Różnica jest wyraźnie widoczna: `#4b0fb4` jest ciemniejszy i bardziej nasycony.
Awatary czytają `--purple` z fallbackiem `#4b0fb4` (Avatar.module.css:21), więc
poza Czatami też pokazują ten drugi fiolet.

### 9.10 Promienie — gdzie się rozjeżdżają

Reguła „8px dla kontrolek" jest łamana w pięciu miejscach:
- `.saveButton` kreatora — `9px` (MasterDetailCreator:98),
- `.newButton`, `.input`, `.sendButton` Czatów — `9px` (chats:79, 703, 722),
- `.navItem` ustawień — `9px` (ustawienia:70),
- `.errorBox` kreatora — `9px` (sections:592),
- `.removeButton` — `6px` (sections:325).

Jeśli makieta ma być spójna: `8px` dla wszystkich kontrolek, `10px` dla wierszy,
`12px` dla kart list, `14px` dla kart-kontenerów, `999px` dla plakietek.

### 9.11 Podsumowanie — co ujednolicić najpierw

Kolejność wg wpływu na wygląd:

1. **Fiolet** — jeden `#7c3aed` zamiast dwóch (§9.9).
2. **Czaty** — trzy komponenty do jednego wzorca (§9.3).
3. **Kolory statusu** — jedna trójka zamiast czterech (§9.2).
4. **Szarości** — ~38 wartości z rodzin B i C zmapować na rampę Zinc (§2.2).
5. **Segmented i przełącznik** — jedna definicja zamiast dwóch (§9.4).
6. **Fonty** — Geist wszędzie, w tym na `body` (§9.8).
7. **Promienie** — pięć wyjątków do wyrównania (§9.10).
8. **Martwe klasy** — usunąć albo doprowadzić do użycia (§9.6).

Punkty 1-3 zmieniają wygląd widocznie. Punkty 4-7 to porządek, którego użytkownik
raczej nie zauważy, ale który skraca arkusze o kilkaset linii.
