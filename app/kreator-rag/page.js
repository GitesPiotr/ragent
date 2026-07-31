'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { komunikatBledu } from '@/app/kreator-rag/_lib/bledy.js';
import styles from './kreator-rag.module.css';

// UI nigdy nie sięga do bazy ani do rdzenia — dane wyłącznie z /api/rag/status.

function Kropka({ ok }) {
  // ok: true → zielona, false → czerwona, null → żółta (stan nieznany)
  const klasa = ok === true ? 'ok' : ok === false ? 'blad' : 'nieznane';
  return <span className={`${styles.kropka} ${styles[klasa]}`} />;
}

function Karta({ tytul, ok, kod, komunikat, children }) {
  return (
    <div className={styles.karta}>
      <div className={styles["naglowek-karty"]}>
        <Kropka ok={ok} />
        <span>{tytul}</span>
        {kod ? <span className={styles.kod}>{kod}</span> : null}
      </div>
      {komunikat ? <p className={styles.komunikat}>{komunikat}</p> : null}
      {children}
    </div>
  );
}

export default function DiagnostykaPage() {
  const [stan, setStan] = useState({ ladowanie: true, blad: null, dane: null });

  const pobierz = useCallback(async () => {
    setStan({ ladowanie: true, blad: null, dane: null });
    try {
      const res = await fetch('/api/rag/status', { cache: 'no-store' });
      const json = await res.json();
      if (json && json.error) {
        setStan({ ladowanie: false, blad: komunikatBledu(json.error), dane: null });
        return;
      }
      setStan({ ladowanie: false, blad: null, dane: json });
    } catch (err) {
      setStan({
        ladowanie: false,
        blad: 'Nie udało się pobrać diagnostyki: ' + (err && err.message ? err.message : 'nieznany błąd.'),
        dane: null,
      });
    }
  }, []);

  useEffect(() => {
    pobierz();
  }, [pobierz]);

  const { ladowanie, blad, dane } = stan;

  return (
    <main className={styles.strona}>
      <nav className={styles.nawigacja}>
        <Link href="/kreator-rag" className={styles.aktywny}>Diagnostyka</Link>
        <Link href="/kreator-rag/kolekcje">Kolekcje</Link>
      </nav>
      <h1>RAG — Diagnostyka</h1>
      <p className={styles.podtytul}>Sesja 0 — stan środowiska: Supabase, pgvector, Ollama.</p>

      <button onClick={pobierz} disabled={ladowanie}>
        {ladowanie ? 'Sprawdzam…' : 'Odśwież'}
      </button>

      {blad ? (
        <Karta tytul="Błąd diagnostyki" ok={false} komunikat={blad} />
      ) : null}

      {!blad && ladowanie && !dane ? <p className={styles.komunikat}>Ładowanie…</p> : null}

      {dane ? (
        <>
          <Karta
            tytul="Supabase"
            ok={dane.supabase.ok}
            kod={dane.supabase.code}
            komunikat={dane.supabase.message}
          />

          <Karta
            tytul="Rozszerzenie pgvector"
            ok={dane.pgvector.installed}
            komunikat={dane.pgvector.message}
          />

          <Karta
            tytul="Wymiar kolumny embeddingu"
            ok={dane.dimCheck.ok}
            kod={dane.dimCheck.code}
            komunikat={dane.dimCheck.message}
          />

          <Karta
            tytul="Ollama"
            ok={dane.ollama.ok}
            kod={dane.ollama.code}
            komunikat={`${dane.ollama.message} (${dane.ollama.url})`}
          >
            {dane.models && dane.models.length ? (
              <ul className={styles.modele}>
                {dane.models.map((m) => (
                  <li key={m.name}>{m.name}</li>
                ))}
              </ul>
            ) : null}
          </Karta>

          <div className={styles.meta}>
            <div>
              Dostawca embeddingów: <code>{dane.config.embedProvider}</code>, model:{' '}
              <code>{dane.config.embedModel}</code>, wymiar: <code>{dane.config.embedDim}</code>
            </div>
            <div>
              Prefiks tabel: <code>{dane.config.tablePrefix}</code>
            </div>
            {dane.config.missing && dane.config.missing.length ? (
              <div>Brakujące zmienne: <code>{dane.config.missing.join(', ')}</code></div>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}
