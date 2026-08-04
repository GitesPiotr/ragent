// POST /api/rag/collections/[id]/concepts/extract → extractConceptsForDocument
//
// documentId W CIELE ŻĄDANIA (sekcja 10), nie w ścieżce: wyciąganie pojęć jest
// operacją NA KOLEKCJI, wykonywaną dokument po dokumencie.
//
// Liczy JEDNĄ PARTIĘ i zwraca { done, total, finished } — ten sam kontrakt co
// /embed. Klient woła w pętli; przerwanie w dowolnym momencie niczego nie psuje,
// bo stan siedzi wyłącznie w bazie (10.3).
//
// GET /api/rag/collections/[id]/concepts/extract?documentId=… → SAM ODCZYT postępu,
// bez wołania modelu. Dokładnie ta sama para metod co na /embed w Sesji 4, i z tego
// samego powodu: pasek musi znać mianownik ZANIM przyjdzie pierwsza partia (przy
// Kodeksie to 44 sekundy) i musi przeżyć przeładowanie strony. Odczyt jest odczytem,
// więc idzie GET-em — nie POST-em z pustą partią.

import { ok, fail } from '../../../../_lib/http.js';
import { klientSesji } from '../../../../_lib/klientSesji.js';
import { extractConceptsForDocument } from '@/lib/rag/concepts.js';
import { wczytajModeleKonta } from '@/lib/settings/dopuszczoneServer';
import { rozstrzygnij, zPrzypisania, ZRODLO } from '@/lib/settings/przypisaniaModeli';

export const dynamic = 'force-dynamic';

// =============================================================================
//  MODEL POJĘĆ Z PRZYPISAŃ KONTA — WSTRZYKIWANY PRZEZ WARSTWĘ HTTP
//
//  Granica z sekcji 3 SPEC: `lib/rag/` nie wie nic o AIDEAS i ma tak zostać.
//  Przypisania są pojęciem AIDEAS (tabela `model_assignments`, migracja 020),
//  więc rdzeń nie ma prawa po nie sięgać. Tę wartość musi wnieść TA trasa —
//  jedyne miejsce, które zna oba światy.
//
//  Przekazujemy SAMĄ KONFIGURACJĘ, nie gotowego dostawcę. Pełne uzasadnienie
//  stoi przy `deps.conceptOverride` w lib/rag/concepts.js; w skrócie: AIDEAS
//  mówi CO, rdzeń wie JAK.
//
//  BRAK PRZYPISANIA ZWRACA `undefined`, NIE PUSTY OBIEKT. Rdzeń pomija
//  nadpisanie tylko wtedy, gdy para jest niekompletna — a `undefined` jest
//  jednoznaczne i nie każe mu tego sprawdzać drugi raz.
// =============================================================================
// =============================================================================
//  WYBÓR NA JEDNO WYWOŁANIE — ROZSTRZYGNIĘTE W RUNDZIE 3
//
//  Etap 2 pozwala zmienić model pojęć przy samym przycisku. Ta zmiana
//  obowiązuje WYŁĄCZNIE dla tego wywołania i NIE JEST ZAPISYWANA
//  w przypisaniach konta. Cztery powody, w kolejności wagi:
//
//   1. ZASIĘG KONTROLKI MUSI ZGADZAĆ SIĘ Z ZASIĘGIEM SKUTKU.
//      `model_assignments` (migracja 020) to ustawienie KONTA — działa na
//      agenta, mentora i pojęcia RAG, we wszystkich kolekcjach. Kontrolka
//      stojąca w widoku jednej kolekcji, obok jednego przycisku, obiecuje
//      wzrokiem „ta kolekcja, to uruchomienie". Cichy zapis do ustawienia
//      globalnego byłby tą samą chorobą co w rundzie 1, tylko odwróconą:
//      nie polem BEZ skutku, ale polem ze skutkiem WIĘKSZYM, niż zapowiada
//      jego kontekst.
//
//   2. OPERACJA JEST DŁUGA I WZNAWIALNA. Model 7B liczy ~14 s na fragment,
//      więc przerwanie i wznowienie jest normą. Przy zapisie do przypisań
//      wznowienie z innej karty podnosiłoby to, co akurat leży w przypisaniach
//      — łącznie ze zmianą zrobioną w międzyczasie w Ustawieniach.
//
//   3. MIEJSCE DO UTRWALENIA JUŻ ISTNIEJE: Ustawienia → przypisania, rola
//      `rag_pojecia`. Dwa zapisujące do jednego ustawienia, w dwóch miejscach,
//      z czego jeden jako efekt uboczny innej czynności, to dokładnie ta
//      duplikacja, którą likwidowała runda 8.
//
//   4. ASYMETRIA KOSZTU. Pojęcia są krokiem drogim. Spróbowanie raz droższego
//      modelu na jednej kolekcji to normalny eksperyment; ten sam eksperyment
//      zamieniony po cichu w domyślny model konta to niespodzianka z rachunkiem.
//
//  DOMYŚLNA POZOSTAJE ROLA Z PRZYPISAŃ — decyzja konta jest widoczna
//  i uszanowana, dopóki użytkownik świadomie jej nie ominie na jeden przebieg.
// =============================================================================
async function modelPojec(wybor) {
  const { dopuszczone, przypisania } = await wczytajModeleKonta();

  const p = typeof wybor?.provider === 'string' ? wybor.provider.trim() : '';
  const m = typeof wybor?.model === 'string' ? wybor.model.trim() : '';

  if (p && m) {
    // SERWER NIE UFA CIAŁU ŻĄDANIA (wzorzec z serverSettings.js:2). Para musi
    // stać na liście dopuszczonej przez konto — inaczej pole obok przycisku
    // stałoby się obejściem ustawień konta.
    //
    // `dopuszczone === null` znaczy „nie wiemy" (brak sesji, brak tabel
    // migracji 020), a nie „konto nic nie wybrało". Wtedy nie ma czym
    // zweryfikować wyboru, więc go NIE PRZYJMUJEMY i schodzimy do przypisań —
    // odmowa byłaby myląca, bo problem jest po stronie konfiguracji, nie wyboru.
    if (Array.isArray(dopuszczone)) {
      const pasuje = dopuszczone.some((x) => x.provider === p && x.model_id === m);
      if (!pasuje) {
        const e = new Error(
          `Model "${p}/${m}" nie jest na liście modeli dopuszczonych dla tego konta. ` +
            `Dodaj go w Ustawieniach albo wybierz inny.`
        );
        e.code = 'invalid_input';
        throw e;
      }
      return { provider: p, model: m };
    }
  }

  const w = rozstrzygnij([zPrzypisania(przypisania, 'rag_pojecia')]);
  if (w.zrodlo !== ZRODLO.PRZYPISANIE) return undefined;
  return { provider: w.provider, model: w.model };
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const documentId = new URL(request.url).searchParams.get('documentId');
    if (!documentId) {
      const e = new Error('Brak documentId w adresie.');
      e.code = 'invalid_input';
      throw e;
    }
    // batch: 0 — ta sama ścieżka co wyciąganie, tylko bez partii do przerobienia.
    // Dzięki temu `total` liczy się w JEDNYM miejscu i nie ma jak się rozjechać.
    return ok(
      await extractConceptsForDocument(documentId, {
        client: await klientSesji(),
        collectionId: id,
        batch: 0,
      })
    );
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const documentId = body && body.documentId;
    if (!documentId) {
      const e = new Error('Brak documentId w ciele żądania.');
      e.code = 'invalid_input';
      throw e;
    }
    return ok(
      await extractConceptsForDocument(documentId, {
        client: await klientSesji(),
        collectionId: id,
        // `body.model` — para wybrana w etapie 2 NA TO WYWOŁANIE. Nigdzie
        // nie jest zapisywana; uzasadnienie przy `modelPojec` wyżej.
        conceptOverride: await modelPojec(body && body.model),
      })
    );
  } catch (err) {
    return fail(err);
  }
}
