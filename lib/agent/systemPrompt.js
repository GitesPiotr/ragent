// Budowanie system promptu agenta z jego konfiguracji.
// Wyodrebnione z app/api/chat/route.js, zeby kolejne parametry kreatora
// (Q&A, format wyjscia) mialy jedno, czytelne miejsce wpiecia.
//
// Kolejnosc sekcji jest celowa — od najogolniejszej do najbardziej szczegolowej:
//   persona -> zasady -> przyklady (Q&A) -> format odpowiedzi

const OUTPUT_FORMAT_INSTRUCTIONS = {
  text: null, // domyslne zachowanie — nie dokladamy nic do promptu
  markdown:
    "FORMAT ODPOWIEDZI: Odpowiadaj w formacie Markdown. Korzystaj z nagłówków, list i pogrubień tam, gdzie poprawiają czytelność.",
  json:
    'FORMAT ODPOWIEDZI: Odpowiadaj WYŁĄCZNIE poprawnym obiektem JSON. Bez komentarzy, bez tekstu przed ani po, bez bloków kodu (nie używaj ```). Wszystkie klucze i wartości tekstowe w podwójnych cudzysłowach. Jeśli nie umiesz odpowiedzieć, zwróć {"error": "krótki opis problemu"}.',
};

// Limit znakow doklejanej wiedzy. Chroni przed wysadzeniem kontekstu, gdy
// ktos wgra kilka dlugich dokumentow. Bez RAG bierzemy tyle, ile sie miesci.
export const KNOWLEDGE_CHAR_LIMIT = 24000;

// Skleja teksty plikow w jeden blok z etykietami [Plik: nazwa].
// Zwraca { text, usedFiles, skippedFiles, truncated }.
export function buildKnowledgeBlock(files, limit = KNOWLEDGE_CHAR_LIMIT) {
  const usable = (Array.isArray(files) ? files : []).filter(
    (f) => f && typeof f.extracted_text === "string" && f.extracted_text.trim(),
  );

  const chunks = [];
  const usedFiles = [];
  let skippedFiles = 0;
  let truncated = false;
  let budget = limit;

  for (const file of usable) {
    if (budget <= 0) {
      skippedFiles += 1;
      continue;
    }

    const header = `[Plik: ${file.file_name}]\n`;
    const body = file.extracted_text.trim();
    const room = budget - header.length;

    if (room <= 0) {
      skippedFiles += 1;
      continue;
    }

    if (body.length <= room) {
      chunks.push(header + body);
      budget -= header.length + body.length;
    } else {
      // Plik wchodzi tylko czesciowo — mowimy o tym wprost w promptcie,
      // zeby model nie twierdzil, ze zna caly dokument.
      chunks.push(
        `${header}${body.slice(0, room)}\n[…fragment pliku „${file.file_name}” został ucięty z powodu limitu długości]`,
      );
      budget = 0;
      truncated = true;
    }

    usedFiles.push(file.file_name);
  }

  return {
    text: chunks.join("\n\n"),
    usedFiles,
    skippedFiles,
    truncated: truncated || skippedFiles > 0,
  };
}

// Buduje prompt W CZESCIACH — po jednej na sekcje kreatora.
// Dzieki temu podglad w "Teście agenta" pokazuje DOKLADNIE to, co idzie
// do modelu, i nie moze sie z nim rozjechac (jedno zrodlo prawdy).
//
// Zwraca [{ id, label, source, text, meta? }]:
//   id/label — do wyswietlenia w podgladzie
//   source   — ktora sekcja kreatora to wygenerowala
//   meta     — dodatki dla podgladu (np. lista plikow wiedzy)
//
// `options.knowledgeFiles` to wiersze knowledge_files (z extracted_text),
// juz przefiltrowane wg knowledge_mode agenta. Pobiera je warstwa serwerowa
// (lib/agent/knowledgeForAgent.js) — prompt tylko je sklada.
export function buildPromptParts(agent, options = {}) {
  const a = agent || {};
  const persona = (a.persona || "").trim();

  const parts = [
    {
      id: "persona",
      label: "Osobowość",
      source: "Sekcja „Osobowość”",
      text: persona || "Jesteś pomocnym asystentem AI. Odpowiadasz po polsku.",
      isFallback: !persona,
    },
  ];

  // --- ZASADY ---
  const rules = Array.isArray(a.rules)
    ? a.rules.map((r) => String(r).trim()).filter(Boolean)
    : [];

  if (rules.length > 0) {
    parts.push({
      id: "rules",
      label: "Zasady",
      source: "Sekcja „Zasady”",
      text:
        "Zasady, których zawsze przestrzegasz:\n" +
        rules.map((r) => `- ${r}`).join("\n"),
    });
  }

  // --- PRZYKLADY (Q&A) ---
  // Wlaczone pary trafiaja do promptu jako few-shot: pokazuja wzorzec
  // odpowiedzi, zamiast opisywac go slowami.
  const qas = Array.isArray(a.qas)
    ? a.qas.filter(
        (qa) =>
          qa &&
          qa.enabled !== false &&
          String(qa.question || "").trim() &&
          String(qa.answer || "").trim(),
      )
    : [];

  if (qas.length > 0) {
    const examples = qas
      .map(
        (qa) =>
          `Q: ${String(qa.question).trim()}\nA: ${String(qa.answer).trim()}`,
      )
      .join("\n\n");

    parts.push({
      id: "qa",
      label: "Przykłady (Q&A)",
      source: "Sekcja „Pytania i odpowiedzi”",
      text:
        "PRZYKŁADY — tak odpowiadasz na te pytania (wzorzec tonu, formy i treści):\n\n" +
        examples +
        "\n\nGdy użytkownik zada pytanie takie samo lub bardzo podobne do powyższych, trzymaj się tych odpowiedzi. Przy innych pytaniach naśladuj ich styl.",
      meta: { pairs: qas.length },
    });
  }

  // --- KONTEKST WIEDZY (pliki wskazane przez agenta w magazynie konta) ---
  // Doklejamy tresc plikow jako zwykly tekst (bez RAG/embeddingow).
  // Limit znakow moze przyjsc z ustawien (walidowany serwerowo); brak => stala.
  const knowledgeLimit =
    typeof options.knowledgeCharLimit === "number"
      ? options.knowledgeCharLimit
      : KNOWLEDGE_CHAR_LIMIT;
  const knowledge = buildKnowledgeBlock(options.knowledgeFiles, knowledgeLimit);
  if (knowledge.text) {
    let intro =
      "KONTEKST WIEDZY — poniżej treść dokumentów udostępnionych Ci przez użytkownika. Gdy pytanie dotyczy tych materiałów, opieraj odpowiedź NA NICH, a nie na ogólnej wiedzy. Jeśli odpowiedzi nie ma w dokumentach, powiedz to wprost.";

    if (knowledge.truncated) {
      intro +=
        " Uwaga: dokumenty mogły zostać skrócone z powodu limitu długości — jeśli czegoś w nich nie ma, może to wynikać z ucięcia.";
    }

    parts.push({
      id: "knowledge",
      label: "Kontekst wiedzy",
      source: "Sekcja „Baza wiedzy”",
      text: `${intro}\n\n${knowledge.text}`,
      // Podglad pokazuje SKROT (nazwy + liczba znakow), nie cala tresc —
      // inaczej zalalby ekran.
      meta: {
        files: (options.knowledgeFiles || [])
          .filter((f) => f?.extracted_text?.trim())
          .map((f) => ({
            name: f.file_name,
            chars: f.extracted_text.trim().length,
          })),
        truncated: knowledge.truncated,
        skippedFiles: knowledge.skippedFiles,
      },
    });
  }

  // --- WYSZUKIWANIE W INTERNECIE (wymuszenie zrodel) ---
  // Web search bywa zrodlem nieprawdziwych informacji, dlatego gdy jest
  // wlaczony, agent MUSI podawac zrodla i odrozniac to, co znalazl w sieci,
  // od tego, co wie z wlasnej wiedzy.
  const tools = Array.isArray(a.tools) ? a.tools : [];
  if (tools.includes("web_search")) {
    parts.push({
      id: "web_search",
      label: "Wyszukiwanie w internecie",
      source: "Sekcja „Narzędzia”",
      text:
        "WYSZUKIWANIE W INTERNECIE: Masz narzędzie wyszukiwania w sieci. " +
        "Używaj go, gdy pytanie dotyczy bieżących lub zmiennych informacji " +
        "(aktualne wydarzenia, ceny, daty, dane, których nie możesz znać z pamięci). " +
        "Formułuj zwięzłe, konkretne zapytania. " +
        "ZASADA ŹRÓDEŁ (obowiązkowa): każdą informację pochodzącą z wyszukiwania " +
        "MUSISZ opatrzyć źródłem — podaj tytuł strony ORAZ pełny link (URL) " +
        "dokładnie taki, jaki zwróciło narzędzie (nie wymyślaj adresów). " +
        "WYRAŹNIE odróżniaj to, co znalazłeś w internecie (z podaniem źródła), od " +
        "tego, co wiesz z własnej wiedzy. Jeśli narzędzie nie zwróci wyników albo " +
        "zwróci komunikat o błędzie, powiedz o tym wprost — nie zmyślaj. " +
        "Jeśli źródła są sprzeczne lub niepewne, zaznacz to — wyniki wyszukiwania " +
        "bywają nieprawdziwe.",
    });
  }

  // --- FORMAT ODPOWIEDZI ---
  const formatInstruction = OUTPUT_FORMAT_INSTRUCTIONS[a.output_format];
  if (formatInstruction) {
    parts.push({
      id: "format",
      label: "Format odpowiedzi",
      source: "Sekcja „Wejście / Wyjście”",
      text: formatInstruction,
    });
  }

  return parts;
}

// Finalny system prompt — sklejone czesci. Uzywane przez /api/chat.
export function buildSystemPrompt(agent, options = {}) {
  return buildPromptParts(agent, options)
    .map((p) => p.text)
    .join("\n\n");
}
