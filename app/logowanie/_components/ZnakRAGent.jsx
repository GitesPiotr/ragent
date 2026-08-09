import styles from "../logowanie.module.css";

// NAPIS „RAGent" pod glowa.
//
// Podzial po trzeciej literze niesie znaczenie, nie jest ozdoba: „RAG" dostaje
// kolor wyszukiwania, „ent" biel czlonu neutralnego — ta sama zasada, co
// w calym nowym wygladzie (kolor znaczy maszyne).
//
// Na tym etapie to ZWYKLY TEKST. W prototypie napis jest najpierw rysowany jako
// obrys na plotnie i dopiero na koncu zamieniany na tekst (dlatego .word ma tam
// opacity: 0). Plotno wchodzi w etapie B — do tego czasu widac od razu klatke
// koncowa, czyli sam napis.

export function ZnakRAGent() {
  return (
    <div className={styles.znak}>
      <div className={styles.znakSlowo}>
        RAG<span className={styles.znakAkcent}>ent</span>
      </div>
    </div>
  );
}
