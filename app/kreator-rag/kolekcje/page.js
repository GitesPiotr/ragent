'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { komunikatBledu } from '@/app/kreator-rag/_lib/bledy.js';
import {
  MODELE_EMBEDDINGOW,
  DOMYSLNY_MODEL_EMBEDDINGOW,
} from '@/lib/config/modeleEmbeddingow.js';
import { POKAZ_DOSTAWCE_LOKALNA } from '@/lib/config/models';
import styles from '../kreator-rag.module.css';
import PrzyciskDiagnostyki from '@/app/kreator-rag/_components/PrzyciskDiagnostyki.jsx';

// =============================================================================
//  TRYB POKAZU — NAJGROŹNIEJSZE Z CZTERECH MIEJSC
//
//  Wariant lokalny jest tu oznaczony `domyslny: true`, więc bez tej zmiany
//  formularz podpowiadałby zakładanie kolekcji na Ollamie — a wybór modelu
//  embeddingów jest NIEODWRACALNY: para trafia do kolekcji na stałe i pilnuje
//  jej strażnik zgodności. Kolekcja założona przez pomyłkę na modelu lokalnym
//  jest na pokazie bez Ollamy nie do zaindeksowania i nie do przeszukania.
//
//  LISTY `MODELE_EMBEDDINGOW` NIE RUSZAM, i to jest istotne: czyta ją także
//  walidacja po stronie serwera (app/api/rag/collections/route.js) oraz test
//  lib/config/modeleEmbeddingow.test.js, który wprost sprawdza, że pozycje są
//  dwie i że domyślna jest lokalna. Zawężenie tam wywróciłoby zestaw testów
//  i odrzucałoby pary, które w bazie już istnieją. Filtrujemy WIDOK.
//
//  Istniejących kolekcji lokalnych to nie dotyka — one biorą swoją parę
//  z bazy, nie z tej listy.
// =============================================================================
const MODELE_EMBEDDINGOW_WIDOCZNE = POKAZ_DOSTAWCE_LOKALNA
  ? MODELE_EMBEDDINGOW
  : MODELE_EMBEDDINGOW.filter((m) => m.provider !== 'ollama');

// Domyślny musi pochodzić Z WIDOCZNYCH, inaczej formularz startowałby
// z zaznaczeniem, którego nie ma na liście — czyli z pustym radiogroup.
const DOMYSLNY_WIDOCZNY =
  MODELE_EMBEDDINGOW_WIDOCZNE.find((m) => m.domyslny) ||
  MODELE_EMBEDDINGOW_WIDOCZNE[0] ||
  DOMYSLNY_MODEL_EMBEDDINGOW;

// UI nigdy nie sięga do bazy ani do rdzenia — wyłącznie przez /api/rag/collections*.

function Nawigacja() {
  return (
    <div className={styles["pasek-gorny"]}>
      {/* Korzen modulu — nie ma dokad wracac ani w bok. Sam slad z biezacym
          miejscem, zeby pasek wygladal tak samo jak na pozostalych stronach. */}
      <nav className={styles.nawigacja}>
        <div className={styles["nawigacja-slad"]}>
          <span className={styles["nawigacja-miejsce"]}>Kolekcje</span>
        </div>
      </nav>
      <PrzyciskDiagnostyki />
    </div>
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
  // Wybrana para trzymana jako JEDNA wartość „provider/model", nie dwa stany.
  // Dwa stany dałoby się ustawić niezależnie i powstałaby para spoza oferty
  // (np. openrouter + bge-m3), której serwer i tak nie przyjmie — lepiej,
  // żeby taki stan był w interfejsie niewyrażalny.
  const [wybranyModel, setWybranyModel] = useState(
    `${DOMYSLNY_WIDOCZNY.provider}/${DOMYSLNY_WIDOCZNY.model}`,
  );
  const wybrany =
    MODELE_EMBEDDINGOW.find((m) => `${m.provider}/${m.model}` === wybranyModel) ||
    DOMYSLNY_WIDOCZNY;
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
          embedProvider: wybrany.provider,
          embedModel: wybrany.model,
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
      // Wybór modelu NIE jest czyszczony — kolejna kolekcja najczęściej ma
      // powstać na tym samym, a przestawienie z powrotem na domyślny byłoby
      // cichą zmianą decyzji, której nikt nie prosił.
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

          <fieldset className={styles["wybor-modelu"]}>
            <legend>Model embeddingów</legend>

            {/* KARTY, NIE LISTA ROZWIJANA — świadomie. Wybór jest
                nieodwracalny i wymaga przeczytania trzech rzeczy naraz
                (gdzie liczy, ile kosztuje, czego wymaga). Lista rozwijana
                pokazuje jedną linijkę i chowa resztę za kliknięciem, więc
                decyzję podejmowałoby się bez połowy przesłanek. */}
            <div className={styles["karty-modeli"]} role="radiogroup" aria-label="Model embeddingów">
              {MODELE_EMBEDDINGOW_WIDOCZNE.map((m) => {
                const klucz = `${m.provider}/${m.model}`;
                const zaznaczony = klucz === wybranyModel;
                return (
                  <label
                    key={klucz}
                    className={`${styles["karta-modelu"]} ${zaznaczony ? styles["karta-modelu-wybrana"] : ''}`}
                  >
                    <input
                      type="radio"
                      name="embedModel"
                      value={klucz}
                      checked={zaznaczony}
                      onChange={() => setWybranyModel(klucz)}
                    />
                    <span className={styles["karta-modelu-tresc"]}>
                      <span className={styles["karta-modelu-naglowek"]}>
                        <code>{m.etykieta}</code>
                        <span className={`${styles["znacznik-gdzie"]} ${m.provider === 'ollama' ? styles["gdzie-lokalny"] : styles["gdzie-chmura"]}`}>
                          {m.gdzie}
                        </span>
                        <span className={styles["znacznik-koszt"]}>{m.koszt}</span>
                      </span>
                      <span className={styles["karta-modelu-opis"]}>{m.opis}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            {/* OSTRZEŻENIE PRZY WYBORZE, NIE W PODPOWIEDZI — i mówi POWÓD,
                nie tylko fakt. „Nie da się zmienić" bez wyjaśnienia brzmi jak
                ograniczenie interfejsu, które ktoś kiedyś zniesie; „wektory
                z dwóch modeli są nieporównywalne" mówi, że to właściwość
                danych i że obejścia nie będzie. */}
            <p className={styles["ostrzezenie-nieodwracalne"]}>
              <strong>Tego wyboru nie da się później zmienić.</strong> Wektory
              policzone różnymi modelami są nieporównywalne — wyszukiwanie
              zestawia je ze sobą, więc pomieszanie dałoby wyniki przypadkowe,
              a nie gorsze. Zmiana modelu oznaczałaby przeliczenie wszystkich
              dokumentów tej kolekcji od nowa, dlatego kolekcja zapamiętuje parę
              dostawca + model na stałe.
            </p>
          </fieldset>

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
                {/* DOSTAWCA WIDOCZNY RAZEM Z MODELEM, bez wchodzenia w szczegóły.
                    Sam model nie wystarczy: „bge-m3" i „baai/bge-m3" to ten sam
                    plik wag dwiema drogami, a to od pary zależy, czy kolekcja
                    działa przy bieżącej konfiguracji. */}
                <div className={styles.detale}>
                  model:{' '}
                  <span className={`${styles["znacznik-gdzie"]} ${k.embedProvider === 'openrouter' ? styles["gdzie-chmura"] : styles["gdzie-lokalny"]}`}>
                    {k.embedProvider === 'openrouter' ? 'w chmurze' : 'lokalny'}
                  </span>{' '}
                  <code>{k.embedProvider}/{k.embedModel}</code> · wymiar: <code>{k.embedDim}</code>
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
