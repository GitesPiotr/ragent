'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { komunikatBledu } from '@/app/kreator-rag/_lib/bledy.js';

// Pętla indeksowania z 10.3 (pkt 6) w JEDNYM miejscu: klient w kółko woła
// POST /api/rag/documents/[id]/embed, każde wywołanie liczy jedną partię,
// `finished: true` kończy dokument.
//
// DLACZEGO WSPÓLNE: pętla jest używana na stronie kolekcji ORAZ na stronie mapy
// (żywa mapa z DoD Sesji 6b). Dwie kopie znaczyłyby, że poprawka wznawiania zrobiona
// w jednym miejscu po cichu nie działa w drugim.
//
// DLACZEGO TU, A NIE W lib/mapview/: tamten katalog to czysta geometria bez przeglądarki
// (sekcja 3). Tu jest stan Reacta i fetch, czyli warstwa UI. Podkreślnik w app/_hooks/
// nie tworzy trasy — ta sama konwencja co app/api/rag/_lib/.
//
// WZNAWIALNOŚĆ NIE JEST WŁASNOŚCIĄ TEGO HOOKA, a bazy: embedNextBatch bierze fragmenty
// `where embedding is null` (Sesja 4), więc ponowne uruchomienie po „Przerwij" kontynuuje
// od miejsca zatrzymania bez żadnego kursora po stronie klienta. Hook nie ma stanu,
// który mógłby się z bazą rozjechać.
export function useIndeksowanie({ onPartia, onKoniec } = {}) {
  const [postep, setPostep] = useState({}); // documentId → { done, total, running, error }
  const stopRef = useRef({}); // documentId → true, gdy użytkownik przerwał
  const cbRef = useRef({});

  // Wywołania zwrotne przez ref: pętla żyje dłużej niż jedno renderowanie, a nie chcemy,
  // żeby zmiana identyczności funkcji przerywała trwające indeksowanie.
  useEffect(() => {
    cbRef.current = { onPartia, onKoniec };
  }, [onPartia, onKoniec]);

  // Pasek NIE startuje od zera. GET /embed to sam odczyt stanu z bazy, więc po przerwaniu
  // na 4/7 od razu widać 4/7 i rośnie dalej. Zerowanie licznika sugerowałoby, że policzone
  // wektory przepadły — a one zostają w bazie.
  const wczytajPostep = useCallback(async (docIds) => {
    if (!docIds || !docIds.length) return;
    const stany = await Promise.all(
      docIds.map(async (docId) => {
        try {
          const r = await fetch(`/api/rag/documents/${docId}/embed`, { cache: 'no-store' });
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
        // Nie nadpisuj paska dokumentu, który właśnie się indeksuje.
        if (s && !(next[s.id] && next[s.id].running)) {
          next[s.id] = { done: s.done, total: s.total, running: false, error: null };
        }
      }
      return next;
    });
  }, []);

  const indeksuj = useCallback(async (docId) => {
    stopRef.current[docId] = false;
    setPostep((p) => ({
      ...p,
      [docId]: { ...(p[docId] || { done: 0, total: 0 }), running: true, error: null },
    }));
    try {
      const rp = await fetch(`/api/rag/documents/${docId}/embed`, { cache: 'no-store' });
      const jp = await rp.json();
      if (!jp.error) {
        setPostep((p) => ({ ...p, [docId]: { done: jp.done, total: jp.total, running: true, error: null } }));
      }

      for (;;) {
        const res = await fetch(`/api/rag/documents/${docId}/embed`, { method: 'POST' });
        const json = await res.json();
        if (json.error) {
          setPostep((p) => ({ ...p, [docId]: { ...(p[docId] || {}), running: false, error: komunikatBledu(json.error) } }));
          return { ok: false, error: komunikatBledu(json.error) };
        }

        // Pasek karmi się REALNYMI danymi z odpowiedzi (done/total), nigdy animacją (12.9).
        setPostep((p) => ({
          ...p,
          [docId]: { done: json.done, total: json.total, running: !json.finished, error: null },
        }));

        // Odbiorca dostaje odpowiedź PRZED sprawdzeniem warunków wyjścia — ostatnia partia
        // dokumentu też niesie nowe punkty (albo flagę przeliczenia bazy).
        if (cbRef.current.onPartia) cbRef.current.onPartia(json, docId);

        if (json.finished) break;
        if (stopRef.current[docId]) {
          // Przerwane przez użytkownika — dokument zostaje częściowo zindeksowany.
          setPostep((p) => ({ ...p, [docId]: { ...(p[docId] || {}), running: false } }));
          if (cbRef.current.onKoniec) await cbRef.current.onKoniec(docId, { przerwane: true });
          return { ok: true, przerwane: true };
        }
      }

      if (cbRef.current.onKoniec) await cbRef.current.onKoniec(docId, { przerwane: false });
      return { ok: true, przerwane: false };
    } catch (err) {
      const msg = err && err.message ? err.message : '';
      setPostep((p) => ({ ...p, [docId]: { ...(p[docId] || {}), running: false, error: 'Przerwano: ' + msg } }));
      return { ok: false, error: msg };
    }
  }, []);

  // Kolejka dokumentów PO KOLEI, nie równolegle: Ollama liczy jedną partię naraz, więc
  // równoległe pętle tylko biłyby się o ten sam model, a paski postępu skakałyby
  // bez związku z tym, co faktycznie się liczy.
  const indeksujKolejno = useCallback(
    async (docIds) => {
      stopRef.current.wszystko = false;
      for (const docId of docIds) {
        if (stopRef.current.wszystko) break;
        const r = await indeksuj(docId);
        if (!r.ok || r.przerwane) break;
      }
      stopRef.current.wszystko = false;
    },
    [indeksuj]
  );

  const przerwij = useCallback((docId) => {
    stopRef.current[docId] = true;
  }, []);

  // Po reindeksie pasek musi zniknąć, a nie pokazywać liczby z poprzedniego przebiegu —
  // wektory właśnie zostały wyczyszczone, więc stary stan byłby nieprawdą.
  const wyczyscPostep = useCallback((docId) => {
    setPostep((p) => {
      const next = { ...p };
      delete next[docId];
      return next;
    });
  }, []);

  const przerwijWszystko = useCallback(() => {
    for (const k of Object.keys(stopRef.current)) stopRef.current[k] = true;
    stopRef.current.wszystko = true;
  }, []);

  const trwa = useMemo(() => Object.values(postep).some((p) => p && p.running), [postep]);

  return {
    postep,
    trwa,
    indeksuj,
    indeksujKolejno,
    przerwij,
    przerwijWszystko,
    wczytajPostep,
    wyczyscPostep,
  };
}
