"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import styles from "./Sidebar.module.css";

// Nawigacja obszaru roboczego. Aktywna zakladka wynika z URL (usePathname),
// a nie z lokalnego stanu — dzieki temu odswiezenie strony niczego nie gubi.
export function Sidebar() {
  const pathname = usePathname();
  const params = useParams();
  const projectId = params?.projectId;

  const onProjects = pathname === "/projekty";
  // Aktywne na kazdej trasie agentow: /agenty oraz /projekty/[id]/agenty(/[id]).
  const onAgents = pathname.includes("/agenty");
  const onChats = pathname.startsWith("/czaty");
  const onSettings = pathname.startsWith("/ustawienia");

  // Zakladka Agenty jest ZAWSZE widoczna. Gdy jestesmy w projekcie, prowadzi
  // do jego agentow (zachowuje kontekst); bez projektu — na ekran globalny,
  // ktory wyjasnia sytuacje i pokazuje liste projektow.
  const agentsHref = projectId ? `/projekty/${projectId}/agenty` : "/agenty";

  return (
    <nav className={styles.sidebar}>
      <div className={styles.brand}>AIdeas</div>

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
      </div>
    </nav>
  );
}
