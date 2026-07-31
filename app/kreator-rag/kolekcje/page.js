'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { komunikatBledu } from '@/app/kreator-rag/_lib/bledy.js';
import styles from '../kreator-rag.module.css';

// UI nigdy nie sięga do bazy ani do rdzenia — wyłącznie przez /api/rag/collections*.

function Nawigacja() {
  return (
    <nav className={styles.nawigacja}>
      <Link href="/kreator-rag">Diagnostyka</Link>
      <Link href="/kreator-rag/kolekcje" className={styles.aktywny}>Kolekcje</Link>
    </nav>
  );
}

export default function KolekcjePage() {
  const [kolekcje, setKolekcje] = useState([]);
  const [ladowanie, setLadowanie] = useState(true);
  const [blad, setBlad] = useState(null);
  const [pokazArchiwum, setPokazArchiwum] = useState(false);

  const [nazwa, setNazwa] = useState('');
  const [opis, setOpis] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [bladFormularza, setBladFormularza] = useState(null);
  const [tworzenie, setTworzenie] = useState(false);

  const pobierz = useCallback(async () => {
    setLadowanie(true);
    setBlad(null);
    try {
      const url = '/api/rag/collections' + (pokazArchiwum ? '?includeArchived=1' : '');
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (json.error) {
        setBlad(komunikatBledu(json.error));
        setKolekcje([]);
      } else {
        setKolekcje(json.collections || []);
      }
    } catch (err) {
      setBlad('Nie udało się pobrać kolekcji: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    } finally {
      setLadowanie(false);
    }
  }, [pokazArchiwum]);

  useEffect(() => {
    pobierz();
  }, [pobierz]);

  async function utworz(e) {
    e.preventDefault();
    setBladFormularza(null);
    setTworzenie(true);
    try {
      const res = await fetch('/api/rag/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nazwa,
          description: opis || undefined,
          externalRef: externalRef || undefined,
          embedModel: embedModel || undefined,
        }),
      });
      const json = await res.json();
      if (json.error) {
        setBladFormularza(komunikatBledu(json.error));
        return;
      }
      setNazwa('');
      setOpis('');
      setExternalRef('');
      setEmbedModel('');
      await pobierz();
    } catch (err) {
      setBladFormularza('Nie udało się utworzyć kolekcji: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    } finally {
      setTworzenie(false);
    }
  }

  async function zmienStatus(id, action) {
    setBlad(null);
    try {
      const res = await fetch('/api/rag/collections/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.error) {
        setBlad(komunikatBledu(json.error));
        return;
      }
      await pobierz();
    } catch (err) {
      setBlad('Nie udało się zmienić kolekcji: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    }
  }

  async function usun(id, name) {
    if (!window.confirm(
      `Usunąć kolekcję „${name}"?\n\nTa operacja jest nieodwracalna: znikną jej dokumenty, fragmenty ORAZ wgrane pliki.`
    )) {
      return;
    }
    setBlad(null);
    try {
      const res = await fetch('/api/rag/collections/' + id, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (json && json.error) {
        setBlad(komunikatBledu(json.error));
        return;
      }
      // Sprzątanie Storage jest nieblokujące, żeby awaria magazynu nie blokowała
      // porządków w bazie — ale wtedy pliki zostają w buckecie i nikt ich już nie
      // wskaże. Milczenie w tym miejscu byłoby dokładnie tym wyciekiem, który
      // punkt 2 Sesji 10 likwiduje.
      if (json && json.plikowNieusunietych > 0) {
        setBlad(
          `Kolekcję „${name}" usunięto z bazy, ale ${json.plikowNieusunietych} ${
            json.plikowNieusunietych === 1 ? 'pliku nie udało się' : 'plików nie udało się'
          } skasować z magazynu — zostały tam osierocone. Sprawdź połączenie z Supabase Storage i uruchom „node scripts/diag-sieroty.mjs", żeby zobaczyć, co zostało.`
        );
      }
      await pobierz();
    } catch (err) {
      setBlad('Nie udało się usunąć kolekcji: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    }
  }

  return (
    <main className={styles.strona}>
      <Nawigacja />
      <h1>Kolekcje</h1>
      <p className={styles.podtytul}>Twórz i porządkuj bazy wiedzy. Dokumenty dojdą w kolejnej sesji.</p>

      <div className={styles.karta}>
        <div className={styles["naglowek-karty"]}><span>Nowa kolekcja</span></div>
        <form onSubmit={utworz} style={{ marginTop: 12 }}>
          <label htmlFor="nazwa">Nazwa (wymagana)</label>
          <input id="nazwa" type="text" value={nazwa} onChange={(e) => setNazwa(e.target.value)} placeholder="np. Regulaminy" />

          <label htmlFor="opis">Opis</label>
          <textarea id="opis" value={opis} onChange={(e) => setOpis(e.target.value)} placeholder="opcjonalnie" />

          <label htmlFor="externalRef">Powiązanie zewnętrzne (external_ref)</label>
          <input id="externalRef" type="text" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="opcjonalnie — hak integracyjny, bez FK" />

          <label htmlFor="embedModel">Model embeddingów</label>
          <input id="embedModel" type="text" value={embedModel} onChange={(e) => setEmbedModel(e.target.value)} placeholder="puste = globalny (bge-m3); wymiar wykryjemy z modelu" />

          {bladFormularza ? <p className={styles["blad-formularza"]}>{bladFormularza}</p> : null}

          <div className={styles["przyciski-rzad"]}>
            <button type="submit" disabled={tworzenie}>{tworzenie ? 'Tworzę…' : 'Utwórz kolekcję'}</button>
          </div>
        </form>
      </div>

      <div className={styles["checkbox-rzad"]}>
        <input id="archiwum" type="checkbox" checked={pokazArchiwum} onChange={(e) => setPokazArchiwum(e.target.checked)} />
        <label htmlFor="archiwum" style={{ margin: 0 }}>Pokaż zarchiwizowane</label>
      </div>

      {blad ? <div className={styles.karta}><p className={styles.komunikat} style={{ color: 'var(--blad)' }}>{blad}</p></div> : null}

      {ladowanie ? (
        <p className={styles.pusto}>Ładowanie…</p>
      ) : kolekcje.length === 0 ? (
        <p className={styles.pusto}>Brak kolekcji. Utwórz pierwszą powyżej.</p>
      ) : (
        kolekcje.map((k) => (
          <div className={styles.karta} key={k.id}>
            <div className={styles["rzad-kolekcji"]}>
              <div className={styles.tresc}>
                <h3>
                  <Link href={`/kreator-rag/kolekcje/${k.id}`} style={{ color: 'inherit' }}>{k.name}</Link>{' '}
                  {k.status === 'archived' ? <span className={`${styles.znacznik} ${styles.zarchiwizowana}`}>zarchiwizowana</span> : null}
                </h3>
                {k.description ? <div className={styles.detale}>{k.description}</div> : null}
                <div className={styles.detale}>
                  model: <code>{k.embedModel}</code> · wymiar: <code>{k.embedDim}</code>
                  {k.externalRef ? <> · external_ref: <code>{k.externalRef}</code></> : null}
                </div>
              </div>
              <div className={styles["przyciski-rzad"]}>
                {k.status === 'archived' ? (
                  <button onClick={() => zmienStatus(k.id, 'restore')}>Przywróć</button>
                ) : (
                  <button onClick={() => zmienStatus(k.id, 'archive')}>Archiwizuj</button>
                )}
                <button onClick={() => usun(k.id, k.name)}>Usuń</button>
              </div>
            </div>
          </div>
        ))
      )}
    </main>
  );
}
