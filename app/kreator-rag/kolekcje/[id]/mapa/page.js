'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import MapaFragmentow from '@/app/kreator-rag/_components/MapaFragmentow.jsx';
import styles from '../../../kreator-rag.module.css';
import PrzyciskDiagnostyki from '@/app/kreator-rag/_components/PrzyciskDiagnostyki.jsx';

// Pełnoekranowa mapa fragmentów — OTOCZKA. Cała mapa (dane, rysowanie, interakcja,
// pętla indeksowania) siedzi w MapaFragmentow, bo ten sam komponent jest osadzony
// w prawej kolumnie strony kolekcji. Tutaj zostaje wyłącznie chrom strony:
// nawigacja i tytuł. Zero kodu rysującego — jedna implementacja, dwa miejsca użycia.
//
// TRYB OKNA (?okno=1). Ta sama trasa obsługuje dwa układy:
//   • bez parametru — strona jak dotąd, `.strona-szeroka` (max-width 1180px),
//     płótno 560px. Odnośnik „Pełny ekran →" prowadzi właśnie tutaj i NIC
//     nie traci;
//   • z parametrem — układ na całe okno, bez nawigacji i bez tytułu, płótno
//     liczone z viewportu.
//
// Chrom znika w trybie okna ŚWIADOMIE. Osobne okno mapy nie jest miejscem, z
// którego wraca się do listy kolekcji — okruszki zabierałyby wysokość płótna,
// czyli dokładnie to, po co się to okno otwiera.

export default function MapaPage() {
  // BARIERA SUSPENSE JEST WYMOGIEM, NIE OZDOBĄ. useSearchParams w komponencie
  // klienckim przy prerenderingu przerzuca drzewo aż do najbliższej bariery na
  // render po stronie klienta, a jej brak wywraca build produkcyjny błędem
  // „Missing Suspense boundary with useSearchParams" (docs: 01-app/03-api-reference/
  // 04-functions/use-search-params.md:179). W dev nie widać tego wcale, bo trasy
  // renderują się na żądanie — dokładnie ten sam wykop, co przy formularzu
  // logowania (commit fa27fac).
  return (
    <Suspense fallback={<MapaPusta />}>
      <MapaZParametrem />
    </Suspense>
  );
}

// Zastępka na czas rozstrzygania parametru. Świadomie pusta i bez ramki: pojawia
// się na ułamek sekundy, a mignięcie szkieletem mapy byłoby gorsze niż nic.
function MapaPusta() {
  return <main className={styles["strona-szeroka"]} />;
}

function MapaZParametrem() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id;
  const trybOkna = searchParams.get('okno') === '1';
  const [nazwa, setNazwa] = useState(null);

  // Sama nazwa kolekcji do nagłówka i okruszków. Mapa i tak pobiera kolekcję dla
  // siebie (potrzebuje embedDim do zastrzeżenia), ale wciąganie jej stanu do otoczki
  // przez wywołanie zwrotne kosztowałoby więcej niż to jedno lekkie żądanie.
  //
  // W trybie okna tytuł nie jest rysowany, ale trafia do title dokumentu — okno
  // bez paska zakładek ma tylko tę jedną etykietę.
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

  useEffect(() => {
    if (!trybOkna) return;
    document.title = nazwa ? `Mapa fragmentów — ${nazwa}` : 'Mapa fragmentów';
  }, [trybOkna, nazwa]);

  if (trybOkna) {
    return (
      <main className={styles["strona-okno"]}>
        <MapaFragmentow collectionId={id} trybOkna />
      </main>
    );
  }

  return (
    <main className={styles["strona-szeroka"]}>
      <div className={styles["pasek-gorny"]}>
        <nav className={styles.nawigacja}>
          <Link href="/kreator-rag/kolekcje">Kolekcje</Link>
          <Link href={`/kreator-rag/kolekcje/${id}`}>{nazwa || 'Kolekcja'}</Link>
          <span className={styles.aktywny}>Mapa</span>
        </nav>
        <PrzyciskDiagnostyki />
      </div>

      <h1>Mapa fragmentów{nazwa ? ` — ${nazwa}` : ''}</h1>

      <MapaFragmentow collectionId={id} />
    </main>
  );
}
