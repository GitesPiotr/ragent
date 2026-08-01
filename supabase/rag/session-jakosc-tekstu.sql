-- Jakość warstwy tekstowej dokumentu (11.1d).
--
-- POWÓD: `warunki_zycia_rodzin_w_polsce.pdf` zaindeksował się bez jednego błędu —
-- 593 fragmenty, 593 z wektorem, status `ready` — a 150 ze 171 stron nie ma polskich
-- znaków, bo warstwa tekstowa PDF-a nie niesie informacji, KTÓRY znak jest rysowany.
-- Wektor policzy się z każdego tekstu, także z „Sporód wszystkich gospodarstw
-- rodzinnych 62% stanowiy te tworzone wycznie". Użytkownik dostaje gorsze wyniki
-- i nie dowiaduje się dlaczego.
--
-- JSONB, NIE SAM WERDYKT. Progi (8% słów funkcyjnych, 2,5% diakrytyków) leżą
-- w środkach przerw zmierzonych na trzynastu dokumentach, z których większość to
-- polska proza prawnicza. Przy szerszym materiale będą wymagały korekty. Zapisane
-- liczby pozwalają orzec ponownie JEDNYM ZAPYTANIEM; zapisany sam werdykt kazałby
-- przeprowadzić ekstrakcję całego korpusu od nowa.
--
-- Kształt:
--   { "werdykt": "polski-ok" | "okaleczony" | "nie-polski" | "nieoceniony",
--     "slow": 1234, "funkcyjnePl": 24.8, "diakrytyki": 5.2,
--     "jezykObcy": "łotewski" | null, "udzialObcego": 5.3,
--     "zmierzono": "2026-07-29T13:00:00.000Z" }
--
-- NULL znaczy „nie mierzono" i MA być odróżnialne od „nieoceniony" (zmierzono,
-- ale za mało tekstu ciągłego, żeby orzec). To jest ta sama zasada co przy
-- concepts_normalized_at: brak pomiaru nie może wyglądać jak wynik pomiaru.

alter table rag_documents
  add column if not exists text_quality jsonb;

comment on column rag_documents.text_quality is
  'Pomiar jakości warstwy tekstowej (lib/rag/jakosc-tekstu.js). Liczby, nie sam werdykt — zmiana progów ma kosztować jedno zapytanie, nie ponowną ekstrakcję. NULL = nie mierzono.';
