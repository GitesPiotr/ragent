// POST /api/knowledge/[id]/index → wciąga plik z Bazy wiedzy do RAG
// GET  /api/knowledge/[id]/index → stan zindeksowania tego pliku (sam odczyt)
//
// =============================================================================
//  DLACZEGO TO JEST OSOBNA AKCJA, A NIE CZĘŚĆ WGRYWANIA
//
//  Dwa powody, oba twarde:
//
//  1. knowledge_files.status ma CHECK na ready|no_text|error — NIE MA stanu
//     „w trakcie". Gdyby ingest wisiał na uploadzie, plik przez kilkadziesiąt
//     sekund pokazywałby status końcowy, którego jeszcze nie osiągnął.
//  2. /api/knowledge/upload jest synchroniczny i nie ma maxDuration. Doklejenie
//     do niego ekstrakcji i cięcia zrobiłoby z wgrania PDF-a żądanie na
//     kilkadziesiąt sekund — i tak BEZ wektorów, bo te liczy dopiero pętla
//     /embed, partiami.
//
//  Embedowanie zostaje więc jeszcze dalej: ta trasa kończy się na fragmentach
//  (status 'chunked'), a wektory dolicza klient w pętli POST /api/rag/documents/
//  [id]/embed. To ta sama pętla, którą chodzi Kreator, i ten sam hook.
//
//  ------------------------------------------------------------
//  DLACZEGO PLIK JEST CZYTANY Z BUCKETU, A NIE Z knowledge_files.extracted_text
//
//  Bo to są DWIE RÓŻNE EKSTRAKCJE i świadomie ich nie scalamy.
//  lib/knowledge/extractText.js (AIDEAS) daje płaski tekst i nie obsługuje nawet
//  docx. lib/rag/extract.js daje bloki z nagłówkami, stronami i heading_path —
//  a na NIM kalibrowano próg 0.45 i na nim stoi cięcie. Podanie rdzeniowi
//  gotowego tekstu z AIDEAS zmieniłoby materiał wejściowy wyszukiwania,
//  nie zmieniając ani jednej liczby w konfiguracji.
// =============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureCollectionByExternalRef } from '@/lib/rag/collections.js';
import { ingestFile, findDocumentByExternalRef } from '@/lib/rag/documents.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Ekstrakcja i cięcie dużego PDF-a to sekundy, nie milisekundy.
export const maxDuration = 300;

const BUCKET_WIEDZY = 'knowledge';

// Nazwa kolekcji konta. Widoczna w Kreatorze RAG, więc ma się tłumaczyć sama.
const NAZWA_KOLEKCJI = 'Baza wiedzy konta';
const OPIS_KOLEKCJI =
  'Kolekcja zakładana automatycznie. Zawiera dokumenty wciągnięte z Bazy wiedzy AIDEAS.';

function blad(message, status) {
  return NextResponse.json({ error: message }, { status });
}

// Wspólny początek obu metod: sesja + wiersz pliku + kolekcja konta.
// Zwraca albo { supabase, user, plik, kolekcja }, albo gotową odpowiedź błędu.
async function kontekst(id) {
  const supabase = await createClient();
  if (!supabase) {
    return { odpowiedz: blad('Brak konfiguracji Supabase. Uzupełnij .env.local.', 503) };
  }

  // TOŻSAMOŚĆ Z SESJI, NIGDY Z CIAŁA ŻĄDANIA. To nie jest ostrożność na zapas:
  // owner_id kolekcji bierze się właśnie stąd, więc przyjęcie go od klienta
  // pozwoliłoby wpisywać własne dokumenty do cudzej kolekcji.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { odpowiedz: blad('Wymagane zalogowanie.', 401) };

  // BEZ filtra po owner_id — pilnuje go polityka knowledge_files_wlasne
  // (migracja 010). Cudze id zwróci po prostu brak wiersza.
  const { data: plik, error } = await supabase
    .from('knowledge_files')
    .select('id, file_name, file_path, mime_type, size, status, status_message')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return { odpowiedz: blad('Nie udało się odczytać pliku: ' + error.message, 500) };
  }
  if (!plik) return { odpowiedz: blad('Nie znaleziono pliku.', 404) };

  const kolekcja = await ensureCollectionByExternalRef(
    user.id,
    { name: NAZWA_KOLEKCJI, description: OPIS_KOLEKCJI },
    { client: supabase }
  );

  return { supabase, user, plik, kolekcja };
}

// --- GET: sam odczyt stanu, bez żadnej pracy ---------------------------------
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const k = await kontekst(id);
    if (k.odpowiedz) return k.odpowiedz;

    const dokument = await findDocumentByExternalRef(k.kolekcja.id, k.plik.id, {
      client: k.supabase,
    });

    return NextResponse.json({
      collectionId: k.kolekcja.id,
      // null = plik nie ma jeszcze odpowiednika w RAG.
      document: dokument
        ? {
            id: dokument.id,
            status: dokument.status,
            chunkCount: dokument.chunkCount,
            pageCount: dokument.pageCount,
            charCount: dokument.charCount,
          }
        : null,
      // Czy plik w ogóle nadaje się do zindeksowania — ta sama reguła co w POST,
      // wyliczana w JEDNYM miejscu, żeby przycisk i trasa nie mogły się rozjechać.
      mozliwe: k.plik.status === 'ready',
      powod: k.plik.status === 'ready' ? null : powodOdmowy(k.plik),
    });
  } catch (e) {
    return blad(e?.message || 'Nieoczekiwany błąd.', 500);
  }
}

// Jedno miejsce na wyjaśnienie, dlaczego pliku nie da się zindeksować.
function powodOdmowy(plik) {
  if (plik.status === 'no_text') {
    return (
      `Plik „${plik.file_name}" nie ma warstwy tekstowej — to skan albo zdjęcie. ` +
      'Nie ma z czego zrobić fragmentów, a pusty dokument w RAG udawałby wiedzę, ' +
      'której nie ma. Rozpoznawanie tekstu z obrazu (OCR) nie jest obsługiwane.'
    );
  }
  if (plik.status === 'error') {
    return (
      `Odczyt pliku „${plik.file_name}" nie powiódł się przy wgrywaniu` +
      (plik.status_message ? `: ${plik.status_message}` : '.') +
      ' Wgraj go ponownie, zanim spróbujesz zindeksować.'
    );
  }
  return `Plik ma status „${plik.status}", a indeksować można wyłącznie pliki gotowe.`;
}

// --- POST: wciągnięcie pliku do RAG ------------------------------------------
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const k = await kontekst(id);
    if (k.odpowiedz) return k.odpowiedz;

    const { supabase, plik, kolekcja } = k;

    // 1) ODMOWA DLA PLIKÓW BEZ TREŚCI — przed jakąkolwiek pracą.
    //    Dokument RAG z zerem fragmentów byłby gorszy niż jego brak: widniałby
    //    na liście jako zaindeksowany, a wyszukiwarka nie miałaby w nim nic.
    if (plik.status !== 'ready') {
      return blad(powodOdmowy(plik), 422);
    }

    // 2) IDEMPOTENCJA. Bez tego drugie kliknięcie „Zindeksuj" wpadałoby na
    //    unikalny indeks (collection_id, external_ref) z migracji 018 i wracało
    //    surowym błędem bazy o naruszeniu ograniczenia.
    const juzJest = await findDocumentByExternalRef(kolekcja.id, plik.id, {
      client: supabase,
    });
    if (juzJest) {
      return NextResponse.json({
        collectionId: kolekcja.id,
        documentId: juzJest.id,
        chunkCount: juzJest.chunkCount,
        status: juzJest.status,
        juzByl: true,
      });
    }

    if (!plik.file_path) {
      return blad(
        'Plik nie ma zapisanej ścieżki w magazynie — nie ma czego pobrać. Wgraj go ponownie.',
        422
      );
    }

    // 3) POBRANIE ORYGINAŁU z bucketu "knowledge". Polityka
    //    knowledge_wlasne_pliki (013) przepuszcza wyłącznie własny folder.
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET_WIEDZY)
      .download(plik.file_path);

    if (dlErr || !blob) {
      return blad(
        'Nie udało się pobrać pliku z magazynu: ' +
          (dlErr?.message || 'brak odpowiedzi') +
          '. Plik jest na liście, ale jego zawartość zniknęła z Storage — wgraj go ponownie.',
        502
      );
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());

    // 4) INGEST. Ten sam rdzeń i ta sama ekstrakcja co w Kreatorze — plik
    //    przechodzi drugą, WŁASNĄ ścieżkę ekstrakcji (uzasadnienie w nagłówku).
    //    Oryginał ląduje przy okazji w buckecie rag-files; ta kopia jest tym,
    //    z czego działa „Przetnij od nowa" bez pytania AIDEAS o cokolwiek.
    const dokument = await ingestFile(
      {
        collectionId: kolekcja.id,
        externalRef: plik.id,
        file: {
          name: plik.file_name,
          mimeType: plik.mime_type || blob.type || null,
          size: plik.size ?? bytes.byteLength,
          bytes,
        },
      },
      { client: supabase }
    );

    return NextResponse.json({
      collectionId: kolekcja.id,
      documentId: dokument.id,
      chunkCount: dokument.chunkCount,
      pageCount: dokument.pageCount,
      charCount: dokument.charCount,
      status: dokument.status,
      juzByl: false,
    });
  } catch (e) {
    // Błędy rdzenia niosą własne kody domenowe (10.2) — mapujemy te, które
    // znaczą „to wina danych wejściowych", żeby nie zgłaszać ich jako awarii.
    const kod = e?.code;
    if (kod === 'no_text') return blad(e.message, 422);
    if (kod === 'limit_exceeded') return blad(e.message, 413);
    if (kod === 'invalid_input') return blad(e.message, 400);
    if (kod === 'not_found') return blad(e.message, 404);
    if (kod === 'ollama_unavailable' || kod === 'no_key') return blad(e.message, 503);
    return blad(e?.message || 'Nieoczekiwany błąd podczas indeksowania.', 500);
  }
}
