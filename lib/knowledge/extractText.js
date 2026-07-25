// Wyciaganie tekstu z wgranych plikow. WYLACZNIE po stronie serwera
// (uzywane przez /api/knowledge/upload).
//
// Zakres tej sesji: pliki tekstowe (.txt/.md) i PDF z warstwa tekstowa.
// PDF ze skanu (sam obraz, bez tekstu) NIE jest bledem — zwracamy status
// "no_text" z czytelnym komunikatem, zamiast wywracac upload. OCR jest poza zakresem.

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv"];
const PDF_EXTENSIONS = [".pdf"];

export const ACCEPTED_EXTENSIONS = [...TEXT_EXTENSIONS, ...PDF_EXTENSIONS];

function extensionOf(fileName) {
  const idx = String(fileName || "").lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx).toLowerCase();
}

export function isAcceptedFile(fileName) {
  return ACCEPTED_EXTENSIONS.includes(extensionOf(fileName));
}

// Normalizuje bialе znaki — pliki potrafia miec ogromne bloki pustych linii,
// ktore niepotrzebnie zjadaja kontekst modelu.
function tidy(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Zwraca { text, status, message }:
//   status "ready"   -> tekst wyciagniety
//   status "no_text" -> plik poprawny, ale nie ma z czego wyciagnac tekstu
//   status "error"   -> ekstrakcja sie nie powiodla
export async function extractTextFromFile(buffer, fileName) {
  const ext = extensionOf(fileName);

  // --- Pliki tekstowe ---
  if (TEXT_EXTENSIONS.includes(ext)) {
    try {
      const text = tidy(Buffer.from(buffer).toString("utf8"));
      if (!text) {
        return {
          text: "",
          status: "no_text",
          message: "Plik jest pusty — nie ma czego dołączyć do agenta.",
        };
      }
      return { text, status: "ready", message: null };
    } catch {
      return {
        text: "",
        status: "error",
        message: "Nie udało się odczytać pliku jako tekstu (sprawdź kodowanie).",
      };
    }
  }

  // --- PDF ---
  if (PDF_EXTENSIONS.includes(ext)) {
    try {
      // unpdf: PDF.js skompilowany pod srodowiska serwerowe, bez zaleznosci natywnych.
      const { extractText } = await import("unpdf");
      const { text, totalPages } = await extractText(
        new Uint8Array(buffer),
        { mergePages: true },
      );

      const clean = tidy(text);
      if (!clean) {
        return {
          text: "",
          status: "no_text",
          message: `PDF nie zawiera warstwy tekstowej (${totalPages} str.) — to prawdopodobnie skan lub zdjęcie. Rozpoznawanie tekstu z obrazu (OCR) nie jest jeszcze obsługiwane.`,
        };
      }
      return { text: clean, status: "ready", message: null };
    } catch (e) {
      return {
        text: "",
        status: "error",
        message: `Nie udało się odczytać pliku PDF: ${e?.message || "nieznany błąd"}. Plik może być uszkodzony lub zabezpieczony hasłem.`,
      };
    }
  }

  return {
    text: "",
    status: "error",
    message: `Nieobsługiwany typ pliku (${ext || "brak rozszerzenia"}). Obsługujemy: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
  };
}
