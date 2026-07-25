"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listProjects } from "@/lib/data/projects";
// Ekran agentow BEZ wybranego projektu wspoldzieli styl z listami
// projektow/agentow — te same karty, przyciski i kolory.
import styles from "../projekty/workspace.module.css";

// Agenci naleza do projektu. Ta trasa (/agenty) jest wejsciem "globalnym"
// z sidebara, gdy zaden projekt nie jest wybrany — dlatego zamiast pustki
// pokazujemy wyjasnienie i od razu liste projektow jako skrot do ich agentow.
export default function AgentsIndexPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const data = await listProjects({ includeArchived: false });
        if (!alive) return;
        setProjects(data);
        setError(null);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={styles.listPage}>
      <div className={styles.header}>
        <h1 className={styles.title}>Agenty</h1>
        <p className={styles.subtitle}>
          Agenci należą do projektu — nie ma agentów „bez projektu”. Wybierz
          projekt poniżej, aby zobaczyć i konfigurować jego agentów.
        </p>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          <div className={styles.errorTitle}>Problem z połączeniem z bazą</div>
          {error}
        </div>
      )}

      {loading ? (
        <div className={styles.info}>Wczytuję projekty…</div>
      ) : projects.length === 0 ? (
        <div className={styles.info}>
          Nie masz jeszcze żadnego projektu, więc nie ma gdzie trzymać agentów.
          <div className={styles.cardActions} style={{ justifyContent: "center" }}>
            <Link href="/projekty" className={styles.primaryLink}>
              Przejdź do projektów →
            </Link>
          </div>
        </div>
      ) : (
        <div className={styles.list}>
          {projects.map((project) => (
            <div key={project.id} className={styles.card}>
              <div className={styles.cardTop}>
                <h2 className={styles.cardTitle}>
                  <Link
                    href={`/projekty/${project.id}/agenty`}
                    className={styles.cardTitleLink}
                  >
                    {project.name}
                  </Link>
                </h2>
              </div>

              {project.description && (
                <p className={styles.cardDesc}>{project.description}</p>
              )}

              <div className={styles.cardActions}>
                <Link
                  href={`/projekty/${project.id}/agenty`}
                  className={styles.primaryLink}
                >
                  Zobacz agentów →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
