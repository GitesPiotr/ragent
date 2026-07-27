import { Sidebar } from "@/components/workspace/Sidebar";
// Ten sam uklad co obszary Projekty i Agenty (sidebar + tresc) —
// wspoldzielimy arkusz, zeby wszystkie zakladki wygladaly identycznie.
import styles from "../projekty/layout.module.css";

// Magazyn wiedzy jest GLOBALNY w obrebie konta — nie ma tu kontekstu projektu,
// wiec i trasa jest plaska: /wiedza, bez zadnego [projectId].
export default function KnowledgeLayout({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
