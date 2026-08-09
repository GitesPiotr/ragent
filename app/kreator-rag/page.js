import Link from "next/link";
import styles from "./wejscie.module.css";

// EKRAN WEJŚCIOWY KRETORA RAG. Dwie karty: instrukcja i praca.
//
// ────────────────────────────────────────────────────────────────────────────
// DO SESJI 0 była tu diagnostyka, potem — do tej zmiany — przekierowanie na
// /kreator-rag/kolekcje. Poprzedni komentarz w tym pliku uzasadniał je zdaniem
// „wchodzi się tu po kolekcje" i było to słuszne, dopóki moduł nie miał nic
// przed listą. Teraz ma: wchodzi się tu po WYBÓR — przeczytać instrukcję albo
// iść do pracy.
//
// Argument z tamtego komentarza, który NADAL obowiązuje i którego ta zmiana nie
// łamie: ta sama treść nie może wisieć pod dwoma adresami. /kreator-rag pokazuje
// coś INNEGO niż /kreator-rag/kolekcje, więc hierarchia zostaje czytelna:
//   /kreator-rag            wybór
//   /kreator-rag/samouczek  instrukcja
//   /kreator-rag/kolekcje   lista, i dalej /kolekcje/[id], /mapa, /graf
//
// Odnośnik w pasku bocznym celuje w /kreator-rag — patrz Sidebar.js.
// ────────────────────────────────────────────────────────────────────────────
//
// KOMPONENT SERWEROWY. Nie ma tu stanu ani zdarzeń: obie karty są odnośnikami.
// Licznik kolekcji dochodzi osobno, jako wyspa kliencka.
//
// KARTY SĄ <Link>, NIE <button> — odstępstwo od prototypu, opisane w treści
// commita. Prototyp jest plikiem otwieranym z dysku i nie ma dokąd prowadzić,
// więc użył przycisków. Tutaj to nawigacja: odnośnik daje otwarcie w nowej
// karcie, podgląd celu na pasku stanu i właściwe znaczenie dla czytnika ekranu.
// Przy okazji znika cała kolizja z regułami .panel button.

export const metadata = {
  title: "Kreator RAG — RAGent",
};

export default function KreatorRagPage() {
  return (
    <div className={styles.wejscie}>
      <header className={styles.naglowek}>
        <div className={styles.nadtytul}>Obszar roboczy · Kreator RAG</div>
        <h1 className={styles.tytul}>Baza wiedzy dla twoich agentów</h1>
        <p>
          Wgraj własne dokumenty, żeby agent odpowiadał z nich, a nie z pamięci
          modelu. Zacznij od instrukcji — pięć minut oszczędzi ci godziny
          zgadywania, dlaczego agent nie znajduje odpowiedzi.
        </p>
      </header>

      <div className={styles.karty}>
        {/* Instrukcja jest wyróżniona ZAWSZE, także dla kogoś, kto ma już
            kolekcje. Kto nie chce czytać, klika kartę obok — jedno kliknięcie,
            żadnej blokady. */}
        <Link href="/kreator-rag/samouczek" className={`${styles.karta} ${styles.wyrozniona}`}>
          <span className={styles.metka}>Zacznij tutaj</span>

          <div className={styles.znak}>
            {/* Dokument cięty na fragmenty. Kolory wpisane wprost — ekran jest
                zawsze ciemny, więc nie ma czego parametryzować. */}
            <svg width="72" height="52" viewBox="0 0 72 52" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="30" height="50" rx="4" stroke="#213B63" />
              <path d="M8 11h16M8 18h16M8 25h11" stroke="#7890AA" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M8 34h16M8 41h13" stroke="#7890AA" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M36 26h8" stroke="#35DCFF" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M41 22l4 4-4 4" stroke="#35DCFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="50" y="4" width="21" height="13" rx="3" stroke="#35DCFF" strokeOpacity=".55" />
              <rect x="50" y="20" width="21" height="13" rx="3" stroke="#35DCFF" strokeOpacity=".55" />
              <rect x="50" y="36" width="21" height="13" rx="3" stroke="#35DCFF" strokeOpacity=".55" />
            </svg>
          </div>

          <h2>Jak przygotować dokumenty</h2>
          <p className={styles.opisKarty}>
            Agent nie czyta plików w całości — dostaje pojedyncze fragmenty. Od
            tego, jak wygląda twój dokument, zależy, czy w ogóle znajdzie
            odpowiedź.
          </p>

          <ul className={styles.punkty}>
            <li>Które formaty aplikacja czyta, a których nie przyjmie</li>
            <li>Dlaczego skan wgra się bez błędu i będzie pusty</li>
            <li>Co zrobić w Wordzie, żeby nagłówki działały</li>
            <li>Lista kontrolna przed wgraniem</li>
          </ul>

          <div className={styles.dolKarty}>
            <span className={styles.przycisk}>Czytaj instrukcję</span>
            <span className={styles.czas}>≈ 5 minut</span>
          </div>
        </Link>

        <Link href="/kreator-rag/kolekcje" className={styles.karta}>
          <span className={styles.metka}>Do pracy</span>

          <div className={styles.znak}>
            {/* Graf wektorowy. Fiolet znaczy model, cyjan — maszynę. */}
            <svg width="72" height="52" viewBox="0 0 72 52" fill="none" aria-hidden="true">
              <path
                d="M14 38L26 20M26 20L44 14M44 14L58 28M26 20L38 36M38 36L58 28M14 38L38 36"
                stroke="#213B63"
                strokeWidth="1.3"
              />
              <circle cx="14" cy="38" r="4" fill="#0C1428" stroke="#35DCFF" strokeWidth="1.5" />
              <circle cx="26" cy="20" r="4" fill="#0C1428" stroke="#35DCFF" strokeWidth="1.5" />
              <circle cx="44" cy="14" r="4" fill="#0C1428" stroke="#8A6CFF" strokeWidth="1.5" />
              <circle cx="58" cy="28" r="4" fill="#0C1428" stroke="#35DCFF" strokeWidth="1.5" />
              <circle cx="38" cy="36" r="4" fill="#0C1428" stroke="#8A6CFF" strokeWidth="1.5" />
              <circle cx="66" cy="45" r="2" fill="#35DCFF" fillOpacity=".5" />
              <circle cx="6" cy="14" r="2" fill="#8A6CFF" fillOpacity=".5" />
            </svg>
          </div>

          <h2>Zbuduj bazę wektorową</h2>
          <p className={styles.opisKarty}>
            Załóż kolekcję, wgraj dokumenty i zindeksuj je. Po tym kroku możesz
            podpiąć bazę do dowolnego agenta i zacząć z nim rozmawiać.
          </p>

          <ul className={styles.punkty}>
            <li>Kolekcja, dokumenty, indeksowanie</li>
            <li>Mapa fragmentów i graf pojęć na żywo</li>
            <li>Test wyszukiwania przed podpięciem do agenta</li>
          </ul>

          <div className={styles.dolKarty}>
            <span className={styles.przyciskCichy}>Otwórz Kreator RAG</span>
          </div>

          <div className={styles.stanKolekcji}>Nie masz jeszcze żadnej kolekcji.</div>
        </Link>
      </div>

      <div className={styles.przypis}>
        <b>Zanim wgrasz pliki:</b> najczęstszy powód, dla którego agent „nie
        widzi” dokumentów, to pominięte indeksowanie. Wgranie tworzy fragmenty,
        ale przeszukiwalne stają się dopiero po kliknięciu <b>Indeksuj</b>.
      </div>
    </div>
  );
}
