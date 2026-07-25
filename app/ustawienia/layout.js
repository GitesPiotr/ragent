import { Sidebar } from "@/components/workspace/Sidebar";
// Ten sam uklad co Projekty/Agenty/Czaty (sidebar + tresc).
import styles from "../projekty/layout.module.css";

export default function SettingsLayout({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
