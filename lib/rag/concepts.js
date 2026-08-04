// Pojęcia (Sesja 7): wyciąganie, lista, wyszukiwanie po pojęciu.
// Czysty JS, do bazy wyłącznie przez db.js. Zero React/Next/window.
//
// TRZY REGUŁY, KTÓRE TU OBOWIĄZUJĄ:
// 1. Praca PARTIAMI i wznawialność — ten sam wzorzec co embedNextBatch (10.3).
//    Baza jest źródłem prawdy: pytamy, które fragmenty nie mają jeszcze pojęć.
//    Kursor nie żyje w stanie procesu, bo proces bywa przerwany.
// 2. mention_count WYPROWADZANY, nie inkrementowany — patrz komentarz niżej.
// 3. Funkcje zwracające pojęcia oddają WYŁĄCZNIE kanoniczne (`merged_into is null`),
//    a searchByConcept rozwiązuje id scalonego do kanonicznego (sekcja 9).

import { getSupabaseClient, czytajStronami } from './db.js';
import { getConfig } from './config.js';
import { createConceptProvider } from './concepts-provider.js';
import { createEmbeddingProvider, embedConfigDlaKolekcji, nieobslugiwanaPara } from './embedding.js';

const RPC_KANDYDACI = 'rag_chunks_without_concepts';

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// =============================================================================
//  label_normalized — co jest „tą samą etykietą" JUŻ PRZY ZAPISIE
//
//  SPEC ma `unique (collection_id, label_normalized)` i każe scalać identyczne
//  etykiety tutaj, ale nigdzie nie mówi, jak ta kolumna powstaje. Rozstrzygnięcie:
//
//    NFC → trim → zwinięcie białych znaków → małe litery
//        → zdjęcie otaczających cudzysłowów → zdjęcie końcowej interpunkcji
//
//  ŚWIADOMIE BEZ usuwania diakrytyków i BEZ stemmingu: „Urlop" = „urlop", ale
//  „urlop" ≠ „urlopu". Sklejanie form fleksyjnych to robota normalizacji
//  wektorowej z Sesji 8 — tutaj scalamy tylko to, co jest tym samym napisem.
//
//  NFC JEST KONIECZNE I NIEOCZYWISTE: polskie „ą" bywa jednym punktem kodowym
//  (U+0105) albo złożeniem „a" + ogonek (U+0061 U+0328). Dwie wizualnie
//  identyczne etykiety miałyby wtedy różne bajty, `unique` by ich nie połączył
//  i w grafie stanęłyby dwa węzły nie do odróżnienia okiem. Ta sama klasa
//  pułapki co warianty odstępów w paginie RODO (10.a.2).
// =============================================================================
const CUDZYSLOWY = /^["'„”“»«‚’‛]+|["'„”“»«‚’‛]+$/g;
const KONCOWA_INTERPUNKCJA = /[.,;:!?]+$/;

export function normalizujEtykiete(etykieta) {
  let s = String(etykieta == null ? '' : etykieta);
  s = s.normalize('NFC');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(CUDZYSLOWY, '').trim();
  s = s.replace(KONCOWA_INTERPUNKCJA, '').trim();
  return s.toLowerCase();
}

// Fragment nadaje się do wyciągania pojęć? Kryterium to LICZBA WYRAZÓW, nie długość.
//
// Zmierzone na kolekcji „Regulaminy" (1030 fragmentów): próg 200 znaków flaguje 36
// fragmentów, z czego 17 to prawdziwa treść — m.in. cały rozdział o reklamacjach
// z 05-instrukcja-bhp.pdf (149 znaków) i reguła o urlopie z 01-regulamin-pracy.md
// (139 znaków). Mały dokument straciłby 20% treści i nikt by tego nie zauważył.
//
// Liczba wyrazów flaguje 19 fragmentów i WSZYSTKIE są śmieciem: „Rozdział I" ×10,
// „M. SCHULZ", „(uchylony)", „(zawierający art. 671–674 – uchylony)". Histogram ma
// pustą przerwę: śmieci mają ≤6 wyrazów, treść ≥10, między 7 a 9 nie ma nic.
// Próg 8 leży w środku tej przerwy — nie jest dostrojony do wyniku.
//
// WYRAZ TO TOKEN O CO NAJMNIEJ DWÓCH LITERACH. Bez tego warunku
// „U S T A W A z dnia 26 czerwca 1974 r." liczy się jako 12 wyrazów i przechodzi;
// przy regule ≥2 liter ma ich 2 („dnia", „czerwca") i wypada.
export function liczWyrazy(tekst) {
  return (String(tekst || '').match(/\p{L}{2,}/gu) || []).length;
}

// =============================================================================
//  mention_count — WYPROWADZANY, nie inkrementowany (odejście od litery SPEC)
//
//  SPEC każe `on conflict … do update set mention_count = mention_count + 1`.
//  To nie jest idempotentne, a wznawialność czyni powtórzenia NORMALNYM trybem
//  pracy, nie wyjątkiem: partia przerwana w połowie zostanie powtórzona, bo
//  fragmenty bez pojęć wracają jako kandydaci.
//
//  `rag_chunk_concepts` ma klucz główny (chunk_id, concept_id), więc POWIĄZANIE
//  jest idempotentne. Licznik nie jest. Po dwóch przerwanych przebiegach „urlop"
//  pokazałby 40 wystąpień przy 25 fragmentach i NIC by tego nie wykryło — liczba
//  wygląda wiarygodnie, a graf kłamie o wadze węzła.
//
//  Dlatego liczymy go z `count(*)` po powiązaniach, PO KAŻDEJ PARTII (a nie przy
//  odczycie): odczyt pojęć robi też graf w Sesji 9, a agregat na każde wejście
//  do grafu przy 2000 fragmentów kosztowałby więcej niż jedno przeliczenie na
//  partię. Wartość w kolumnie zostaje, zmienia się tylko sposób jej ustalania.
// =============================================================================

// Eksportowana WYŁĄCZNIE po to, żeby reguła nadpisania dała się sprawdzić
// testem — decyduje o tym, którym modelem liczone są pojęcia, a pomyłka
// objawiłaby się dopiero rachunkiem u innego dostawcy.
export function providerConfigFromGlobal(config, override) {
  return {
    provider: config.concept.provider,
    model: config.concept.model,
    perChunk: config.concept.perChunk,
    ollamaUrl: config.embed.ollamaUrl,
    apiKey: config.concept.apiKey,
    openrouterApiKey: config.concept.openrouterApiKey,
    // NADPISANIE Z WARSTWY HTTP — tylko `provider` i `model`, tylko gdy PARA
    // jest kompletna. Uzasadnienie kształtu tego szwu w komentarzu przy
    // `deps.conceptOverride` niżej.
    ...(override && override.provider && override.model
      ? { provider: override.provider, model: override.model }
      : {}),
  };
}

function throwRpc(error) {
  const msg = (error && error.message) || 'nieznany';
  const code = error && error.code;
  if (code === 'PGRST202' || /could not find the function|does not exist/i.test(msg)) {
    throw err(
      'invalid_input',
      `Funkcja "${RPC_KANDYDACI}" nie istnieje w bazie. Uruchom ręcznie skrypt sql/session-7-concepts.sql w Supabase → SQL Editor.`
    );
  }
  throw err('internal', 'Błąd bazy danych przy wyciąganiu pojęć: ' + msg);
}

// Przelicza mention_count kanonicznych pojęć kolekcji z liczby powiązań.
// Ograniczone do podanych id, żeby nie przeliczać całej kolekcji po każdej partii.
async function przeliczLiczniki(client, conceptIds) {
  if (!conceptIds.length) return;
  const { data, error } = await client
    .from('rag_chunk_concepts')
    .select('concept_id')
    .in('concept_id', conceptIds);
  if (error) throw err('internal', 'Błąd odczytu powiązań: ' + error.message);

  const licznik = new Map(conceptIds.map((id) => [id, 0]));
  for (const r of data || []) licznik.set(r.concept_id, (licznik.get(r.concept_id) || 0) + 1);

  for (const [id, n] of licznik) {
    const { error: uErr } = await client.from('rag_concepts').update({ mention_count: n }).eq('id', id);
    if (uErr) throw err('internal', 'Błąd aktualizacji mention_count: ' + uErr.message);
  }
}

// Ile fragmentów dokumentu ma JUŻ co najmniej jedno pojęcie.
//
// Liczone przez identyfikatory fragmentów, bo `rag_chunk_concepts` nie ma
// kolumny document_id. Grupami po GRUPA_ID, żeby lista nie wypchnęła URL-a —
// przy Kodeksie to 510 identyfikatorów.
const GRUPA_ID = 200;

async function policzZPojeciami(client, documentId) {
  const idFragmentow = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('rag_chunks')
      .select('id')
      .eq('document_id', documentId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw err('internal', 'Błąd odczytu fragmentów: ' + error.message);
    idFragmentow.push(...(data || []).map((r) => r.id));
    if (!data || data.length < PAGE) break;
  }

  const zPojeciami = new Set();
  for (let i = 0; i < idFragmentow.length; i += GRUPA_ID) {
    const { data, error } = await client
      .from('rag_chunk_concepts')
      .select('chunk_id')
      .in('chunk_id', idFragmentow.slice(i, i + GRUPA_ID));
    if (error) throw err('internal', 'Błąd odczytu powiązań: ' + error.message);
    for (const r of data || []) zPojeciami.add(r.chunk_id);
  }
  return zPojeciami.size;
}

// =============================================================================
//  extractConceptsForDocument — JEDNA PARTIA na wywołanie (sekcja 9 + 10.3)
//
//  Zwraca { done, total, finished } — TEN SAM KONTRAKT CO getEmbedProgress
//  I embedNextBatch, i to jest ważniejsze niż wygląda:
//
//    total = wszystkie fragmenty NADAJĄCE SIĘ do wyciągania (bez śmieci),
//    done  = ile z nich ma już pojęcia — LICZONE Z BAZY, nie narastająco.
//
//  DLACZEGO NIE NARASTAJĄCO PO STRONIE KLIENTA (usterka z Sesji 4, drugi raz).
//  Wcześniej `total` znaczyło „ile zostało w chwili wywołania", a `done` — „ile
//  zrobiła TA partia", więc klient musiał sam sumować. To ma dwie konsekwencje,
//  obie widoczne dopiero na dużym dokumencie:
//    • do pierwszej odpowiedzi klient NIE ZNA mianownika, a pierwsza odpowiedź
//      przychodzi po całej partii — przy 4 fragmentach × ~11 s to 44 sekundy,
//      przez które pasek pokazuje „0 / 0" i wygląda na zawieszony,
//    • po przeładowaniu strony suma przepada, bo żyła w pamięci komponentu,
//      choć baza cały czas zna prawdę.
//  Ta sama pułapka co przy pasku embedowania w Sesji 4, rozwiązana tak samo:
//  ŹRÓDŁEM PRAWDY JEST BAZA, klient tylko wyświetla.
//
//  `deps.batch = 0` → SAM ODCZYT POSTĘPU, bez wołania modelu. To jest odpowiednik
//  getEmbedProgress, tyle że bez osobnej funkcji: warunek „zero fragmentów w partii"
//  wypada naturalnie z tej samej ścieżki, więc nie ma dwóch miejsc liczących total,
//  które mogłyby się rozjechać.
// =============================================================================
export async function extractConceptsForDocument(documentId, deps = {}) {
  if (!documentId) throw err('invalid_input', 'Brak identyfikatora dokumentu.');
  const config = getConfig();
  const client = deps.client || getSupabaseClient();

  const { data: doc, error: dErr } = await client
    .from('rag_documents')
    .select('id, collection_id, status')
    .eq('id', documentId)
    .single();
  if (dErr || !doc) throw err('not_found', 'Dokument nie istnieje.');

  // Trasa podaje kolekcję ze ścieżki URL. Sprawdzamy zgodność, żeby nie dało się
  // wyciągnąć pojęć dokumentu przez adres CUDZEJ kolekcji — pojęcia są per kolekcja
  // (`unique (collection_id, label_normalized)`), więc rozjazd tworzyłby wiersze
  // w kolekcji, do której dokument nie należy.
  if (deps.collectionId && deps.collectionId !== doc.collection_id) {
    throw err('not_found', 'Dokument nie należy do tej kolekcji.');
  }

  const minWyrazow = config.concept.minWords;
  const partia = deps.batch === undefined ? config.concept.batch : Number(deps.batch) || 0;

  // Ile jeszcze zostało. Liczone tą samą regułą co kandydaci (próg wyrazów siedzi
  // W ZAPYTANIU, patrz sql/session-7-concepts.sql), więc `done`/`total` nie mogą
  // rozjechać się z tym, co pętla naprawdę przerobi.
  const { data: wszystkie, error: cErr } = await client.rpc(RPC_KANDYDACI, {
    p_document_id: documentId,
    p_min_words: minWyrazow,
    p_limit: 100000,
  });
  if (cErr) throwRpc(cErr);
  const pozostalo = (wszystkie || []).length;

  // Mianownik paska: fragmenty nadające się do przetworzenia, czyli te, które
  // mają już pojęcia, plus te, które jeszcze czekają. ŚMIECI ODSIANE PROGIEM
  // WYRAZÓW NIE WCHODZĄ — inaczej pasek nigdy nie doszedłby do 100%, bo Kodeks
  // ma 17 fragmentów, które z założenia nigdy pojęć nie dostaną.
  const zPojeciami = await policzZPojeciami(client, documentId);
  const total = zPojeciami + pozostalo;

  // batch = 0 → sam odczyt, bez dotykania modelu. Tą ścieżką idzie odtwarzanie
  // paska przy wejściu na stronę.
  if (partia <= 0 || pozostalo === 0) {
    return { done: zPojeciami, total, finished: pozostalo === 0 };
  }

  const kandydaci = (wszystkie || []).slice(0, partia);

  // =========================================================================
  //  SKĄD BIERZE SIĘ MODEL POJĘĆ — DWA RÓŻNE SZWY, NIE JEDEN
  //
  //  deps.conceptProvider — GOTOWY dostawca. Szew TESTOWY i tylko testowy:
  //    pozwala przepuścić całą pętlę bez modelu i bez sieci. Używa go sześć
  //    miejsc w concepts-postep.test.js.
  //
  //  deps.conceptOverride — SAMA KONFIGURACJA { provider, model }. Szew
  //    PRODUKCYJNY, wprowadzony w rundzie 8, żeby model pojęć mógł pochodzić
  //    z przypisań konta.
  //
  //  DLACZEGO OSOBNY SZEW, A NIE conceptProvider DLA OBU. Rozważane były obie
  //  drogi; ta wygrała z trzech powodów:
  //
  //   1. GRANICA Z SEKCJI 3 SPEC ZOSTAJE NIETKNIĘTA W OBIE STRONY. Warstwa
  //      HTTP mówi rdzeniowi CO (ten dostawca, ten model), a rdzeń dalej sam
  //      wie JAK: skąd wziąć klucz, jaki jest perChunk, jaki adres Ollamy.
  //      Gdyby AIDEAS podawał gotowego dostawcę, musiałby to wszystko znać —
  //      czyli sięgnąć po `getConfig()` rdzenia i powtórzyć u siebie
  //      `providerConfigFromGlobal`. To nie rdzeń wiedziałby o AIDEAS, ale
  //      AIDEAS o wnętrzu rdzenia, a granica jest granicą w obie strony.
  //
  //   2. JEDEN SZEW, DWA ZNACZENIA TO PUŁAPKA. `deps.conceptProvider` jest
  //      opisany jako wstrzykiwalny do testów. Gdyby zaczął nieść też
  //      konfigurację produkcyjną, zmiana interfejsu dostawcy psułaby testy
  //      i produkcję na dwa różne sposoby, a jedno wywołanie nie mówiłoby
  //      już, o który przypadek chodzi.
  //
  //   3. KOMUNIKATY BŁĘDÓW ZOSTAJĄ W RDZENIU. `createConceptProvider` mówi
  //      „Brak ANTHROPIC_API_KEY… albo przełącz na ollama" i „Model X nie jest
  //      dostępny w Ollamie. Pobierz go: ollama pull X". Budowanie dostawcy
  //      po stronie trasy przeniosłoby tę wiedzę do warstwy HTTP albo kazało
  //      ją zdublować.
  //
  //  NADPISANIE JEST CZĘŚCIOWE I TYLKO NA PARĘ. Sam `provider` bez `model`
  //  dałby dostawcę bez modelu — dlatego `providerConfigFromGlobal` przyjmuje
  //  nadpisanie wyłącznie kompletne, a niepełne po cichu pomija i zostaje
  //  przy wartości ze zmiennych środowiskowych.
  // =========================================================================
  const provider =
    deps.conceptProvider ||
    createConceptProvider(providerConfigFromGlobal(config, deps.conceptOverride));

  // =========================================================================
  //  EMBEDDER ETYKIET IDZIE Z PARY KOLEKCJI — TAK SAMO JAK FRAGMENTY.
  //
  //  Pytanie z rundy 3 brzmiało, czy pojęcia mogą zostać na konfiguracji
  //  serwera, skoro ich wektory porównuje się WYŁĄCZNIE MIĘDZY SOBĄ (Sesja 8),
  //  nigdy z wektorami fragmentów. Odpowiedź: nie mogą, z dwóch powodów.
  //
  //   1. `rag_concepts` MA collection_id. Przestrzeń wektorowa pojęć jest
  //      PER KOLEKCJA, a nie globalna. Kolekcja przerobiona raz przy serwerze
  //      na `ollama`, a raz na `openrouter`, dostałaby w JEDNEJ tabeli i JEDNEJ
  //      kolekcji wektory z dwóch dróg. Dziś to prawie nie boli (cosinus
  //      0,999987 na tym samym pliku wag, runda 0), ale „prawie" jest
  //      właściwością dzisiejszej oferty, nie właściwością kodu — pierwszy
  //      model o innym wymiarze zamienia to w zapis, którego nie da się
  //      porównać ani naprawić inaczej niż liczeniem od nowa.
  //
  //   2. OBIETNICA KOLEKCJI CHMUROWEJ. Sens rundy 1 to „ten sam model, działa
  //      bez Ollamy" (modeleEmbeddingow.js:52). Embedder pojęć na konfiguracji
  //      serwera łamałby ją w połowie: dokument zaindeksowałby się przez
  //      OpenRoutera, a pojęcia wywróciłyby się na `ollama_unavailable`.
  //      Kolekcja działająca w połowie jest gorsza od niedziałającej, bo
  //      awaria wychodzi dopiero przy mapie pojęć.
  //
  //  Model POJĘĆ (czatowy, `provider` wyżej) zostaje bez zmian na konfiguracji
  //  i przypisaniach konta — to inna decyzja i inny zasób. Kolekcja pamięta
  //  parę EMBEDDINGÓW, nie model, który wymyśla etykiety.
  // =========================================================================
  const { data: coll } = await client
    .from('rag_collections')
    .select('embed_provider, embed_model, embed_dim')
    .eq('id', doc.collection_id)
    .single();

  const nieobslugiwana = nieobslugiwanaPara(coll);
  if (nieobslugiwana) throw err('model_mismatch', `${nieobslugiwana} Wydobywanie pojęć wstrzymane.`);

  const embedder = deps.provider || createEmbeddingProvider(embedConfigDlaKolekcji(coll, config));

  const dotknietePojecia = new Set();

  for (const frag of kandydaci) {
    const etykiety = await provider.dlaFragmentu(frag.content);

    for (const surowa of etykiety) {
      const label = String(surowa).normalize('NFC').replace(/\s+/g, ' ').trim();
      const labelNormalized = normalizujEtykiete(surowa);
      if (!labelNormalized) continue;

      // Czy pojęcie już istnieje w tej kolekcji?
      const { data: istniejace } = await client
        .from('rag_concepts')
        .select('id')
        .eq('collection_id', doc.collection_id)
        .eq('label_normalized', labelNormalized)
        .maybeSingle();

      let conceptId = istniejace && istniejace.id;

      if (!conceptId) {
        // Wektor pojęcia liczony przez embedDocuments, NIE embedQuery (SPEC, Sesja 7):
        // wektory pojęć porównuje się wyłącznie MIĘDZY SOBĄ (Sesja 8), więc liczy się
        // spójność prefiksu, a nie to, czy pojęcie „jest zapytaniem".
        const [wektor] = await embedder.embedDocuments([label]);
        const { data: nowe, error: iErr } = await client
          .from('rag_concepts')
          .insert({
            collection_id: doc.collection_id,
            label,
            label_normalized: labelNormalized,
            embedding: wektor ? '[' + wektor.join(',') + ']' : null,
            mention_count: 0,
          })
          .select('id')
          .maybeSingle();

        if (iErr) {
          // Wyścig: równoległy przebieg mógł wstawić tę samą etykietę między
          // naszym SELECT-em a INSERT-em. `unique` na to nie pozwoli — wtedy
          // po prostu doczytujemy cudzy wiersz zamiast się wywracać.
          const { data: pon } = await client
            .from('rag_concepts')
            .select('id')
            .eq('collection_id', doc.collection_id)
            .eq('label_normalized', labelNormalized)
            .maybeSingle();
          if (!pon) throw err('internal', 'Błąd zapisu pojęcia: ' + iErr.message);
          conceptId = pon.id;
        } else {
          conceptId = nowe.id;
        }
      }

      // Powiązanie jest idempotentne z definicji (klucz główny). Powtórka partii
      // nie tworzy duplikatu i nie zmienia liczników.
      await client
        .from('rag_chunk_concepts')
        .upsert({ chunk_id: frag.chunk_id, concept_id: conceptId }, { onConflict: 'chunk_id,concept_id' });

      dotknietePojecia.add(conceptId);
    }
  }

  await przeliczLiczniki(client, [...dotknietePojecia]);

  // `done` liczone OD NOWA z bazy, nie jako `zPojeciami + kandydaci.length`.
  // Różnica jest realna: fragment, dla którego model nie zwrócił ani jednej
  // etykiety, nie dostaje powiązania i przy następnym wywołaniu WRÓCI jako
  // kandydat. Dodawanie długości partii pokazałoby postęp, którego nie ma,
  // a pasek doszedłby do 100% przy niepustej kolejce.
  const doneTeraz = await policzZPojeciami(client, documentId);
  return {
    done: doneTeraz,
    total,
    // UWAGA: koniec wyznacza POKRYCIE PARTII, nie `done >= total`. Fragment, dla
    // którego model nie zwrócił ani jednej etykiety, nie dostaje powiązania i wraca
    // jako kandydat — warunek `done >= total` nigdy by się wtedy nie spełnił
    // i pętla klienta chodziłaby w nieskończoność. Przy tym warunku kończymy,
    // a pasek uczciwie zatrzymuje się na przykład na 483/485.
    finished: kandydaci.length >= pozostalo,
  };
}

// =============================================================================
//  listConcepts — WYŁĄCZNIE kanoniczne (sekcja 9)
// =============================================================================
export async function listConcepts(collectionId, deps = {}) {
  if (!collectionId) throw err('invalid_input', 'Brak identyfikatora kolekcji.');
  const client = deps.client || getSupabaseClient();

  // STRONAMI: po Kodeksie jedna kolekcja ma 565 pojęć kanonicznych, czyli do limitu
  // 1000 wierszy PostgREST brakuje mniej niż dwa razy tyle. Klucz rozstrzygający
  // remisy jest konieczny, bo setki pojęć mają mention_count = 1 — bez niego strony
  // mogłyby się zazębić i wynik byłby cichym pomieszaniem.
  const data = await czytajStronami(
    (od, do_) =>
      client
        .from('rag_concepts')
        .select('id, label, mention_count')
        .eq('collection_id', collectionId)
        .is('merged_into', null)
        .order('mention_count', { ascending: false })
        .order('id', { ascending: true })
        .range(od, do_),
    { naBlad: (e) => err('internal', 'Błąd odczytu pojęć: ' + e.message) }
  );

  return {
    concepts: (data || []).map((r) => ({
      id: r.id,
      label: r.label,
      mentionCount: r.mention_count || 0,
    })),
  };
}

// =============================================================================
//  searchByConcept — rozwiązuje SCALONE do KANONICZNEGO (sekcja 9)
//
//  Dziś nic nie jest scalone (to Sesja 8), ale rozwiązanie jest tu OD RAZU.
//  Inaczej po Sesji 8 kliknięcie starego pojęcia w grafie zwracałoby pustkę,
//  a powiązania byłyby już przepięte na kanoniczne.
// =============================================================================
export async function searchByConcept({ collectionId, conceptId, limit = 30 } = {}, deps = {}) {
  if (!collectionId) throw err('invalid_input', 'Brak identyfikatora kolekcji.');
  if (!conceptId) throw err('invalid_input', 'Brak identyfikatora pojęcia.');
  const client = deps.client || getSupabaseClient();

  const { data: pojecie, error: pErr } = await client
    .from('rag_concepts')
    .select('id, merged_into, collection_id')
    .eq('id', conceptId)
    .maybeSingle();
  if (pErr) throw err('internal', 'Błąd odczytu pojęcia: ' + pErr.message);
  if (!pojecie) throw err('not_found', 'Pojęcie nie istnieje.');
  if (pojecie.collection_id !== collectionId) throw err('not_found', 'Pojęcie nie należy do tej kolekcji.');

  // Kanoniczne ma zawsze merged_into = null (Sesja 8 gwarantuje brak łańcuchów),
  // więc jeden skok wystarczy — nie ma czego iterować.
  const kanoniczneId = pojecie.merged_into || pojecie.id;

  // STRONAMI, i tu ma to wprost związek z 12.9: z liczby tych wierszy bierze się
  // `total` w napisie „pokazano 30 z 312". Ucięcie odczytu na 1000 nie zepsułoby
  // widoku — po cichu ZANIŻYŁOBY liczbę, którą pokazujemy jako prawdę o danych.
  const powiazania = await czytajStronami(
    (od, do_) =>
      client
        .from('rag_chunk_concepts')
        .select('chunk_id')
        .eq('concept_id', kanoniczneId)
        .order('chunk_id', { ascending: true })
        .range(od, do_),
    { naBlad: (e) => err('internal', 'Błąd odczytu powiązań: ' + e.message) }
  );

  const ids = (powiazania || []).map((r) => r.chunk_id);
  const total = ids.length;
  if (!total) return { chunks: [], total: 0 };

  const wziete = ids.slice(0, Math.max(1, limit));
  const { data: fragmenty, error: fErr } = await client
    .from('rag_chunks')
    .select('id, document_id, heading_path, page_from, content, chunk_index')
    .in('id', wziete)
    .order('chunk_index', { ascending: true });
  if (fErr) throw err('internal', 'Błąd odczytu fragmentów: ' + fErr.message);

  const docIds = [...new Set((fragmenty || []).map((f) => f.document_id))];
  const { data: dokumenty } = await client
    .from('rag_documents')
    .select('id, file_name')
    .in('id', docIds);
  const nazwa = new Map((dokumenty || []).map((d) => [d.id, d.file_name]));

  return {
    chunks: (fragmenty || []).map((f) => ({
      chunkId: f.id,
      documentId: f.document_id,
      fileName: nazwa.get(f.document_id) || null,
      headingPath: f.heading_path,
      pageFrom: f.page_from,
      content: f.content,
    })),
    // `total` to liczba WSZYSTKICH fragmentów pojęcia, nie zwróconych. UI ma
    // pokazać „pokazano 30 z 312" (12.9) — nie udajemy, że to wszystko.
    total,
  };
}
