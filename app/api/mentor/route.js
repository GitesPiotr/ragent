import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sendChat } from "@/lib/providers";
import { fetchOllamaModels } from "@/lib/providers/ollama";
import { modelSupportsTemperature, KLUCZ_DOSTAWCY } from "@/lib/config/models";
import { loadKnowledge } from "@/lib/mentor/knowledge";
import { MENTOR_PROVIDER, MENTOR_MODEL } from "@/lib/config/mentor";
import { wczytajModeleKonta } from "@/lib/settings/dopuszczoneServer";
import {
  listaModeli,
  modeleOllamy,
  tekstDostepnychModeli,
  czyModelMentoraDozwolony,
  dopasujModel,
  DOSTAWCA_MENTORA,
} from "@/lib/settings/dopuszczoneModele";
import { rozstrzygnij, zPrzypisania, ZRODLO } from "@/lib/settings/przypisaniaModeli";
import {
  resolveMentorModel,
  resolveOllamaUrl,
} from "@/lib/settings/serverSettings";
import {
  buildMentorSystem,
  buildGuidedProseSystem,
  buildGuidedProposalSystem,
  buildPersonaFeedbackSystem,
  GUIDED_PROPOSAL_SCHEMA,
} from "@/lib/mentor/prompt";

// MENTOR_PROVIDER / MENTOR_MODEL pochodza z lib/config/mentor.js — to JEDYNE
// miejsce, w ktorym ustawia sie model mentora (z nadpisaniem przez .env.local).
// Uzywane w obu trybach: reaktywnym i prowadzenia (proza + ekstrakcja).

// Czytelne, polskie komunikaty bledow (bez surowego stack trace).
function mapError(error) {
  if (error?.code === "no_api_key") {
    return { status: 500, message: error.message };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      status: 401,
      message:
        "Nieprawidłowy klucz API (ANTHROPIC_API_KEY). Sprawdź wartość w .env.local.",
    };
  }
  if (error instanceof Anthropic.BadRequestError) {
    const msg = String(error.message || "");
    if (/credit balance is too low|insufficient|billing/i.test(msg)) {
      return {
        status: 402,
        message: "Brak środków na koncie API Anthropic. Doładuj konto.",
      };
    }
    return { status: 400, message: `Nieprawidłowe zapytanie do API: ${msg}` };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      message: "Przekroczono limit zapytań. Spróbuj ponownie za chwilę.",
    };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      status: error.status || 500,
      message: `Błąd API: ${error.message || "nieznany błąd"}`,
    };
  }
  return {
    status: 500,
    message: error?.message || "Wystąpił nieoczekiwany błąd serwera.",
  };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Nieprawidłowy format zapytania (oczekiwano JSON)." },
      { status: 400 },
    );
  }

  const { agent, messages, mode, personaDraft } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Brak wiadomości do mentora." },
      { status: 400 },
    );
  }

  // Ustawienia z przegladarki — walidowane serwerowo (nie ufamy klientowi).
  //
  // Lista dopuszczonych czytana RAZ, z bazy, i sluzy dwom rzeczom naraz:
  // walidacji modelu mentora (nizej) i budowie listy modeli w promptcie
  // (buildAvailableModelsText). Drugie zapytanie po te same dane byloby
  // drugim miejscem, w ktorym te dwie odpowiedzi moglyby sie rozjechac.
  //
  // `null` przy braku sesji/tabel — wtedy resolveMentorModel wraca do
  // sprawdzenia wzgledem statycznej listy Anthropic, czyli do zachowania
  // sprzed rundy 6.
  const { dopuszczone, przypisania } = await wczytajModeleKonta();

  // =========================================================================
  //  MODEL MENTORA — KOLEJNOSC Z RUNDY 8
  //
  //    1. przypisanie `mentor` z bazy
  //    2. settings.mentorModel z localStorage (w ciele zadania)
  //    3. MENTOR_MODEL ze zmiennej srodowiskowej / stala w kodzie
  //
  //  KAZDY SZCZEBEL PRZECHODZI TE SAMA WALIDACJE, nie tylko pierwszy. Dzieki
  //  temu przypisanie do modelu, ktory wypadl z listy dopuszczonych, schodzi
  //  o JEDEN szczebel — na ustawienie, ktore uzytkownik ma zapisane — zamiast
  //  przeskakiwac od razu na stala.
  //
  //  DOSTAWCA MENTORA ZOSTAJE STALA "anthropic" (decyzja z rundy 6, nie
  //  podwazana). Przypisanie wskazujace innego dostawce jest wiec ODRZUCANE
  //  jako kandydat, a nie uzywane z podmieniona nazwa dostawcy — cicha
  //  podmiana dawalaby model Anthropic o identyfikatorze z OpenRoutera.
  //
  //  Stala z MENTOR_MODEL wchodzi TU jako trzeci kandydat, a nie przez
  //  fallback wewnatrz resolveMentorModel — inaczej nie dalo by sie
  //  powiedziec, KTORY szczebel wygral.
  const wyborMentora = rozstrzygnij(
    [
      zPrzypisania(przypisania, "mentor"),
      { zrodlo: ZRODLO.USTAWIENIA, provider: DOSTAWCA_MENTORA, model: body?.mentorModel },
      { zrodlo: ZRODLO.STALA, provider: DOSTAWCA_MENTORA, model: MENTOR_MODEL },
    ],
    (provider, model) =>
      provider === DOSTAWCA_MENTORA && czyModelMentoraDozwolony(model, dopuszczone),
  );

  // resolveMentorModel zostaje OSTATNIM STRAZNIKIEM i nie zmienia zachowania:
  // przepuszcza to, co juz przeszlo walidacje wyzej, a przy `zrodlo: brak`
  // (zaden kandydat nie przeszedl) wraca do MENTOR_MODEL. Jego odwrotna regula
  // przy `dopuszczone === null` — cofniecie do statycznej listy Anthropic —
  // dziala dalej, bo ta sama lista idzie do obu miejsc.
  const mentorModel = resolveMentorModel(wyborMentora.model, dopuszczone);
  const ollamaUrl = resolveOllamaUrl(body?.ollamaUrl);

  if (mode === "persona-feedback") {
    const draft = typeof personaDraft === "string" ? personaDraft.trim() : "";
    if (!draft) {
      return NextResponse.json(
        { error: "Brak opisu osobowości do oceny." },
        { status: 400 },
      );
    }
    return handlePersonaFeedback(agent || {}, messages, draft, mentorModel);
  }
  if (mode === "guided") {
    return handleGuided(agent || {}, messages, mentorModel, ollamaUrl, dopuszczone);
  }
  return handleReactive(agent || {}, messages, mentorModel);
}

// --- KROK PERSONA, ŚCIEŻKA A ("Opisz sam") — tryb OCENIAJĄCY.
// JEDEN etap: czysta proza z feedbackiem. Propozycja do kreatora nie jest
// wyciagana modelem — to wprost tekst uzytkownika, wiec trafia do kreatora
// slowo w slowo (i oszczedzamy drugie wywolanie).
async function handlePersonaFeedback(agent, messages, draft, model) {
  try {
    const knowledge = await loadKnowledge();
    const system = buildPersonaFeedbackSystem(knowledge, agent, draft);

    const { text } = await sendChat({
      provider: MENTOR_PROVIDER,
      model,
      system,
      messages,
    });

    return NextResponse.json({
      message: text,
      step: "persona",
      // `wlasny` MOWI PANELOWI, CZYJ JEST TEN TEKST. Propozycja persony
      // z prowadzenia i ta maja ten sam `field` i ten sam `step` — a to dwie
      // zupelnie rozne rzeczy na ekranie: tam mentor cos napisal, tu oddajemy
      // uzytkownikowi jego wlasne zdania do wpisania. Bez tego znacznika karta
      // podpisuje jego tekst jako „Propozycja do pola", czyli jako prace mentora.
      proposal: { field: "persona", value: draft, wlasny: true },
    });
  } catch (error) {
    const { status, message } = mapError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// --- Tryb reaktywny ("Zapytaj mentora") — BEZ ZMIAN wzgledem poprzedniej sesji.
async function handleReactive(agent, messages, model) {
  try {
    const knowledge = await loadKnowledge();
    const system = buildMentorSystem(knowledge, agent);

    const { text } = await sendChat({
      provider: MENTOR_PROVIDER,
      model,
      system,
      messages,
    });

    return NextResponse.json({ reply: text });
  } catch (error) {
    const { status, message } = mapError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

// =============================================================================
//  LISTA MODELI DO PROMPTU MENTORA — NAJDELIKATNIEJSZE MIEJSCE RUNDY 6.
//
//  Wynik NIE trafia do interfejsu, tylko do TRESCI promptu: mentor czyta te
//  linie i na ich podstawie proponuje uzytkownikowi model. Blad nie objawi sie
//  wyjatkiem ani pusta lista — objawi sie tym, ze mentor zaproponuje model,
//  ktorego konto nie ma wlaczonego, propozycja trafi do kreatora i rozmowa
//  z agentem skonczy sie bledem dopiero u dostawcy.
//
//  DLATEGO ZMIENIA SIE TYLKO ZRODLO POZYCJI, NIE ICH FORMAT. Sam sklad linii
//  siedzi w lib/settings/dopuszczoneModele.js i jest przypiety testem
//  porownujacym wynik ZNAK W ZNAK z tekstem sprzed tej rundy
//  („PRZED/PO: format linii nie zmienil sie co do znaku").
//
//  Co sie zmienilo merytorycznie — i tylko to:
//   • Anthropic: z MODELS_BY_PROVIDER -> z modeli Anthropic wlaczonych przez
//     konto (konto bez wyboru dostaje dalej MODELS_BY_PROVIDER),
//   • doszly grupy OpenAI i OpenRouter, ktorych ten tekst nie znal — mentor
//     nie mial jak zaproponowac modelu przez OpenRoutera, mimo ze agent
//     potrafil na nim dzialac od rundy 2,
//   • Ollama: lista z demona PRZECIETA z lista konta — bez tego mentor
//     proponowalby modele wylaczone w Ustawieniach.
//
//  ZWRACA TAKZE `katalog` — TE SAME POZYCJE, TYLKO BEZ FORMATOWANIA.
//  Propozycja modelu wraca z ekstraktora jako goly tekst, a zeby ustawic przy
//  niej dostawce, trzeba wiedziec, z ktorej grupy ten model pochodzi. Katalog
//  powstaje TU, z tych samych `grupy`, z ktorych powstaje tekst — bo tekst
//  i odpowiedz „czyj to model" musza pochodzic z jednego odczytu. Drugie
//  pytanie o modele (choćby o te same dane) byloby drugim miejscem, w ktorym
//  te dwie odpowiedzi moglyby sie rozjechac — dokladnie ta pulapka, przed
//  ktora ostrzega naglowek powyzej.
// =============================================================================
//
//  KLUCZ DOSTAWCY CZYTAMY TUTAJ, Z `process.env` — I TO JEST CALY ODCZYT.
//  Trasa jest kodem serwerowym w tym samym procesie, w ktorym siedza zmienne
//  srodowiskowe, wiec to siegniecie do pamieci, a nie zapytanie. Trasa
//  /api/providers/status robi doslownie to samo `Boolean(process.env...)`,
//  tylko dla przegladarki — wolanie jej stad byloby tym samym odczytem
//  przepuszczonym przez HTTP.
function brakKluczaDostawcy(provider) {
  const nazwa = KLUCZ_DOSTAWCY[provider];
  // Ollama (nazwa === null) klucza nie potrzebuje — nigdy nie oznaczamy.
  if (!nazwa) return null;
  return process.env[nazwa] ? null : nazwa;
}

async function buildAvailableModelsText(ollamaUrl, dopuszczone) {
  const { models: ollamaModels, error } = await fetchOllamaModels(ollamaUrl);

  const grupy = [
    { provider: "anthropic", modele: listaModeli(dopuszczone, "anthropic").modele },
    { provider: "openai", modele: listaModeli(dopuszczone, "openai").modele },
    { provider: "openrouter", modele: listaModeli(dopuszczone, "openrouter").modele },
    { provider: "ollama", modele: modeleOllamy(dopuszczone, ollamaModels).modele },
  ].map((g) => ({ ...g, brakKlucza: brakKluczaDostawcy(g.provider) }));

  // Powod „niedostepnosci" lokalnych rozroznia dwie sytuacje, bo mentor
  // dostaje to zdanie jako uzasadnienie: demon nie odpowiedzial (error)
  // wobec „odpowiedzial, ale nic nie jest wlaczone na koncie".
  const powodBrakuLokalnych =
    error ||
    (ollamaModels.length > 0
      ? "żaden model lokalny nie jest włączony na koncie"
      : null);

  // Katalog niesie `brakKlucza` dalej, bo propozycje odsiewa normalizeProposal,
  // a zdanie w prompcie jest tylko prosba — model potrafi ja zignorowac.
  const katalog = grupy.flatMap(({ provider, modele, brakKlucza }) =>
    modele.map((m) => ({ provider, id: m.id, brakKlucza })),
  );

  return {
    text: tekstDostepnychModeli(
      grupy,
      modelSupportsTemperature,
      powodBrakuLokalnych,
    ),
    katalog,
  };
}

// Zamienia surowa odpowiedz JSON mentora na znormalizowana propozycje pola.
//
// KAZDY BEZPIECZNIK TUTAJ ODPOWIADA NA TO SAMO PYTANIE: czy z tej propozycji
// da sie COKOLWIEK WPISAC. Karta propozycji ma jeden przycisk i on NADPISUJE
// pole kreatora — wiec propozycja, ktora niesie pustke, nie jest propozycja,
// tylko kasowaniem cudzych ustawien pod przyciskiem „Zaakceptuj".
function normalizeProposal(parsed, katalog) {
  const field = parsed.proposalField;
  if (!field || field === "none") return null;

  if (field === "temperature") {
    const value = parsed.proposalNumber;
    // Bezpiecznik: temperatura musi byc liczba w zakresie 0–1.
    if (typeof value !== "number" || value < 0 || value > 1) return null;
    return { field: "temperature", value };
  }
  if (field === "rules" || field === "tools") {
    const value = Array.isArray(parsed.proposalList)
      ? parsed.proposalList.filter((v) => typeof v === "string" && v.trim())
      : [];
    // Bezpiecznik jak przy pustym tekscie nizej — i z tego samego powodu.
    // „Ten agent nie potrzebuje narzedzi" to zdanie mentora, nie wartosc do
    // wpisania: akceptacja pustej listy WYCZYSCILABY narzedzia albo zasady,
    // ktore uzytkownik ustawil wczesniej. Zdejmowanie ich zostaje w kreatorze.
    if (value.length === 0) return null;
    return { field, value };
  }
  if (field === "model") {
    // DOSTAWCA IDZIE RAZEM Z MODELEM albo nie ma propozycji.
    // Lista w prompcie zawiera modele czterech dostawcow, a panel do tej rundy
    // ustawial sam `model`, zostawiajac `provider` bez zmian — agent dostawal
    // model jednego dostawcy wyslany do drugiego. `dopasujModel` oddaje takze
    // KANONICZNE id, wiec „claude-haiku-4.5" z wypowiedzi mentora wchodzi do
    // kreatora jako „claude-haiku-4-5".
    const trafienie = dopasujModel(katalog, parsed.proposalText);
    if (!trafienie) return null;
    // MODEL BEZ KLUCZA NIE JEST PROPOZYCJA. Instrukcja w prompcie mowi
    // mentorowi, zeby go nie proponowal, ale instrukcja jest prosba — karta
    // z przyciskiem „Zaakceptuj" byla by obietnica agenta, ktory nie ruszy.
    // Mentor moze taki model wymienic w prozie i powiedziec, czego brakuje.
    if (trafienie.brakKlucza) return null;
    return { field: "model", value: trafienie.id, provider: trafienie.provider };
  }
  // persona — wartosc tekstowa.
  // Bezpiecznik: NIE stosujemy pustej propozycji (model bywa myli sie na
  // krokach pomijanych i podaje puste pole - to wyzerowaloby dane usera).
  const value = (parsed.proposalText || "").trim();
  if (!value) return null;
  return { field, value };
}

// --- Tryb prowadzenia ("Przeprowadź mnie krok po kroku") — DWA ETAPY.
// Etap 1: proza mentora BEZ structured output (nie psuje długiej prozy).
// Etap 2: sama propozycja pola ZE structured output (krótkie, czyste dane).
async function handleGuided(agent, messages, model, ollamaUrl, dopuszczone) {
  try {
    const knowledge = await loadKnowledge();
    const { text: availableModelsText, katalog } =
      await buildAvailableModelsText(ollamaUrl, dopuszczone);

    // --- Etap 1: czysta proza (zwykły tekst, jak tryb reaktywny) ---
    const proseSystem = buildGuidedProseSystem(
      knowledge,
      agent,
      availableModelsText,
    );
    const { text: prose } = await sendChat({
      provider: MENTOR_PROVIDER,
      model,
      system: proseSystem,
      messages,
    });

    // --- Etap 2: propozycja pola na podstawie prozy z etapu 1 ---
    // Dokładamy wypowiedź mentora jako turę assistant, a potem prosbę o ekstrakcję.
    const proposalSystem = buildGuidedProposalSystem(agent, availableModelsText);
    const proposalMessages = [
      ...messages,
      { role: "assistant", content: prose },
      {
        role: "user",
        content:
          "Na podstawie Twojej powyższej wypowiedzi zwróć strukturalną propozycję pola zgodnie ze schematem.",
      },
    ];

    const { text: proposalText } = await sendChat({
      provider: MENTOR_PROVIDER,
      model,
      system: proposalSystem,
      messages: proposalMessages,
      responseFormat: GUIDED_PROPOSAL_SCHEMA,
    });

    let parsed;
    try {
      parsed = JSON.parse(proposalText);
    } catch {
      // Nawet jesli ekstrakcja propozycji zawiedzie, oddajemy czysta proze.
      return NextResponse.json({ message: prose, step: null, proposal: null });
    }

    return NextResponse.json({
      message: prose,
      step: parsed.step || null,
      proposal: normalizeProposal(parsed, katalog),
    });
  } catch (error) {
    const { status, message } = mapError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
