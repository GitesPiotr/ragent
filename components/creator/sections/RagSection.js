"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import { RAG_TOOL_ID } from "@/lib/creator/parameters";
import styles from "./sections.module.css";

// =============================================================================
//  SEKCJA "RAG" — DRUGIE ZRODLO WIEDZY, WLASNA KARTA
//
//  Stoi PRZY Bazie wiedzy, bo obie sekcje odpowiadaja na to samo pytanie:
//  skad agent bierze tresc Twoich dokumentow. Roznia sie sposobem:
//  Baza wiedzy DOKLEJA cale pliki do instrukcji, RAG WYSZUKUJE w kolekcji
//  fragmenty pasujace do pytania. Wczesniej przelacznik lezal w "Narzedziach",
//  obok kalkulatora — czyli w miejscu, ktore niczego o tym pokrewienstwie
//  nie mowilo.
//
//  DLACZEGO WYBOR KOLEKCJI JEST TUTAJ, PRZY PRZELACZNIKU
//
//  Bo to nie sa dwie decyzje, tylko jedna. Wlaczone wyszukiwanie bez wskazanej
//  kolekcji NIE DZIALA, a wskazana kolekcja przy wylaczonym wyszukiwaniu nie
//  robi NIC. Rozdzielenie ich na dwa ekrany pozwoliloby ustawic jedno bez
//  drugiego i nie zobaczyc zwiazku — a to jest dokladnie ten rodzaj stanu,
//  ktory „WYGLADA na wlaczona wiedze, a dziala jak wylaczona"
//  (KnowledgeBaseSection.js:232-234).
// =============================================================================

export function RagSection() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;
  const enabled = Array.isArray(agent.tools) && agent.tools.includes(RAG_TOOL_ID);

  // Kolekcje RAG konta — do wyboru zakresu wyszukiwania. Lista jest krotka
  // (kolekcja to jednostka organizacyjna, nie plik), wiec zwykly <select>.
  const [kolekcje, setKolekcje] = useState([]);
  const [kolekcjeBlad, setKolekcjeBlad] = useState(null);
  const [kolekcjeWczytane, setKolekcjeWczytane] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/rag/collections", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (data.error) {
          setKolekcjeBlad(data.error.message || "Nie udało się wczytać kolekcji.");
        } else {
          setKolekcje(data.collections || []);
          setKolekcjeBlad(null);
        }
      } catch (e) {
        if (alive) setKolekcjeBlad(e?.message || "Nie udało się wczytać kolekcji.");
      } finally {
        if (alive) setKolekcjeWczytane(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Ten sam mechanizm co dotad: RAG to narzedzie, wiec przelacznik
  // dopisuje/usuwa 'rag_search' w agents.tools.
  function przelacz() {
    const tools = Array.isArray(agent.tools) ? agent.tools : [];
    const next = enabled
      ? tools.filter((t) => t !== RAG_TOOL_ID)
      : [...tools, RAG_TOOL_ID];

    dispatch(updateAgentField("tools", next));
    dispatch(setActivity("config-changed"));
    dispatch(
      setLastEvent({
        type: "config-changed",
        field: "tools",
        action: enabled ? "disable-tool" : "enable-tool",
        tool: RAG_TOOL_ID,
      }),
    );
  }

  function wybierzKolekcje(id) {
    // Pusty string z <select> -> null. Kolumna jest typu uuid.
    dispatch(updateAgentField("rag_collection_id", id || null));
    dispatch(setActivity("config-changed"));
    dispatch(
      setLastEvent({
        type: "config-changed",
        field: "rag_collection_id",
        action: id ? "set-collection" : "clear-collection",
      }),
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden="true">🔎</span> RAG
        </h2>
        <p className={styles.subtitle}>
          Drugie źródło wiedzy agenta — obok Bazy wiedzy i inaczej niż ona.{" "}
          <strong>Baza wiedzy</strong> dokleja całe wskazane pliki do instrukcji
          agenta. <strong>RAG</strong> niczego nie dokleja: przeszukuje kolekcję
          dokumentów i podaje agentowi tylko te fragmenty, które pasują do
          zadanego pytania — z nazwą pliku i sekcją, żeby mógł je zacytować.
          Włączaj przy większych dokumentach: regulaminach, umowach,
          instrukcjach.
        </p>
      </div>

      <div className={styles.toolRow}>
        <span className={styles.toolInfo}>
          <span className={styles.toolName}>Przeszukiwanie dokumentów</span>
          <span className={styles.toolDesc}>
            Agent sam decyduje, kiedy sięgnąć do kolekcji, i cytuje konkretne
            fragmenty zamiast dostawać całe pliki. Dokumenty muszą być wcześniej
            zindeksowane — kolekcje zakładasz i wypełniasz w zakładce „Kreator
            RAG”.
          </span>
          {/* =================================================================
              KOSZT ZALEZY OD KOLEKCJI, NIE OD APLIKACJI (cykl RAG-embed).

              Do rundy 1 zdanie brzmialo „Bez kosztow zewnetrznych:
              wyszukiwanie liczy sie lokalnie (Ollama). Wymaga uruchomionej
              Ollamy" — i bylo prawda, bo innej drogi nie bylo. Odkad kolekcja
              pamieta wlasna pare (dostawca, model) i nia sie napedza, to samo
              zdanie stalo sie NIEPRAWDA dla kolekcji chmurowej: liczy sie
              przez OpenRoutera, kosztuje ulamek grosza i Ollamy nie potrzebuje.

              Tekst stoi dokladnie tam, gdzie zapada decyzja, wiec nie moze
              obiecywac jednej z dwoch mozliwosci jako jedynej. Nie podajemy
              tu, KTORA droga pojdzie ta kolekcja — to widac przy jej wyborze
              nizej i w Kreatorze RAG; tutaj wystarczy, ze uzytkownik wie,
              iz odpowiedz zalezy od kolekcji.
              ================================================================= */}
          <span className={styles.toolCost}>
            💳 Koszt i wymagania zależą od kolekcji: kolekcja lokalna liczy się
            w Ollamie (bez kosztów, ale wymaga jej uruchomienia), kolekcja
            chmurowa przez OpenRoutera (ułamek grosza, bez Ollamy). Gdy dostawca
            wybranej kolekcji nie odpowiada, agent odpowie bez dokumentów i powie
            o tym wprost.
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Przeszukiwanie dokumentów: ${
            enabled ? "włączone" : "wyłączone"
          }`}
          className={`${styles.switch} ${enabled ? styles.switchOn : ""}`}
          onClick={przelacz}
        >
          <span className={styles.switchKnob} />
        </button>
      </div>

      {/* --- ZAKRES WYSZUKIWANIA: KTORA KOLEKCJA --------------------------
          Pokazujemy WYLACZNIE przy wlaczonym wyszukiwaniu. Wybor kolekcji dla
          agenta, ktory jej nie uzywa, byłby ustawieniem bez skutku — a takie
          ustawienia uczą, że interfejs kłamie. */}
      {enabled && (
        <div className={styles.toolRow}>
          <span className={styles.toolInfo}>
            <span className={styles.toolName}>Przeszukiwana kolekcja</span>
            <span className={styles.toolDesc}>
              Agent przeszukuje CAŁĄ wskazaną kolekcję — nie wybiera z niej
              pojedynczych dokumentów. Kolekcje zakładasz i wypełniasz
              w zakładce „Kreator RAG”.
            </span>

            {/* STAN, KTORY WYGLADA NA WLACZONA WIEDZE, A DZIALA JAK WYLACZONA.
                Ten sam wzorzec co w KnowledgeBaseSection — ostrzezenie stoi
                przy miejscu, w ktorym stan powstaje, a nie w dokumentacji. */}
            {!agent.rag_collection_id && (
              <span className={styles.toolNote}>
                ⚠ Wyszukiwanie jest włączone, ale nie wskazano kolekcji — agent
                nie ma czego przeszukać i przy każdym pytaniu odpowie, że nie ma
                dostępu do dokumentów. Wybierz kolekcję poniżej albo wyłącz
                wyszukiwanie.
              </span>
            )}

            {kolekcjeBlad && (
              <span className={styles.toolNote}>
                Nie udało się wczytać listy kolekcji: {kolekcjeBlad}
              </span>
            )}

            {kolekcjeWczytane && !kolekcjeBlad && kolekcje.length === 0 && (
              <span className={styles.toolNote}>
                Nie masz jeszcze żadnej kolekcji. Załóż ją w zakładce „Kreator
                RAG” i wgraj do niej dokumenty — dopiero wtedy będzie co wskazać.
              </span>
            )}

            <select
              className={styles.select}
              value={agent.rag_collection_id || ""}
              onChange={(e) => wybierzKolekcje(e.target.value)}
              aria-label="Kolekcja przeszukiwana przez agenta"
            >
              <option value="">— nie wybrano —</option>
              {kolekcje.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </span>
        </div>
      )}
    </div>
  );
}
