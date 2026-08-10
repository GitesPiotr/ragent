"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, isSupabaseConfigured, SUPABASE_CONFIG_ERROR } from "@/lib/supabase/client";
import { Glowa } from "./_components/Glowa.jsx";
import { Pierscien } from "./_components/Pierscien.jsx";
import { ZegarScenyProvider } from "./_components/ZegarSceny.jsx";
import { ZnakRAGent } from "./_components/ZnakRAGent.jsx";
import styles from "./logowanie.module.css";

// Adres, pod ktory idzie uzytkownik bez hasla. W aplikacji nie ma zadnego
// mechanizmu resetu — prototyp mial tu odnosnik „Nie pamietam hasla"
// prowadzacy donikad, wiec zamiast slepego wyjscia stoi zywy kontakt.
const ADRES_ADMINISTRATORA = "pit321@op.pl";

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

// Szkielet formularza na czas, gdy sam formularz jeszcze sie nie renderuje.
//
// Ma DOKLADNIE te sama budowe co prawdziwy formularz (tytul, dwa pola,
// przycisk), zeby zawartosc pierscienia nie zmieniala wysokosci w momencie
// podmiany — a wysrodkowana w kole zmiana wysokosci widac natychmiast.
// aria-hidden, bo to atrapa; pola sa wylaczone, wiec nie da sie w nie wejsc
// tabulatorem.
function FormularzZastepczy() {
  return (
    <div className={styles.formularz} aria-hidden="true">
      <h1 className={styles.tytul}>Logowanie</h1>
      <label className={styles.pole}>
        <input className={styles.wejscie} type="email" placeholder="E-mail" disabled />
      </label>
      <label className={styles.pole}>
        <input className={styles.wejscie} type="password" placeholder="Hasło" disabled />
      </label>
      <button className={styles.przycisk} type="button" disabled>
        Wczytuję…
      </button>
    </div>
  );
}

// CZESC ZALEZNA OD ADRESU — wydzielona celowo, patrz komentarz przy LoginPage.
function FormularzLogowania() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Dokad wrocic po zalogowaniu (ustawia proxy.js przy przekierowaniu).
  const powrot = searchParams.get("powrot") || "/projekty";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  // PRAWDZIWY <form onSubmit>, nie luzne pola jak w prototypie. Tam brak
  // formularza byl obejsciem na otwieranie pliku z dysku (file://); tutaj
  // aplikacja chodzi po HTTP, a formularz daje za darmo Enter w polu
  // i propozycje zapisu w menedzerze hasel.
  return (
    <form
      className={`${styles.formularz} ${loading ? styles.zajety : ""}`}
      onSubmit={handleSubmit}
    >
      <h1 className={styles.tytul}>Logowanie</h1>

      <label className={styles.pole}>
        <input
          className={styles.wejscie}
          type="email"
          placeholder="E-mail"
          aria-label="Adres email"
          autoComplete="email"
          required
          disabled={loading}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className={styles.pole}>
        <input
          className={styles.wejscie}
          type="password"
          placeholder="Hasło"
          aria-label="Hasło"
          autoComplete="current-password"
          required
          disabled={loading}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <button className={styles.przycisk} type="submit" disabled={loading}>
        {loading ? "Logowanie…" : "Zaloguj"}
      </button>

      <p className={styles.podpowiedz}>
        Nie pamiętasz hasła? Napisz do{" "}
        <a className={styles.podpowiedzAdres} href={`mailto:${ADRES_ADMINISTRATORA}`}>
          {ADRES_ADMINISTRATORA}
        </a>
      </p>

      <p className={styles.blad} role="alert">
        {error}
      </p>
    </form>
  );
}

// SKROT DEWELOPERSKI — pod pierscieniem, bo w jego wolnym polu nie ma miejsca.
//
// Osobny komponent, a nie kawalek formularza, wlasnie z powodu polozenia.
// Wlasna bariera Suspense, bo tez potrzebuje „powrot" z adresu, a skorupa
// strony ma zostac prerenderowalna.
//
// Czy przycisk w ogole sie pokaze, decyduje SERWER (tryb dev + obecnosc
// DEV_LOGIN_* w .env.local) — klient nie zna tych danych.
function SkrotDeweloperski() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const powrot = searchParams.get("powrot") || "/projekty";

  const [dostepny, setDostepny] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blad, setBlad] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/dev-login", { cache: "no-store" });
        const data = await res.json();
        if (alive) setDostepny(Boolean(data.available));
      } catch {
        /* brak informacji -> przycisk sie nie pokazuje */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function zaloguj() {
    if (loading) return;
    setBlad(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/dev-login", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setBlad(data.error || "Logowanie deweloperskie nie powiodło się.");
        setLoading(false);
        return;
      }

      router.replace(powrot);
      router.refresh();
    } catch {
      setBlad("Nie udało się połączyć z serwerem.");
      setLoading(false);
    }
  }

  if (!dostepny) return null;

  return (
    <div className={styles.skrot}>
      <button type="button" className={styles.skrotPrzycisk} onClick={zaloguj} disabled={loading}>
        Zaloguj jako deweloper
      </button>
      <span className={styles.skrotOpis}>
        Skrót dostępny tylko lokalnie. Loguje przez zwykły mechanizm Supabase,
        danymi z pliku .env.local.
      </span>
      {blad && (
        <span className={styles.blad} role="alert">
          {blad}
        </span>
      )}
    </div>
  );
}

// DLACZEGO FORMULARZ SIEDZI W <Suspense>.
//
// useSearchParams() czyta adres, a adresu NIE DA SIE znac podczas
// prerenderowania. Next.js radzi sobie z tym tak, ze cale poddrzewo az do
// najblizszej bariery Suspense renderuje dopiero po stronie klienta.
// Gdy takiej bariery nie ma, "najblizsza" jest cala strona — a poniewaz
// /logowanie nie ma zadnych parametrow dynamicznych, Next.js probuje ja
// prerenderowac i przerywa BUILD bledem
// "useSearchParams() should be wrapped in a suspense boundary".
//
// Tryb deweloperski tego nie widzial, bo tam nic sie nie prerenderuje —
// bledu nie bylo widac az do `npm run build`.
//
// Scena (glowa, napis, pierscien) nie zaglada do adresu, wiec zostaje POZA
// bariera i trafia do gotowego HTML-a. Wewnatrz jest tylko to, co naprawde
// zalezy od "?powrot=": formularz i skrot deweloperski.
export default function LoginPage() {
  return (
    <div className={styles.ekran} data-ekran="logowanie">
      <ZegarScenyProvider>
        <div className={styles.uklad}>
          <section className={styles.scena}>
            <Glowa />
            <ZnakRAGent />
          </section>

          <section className={styles.kolumnaPanelu}>
            <Pierscien>
              <Suspense fallback={<FormularzZastepczy />}>
                <FormularzLogowania />
              </Suspense>
            </Pierscien>

            <Suspense fallback={null}>
              <SkrotDeweloperski />
            </Suspense>
          </section>
        </div>
      </ZegarScenyProvider>
    </div>
  );
}
