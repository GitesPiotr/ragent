import { Sidebar } from "@/components/workspace/Sidebar";
// Ten sam uklad co obszar Projekty (sidebar + tresc) — wspoldzielimy arkusz,
// zeby /agenty i /projekty wygladaly identycznie.
import styles from "../projekty/layout.module.css";

// Globalne wejscie w agentow (bez wybranego projektu). Uklad taki sam jak
// /projekty, dzieki czemu sidebar i szerokosc tresci sa spojne.
export default function AgentsIndexLayout({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
