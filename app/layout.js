import {
  Geist,
  Geist_Mono,
  Instrument_Sans,
  IBM_Plex_Mono,
} from "next/font/google";
import { StateProvider } from "@/lib/state/StateContext";
import { SettingsProvider } from "@/lib/settings/SettingsContext";
import { DopuszczoneProvider } from "@/lib/settings/DopuszczoneContext";
import { KnowledgeProvider } from "@/lib/knowledge/KnowledgeContext";
import { loadKnowledgeConcepts } from "@/lib/knowledge/concepts";
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  THEMES,
} from "@/lib/settings/defaults";
import "./globals.css";

// =============================================================================
//  MOTYW USTAWIONY PRZED PIERWSZYM MALOWANIEM
//
//  PO CO: applyTheme (SettingsContext) chodzi w efekcie, czyli PO hydratacji.
//  Do tego czasu <html> nie miał `data-theme` i obowiązywało
//  `@media (prefers-color-scheme: dark)`. Dopóki domyślką było „auto", stan
//  przed hydratacją i po niej mówiły to samo, więc nie było czego zauważyć.
//  Odkąd domyślny jest ciemny, na systemie ustawionym na jasny widać białe
//  mignięcie przy każdym wejściu.
//
//  Wzorzec z dokumentacji tej wersji Next: node_modules/next/dist/docs/01-app/
//  02-guides/preventing-flash-before-hydration.md, sekcja „Themes". Skrypt
//  w <head> wykonuje się SYNCHRONICZNIE przy parsowaniu HTML, czyli zanim
//  cokolwiek zostanie namalowane — w odróżnieniu od useEffect (po malowaniu)
//  i useLayoutEffect (przed malowaniem, ale po hydratacji, więc za późno przy
//  wolnym łączu, gdy przeglądarka maluje HTML zanim React w ogóle dojedzie).
//
//  ATRYBUT JEST TEŻ WYPISYWANY PRZEZ SERWER, nie tylko przez skrypt. Dzięki
//  temu HTML jest ciemny już w chwili przyjścia, a skrypt ma tylko poprawić
//  ten jeden przypadek, w którym użytkownik ma zapisany inny wybór.
//
//  STAŁE IDĄ Z lib/settings/defaults.js, nie są tu przepisane. Klucz
//  w localStorage i lista dopuszczalnych wartości muszą się zgadzać ze
//  store.js co do znaku — drugi egzemplarz rozjechałby się po cichu i objawił
//  dopiero mignięciem u kogoś, kto ma zapisany wybór.
// =============================================================================

// Serwer wypisuje atrybut TYLKO dla wymuszonych wariantów. Gdyby domyślką
// znów zostało „auto", atrybut ma nie powstać wcale — `data-theme="auto"`
// nie znaczy nic ani dla CSS, ani dla useMotyw.
const MOTYW_SERWEROWY =
  DEFAULT_SETTINGS.theme === "light" || DEFAULT_SETTINGS.theme === "dark"
    ? DEFAULT_SETTINGS.theme
    : undefined;

// `catch` CELOWO NIC NIE ROBI. Gdy localStorage jest niedostępny (tryb
// prywatny, zablokowane ciasteczka), zostaje atrybut wypisany przez serwer,
// czyli domyślka — a to jest dokładnie właściwe zachowanie.
const SKRYPT_MOTYWU = `(function(){try{
var raw=window.localStorage.getItem(${JSON.stringify(SETTINGS_STORAGE_KEY)});
if(!raw)return;
var t=JSON.parse(raw).theme;
if(${JSON.stringify(THEMES)}.indexOf(t)<0)return;
if(t==="auto")document.documentElement.removeAttribute("data-theme");
else document.documentElement.setAttribute("data-theme",t);
}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// KROJE NOWEGO WYGLADU (docs/prototyp.html).
// Geist ZOSTAJE — obsluguje motyw jasny, dopoki trwa porownanie starego
// i nowego wygladu przelacznikiem w Ustawieniach.
//
// latin-ext jest konieczny, nie kosmetyczny: bez niego polskie znaki
// (l, a, e, s, z, z, c, n) spadaja do kroju zapasowego i tekst rozjezdza sie
// w polowie wyrazu.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin", "latin-ext"],
});

// IBM Plex Mono NIE MA wariantu zmiennego, wiec `weight` jest wymagany.
// 400/500/600 — dokladnie te grubosci, ktore laduje prototyp.
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
});

export const metadata = {
  title: "RAGent",
  description: "Moduł 1: kreator agenta AI z mentorem",
};

export default async function RootLayout({ children }) {
  // Wiedza czytana serwerowo - trafia do UI bez wywolania API po stronie klienta.
  const concepts = await loadKnowledgeConcepts();

  return (
    <html
      lang="pl"
      data-theme={MOTYW_SERWEROWY}
      // Skrypt niżej zmienia `data-theme`, ZANIM React zdąży hydratować. Bez
      // tego React zgłosiłby rozjazd na atrybucie i odbudował drzewo od
      // najbliższej granicy — a przy odbudowie skrypty się NIE wykonują
      // ponownie, więc poprawka by przepadła. Z tym znacznikiem React
      // przyjmuje to, co zastał w DOM.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSans.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SKRYPT_MOTYWU }} />
      </head>
      <body>
        {/* DopuszczoneProvider NAD SettingsProvider, i to jest wymuszone:
            sanitizeSettings potrzebuje listy modeli konta, żeby wiedzieć,
            czy zapisany model wolno zostawić. Odwrotna kolejność byłaby
            cyklem. */}
        <DopuszczoneProvider>
          <SettingsProvider>
            <StateProvider>
              <KnowledgeProvider concepts={concepts}>
                {children}
              </KnowledgeProvider>
            </StateProvider>
          </SettingsProvider>
        </DopuszczoneProvider>
      </body>
    </html>
  );
}
