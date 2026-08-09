"use client";

import Link from "next/link";
import panel from "../../kreator-rag.module.css";
import styles from "../samouczek.module.css";

// SAMOUCZEK „Jak przygotować dokumenty".
//
// Komponent KLIENCKI, choć na tym etapie nic tu jeszcze nie klika: demo cięcia,
// rozwijane zasady i lista kontrolna dochodzą w kolejnych krokach i wszystkie
// potrzebują stanu. Rozdzielenie teraz oszczędza przenoszenia treści później.
//
// LICZBY PRZYCHODZĄ Z ZEWNĄTRZ, w propsach. Nie da się ich odczytać tutaj:
// lib/rag/config.js zaczyna się od `import 'server-only'`, więc próba wciągnięcia
// go do komponentu klienckiego wywala budowanie. Czyta je strona serwerowa
// (page.js) i podaje dalej — dzięki temu instrukcja nie może zacząć kłamać po
// zmianie konfiguracji.

export function Samouczek({ rozmiarFragmentu }) {
  return (
    <div className={styles.samouczek}>
      {/* Pasek trzech ról, jak w reszcie modułu: droga powrotna, bieżące
          miejsce, przejście w bok. Struktura z kreator-rag.module.css (strzałka
          jest doklejana przez .nawigacja-powrot::before), kolory przypięte
          w naszym arkuszu, bo tamte idą za motywem, a ten ekran jest zawsze
          ciemny. */}
      <nav className={panel.nawigacja}>
        <div className={panel["nawigacja-slad"]}>
          <Link
            href="/kreator-rag"
            className={`${panel["nawigacja-powrot"]} ${styles.nawigacjaOdnosnik}`}
          >
            Kreator RAG
          </Link>
          <span className={styles.nawigacjaMiejsce}>Jak przygotować dokumenty</span>
        </div>
        <div className={panel["nawigacja-widoki"]}>
          <Link
            href="/kreator-rag/kolekcje"
            className={`${panel["nawigacja-widok"]} ${styles.nawigacjaOdnosnik}`}
          >
            Kolekcje →
          </Link>
        </div>
      </nav>

      <header className={styles.naglowek}>
        <div className={styles.nadtytul}>Kreator RAG · zanim wgrasz pliki</div>
        <h1 className={styles.tytul}>Jak przygotować dokumenty</h1>
        <p>
          Pięć minut czytania, które decyduje o tym, czy agent będzie odpowiadał
          z twoich dokumentów, czy zmyślał.
        </p>
      </header>

      <section className={`${styles.sekcja} ${styles.sekcjaPierwsza}`}>
        <h2 className={styles.podtytulSekcji}>Czym jest RAG</h2>

        <div className={styles.wyjasnienie}>
          <p>
            Model językowy zna to, czego nauczył się w trakcie treningu. Nie zna
            twojego regulaminu, notatek ze spotkań ani cennika — a zapytany o nie
            potrafi odpowiedzieć pewnym tonem i nieprawdziwie.
          </p>
          <p>
            <strong>RAG to danie modelowi wyszukiwarki do twoich dokumentów.</strong>{" "}
            Zanim odpowie, przeszukuje je i buduje odpowiedź z tego, co faktycznie
            znalazł. Nie z pamięci, tylko z twojego pliku.
          </p>
          <div className={styles.rozwiniecie}>
            RAG = retrieval-augmented generation, czyli „odpowiadanie wsparte
            wyszukiwaniem”. W skrócie: agent najpierw szuka, potem mówi.
          </div>
        </div>

        <div className={styles.kroki}>
          <div className={styles.krok}>
            <span className={styles.krokNr}>01</span>
            <h3>Wgrywasz dokumenty</h3>
            <p>
              Aplikacja wyciąga z pliku tekst i dzieli go na fragmenty po mniej
              więcej {rozmiarFragmentu} znaków.
            </p>
          </div>
          <div className={styles.krok}>
            <span className={styles.krokNr}>02</span>
            <h3>Indeksujesz kolekcję</h3>
            <p>
              Osobny krok, osobny przycisk. Każdy fragment dostaje zapis liczbowy
              opisujący jego znaczenie — dopiero to czyni go przeszukiwalnym.
            </p>
          </div>
          <div className={styles.krok}>
            <span className={styles.krokNr}>03</span>
            <h3>Agent szuka i odpowiada</h3>
            <p>
              Przy pytaniu wybiera kilka najbliższych fragmentów i odpowiada na ich
              podstawie, podając plik i sekcję.
            </p>
          </div>
        </div>

        {/* Zdanie wzięte z realnego komunikatu aplikacji — kolekcje/[id]/page.js
            pokazuje po przecięciu „Dokument nie ma wektorów — kliknij «Indeksuj»".
            To najczęstsze potknięcie, więc dostaje własną ramkę, nie przypis. */}
        <div className={styles.uwaga}>
          <span className={styles.uwagaTytul}>Samo wgranie nie wystarczy</span>
          <p>
            Po wgraniu plików kolekcja jeszcze nie działa — dokumenty są pocięte,
            ale niewyszukiwalne. Trzeba kliknąć <strong>Indeksuj</strong>. To
            najczęstszy powód, dla którego agent „nie widzi” dokumentów, które
            przecież zostały wgrane.
          </p>
        </div>

        <p className={`${styles.wstep} ${styles.wstepPoUwadze}`}>
          Agent zobaczy tylko te fragmenty, które wyszukiwarka uzna za pasujące.
          A fragmenty powstają z twoich plików — dlatego to, jak je przygotujesz,
          przekłada się wprost na jakość odpowiedzi.
        </p>
      </section>
    </div>
  );
}
