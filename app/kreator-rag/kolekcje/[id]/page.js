'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useIndeksowanie } from '@/app/kreator-rag/_hooks/useIndeksowanie.js';
import { usePojecia } from '@/app/kreator-rag/_hooks/usePojecia.js';
import MapaFragmentow from '@/app/kreator-rag/_components/MapaFragmentow.jsx';
import { komunikatBledu } from '@/app/kreator-rag/_lib/bledy.js';
import styles from '../../kreator-rag.module.css';
import PrzyciskDiagnostyki from '@/app/kreator-rag/_components/PrzyciskDiagnostyki.jsx';

// Widok kolekcji: wgrywanie dokumentów + lista ze statusem + podgląd fragmentów.
// Wyłącznie przez fetch do /api/rag/* — zero importu z lib/rag/.
//
// Pętla indeksowania siedzi w useIndeksowanie — ta sama, której używa strona mapy.

const STATUS_ETYKIETY = {
  pending: 'oczekuje',
  extracting: 'ekstrakcja',
  chunking: 'cięcie',
  chunked: 'pocięty',
  embedding: 'embedding',
  ready: 'gotowy',
  no_text: 'brak tekstu',
  error: 'błąd',
};

function statusKlasa(status) {
  if (status === 'chunked' || status === 'ready') return 'ok';
  if (status === 'error') return 'blad';
  return 'nieznane';
}

// Kolor score to tylko podpowiedź wzrokowa przy strojeniu progu — liczba jest zawsze
// widoczna obok, bo to ona jest podstawą decyzji (redline 8).
function scoreKlasa(score) {
  if (score >= 0.6) return 'mocny';
  if (score >= 0.4) return 'sredni';
  return 'slaby';
}

// Ile trafień ściągać w trybie diagnostycznym — na tyle dużo, żeby było widać ogon
// poniżej progu, na tyle mało, żeby lista dała się przejrzeć wzrokiem.
const DIAGNOSTYKA_TOPK = 20;

export default function KolekcjaPage() {
  const params = useParams();
  const id = params.id;

  const [kolekcja, setKolekcja] = useState(null);
  const [dokumenty, setDokumenty] = useState([]);
  const [blad, setBlad] = useState(null);
  const [ladowanie, setLadowanie] = useState(true);
  const [plik, setPlik] = useState(null);
  const [wgrywanie, setWgrywanie] = useState(false);
  const [bladUpload, setBladUpload] = useState(null);
  const [fragmenty, setFragmenty] = useState({}); // documentId → chunks[]
  const [raportCiecia, setRaportCiecia] = useState(null); // co usunęła reguła żywych pagin
  const [usuwany, setUsuwany] = useState(null); // documentId w trakcie usuwania
  const [pojecia, setPojecia] = useState(null); // { concepts: [...] } albo null
  const [pojecieFragmenty, setPojecieFragmenty] = useState(null); // rozwinięte pojęcie
  const [raportScalen, setRaportScalen] = useState(null); // wynik normalizacji (Sesja 8)
  const [normalizacja, setNormalizacja] = useState(false);

  const {
    postep: postepPojec,
    wyciagaj: wyciagajPojeciaSurowe,
    przerwij: przerwijPojecia,
    wczytajPostep: wczytajPostepPojec,
  } = usePojecia();

  // pobierz() jest zdefiniowane niżej, a hook potrzebuje go w onKoniec — stąd ref.
  // Bez tego mielibyśmy cykl: hook → pobierz → wczytajPostep → hook.
  const pobierzRef = useRef(null);

  // Uchwyt do osadzonej mapy. Odpowiedzi /embed idą prosto do niej, więc kliknięcie
  // „Indeksuj" w liście po lewej dorysowuje punkty po prawej — bez drugiego źródła
  // danych i bez odpytywania. Mapa może jeszcze nie być wczytana (leniwe wczytanie),
  // dlatego zawsze sprawdzamy, czy uchwyt istnieje.
  const mapaRef = useRef(null);
  const zapiszApiMapy = useCallback((api) => {
    mapaRef.current = api;
  }, []);

  const { postep, indeksuj, przerwij, wczytajPostep, wyczyscPostep } = useIndeksowanie({
    onPartia: useCallback((json) => {
      if (mapaRef.current) mapaRef.current.naPartie(json);
    }, []),
    onKoniec: useCallback(async () => {
      if (pobierzRef.current) await pobierzRef.current();
    }, []),
  });

  // --- wyszukiwanie (Sesja 5) ---
  const [pytanie, setPytanie] = useState('');
  const [szukanie, setSzukanie] = useState(false);
  const [wyniki, setWyniki] = useState(null); // { hits, noResults, pytanie, diagnostyka }
  const [bladSzukania, setBladSzukania] = useState(null);
  const [diagnostyka, setDiagnostyka] = useState(false);
  const [filtrDok, setFiltrDok] = useState([]); // documentId[] — puste = cała kolekcja
  const [prog, setProg] = useState(null); // RAG_MIN_SCORE z serwera (do kreski odcięcia)

  const pobierz = useCallback(async () => {
    setLadowanie(true);
    setBlad(null);
    try {
      const [rk, rd] = await Promise.all([
        fetch(`/api/rag/collections/${id}`, { cache: 'no-store' }),
        fetch(`/api/rag/collections/${id}/documents`, { cache: 'no-store' }),
      ]);
      const jk = await rk.json();
      const jd = await rd.json();
      if (jk.error) { setBlad(komunikatBledu(jk.error)); return; }
      setKolekcja(jk.collection);
      const lista = jd.error ? [] : jd.documents || [];
      setDokumenty(lista);

      // Dokument w statusie 'embedding' to indeksowanie przerwane w połowie. Dociągnij
      // jego realny postęp z bazy, żeby po odświeżeniu strony karta pokazywała np. 4/7,
      // a nie pustkę — policzone wektory nadal tam są i użytkownik ma to widzieć.
      await wczytajPostep(
        lista.filter((d) => d.status === 'embedding' && d.chunkCount > 0).map((d) => d.id)
      );

      // To samo dla pojęć. Tu nie ma statusu, po którym dałoby się poznać przerwany
      // przebieg — pojęcia nie zmieniają `status` dokumentu — więc pytamy o wszystkie
      // gotowe dokumenty. Odczyt jest tani (dwa zapytania na dokument, bez modelu),
      // a bez niego dokument z 8 z 493 fragmentów wygląda po przeładowaniu
      // na nietknięty. Ta sama usterka co przy pasku embedowania w Sesji 4.
      await wczytajPostepPojec(
        id,
        lista.filter((d) => d.status === 'ready' && d.chunkCount > 0).map((d) => d.id)
      );
    } catch (err) {
      setBlad('Nie udało się pobrać danych: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    } finally {
      setLadowanie(false);
    }
  }, [id, wczytajPostep, wczytajPostepPojec]);

  // Hook woła pobierz() po zakończeniu dokumentu — przez ref, żeby nie zamykać się
  // na nieaktualnej wersji funkcji.
  useEffect(() => {
    pobierzRef.current = pobierz;
  }, [pobierz]);

  useEffect(() => {
    pobierz();
  }, [pobierz]);

  async function wgraj(e) {
    e.preventDefault();
    if (!plik) return;
    setBladUpload(null);
    setWgrywanie(true);
    try {
      const form = new FormData();
      form.append('file', plik);
      const res = await fetch(`/api/rag/collections/${id}/ingest`, { method: 'POST', body: form });
      const json = await res.json();
      if (json.error) {
        setBladUpload(komunikatBledu(json.error));
        return;
      }
      setPlik(null);
      // wyzeruj input pliku
      const input = document.getElementById('plik-input');
      if (input) input.value = '';
      await pobierz();
    } catch (err) {
      setBladUpload('Nie udało się wgrać pliku: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    } finally {
      setWgrywanie(false);
    }
  }

  // Usuwanie dokumentu to jedno żądanie, ale przy dużym dokumencie (CZ ma 1455
  // fragmentów) kaskada FK i skasowanie pliku trwają zauważalnie. Bez stanu zajętości
  // przycisk zostaje klikalny, a interfejs milczy — użytkownik klika drugi raz i leci
  // drugie DELETE, które odpowie not_found na już usunięty wiersz. Stąd `usuwany`.
  async function usunDokument(docId, nazwa, liczbaFragmentow) {
    const ostrzezenie = liczbaFragmentow > 500
      ? `\n\nDokument ma ${liczbaFragmentow} fragmentów — usuwanie może chwilę potrwać.`
      : '';
    if (!window.confirm(`Usunąć dokument „${nazwa}" wraz z jego fragmentami?${ostrzezenie}`)) return;
    setBlad(null);
    setUsuwany(docId);
    try {
      const res = await fetch(`/api/rag/documents/${docId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (json && json.error) { setBlad(komunikatBledu(json.error)); return; }
      await pobierz();
    } catch (err) {
      setBlad('Nie udało się usunąć dokumentu: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    } finally {
      setUsuwany(null);
    }
  }

  // --- pojęcia (Sesja 7) -----------------------------------------------------
  const pobierzPojecia = useCallback(async () => {
    try {
      const res = await fetch(`/api/rag/collections/${id}/concepts`, { cache: 'no-store' });
      const json = await res.json();
      if (json.error) { setBlad(komunikatBledu(json.error)); return; }
      setPojecia(json);
    } catch (err) {
      setBlad('Nie udało się pobrać pojęć: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    }
  }, [id]);

  // Po zakończeniu wyciągania lista musi się odświeżyć sama — inaczej użytkownik
  // patrzy na pasek, który doszedł do końca, i na pustą listę obok.
  async function wyciagajPojecia(collectionId, docId) {
    const wynik = await wyciagajPojeciaSurowe(collectionId, docId);
    if (wynik && wynik.ok) await pobierzPojecia();
  }

  async function normalizuj() {
    setNormalizacja(true);
    setBlad(null);
    try {
      const res = await fetch(`/api/rag/collections/${id}/concepts/normalize`, { method: 'POST' });
      const json = await res.json();
      if (json.error) { setBlad(komunikatBledu(json.error)); return; }
      setRaportScalen(json);
      // Scalanie zmienia listę i liczniki — bez odświeżenia użytkownik patrzy
      // na raport mówiący o scaleniu i na starą listę obok.
      setPojecieFragmenty(null);
      await pobierzPojecia();
      // ORAZ kolekcję — to ona niesie `normalizacjaOczekuje`. Bez tego ostrzeżenie
      // „scalanie oczekuje" wisiałoby nad raportem mówiącym, że scalanie właśnie
      // przeszło: widok przeczyłby sam sobie i uczyłby ignorować ten napis.
      await pobierz();
    } catch (err) {
      setBlad('Nie udało się znormalizować pojęć: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    } finally {
      setNormalizacja(false);
    }
  }

  async function przelaczPojecie(conceptId, label) {
    if (pojecieFragmenty && pojecieFragmenty.conceptId === conceptId) {
      setPojecieFragmenty(null);
      return;
    }
    try {
      const res = await fetch(`/api/rag/collections/${id}/concepts/${conceptId}/chunks`, { cache: 'no-store' });
      const json = await res.json();
      if (json.error) { setBlad(komunikatBledu(json.error)); return; }
      setPojecieFragmenty({ conceptId, label, ...json });
    } catch (err) {
      setBlad('Nie udało się pobrać fragmentów pojęcia: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    }
  }

  async function przelaczFragmenty(docId) {
    if (fragmenty[docId]) {
      setFragmenty((f) => ({ ...f, [docId]: undefined }));
      return;
    }
    try {
      const res = await fetch(`/api/rag/documents/${docId}/chunks`, { cache: 'no-store' });
      const json = await res.json();
      if (json.error) { setBlad(komunikatBledu(json.error)); return; }
      setFragmenty((f) => ({ ...f, [docId]: json.chunks || [] }));
    } catch (err) {
      setBlad('Nie udało się pobrać fragmentów: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    }
  }

  // Próg pobierany z serwera (a nie wpisany na sztywno w UI), żeby kreska odcięcia
  // pokazywała REALNĄ wartość RAG_MIN_SCORE. Leniwie — tylko gdy włączasz diagnostykę.
  const pobierzProg = useCallback(async () => {
    if (prog != null) return prog;
    try {
      const r = await fetch('/api/rag/status', { cache: 'no-store' });
      const j = await r.json();
      const v = j && j.config && typeof j.config.minScore === 'number' ? j.config.minScore : null;
      setProg(v);
      return v;
    } catch {
      return null;
    }
  }, [prog]);

  // Wyszukiwanie: jedno żądanie do rdzenia. W trybie diagnostycznym wysyłamy minScore = 0
  // i większe topK — rdzeń zwraca wtedy WSZYSTKO, a UI sam rysuje, gdzie tnie próg.
  // Zwykły tryb nie podaje minScore, więc obowiązuje RAG_MIN_SCORE z konfiguracji.
  async function szukaj(e) {
    if (e) e.preventDefault();
    const q = pytanie.trim();
    if (!q) return;

    setBladSzukania(null);
    setSzukanie(true);
    try {
      const progAktualny = diagnostyka ? await pobierzProg() : null;

      const body = { query: q };
      if (filtrDok.length) body.documentIds = filtrDok;
      if (diagnostyka) {
        body.minScore = 0;
        body.topK = DIAGNOSTYKA_TOPK;
      }

      const res = await fetch(`/api/rag/collections/${id}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) {
        setWyniki(null);
        setBladSzukania(komunikatBledu(json.error));
        return;
      }
      setWyniki({
        hits: json.hits || [],
        noResults: json.noResults,
        pytanie: q,
        diagnostyka,
        prog: progAktualny,
      });
    } catch (err) {
      setWyniki(null);
      setBladSzukania('Nie udało się wyszukać: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    } finally {
      setSzukanie(false);
    }
  }

  function przelaczFiltr(docId) {
    setFiltrDok((f) => (f.includes(docId) ? f.filter((x) => x !== docId) : [...f, docId]));
  }

  // Dokumenty widoczne dla wyszukiwania to te, które MAJĄ wektory. Pocięty, ale
  // niezindeksowany dokument jest dla wyszukiwarki niewidzialny — i użytkownik musi
  // o tym wiedzieć, inaczej „nie znalazłem" wprowadza w błąd (uczciwość, 12.9).
  const dokDoSzukania = dokumenty.filter((d) => d.status === 'ready' || d.status === 'embedding');
  const dokNiezindeksowane = dokumenty.filter((d) => d.status === 'chunked' && d.chunkCount > 0);

  async function przeliczWektory(docId) {
    if (!window.confirm('Wyczyścić wektory i współrzędne, i przygotować dokument do ponownego indeksowania?')) return;
    setBlad(null);
    try {
      const res = await fetch(`/api/rag/documents/${docId}/reindex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rechunk: false }),
      });
      const json = await res.json();
      if (json.error) { setBlad(komunikatBledu(json.error)); return; }
      wyczyscPostep(docId);
      await pobierz();
    } catch (err) {
      setBlad('Nie udało się przeliczyć: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    }
  }

  // Przecięcie od nowa (rechunk=true) — potrzebne po zmianie reguł rozpoznawania
  // nagłówków (10.a.2). Oryginał wraca ze Storage i jest ekstrahowany na nowo, więc
  // heading_path i strony liczą się od zera. Fragmenty powstają BEZ wektorów, dlatego
  // po tym trzeba jeszcze raz „Indeksuj".
  async function przetnijOdNowa(docId, nazwa) {
    if (!window.confirm(
      `Przeciąć „${nazwa}" od nowa?\n\nFragmenty i wektory zostaną zbudowane od zera — po tym trzeba ponownie zaindeksować dokument.`
    )) return;
    setBlad(null);
    setRaportCiecia(null);
    try {
      const res = await fetch(`/api/rag/documents/${docId}/reindex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rechunk: true }),
      });
      const json = await res.json();
      if (json.error) { setBlad(komunikatBledu(json.error)); return; }
      wyczyscPostep(docId);
      // Reguła żywych pagin KASUJE tekst, więc pokazujemy wprost, co zniknęło.
      setRaportCiecia({
        nazwa,
        chunkCount: json.chunkCount,
        usuniete: json.usunietePaginy || [],
        niepewneRodziny: json.niepewneRodziny || [],
      });
      await pobierz();
    } catch (err) {
      setBlad('Nie udało się przeciąć od nowa: ' + (err && err.message ? err.message : 'nieznany błąd.'));
    }
  }

  return (
    <main className={styles["strona-szeroka"]}>
      <div className={styles["pasek-gorny"]}>
        <nav className={styles.nawigacja}>
          <Link href="/kreator-rag/kolekcje">Kolekcje</Link>
          <span className={styles.aktywny}>{kolekcja ? kolekcja.name : '…'}</span>
          <Link href={`/kreator-rag/kolekcje/${id}/mapa`} style={{ marginLeft: 'auto' }}>Mapa fragmentów →</Link>
          <Link href={`/kreator-rag/kolekcje/${id}/graf`}>Graf wiedzy →</Link>
        </nav>
        <PrzyciskDiagnostyki />
      </div>

      <h1>{kolekcja ? kolekcja.name : 'Kolekcja'}</h1>
      {kolekcja ? (
        <p className={styles.podtytul}>
          model: <code>{kolekcja.embedModel}</code> · wymiar: <code>{kolekcja.embedDim}</code>
        </p>
      ) : null}

      {/* Dwie kolumny: po lewej praca z dokumentami, po prawej PRZYKLEJONA mapa.
          Sens jest jeden — kliknięcie „Indeksuj" po lewej ma być widać po prawej
          bez zmiany strony. Poniżej 1100 px kolumny układają się jedna pod drugą. */}
      <div className={styles["kolekcja-uklad"]}>
        {/* Lewa kolumna gridu. Bez className — klasa „kolekcja-lewa" nigdy nie miała
            reguły w arkuszu, więc po przejściu na CSS Modules dawała
            className="undefined". Sam <div> ZOSTAJE: jest pierwszym dzieckiem
            .kolekcja-uklad, a bez niego wszystkie karty stałyby się osobnymi
            komórkami gridu i układ dwukolumnowy by się rozsypał. */}
        <div>

      <div className={styles.karta}>
        <div className={styles["naglowek-karty"]}><span>Wgraj dokument</span></div>
        <form onSubmit={wgraj} style={{ marginTop: 12 }}>
          <input
            id="plik-input"
            type="file"
            accept=".pdf,.docx,.txt,.md,.csv"
            onChange={(e) => setPlik(e.target.files && e.target.files[0])}
            style={{ marginBottom: 10 }}
          />
          <p className={styles.komunikat} style={{ marginTop: 0 }}>
            Obsługiwane: PDF, DOCX, TXT, MD, CSV. Ekstrakcja → cięcie → fragmenty (bez wektorów).
          </p>
          {bladUpload ? <p className={styles["blad-formularza"]}>{bladUpload}</p> : null}
          <div className={styles["przyciski-rzad"]}>
            <button type="submit" disabled={wgrywanie || !plik}>
              {wgrywanie ? 'Przetwarzam…' : 'Wgraj i potnij'}
            </button>
          </div>
        </form>
      </div>

      {blad ? <div className={styles.karta}><p className={styles.komunikat} style={{ color: 'var(--blad)' }}>{blad}</p></div> : null}

      {/* --- Wyszukiwanie (Sesja 5) --- */}
      <div className={styles.karta}>
        <div className={styles["naglowek-karty"]}><span>Szukaj w dokumentach</span></div>

        <form onSubmit={szukaj} style={{ marginTop: 12 }}>
          <input
            type="text"
            value={pytanie}
            onChange={(e) => setPytanie(e.target.value)}
            placeholder="np. ile dni urlopu przysługuje pracownikowi"
            style={{ marginBottom: 8 }}
          />

          {dokDoSzukania.length > 1 ? (
            <>
              <label style={{ marginTop: 4 }}>
                Szukaj tylko w wybranych plikach {filtrDok.length === 0 ? '(brak zaznaczenia = cała kolekcja)' : null}
              </label>
              <div className={styles["filtr-dokumentow"]}>
                {dokDoSzukania.map((d) => (
                  <label key={d.id}>
                    <input type="checkbox" checked={filtrDok.includes(d.id)} onChange={() => przelaczFiltr(d.id)} />
                    {d.fileName}
                  </label>
                ))}
              </div>
            </>
          ) : null}

          <div className={styles["checkbox-rzad"]} style={{ marginBottom: 12 }}>
            <input
              id="diag-prog"
              type="checkbox"
              checked={diagnostyka}
              onChange={(e) => setDiagnostyka(e.target.checked)}
            />
            <label htmlFor="diag-prog" style={{ margin: 0 }}>
              diagnostyka progu — pokaż {DIAGNOSTYKA_TOPK} trafień z ich score, także te odrzucane
            </label>
          </div>

          {bladSzukania ? <p className={styles["blad-formularza"]}>{bladSzukania}</p> : null}

          <div className={styles["przyciski-rzad"]}>
            <button type="submit" disabled={szukanie || !pytanie.trim()}>
              {szukanie ? 'Szukam…' : 'Szukaj'}
            </button>
            {wyniki ? <button type="button" onClick={() => { setWyniki(null); setBladSzukania(null); }}>Wyczyść</button> : null}
          </div>
        </form>

        {/* Raport z przecięcia od nowa. Reguła żywych pagin (10.a.2) USUWA tekst
            z dokumentu, więc jej wynik musi być widoczny — bez tego zbyt szeroka
            reguła kasuje treść i nikt się nie dowiaduje. */}
        {raportCiecia ? (
          <div className={styles.karta}>
            <div className={styles["naglowek-karty"]}>
              <span>Przecięto od nowa: {raportCiecia.nazwa}</span>
              <button onClick={() => setRaportCiecia(null)}>Zamknij</button>
            </div>
            <p className={styles.komunikat} style={{ marginTop: 10 }}>
              Powstało <code>{raportCiecia.chunkCount}</code> fragmentów. Dokument nie ma wektorów — kliknij „Indeksuj”.
            </p>
            {raportCiecia.usuniete.length ? (
              <>
                <p className={styles.komunikat} style={{ color: 'var(--nieznane)' }}>
                  Jako żywe paginy usunięto {raportCiecia.usuniete.length === 1 ? 'linię' : 'linie'} powtarzające się przy krawędzi stron:
                </p>
                {raportCiecia.usuniete.map((r, i) => (
                  <div key={i} className={styles.detale} style={{ marginBottom: 4 }}>
                    <code>{r.wystapien}×</code> na {r.stron} stronach — „{r.przyklad}”
                  </div>
                ))}
              </>
            ) : (
              <p className={styles.detale}>Nie usunięto żadnych linii jako żywych pagin.</p>
            )}
            {/* Strażnik pokrycia (10.a.5) nie kasuje tekstu, ale ODBIERA ścieżkom poziom
                szczegółowości — decyduje, czy dokument cytuje się artykułem, czy tylko
                rozdziałem. Bez tego raportu działałby po cichu. */}
            {raportCiecia.niepewneRodziny.length ? (
              <>
                <p className={styles.komunikat} style={{ color: 'var(--nieznane)' }}>
                  Numeracja rozpoznana zbyt rzadko, żeby jej ufać — ścieżki tych fragmentów
                  wskazują sekcję nadrzędną zamiast pojedynczego przepisu:
                </p>
                {raportCiecia.niepewneRodziny.map((r, i) => (
                  <div key={i} className={styles.detale} style={{ marginBottom: 4 }}>
                    <code>{r.rodzina}</code> — nagłówkiem została {r.naglowkow} z {r.wystapien} linii
                    ({(r.pokrycie * 100).toFixed(1)}%)
                  </div>
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        {/* Pojęcia kolekcji (Sesja 7). Lista pokazuje WYŁĄCZNIE kanoniczne —
            po Sesji 8 scalone znikną stąd same, bez zmiany w tym komponencie. */}
        <div className={styles.karta}>
          <div className={styles["naglowek-karty"]}>
            <span>Pojęcia kolekcji</span>
            <button onClick={pobierzPojecia}>
              {pojecia ? 'Odśwież' : 'Pokaż pojęcia'}
            </button>
            {pojecia && pojecia.concepts.length ? (
              <button onClick={normalizuj} disabled={normalizacja}>
                {normalizacja ? 'Scalam…' : 'Normalizuj'}
              </button>
            ) : null}
          </div>

          {/* STAN POŚREDNI POTOKU — TU, NIE TYLKO W GRAFIE.
              Przetwarzanie pojęć ma dwa kroki i drugi jest łatwy do pominięcia, bo
              pierwszy kończy się widocznym sukcesem. Po dołożeniu RODO graf ogłaszał
              „1066 pojęć, 43 mosty" przy stu niescalonych duplikatach w bazie.
              Napis w grafie chroni tego, kto patrzy na graf; ten napis chroni tego,
              kto wgrywa dokument i idzie dalej — a to on zostawia pojęcia niescalone.
              Ostrzeżenie ma stać tam, gdzie powstaje przyczyna. */}
          {kolekcja && kolekcja.normalizacjaOczekuje ? (
            <div className={styles.detale} style={{ marginTop: 8, color: 'var(--ostrzezenie, #fde68a)' }}>
              Pojęcia policzone, <strong>scalanie duplikatów oczekuje</strong>. Do czasu
              uruchomienia „Normalizuj" liczba pojęć i mostów w grafie opisuje stan
              w połowie przetwarzania, nie końcowy.
            </div>
          ) : null}

          {/* Raport ze scalania (DoD Sesji 8: raport widoczny w UI). Pusta lista
              przy drugim uruchomieniu jest WYNIKIEM, nie brakiem wyniku — dlatego
              ma własny komunikat, a nie zniknięcie sekcji. */}
          {raportScalen ? (
            <div className={styles.detale} style={{ marginTop: 8, marginBottom: 8 }}>
              {raportScalen.merged.length ? (
                <>
                  <div style={{ marginBottom: 4 }}>
                    Scalono {raportScalen.merged.length}; zostało {raportScalen.conceptCount} pojęć kanonicznych.
                  </div>
                  {raportScalen.merged.map((m, i) => (
                    <div key={i}>„{m.from}" → „{m.into}" <code>{m.powod}</code></div>
                  ))}
                </>
              ) : (
                <span>Nic do scalenia — {raportScalen.conceptCount} pojęć kanonicznych.</span>
              )}
            </div>
          ) : null}
          {pojecia ? (
            pojecia.concepts.length ? (
              <>
                <p className={styles.detale} style={{ marginTop: 8 }}>
                  {pojecia.concepts.length} pojęć · licznik to liczba fragmentów, w których pojęcie wystąpiło
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {pojecia.concepts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => przelaczPojecie(p.id, p.label)}
                      style={{
                        marginBottom: 0,
                        fontWeight: pojecieFragmenty && pojecieFragmenty.conceptId === p.id ? 700 : 400,
                      }}
                    >
                      {p.label} <code>{p.mentionCount}</code>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className={styles.pusto}>
                Brak pojęć. Użyj „Wyciągnij pojęcia" przy dokumencie — model językowy liczy
                sekundami na fragment, więc zacznij od małego pliku.
              </p>
            )
          ) : null}

          {pojecieFragmenty ? (
            <div style={{ marginTop: 12 }}>
              <div className={styles.detale} style={{ marginBottom: 6 }}>
                <strong>{pojecieFragmenty.label}</strong>
                {/* 12.9: nie udajemy, że to wszystko. */}
                {pojecieFragmenty.total > pojecieFragmenty.chunks.length
                  ? ` — pokazano ${pojecieFragmenty.chunks.length} z ${pojecieFragmenty.total}`
                  : ` — ${pojecieFragmenty.total} ${pojecieFragmenty.total === 1 ? 'fragment' : 'fragmentów'}`}
              </div>
              {pojecieFragmenty.chunks.map((f) => (
                <div key={f.chunkId} className={styles.trafienie} style={{ marginBottom: 6 }}>
                  <div className={styles["trafienie-naglowek"]}>
                    <span className={styles["trafienie-plik"]}>{f.fileName}</span>
                  </div>
                  <div className={styles.detale} style={{ color: 'var(--przygaszony)', fontSize: 13 }}>
                    {f.headingPath ? <code>{f.headingPath}</code> : <span>bez nagłówka</span>}
                    {f.pageFrom != null ? <> · str. {f.pageFrom}</> : null}
                  </div>
                  <div className={styles["trafienie-tresc"]}>{f.content}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {dokNiezindeksowane.length ? (
          <p className={styles.komunikat} style={{ color: 'var(--nieznane)' }}>
            ⚠ {dokNiezindeksowane.length === 1 ? 'Dokument' : 'Dokumenty'}{' '}
            {dokNiezindeksowane.map((d) => d.fileName).join(', ')} {dokNiezindeksowane.length === 1 ? 'jest pocięty, ale nie ma wektorów' : 'są pocięte, ale nie mają wektorów'} — wyszukiwanie ich NIE widzi. Kliknij „Indeksuj”.
          </p>
        ) : null}

        {wyniki ? (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--obwod)', paddingTop: 12 }}>
            <div className={styles.detale} style={{ color: 'var(--przygaszony)', fontSize: 13, marginBottom: 8 }}>
              „{wyniki.pytanie}” · trafień: <code>{wyniki.hits.length}</code>
              {wyniki.diagnostyka ? (
                <> · <span style={{ color: 'var(--nieznane)' }}>tryb diagnostyczny: próg WYŁĄCZONY</span></>
              ) : null}
            </div>

            {wyniki.noResults ? (
              <div className={styles["brak-trafien"]}>
                Nie znalazłem tego w dokumentach.
                <div style={{ color: 'var(--przygaszony)', fontSize: 13, marginTop: 6 }}>
                  Żaden fragment nie przekroczył progu podobieństwa. To celowe — lepiej powiedzieć
                  „nie wiem” niż podać przypadkowe fragmenty. Włącz diagnostykę progu, żeby zobaczyć,
                  jak blisko było najlepsze trafienie.
                </div>
              </div>
            ) : (
              wyniki.hits.map((h, i) => {
                // Kreska odcięcia: rysowana raz, przed pierwszym trafieniem, które
                // normalne wyszukiwanie by odrzuciło. Widać dokładnie, gdzie tnie próg.
                const p = wyniki.prog;
                const poniżej = wyniki.diagnostyka && p != null && h.score < p;
                const pierwszePoniżej =
                  poniżej && (i === 0 || wyniki.hits[i - 1].score >= p);

                return (
                  <div key={h.chunkId}>
                    {pierwszePoniżej ? (
                      <div className={styles["linia-odciecia"]}>próg {p} — poniżej tej kreski nic nie wraca</div>
                    ) : null}
                    <div className={`${styles.trafienie}${poniżej ? ' ' + styles.odrzucone : ''}`}>
                      <div className={styles["trafienie-naglowek"]}>
                        <span className={styles["trafienie-plik"]}>{h.fileName}</span>
                        {/* Przy aktywnej ścieżce tekstowej (11.2) lista NIE jest posortowana
                            malejąco po score — sortuje wartość wzmocniona, która celowo nie
                            opuszcza rdzenia. Bez tego znacznika kolejność wygląda na usterkę. */}
                        {h.trafionePrzez && h.trafionePrzez !== 'wektor' ? (
                          <span
                            className={styles.znacznik}
                            title="Fragment zawiera dokładnie ten identyfikator, o który pytasz — dlatego stoi wyżej, niż wynikałoby z samego score."
                          >
                            dopasowanie dokładne
                          </span>
                        ) : null}
                        <span className={`${styles.score} ${styles[scoreKlasa(h.score)]}`}>{h.score.toFixed(4)}</span>
                      </div>
                      <div className={styles.detale} style={{ color: 'var(--przygaszony)', fontSize: 13 }}>
                        {h.headingPath ? <code>{h.headingPath}</code> : <span>bez nagłówka</span>}
                        {h.pageFrom != null ? (
                          <> · str. {h.pageFrom}{h.pageTo !== h.pageFrom && h.pageTo != null ? `–${h.pageTo}` : ''}</>
                        ) : null}
                      </div>
                      <div className={styles["trafienie-tresc"]}>{h.content}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      <h2 style={{ fontSize: 16, margin: '24px 0 12px' }}>Dokumenty</h2>

      {ladowanie ? (
        <p className={styles.pusto}>Ładowanie…</p>
      ) : dokumenty.length === 0 ? (
        <p className={styles.pusto}>Brak dokumentów. Wgraj pierwszy powyżej.</p>
      ) : (
        dokumenty.map((d) => (
          <div className={styles.karta} key={d.id}>
            <div className={styles["rzad-kolekcji"]}>
              <div className={styles.tresc}>
                <h3>
                  <span className={`${styles.kropka} ${styles[statusKlasa(d.status)]}`} style={{ display: 'inline-block', marginRight: 8 }} />
                  {d.fileName}{' '}
                  <span className={styles.znacznik}>{STATUS_ETYKIETY[d.status] || d.status}</span>
                </h3>
                <div className={styles.detale}>
                  fragmentów: <code>{d.chunkCount}</code>
                  {d.pageCount != null ? <> · stron: <code>{d.pageCount}</code></> : null}
                  {d.charCount != null ? <> · znaków: <code>{d.charCount}</code></> : null}
                </div>
                {/* JAKOŚĆ WARSTWY TEKSTOWEJ (11.1d) — TRWAŁE oznaczenie, nie komunikat.
                    Komunikat przy wgrywaniu znika razem z sesją; problem zostaje, więc
                    znacznik musi stać tam, gdzie ktoś patrzy później. Cztery stany,
                    nie dwa: „nieoceniony" NIE jest odmianą „w porządku" (12.9) —
                    reguła, która milczy, nie może wyglądać jak reguła, która
                    przepuściła. Dlatego stan bez pomiaru i stan „za mało tekstu"
                    są widoczne, a tylko „polski-ok" nie pokazuje nic. */}
                {d.textQuality ? (
                  <div className={styles.detale} style={{ marginTop: 4 }}>
                    {d.textQuality.werdykt === 'okaleczony' ? (
                      <span className={styles.znacznik} style={{ background: 'var(--nieznane)', color: '#000' }}>
                        warstwa tekstowa uszkodzona · {d.textQuality.diakrytyki}% polskich znaków
                      </span>
                    ) : d.textQuality.werdykt === 'nie-polski' ? (
                      <span className={styles.znacznik}>
                        nie po polsku{d.textQuality.jezykObcy ? ` · ${d.textQuality.jezykObcy}` : ''}
                      </span>
                    ) : d.textQuality.werdykt === 'nieoceniony' ? (
                      <span className={styles.znacznik}>jakość nieoceniona · za mało tekstu ciągłego</span>
                    ) : null}
                  </div>
                ) : d.chunkCount > 0 ? (
                  <div className={styles.detale} style={{ marginTop: 4 }}>
                    <span className={styles.znacznik}>jakość tekstu niezmierzona</span>
                  </div>
                ) : null}

                {d.warning ? <div className={styles["blad-formularza"]} style={{ color: 'var(--nieznane)' }}>⚠ {d.warning}</div> : null}
                {d.info ? <div className={styles.detale} style={{ color: 'var(--przygaszony)' }}>{d.info}</div> : null}
                {d.status === 'error' && d.errorMessage ? <div className={styles["blad-formularza"]}>{d.errorMessage}</div> : null}
                {d.status === 'no_text' ? <div className={styles.detale} style={{ color: 'var(--nieznane)' }}>Nie rozpoznano tekstu (skan/obraz) — dokument nie ma fragmentów.</div> : null}
                {postep[d.id] && (postep[d.id].total > 0 || postep[d.id].running) ? (
                  <div style={{ marginTop: 8 }}>
                    <div className={styles.pasek}>
                      <div
                        className={styles["pasek-wypelnienie"]}
                        style={{ width: postep[d.id].total ? `${Math.round((postep[d.id].done / postep[d.id].total) * 100)}%` : '0%' }}
                      />
                    </div>
                    <div className={styles.detale} style={{ marginTop: 4 }}>
                      {postep[d.id].error
                        ? <span style={{ color: 'var(--blad)' }}>{postep[d.id].error}</span>
                        : `zindeksowano ${postep[d.id].done} / ${postep[d.id].total}${postep[d.id].running ? ' …' : ''}`}
                    </div>
                  </div>
                ) : null}

                {/* Pasek wyciągania pojęć. Osobny od paska wektorów, bo to dwie
                    niezależne operacje na tym samym dokumencie — i trwają zupełnie
                    inaczej: embedowanie to milisekundy na fragment, model językowy
                    ~14 sekund. Wspólny pasek sugerowałby jeden proces. */}
                {postepPojec[d.id] && (postepPojec[d.id].total > 0 || postepPojec[d.id].running) ? (
                  <div style={{ marginTop: 6 }}>
                    <div className={styles.pasek}>
                      <div
                        className={styles["pasek-wypelnienie"]}
                        style={{
                          width: postepPojec[d.id].total
                            ? `${Math.round((postepPojec[d.id].done / postepPojec[d.id].total) * 100)}%`
                            : '0%',
                        }}
                      />
                    </div>
                    <div className={styles.detale}>
                      {postepPojec[d.id].error
                        ? <span style={{ color: 'var(--blad)' }}>{postepPojec[d.id].error}</span>
                        : `pojęcia: ${postepPojec[d.id].done} / ${postepPojec[d.id].total}${postepPojec[d.id].running ? ' …' : ''}`}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className={styles["przyciski-rzad"]}>
                {(d.status === 'chunked' || d.status === 'embedding') && d.chunkCount > 0 ? (
                  postep[d.id] && postep[d.id].running ? (
                    <button onClick={() => przerwij(d.id)}>Przerwij</button>
                  ) : (
                    <button onClick={() => indeksuj(d.id)}>Indeksuj</button>
                  )
                ) : null}
                {d.status === 'ready' ? (
                  <button onClick={() => przeliczWektory(d.id)}>Przelicz wektory</button>
                ) : null}
                {d.filePath && d.chunkCount > 0 ? (
                  <button onClick={() => przetnijOdNowa(d.id, d.fileName)}>Przetnij od nowa</button>
                ) : null}
                {d.chunkCount > 0 ? (
                  <button onClick={() => przelaczFragmenty(d.id)}>
                    {fragmenty[d.id] ? 'Ukryj fragmenty' : 'Pokaż fragmenty'}
                  </button>
                ) : null}
                {/* Wyciąganie pojęć wymaga wektorów: pojęcie dostaje własny wektor
                    przez embedDocuments, a to ta sama Ollama. Przy dokumencie bez
                    wektorów przycisk byłby zaproszeniem do błędu. */}
                {d.status === 'ready' && d.chunkCount > 0 ? (
                  postepPojec[d.id] && postepPojec[d.id].running ? (
                    <button onClick={() => przerwijPojecia(d.id)}>Przerwij pojęcia</button>
                  ) : (
                    <button onClick={() => wyciagajPojecia(id, d.id)}>Wyciągnij pojęcia</button>
                  )
                ) : null}
                <button
                  onClick={() => usunDokument(d.id, d.fileName, d.chunkCount)}
                  disabled={usuwany === d.id}
                >
                  {usuwany === d.id ? 'Usuwam…' : 'Usuń'}
                </button>
              </div>
            </div>

            {fragmenty[d.id] ? (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--obwod)', paddingTop: 12 }}>
                {fragmenty[d.id].map((c) => (
                  <div key={c.id} style={{ marginBottom: 12 }}>
                    <div className={styles.detale}>
                      #{c.chunkIndex}
                      {c.headingPath ? <> · <code>{c.headingPath}</code></> : null}
                      {c.pageFrom != null ? <> · str. {c.pageFrom}{c.pageTo !== c.pageFrom ? `–${c.pageTo}` : ''}</> : null}
                      {' · '}znaki {c.charStart}–{c.charEnd} ({c.contentLength})
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--tekst)', marginTop: 2 }}>{c.preview}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))
      )}

        </div>

        {/* Mapa dostaje nowe punkty przez onApi().naPartie — nie odpytuje niczego sama.
            Na wąskim ekranie ląduje POD listą: zarządzanie dokumentami jest wtedy
            czynnością główną, a oglądanie mapy na żywo to przypadek biurkowy.
            Kto do niej nie zjedzie, nie zapłaci nawet za odczyt (wczytanie odroczone). */}
        <aside className={styles["kolekcja-mapa"]}>
          <MapaFragmentow collectionId={id} osadzona onApi={zapiszApiMapy} />
        </aside>
      </div>
    </main>
  );
}
