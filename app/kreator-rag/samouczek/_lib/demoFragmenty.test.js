import test from "node:test";
import assert from "node:assert/strict";

import { DEMO, PYTANIA, WERSJE, podzielNaWyroznienia } from "./demoFragmenty.js";

// Dane demo są wymyślone, ale muszą być SPÓJNE — inaczej samouczek pokazuje
// pustkę zamiast tłumaczyć, a nic tego nie zgłasza.

test("obie wersje oferują dokładnie te same pytania", () => {
  // Przełącznik „bez nagłówków / z nagłówkami" zachowuje wybrane pytanie.
  // Gdyby wersje miały różne zestawy, przełączenie trafiałoby w undefined.
  const id = PYTANIA.map((p) => p.id).sort();
  for (const w of WERSJE) {
    assert.deepEqual(Object.keys(DEMO[w].odp).sort(), id, `wersja ${w}`);
  }
});

test("każda odpowiedź wskazuje ISTNIEJĄCY fragment", () => {
  for (const w of WERSJE) {
    const ile = DEMO[w].fragmenty.length;
    for (const [pyt, o] of Object.entries(DEMO[w].odp)) {
      assert.ok(
        Number.isInteger(o.trafiony) && o.trafiony >= 0 && o.trafiony < ile,
        `${w}/${pyt}: trafiony=${o.trafiony} poza zakresem 0..${ile - 1}`
      );
    }
  }
});

test("wersja zle nie odpowiada na nic, dobrze odpowiada na wszystko", () => {
  // To jest cała teza tej sekcji. Gdyby ktoś przestawił flagę, demo dowodziłoby
  // czegoś odwrotnego niż tekst obok.
  for (const o of Object.values(DEMO.zle.odp)) assert.equal(o.ok, false);
  for (const o of Object.values(DEMO.dobrze.odp)) assert.equal(o.ok, true);
});

test("wyróżniany wycinek NAPRAWDĘ występuje w tekście fragmentu", () => {
  // Literówka w `wyroznij` nie wywala niczego — po prostu nic się nie podświetla.
  // Dokładnie ten rodzaj usterki, którego nie widać w przeglądzie zmian.
  for (const w of WERSJE) {
    DEMO[w].fragmenty.forEach((f, i) => {
      if (!f.wyroznij) return;
      assert.ok(
        f.tekst.includes(f.wyroznij),
        `${w}, fragment ${i}: „${f.wyroznij}" nie występuje w tekście`
      );
    });
  }
});

test("fragmenty z nagłówkami mają tytuły, te bez — nie mają", () => {
  for (const f of DEMO.zle.fragmenty) assert.equal(f.tytul, undefined);
  for (const f of DEMO.dobrze.fragmenty) assert.ok(f.tytul, "brak tytułu");
});

test("podzielNaWyroznienia: bez wycinka zwraca całość jako jedną część", () => {
  assert.deepEqual(podzielNaWyroznienia("abc", undefined), [
    { tekst: "abc", wyrozniony: false },
  ]);
});

test("podzielNaWyroznienia: wycinek nieobecny nie psuje tekstu", () => {
  // Zabezpieczenie przed cichą utratą treści — tekst ma wyjść w całości.
  assert.deepEqual(podzielNaWyroznienia("abc", "xyz"), [
    { tekst: "abc", wyrozniony: false },
  ]);
});

test("podzielNaWyroznienia: dzieli na trzy części i nie gubi znaków", () => {
  const czesci = podzielNaWyroznienia("kwota 87 zł netto", "87 zł");
  assert.deepEqual(czesci, [
    { tekst: "kwota ", wyrozniony: false },
    { tekst: "87 zł", wyrozniony: true },
    { tekst: " netto", wyrozniony: false },
  ]);
  assert.equal(czesci.map((c) => c.tekst).join(""), "kwota 87 zł netto");
});

test("podzielNaWyroznienia: wycinek na początku i na końcu", () => {
  assert.deepEqual(podzielNaWyroznienia("87 zł netto", "87 zł"), [
    { tekst: "87 zł", wyrozniony: true },
    { tekst: " netto", wyrozniony: false },
  ]);
  assert.deepEqual(podzielNaWyroznienia("kwota 87 zł", "87 zł"), [
    { tekst: "kwota ", wyrozniony: false },
    { tekst: "87 zł", wyrozniony: true },
  ]);
});
