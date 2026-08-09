"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEMO, PYTANIA, podzielNaWyroznienia } from "../_lib/demoFragmenty.js";
import { FORMATY_OPIS, KONTROLNA, NIEOBSLUGIWANE, ZASADY } from "../_lib/zasady.js";
import panel from "../../kreator-rag.module.css";
import styles from "../samouczek.module.css";

const ZNACZNIK_KLASA = {
  pewne: "znacznikPewne",
  zgadywane: "znacznikZgadywane",
  brak: "znacznikBrak",
};

// Jedna zasada. Nagłówek jest przyciskiem, treść rozwija się pod nim —
// renderowana warunkowo, a nie chowana CSS-em, żeby nie trzymać w drzewie
// pięciu bloków tekstu, z których widać jeden.
function Zasada({ dane, otwarta, przelacz }) {
  return (
    <div className={styles.zasada}>
      <button
        type="button"
        className={styles.zasadaGlowa}
        aria-expanded={otwarta}
        onClick={przelacz}
      >
        <span className={styles.zasadaNazwa}>{dane.nazwa}</span>
        {dane.skrot ? <span className={styles.zasadaSkrot}>{dane.skrot}</span> : null}
        <span className={styles.zasadaZnak} aria-hidden="true">
          {otwarta ? "−" : "+"}
        </span>
      </button>

      {otwarta ? (
        <div className={styles.zasadaTresc}>
          <p>{dane.opis}</p>
          <div className={styles.porownanie}>
            <div className={`${styles.probka} ${styles.probkaZle}`}>
              <span className={styles.probkaMetka}>Źle</span>
              <pre>{dane.zle}</pre>
            </div>
            <div className={`${styles.probka} ${styles.probkaDobrze}`}>
              <span className={styles.probkaMetka}>Dobrze</span>
              <pre>{dane.dobrze}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Jeden fragment dokumentu w demo. Wyróżnienie idzie przez podzielNaWyroznienia,
// a nie przez wstrzykiwanie HTML-a — dane są czystym tekstem.
function Fragment({ dane, numer, trafiony }) {
  return (
    <div className={`${styles.fragment} ${trafiony ? styles.trafiony : ""}`}>
      <span className={styles.fragmentNr}>{String(numer).padStart(2, "0")}</span>
      {dane.tytul ? <span className={styles.fragmentTytul}>{dane.tytul}</span> : null}
      {podzielNaWyroznienia(dane.tekst, dane.wyroznij).map((cz, i) =>
        cz.wyrozniony ? (
          <mark key={i} className={styles.wyroznione}>
            {cz.tekst}
          </mark>
        ) : (
          <span key={i}>{cz.tekst}</span>
        )
      )}
    </div>
  );
}

function Werdykt({ odpowiedz }) {
  if (!odpowiedz) {
    return (
      <div className={`${styles.werdykt} ${styles.werdyktPusty}`}>
        Wybierz pytanie, żeby zobaczyć wynik.
      </div>
    );
  }
  const wariant = odpowiedz.ok ? styles.werdyktTak : styles.werdyktNie;
  return (
    <div className={`${styles.werdykt} ${wariant}`} role="status">
      <b>{odpowiedz.tytul}</b>
      {odpowiedz.tresc}
    </div>
  );
}

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

export function Samouczek({ rozmiarFragmentu, progTwardegoCiecia, limitMb }) {
  // Dwa stany demo. Prototyp trzymał je w zmiennych modułu i przerysowywał
  // ręcznie; tutaj wystarczy React.
  const router = useRouter();
  const [wersja, setWersja] = useState("zle");
  const [pytanie, setPytanie] = useState(null);
  // Pierwsza zasada rozwinięta od startu — to ta o nagłówkach, czyli jedyna
  // rzecz, którą aplikacja naprawdę dokleja do fragmentu przy indeksowaniu.
  const [rozwiniete, setRozwiniete] = useState(() => new Set([ZASADY[0].id]));
  const [zaznaczone, setZaznaczone] = useState(() => new Set());

  const przelaczZasade = (id) =>
    setRozwiniete((biezace) => {
      const nowe = new Set(biezace);
      if (nowe.has(id)) nowe.delete(id);
      else nowe.add(id);
      return nowe;
    });

  const przelaczPozycje = (i) =>
    setZaznaczone((biezace) => {
      const nowe = new Set(biezace);
      if (nowe.has(i)) nowe.delete(i);
      else nowe.add(i);
      return nowe;
    });

  const komplet = zaznaczone.size === KONTROLNA.length;

  const dane = DEMO[wersja];
  const odpowiedz = pytanie ? dane.odp[pytanie] : null;
  const trafiony = odpowiedz ? odpowiedz.trafiony : -1;

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

      <section className={styles.sekcja}>
        <h2 className={styles.podtytulSekcji}>Tak agent czyta twój dokument</h2>
        <p className={styles.wstep}>
          Agent nie czyta pliku w całości — dostaje pojedyncze fragmenty, które
          wyszukiwarka uznała za pasujące. Ten sam regulamin, dwa sposoby
          zapisania. Kliknij pytanie i zobacz, co wraca.
        </p>

        <div className={styles.demo}>
          <div className={styles.demoPasek}>
            <span className={`${styles.etykieta} ${styles.etykietaPliku}`}>
              regulamin-pracy.docx
            </span>
            {/* aria-pressed, a nie zaznaczenie kolorem: dwa przyciski wykluczają
                się nawzajem, więc czytnik ekranu ma wiedzieć, który jest włączony. */}
            <button
              type="button"
              className={styles.przelacznik}
              aria-pressed={wersja === "zle"}
              onClick={() => setWersja("zle")}
            >
              Bez nagłówków
            </button>
            <button
              type="button"
              className={styles.przelacznik}
              aria-pressed={wersja === "dobrze"}
              onClick={() => setWersja("dobrze")}
            >
              Z nagłówkami
            </button>
          </div>

          <div className={styles.demoCialo}>
            <div className={styles.dokument}>
              {dane.fragmenty.map((f, i) => (
                <Fragment key={i} dane={f} numer={i + 1} trafiony={i === trafiony} />
              ))}
            </div>

            <div className={styles.panelPytan}>
              <div className={`${styles.etykieta} ${styles.etykietaPytan}`}>
                Zapytaj agenta
              </div>
              {PYTANIA.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={styles.pytanie}
                  aria-pressed={pytanie === p.id}
                  // Drugie kliknięcie w to samo pytanie gasi wynik — inaczej
                  // nie dałoby się wrócić do stanu wyjściowego bez odświeżenia.
                  onClick={() => setPytanie((biezace) => (biezace === p.id ? null : p.id))}
                >
                  {p.tresc}
                </button>
              ))}
              <Werdykt odpowiedz={odpowiedz} />
            </div>
          </div>
        </div>

        <p className={styles.podDemo}>
          Fragmenty skrócone dla czytelności. W aplikacji mają około{" "}
          {rozmiarFragmentu} znaków, a akapit nigdy nie jest przecinany w środku —
          chyba że sam przekracza {progTwardegoCiecia} znaków.
        </p>
      </section>

      <section className={styles.sekcja}>
        <h2 className={styles.podtytulSekcji}>Pięć rzeczy, które robią różnicę</h2>
        <p className={styles.wstep}>
          Wszystkie sprowadzają się do jednego: fragment musi być zrozumiały sam
          z siebie, bez reszty dokumentu.
        </p>

        <div className={styles.zasady}>
          {ZASADY.map((z) => (
            <Zasada
              key={z.id}
              dane={z}
              otwarta={rozwiniete.has(z.id)}
              przelacz={() => przelaczZasade(z.id)}
            />
          ))}
        </div>
      </section>

      <section className={styles.sekcja}>
        <h2 className={styles.podtytulSekcji}>Formaty, które aplikacja czyta</h2>
        {/* Bez liczebnika w tekście: lista formatów jest pilnowana testem wobec
            FORMATY z extract.js, więc mogłaby się kiedyś zmienić — a „pięć"
            trzeba by wtedy odmienić ręcznie. Tabela i tak je wylicza. */}
        <p className={styles.wstep}>
          Formaty różnią się nie tym, <em>czy</em> zostaną przeczytane, tylko tym,
          czy aplikacja rozpozna w nich strukturę — a od tego zależy trafność
          wyszukiwania.
        </p>

        <table className={styles.tabelaFormatow}>
          <thead>
            <tr>
              <th>Format</th>
              <th>Jak jest czytany</th>
              <th>Rozpoznawanie nagłówków</th>
            </tr>
          </thead>
          <tbody>
            {FORMATY_OPIS.map((f) => (
              <tr key={f.ext}>
                <td className={styles.fmt}>{f.ext}</td>
                <td>{f.czytanie}</td>
                <td>
                  <span className={`${styles.znacznik} ${styles[ZNACZNIK_KLASA[f.pewnosc]]}`}>
                    {f.etykieta}
                  </span>
                  {/* Części: zwykły napis albo { kod } — patrz komentarz przy
                      FORMATY_OPIS. Znaki # i ## muszą być widoczne jako
                      dosłowne znaki, bo o nich właśnie mówi ta kolumna. */}
                  {f.naglowki.map((cz, i) =>
                    typeof cz === "string" ? (
                      <span key={i}>{cz}</span>
                    ) : (
                      <code key={i} className={styles.kod}>
                        {cz.kod}
                      </code>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.nieczyta}>
          <span className={styles.nieczytaTytul}>Tych aplikacja nie przyjmie</span>
          <p>
            Wgranie zakończy się komunikatem o nieobsługiwanym formacie. Zapisz plik
            w jednym z powyższych — Word i większość narzędzi ma „Zapisz jako”.
            Sama zmiana rozszerzenia w nazwie nie wystarczy.
          </p>
          <div className={styles.nieczytaLista}>{NIEOBSLUGIWANE.join(" · ")}</div>
        </div>

        <div className={styles.uwaga}>
          <span className={styles.uwagaTytul}>
            Skan wgra się bez błędu — i będzie pusty
          </span>
          <p>
            PDF, który powstał ze skanera albo ze zdjęcia, jest dla aplikacji
            obrazkiem. Nie ma w nim tekstu do przeczytania, a aplikacja nie
            rozpoznaje pisma z obrazu.
          </p>
          <p>
            Nie zobaczysz czerwonego błędu — plik zostanie przyjęty, a przy
            dokumencie pojawi się znacznik <code className={styles.kod}>brak tekstu</code>{" "}
            i informacja, że nie ma fragmentów.{" "}
            <strong>Sprawdź to zawsze po wgraniu.</strong> Prosty test wcześniej:
            otwórz plik i spróbuj zaznaczyć zdanie myszą. Jeśli się nie da — to skan.
          </p>
        </div>

        <div className={styles.uwaga}>
          <span className={styles.uwagaTytul}>Limit {limitMb} MB na plik</span>
          <p>
            Sprawdzany po tym, jak plik dotrze na serwer — przy bardzo dużym pliku
            odczekasz całą wysyłkę, zanim zobaczysz odmowę. Liczby plików
            w kolekcji nic nie ogranicza.
          </p>
        </div>
      </section>

      <section className={styles.sekcja}>
        <h2 className={styles.podtytulSekcji}>Sprawdź, zanim wgrasz</h2>
        <p className={styles.wstep}>
          Jeśli na każde odpowiesz twierdząco, możesz wgrywać. Licznik pod listą
          pokazuje, ile zostało.
        </p>

        <div className={styles.kontrolna}>
          {KONTROLNA.map((tresc, i) => (
            <div
              key={i}
              className={`${styles.pozycja} ${zaznaczone.has(i) ? styles.zaznaczona : ""}`}
              role="checkbox"
              tabIndex={0}
              aria-checked={zaznaczone.has(i)}
              onClick={() => przelaczPozycje(i)}
              // Spacja i Enter, bo div z role="checkbox" nie dostaje tego
              // od przeglądarki tak jak <input type="checkbox">.
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  przelaczPozycje(i);
                }
              }}
            >
              <span className={styles.pudelko} aria-hidden="true">
                ✓
              </span>
              <span className={styles.pozycjaOpis}>{tresc}</span>
            </div>
          ))}
        </div>

        <div className={styles.stopka}>
          <span className={styles.postep}>
            {zaznaczone.size} z {KONTROLNA.length}
          </span>
          <Link href="/kreator-rag" className={styles.btnCichy}>
            Wróć do tego później
          </Link>
          <button
            type="button"
            className={styles.btnGlowny}
            disabled={!komplet}
            onClick={() => router.push("/kreator-rag/kolekcje")}
          >
            Wgraj dokumenty
          </button>
        </div>
      </section>
    </div>
  );
}
