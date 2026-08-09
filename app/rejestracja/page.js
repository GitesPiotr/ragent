"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, isSupabaseConfigured, SUPABASE_CONFIG_ERROR } from "@/lib/supabase/client";
import styles from "../logowanie/auth.module.css";

function readableAuthError(error) {
  const msg = String(error?.message || "");

  if (/already registered|already exists/i.test(msg)) {
    return "Konto z tym adresem email już istnieje. Przejdź do logowania.";
  }
  if (/password/i.test(msg) && /short|least|6/i.test(msg)) {
    return "Hasło jest za krótkie — użyj co najmniej 6 znaków.";
  }
  if (/valid email|invalid email/i.test(msg)) {
    return "Podaj poprawny adres email.";
  }
  if (/rate limit|too many/i.test(msg)) {
    return "Za dużo prób. Odczekaj chwilę i spróbuj ponownie.";
  }
  if (/fetch failed|Failed to fetch|NetworkError/i.test(msg)) {
    return "Brak połączenia z Supabase. Sprawdź internet i NEXT_PUBLIC_SUPABASE_URL w .env.local.";
  }
  return msg || "Nie udało się utworzyć konta.";
}

// REJESTRACJA JEST WYLACZONA PO STRONIE SUPABASE
// (Authentication -> Providers -> Allow new users to sign up = off).
//
// Trasa zostaje, formularz nie. Powody, zeby nie kasowac calego katalogu:
//   • /rejestracja jest wpisana w PUBLIC_PATHS w proxy.js, wiec usuniecie
//     strony zostawiloby publiczna trase prowadzaca w 404,
//   • adres moze byc w czyichs zakladkach i w historii, a 404 nic nie tlumaczy,
//   • formularz nizej DZIALA. Wlaczenie rejestracji z powrotem to przestawienie
//     przelacznika w Supabase i tej jednej stalej — nie pisanie 180 linii
//     od nowa.
//
// Gdyby rejestracja wracala na stale: `readableAuthError` nizej NIE MA wzorca
// na odmowe „signups not allowed", wiec przy wylaczonym przelaczniku uzytkownik
// zobaczylby surowy angielski komunikat. Warto go wtedy dopisac.
const REJESTRACJA_WYLACZONA = true;

// Zaslepka. Korzysta z tego samego arkusza co formularz, wiec zostaje
// w motywie jasnym — patrz docs/dlugi.md.
function RejestracjaWylaczona() {
  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>AIdeas</div>
        <h1 className={styles.title}>Rejestracja jest wyłączona</h1>
        <p className={styles.subtitle}>
          Konta zakłada administrator. Jeśli potrzebujesz dostępu, napisz na{" "}
          <a className={styles.link} href="mailto:pit321@op.pl">
            pit321@op.pl
          </a>
          .
        </p>

        <div className={styles.footer}>
          <Link className={styles.link} href="/logowanie">
            Wróć do logowania
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return REJESTRACJA_WYLACZONA ? <RejestracjaWylaczona /> : <FormularzRejestracji />;
}

// PONIZEJ NIC SIE NIE ZMIENILO poza nazwa komponentu. Caly przeplyw signUp,
// walidacja i mapa bledow czekaja w calosci na wypadek wlaczenia rejestracji.
function FormularzRejestracji() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Gdy Supabase wymaga potwierdzenia emaila, konto powstaje bez sesji —
  // wtedy zamiast przekierowania pokazujemy komunikat.
  const [needsConfirm, setNeedsConfirm] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;

    if (!isSupabaseConfigured || !supabase) {
      setError(SUPABASE_CONFIG_ERROR);
      return;
    }
    if (password !== password2) {
      setError("Hasła nie są takie same.");
      return;
    }
    if (password.length < 6) {
      setError("Hasło musi mieć co najmniej 6 znaków.");
      return;
    }

    setError(null);
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(readableAuthError(authError));
      setLoading(false);
      return;
    }

    // Sesja jest od razu tylko wtedy, gdy potwierdzanie emaila jest wylaczone.
    if (data.session) {
      router.replace("/projekty");
      router.refresh();
      return;
    }

    setNeedsConfirm(true);
    setLoading(false);
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>AIdeas</div>
        <h1 className={styles.title}>Załóż konto</h1>
        <p className={styles.subtitle}>
          Konto jest potrzebne, żeby Twoje projekty i agenci były przypisane do
          Ciebie.
        </p>

        {needsConfirm ? (
          <>
            <div className={styles.info} role="status">
              Konto zostało utworzone. Na podany adres poszedł link
              aktywacyjny — kliknij go, a potem wróć tutaj i zaloguj się.
            </div>
            <div className={styles.footer}>
              <Link className={styles.link} href="/logowanie">
                Przejdź do logowania
              </Link>
            </div>
          </>
        ) : (
          <>
            <form className={styles.form} onSubmit={handleSubmit}>
              {error && (
                <div className={styles.error} role="alert">
                  {error}
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.label} htmlFor="signup-email">
                  Email
                </label>
                <input
                  id="signup-email"
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  required
                  disabled={loading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="signup-password">
                  Hasło
                </label>
                <input
                  id="signup-password"
                  className={styles.input}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  disabled={loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="signup-password2">
                  Powtórz hasło
                </label>
                <input
                  id="signup-password2"
                  className={styles.input}
                  type="password"
                  autoComplete="new-password"
                  required
                  disabled={loading}
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                />
              </div>

              <button className={styles.button} type="submit" disabled={loading}>
                {loading ? "Zakładam konto…" : "Załóż konto"}
              </button>
            </form>

            <div className={styles.footer}>
              Masz już konto?{" "}
              <Link className={styles.link} href="/logowanie">
                Zaloguj się
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
