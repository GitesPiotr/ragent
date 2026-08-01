'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import GrafWiedzy from '@/app/kreator-rag/_components/GrafWiedzy.jsx';
import styles from '../../../kreator-rag.module.css';

// Graf wiedzy — OTOCZKA, ten sam wzorzec co strona mapy: cała robota (dane,
// fizyka, rysowanie, rozwijanie pojęć) siedzi w GrafWiedzy, tutaj zostaje
// wyłącznie chrom strony. Zero kodu rysującego.

export default function GrafPage() {
  const params = useParams();
  const id = params.id;
  const [nazwa, setNazwa] = useState(null);

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
        <Link href={`/kreator-rag/kolekcje/${id}/mapa`}>Mapa</Link>
        <span className={styles.aktywny}>Graf</span>
      </nav>

      <h1>Graf wiedzy{nazwa ? ` — ${nazwa}` : ''}</h1>
      <p className={styles.podtytul}>
        Węzły to dokumenty i pojęcia. Krawędź znaczy „to pojęcie występuje w tym dokumencie",
        a jej grubość — w ilu fragmentach. Fragmenty pojawiają się po kliknięciu pojęcia.
      </p>

      <GrafWiedzy collectionId={id} />
    </main>
  );
}
