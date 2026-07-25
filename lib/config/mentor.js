// Konfiguracja mentora — JEDNO miejsce, w ktorym ustawia sie model.
//
// Mentora zawsze napedza Claude (Anthropic), niezaleznie od tego, jakiego
// providera user wybral dla SWOJEGO agenta.
//
// Mentor generuje tekst edukacyjny po polsku (proza + krotka ekstrakcja
// propozycji), wiec tanszy i szybki model w zupelnosci wystarcza.
// Haiku 4.5 wspiera tez `temperature` i structured outputs (output_config.format),
// czyli wszystko, czego uzywa tryb prowadzenia.
//
// Zmiana modelu BEZ ruszania kodu: dopisz w .env.local
//   MENTOR_MODEL=claude-sonnet-5
// i zrestartuj serwer dev. Brak zmiennej -> uzywana jest wartosc domyslna.
//
// UWAGA: to jest ustawienie po stronie tworcy — celowo NIE ma go w UI.

export const MENTOR_PROVIDER = "anthropic";

// Domyslny model mentora (gdy nie ustawiono MENTOR_MODEL w srodowisku).
export const DEFAULT_MENTOR_MODEL = "claude-haiku-4-5";

// Efektywny model mentora: zmienna srodowiskowa > wartosc domyslna.
// Czytane tylko po stronie serwera (route API), wiec process.env jest dostepne.
export const MENTOR_MODEL =
  process.env.MENTOR_MODEL?.trim() || DEFAULT_MENTOR_MODEL;
