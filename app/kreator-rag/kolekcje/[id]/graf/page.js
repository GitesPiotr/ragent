'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import GrafWiedzy from '@/app/kreator-rag/_components/GrafWiedzy.jsx';
import styles from '../../../kreator-rag.module.css';
import PrzyciskDiagnostyki from '@/app/kreator-rag/_components/PrzyciskDiagnostyki.jsx';

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
      <div className={styles["pasek-gorny"]}>
        {/* „Mapa fragmentow" PRZENIESIONA ZE SLADU DO PRZEJSC. Stala w sciezce
            jako rzekomy przodek grafu, a jest widokiem siostrzanym — z grafu
            nie wychodzi sie „w gore" do mapy, tylko w bok. */}
        <nav className={styles.nawigacja}>
          <div className={styles["nawigacja-slad"]}>
            <Link
              href="/kreator-rag/kolekcje"
              className={styles["nawigacja-powrot"]}
            >
              Kolekcje
            </Link>
            <Link
              href={`/kreator-rag/kolekcje/${id}`}
              className={styles["nawigacja-powrot"]}
            >
              {nazwa || 'Kolekcja'}
            </Link>
            <span className={styles["nawigacja-miejsce"]}>Graf wiedzy</span>
          </div>
          <div className={styles["nawigacja-widoki"]}>
            <Link
              href={`/kreator-rag/kolekcje/${id}/mapa`}
              className={styles["nawigacja-widok"]}
            >
              Mapa fragmentów →
            </Link>
          </div>
        </nav>
        <PrzyciskDiagnostyki />
      </div>

      <h1>Graf wiedzy{nazwa ? ` — ${nazwa}` : ''}</h1>
      <p className={styles.podtytul}>
        Węzły to dokumenty i pojęcia. Krawędź znaczy „to pojęcie występuje w tym dokumencie",
        a jej grubość — w ilu fragmentach. Fragmenty pojawiają się po kliknięciu pojęcia.
      </p>

      <GrafWiedzy collectionId={id} />
    </main>
  );
}
