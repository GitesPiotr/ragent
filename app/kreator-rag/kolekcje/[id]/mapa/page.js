'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import MapaFragmentow from '@/app/kreator-rag/_components/MapaFragmentow.jsx';
import styles from '../../../kreator-rag.module.css';

// Pełnoekranowa mapa fragmentów — OTOCZKA. Cała mapa (dane, rysowanie, interakcja,
// pętla indeksowania) siedzi w MapaFragmentow, bo ten sam komponent jest osadzony
// w prawej kolumnie strony kolekcji. Tutaj zostaje wyłącznie chrom strony:
// nawigacja i tytuł. Zero kodu rysującego — jedna implementacja, dwa miejsca użycia.

export default function MapaPage() {
  const params = useParams();
  const id = params.id;
  const [nazwa, setNazwa] = useState(null);

  // Sama nazwa kolekcji do nagłówka i okruszków. Mapa i tak pobiera kolekcję dla
  // siebie (potrzebuje embedDim do zastrzeżenia), ale wciąganie jej stanu do otoczki
  // przez wywołanie zwrotne kosztowałoby więcej niż to jedno lekkie żądanie.
  useEffect(() => {
    let zywe = true;
    fetch(`/api/rag/collections/${id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (zywe && !j.error && j.collection) setNazwa(j.collection.name);
      })
      .catch(() => {});
    return () => {
      zywe = false;
    };
  }, [id]);

  return (
    <main className={styles["strona-szeroka"]}>
      <nav className={styles.nawigacja}>
        <Link href="/kreator-rag">Diagnostyka</Link>
        <Link href="/kreator-rag/kolekcje">Kolekcje</Link>
        <Link href={`/kreator-rag/kolekcje/${id}`}>{nazwa || 'Kolekcja'}</Link>
        <span className={styles.aktywny}>Mapa</span>
      </nav>

      <h1>Mapa fragmentów{nazwa ? ` — ${nazwa}` : ''}</h1>

      <MapaFragmentow collectionId={id} />
    </main>
  );
}
