"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/state/StateContext";
import { setAgent, setLastEvent } from "@/lib/state/actions";
import { getAgent, saveAgentConfig } from "@/lib/data/agents";
import { getProject } from "@/lib/data/projects";
import { dbAgentToState, isSameConfig } from "@/lib/data/agentMapping";
import { useResizablePanel } from "@/lib/hooks/useResizablePanel";
import { useSettings } from "@/lib/settings/SettingsContext";
import { MentorLayoutContext } from "@/components/mentor/MentorLayoutContext";
import { MasterDetailCreator } from "@/components/creator/MasterDetailCreator";
import { MentorPanel } from "@/components/mentor/MentorPanel";
import { BackButton } from "@/components/workspace/BackButton";
import { DebugPanel } from "@/components/DebugPanel";
import styles from "./page.module.css";

// Geometria dwuetapowego resizu mentora.
const CREATOR_MAX = 1180; // maksymalna szerokosc ramy kreatora (.main max-width)
const CREATOR_MIN = 700; // ponizej ukladu dwukolumnowy przestaje byc czytelny
const MENTOR_MIN = 280;
const MENTOR_MAX = 700;
const MENTOR_DEFAULT = 380;

export default function AgentEditorPage() {
  const params = useParams();
  const projectId = params?.projectId;
  const agentId = params?.agentId;

  const { state, dispatch } = useAppState();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // "idle" | "saving" | "saved" | "error"
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveError, setSaveError] = useState(null);

  // Konfiguracja tak, jak wyglada W BAZIE — punkt odniesienia do wykrywania
  // niezapisanych zmian. To jest STAN (nie ref), bo wplywa na render:
  // od niego zalezy wskaznik "Niezapisane zmiany" i aktywnosc przycisku.
  const [savedSnapshot, setSavedSnapshot] = useState(null);

  // WCZYTANIE: agent z Supabase -> state.agent. Od tej chwili kreator,
  // czat i mentor pracuja na TYM agencie (wszystkie czytaja state.agent).
  useEffect(() => {
    if (!agentId) return;
    let alive = true;

    (async () => {
      try {
        const [agentRow, projectRow] = await Promise.all([
          getAgent(agentId),
          getProject(projectId),
        ]);
        if (!alive) return;

        if (!agentRow) {
          setLoadError("Nie znaleziono takiego agenta w tym projekcie.");
          return;
        }

        const mapped = dbAgentToState(agentRow);
        setSavedSnapshot(mapped);
        dispatch(setAgent(mapped));
        dispatch(setLastEvent({ type: "agent-loaded", agentId }));
        setProject(projectRow);
        setLoadError(null);
      } catch (e) {
        if (alive) setLoadError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [agentId, projectId, dispatch]);

  // Niezapisane zmiany = biezacy state.agent rozni sie od tego, co w bazie.
  // Bez autosave — informacja dla uzytkownika, zapis tylko na klikniecie.
  const hasUnsavedChanges =
    !loading &&
    !loadError &&
    savedSnapshot !== null &&
    !isSameConfig(savedSnapshot, state.agent);

  const handleSave = useCallback(async () => {
    if (saveStatus === "saving") return;

    setSaveStatus("saving");
    setSaveError(null);
    try {
      const saved = await saveAgentConfig(agentId, state.agent);
      const mapped = dbAgentToState(saved);
      setSavedSnapshot(mapped);
      // Odswiezamy stan tym, co REALNIE wrocilo z bazy — dzieki temu
      // widzimy dokladnie zapisane wartosci, a nie swoje zalozenia.
      dispatch(setAgent(mapped));
      dispatch(setLastEvent({ type: "agent-saved", agentId }));
      setSaveStatus("saved");
    } catch (e) {
      setSaveError(e.message);
      setSaveStatus("error");
    }
  }, [agentId, state.agent, dispatch, saveStatus]);

  // Ostrzezenie przed zamknieciem karty z niezapisanymi zmianami.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function onBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  // ---------- LAYOUT MENTORA (przesuwalna, dwuetapowa granica) ----------
  // Panel mentora otwiera/zamyka sie tutaj (stan podniesiony), zeby strona
  // mogla jednoczesnie sterowac szerokoscia kreatora.
  const [mentorOpen, setMentorOpen] = useState(false);

  // Auto-otwarcie mentora dla NOWEGO (pustego) agenta — gdy włączone w Ustawieniach.
  // „Nowy" = świeżo utworzony, jeszcze nieskonfigurowany (brak persony/zasad/QA).
  const { settings } = useSettings();
  const autoOpenDoneRef = useRef(false);
  useEffect(() => {
    if (autoOpenDoneRef.current) return;
    if (!settings.autoOpenMentor || !savedSnapshot) return;
    const empty =
      !(savedSnapshot.persona || "").trim() &&
      (savedSnapshot.rules?.length ?? 0) === 0 &&
      (savedSnapshot.qas?.length ?? 0) === 0;
    if (empty) setMentorOpen(true);
    autoOpenDoneRef.current = true;
  }, [savedSnapshot, settings.autoOpenMentor]);

  // Geometria: strona agenta siedzi w layoucie z sidebarem, wiec kontener .page
  // NIE zaczyna sie od krawedzi okna. Panel mentora jest position:fixed do OKNA.
  // Dlatego mierzymy jednoczesnie: szerokosc okna (dla mentora) oraz lewa
  // krawedz i szerokosc kontenera .page (dla kreatora). SSR-safe: 0 do pomiaru.
  const [metrics, setMetrics] = useState({
    innerW: 0,
    pageLeft: 0,
    pageWidth: 0,
  });

  const pageElRef = useRef(null);
  useEffect(() => {
    const update = () => {
      const el = pageElRef.current;
      const rect = el
        ? el.getBoundingClientRect()
        : { left: 0, width: 0 };
      setMetrics({
        // clientWidth (bez paska przewijania) — spojne z panelem fixed right:0.
        innerW: document.documentElement.clientWidth,
        pageLeft: Math.round(rect.left),
        pageWidth: Math.round(rect.width),
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const measured = metrics.innerW > 0 && metrics.pageWidth > 0;

  // Lewa kotwica kreatora — jego lewa krawedz przy wysrodkowaniu w kontenerze
  // (page-relative). Kreator nigdy nie przesuwa sie w lewo — tylko zweza od prawej.
  const anchorInPage = measured
    ? Math.max(0, (metrics.pageWidth - CREATOR_MAX) / 2)
    : 0;
  // Ta sama kotwica w ukladzie OKNA (do porownania z krawedzia mentora).
  const anchorVp = metrics.pageLeft + anchorInPage;

  // Maks. szerokosc mentora ograniczona tak, by kreator nie zszedl < CREATOR_MIN.
  const mentorMaxEff = measured
    ? Math.min(
        MENTOR_MAX,
        Math.max(MENTOR_MIN, metrics.innerW - anchorVp - CREATOR_MIN),
      )
    : MENTOR_MAX;

  const {
    width: mentorWidth,
    dragging: mentorResizing,
    separatorProps: mentorSeparatorProps,
  } = useResizablePanel({
    side: "right",
    reference: "viewport",
    min: MENTOR_MIN,
    max: mentorMaxEff,
    defaultWidth: MENTOR_DEFAULT,
    storageKey: "mentor:width",
  });

  // Szerokosc kreatora wynika z szerokosci mentora (w ukladzie OKNA):
  //  - duzo miejsca  -> kreator pelny (CREATOR_MAX), reszta to PRZERWA,
  //  - malo miejsca  -> kreator zwezony tak, by jego prawa krawedz dotknela
  //                     lewej krawedzi mentora.
  const creatorWidth = measured
    ? Math.min(
        CREATOR_MAX,
        Math.max(CREATOR_MIN, metrics.innerW - mentorWidth - anchorVp),
      )
    : CREATOR_MAX;

  // Inline-style kreatora nakladamy tylko gdy mentor JEST OTWARTY (i po pomiarze,
  // klient — bez rozjazdu hydracji). Zamkniety mentor => brak inline => kreator
  // wraca do pelnej szerokosci wysrodkowanej z CSS (auto-marginesy).
  const creatorStyle =
    measured && mentorOpen
      ? {
          maxWidth: "none",
          width: creatorWidth,
          marginLeft: anchorInPage,
          marginRight: 0,
        }
      : undefined;

  const mentorLayout = useMemo(
    () => ({
      open: mentorOpen,
      setOpen: setMentorOpen,
      width: mentorWidth,
      dragging: mentorResizing,
      separatorProps: mentorSeparatorProps,
    }),
    [mentorOpen, mentorWidth, mentorResizing, mentorSeparatorProps],
  );

  return (
    <MentorLayoutContext.Provider value={mentorLayout}>
      <div
        className={`${styles.page} ${mentorResizing ? styles.pageResizing : ""}`}
        ref={pageElRef}
      >
        <main className={styles.main} style={creatorStyle}>
          <BackButton href={`/projekty/${projectId}/agenty`}>
            Agenty{project ? ` — ${project.name}` : ""}
          </BackButton>

          {loading && (
            <div className={styles.info}>Wczytuję agenta z bazy…</div>
          )}

          {loadError && (
            <div className={styles.error} role="alert">
              <div className={styles.errorTitle}>
                Nie udało się wczytać agenta
              </div>
              {loadError}
            </div>
          )}

          {!loading && !loadError && (
            // Naglowek (nazwa + zapis) i cala konfiguracja siedza teraz
            // wewnatrz kreatora master-detail.
            <MasterDetailCreator
              onSave={handleSave}
              saveStatus={saveStatus}
              hasUnsavedChanges={hasUnsavedChanges}
              saveError={saveError}
            />
          )}
        </main>

        <MentorPanel />
        <DebugPanel />
      </div>
    </MentorLayoutContext.Provider>
  );
}
