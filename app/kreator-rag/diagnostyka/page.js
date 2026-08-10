'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { komunikatBledu } from '@/app/kreator-rag/_lib/bledy.js';
import { stanSrodowiska } from '@/app/kreator-rag/_lib/stanDiagnostyki.js';
import { POKAZ_DOSTAWCE_LOKALNA } from '@/lib/config/models';
import styles from '../kreator-rag.module.css';

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
  // Dopóki nie ma odpowiedzi, `dane` jest null → werdykt „nieznany", dioda szara.
  const werdykt = stanSrodowiska(dane, blad);

  return (
    <main className={styles.strona}>
      {/* Diagnostyka wyszła z paska nawigacji do przycisku w rogu pozostałych stron,
          więc tutaj pasek niesie WYŁĄCZNIE drogę powrotną. Bez niego strona byłaby
          ślepym zaułkiem: wejście jest jednym kliknięciem z każdego miejsca panelu,
          wyjście wymagałoby przycisku „wstecz" przeglądarki. */}
      <nav className={styles.nawigacja}>
        <div className={styles["nawigacja-slad"]}>
          {/* Strzalka nie jest juz wpisana w tekst — daje ja .nawigacja-powrot,
              wiec wszystkie powroty w module wygladaja tak samo. */}
          <Link
            href="/kreator-rag/kolekcje"
            className={styles["nawigacja-powrot"]}
          >
            Kolekcje
          </Link>
        </div>
      </nav>

      <h1>Diagnostyka</h1>
      {/* Nagłówek i podtytuł pochodziły z czasów, gdy moduł był osobną aplikacją:
          „RAG — Diagnostyka" powtarzało nazwę zakładki z sidebara, a „Sesja 0"
          to numer etapu budowy, który użytkownikowi nie mówi nic. */}
      {/* Podtytuł WYLICZA to, co niżej widać. W trybie pokazu karta Ollamy
          znika, więc wymienianie jej tutaj obiecywałoby sekcję, której nie ma. */}
      <p className={styles.podtytul}>
        {POKAZ_DOSTAWCE_LOKALNA
          ? 'Stan środowiska: Supabase, pgvector, Ollama.'
          : 'Stan środowiska: Supabase, pgvector.'}
      </p>

      {/* Ten sam werdykt, który świeci na diodzie w rogu pozostałych stron — liczony
          TĄ SAMĄ funkcją. Gdyby stały tu dwa niezależne rachunki, dałoby się dojść
          do zielonej diody nad czerwoną kartą. */}
      <div className={styles["werdykt"]}>
        <span className={styles.dioda} style={{ background: werdykt.kolor }} aria-hidden="true" />
        <span>
          <strong>{werdykt.etykieta}</strong> — {werdykt.powod}
        </span>
      </div>

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

          {/* TRYB POKAZU: karta Ollamy razem z listą pobranych modeli znika.
              Sam odczyt zostaje — /api/rag/status i tak ją sprawdza, a werdykt
              wyżej wie, kiedy jej stan ma znaczenie (stanDiagnostyki.js pyta
              najpierw o embedProvider). Ukrywamy widok, nie pomiar. */}
          {POKAZ_DOSTAWCE_LOKALNA ? (
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
          ) : null}

          <div className={styles.meta}>
            {/* Wiersz o dostawcy embeddingów potrafi wypisać wprost „ollama",
                więc w trybie pokazu znika razem z kartą. Prefiks tabel
                i brakujące zmienne zostają — nie niosą nazwy dostawcy. */}
            {POKAZ_DOSTAWCE_LOKALNA ? (
              <div>
                Dostawca embeddingów: <code>{dane.config.embedProvider}</code>, model:{' '}
                <code>{dane.config.embedModel}</code>, wymiar: <code>{dane.config.embedDim}</code>
              </div>
            ) : null}
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
