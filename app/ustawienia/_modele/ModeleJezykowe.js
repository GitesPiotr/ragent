"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSettings } from "@/lib/settings/SettingsContext";
import { useDopuszczone, STAN } from "@/lib/settings/DopuszczoneContext";
import { ROLE, NAZWY_ZADAN_PELNE } from "./nazwy";
import {
  znormalizujLokalne,
  odfiltruj,
  wytworcyZKatalogu,
  policz,
  zadaniaKorzystajace,
  komunikatBlokady,
  niedostepneWlaczone,
  wyjasnienieNiedostepnego,
  kluczModelu,
  FILTRY_DOMYSLNE,
} from "@/lib/settings/katalogModeli";
import wspolne from "../ustawienia.module.css";
import styles from "./modele.module.css";

// =============================================================================
//  KARTA „MODELE JEZYKOWE"
//
//  Trzy karty pod zakladka: DOSTAWCY, KATALOG, PRZYPISANIA.
//
//  ZRODLO PRAWDY JEST W BAZIE, NIE TUTAJ. Kazde przelaczenie i kazde
//  przypisanie leci PUT-em na /api/settings/models (runda 4) i dopiero
//  odpowiedz serwera aktualizuje stan.
//
//  ZAPIS JEST CALOSCIOWY. Trasa przyjmuje komplet (lista + przypisania),
//  bo przypisanie musi wskazywac model z tej samej listy — patrz naglowek
//  app/api/settings/models/route.js.
//
//  LISTA KONTA NIE MIESZKA JUZ W TEJ KARCIE (runda 9). Do rundy 8 karta miala
//  wlasny `konto` z wlasnym pobraniem, rownolegly do DopuszczoneContext —
//  i to byla przyczyna usterki: po zapisie odswiezala sie TYLKO ta kopia,
//  wiec kreator, Czaty i sekcje Mentor/Domyslne pokazywaly stara liste az do
//  F5. Karta czyta teraz z kontekstu i przez kontekst zapisuje; jej wlasny
//  stan to juz tylko rzeczy naprawde tutejsze — katalog OpenRoutera, modele
//  Ollamy, filtry, blokady.
// =============================================================================

// --- male kontrolki ------------------------------------------------------------

function Etykieta({ tekst, rodzaj }) {
  return (
    <span className={`${styles.etykieta} ${styles[rodzaj]}`}>{tekst}</span>
  );
}

function Przelacznik({ checked, onChange, disabled, etykietaAria }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={etykietaAria}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${wspolne.toggle} ${checked ? wspolne.toggleOn : ""}`}
    >
      <span className={wspolne.toggleKnob} />
    </button>
  );
}

// --- 1. DOSTAWCY ---------------------------------------------------------------

const DOSTAWCY_OPIS = {
  openrouter: "Brama do modeli wielu wytwórców pod jednym kluczem.",
  ollama: "Modele uruchamiane lokalnie. Nie wymaga klucza — musi działać usługa.",
  anthropic: "Modele Claude bezpośrednio od Anthropic.",
  openai: "Modele GPT bezpośrednio od OpenAI.",
};

function KartaDostawcow({ status, ollama, odswiezKatalog, odswiezanie }) {
  // Ollama NIE MA klucza, wiec /api/providers/status jej nie zna i nie moze
  // znac. Jej stan to „czy usluga odpowiada", a to wiadomo dopiero z proby
  // pobrania modeli — stad osobne zrodlo i osobna galaz nizej.
  const wiersze = [
    { id: "openrouter", nazwa: "OpenRouter", stan: status?.openrouter?.configured ? "ok" : "warn",
      detal: status?.openrouter?.configured ? "Klucz ustawiony." : "Brak klucza OPENROUTER_API_KEY." },
    { id: "ollama", nazwa: "Ollama (lokalnie)",
      stan: ollama?.blad ? "error" : ollama?.modele?.length ? "ok" : "warn",
      detal: ollama?.blad
        ? ollama.blad
        : ollama?.modele?.length
          ? `Działa, ${ollama.modele.length} ${ollama.modele.length === 1 ? "model" : "modeli"}.`
          : "Usługa odpowiada, ale nie ma pobranych modeli." },
    { id: "anthropic", nazwa: "Anthropic", stan: status?.anthropic?.configured ? "ok" : "warn",
      detal: status?.anthropic?.configured ? "Klucz ustawiony." : "Brak klucza ANTHROPIC_API_KEY." },
    { id: "openai", nazwa: "OpenAI", stan: status?.openai?.configured ? "ok" : "warn",
      detal: status?.openai?.configured ? "Klucz ustawiony." : "Brak klucza OPENAI_API_KEY." },
  ];

  const klasaDiody = { ok: wspolne.dotOk, warn: wspolne.dotWarn, error: wspolne.dotError };

  return (
    <div className={wspolne.card}>
      <div className={wspolne.cardHead}>
        <h2 className={wspolne.cardTitle}>Dostawcy</h2>
        <button
          type="button"
          className={wspolne.secondaryButton}
          onClick={odswiezKatalog}
          disabled={odswiezanie}
        >
          {odswiezanie ? "Odświeżam…" : "Odśwież katalog"}
        </button>
      </div>

      {wiersze.map((w) => (
        <div key={w.id} className={wspolne.row}>
          <div className={wspolne.rowText}>
            <span className={wspolne.rowLabel}>
              <span
                className={`${wspolne.dot} ${klasaDiody[w.stan]}`}
                aria-hidden="true"
                style={{ marginRight: 8, display: "inline-block" }}
              />
              {w.nazwa}
            </span>
            <p className={wspolne.rowDesc}>
              {DOSTAWCY_OPIS[w.id]} {w.detal}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- 2. KATALOG ----------------------------------------------------------------

function WierszModelu({ model, wlaczony, zablokowany, onPrzelacz, zapisWstrzymany }) {
  const darmowy = model.darmowy;
  return (
    <div className={styles.wiersz}>
      <div className={styles.wierszTekst}>
        <div className={styles.wierszNazwa}>{model.label}</div>
        <div className={styles.wierszId}>{model.id}</div>
        <div className={styles.etykiety}>
          <Etykieta tekst={model.gdzie} rodzaj="etykietaGdzie" />
          <Etykieta
            tekst={model.koszt}
            rodzaj={darmowy ? "etykietaDarmowy" : "etykietaPlatny"}
          />
          <Etykieta
            tekst={model.narzedzia}
            rodzaj={
              model.deklarujeTools ? "etykietaNarzedzia" : "etykietaBezDeklaracji"
            }
          />
          {model.kontekst ? (
            <Etykieta
              tekst={`kontekst ${Math.round(model.kontekst / 1000)}k`}
              rodzaj="etykietaKontekst"
            />
          ) : null}
        </div>
      </div>
      <div className={styles.wierszKontrolka}>
        <Przelacznik
          checked={wlaczony}
          onChange={onPrzelacz}
          disabled={zapisWstrzymany}
          etykietaAria={`Włącz model ${model.label}`}
        />
      </div>
      {zablokowany && <p className={styles.blokada}>{zablokowany}</p>}
    </div>
  );
}

// =============================================================================
//  „WLACZONE, ALE NIEDOSTEPNE" — SEKCJA NAD LISTA.
//
//  Wiersz stad wyglada inaczej niz wiersz katalogu i to jest celowe: nie ma
//  etykiet (koszt, kontekst, narzedzia), bo ich zrodlo — katalog — wlasnie
//  zniklo, a przepisanie ich z migawki w bazie podawaloby stare dane jako
//  biezace. Zostaje to, co wiemy na pewno: nazwa, identyfikator, dostawca
//  i przelacznik, ktorym da sie wyjsc z tego stanu.
//
//  PRZELACZNIK IDZIE TA SAMA DROGA CO W KATALOGU — łącznie z blokadą przypisań.
//  Model niedostepny bywa przypisany do zadania; wtedy najpierw trzeba zmienic
//  przypisanie, dokladnie jak przy modelu z listy. Druga sciezka zapisu byłaby
//  tu jedynym miejscem, w ktorym ta regula moglaby sie rozjechac.
//
//  SEKCJA NIE POKAZUJE SIE, GDY JEST PUSTA — pusty naglowek „wlaczone, ale
//  niedostepne" nad zdrowa lista czytalby sie jak ostrzezenie o niczym.
// =============================================================================
function SekcjaNiedostepnych({ modele, wlaczoneKlucze, blokada, onPrzelacz, zapisWstrzymany }) {
  if (modele.length === 0) return null;

  return (
    <div className={styles.niedostepne} role="region" aria-label="Modele włączone, ale niedostępne">
      <div className={styles.niedostepneNaglowek}>
        <span aria-hidden="true">⚠️</span>
        <div>
          <strong className={styles.niedostepneTytul}>Włączone, ale niedostępne</strong>
          <p className={styles.niedostepneWstep}>
            {modele.length === 1
              ? "Ten model jest włączony na koncie, ale nie ma go na liście poniżej. Wyłącz go tutaj, jeśli nie jest już potrzebny."
              : "Te modele są włączone na koncie, ale nie ma ich na liście poniżej. Wyłącz je tutaj, jeśli nie są już potrzebne."}
          </p>
        </div>
      </div>

      {modele.map((m) => {
        const klucz = kluczModelu(m.provider, m.id);
        return (
          <div key={klucz} className={styles.wiersz}>
            <div className={styles.wierszTekst}>
              <div className={styles.wierszNazwa}>{m.label}</div>
              <div className={styles.wierszId}>{m.id}</div>
              <div className={styles.etykiety}>
                <Etykieta tekst={m.provider} rodzaj="etykietaGdzie" />
                <Etykieta tekst="poza katalogiem" rodzaj="etykietaBezDeklaracji" />
              </div>
              <p className={styles.niedostepnePowod}>
                {wyjasnienieNiedostepnego(m.powod, m.provider)}
              </p>
            </div>
            <div className={styles.wierszKontrolka}>
              <Przelacznik
                checked={wlaczoneKlucze.has(klucz)}
                onChange={(nowy) => onPrzelacz(m, nowy)}
                disabled={zapisWstrzymany}
                etykietaAria={`Wyłącz niedostępny model ${m.label}`}
              />
            </div>
            {blokada?.klucz === klucz && (
              <p className={styles.blokada}>{blokada.tekst}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function KartaKatalogu({
  zrodlo, setZrodlo, katalog, lokalne, wlaczoneKlucze, przypisania,
  onPrzelacz, blokada, bladKatalogu, ladowanie, niedostepne, zapisWstrzymany,
}) {
  const [filtry, setFiltry] = useState(FILTRY_DOMYSLNE);

  const wszystkie = zrodlo === "openrouter" ? katalog : lokalne;
  const wytworcy = useMemo(() => wytworcyZKatalogu(wszystkie), [wszystkie]);
  const widoczne = useMemo(
    () => odfiltruj(wszystkie, filtry, wlaczoneKlucze),
    [wszystkie, filtry, wlaczoneKlucze],
  );
  const licznik = policz(wszystkie, widoczne, wlaczoneKlucze);

  const ustaw = (patch) => setFiltry((p) => ({ ...p, ...patch }));
  const jakikolwiekFiltr =
    filtry.fraza || filtry.tylkoZNarzedziami || filtry.tylkoDarmowe ||
    filtry.tylkoWlaczone || filtry.wytworca;

  return (
    <div className={wspolne.card}>
      <div className={wspolne.cardHead}>
        <h2 className={wspolne.cardTitle}>Katalog</h2>
        <div className={wspolne.segmented} role="tablist" aria-label="Źródło modeli">
          {[
            { id: "openrouter", label: "OpenRouter" },
            { id: "lokalne", label: "Lokalne" },
          ].map((z) => (
            <button
              key={z.id}
              type="button"
              role="tab"
              aria-selected={zrodlo === z.id}
              className={`${wspolne.segment} ${zrodlo === z.id ? wspolne.segmentActive : ""}`}
              onClick={() => setZrodlo(z.id)}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* OSTRZEZENIE — nad lista, nie pod nia. Objaw, ktory opisuje, wyglada
          identycznie jak awaria RAG-a, wiec musi byc przeczytane ZANIM ktos
          zacznie wlaczac modele, a nie po. */}
      <div className={styles.ostrzezenie} role="note">
        <span className={styles.ostrzezenieIkona} aria-hidden="true">⚠️</span>
        <p className={styles.ostrzezenieTekst}>
          Model bez obsługi narzędzi <strong>nigdy nie wywoła wyszukiwania
          w dokumentach</strong> — a objaw wygląda identycznie jak „RAG nie
          działa&rdquo;: agent odpowiada, tylko bez źródeł. Etykieta „deklaruje
          obsługę narzędzi&rdquo; pochodzi od dostawcy i jest deklaracją, nie faktem:
          część modeli bez tej deklaracji wywołuje narzędzia poprawnie,
          dlatego lista nie jest po niej filtrowana domyślnie.
        </p>
      </div>

      <div className={styles.pasek}>
        <input
          type="search"
          className={styles.szukajka}
          placeholder="Szukaj po nazwie lub identyfikatorze…"
          value={filtry.fraza}
          onChange={(e) => ustaw({ fraza: e.target.value })}
          aria-label="Szukaj modelu"
        />
        <div className={styles.filtry}>
          <button
            type="button"
            aria-pressed={filtry.tylkoZNarzedziami}
            className={`${styles.filtr} ${filtry.tylkoZNarzedziami ? styles.filtrAktywny : ""}`}
            onClick={() => ustaw({ tylkoZNarzedziami: !filtry.tylkoZNarzedziami })}
          >
            z deklaracją narzędzi
          </button>
          <button
            type="button"
            aria-pressed={filtry.tylkoDarmowe}
            className={`${styles.filtr} ${filtry.tylkoDarmowe ? styles.filtrAktywny : ""}`}
            onClick={() => ustaw({ tylkoDarmowe: !filtry.tylkoDarmowe })}
          >
            tylko darmowe
          </button>
          <button
            type="button"
            aria-pressed={filtry.tylkoWlaczone}
            className={`${styles.filtr} ${filtry.tylkoWlaczone ? styles.filtrAktywny : ""}`}
            onClick={() => ustaw({ tylkoWlaczone: !filtry.tylkoWlaczone })}
          >
            tylko włączone
          </button>
          {wytworcy.length > 0 && (
            <select
              className={styles.filtrSelect}
              value={filtry.wytworca}
              onChange={(e) => ustaw({ wytworca: e.target.value })}
              aria-label="Filtruj po wytwórcy"
            >
              <option value="">wszyscy wytwórcy</option>
              {wytworcy.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          )}
          <span className={styles.licznik}>
            {licznik.widoczne} z {licznik.wszystkie}, włączonych: {licznik.wlaczone}
          </span>
        </div>
      </div>

      {bladKatalogu && <p className={styles.blad}>{bladKatalogu}</p>}

      {/* NAD LISTA, NIE POD NIA — i niezaleznie od wybranego zrodla oraz
          filtrow. To nie jest fragment katalogu, tylko stan konta: gdyby
          sekcja podlegala filtrom albo zakladce, model bez wyjscia znikalby
          dokladnie tak samo jak przed jej dodaniem. */}
      <SekcjaNiedostepnych
        modele={niedostepne}
        wlaczoneKlucze={wlaczoneKlucze}
        blokada={blokada}
        onPrzelacz={onPrzelacz}
        zapisWstrzymany={zapisWstrzymany}
      />

      {ladowanie ? (
        <div className={styles.ladowanie}>Wczytuję katalog…</div>
      ) : widoczne.length === 0 ? (
        <div className={styles.pusto}>
          <span className={styles.pustoTytul}>Nic nie pasuje</span>
          {jakikolwiekFiltr
            ? "Żaden model nie spełnia wszystkich warunków naraz. Poluzuj filtry albo wyczyść wyszukiwanie."
            : zrodlo === "lokalne"
              ? "Ollama nie zwróciła żadnego modelu. Sprawdź, czy usługa działa i czy pobrałeś choć jeden model."
              : "Katalog jest pusty."}
        </div>
      ) : (
        <div className={styles.lista}>
          {widoczne.map((m) => {
            const klucz = kluczModelu(m.provider, m.id);
            return (
              <WierszModelu
                key={klucz}
                model={m}
                wlaczony={wlaczoneKlucze.has(klucz)}
                zablokowany={blokada?.klucz === klucz ? blokada.tekst : null}
                onPrzelacz={(nowy) => onPrzelacz(m, nowy)}
                zapisWstrzymany={zapisWstrzymany}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- 3. PRZYPISANIA ------------------------------------------------------------

function KartaPrzypisan({ dopuszczone, przypisania, onPrzypisz, zapisWstrzymany }) {
  const opcje = dopuszczone.map((m) => ({
    klucz: kluczModelu(m.provider, m.model_id),
    etykieta: `${m.label || m.model_id} (${m.provider})`,
    provider: m.provider,
    model_id: m.model_id,
  }));

  return (
    <div className={wspolne.card}>
      <div className={wspolne.cardHead}>
        <h2 className={wspolne.cardTitle}>Przypisania</h2>
      </div>

      {ROLE.map((rola) => {
        const biezace = przypisania?.[rola];
        const wartosc = biezace ? kluczModelu(biezace.provider, biezace.model_id) : "";
        return (
          <div key={rola} className={wspolne.row}>
            <div className={wspolne.rowText}>
              <label className={wspolne.rowLabel} htmlFor={`przypisanie-${rola}`}>
                {NAZWY_ZADAN_PELNE[rola].tytul}
              </label>
              <p className={wspolne.rowDesc}>{NAZWY_ZADAN_PELNE[rola].opis}</p>
            </div>
            <div className={wspolne.rowControl}>
              <select
                id={`przypisanie-${rola}`}
                className={wspolne.select}
                value={wartosc}
                onChange={(e) => {
                  const wybrany = opcje.find((o) => o.klucz === e.target.value);
                  onPrzypisz(rola, wybrany || null);
                }}
                disabled={opcje.length === 0 || zapisWstrzymany}
              >
                {/* Pusta opcja NIE jest „brak modelu", tylko „bez własnego
                    zdania — użyj domyślki z kodu". Tak samo rozumie to serwer
                    (null w bazie), więc etykieta ma to mówić wprost. */}
                <option value="">— domyślny z konfiguracji —</option>
                {opcje.map((o) => (
                  <option key={o.klucz} value={o.klucz}>{o.etykieta}</option>
                ))}
              </select>
            </div>
          </div>
        );
      })}

      {/* CZWARTA POZYCJA — WYLACZONA I TO JEST TRESC, NIE BRAK FUNKCJI. */}
      <div className={`${wspolne.row} ${styles.wylaczony}`}>
        <div className={wspolne.rowText}>
          <label className={wspolne.rowLabel} htmlFor="przypisanie-embeddingi">
            Model embeddingów
          </label>
          <p className={wspolne.rowDesc}>
            Ustawiany przy kolekcji, nie przy koncie — i tak zostanie. Wektory
            już zaindeksowanych fragmentów pochodzą z konkretnego modelu, więc
            zmiana na poziomie konta unieważniłaby cały korpus: trzeba by go
            przeliczyć od nowa i ponownie dobrać próg podobieństwa. Rdzeń RAG
            pilnuje tego osobno — niezgodność zatrzymuje wyszukiwanie, zamiast
            po cichu zwracać bzdury.
          </p>
        </div>
        <div className={wspolne.rowControl}>
          <select id="przypisanie-embeddingi" className={wspolne.select} disabled>
            <option>ustawiane przy kolekcji</option>
          </select>
        </div>
      </div>

      {opcje.length === 0 && (
        <p className={styles.blad}>
          Nie włączyłeś jeszcze żadnego modelu. Przejdź do karty „Katalog&rdquo;
          i włącz przynajmniej jeden — dopiero wtedy da się go tu przypisać.
        </p>
      )}
    </div>
  );
}

// --- calosc --------------------------------------------------------------------

export default function ModeleJezykowe() {
  const { settings } = useSettings();
  // JEDNA kopia listy konta w calej aplikacji — ta z kontekstu. Zapis tez
  // idzie tedy, zeby pozostali czytelnicy (kreator, Czaty, Mentor, Domyslne)
  // zobaczyli zmiane bez przeladowania strony.
  const {
    dopuszczone,
    przypisania,
    stan,
    blad: bladKonta,
    przeladuj,
    zapisz: zapiszKonto,
  } = useDopuszczone();

  const [katalog, setKatalog] = useState([]);
  const [lokalne, setLokalne] = useState([]);
  const [ollama, setOllama] = useState(null);
  const [status, setStatus] = useState(null);
  const [zrodlo, setZrodlo] = useState("openrouter");
  const [ladowanie, setLadowanie] = useState(true);
  const [odswiezanie, setOdswiezanie] = useState(false);
  const [bladKatalogu, setBladKatalogu] = useState(null);
  const [blad, setBlad] = useState(null);
  const [blokada, setBlokada] = useState(null);

  const wlaczoneKlucze = useMemo(
    () => new Set(dopuszczone.map((m) => kluczModelu(m.provider, m.model_id))),
    [dopuszczone],
  );

  // =========================================================================
  //  BEZ POTWIERDZONEJ LISTY NIE WOLNO ZAPISYWAC.
  //
  //  Zapis jest CALOSCIOWY: trasa kasuje wszystko, czego nie ma w ciele
  //  zadania. Gdyby odczyt sie nie udal (401, brak migracji 020, awaria
  //  sieci), `dopuszczone` jest puste — i jedno klikniecie przelacznika
  //  wyslaloby liste jednoelementowa, czyli SKASOWALO reszte modeli konta,
  //  ktorych uzytkownik nawet nie zobaczyl na ekranie.
  //
  //  Stad blokada przelacznikow przy stanie innym niz GOTOWE. Nie jest to
  //  ostroznosc na zapas: pusta lista przy nieudanym odczycie wyglada na
  //  ekranie dokladnie tak samo jak konto, ktore naprawde nic nie wlaczylo.
  // =========================================================================
  const zapisWstrzymany = stan !== STAN.GOTOWE;

  // Modele wlaczone na koncie, ktorych nie ma w biezacym katalogu.
  //
  // `null` ZAMIAST PUSTEJ TABLICY, GDY KATALOG SIE NIE WCZYTAL — i to jest
  // sedno, nie ostroznosc. Podczas ladowania obie listy sa jeszcze puste,
  // a `bladKatalogu` moze pojawic sie sekunde pozniej; przekazanie wtedy `[]`
  // dawaloby migniecie „wszystkie Twoje modele zniknely u dostawcy" przy
  // kazdym wejsciu na karte i przy kazdej czkawce sieci.
  //
  // Dla Ollamy warunkiem jest `ollama` z odpowiedzia BEZ bledu: przed pierwszym
  // pobraniem jest null, a wtedy pusta lista lokalnych nic nie znaczy.
  //
  // `stan` obok `ladowanie` z tego samego powodu: lista konta przychodzi
  // teraz z kontekstu, czyli moze byc jeszcze w drodze, gdy katalog juz jest.
  const niedostepne = useMemo(() => {
    if (ladowanie || stan !== STAN.GOTOWE) return [];
    return niedostepneWlaczone(dopuszczone, {
      openrouter: bladKatalogu ? null : katalog,
      ollama: ollama && !ollama.blad ? lokalne : null,
    });
  }, [ladowanie, stan, dopuszczone, katalog, lokalne, bladKatalogu, ollama]);

  const wczytajKatalog = useCallback(async (wymus) => {
    setBladKatalogu(null);
    try {
      const res = await fetch(
        `/api/openrouter/models${wymus ? "?odswiez=1" : ""}`,
        { cache: "no-store" },
      );
      const dane = await res.json();
      if (!res.ok) throw new Error(dane.error || "Nie udało się pobrać katalogu.");
      setKatalog(dane.models || []);
    } catch (e) {
      // Katalog OpenRoutera moze nie dzialac, a modele lokalne i przypisania
      // dzialaja dalej — dlatego blad katalogu NIE wywraca calej karty.
      setBladKatalogu(e.message);
      setKatalog([]);
    }
  }, []);

  const wczytajLokalne = useCallback(async (url) => {
    try {
      const res = await fetch(`/api/models?url=${encodeURIComponent(url)}`, { cache: "no-store" });
      const dane = await res.json();
      setLokalne(znormalizujLokalne(dane.models));
      setOllama({ modele: dane.models || [], blad: dane.error || null });
    } catch (e) {
      setLokalne([]);
      setOllama({ modele: [], blad: e.message });
    }
  }, []);

  // BEZ POBRANIA LISTY KONTA — robi to DopuszczoneProvider, raz na aplikacje.
  // Drugie pobranie tutaj bylo czescia usterki: dwie kopie tej samej listy,
  // z ktorych po zapisie odswiezala sie tylko jedna.
  useEffect(() => {
    let zywy = true;
    (async () => {
      setLadowanie(true);
      try {
        await Promise.all([
          wczytajKatalog(false),
          wczytajLokalne(settings.ollamaUrl),
          fetch("/api/providers/status", { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => zywy && setStatus(d))
            .catch(() => {}),
        ]);
      } catch (e) {
        if (zywy) setBlad(e.message);
      } finally {
        if (zywy) setLadowanie(false);
      }
    })();
    return () => { zywy = false; };
  }, [settings.ollamaUrl, wczytajKatalog, wczytajLokalne]);

  // JEDNA DROGA ZAPISU dla obu kart. Cala tresc idzie razem, bo trasa
  // sprawdza przypisania wzgledem TEJ listy — patrz naglowek trasy.
  //
  // Samo zadanie robi kontekst: stan zapisany przez serwer ma trafic do
  // WSZYSTKICH czytelnikow, a nie tylko do tej karty. Tutaj zostaje to, co
  // dotyczy wylacznie tego ekranu — komunikat o tym, co serwer odrzucil.
  const zapisz = useCallback(
    async (noweDopuszczone, nowePrzypisania) => {
      setBlad(null);
      try {
        const dane = await zapiszKonto(noweDopuszczone, nowePrzypisania);
        const odrzucone = dane.odrzucone?.przypisania || [];
        if (odrzucone.length > 0) {
          setBlad(
            "Serwer wyczyścił przypisania do modeli spoza listy: " +
              odrzucone.map((o) => NAZWY_ZADAN_PELNE[o.rola]?.tytul || o.rola).join(", "),
          );
        }
      } catch (e) {
        setBlad(e.message);
      }
    },
    [zapiszKonto],
  );

  const przelacz = useCallback(
    (model, wlaczyc) => {
      setBlokada(null);
      // Zapis calosciowy bez potwierdzonej listy skasowalby to, czego nie
      // widac na ekranie — patrz `zapisWstrzymany` wyzej.
      if (zapisWstrzymany) return;
      const klucz = kluczModelu(model.provider, model.id);

      if (!wlaczyc) {
        // BLOKADA SPRAWDZANA PRZED ZAPISEM. Klucz obcy w bazie ma
        // „on delete set null", wiec wylaczenie przypisanego modelu
        // PRZESZLOBY — po cichu zerujac przypisanie. Uzytkownik zobaczylby
        // udany zapis i zniknieta konfiguracje.
        const role = zadaniaKorzystajace(model.provider, model.id, przypisania);
        if (role.length > 0) {
          setBlokada({ klucz, tekst: komunikatBlokady(role) });
          return;
        }
      }

      const bez = dopuszczone.filter(
        (m) => kluczModelu(m.provider, m.model_id) !== klucz,
      );
      const nowa = wlaczyc
        ? [...bez, { provider: model.provider, model_id: model.id, label: model.label }]
        : bez;
      zapisz(nowa, przypisania);
    },
    [dopuszczone, przypisania, zapisWstrzymany, zapisz],
  );

  const przypisz = useCallback(
    (rola, wybrany) => {
      setBlokada(null);
      if (zapisWstrzymany) return;
      zapisz(dopuszczone, {
        ...przypisania,
        [rola]: wybrany ? { provider: wybrany.provider, model_id: wybrany.model_id } : null,
      });
    },
    [dopuszczone, przypisania, zapisWstrzymany, zapisz],
  );

  const odswiezKatalog = useCallback(async () => {
    setOdswiezanie(true);
    await Promise.all([wczytajKatalog(true), wczytajLokalne(settings.ollamaUrl)]);
    setOdswiezanie(false);
  }, [wczytajKatalog, wczytajLokalne, settings.ollamaUrl]);

  return (
    <>
      {blad && <p className={styles.blad}>{blad}</p>}

      {/* NIEUDANY ODCZYT LISTY KONTA — z przyciskiem, nie samym zdaniem.
          Przelaczniki sa wtedy wylaczone, wiec bez drogi powrotnej ekran
          bylby martwy az do F5, czyli dokladnie tego, co ta runda usuwa.
          Ponowienie jest RECZNE: automatyczne po nieudanym odczycie robi
          petle zadan przy kazdej awarii serwera. */}
      {stan === STAN.BRAK && (
        <p className={styles.blad}>
          Nie udało się odczytać modeli konta{bladKonta ? `: ${bladKonta}` : "."}{" "}
          Przełączniki są nieaktywne, żeby zapis nie skasował listy, której nie
          widać.{" "}
          <button type="button" className={wspolne.secondaryButton} onClick={przeladuj}>
            Spróbuj ponownie
          </button>
        </p>
      )}

      <KartaDostawcow
        status={status}
        ollama={ollama}
        odswiezKatalog={odswiezKatalog}
        odswiezanie={odswiezanie}
      />

      <KartaKatalogu
        zrodlo={zrodlo}
        setZrodlo={setZrodlo}
        katalog={katalog}
        lokalne={lokalne}
        wlaczoneKlucze={wlaczoneKlucze}
        przypisania={przypisania}
        onPrzelacz={przelacz}
        blokada={blokada}
        bladKatalogu={bladKatalogu}
        ladowanie={ladowanie}
        niedostepne={niedostepne}
        zapisWstrzymany={zapisWstrzymany}
      />

      <KartaPrzypisan
        dopuszczone={dopuszczone}
        przypisania={przypisania}
        onPrzypisz={przypisz}
        zapisWstrzymany={zapisWstrzymany}
      />
    </>
  );
}
