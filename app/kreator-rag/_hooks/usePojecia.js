'use client';

import { useCallback, useRef, useState } from 'react';
import { komunikatBledu } from '@/app/kreator-rag/_lib/bledy.js';

// Pętla wyciągania pojęć (Sesja 7). Ten sam wzorzec co useIndeksowanie: klient
// w kółko woła POST /concepts/extract, każde wywołanie liczy JEDNĄ partię,
// `finished: true` kończy dokument.
//
// DLACZEGO OSOBNY HOOK, A NIE PARAMETR DO useIndeksowanie: tamten hook zna
// endpoint /embed, kształt postępu wektorów i wywołanie zwrotne `onPartia`
// dorysowujące punkty na mapie. Wciśnięcie drugiego trybu do środka zamieniłoby
// go w rozgałęzienie z dwoma znaczeniami każdego pola — a to on jest jedynym
// miejscem, w którym żyje wznawialność indeksowania.
//
// WZNAWIALNOŚĆ NIE JEST WŁASNOŚCIĄ TEGO HOOKA, tylko bazy: kandydatów wyznacza
// `rag_chunks_without_concepts` (fragmenty bez ani jednego powiązania), więc
// ponowne uruchomienie po przerwaniu kontynuuje bez żadnego kursora po stronie
// klienta. Hook nie ma stanu, który mógłby się z bazą rozjechać.
//
// UWAGA NA CZAS: model 7B liczy ~14 s na fragment. Dokument na 493 fragmenty to
// blisko dwie godziny — dlatego „Przerwij" jest tu potrzebniejszy niż przy
// embedowaniu, a pasek musi pokazywać stan z bazy, nie z pamięci przeglądarki.
export function usePojecia() {
  const [postep, setPostep] = useState({}); // documentId → { done, total, running, error }
  const stopRef = useRef({});

  const przerwij = useCallback((docId) => {
    stopRef.current[docId] = true;
    setPostep((p) => ({ ...p, [docId]: { ...(p[docId] || {}), running: false } }));
  }, []);

  // Odtworzenie paska Z BAZY przy wejściu na stronę — odpowiednik wczytajPostep
  // z useIndeksowanie (Sesja 4). Bez tego dokument, którego wyciąganie przerwano,
  // wygląda po przeładowaniu na nietknięty: pasek znika, choć w bazie leży
  // na przykład 8 z 493 fragmentów z pojęciami.
  const wczytajPostep = useCallback(async (collectionId, docIds) => {
    if (!collectionId || !docIds || !docIds.length) return;
    const stany = await Promise.all(
      docIds.map(async (docId) => {
        try {
          const r = await fetch(
            `/api/rag/collections/${collectionId}/concepts/extract?documentId=${docId}`,
            { cache: 'no-store' }
          );
          const j = await r.json();
          return j.error ? null : { id: docId, done: j.done, total: j.total };
        } catch {
          return null;
        }
      })
    );
    setPostep((p) => {
      const next = { ...p };
      for (const s of stany) {
        // Nie nadpisuj paska dokumentu, który właśnie się przetwarza — jego stan
        // jest świeższy niż to, co zdążył zwrócić odczyt.
        if (s && !(next[s.id] && next[s.id].running)) {
          next[s.id] = { done: s.done, total: s.total, running: false, error: null };
        }
      }
      return next;
    });
  }, []);

  const wyciagaj = useCallback(async (collectionId, docId) => {
    stopRef.current[docId] = false;
    setPostep((p) => ({ ...p, [docId]: { ...(p[docId] || { done: 0, total: 0 }), running: true, error: null } }));

    // Mianownik NAJPIERW, osobnym tanim odczytem. Bez tego pasek pokazuje „0 / 0"
    // przez całą pierwszą partię — przy Kodeksie 44 sekundy, nie do odróżnienia
    // od zawieszenia. To jest sedno naprawy.
    try {
      const r = await fetch(
        `/api/rag/collections/${collectionId}/concepts/extract?documentId=${docId}`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      if (!j.error) {
        setPostep((p) => ({
          ...p,
          [docId]: { done: j.done, total: j.total, running: true, error: null },
        }));
      }
    } catch {
      // Odczyt startowy jest wygodą, nie warunkiem. Gdy padnie, pętla i tak
      // przyniesie prawdziwe liczby pierwszą odpowiedzią.
    }

    // NIC NIE SUMUJEMY PO STRONIE KLIENTA. Każda odpowiedź podaje `done` i `total`
    // policzone z bazy, więc pasek jest odczytem stanu, a nie licznikiem żyjącym
    // w pamięci komponentu. To była usterka naprawiona już raz w Sesji 4 przy
    // pasku embedowania: suma trzymana w kliencie przepada po przeładowaniu,
    // a do pierwszej odpowiedzi mianownik w ogóle nie jest znany.
    while (!stopRef.current[docId]) {
      let json;
      try {
        const res = await fetch(`/api/rag/collections/${collectionId}/concepts/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: docId }),
        });
        json = await res.json();
      } catch (e) {
        setPostep((p) => ({
          ...p,
          [docId]: { ...(p[docId] || {}), running: false, error: 'Przerwane połączenie: ' + (e && e.message) },
        }));
        return { ok: false };
      }

      if (json.error) {
        setPostep((p) => ({
          ...p,
          [docId]: { ...(p[docId] || {}), running: false, error: komunikatBledu(json.error) },
        }));
        return { ok: false, error: komunikatBledu(json.error) };
      }

      setPostep((p) => ({
        ...p,
        [docId]: { done: json.done, total: json.total, running: !json.finished, error: null },
      }));

      if (json.finished) return { ok: true, done: json.done };
    }

    return { ok: true, przerwane: true };
  }, []);

  return { postep, wyciagaj, przerwij, wczytajPostep };
}
