import { Space_Grotesk } from "next/font/google";

// KROJ TYLKO DLA TEJ TRASY.
//
// Space Grotesk jest potrzebny wylacznie do napisu „RAGent" na ekranie
// logowania. Gdyby stal w layoucie glownym, bylby wstepnie ladowany na KAZDEJ
// trasie aplikacji — dokumentacja mowi o tym wprost (node_modules/next/dist/
// docs/01-app/03-api-reference/02-components/font.md:1042-1050): kroj wywolany
// w layoucie glownym jest preladowany wszedzie, wywolany w layoucie trasy —
// tylko w jej obrebie. Stad ten plik.
//
// POSTAC ZMIENNA, nie trzy grubosci. Prototyp ciagnie z Google Fonts
// wght@400;500;700, ale ten kroj MA os zmienna, wiec jeden plik zastepuje trzy.
// Pominiecie `weight` wlacza wlasnie wariant zmienny.
//
// latin-ext jest konieczny, nie kosmetyczny: bez niego „Hasło" i „Nie pamiętasz
// hasła" spadaja do kroju zapasowego w polowie wyrazu.
//
// Zadnego <link> do fonts.googleapis.com, jak w prototypie — to zadanie
// do obcego serwera na ekranie logowania, a cala reszta aplikacji jest
// hostowana u siebie.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-znak",
  subsets: ["latin", "latin-ext"],
});

// Element opakowujacy niesie WYLACZNIE zmienna z nazwa kroju. Jest bezpieczny
// dla ukladu, bo ekran pod spodem opiera wysokosc na jednostkach widoku
// (min-height: 100vh), a nie na wysokosci rodzica.
export default function LogowanieLayout({ children }) {
  return <div className={spaceGrotesk.variable}>{children}</div>;
}
