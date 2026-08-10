"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import {
  PROVIDERS,
  PROVIDERS_WIDOCZNI,
  getModelsForProvider,
  modelSupportsTemperature,
} from "@/lib/config/models";
import { useSettings } from "@/lib/settings/SettingsContext";
import { useDopuszczone } from "@/lib/settings/DopuszczoneContext";
import { listaModeli, modeleOllamy, ZRODLO } from "@/lib/settings/dopuszczoneModele";
import styles from "./sections.module.css";

export function ModelSection() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;
  const { settings } = useSettings();
  // Lista modeli WLACZONYCH PRZEZ KONTO (Ustawienia -> Modele jezykowe).
  // Pusta przy koncie, ktore nic nie wybralo, albo gdy trasa nie odpowiedziala
  // — w obu wypadkach listaModeli() cofa sie na MODELS_BY_PROVIDER.
  const { dopuszczone } = useDopuszczone();

  // Dynamiczna lista modeli Ollamy (status: idle|loading|ready|empty|error).
  const [ollama, setOllama] = useState({
    status: "idle",
    models: [],
    error: null,
  });

  // Czy klucze dostawcow sa ustawione po stronie serwera (bez ich wartosci).
  // Uzywane do ostrzezenia przy modelach, ktorych nie da sie uruchomic.
  const [keys, setKeys] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/providers/status", { cache: "no-store" });
        const data = await res.json();
        if (alive) setKeys(data || {});
      } catch {
        /* brak informacji -> nie pokazujemy notki o kluczu */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function changeField(field, value) {
    dispatch(updateAgentField(field, value));
    dispatch(setActivity("config-changed"));
    dispatch(setLastEvent({ type: "config-changed", field }));
  }

  // Pobiera modele z /api/models (ktory pyta Ollame). Wolane z event handlerow,
  // nie z useEffect — dzieki temu setState jest legalny.
  async function refreshOllamaModels() {
    setOllama({ status: "loading", models: [], error: null });
    try {
      const res = await fetch(
        `/api/models?url=${encodeURIComponent(settings.ollamaUrl)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      const list = data.models || [];

      if (data.error) {
        setOllama({ status: "error", models: [], error: data.error });
        return;
      }
      if (list.length === 0) {
        setOllama({ status: "empty", models: [], error: null });
        return;
      }

      setOllama({ status: "ready", models: list, error: null });

      // Jesli obecny model nie nalezy do listy — ustaw pierwszy z niej.
      //
      // Z LISTY PO PRZECIECIU Z DOPUSZCZONYMI, nie z surowej odpowiedzi demona.
      // Inaczej kreator sam ustawialby model, ktorego nie ma na liscie konta,
      // czyli takiego, ktorego uzytkownik nie moze wybrac recznie.
      const doWyboru = modeleOllamy(dopuszczone, list).modele;
      if (!doWyboru.some((m) => m.id === agent.model)) {
        // Pusto = nie ma czym podmienic. Zerowanie pola skasowaloby model
        // dzialajacego agenta tylko dlatego, ze demon chwilowo go nie widzi.
        if (doWyboru.length > 0) changeField("model", doWyboru[0].id);
      }
    } catch {
      setOllama({
        status: "error",
        models: [],
        error: "Nie można pobrać listy modeli Ollamy.",
      });
    }
  }

  // Zmiana dostawcy resetuje model, zeby nie zostawic modelu poprzedniego providera.
  function changeProvider(nextProvider) {
    changeField("provider", nextProvider);

    if (nextProvider === "ollama") {
      dispatch(updateAgentField("model", ""));
      refreshOllamaModels();
      return;
    }

    // Pierwszy model Z LISTY KONTA dla nowego dostawcy (a nie z zaszytej).
    // Pusto — zostawiamy puste pole; nizej stoi notka, co z tym zrobic.
    const first = listaModeli(dopuszczone, nextProvider).modele[0]?.id ?? "";
    dispatch(updateAgentField("model", first));
  }

  const isOllama = agent.provider === "ollama";

  // ZASZYTA LISTA DOSTAWCY zostaje, ale TYLKO do faktow o DOSTAWCY, nie do
  // wyboru modelu: `verified` i `requiresKey` opisuja integracje w tej
  // aplikacji, a nie to, co konto wlaczylo. Lista do wyboru jest nizej.
  const staticModels = getModelsForProvider(agent.provider);

  // LISTA DO WYBORU — z modeli dopuszczonych przez konto.
  // Ollama ma wlasna droge: przeciecie listy konta z tym, co naprawde chodzi
  // w demonie (model bywa dopuszczony, a potem usuniety przez `ollama rm`).
  const wybor = isOllama
    ? modeleOllamy(dopuszczone, ollama.models)
    : listaModeli(dopuszczone, agent.provider);

  // =========================================================================
  //  MODEL AGENTA SPOZA LISTY — DOPISYWANY DO NIEJ, NIE UKRYWANY.
  //
  //  Agent trzyma swoj model przy sobie i dziala na nim dalej, nawet gdy
  //  model zostal potem wylaczony w Ustawieniach (rozmowa nie sprawdza listy
  //  dopuszczonych — patrz raport rundy 6, punkt f). Bez tej galezi kreator
  //  pokazywalby wtedy liste BEZ ANI JEDNEGO ZAZNACZONEGO POLA: ekran mowi
  //  „agent nie ma modelu", a agent go ma i wlasnie z niego korzysta.
  //
  //  To ta sama pulapka, ktora runda 5 zamknela w katalogu Ustawien
  //  („wlaczone, ale niedostepne"): stan bez reprezentacji w interfejsie.
  //  Tu jest grozniejsza, bo dotyczy dzialajacej konfiguracji — a nie tylko
  //  wpisu na liscie.
  // =========================================================================
  const modelSpozaListy =
    agent.model && !wybor.modele.some((m) => m.id === agent.model);
  const visibleModels = modelSpozaListy
    ? [{ id: agent.model, label: agent.model, spozaListy: true }, ...wybor.modele]
    : wybor.modele;
  // „domyslne" = konto nie ma jeszcze wlasnej listy i patrzy na MODELS_BY_PROVIDER.
  const zDomyslnych = wybor.zrodlo === ZRODLO.DOMYSLNE;

  // OpenRouter: POLE TEKSTOWE TYLKO WTEDY, GDY NIE MA Z CZEGO WYBIERAC.
  // Do rundy 5 katalogu nie bylo i wpisanie identyfikatora recznie bylo
  // jedyna droga. Teraz konto moze miec dopuszczone modele OpenRoutera —
  // wtedy lista je pokazuje, a pole tekstowe bylo by drugim sposobem
  // ustawienia tego samego pola. Zostaje jako wyjscie awaryjne dla konta,
  // ktore jeszcze niczego z OpenRoutera nie wlaczylo.
  const isOpenRouter = agent.provider === "openrouter";
  const openRouterRecznie = isOpenRouter && visibleModels.length === 0;

  // Czy WSZYSTKIE modele tego dostawcy sa niesprawdzone (verified === false).
  // Wtedy nad lista pokazujemy jedna notke zamiast powtarzac ja przy kazdym.
  //
  // `visibleModels.length > 0` doszlo w rundzie 6 i jest konieczne: notka mowi
  // „TE MODELE nie zostaly przetestowane", a od tej rundy lista potrafi byc
  // pusta (konto nie wlaczylo nic u tego dostawcy). Zdanie o modelach stojace
  // nad brakiem modeli mowi o niczym — i zaslania wlasciwy komunikat, ktory
  // tlumaczy, czemu nie ma z czego wybierac.
  const providerUnverified =
    !isOllama &&
    visibleModels.length > 0 &&
    staticModels.length > 0 &&
    staticModels.every((m) => m.verified === false);
  // Nazwa zmiennej z kluczem + czy klucz jest ustawiony na serwerze.
  const requiredKey = staticModels.find((m) => m.requiresKey)?.requiresKey;
  const keyConfigured = keys[agent.provider]?.configured;

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">🧠</span> Model AI
        </h2>
        <p className={styles.subtitle}>
          Silnik, który generuje odpowiedzi. Mocniejszy model rozumie więcej,
          szybszy odpowiada taniej.
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="model-provider">
          Dostawca
        </label>
        <select
          id="model-provider"
          className={styles.select}
          value={agent.provider}
          onChange={(e) => changeProvider(e.target.value)}
        >
          {/* PROVIDERS_WIDOCZNI, nie PROVIDERS — tryb pokazu chowa Ollamę.
              Podpis wybranego dostawcy niżej czyta dalej pełne PROVIDERS,
              żeby agent zapisany wcześniej na modelu lokalnym pokazywał
              nazwę, a nie surowe „ollama". */}
          {PROVIDERS_WIDOCZNI.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Model</span>

        {isOllama && ollama.status === "loading" && (
          <span className={styles.hint}>Ładowanie lokalnych modeli…</span>
        )}

        {isOllama && (ollama.status === "error" || ollama.status === "empty") && (
          <div className={styles.note}>
            {ollama.status === "empty"
              ? "Nie znaleziono żadnych modeli. Pobierz model (np. „ollama pull llama3.1”) i odśwież listę."
              : "Uruchom Ollamę i pobierz model, aby korzystać z modeli lokalnych."}
            {ollama.error ? ` (${ollama.error})` : ""}
          </div>
        )}

        {/* DEMON MA MODELE, ALE ZADEN NIE JEST WLACZONY NA KONCIE.
            To CO INNEGO niz stan „empty" maszyny stanow i musi mowic co
            innego: „ollama pull" tu nie pomoze, bo modele sa — brakuje
            wlaczenia ich w Ustawieniach. */}
        {isOllama && ollama.status === "ready" && visibleModels.length === 0 && (
          <div className={styles.note}>
            Ollama ma {ollama.models.length}{" "}
            {ollama.models.length === 1 ? "model" : "modeli"}, ale żaden nie jest
            włączony na Twoim koncie. Włącz je w{" "}
            <a href="/ustawienia">Ustawieniach → Modele językowe</a> (karta
            „Katalog”, zakładka „Lokalne”).
          </div>
        )}

        {/* ODFILTROWANE PO CICHU — uzytkownik widzi krotsza liste, niz ma
            w Ollamie, i bez tego zdania nie ma jak sie dowiedziec dlaczego. */}
        {isOllama && wybor.odfiltrowane > 0 && visibleModels.length > 0 && (
          <span className={styles.hint}>
            Ukryto {wybor.odfiltrowane}{" "}
            {wybor.odfiltrowane === 1 ? "model" : "modeli"} Ollamy spoza Twojej
            listy w Ustawieniach.
          </span>
        )}

        {/* KONTO BEZ ANI JEDNEGO MODELU TEGO DOSTAWCY.
            NIE pusta lista bez slowa wyjasnienia — pusty ekran w kreatorze
            wyglada identycznie jak awaria wczytywania. */}
        {!isOllama && !openRouterRecznie && visibleModels.length === 0 && (
          <div className={styles.note}>
            Nie masz włączonego żadnego modelu dostawcy{" "}
            {PROVIDERS.find((p) => p.id === agent.provider)?.label ||
              agent.provider}
            . Wybierz modele w{" "}
            <a href="/ustawienia">Ustawieniach → Modele językowe</a> albo zmień
            dostawcę powyżej.
          </div>
        )}

        {/* LISTA DOMYSLNA — konto nigdy nie bylo w Ustawieniach. Notka jest
            cicha (hint, nie note): to jest stan KAZDEGO istniejacego konta,
            wszystko dziala, a nie awaria do zgloszenia. */}
        {zDomyslnych && visibleModels.length > 0 && (
          <span className={styles.hint}>
            To są modele domyślne. Swoją listę wybierzesz w{" "}
            <a href="/ustawienia">Ustawieniach → Modele językowe</a>.
          </span>
        )}

        {isOllama && ollama.status === "idle" && (
          <div className={styles.note}>
            Kliknij „Odśwież listę modeli”, aby pobrać modele z lokalnej Ollamy.
          </div>
        )}

        {/* Modele podlaczone „na slepo”, bez ani jednego realnego wywolania.
            Ostrzegamy, ale NIE blokujemy wyboru — konfiguracje agenta mozna
            zapisac, a przy probie rozmowy uzytkownik dostanie czytelny blad. */}
        {providerUnverified && (
          <div className={styles.note}>
            ⚠️ Te modele nie zostały jeszcze przetestowane w tej aplikacji —
            możesz je wybrać, ale rozmowa może nie zadziałać za pierwszym razem.
            {requiredKey && keyConfigured === false
              ? ` Wymagają też klucza ${requiredKey} w pliku .env.local (obecnie go brakuje) — po dodaniu zrestartuj serwer.`
              : ""}
          </div>
        )}

        {/* OPENROUTER — POLE TEKSTOWE ZAMIAST LISTY, do czasu katalogu z API.
            Identyfikator ma postać „dostawca/model", np. anthropic/claude-haiku-4.5.
            Nie sprawdzamy go po swojej stronie: katalog OpenRoutera zmienia się
            częściej niż ta aplikacja, więc lista dozwolonych wartości zaszyta
            tutaj i tak byłaby nieaktualna. Zły identyfikator wraca z API jako
            czytelny błąd „model nie istnieje", a nie jako cisza. */}
        {openRouterRecznie && (
          <>
            <span className={styles.hint}>
              Nie masz włączonego żadnego modelu OpenRoutera — wybierz je w{" "}
              <a href="/ustawienia">Ustawieniach → Modele językowe</a>, albo
              wpisz identyfikator ręcznie, np.{" "}
              <code>anthropic/claude-haiku-4.5</code>.
            </span>
            <input
              className={styles.input}
              type="text"
              value={agent.model || ""}
              placeholder="anthropic/claude-haiku-4.5"
              onChange={(e) => changeField("model", e.target.value.trim())}
            />
            {keyConfigured === false && (
              <div className={styles.note}>
                ⚠️ Brakuje klucza OPENROUTER_API_KEY w pliku .env.local — po
                dodaniu zrestartuj serwer, inaczej rozmowa zwróci błąd.
              </div>
            )}
          </>
        )}

        <div className={styles.modelList}>
          {visibleModels.map((m) => {
            const selected = agent.model === m.id;
            // Z FUNKCJI, NIE Z POLA REKORDU. Rekord z listy konta ma tylko
            // { id, label } — pole `supportsTemperature` istnieje wylacznie
            // w MODELS_BY_PROVIDER, wiec czytane wprost bylo by `undefined`
            // dla kazdego modelu konta i kazdy dostawalby „model dobiera sam".
            // modelSupportsTemperature() zna odpowiedz takze dla Ollamy
            // i OpenRoutera — i tej funkcji ta runda nie zmienia.
            const tempInfo = isOllama
              ? "lokalny · temperatura: tak"
              : modelSupportsTemperature(agent.provider, m.id)
                ? "temperatura: tak"
                : "temperatura: model dobiera sam";

            return (
              <label
                key={m.id}
                className={`${styles.modelOption} ${
                  selected ? styles.modelSelected : ""
                }`}
              >
                <input
                  type="radio"
                  name="agent-model"
                  value={m.id}
                  checked={selected}
                  onChange={() => changeField("model", m.id)}
                />
                <span className={styles.modelBody}>
                  <span className={styles.modelName}>{m.label}</span>
                  <span className={styles.modelMeta}>
                    {m.id} · {tempInfo}
                    {m.verified === false ? " · ⚠️ niesprawdzone" : ""}
                    {m.spozaListy
                      ? " · ⚠️ nie ma go na Twojej liście w Ustawieniach — agent nadal go używa"
                      : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {isOllama && ollama.status !== "loading" && (
          <button
            type="button"
            className={styles.button}
            style={{ marginTop: 10, alignSelf: "flex-start" }}
            onClick={refreshOllamaModels}
          >
            Odśwież listę modeli
          </button>
        )}
      </div>
    </div>
  );
}
