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
import "./globals.css";

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
  title: "AIdeas — Kreator Agenta AI",
  description: "Moduł 1: kreator agenta AI z mentorem",
};

export default async function RootLayout({ children }) {
  // Wiedza czytana serwerowo - trafia do UI bez wywolania API po stronie klienta.
  const concepts = await loadKnowledgeConcepts();

  return (
    <html
      lang="pl"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSans.variable} ${ibmPlexMono.variable}`}
    >
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
