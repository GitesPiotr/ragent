import { Sidebar } from "@/components/workspace/Sidebar";
// Ten sam uklad co Projekty/Agenty (sidebar + tresc) — spojny obszar roboczy.
import styles from "../projekty/layout.module.css";

export default function ChatsLayout({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
