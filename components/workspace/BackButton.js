import Link from "next/link";
import styles from "./BackButton.module.css";

// Wspolny link "wstecz" — wyglada jak przycisk drugorzedny, dziala jak zwykly
// odnosnik (Link), wiec nawigacja zostaje bez zmian.
// Strzalka jest dodawana tutaj; miejsce wywolania podaje sam tekst.
export function BackButton({ href, children }) {
  return (
    <Link href={href} className={styles.backButton}>
      <span className={styles.arrow} aria-hidden="true">
        ←
      </span>
      {children}
    </Link>
  );
}
