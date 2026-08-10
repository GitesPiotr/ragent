import { test } from "node:test";
import assert from "node:assert/strict";
import { KRESEK, PROG_LOGOWANIA_MS, ileSwiecacych } from "./pierscien.js";

test('pierścień ma 48 kresek, jak w prototypie', () => {
  assert.equal(KRESEK, 48);
});

test('PRÓG LOGOWANIA jest wartością z prototypu (cfg.minMs, linia 726)', () => {
  // Nie pilnujemy tu „ładnej liczby", tylko zgodności ze źródłem. Skrócenie
  // progu do 600 ms było odstępstwem i zostało cofnięte, bo przebiegu
  // pierścienia nie było przy nim widać — patrz komentarz przy stałej.
  assert.equal(PROG_LOGOWANIA_MS, 2000);
});

test('GRANICE: 0 nie zapala nic, 1 zapala wszystkie 48', () => {
  assert.equal(ileSwiecacych(0), 0);
  assert.equal(ileSwiecacych(1), KRESEK);
});

test('połowa postępu zapala połowę kresek', () => {
  assert.equal(ileSwiecacych(0.5), 24);
  assert.equal(ileSwiecacych(0.25), 12);
  assert.equal(ileSwiecacych(0.75), 36);
});

test('WARTOŚCI POZA [0,1] SĄ OBCINANE, a nie liczone', () => {
  assert.equal(ileSwiecacych(-1), 0);
  assert.equal(ileSwiecacych(-0.0001), 0);
  assert.equal(ileSwiecacych(1.5), KRESEK);
  assert.equal(ileSwiecacych(999), KRESEK);
});

test('pierwsza kreska zapala się natychmiast po ruszeniu, nie po 1/48', () => {
  // Warunek z prototypu to i/N < p, więc kreska zerowa świeci dla każdego
  // dodatniego postępu. Gdyby ktoś przepisał to jako i/N <= p, przy zerze
  // świeciłaby już jedna — a pierścień w spoczynku ma być całkiem wygaszony.
  assert.equal(ileSwiecacych(0.0001), 1);
  assert.equal(ileSwiecacych(0), 0);
});

test('liczba świecących rośnie monotonicznie razem z postępem', () => {
  let poprzednia = -1;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const ile = ileSwiecacych(p);
    assert.ok(ile >= poprzednia, `postęp ${p}: ${ile} < ${poprzednia}`);
    assert.ok(ile >= 0 && ile <= KRESEK);
    poprzednia = ile;
  }
});

test('każdy krok o 1/48 zapala dokładnie jedną kreskę więcej', () => {
  for (let i = 0; i <= KRESEK; i += 1) {
    assert.equal(ileSwiecacych(i / KRESEK), i, `postęp ${i}/48`);
  }
});

test('liczba kresek jest parametrem — funkcja nie zna 48 na pamięć', () => {
  assert.equal(ileSwiecacych(0.5, 10), 5);
  assert.equal(ileSwiecacych(1, 10), 10);
  assert.equal(ileSwiecacych(0, 10), 0);
});
