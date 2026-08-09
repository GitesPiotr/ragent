import test from "node:test";
import assert from "node:assert/strict";

import { FORMATY_OPIS, KONTROLNA, NIEOBSLUGIWANE, ZASADY } from "./zasady.js";
// Sciezka wzgledna, nie alias @/ — testy chodza na golym `node --test`,
// ktory aliasow z jsconfig nie zna.
import { FORMATY } from "../../../../lib/rag/extract.js";

// Samouczek obiecuje użytkownikowi konkretne rzeczy o zachowaniu aplikacji.
// Te testy pilnują, żeby obietnice nie rozjechały się z kodem.

test("tabela formatów opisuje DOKŁADNIE te formaty, które przyjmuje dyspozytor", () => {
  // Najważniejszy test w tym pliku. Gdyby ktoś dołożył format do FORMATY
  // w extract.js i zapomniał o samouczku, instrukcja milczałaby o czymś, co
  // działa. Gdyby usunął — obiecywałaby coś, czego nie ma.
  const wTabeli = FORMATY_OPIS.map((f) => f.ext.replace(".", "")).sort();
  assert.deepEqual(wTabeli, [...FORMATY].sort());
});

test("opis nagłówków to lista części, a każda część jest tekstem albo kodem", () => {
  for (const f of FORMATY_OPIS) {
    assert.ok(Array.isArray(f.naglowki), `${f.ext}: naglowki musi być listą`);
    assert.ok(f.naglowki.length > 0, `${f.ext}: pusta lista części`);
    for (const cz of f.naglowki) {
      const poprawna = typeof cz === "string" || (cz && typeof cz.kod === "string");
      assert.ok(poprawna, `${f.ext}: część nie jest ani napisem, ani { kod }`);
    }
  }
});

test("wiersz .md pokazuje znaki # i ## DOSŁOWNIE, jako kod", () => {
  // Ta kolumna mówi, po czym aplikacja rozpoznaje nagłówek (extract.js:55-59),
  // więc zapis musi być dosłowny. Spłaszczenie do zwykłego tekstu gubi treść.
  const md = FORMATY_OPIS.find((f) => f.ext === ".md");
  const kody = md.naglowki.filter((cz) => typeof cz !== "string").map((cz) => cz.kod);
  assert.deepEqual(kody, ["#", "##"]);
});

test("żaden format z tabeli nie trafił na listę nieobsługiwanych", () => {
  for (const f of FORMATY_OPIS) {
    assert.ok(
      !NIEOBSLUGIWANE.includes(f.ext),
      `${f.ext} jest jednocześnie czytany i odrzucany`
    );
  }
});

test("lista nieobsługiwanych nie zawiera niczego, co dyspozytor przyjmuje", () => {
  for (const ext of NIEOBSLUGIWANE) {
    assert.ok(
      !FORMATY.includes(ext.replace(".", "")),
      `${ext} jest na liście odrzucanych, a aplikacja go czyta`
    );
  }
});

test("każda zasada ma komplet pól i obie próbki", () => {
  for (const z of ZASADY) {
    assert.ok(z.id, "brak id");
    assert.ok(z.nazwa, `${z.id}: brak nazwy`);
    assert.ok(z.opis && z.opis.length > 80, `${z.id}: opis za krótki albo brak`);
    assert.ok(z.zle, `${z.id}: brak próbki „źle"`);
    assert.ok(z.dobrze, `${z.id}: brak próbki „dobrze"`);
    assert.notEqual(z.zle, z.dobrze, `${z.id}: obie próbki identyczne`);
  }
});

test("identyfikatory zasad są niepowtarzalne", () => {
  // Powtórzony id zepsułby rozwijanie: dwie zasady otwierałyby się razem.
  const id = ZASADY.map((z) => z.id);
  assert.equal(new Set(id).size, id.length);
});

test("pierwsza zasada jest oznaczona jako najważniejsza", () => {
  // To ona jest domyślnie rozwinięta. Gdyby ktoś przestawił kolejność bez
  // przeniesienia etykiety, rozwinięta byłaby zasada bez wyróżnienia.
  assert.equal(ZASADY[0].id, "naglowki");
  assert.equal(ZASADY[0].skrot, "najważniejsze");
  for (const z of ZASADY.slice(1)) assert.equal(z.skrot, "");
});

test("lista kontrolna ma pięć pozycji i żadna się nie powtarza", () => {
  assert.equal(KONTROLNA.length, 5);
  assert.equal(new Set(KONTROLNA).size, 5);
});

test("lista kontrolna wymienia te same rozszerzenia co dyspozytor", () => {
  const pozycja = KONTROLNA.find((t) => t.includes("rozszerze"));
  assert.ok(pozycja, "brak pozycji o rozszerzeniach");
  for (const f of FORMATY) {
    assert.ok(pozycja.includes("." + f), `lista kontrolna pomija .${f}`);
  }
});
