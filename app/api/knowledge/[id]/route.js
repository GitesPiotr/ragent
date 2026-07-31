// DELETE /api/knowledge/[id] → usunięcie pliku z Bazy wiedzy
//
// =============================================================================
//  DLACZEGO TA TRASA W OGÓLE POWSTAŁA
//
//  Do tej pory kasowanie szło WPROST Z PRZEGLĄDARKI przez
//  deleteKnowledgeFileAndUnpin (lib/data/knowledge.js) — trzy zapytania
//  z klienta, bez żadnej trasy API. Działało, dopóki kasowanie dotyczyło
//  wyłącznie AIDEAS.
//
//  Od integracji z RAG plik ma DRUGIE życie: dokument w rag_documents,
//  jego fragmenty, wektory i kopię oryginału w buckecie rag-files. To wszystko
//  musi zniknąć razem z plikiem. Nie ma się gdzie tego podpiąć od strony
//  przeglądarki — nie ma triggera, nie ma hooka, nie ma jednego miejsca,
//  przez które przechodzi kasowanie. Stąd trasa: JEDNO miejsce, w którym
//  kasowanie pliku znaczy „skasuj wszystkie jego ślady".
//
//  Logika odpinania od agentów jest przeniesiona z lib/data/knowledge.js
//  BEZ ZMIAN CO DO KOLEJNOŚCI I KOMUNIKATÓW — razem z uzasadnieniem, bo ono
//  jest tam ważniejsze niż sam kod.
// =============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCollectionByExternalRef } from '@/lib/rag/collections.js';
import { findDocumentByExternalRef, deleteDocument } from '@/lib/rag/documents.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET_WIEDZY = 'knowledge';

function blad(message, status) {
  return NextResponse.json({ error: message }, { status });
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    if (!supabase) {
      return blad('Brak konfiguracji Supabase. Uzupełnij .env.local.', 503);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return blad('Wymagane zalogowanie.', 401);

    // Wiersz pliku. Bez filtra po właścicielu — robi to RLS (migracja 010),
    // więc cudze id po prostu nie zwróci wiersza.
    const { data: plik, error: bladPliku } = await supabase
      .from('knowledge_files')
      .select('id, file_name, file_path')
      .eq('id', id)
      .maybeSingle();

    if (bladPliku) return blad('Nie udało się odczytać pliku: ' + bladPliku.message, 500);
    if (!plik) return blad('Nie znaleziono pliku.', 404);

    // -----------------------------------------------------------------------
    //  1) ODPIĘCIE OD AGENTÓW — ZAWSZE PIERWSZE.
    //
    //  Przeniesione z lib/data/knowledge.js:114-124 razem z powodem, bo powód
    //  jest tu treścią, nie ozdobą:
    //
    //  Odwrotna kolejność zostawiałaby przy błędzie agentów wskazujących na
    //  nieistniejący plik. To NIE rzuca błędem — loadKnowledgeFilesForAgent
    //  robi .in("id", ids) i po prostu dostaje mniej wierszy — więc agent
    //  po cichu odpowiadałby bez tej wiedzy. Awaria niewidoczna, czyli gorsza.
    //
    //  Przy tej kolejności najgorszy stan pośredni to „agenci odpięci, plik
    //  nadal jest": widoczny na liście, możliwy do usunięcia ponownie. Każde
    //  ponowienie jest bezpieczne — agenci już odpięci nie trafiają do pętli
    //  po raz drugi.
    // -----------------------------------------------------------------------
    const { data: agenci, error: bladAgentow } = await supabase
      .from('agents')
      .select('id, name, knowledge_file_ids');

    if (bladAgentow) {
      return blad(
        'Nie udało się sprawdzić, którzy agenci używają tego pliku: ' + bladAgentow.message,
        500
      );
    }

    const uzywajacy = (agenci ?? []).filter(
      (a) => Array.isArray(a.knowledge_file_ids) && a.knowledge_file_ids.includes(plik.id)
    );

    let odpietych = 0;
    for (const agent of uzywajacy) {
      const nastepne = agent.knowledge_file_ids.filter((x) => x !== plik.id);
      const { error } = await supabase
        .from('agents')
        .update({ knowledge_file_ids: nastepne })
        .eq('id', agent.id);

      if (error) {
        const postep =
          odpietych > 0
            ? ` Zdążyliśmy odpiąć go od ${odpietych} z ${uzywajacy.length} agentów, reszta korzysta z niego dalej.`
            : '';
        return blad(
          `Nie udało się odpiąć pliku od agenta „${agent.name}". Plik NIE został usunięty.${postep} Spróbuj ponownie — ponowienie jest bezpieczne. Szczegóły: ${
            error.message || 'nieznany błąd'
          }`,
          500
        );
      }
      odpietych += 1;
    }

    // -----------------------------------------------------------------------
    //  2) DOKUMENT RAG — nowy krok.
    //
    //  deleteDocument sprząta komplet: wiersz rag_documents, kaskadą jego
    //  fragmenty z wektorami, oraz kopię oryginału w buckecie rag-files.
    //
    //  NA BŁĘDZIE PRZERYWAMY, tak samo jak przy Storage niżej — i to jest
    //  wybór, nie zaniechanie. Dokument RAG niesie PEŁNĄ TREŚĆ pliku
    //  w extracted_text i we fragmentach. Gdybyśmy przepuścili błąd dalej
    //  i skasowali sam plik, użytkownik zobaczyłby, że plik zniknął, a jego
    //  treść zostałaby w bazie i dalej wychodziłaby w wynikach wyszukiwania.
    //  „Usunięte" musi znaczyć usunięte.
    //
    //  Brak kolekcji albo brak dokumentu to NIE jest błąd: plik mógł nigdy
    //  nie zostać zindeksowany. Wtedy po prostu nie ma czego kasować.
    // -----------------------------------------------------------------------
    let ragUsuniety = false;
    try {
      const kolekcja = await getCollectionByExternalRef(user.id, { client: supabase });
      if (kolekcja) {
        const dokument = await findDocumentByExternalRef(kolekcja.id, plik.id, {
          client: supabase,
        });
        if (dokument) {
          await deleteDocument(dokument.id, { client: supabase });
          ragUsuniety = true;
        }
      }
    } catch (e) {
      return blad(
        'Plik został odpięty od agentów, ale nie udało się usunąć jego odpowiednika w Kreatorze RAG. ' +
          'Plik NIE został usunięty — inaczej jego treść zostałaby w wyszukiwarce mimo zniknięcia z listy. ' +
          'Spróbuj ponownie; ponowienie jest bezpieczne. Szczegóły: ' +
          (e?.message || 'nieznany błąd'),
        500
      );
    }

    // -----------------------------------------------------------------------
    //  3) STORAGE (bucket "knowledge").
    //
    //  Na błędzie PRZERYWAMY (nie kasujemy wiersza mimo wszystko): wiersz jest
    //  jedynym śladem ścieżki obiektu, więc skasowany zostawiłby w buckecie
    //  sierotę — niewidoczną z aplikacji i nie do usunięcia. Obiekt, którego
    //  po prostu nie ma, błędu nie zgłasza, więc ta gałąź nie tworzy „duchów".
    // -----------------------------------------------------------------------
    if (plik.file_path) {
      const { error: bladStorage } = await supabase.storage
        .from(BUCKET_WIEDZY)
        .remove([plik.file_path]);

      if (bladStorage) {
        return blad(
          `Plik został odpięty od agentów, ale nie udało się usunąć go z magazynu (Storage). Wpis w bazie ZOSTAJE, więc plik nadal widać na liście — spróbuj usunąć go ponownie. Szczegóły: ${
            bladStorage.message || 'nieznany błąd'
          }`,
          500
        );
      }
    }

    // --- 4) WIERSZ -----------------------------------------------------------
    const { error: bladWiersza } = await supabase
      .from('knowledge_files')
      .delete()
      .eq('id', plik.id);

    if (bladWiersza) {
      return blad(
        `Plik zniknął z magazynu (Storage), ale jego wpis został w bazie. Usuń go jeszcze raz — ponowienie posprząta wpis. Szczegóły: ${
          bladWiersza.message || 'nieznany błąd'
        }`,
        500
      );
    }

    return NextResponse.json({
      deleted: true,
      unpinnedFrom: uzywajacy.length,
      ragUsuniety,
    });
  } catch (e) {
    return blad(e?.message || 'Nieoczekiwany błąd podczas usuwania pliku.', 500);
  }
}
