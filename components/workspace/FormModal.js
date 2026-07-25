"use client";

import { useEffect } from "react";
import styles from "./FormModal.module.css";

// Wspolna skorupa modala z formularzem — uzywaja jej listy projektow i agentow.
// Pola przekazuje strona jako children, tu siedzi tylko obudowa i zamykanie:
// X, Escape, klikniecie w tlo, przycisk Anuluj.
export function FormModal({
  title,
  titleId,
  submitLabel,
  savingLabel = "Zapisuję…",
  onSubmit,
  onClose,
  saving,
  canSubmit,
  error,
  // "danger" = operacja nieodwracalna (trwale usuniecie) — czerwony submit.
  tone = "primary",
  children,
}) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" && !saving) onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  return (
    <div
      className={styles.modalOverlay}
      // mousedown (nie click), zeby przeciagniecie z wnetrza modala na tlo
      // — np. zmiana rozmiaru textarea — nie zamykalo okna.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle} id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            disabled={saving}
            aria-label="Zamknij"
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className={styles.modalBody}>
            {error && (
              <div className={styles.modalError} role="alert">
                {error}
              </div>
            )}
            {children}
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={onClose}
              disabled={saving}
            >
              Anuluj
            </button>
            <button
              type="submit"
              className={
                tone === "danger" ? styles.dangerButton : styles.primaryButton
              }
              disabled={saving || !canSubmit}
            >
              {saving ? savingLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
