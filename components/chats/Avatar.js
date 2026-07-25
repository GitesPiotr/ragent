import styles from "./Avatar.module.css";

// Ikona robota (lucide „bot") — rozmowa/wiadomosc z agentem.
function BotIcon({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

// Sylwetka (lucide „user") — wiadomosc uzytkownika.
function UserIcon({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// Kolko z ikona rozmowcy.
//   kind: "agent" | "model" | "user" | "placeholder"
//   tone: "soft" (jasne tlo, kolorowa ikona) | "filled" (mocne tlo, biala ikona)
export function Avatar({ kind, tone = "soft", size = 28 }) {
  let variantClass;
  if (kind === "user") variantClass = styles.user;
  else if (kind === "placeholder") variantClass = styles.placeholder;
  else if (kind === "model")
    variantClass = tone === "filled" ? styles.modelFilled : styles.modelSoft;
  else variantClass = tone === "filled" ? styles.agentFilled : styles.agentSoft;

  const iconSize = Math.round(size * 0.56);

  return (
    <span
      className={`${styles.circle} ${variantClass}`}
      style={{ width: size, height: size }}
    >
      {kind === "model" ? (
        <span className={styles.ai} style={{ fontSize: Math.round(size * 0.4) }}>
          AI
        </span>
      ) : kind === "user" ? (
        <UserIcon size={iconSize} />
      ) : kind === "placeholder" ? (
        <BotIcon size={iconSize} />
      ) : (
        <BotIcon size={iconSize} />
      )}
    </span>
  );
}
