import { Sidebar } from "@/components/workspace/Sidebar";
import styles from "./layout.module.css";

// Wspolny uklad obszaru roboczego: sidebar + tresc.
// Obejmuje /projekty oraz /projekty/[projectId]/agenty.
export default function ProjectsLayout({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
