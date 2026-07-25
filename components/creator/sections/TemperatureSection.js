"use client";

import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import { modelSupportsTemperature } from "@/lib/config/models";
import styles from "./sections.module.css";

// Opis charakteru danej temperatury (ten sam podzial co w bazie wiedzy:
// 0-0.3 precyzja, 0.4-0.6 rownowaga, 0.7-1.0 kreatywnosc).
function temperatureHint(value) {
  if (value <= 0.3) return "Precyzja — raporty, analizy, fakty";
  if (value <= 0.6) return "Równowaga — materiały robocze, rekomendacje";
  return "Kreatywność — burze mózgów, treści twórcze";
}

export function TemperatureSection() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;

  // Nie kazdy model przyjmuje temperature (Opus 4.8 / Sonnet 5 dobieraja ja same).
  const tempSupported = modelSupportsTemperature(agent.provider, agent.model);

  function changeField(field, value) {
    dispatch(updateAgentField(field, value));
    dispatch(setActivity("config-changed"));
    dispatch(setLastEvent({ type: "config-changed", field }));
  }

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">🌡️</span> Temperatura
        </h2>
        <p className={styles.subtitle}>
          Decyduje, jak bardzo kreatywnie agent odpowiada. Niska = przewidywalnie
          i pod fakty. Wysoka = swobodnie i twórczo.
        </p>
      </div>

      {/* Model bez obslugi temperatury: WYJASNIENIE IDZIE PIERWSZE, zeby
          uzytkownik nie zobaczyl najpierw martwej kontrolki i nie pomyslal,
          ze cos jest zepsute. Suwak zostaje nizej jako podglad zapisanej
          wartosci — bo ta wartosc naprawde siedzi w konfiguracji agenta. */}
      {!tempSupported && (
        <div className={styles.note}>
          Model <strong>{agent.model}</strong> sam dobiera poziom losowości i nie
          pozwala ustawiać temperatury ręcznie. To normalne, nie błąd. Jeśli
          zależy Ci na precyzji odpowiedzi, zadbaj o nią w opisie osobowości i w
          zasadach agenta.
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="temperature-slider">
          {tempSupported
            ? "Poziom kreatywności"
            : "Zapisana wartość (podgląd)"}
        </label>
        <span className={styles.hint}>
          {tempSupported
            ? "Przesuń suwak w stronę 0, gdy liczy się zgodność z faktami, albo w stronę 1, gdy potrzebujesz nowych pomysłów."
            : "Ta wartość zostaje zapisana w konfiguracji agenta i zadziała, jeśli przełączysz się na model, który przyjmuje temperaturę."}
        </span>

        <div className={styles.sliderRow}>
          <input
            id="temperature-slider"
            className={styles.slider}
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={agent.temperature}
            disabled={!tempSupported}
            onChange={(e) =>
              changeField("temperature", parseFloat(e.target.value))
            }
          />
          <span className={styles.sliderValue}>
            {Number(agent.temperature).toFixed(1)}
          </span>
        </div>

        {tempSupported && (
          <span className={styles.tempHint}>
            {temperatureHint(agent.temperature)}
          </span>
        )}
      </div>
    </div>
  );
}
