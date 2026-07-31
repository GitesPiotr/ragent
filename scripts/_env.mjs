// Wczytanie .env.local dla skryptów z konsoli — JEDNO miejsce dla wszystkich.
//
// DLACZEGO OSOBNY MODUŁ: ten sam loader był skopiowany do sześciu skryptów i we
// wszystkich miał ten sam błąd. Kopia nie ma jak się naprawić w jednym miejscu.
//
// BŁĄD, KTÓRY TO NAPRAWIA (znaleziony 27.07.2026, przy sesji o wyszukiwaniu hybrydowym):
// linia w .env.local wygląda tak —
//     RAG_EMBED_DOC_PREFIX=            # prefiks dla dokumentów, jeśli model wymaga
// Poprzedni wzorzec obcinał komentarz przez `.replace(/\s+#.*$/, '')`, czyli wymagał
// BIAŁEGO ZNAKU przed `#`. Ale spacje po `=` zostały już zjedzone przez `\s*` w regexie
// nagłówka, więc `#` stał na pozycji zerowej i nie pasował. Wartością prefiksu stawał się
// tekst komentarza: "# prefiks dla dokumentów, jeśli model wymaga".
//
// Skutek był cichy i paskudny: dotenv (czyli `next dev`, czyli CAŁA aplikacja) parsuje to
// poprawnie i daje pusty prefiks, więc dokumenty w bazie są embedowane BEZ prefiksu —
// potwierdzone porównaniem z zapisanym wektorem (podobieństwo 1.000000). Ale skrypty
// diagnostyczne doklejały tekst komentarza do KAŻDEGO embedowanego zapytania, przez co
// mierzyły inny system niż ten, który działa. Score spadał systematycznie o ~0,12–0,14.
//
// Zachowanie jest teraz zgodne z dotenv: w wartości NIECYTOWANEJ wszystko od pierwszego
// `#` to komentarz. Wartość w cudzysłowach zostaje nietknięta (tam `#` jest treścią).

import { readFileSync } from 'node:fs';

// Ustawia process.env ORAZ zwraca odczytane pary. Dwa sposoby użycia, bo skrypty
// dzielą się na te sięgające po getConfig() (potrzebują process.env) i te tworzące
// klienta Supabase wprost z wartości (diag-wznowienie.mjs).
export function loadEnvLocal(baseUrl) {
  const wartosci = {};
  let raw = '';
  try {
    raw = readFileSync(new URL('../.env.local', baseUrl), 'utf8');
  } catch {
    console.log('Nie znaleziono .env.local — ustaw zmienne w środowisku.');
    return wartosci;
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    const cytowana = /^(['"]).*\1$/.test(v.trim());
    if (!cytowana) v = v.replace(/#.*$/, '');
    v = v.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    // Pusta wartość NIE jest ustawiana — dzięki temu zmienna podana w środowisku
    // powłoki nie zostaje nadpisana pustym wpisem z pliku.
    if (v !== '') {
      process.env[m[1]] = v;
      wartosci[m[1]] = v;
    }
  }
  return wartosci;
}
