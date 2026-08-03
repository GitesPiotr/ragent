import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata = {
  title: "AIdeas — Kreator Agenta AI",
  description: "Moduł 1: kreator agenta AI z mentorem",
};

export default async function RootLayout({ children }) {
  // Wiedza czytana serwerowo - trafia do UI bez wywolania API po stronie klienta.
  const concepts = await loadKnowledgeConcepts();

  return (
    <html lang="pl" className={`${geistSans.variable} ${geistMono.variable}`}>
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
