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
//  Powstala przy integracji z RAG, ale POWOD JEJ ISTNIENIA JEST NIEZALEZNY
//  i dlatego trasa zostaje mimo wycofania tamtego pomyslu: kasowanie ma trzy
//  kroki, ich KOLEJNOSC jest tresciowa (patrz nizej), a komunikaty bledow
//  opisuja stany posrednie. To nalezy do serwera, nie do kodu wykonywanego
//  w przegladarce, gdzie nie da sie tego ani przetestowac, ani wymusic.
//
//  Logika odpinania od agentów jest przeniesiona z lib/data/knowledge.js
//  BEZ ZMIAN CO DO KOLEJNOŚCI I KOMUNIKATÓW — razem z uzasadnieniem, bo ono
//  jest tam ważniejsze niż sam kod.
// =============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    //  KROKU „SKASUJ DOKUMENT RAG" TU NIE MA — I TO JEST DECYZJA, NIE BRAK.
    //
    //  W rundzie 5b stal tutaj krok kasujacy odpowiednik pliku w rag_documents.
    //  Zostal usuniety razem z calym pomyslem „plik z Bazy wiedzy indeksuje sie
    //  do RAG": Baza wiedzy i Kreator RAG sa DWOMA OSOBNYMI NARZEDZIAMI.
    //  Baza wiedzy dokleja pliki do promptu w calosci; Kreator RAG ma wlasne
    //  kolekcje i wlasne wgrywanie. Zaden plik nie zyje juz w obu miejscach
    //  naraz, wiec kasowanie w jednym nie ma czego sprzatac w drugim.
    //
    //  Kolekcje i dokumenty RAG kasuje sie w Kreatorze RAG, swiadomie —
    //  a nie jako skutek uboczny usuniecia pliku z innej zakladki.
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    //  2) STORAGE (bucket "knowledge").
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

    // --- 3) WIERSZ -----------------------------------------------------------
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
    });
  } catch (e) {
    return blad(e?.message || 'Nieoczekiwany błąd podczas usuwania pliku.', 500);
  }
}
