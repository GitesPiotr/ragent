"use client";

import { useEffect, useState } from "react";
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
