"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase, isSupabaseConfigured, SUPABASE_CONFIG_ERROR } from "@/lib/supabase/client";
import styles from "./auth.module.css";

// Tlumaczy komunikaty Supabase Auth na polski (wzorem lib/data/errors.js).
function readableAuthError(error) {
  const msg = String(error?.message || "");

  if (/Invalid login credentials/i.test(msg)) {
    return "Nieprawidłowy email lub hasło.";
  }
  if (/Email not confirmed/i.test(msg)) {
    return "Konto nie zostało jeszcze potwierdzone. Sprawdź skrzynkę pocztową i kliknij link aktywacyjny.";
  }
  if (/rate limit|too many/i.test(msg)) {
    return "Za dużo prób logowania. Odczekaj chwilę i spróbuj ponownie.";
  }
  if (/fetch failed|Failed to fetch|NetworkError/i.test(msg)) {
    return "Brak połączenia z Supabase. Sprawdź internet i NEXT_PUBLIC_SUPABASE_URL w .env.local.";
  }
  return msg || "Nie udało się zalogować.";
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Dokad wrocic po zalogowaniu (ustawia proxy.js przy przekierowaniu).
  const powrot = searchParams.get("powrot") || "/projekty";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Czy pokazac przycisk logowania deweloperskiego. Decyduje SERWER
  // (tryb dev + obecnosc DEV_LOGIN_* w .env.local) — klient nie zna tych danych.
  const [devAvailable, setDevAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/dev-login", { cache: "no-store" });
        const data = await res.json();
        if (alive) setDevAvailable(Boolean(data.available));
      } catch {
        /* brak informacji -> przycisk sie nie pokazuje */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;

    if (!isSupabaseConfigured || !supabase) {
      setError(SUPABASE_CONFIG_ERROR);
      return;
    }

    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(readableAuthError(authError));
      setLoading(false);
      return;
    }

    // refresh() sprawia, ze serwer zobaczy swiezo ustawione ciasteczka sesji.
    router.replace(powrot);
    router.refresh();
  }

  async function handleDevLogin() {
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/dev-login", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Logowanie deweloperskie nie powiodło się.");
        setLoading(false);
        return;
      }

      router.replace(powrot);
      router.refresh();
    } catch {
      setError("Nie udało się połączyć z serwerem.");
      setLoading(false);
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>AIdeas</div>
        <h1 className={styles.title}>Zaloguj się</h1>
        <p className={styles.subtitle}>
          Podaj email i hasło, aby przejść do swoich projektów i agentów.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
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
            <label className={styles.label} htmlFor="login-password">
              Hasło
            </label>
            <input
              id="login-password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className={styles.button} type="submit" disabled={loading}>
            {loading ? "Logowanie…" : "Zaloguj się"}
          </button>
        </form>

        {devAvailable && (
          <div className={styles.devBlock}>
            <button
              type="button"
              className={styles.devButton}
              onClick={handleDevLogin}
              disabled={loading}
            >
              Zaloguj jako deweloper
            </button>
            <span className={styles.devHint}>
              Skrót dostępny tylko lokalnie. Loguje przez zwykły mechanizm
              Supabase, danymi z pliku .env.local.
            </span>
          </div>
        )}

        <div className={styles.footer}>
          Nie masz jeszcze konta?{" "}
          <Link className={styles.link} href="/rejestracja">
            Zarejestruj się
          </Link>
        </div>
      </div>
    </div>
  );
}
