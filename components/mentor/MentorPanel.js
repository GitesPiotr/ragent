"use client";

import { useRef, useState } from "react";
import { useAppState } from "@/lib/state/StateContext";
import {
  updateAgentField,
  setActivity,
  setLastEvent,
} from "@/lib/state/actions";
import { useMentorLayout } from "./MentorLayoutContext";
import { useCreatorFocus } from "@/components/creator/CreatorFocusContext";
import { useSettings } from "@/lib/settings/SettingsContext";
import { RAG_TOOL_ID, getParameter } from "@/lib/creator/parameters";
import { wyjsciaDlaWiadomosci, RODZAJ, STYL } from "@/lib/mentor/wyjscia";
import styles from "./MentorPanel.module.css";

// Czytelne etykiety pol i narzedzi (do kart propozycji).
const FIELD_LABELS = {
  persona: "Osobowość (persona)",
  model: "Model",
  temperature: "Temperatura",
  rules: "Zasady",
  tools: "Narzędzia",
  knowledgeBase: "Baza wiedzy",
  rag: "RAG — przeszukiwana kolekcja",
};
// Prowadzenie proponuje tylko kalkulator i date/czas (patrz lib/mentor/prompt.js),
// ale mentor ZNA juz z wiedzy takze wyszukiwanie w internecie — wiec ekstraktor
// potrafi je czasem wypisac. Etykieta jest tu po to, zeby karta propozycji
// pokazala wtedy nazwe z UI, a nie surowe „web_search".
const TOOL_LABELS = {
  calculator: "kalkulator",
  datetime: "data/czas",
  web_search: "wyszukiwanie w internecie",
};

// Podglad proponowanej wartosci dla danego pola.
function ProposalValue({ proposal }) {
  const { field, value } = proposal;

  // PLIKI I KOLEKCJE POKAZUJEMY NAZWAMI, NIE IDENTYFIKATORAMI.
  // `value` to UUID-y z konta — dla laika ciag bez znaczenia, a to jedyna
  // rzecz, ktora zobaczy przed klinieciem „Zaakceptuj". Nazwy dokleja trasa
  // (`etykiety`), bo tylko ona ma swieza liste z bazy.
  if (field === "knowledgeBase" || field === "rag") {
    const nazwy = Array.isArray(proposal.etykiety) ? proposal.etykiety : [];
    if (nazwy.length === 0) return <span>—</span>;
    if (nazwy.length === 1) return <span>{nazwy[0]}</span>;
    return (
      <ul className={styles.proposalList}>
        {nazwy.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    );
  }

  if (field === "rules") {
    return (
      <ul className={styles.proposalList}>
        {value.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    );
  }
  if (field === "tools") {
    return (
      <span>
        {value.length > 0
          ? value.map((t) => TOOL_LABELS[t] || t).join(", ")
          : "brak narzędzi"}
      </span>
    );
  }
  if (field === "temperature") {
    return <span>{value}</span>;
  }
  return <span>{value}</span>;
}

export function MentorPanel() {
  const { state, dispatch } = useAppState();
  const agent = state.agent;

  // Otwarcie/zamkniecie i szerokosc panelu pochodza z layoutu strony —
  // dzieki temu przeciaganie krawedzi mentora moze zwezac kreator.
  const {
    open,
    setOpen,
    width: mentorWidth,
    dragging: resizing,
    separatorProps,
  } = useMentorLayout();

  // KTORA KARTA KREATORA JEST OTWARTA. Mentor stoi obok kreatora i do tej pory
  // nie mial jak tego zobaczyc: user klikal „RAG", pytal „co to jest?",
  // a mentor nie wiedzial, o czym mowa.
  //
  // setActiveId i setKrokMentora ida w DRUGA strone: prowadzenie samo otwiera
  // i podswietla karte, o ktorej wlasnie mowi.
  const { activeId, setActiveId, setKrokMentora } = useCreatorFocus();

  // Prowadzenie doszlo do kroku `step` -> pokaz i otworz jego karte.
  //
  // SPRAWDZAMY, CZY TEN KROK MA W OGOLE KARTE. Ostatni krok schematu to "done",
  // ktore karta nie jest: samo `setActiveId("done")` zostawiloby prawa kolumne
  // kreatora pusta — bez sekcji i bez ekranu wyboru. Rejestr parametrow jest
  // tu jedynym sedzia, wiec nie powstaje druga lista krokow.
  function pokazKrokWKreatorze(step) {
    if (!step || !getParameter(step)) return;
    setKrokMentora(step);
    setActiveId(step);
  }

  const { settings } = useSettings();
  // Ustawienia wpływające na kod serwerowy mentora — dołączane do KAŻDEGO
  // zapytania; serwer je waliduje (model tylko z listy Anthropic).
  //
  // `aktywnaKarta` jedzie tą samą drogą i tak samo NIE JEST ZAUFANA: serwer
  // sprawdza ją wobec rejestru parametrów i nieznaną traktuje jak jej brak.
  const mentorApiSettings = {
    mentorModel: settings.mentorModel,
    ollamaUrl: settings.ollamaUrl,
    aktywnaKarta: activeId,
  };

  const [mode, setMode] = useState(null); // null | "reactive" | "guided"
  const [messages, setMessages] = useState([]); // { role, content, proposal?, applied? }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesRef = useRef(null);

  // KROK PERSONA (tylko ten krok) — ktora sciezke wybral user:
  // null = jeszcze nie wybral (pokazujemy dwa przyciski)
  // "self" = opisuje sam, mentor ocenia (tryb feedbacku)
  // "propose" = mentor proponuje (dotychczasowe prowadzenie)
  // "done" = persona zaakceptowana, wracamy do normalnego prowadzenia
  const [personaPath, setPersonaPath] = useState(null);
  const [personaDraft, setPersonaDraft] = useState("");

  // Czy pod rozmowa stoi POLE EDYCJI opisu, czy BLOK TRZECH WYJSC.
  //
  // Do tej rundy pole stalo tam zawsze, gdy personaPath === "self" — i to bylo
  // caly slepy zaulek: mentor wypisywal braki, a jedyna dostepna czynnoscia
  // bylo napisanie lepszego opisu. Kto by to umial, nie potrzebowalby mentora.
  // Po ocenie pole ustepuje wiec miejsca wyborowi: popraw sam / niech mentor
  // napisze na podstawie tego, co juz powiedzieliscie / akceptuj jak jest.
  const [edycjaOpisu, setEdycjaOpisu] = useState(false);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // PRZEWIJA DO POCZATKU WSKAZANEJ WYPOWIEDZI, NIE NA SAMO DNO.
  //
  // Roznica jest cala usterka feedbacku persony: ocena opisu ma kilkanascie
  // linii, a pod nia stoi karta z wlasnym tekstem uzytkownika. Przewiniecie na
  // dno stawialo mu przed oczami te karte, a ocene zostawialo nad krawiedzia —
  // wygladalo to tak, jakby mentor oddal jego tekst bez slowa komentarza.
  //
  // =========================================================================
  //  JEDNA KLATKA NIE WYSTARCZA — SPRAWDZONE W PRZEGLADARCE.
  //
  //  Pomiar w pierwszej klatce po odpowiedzi trafia w uklad, ktorego jeszcze
  //  nie ma w koncowej postaci: aktualizacja przychodzi z funkcji async, wiec
  //  commit Reacta potrafi wypasc PO najblizszej klatce, a nawet po nim pod
  //  wypowiedzia dochodzi karta propozycji i przesuwa wszystko ponizej.
  //  Przewiniecie policzone przed tym wzrostem konczylo sie na dole odpowiedzi.
  //
  //  Dlatego pomiar jest POWTARZANY az do ustalenia sie wyniku, a nie zrobiony
  //  raz. Wolno to zrobic, bo korekta jest WZGLEDNA (roznica dwoch
  //  getBoundingClientRect doklejona do scrollTop): gdy uklad juz stoi, kolejna
  //  korekta wychodzi zerowa i petla gasnie sama. Budzet klatek zamyka
  //  przypadek, w ktorym wypowiedz jest za krotka, zeby dalo sie ja wypchnac
  //  na gore kontenera — wtedy scrollTop dobija do maksimum i roznica nigdy
  //  nie zejdzie do zera.
  //
  //  getBoundingClientRect, a nie offsetTop: kontener .messages nie ma
  //  position: relative, wiec offsetParent dymka to nie on — offsetTop
  //  mierzylby odleglosc od czegos innego niz obszar przewijania.
  // =========================================================================
  const ODDECH = 8; // px zapasu nad pierwsza linia wypowiedzi

  function scrollToMessage(index, klatki = 8) {
    requestAnimationFrame(() => {
      const el = messagesRef.current;
      if (!el) return;

      const node = el.querySelector(`[data-mentor-msg="${index}"]`);
      // Wiadomosci nie ma jeszcze w DOM — czekamy, zamiast przewijac
      // gdziekolwiek. Bledny cel jest gorszy niz jedna klatka zwloki.
      if (!node) {
        if (klatki > 0) scrollToMessage(index, klatki - 1);
        return;
      }

      const delta =
        node.getBoundingClientRect().top -
        el.getBoundingClientRect().top -
        ODDECH;
      if (Math.abs(delta) < 1) return; // juz na miejscu

      el.scrollTop += delta;
      if (klatki > 0) scrollToMessage(index, klatki - 1);
    });
  }

  function resetConversation() {
    setMessages([]);
    setError(null);
    setInput("");
    setPersonaPath(null);
    setPersonaDraft("");
    setEdycjaOpisu(false);
    // Koniec prowadzenia (zmiana trybu, start nowego) -> nie ma juz kroku,
    // ktory mentor omawia. Bez tego karta pokazana „na czas omawiania"
    // zostawalaby na liscie po wyjsciu z prowadzenia — czyli dokladnie
    // wbrew regule, ktora ma znikac, gdy nic w niej nie ustawiono.
    setKrokMentora(null);
  }

  function chooseMode(m) {
    resetConversation();
    setMode(m);
    if (m === "guided") {
      // Tryb prowadzenia startuje sam - mentor zaczyna od persony.
      //
      // `ukryta` — patrz komentarz przy renderze listy wiadomosci: ta tura
      // jedzie do modelu, ale nie pokazuje sie na ekranie jako slowa „Ty".
      const kickoff = {
        role: "user",
        content: "Zacznijmy — poprowadź mnie krok po kroku.",
        ukryta: true,
      };
      setMessages([kickoff]);
      runGuided([kickoff], agent);
    }
  }

  function backToModes() {
    setMode(null);
    resetConversation();
  }

  // Zamienia lokalne wiadomosci na format wysylany do API (tylko role+content).
  function toApiMessages(list) {
    return list.map((m) => ({ role: m.role, content: m.content }));
  }

  // --- TRYB REAKTYWNY (bez zmian wzgledem poprzedniej sesji) ---
  async function sendReactive() {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    scrollToBottom();

    dispatch(setActivity("mentor-thinking"));
    dispatch(setLastEvent({ type: "mentor-request" }));

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent,
          messages: toApiMessages(next),
          ...mentorApiSettings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wystąpił błąd serwera.");

      setMessages([...next, { role: "assistant", content: data.reply }]);
      dispatch(setLastEvent({ type: "mentor-reply" }));
    } catch (e) {
      setError(e.message);
      dispatch(setLastEvent({ type: "mentor-error", message: e.message }));
    } finally {
      setLoading(false);
      dispatch(setActivity("idle"));
      scrollToBottom();
    }
  }

  // --- TRYB PROWADZENIA ---
  // history: pelna lista wiadomosci do wyslania; agentForApi: stan agenta,
  // ktory ma zobaczyc mentor (wazne przy akceptacji - przekazujemy juz
  // zaktualizowany stan, nie czekajac na re-render Reacta).
  async function runGuided(history, agentForApi) {
    setError(null);
    setLoading(true);
    scrollToBottom();

    dispatch(setActivity("mentor-thinking"));
    dispatch(setLastEvent({ type: "mentor-request" }));

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "guided",
          agent: agentForApi,
          messages: toApiMessages(history),
          ...mentorApiSettings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wystąpił błąd serwera.");

      setMessages([
        ...history,
        {
          role: "assistant",
          content: data.message,
          proposal: data.proposal || null,
          step: data.step || null,
        },
      ]);
      dispatch(setLastEvent({ type: "mentor-reply" }));
      // Karta kroku, o ktorym mentor wlasnie mowi, pokazuje sie i otwiera.
      pokazKrokWKreatorze(data.step);
    } catch (e) {
      setError(e.message);
      dispatch(setLastEvent({ type: "mentor-error", message: e.message }));
    } finally {
      setLoading(false);
      dispatch(setActivity("idle"));
      scrollToBottom();
    }
  }

  function sendGuidedUser() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    runGuided(next, agent);
  }

  // --- KROK PERSONA, ŚCIEŻKA A ("Opisz sam") — mentor OCENIA opis usera.
  // Osobny endpoint (mode: "persona-feedback"): jeden etap, czysta proza,
  // a propozycja do kreatora to WŁASNY tekst usera (trafia slowo w slowo).
  async function sendPersonaDraft() {
    const draft = personaDraft.trim();
    if (!draft || loading) return;

    const next = [
      ...messages,
      { role: "user", content: `Oto mój opis osobowości:\n\n${draft}` },
    ];
    setMessages(next);
    setError(null);
    setLoading(true);
    scrollToBottom();

    dispatch(setActivity("mentor-thinking"));
    dispatch(setLastEvent({ type: "mentor-request" }));

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "persona-feedback",
          agent,
          personaDraft: draft,
          // KTORA TO OCENA — LICZONE W KODZIE, NIE PRZEZ MODEL.
          // Od tego zalezy ton: przy pierwszej mentor moze wskazywac braki,
          // przy kolejnych ma umiec powiedziec „wystarczy" i przestac pytac.
          // Liczenie wlasnych wypowiedzi w historii jest dokladnie ta klasa
          // zadania, w ktorej modele sie myla — a tu odpowiedz jest pewna:
          // tyle ocen juz wrocilo, plus ta.
          personaRunda: messages.filter((m) => m.proposal?.wlasny).length + 1,
          messages: toApiMessages(next),
          ...mentorApiSettings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wystąpił błąd serwera.");

      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.message,
          proposal: data.proposal || null,
          step: data.step || null,
        },
      ]);
      dispatch(setLastEvent({ type: "mentor-reply" }));
      // Ocena persony tez jest krokiem prowadzenia — karta „Osobowość" ma
      // byc wtedy otwarta (jest stala, wiec chodzi o samo otwarcie).
      pokazKrokWKreatorze(data.step);
      // Ocena wrocila -> pole edycji ustepuje miejsca trzem wyjsciom.
      setEdycjaOpisu(false);
      // POCZATEK OCENY, nie dno panelu — to jest cala poprawka tej sciezki.
      // Indeks WPROST (ocena ląduje na koncu `next`), a nie „ostatni dymek
      // w DOM": w chwili pomiaru ostatnim dymkiem bywa jeszcze opis
      // uzytkownika sprzed odpowiedzi.
      scrollToMessage(next.length);
    } catch (e) {
      setError(e.message);
      dispatch(setLastEvent({ type: "mentor-error", message: e.message }));
      // Blad stoi POD rozmowa, wiec tu przewijamy jak dotad — na dol.
      scrollToBottom();
    } finally {
      setLoading(false);
      dispatch(setActivity("idle"));
    }
  }

  // Przejecie CUDZEGO tekstu do wlasnej edycji — dziala w obie strony:
  // wlasny opis wraca do poprawki, a gotowa propozycja mentora daje sie
  // przerobic, zamiast byc do wziecia albo odrzucenia w calosci.
  function przejmijDoEdycji(tekst) {
    if (loading) return;
    if (typeof tekst === "string") setPersonaDraft(tekst);
    setPersonaPath("self");
    setEdycjaOpisu(true);
  }

  // NARZEDZIA I RAG DZIELA JEDNA KOLUMNE (agents.tools), ALE MAJA OSOBNE KARTY.
  //
  // Mentor prowadzi przez RAG (krok sz-esty), a zaraz potem przez narzedzia —
  // i propozycja narzedzi jest PELNA LISTA, ktora podstawia sie w miejsce
  // dotychczasowej. Bez tego scalenia akceptacja narzedzi kasowala 'rag_search'
  // wpisany krok wczesniej: wyszukiwanie w dokumentach gaslo po cichu, a przy
  // agencie zostawala osierocona kolekcja. Mentor nie zarzadza tym przelacznikiem
  // (ekstraktor nie ma go nawet w schemacie), wiec nie ma prawa go zdejmowac.
  //
  // Ta sama zasada, co przy zdejmowaniu karty w kreatorze —
  // MasterDetailCreator.js: usuniecie jednej sekcji nie rusza ustawien drugiej.
  function zachowajRag(value) {
    const teraz = Array.isArray(agent.tools) ? agent.tools : [];
    if (!teraz.includes(RAG_TOOL_ID) || value.includes(RAG_TOOL_ID)) return value;
    return [...value, RAG_TOOL_ID];
  }

  // =========================================================================
  //  PROPOZYCJA -> KOMPLET POL AGENTA. Nazwa pola w propozycji NIE ZAWSZE jest
  //  nazwa kolumny, a POLOWA propozycji ustawia PARE pol — i to nie jest
  //  wygoda, tylko warunek poprawnosci. Kazda z tych par opisuje jeden stan:
  //   • model bez dostawcy  -> model jednego dostawcy wyslany do drugiego,
  //   • pliki bez trybu     -> zaznaczone pliki przy „nie korzysta",
  //   • kolekcja bez tools  -> wskazana kolekcja i wylaczone wyszukiwanie.
  //  Dwa ostatnie to dokladnie ta „⚠ NIESPÓJNOŚĆ", ktora mentor sam wytyka
  //  uzytkownikowi w renderAgentSettings — nie wolno mu jej samemu tworzyc.
  //
  //  Jedna funkcja zamiast rozsypanych if-ow, bo ten sam komplet potrzebny jest
  //  DWA RAZY: do dispatchow i do `nextAgent` (stan, ktory zaraz zobaczy
  //  mentor). Gdyby powstawal osobno w obu miejscach, mogly by sie rozjechac.
  // =========================================================================
  function polaZPropozycji(proposal) {
    const { field, value } = proposal;

    if (field === "model") {
      return proposal.provider
        ? { model: value, provider: proposal.provider }
        : { model: value };
    }
    if (field === "tools") {
      return { tools: zachowajRag(value) };
    }
    if (field === "knowledgeBase") {
      return { knowledge_file_ids: value, knowledge_mode: "selected" };
    }
    if (field === "rag") {
      const teraz = Array.isArray(agent.tools) ? agent.tools : [];
      return {
        rag_collection_id: value,
        tools: teraz.includes(RAG_TOOL_ID) ? teraz : [...teraz, RAG_TOOL_ID],
      };
    }
    return { [field]: value };
  }

  // SEDNO: akceptacja propozycji -> wpisanie pol do kreatora (stan).
  function acceptProposal(index) {
    const proposal = messages[index]?.proposal;
    if (!proposal || loading) return;

    const zmiany = polaZPropozycji(proposal);

    // 1) Wpisz wartosci do state.agent (widoczne od razu w kreatorze).
    for (const [pole, wartosc] of Object.entries(zmiany)) {
      dispatch(updateAgentField(pole, wartosc));
    }

    dispatch(setLastEvent({ type: "mentor-set-field", field: proposal.field }));

    // Persona zaakceptowana (obiema sciezkami) -> konczymy specjalny krok
    // persony i wracamy do zwyklego prowadzenia dla kolejnych pol.
    if (proposal.field === "persona") setPersonaPath("done");

    // 2) Oznacz propozycje jako zastosowana.
    const marked = messages.map((m, i) =>
      i === index ? { ...m, applied: true } : m,
    );

    // 3) Poinformuj mentora, ze przechodzimy dalej - z JUZ zaktualizowanym stanem.
    //    TEN SAM obiekt `zmiany`, ktory poszedl do dispatchow wyzej: mentor ma
    //    zobaczyc dokladnie to, co za chwile zobaczy uzytkownik w kreatorze.
    const nextAgent = { ...agent, ...zmiany };
    const next = [
      ...marked,
      {
        role: "user",
        content: "Akceptuję tę wartość, przejdźmy dalej.",
        ukryta: true,
      },
    ];
    setMessages(next);
    runGuided(next, nextAgent);
  }

  // Indeks OSTATNIEJ wypowiedzi mentora — pod nia doklejamy wybor sciezki persony,
  // zeby przyciski nie zostawaly przy starych wiadomosciach.
  const lastAssistantIndex = messages.reduce(
    (acc, m, i) => (m.role === "assistant" && m.content ? i : acc),
    -1,
  );

  // =========================================================================
  //  CO UZYTKOWNIK MOZE ZROBIC POD TA WYPOWIEDZIA.
  //
  //  Do tej rundy byly na to DWA osobne mechanizmy (przyciski karty propozycji
  //  i dwa bloki persony), a wiekszosc krokow nie miala zadnego: mentor pytal
  //  „akceptujesz, czy chcesz zmienic?", a pod spodem stal jeden przycisk.
  //
  //  Teraz jest jedno pytanie i jedna odpowiedz. KTORE wyjscia — rozstrzyga
  //  lib/mentor/wyjscia.js (sytuacja: krok + czy jest propozycja).
  //  POD KTORA wiadomoscia i KIEDY — zostaje tutaj, bo to sprawa panelu:
  //  tylko pod ostatnia wypowiedzia mentora, tylko w prowadzeniu i nie w trakcie
  //  czekania na odpowiedz.
  // =========================================================================
  function wyjsciaPod(m, i) {
    if (i !== lastAssistantIndex || mode !== "guided" || loading) return [];
    return wyjsciaDlaWiadomosci({
      krok: m.step,
      propozycja: m.proposal,
      zastosowana: Boolean(m.applied),
      personaPath,
      edycjaOpisu,
    });
  }

  // Jedno wykonanie dla wszystkich wyjsc. Trzy rodzaje, kazdy z implementacja
  // TUTAJ — dlatego tabela w wyjscia.js nie moze obiecac niczego, czego panel
  // nie zrobi.
  function wykonajWyjscie(w, index) {
    if (loading) return;
    const propozycja = messages[index]?.proposal;

    if (w.rodzaj === RODZAJ.AKCEPTUJ) {
      acceptProposal(index);
      return;
    }
    if (w.rodzaj === RODZAJ.WPISZ) {
      if (w.pole === "opis") {
        przejmijDoEdycji(w.przejmijWartosc ? propozycja?.value : undefined);
      }
      return;
    }
    if (w.rodzaj === RODZAJ.POWIEDZ) {
      // Skrot do napisania tego samego recznie — stad ukryta tura uzytkownika.
      //
      // WSZYSTKO IDZIE TRYBEM `guided`, TAKZE PROSBA O GOTOWA PERSONE — i to
      // nie jest oszczednosc, tylko jedyna droga. `persona-feedback` jest
      // jednoetapowy WLASNIE DLATEGO, ze jego propozycja jest znana serwerowi
      // z gory (to tekst uzytkownika); tutaj propozycja ma byc tekstem MENTORA,
      // a proze zamienia w propozycje pola tylko dwuetapowe handleGuided.
      //
      // Kontekstu nie trzeba nigdzie doklejac: toApiMessages wysyla CALA
      // rozmowe, wiec im dluzej ktos poprawial opis, tym lepsza jest odpowiedz.
      if (w.przelaczNaPropozycje) {
        setPersonaPath("propose");
        setEdycjaOpisu(false);
      }
      const next = [
        ...messages,
        { role: "user", content: w.tresc, ukryta: true },
      ];
      setMessages(next);
      runGuided(next, agent);
    }
  }

  // Renderer bloku decyzji — jedyne miejsce, w ktorym wyjscia zamieniaja sie
  // w przyciski. Styl bierze sie z tabeli, nie z rodzaju akcji: ta sama akcja
  // wyglada inaczej jako rownorzedny wybor i jako droga glowna pod karta.
  function BlokWyjsc({ wyjscia, index }) {
    if (wyjscia.length === 0) return null;
    return (
      <div className={styles.pathChoice}>
        {wyjscia.map((w) =>
          w.styl === STYL.KAFEL ? (
            <button
              key={w.id}
              type="button"
              className={styles.pathButton}
              disabled={loading}
              onClick={() => wykonajWyjscie(w, index)}
            >
              <span className={styles.pathTitle}>{w.tytul}</span>
              {w.opis && <span className={styles.pathDesc}>{w.opis}</span>}
            </button>
          ) : (
            <button
              key={w.id}
              type="button"
              className={
                w.styl === STYL.GLOWNY
                  ? styles.acceptButton
                  : styles.secondaryButton
              }
              disabled={loading}
              onClick={() => wykonajWyjscie(w, index)}
            >
              {w.tytul}
            </button>
          ),
        )}
      </div>
    );
  }

  // WIADOMOSCI, KTORE UZYTKOWNIK MA ZOBACZYC.
  //
  // Trzy tury w roli „user" nie pochodza od niego: start prowadzenia,
  // prosba o propozycje persony i potwierdzenie akceptacji. Model MUSI je
  // dostac (bez nich nie wie, ze ma zaczac, zaproponowac albo isc dalej), ale
  // na ekranie stawaly jako jego slowa — laik na pokazie widzial, jak aplikacja
  // pisze za niego. Filtr jest tutaj i tylko tutaj: toApiMessages zostaje bez
  // zmian, wiec historia idaca do mentora jest dalej pelna.
  const widoczne = messages.filter((m) => m.content && !m.ukryta);

  // KONIEC PROWADZENIA — dwa wyzwalacze, bo jeden nie wystarcza.
  //
  // `step: "done"` zalezy od tego, czy EKSTRAKTOR je wypisze — to zachowanie
  // modelu, nie kodu, wiec samo w sobie nie jest gwarancja. Drugi wyzwalacz
  // jest twardy: zaakceptowana propozycja OSTATNIEGO kroku znaczy, ze kreator
  // jest wypelniony do konca.
  //
  // OSTATNIM KROKIEM SA ZASADY, NIE NARZEDZIA (GUIDED_STEPS w lib/mentor/
  // prompt.js). To jedyne miejsce w kodzie, ktore zna POZYCJE kroku, a nie
  // sama nazwe — przy zmianie kolejnosci prowadzenia trzeba je poprawic razem
  // z tamta lista, inaczej podsumowanie wyskakuje o krok za wczesnie.
  const guidedFinished =
    mode === "guided" &&
    messages.some(
      (m) =>
        m.step === "done" ||
        (m.applied && m.proposal?.field === "rules"),
    );

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (mode === "guided") sendGuidedUser();
      else sendReactive();
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "✕ Zamknij mentora" : "💡 Mentor"}
      </button>

      {open && (
        <aside className={styles.panel} style={{ width: mentorWidth }}>
          {/* Przesuwalny uchwyt na LEWEJ krawedzi panelu */}
          <div
            className={`${styles.resizer} ${resizing ? styles.resizerActive : ""}`}
            {...separatorProps}
          />

          <div className={styles.header}>
            <h2 className={styles.title}>Mentor AIDEAS</h2>
            {mode === null ? (
              <p className={styles.subtitle}>
                Wybierz, jak mam Ci pomóc.
              </p>
            ) : (
              <button
                type="button"
                className={styles.backButton}
                onClick={backToModes}
              >
                ← zmień tryb
              </button>
            )}
          </div>

          {/* Wybor trybu */}
          {mode === null && (
            <div className={styles.modePicker}>
              <button
                type="button"
                className={styles.modeButton}
                onClick={() => chooseMode("reactive")}
              >
                <span className={styles.modeTitle}>Zapytaj mentora</span>
                <span className={styles.modeDesc}>
                  Zadaj dowolne pytanie o pojęcia i swoje ustawienia.
                </span>
              </button>
              <button
                type="button"
                className={styles.modeButton}
                onClick={() => chooseMode("guided")}
              >
                <span className={styles.modeTitle}>
                  Przeprowadź mnie krok po kroku
                </span>
                <span className={styles.modeDesc}>
                  Poprowadzę Cię przez budowę agenta i wypełnię kreator za Ciebie.
                </span>
              </button>
            </div>
          )}

          {/* Rozmowa */}
          {mode !== null && (
            <>
              <div className={styles.messages} ref={messagesRef}>
                {widoczne.length === 0 && !loading ? (
                  <p className={styles.empty}>Zaraz zaczynamy…</p>
                ) : (
                  messages.map((m, i) =>
                    m.content && !m.ukryta ? (
                      <div key={i} className={styles.msgWrap} data-mentor-msg={i}>
                        <div
                          className={`${styles.message} ${
                            m.role === "user" ? styles.user : styles.mentor
                          }`}
                        >
                          <span className={styles.role}>
                            {m.role === "user" ? "Ty" : "Mentor"}
                          </span>
                          {m.content}
                        </div>

                        {/* Karta propozycji mentora.
                            WŁASNY opis użytkownika (`wlasny`, ścieżka „Opisz
                            sam") NIE dostaje karty: jego akceptacja jest jednym
                            z trzech wyjść pod oceną, a podgląd powtarzałby
                            tekst z pola edycji. Sama propozycja zostaje na
                            wiadomości jako dane — czyta ją acceptProposal. */}
                        {m.role === "assistant" &&
                          m.proposal &&
                          !m.proposal.wlasny && (
                          <div className={styles.proposalCard}>
                            <div className={styles.proposalHead}>
                              Propozycja do pola:{" "}
                              <strong>
                                {FIELD_LABELS[m.proposal.field] ||
                                  m.proposal.field}
                              </strong>
                            </div>
                            <div className={styles.proposalBody}>
                              <ProposalValue proposal={m.proposal} />
                            </div>
                            {/* KARTA POKAZUJE, CO MENTOR PROPONUJE — i tyle.
                                Wszystkie przyciski stoją pod nią, w jednym
                                bloku decyzji, żeby „co proponuję" i „co możesz
                                zrobić" nie były wymieszane. */}
                            {m.applied && (
                              <div className={styles.appliedBadge}>
                                ✓ Wpisano do kreatora
                              </div>
                            )}
                          </div>
                        )}

                        {/* BLOK DECYZJI — jedyne miejsce z akcjami pod
                            wypowiedzią mentora. Które wyjścia się tu pojawią,
                            rozstrzyga lib/mentor/wyjscia.js; ten kod tylko je
                            renderuje. Wcześniej stały tu dwa osobne bloki
                            persony, a reszta kroków nie miała żadnego. */}
                        <BlokWyjsc wyjscia={wyjsciaPod(m, i)} index={i} />
                      </div>
                    ) : null,
                  )
                )}

                {/* KONIEC PROWADZENIA — jedyne miejsce, w ktorym pada prawda
                    o zapisie. Mentor pisze WYLACZNIE do stanu strony; do bazy
                    trafia dopiero „Zapisz" w nagłówku kreatora. Bez tego zdania
                    prowadzenie kończyło się gratulacjami, a odświeżenie strony
                    kasowało całą pracę. */}
                {guidedFinished && !loading && (
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryHead}>
                      ✅ Agent gotowy
                    </div>
                    <p className={styles.summaryText}>
                      Przeszliśmy wszystkie kroki. Możesz jeszcze dopracować
                      każde ustawienie ręcznie w kreatorze.
                    </p>
                    <p className={styles.summaryWarn}>
                      <strong>Kliknij „Zapisz"</strong> u góry kreatora — wartości
                      wpisane w tej rozmowie są na razie tylko na ekranie i znikną
                      po odświeżeniu strony.
                    </p>
                  </div>
                )}

                {loading && (
                  <div className={styles.loader}>
                    <span>Mentor pisze</span>
                    <span className={styles.dots}>
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                )}
              </div>

              {error && <div className={styles.error}>⚠️ {error}</div>}

              {/* ŚCIEŻKA A: własne pole na opis persony + prośba o feedback.
                  Po ocenie pole USTĘPUJE trzem wyjściom (edycjaOpisu) i wraca
                  dopiero, gdy użytkownik wybierze poprawianie — albo przejmie
                  do edycji gotowy opis od mentora. */}
              {mode === "guided" && personaPath === "self" && edycjaOpisu ? (
                <div className={styles.draftBox}>
                  <label className={styles.draftLabel} htmlFor="persona-draft">
                    Twój opis osobowości — rola, styl, zakres, cechy
                  </label>
                  <textarea
                    id="persona-draft"
                    className={styles.draftInput}
                    value={personaDraft}
                    placeholder="Np. Jesteś asystentem do spraw obsługi klienta…"
                    onChange={(e) => setPersonaDraft(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className={styles.sendButton}
                    onClick={sendPersonaDraft}
                    disabled={loading || personaDraft.trim().length === 0}
                  >
                    {messages.some((m) => m.step === "persona" && m.proposal)
                      ? "Poproś o kolejny feedback"
                      : "Poproś o feedback"}
                  </button>
                </div>
              ) : (
              <div className={styles.inputRow}>
                <textarea
                  className={styles.input}
                  value={input}
                  placeholder={
                    mode === "guided"
                      ? "Odpowiedz mentorowi…"
                      : "Zapytaj mentora…"
                  }
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.sendButton}
                  onClick={mode === "guided" ? sendGuidedUser : sendReactive}
                  disabled={loading || input.trim().length === 0}
                >
                  Wyślij
                </button>
              </div>
              )}
            </>
          )}
        </aside>
      )}
    </>
  );
}
