'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { stanSrodowiska } from '@/app/kreator-rag/_lib/stanDiagnostyki.js';
import styles from '../kreator-rag.module.css';

// Przycisk „Diagnostyka" w prawym górnym rogu każdej strony panelu.
//
// DLACZEGO W ROGU, A NIE W NAWIGACJI: diagnostyka nie jest miejscem, do którego
// się chodzi — jest stanem, który się SPRAWDZA i zwykle ma się nie zmieniać.
// Pozycja w pasku obok „Kolekcji" stawiała ją na równi z treścią panelu, choć
// odwiedza się ją raz na kilka tygodni. Dioda odwraca to: informacja przychodzi
// sama, wejście jest opcjonalne.
//
// BEZ ODPYTYWANIA W TLE. Jeden odczyt przy wejściu na stronę — dioda pokazuje
// stan, nie tyka. Interwał kusi („będzie aktualne"), ale kosztowałby zapytanie
// z każdej otwartej karty co kilka sekund po to, żeby prawie zawsze pokazać
// dokładnie to samo. Kto chce świeższego pomiaru, wchodzi w diagnostykę
// i klika „Odśwież" — i to jest cała różnica między wskaźnikiem a monitoringiem.
export default function PrzyciskDiagnostyki() {
  // `dane === null` przed pierwszą odpowiedzią → stan „nieznany", dioda szara.
  const [odp, setOdp] = useState({ dane: null, blad: null });

  useEffect(() => {
    let zywe = true;
    (async () => {
      try {
        const res = await fetch('/api/rag/status', { cache: 'no-store' });
        const json = await res.json();
        if (!zywe) return;
        if (json && json.error) {
          setOdp({ dane: null, blad: json.error.message || 'nieznany błąd' });
          return;
        }
        setOdp({ dane: json, blad: null });
      } catch (err) {
        if (zywe) setOdp({ dane: null, blad: (err && err.message) || 'brak połączenia' });
      }
    })();
    return () => {
      zywe = false;
    };
  }, []);

  // Werdykt liczy WSPÓLNA funkcja — ta sama, której używa strona diagnostyki.
  const stan = stanSrodowiska(odp.dane, odp.blad);

  return (
    <Link
      href="/kreator-rag/diagnostyka"
      className={styles['przycisk-diagnostyki']}
      // Sama dioda nie mówi, CO jest nie tak. Powód idzie i w tooltip, i w etykietę
      // dla czytnika ekranu — kolor jest dla oka, zdanie dla wszystkich pozostałych.
      title={stan.powod}
      aria-label={`Diagnostyka — ${stan.etykieta}. ${stan.powod}`}
    >
      <span
        className={styles.dioda}
        style={{ background: stan.kolor }}
        aria-hidden="true"
      />
      Diagnostyka
    </Link>
  );
}
