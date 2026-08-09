"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import styles from "./Sidebar.module.css";

// Nawigacja obszaru roboczego. Aktywna zakladka wynika z URL (usePathname),
// a nie z lokalnego stanu — dzieki temu odswiezenie strony niczego nie gubi.
export function Sidebar() {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId;

  // Email zalogowanego uzytkownika — pokazywany nad przyciskiem wylogowania.
  const [email, setEmail] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!supabase) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (alive) setEmail(user?.email ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      // Wylogowanie po stronie serwera czysci ciasteczka sesji; klient czysci
      // swoj stan. Dopiero oba razem daja pewne wylogowanie.
      await fetch("/api/auth/wyloguj", { method: "POST" });
      if (supabase) await supabase.auth.signOut();
    } catch {
      /* i tak przechodzimy na ekran logowania */
    }
    router.replace("/logowanie");
    router.refresh();
  }

  const onProjects = pathname === "/projekty";
  // Aktywne na kazdej trasie agentow: /agenty oraz /projekty/[id]/agenty(/[id]).
  const onAgents = pathname.includes("/agenty");
  const onKnowledge = pathname.startsWith("/wiedza");
  // startsWith, nie ===, bo zakladka ma glebsze trasy: /kreator-rag/kolekcje/[id]
  // oraz jej widoki /mapa i /graf, a takze /kreator-rag/diagnostyka. Podswietlenie
  // ma zostac na calej gałęzi — takze wtedy, gdy link celuje glebiej niz korzen.
  const onKreatorRag = pathname.startsWith("/kreator-rag");
  const onChats = pathname.startsWith("/czaty");
  const onSettings = pathname.startsWith("/ustawienia");

  // Zakladka Agenty jest ZAWSZE widoczna. Gdy jestesmy w projekcie, prowadzi
  // do jego agentow (zachowuje kontekst); bez projektu — na ekran globalny,
  // ktory wyjasnia sytuacje i pokazuje liste projektow.
  const agentsHref = projectId ? `/projekty/${projectId}/agenty` : "/agenty";

  return (
    <nav className={styles.sidebar}>
      {/* OBA WARIANTY SIEDZA W DOM, przelacza je CSS — a nie odczyt motywu w JS.
          Gdyby o wyborze decydowal JavaScript, przy pierwszym renderze (jeszcze
          bez data-theme) trzeba by zgadywac, a przy „auto" zgadnac sie nie da.

          Napis w logo jest cyjanowo-bialy: na jasnym pasku #fbfaff daje 1,28:1
          i 1,02:1, czyli jest niewidoczny. Dlatego w motywie jasnym zostaje stary
          tekst, dopoki jasny nie zostanie przerobiony (etap 4b).

          alt na obrazie niesie nazwe, tekst zapasowy jest aria-hidden — inaczej
          czytnik ekranu przeczytalby obie nazwy pod rzad.

          BEZ priority, choc logo stoi nad zgieciem. priority dokłada do <head>
          wstepne pobranie, ktore w motywie jasnym pobieraloby obraz nigdy nie
          pokazany — z ostrzezeniem w konsoli o nieuzytym preloadzie. Domyslne
          leniwe ladowanie zachowuje sie tu lepiej: w ciemnym obraz jest w polu
          widzenia, wiec i tak rusza od razu, a w jasnym display: none sprawia,
          ze nie rusza wcale. */}
      <Link href="/projekty" className={styles.brand} aria-label="RAGent — Projekty">
        <Image
          src="/ragent-pelne.png"
          alt="RAGent"
          width={152}
          height={195}
          className={styles.brandLogo}
        />
        <span className={styles.brandTekst} aria-hidden="true">
          AIdeas
        </span>
      </Link>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Obszar roboczy</span>

        <Link
          href="/projekty"
          className={`${styles.link} ${onProjects ? styles.active : ""}`}
        >
          Projekty
        </Link>

        <Link
          href={agentsHref}
          className={`${styles.link} ${onAgents ? styles.active : ""}`}
        >
          Agenty
        </Link>

        {/* Magazyn wiedzy jest wspolny dla calego konta, wiec link NIE niesie
            kontekstu projektu — w odroznieniu od „Agenty” powyzej. */}
        <Link
          href="/wiedza"
          className={`${styles.link} ${onKnowledge ? styles.active : ""}`}
        >
          Baza wiedzy
        </Link>

        {/* Kolekcje RAG naleza do konta, nie do projektu — link tak samo jak
            „Baza wiedzy” nie niesie kontekstu projektu.

            LINK CELUJE W KORZEN MODULU, nie w liste kolekcji. Poprzednio bylo
            odwrotnie, z uzasadnieniem „korzen i tak przekierowuje na kolekcje,
            wiec celowanie w niego kosztowaloby jeden skok". To przestalo
            obowiazywac: /kreator-rag nie jest juz przekierowaniem, tylko ekranem
            wejsciowym z wyborem — instrukcja albo praca. Skoku nie ma, jest
            osobna tresc.

            Podswietlenie dziala bez zmian, bo `onKreatorRag` sprawdza startsWith,
            wiec obejmuje /kreator-rag, /samouczek, /kolekcje, /kolekcje/[id],
            /mapa, /graf i /diagnostyka. */}
        <Link
          href="/kreator-rag"
          className={`${styles.link} ${onKreatorRag ? styles.active : ""}`}
        >
          Kreator RAG
        </Link>

        <Link
          href="/czaty"
          className={`${styles.link} ${onChats ? styles.active : ""}`}
        >
          Czaty
        </Link>
      </div>

      {/* Kreator agenta nie ma juz wlasnej trasy — otwiera sie dla konkretnego
          agenta (Projekty → projekt → agent → „Konfiguruj”). Mentor jest
          wysuwanym panelem dostepnym z poziomu kreatora. */}

      {/* Ustawienia — przyklejone na DOLE sidebara. */}
      <div className={styles.bottom}>
        <Link
          href="/ustawienia"
          className={`${styles.link} ${onSettings ? styles.active : ""}`}
        >
          <span className={styles.linkIcon} aria-hidden="true">
            ⚙
          </span>
          Ustawienia
        </Link>

        <div className={styles.account}>
          {email && (
            <span className={styles.accountEmail} title={email}>
              {email}
            </span>
          )}
          <button
            type="button"
            className={styles.logoutButton}
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Wylogowuję…" : "Wyloguj się"}
          </button>
        </div>
      </div>
    </nav>
  );
}
