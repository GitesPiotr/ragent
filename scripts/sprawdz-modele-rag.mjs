// =============================================================================
//  TEST ZDOLNOŚCI MODELI CHMUROWYCH DO WYWOŁANIA rag_search
//
//  PO CO. Najgorszy scenariusz na pokazie: ktoś wybiera model, agent nie sięga
//  do bazy wiedzy i wygląda to, jakby RAG nie działał. Aplikacja tego nie
//  wykryje — dla dostawców chmurowych NIE MA żadnego sprawdzenia, że narzędzie
//  było dostępne, a nie zostało wywołane (jedyne takie sprawdzenie ma Ollama,
//  lib/providers/ollama.js:73-88). Ten skrypt sprawdza to przed pokazem.
//
//  CO MIERZY, A CZEGO NIE. Idzie wprost do sendChatOpenRouter, z pominięciem
//  trasy HTTP /api/chat — bo tamta wymaga sesji użytkownika i rekordu agenta
//  w bazie. Testowana jest więc DECYZJA MODELU (czy wywoła narzędzie i czy użyje
//  wyniku), a nie cała trasa. Zestaw narzędzi i opis rag_search są te same,
//  bo pochodzą z tego samego modułu co produkcja.
//
//  DWA PYTANIA, NIE JEDNO — i to jest sedno pomiaru:
//    • WPROST     „Ile wynosi dodatek za pracę w sobotę…"  — łatwe
//    • POTOCZNE   „gdzie jest apteczka?"                    — trudne
//  Zmierzony w tym projekcie przypadek niewywołania (rag_search.js:60-63)
//  dotyczył DOKŁADNIE pytania potocznego: model uznał z góry, że to „poza
//  zakresem dokumentów", i odpowiedział bez szukania. Wyniki obu pytań są
//  raportowane OSOBNO i nigdy nie uśredniane: model zdający łatwe i oblewający
//  potoczne jest gorszy od takiego, który oblewa oba, bo daje fałszywe
//  poczucie bezpieczeństwa.
//
//  KOLEKCJA JEST ZMYŚLONA I TO JEST WARUNEK SENSU TESTU. „Kolekcja test Agenta"
//  opisuje nieistniejącą firmę Kwadratowa Sp. z o.o. Gdyby pytać o RODO —
//  a takie kolekcje też tu są — każdy z tych modeli odpowiedziałby poprawnie
//  Z PAMIĘCI, bez wywołania narzędzia, i test mierzyłby erudycję zamiast RAG-u.
//
//  KLIENT SERWISOWY ZAMIAST SESJI. rag_search wymaga ctx.user.id i ctx.db
//  i jawnie odmawia bez nich (rag_search.js:141-147). Skrypt z konsoli sesji
//  nie ma, więc podstawia klienta na kluczu service_role i owner_id odczytany
//  z kolekcji. Zapytania idą więc z POMINIĘCIEM RLS — dla pytania „czy model
//  wywołał narzędzie" bez znaczenia, ale to nie jest ta sama ścieżka
//  bazodanowa co na produkcji.
//
//  Uruchomienie:  npm run sprawdz:modele
//  Wyniki:        poza repozytorium, ścieżka wypisana na końcu.
//
//  NAZWA PLIKU NIE ZACZYNA SIĘ OD „test-" I TO NIE JEST DROBIAZG. Wzorce, po
//  których `node --test` sam znajduje pliki, obejmują `test-*.mjs` — dopóki ten
//  skrypt nazywał się `test-modeli-rag.mjs`, KAŻDE `npm test` odpalało 36
//  płatnych rozmów przez OpenRouter: ~5,5 minuty i ~$0,05 za przebieg, przy
//  okazji zużywając limity. Zmierzone, nie przewidziane — złapane przy zwykłym
//  uruchomieniu zestawu testów. Przy zmianie nazwy trzymać się z dala także od
//  `*-test`, `*_test` i `*.test`.
//
//  Zawężenie przebiegu — do sprawdzenia szkieletu przed pełnym przejazdem,
//  żeby nie płacić 36 razy za błąd w konfiguracji kontekstu (podwójny myślnik
//  oddziela argumenty skryptu od argumentów npm):
//    npm run sprawdz:modele -- --model=deepseek/deepseek-v4-flash \
//                              --pytanie=potoczne --przebiegi=1
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { loadEnvLocal } from "./_env.mjs";
// MUSI stać przed importami z lib/ — moduły dostawców i narzędzi używają
// aliasu @/, którego gołe Node nie rozwiązuje. Szczegóły w _alias.mjs.
import "./_alias.mjs";

loadEnvLocal(pathToFileURL("scripts/x.mjs").href);

const { createClient } = await import("@supabase/supabase-js");
const { sendChatOpenRouter } = await import("../lib/providers/openrouter.js");
const { getToolDefsForOpenRouter } = await import("../lib/tools/index.js");

// --- CO TESTUJEMY -------------------------------------------------------------

const WSZYSTKIE_MODELE = [
  "openai/gpt-5.6-terra",
  "google/gemini-3.6-flash",
  "x-ai/grok-4.3",
  "minimax/minimax-m3",
  "deepseek/deepseek-v4-flash",
  "meta-llama/llama-4-maverick",
];

const NAZWA_KOLEKCJI = "Kolekcja test Agenta";

// Argumenty zawężające. Domyślnie pełny przejazd.
const arg = (nazwa) => {
  const p = process.argv.find((a) => a.startsWith(`--${nazwa}=`));
  return p ? p.slice(nazwa.length + 3) : null;
};
const tylkoModel = arg("model");
const tylkoPytanie = arg("pytanie");
const PRZEBIEGOW = Number(arg("przebiegi")) || 3;

const MODELE = tylkoModel ? WSZYSTKIE_MODELE.filter((m) => m === tylkoModel) : WSZYSTKIE_MODELE;
if (tylkoModel && MODELE.length === 0) {
  console.error(`Model „${tylkoModel}" nie jest na liście testowanych.`);
  process.exit(1);
}

// `szukaj` to fragment, który MUSI pojawić się w odpowiedzi. Dobrany tak, żeby
// nie dało się go trafić przypadkiem: 87 i 3B nie występują w pytaniu ani
// w promptcie systemowym.
const WSZYSTKIE_PYTANIA = [
  {
    id: "wprost",
    tresc: "Ile wynosi dodatek za pracę w sobotę w Kwadratowej?",
    szukaj: /\b87\b/,
    czegoSzukamy: "kwoty 87",
  },
  {
    id: "potoczne",
    tresc: "gdzie jest apteczka?",
    szukaj: /\b3B\b/i,
    czegoSzukamy: "pokoju 3B",
  },
];

const PYTANIA = tylkoPytanie
  ? WSZYSTKIE_PYTANIA.filter((p) => p.id === tylkoPytanie)
  : WSZYSTKIE_PYTANIA;
if (tylkoPytanie && PYTANIA.length === 0) {
  console.error(`Pytanie „${tylkoPytanie}" nie istnieje. Dostępne: wprost, potoczne.`);
  process.exit(1);
}

// --- POMOCNICZE ---------------------------------------------------------------

const teraz = () => Number(process.hrtime.bigint() / 1000000n);

// Szacunek, NIE pomiar. sendChatOpenRouter nie zwraca zużycia tokenów, a nie
// chcę go dodawać do produkcyjnego dostawcy tylko na potrzeby testu. Cztery
// znaki na token to przybliżenie dla polszczyzny zaniżające o kilkanaście
// procent — traktować jako rząd wielkości, nie rachunek. Prawdziwa kwota jest
// w panelu OpenRoutera.
const naTokeny = (s) => Math.round(String(s || "").length / 4);

// DEFINICJA NARZĘDZIA IDZIE W KAŻDYM ŻĄDANIU i jest największą częścią promptu —
// sam opis rag_search to ~1700 tokenów, bo został celowo wzmocniony
// (rag_search.js:48-71). Pominięcie jej w rachunku zaniżałoby koszt kilkakrotnie,
// a przy dwóch obiegach na rozmowę liczy się DWA RAZY.
const TOKENY_NARZEDZI = naTokeny(JSON.stringify(getToolDefsForOpenRouter(["rag_search"])));

function bezpiecznaNazwa(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, "_");
}

// --- PRZYGOTOWANIE ------------------------------------------------------------

const adres = process.env.RAG_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const kluczSerwisowy = process.env.RAG_SUPABASE_SERVICE_KEY;

if (!adres || !kluczSerwisowy) {
  console.error("Brak RAG_SUPABASE_URL albo RAG_SUPABASE_SERVICE_KEY w .env.local.");
  process.exit(1);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.error("Brak OPENROUTER_API_KEY w .env.local — bez niego nie ma czego testować.");
  process.exit(1);
}

const db = createClient(adres, kluczSerwisowy, { auth: { persistSession: false } });

const { data: kolekcja, error: bladKolekcji } = await db
  .from("rag_collections")
  .select("id, name, owner_id, embed_provider, embed_model")
  .eq("name", NAZWA_KOLEKCJI)
  .single();

if (bladKolekcji || !kolekcja) {
  console.error(`Nie znalazłem kolekcji „${NAZWA_KOLEKCJI}": ${bladKolekcji?.message || "brak"}`);
  process.exit(1);
}

// ZATRZYMANIE, GDY KOLEKCJA JEST LOKALNA. Test miałby wtedy zależność
// od uruchomionej Ollamy — czyli od składnika, którego na pokazie nie będzie.
if (kolekcja.embed_provider !== "openrouter") {
  console.error(
    `Kolekcja „${NAZWA_KOLEKCJI}" jest na ${kolekcja.embed_provider}/${kolekcja.embed_model}. ` +
      "Test wymaga kolekcji na embeddingach chmurowych, żeby nie zależeć od Ollamy."
  );
  process.exit(1);
}

const { count: zWektorami } = await db
  .from("rag_chunks")
  .select("id", { count: "exact", head: true })
  .eq("collection_id", kolekcja.id)
  .not("embedding", "is", null);

if (!zWektorami) {
  console.error("Kolekcja nie ma ani jednego fragmentu z wektorem — nie ma czego przeszukiwać.");
  process.exit(1);
}

// Prompt systemowy MINIMALNY i taki sam dla wszystkich modeli. Nie używam
// buildSystemPrompt: tamten składa personę, zasady i wiedzę konkretnego agenta,
// czyli wprowadziłby zmienną, której nie testujemy. Tu chodzi o jedno — czy
// model sięgnie po narzędzie, mając je pod ręką.
const PROMPT_SYSTEMOWY =
  "Jesteś asystentem firmy Kwadratowa Sp. z o.o. Odpowiadasz na pytania pracowników " +
  "na podstawie dokumentów firmy, do których masz dostęp przez narzędzia.";

const KATALOG_WYNIKOW = join(tmpdir(), "test-modeli-rag", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(KATALOG_WYNIKOW, { recursive: true });

console.log(`Kolekcja: ${kolekcja.name} (${kolekcja.embed_provider}/${kolekcja.embed_model}), ` +
  `${zWektorami} fragmentów z wektorami`);
console.log(`Modeli: ${MODELE.length} · pytania: ${PYTANIA.length} · przebiegi: ${PRZEBIEGOW} ` +
  `→ ${MODELE.length * PYTANIA.length * PRZEBIEGOW} rozmów`);
console.log(`Surowe odpowiedzi: ${KATALOG_WYNIKOW}\n`);

// --- POJEDYNCZY PRZEBIEG ------------------------------------------------------

async function przebieg(model, pytanie, nr) {
  // ctx w kształcie, jakiego oczekuje rag_search (patrz nagłówek).
  const ctx = {
    user: { id: kolekcja.owner_id },
    agent: { rag_collection_id: kolekcja.id },
    db,
    sources: [],
  };

  const start = teraz();
  let czasDoNarzedzia = null;
  const zdarzenia = [];

  const wynik = {
    model,
    pytanie: pytanie.id,
    nr,
    wywolalNarzedzie: false,
    maDane: false,
    czasCalkowityMs: null,
    czasDoNarzedziaMs: null,
    tokenyWe: null,
    tokenyWy: null,
    zrodel: 0,
    blad: null,
  };

  let odpowiedz = null;
  try {
    odpowiedz = await sendChatOpenRouter({
      model,
      system: PROMPT_SYSTEMOWY,
      messages: [{ role: "user", content: pytanie.tresc }],
      tools: ["rag_search"],
      ctx,
      onEvent: (ev) => {
        zdarzenia.push({ ...ev, wMs: teraz() - start });
        if (ev?.type === "tool-call" && czasDoNarzedzia === null) {
          czasDoNarzedzia = teraz() - start;
        }
      },
    });
  } catch (err) {
    // ROZRÓŻNIENIE, O KTÓRE CHODZI: błąd po drodze to co innego niż milczące
    // pominięcie narzędzia. Jedno i drugie daje odpowiedź bez danych z dokumentu.
    wynik.blad = { kod: err?.code || "brak_kodu", tresc: String(err?.message || err) };
    wynik.czasCalkowityMs = teraz() - start;
  }

  if (odpowiedz) {
    wynik.czasCalkowityMs = teraz() - start;
    wynik.czasDoNarzedziaMs = czasDoNarzedzia;
    wynik.wywolalNarzedzie = (odpowiedz.toolCalls || []).some((t) => t.tool === "rag_search");
    wynik.maDane = pytanie.szukaj.test(odpowiedz.text || "");
    wynik.zrodel = Array.isArray(odpowiedz.sources) ? odpowiedz.sources.length : 0;

    // Rachunek wejścia: prompt systemowy + pytanie + definicja narzędzia, razy
    // liczba obiegów (bez wywołania narzędzia jest jeden, z wywołaniem dwa),
    // plus treść wyniku narzędzia, która wraca do modelu w drugim obiegu.
    const obiegow = wynik.wywolalNarzedzie ? 2 : 1;
    const wynikiNarzedzi = (odpowiedz.toolCalls || [])
      .map((t) => String(t.result || ""))
      .join("");
    wynik.tokenyWe =
      obiegow * (naTokeny(PROMPT_SYSTEMOWY + pytanie.tresc) + TOKENY_NARZEDZI) +
      naTokeny(wynikiNarzedzi);
    wynik.tokenyWy = naTokeny(odpowiedz.text);
  }

  // Surowa odpowiedź do pliku ZAWSZE, także przy błędzie — bez tego nie da się
  // odróżnić „nie wywołał" od „wywołał, ale narzędzie zwróciło zero fragmentów".
  const plik = join(
    KATALOG_WYNIKOW,
    `${bezpiecznaNazwa(model)}__${pytanie.id}__${nr}.json`
  );
  writeFileSync(
    plik,
    JSON.stringify(
      {
        model,
        pytanie: pytanie.tresc,
        oczekiwano: pytanie.czegoSzukamy,
        wynik,
        zdarzenia,
        odpowiedzSurowa: odpowiedz
          ? { text: odpowiedz.text, toolCalls: odpowiedz.toolCalls, sources: odpowiedz.sources }
          : null,
      },
      null,
      2
    )
  );

  return wynik;
}

// --- PRZEBIEG CAŁOŚCI ---------------------------------------------------------

const wszystkie = [];

for (const model of MODELE) {
  for (const pytanie of PYTANIA) {
    for (let nr = 1; nr <= PRZEBIEGOW; nr++) {
      process.stdout.write(`  ${model} · ${pytanie.id} · ${nr}/${PRZEBIEGOW} … `);
      const w = await przebieg(model, pytanie, nr);
      wszystkie.push(w);
      if (w.blad) {
        console.log(`BŁĄD (${w.blad.kod})`);
      } else {
        console.log(
          `${w.wywolalNarzedzie ? "wywołał" : "NIE wywołał"}, ` +
            `${w.maDane ? "dane są" : "BRAK danych"}, ${w.czasCalkowityMs} ms`
        );
      }
    }
  }
}

// --- TABELA -------------------------------------------------------------------

function podsumujGrupe(model, pytanieId) {
  const g = wszystkie.filter((w) => w.model === model && w.pytanie === pytanieId);
  const bledy = g.filter((w) => w.blad).length;
  const czasy = g.filter((w) => w.czasCalkowityMs !== null).map((w) => w.czasCalkowityMs);
  return {
    wywolan: `${g.filter((w) => w.wywolalNarzedzie).length}/${g.length}`,
    zDanymi: `${g.filter((w) => w.maDane).length}/${g.length}`,
    bledy,
    medianaMs: czasy.length
      ? czasy.sort((a, b) => a - b)[Math.floor(czasy.length / 2)]
      : null,
  };
}

console.log("\n" + "=".repeat(104));
console.log("WYNIKI — pytania ROZDZIELONE, bez uśredniania\n");
const naglowek =
  "model".padEnd(30) +
  "WPROST: wyw. / dane / czas".padEnd(30) +
  "POTOCZNE: wyw. / dane / czas".padEnd(30) +
  "koszt~";
console.log(naglowek);
console.log("-".repeat(104));

let sumaWe = 0;
let sumaWy = 0;

for (const model of MODELE) {
  const w = podsumujGrupe(model, "wprost");
  const p = podsumujGrupe(model, "potoczne");
  const g = wszystkie.filter((x) => x.model === model);
  const we = g.reduce((s, x) => s + (x.tokenyWe || 0), 0);
  const wy = g.reduce((s, x) => s + (x.tokenyWy || 0), 0);
  sumaWe += we;
  sumaWy += wy;

  const kol = (s) =>
    `${s.wywolan} / ${s.zDanymi} / ${s.medianaMs === null ? "—" : s.medianaMs + " ms"}` +
    (s.bledy ? `  (${s.bledy} bł.)` : "");

  console.log(
    model.padEnd(30) + kol(w).padEnd(30) + kol(p).padEnd(30) + `${we}+${wy} tok.`
  );
}

console.log("-".repeat(104));
console.log(
  `Tokeny SZACOWANE (nie zmierzone): ${sumaWe} wejścia + ${sumaWy} wyjścia. ` +
    "Prawdziwy koszt jest w panelu OpenRoutera."
);
console.log(
  "\nUWAGA: kolumna „wyw.” liczy wywołania rag_search, „dane” — obecność szukanej " +
    "wartości w odpowiedzi.\nModel z 3/3 na WPROST i 1/3 na POTOCZNE jest " +
    "niebezpieczny na pokazie: daje fałszywe poczucie bezpieczeństwa."
);

const plikZbiorczy = join(KATALOG_WYNIKOW, "_wszystkie.json");
writeFileSync(plikZbiorczy, JSON.stringify(wszystkie, null, 2));
console.log(`\nSurowe odpowiedzi i zbiorczy wynik: ${KATALOG_WYNIKOW}`);
