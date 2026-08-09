import { getConfig } from "@/lib/rag/config.js";
import { Samouczek } from "./_components/Samouczek.jsx";

// STRONA SERWEROWA, i to jest jedyny powód, dla którego istnieje osobno od
// komponentu.
//
// Samouczek podaje konkretne liczby: rozmiar fragmentu, próg twardego cięcia,
// limit wielkości pliku, listę czytanych formatów. Wszystkie są konfiguracją
// SERWERA. Wpisane w tekst na stałe zaczęłyby kłamać przy pierwszej zmianie
// w .env.local — po cichu, bo nic by tego nie zgłosiło.
//
// lib/rag/config.js zaczyna się od `import 'server-only'`, więc do komponentu
// klienckiego wciągnąć się nie da (i dobrze — czyta process.env z sekretami).
// Stąd podział: tutaj odczyt, tam wyświetlenie.
//
// FORMATY pochodzą z lib/rag/extract.js, czyli z tego samego miejsca, z którego
// bierze je dyspozytor rozpoznający plik. Nie z atrybutu `accept` w formularzu —
// tamta lista jest tylko podpowiedzią dla okna wyboru pliku i bywa węższa.
// Aliasy (.markdown, .text) są przyjmowane przez aplikację, ale świadomie NIE
// są tu wymieniane: nie mnożymy wariantów w głowie czytelnika.

export const metadata = {
  title: "Jak przygotować dokumenty — RAGent",
};

export default function SamouczekPage() {
  const config = getConfig();

  return <Samouczek rozmiarFragmentu={config.chunk.size} />;
}
