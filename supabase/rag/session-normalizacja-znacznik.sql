-- Znacznik przebiegu normalizacji pojęć.
--
-- POWÓD (pułapka procesu, 29.07.2026). Przetwarzanie pojęć ma DWA kroki:
--   1. wyciągnięcie pojęć  (scripts/uruchom-pojecia.mjs)
--   2. scalanie duplikatów (scripts/uruchom-normalizacje.mjs)
-- Drugi jest łatwy do pominięcia, bo pierwszy kończy się widocznym sukcesem. Po
-- dołożeniu RODO graf ogłosił „1066 pojęć, 43 mosty", licznik się zgadzał i nic nie
-- krzyczało — a w bazie leżało 100 par pojęć kanonicznych powyżej progu scalania
-- („przetwarzanie danych osobowych" obok „przetwarzania danych osobowych",
-- „państwo członkowskie" w pięciu odmianach). Widok ogłaszał stan KOŃCOWY, będąc
-- w połowie potoku.
--
-- To ta sama klasa co PostgREST ucinający po cichu na 1000 wierszach i jak cicha
-- zerowa metryka przez NaN: wynik wygląda wiarygodnie i jest zgodny z tym, co
-- chciałoby się zobaczyć. Sekcja 12.9 mówi, że pusty wynik jest wynikiem —
-- to jest jej druga połowa: WYNIK POŚREDNI NIE MOŻE UDAWAĆ KOŃCOWEGO.
--
-- Kolumna zostaje NULL dla kolekcji już istniejących. To poprawny stan wyjściowy:
-- „nie wiadomo, czy normalizacja przeszła" ma być nieodróżnialne od „nie przeszła",
-- bo obie sytuacje wymagają tego samego działania. Pierwszy przebieg normalizacji
-- ustawia znacznik i stan znika sam.

alter table rag_collections
  add column if not exists concepts_normalized_at timestamptz;

comment on column rag_collections.concepts_normalized_at is
  'Kiedy ostatnio przeszła normalizacja pojęć. Pojęcie z created_at nowszym niż ta wartość oznacza, że scalanie duplikatów jeszcze go nie widziało. NULL = nigdy nie normalizowano.';
