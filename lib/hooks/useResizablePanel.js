"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Uogólniony hook przesuwalnej krawędzi (uzywany i w Czatach, i w mentorze).
//   side: "left"  — uchwyt na PRAWEJ krawedzi elementu lewego (Czaty);
//                   szerokosc = clientX - lewa krawedz kontenera.
//   side: "right" — uchwyt na LEWEJ krawedzi panelu przy prawej krawedzi
//                   (mentor); szerokosc = prawa krawedz kontenera - clientX.
//   min / max     — granice; max moze byc dynamiczny (np. zalezny od szerokosci
//                   okna) — hook re-clampuje szerokosc, gdy granice sie zmienia.
//   defaultWidth  — wartosc domyslna i pierwszego renderu (SSR-safe).
//   storageKey    — klucz w localStorage; odczyt dopiero po zamontowaniu.
//   step          — krok strzalek klawiatury.
// reference: "container" — szerokosc liczona wzgledem krawedzi containerRef
//            (Czaty: rama). "viewport" — wzgledem krawedzi okna (mentor: panel
//            jest position:fixed do okna, wiec liczymy od innerWidth).
export function useResizablePanel({
  side = "left",
  min,
  max,
  defaultWidth,
  storageKey,
  step = 20,
  reference = "container",
}) {
  const clamp = useCallback((w) => Math.min(max, Math.max(min, w)), [min, max]);

  const [width, setWidth] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef(null);
  const widthRef = useRef(defaultWidth);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  // Odczyt zapisanej szerokosci — tylko po stronie klienta, po montowaniu.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw != null) {
        const v = parseInt(raw, 10);
        if (!Number.isNaN(v)) setWidth(clamp(v));
      }
    } catch {
      /* brak localStorage — zostajemy na defaultWidth */
    }
    // clamp celowo pominiete: chcemy odczytac raz, po montowaniu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Zmiana granic (np. resize okna) — utrzymaj szerokosc w zakresie.
  useEffect(() => {
    setWidth((w) => clamp(w));
  }, [clamp]);

  const persist = useCallback(
    (w) => {
      try {
        window.localStorage.setItem(storageKey, String(w));
      } catch {
        /* zapis niemozliwy — pomijamy */
      }
    },
    [storageKey],
  );

  const setAndPersist = useCallback(
    (w) => {
      const c = clamp(w);
      widthRef.current = c;
      setWidth(c);
      persist(c);
    },
    [clamp, persist],
  );

  const onMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const onMove = (ev) => {
        let raw;
        if (reference === "viewport") {
          // clientWidth (bez paska przewijania) — tak jak liczy sie prawa
          // krawedz elementow position:fixed right:0.
          const vw = document.documentElement.clientWidth;
          raw = side === "right" ? vw - ev.clientX : ev.clientX;
        } else {
          const el = containerRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          raw =
            side === "right" ? rect.right - ev.clientX : ev.clientX - rect.left;
        }
        const c = clamp(raw);
        widthRef.current = c;
        setWidth(c);
      };
      const onUp = () => {
        setDragging(false);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        persist(widthRef.current);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [clamp, persist, side, reference],
  );

  const onDoubleClick = useCallback(() => {
    setAndPersist(defaultWidth);
  }, [setAndPersist, defaultWidth]);

  const onKeyDown = useCallback(
    (e) => {
      // Dla panelu prawego uchwyt jest po LEWEJ: strzalka w lewo POSZERZA.
      const leftDelta = side === "right" ? step : -step;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setAndPersist(widthRef.current + leftDelta);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setAndPersist(widthRef.current - leftDelta);
      } else if (e.key === "Home") {
        e.preventDefault();
        setAndPersist(side === "right" ? max : min);
      } else if (e.key === "End") {
        e.preventDefault();
        setAndPersist(side === "right" ? min : max);
      }
    },
    [setAndPersist, step, side, min, max],
  );

  return {
    width,
    dragging,
    containerRef,
    separatorProps: {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-valuenow": width,
      "aria-valuemin": min,
      "aria-valuemax": max,
      tabIndex: 0,
      onMouseDown,
      onDoubleClick,
      onKeyDown,
    },
  };
}
