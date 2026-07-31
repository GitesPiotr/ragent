import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kluczZadania, czyPrzyjac } from './zadania.js';

// =============================================================================
//  WYŚCIG ODPOWIEDZI PRZY SZYBKIM PRZEŁĄCZENIU TRYBU
//
//  Zgłoszone z żywego widoku: interfejs w trybie „tylko mosty", dane z progu 2,
//  licznik „pokazano 157 z 565", a pod spodem „układanie zatrzymane" — czyli widok
//  ogłosił gotowość, pokazując dane innego trybu niż deklarowany.
//
//  Test sprawdza SAMĄ KOLEJNOŚĆ, bez sieci: spóźniona odpowiedź A, która przyszła
//  po odpowiedzi B, nie ma prawa zmienić widoku.
// =============================================================================

test('SPÓŹNIONA odpowiedź na starsze pytanie nie zmienia widoku', () => {
  // Symulacja: wysyłamy pytanie o próg 2, potem o mosty. Odpowiedzi wracają
  // w odwrotnej kolejności — najpierw mosty, potem spóźniony próg 2.
  const widok = { dane: null };
  let biezace = { nr: 0, klucz: '' };

  const wyslij = (opis) => {
    biezace = { nr: biezace.nr + 1, klucz: kluczZadania(opis) };
    return { ...biezace, opis };
  };
  const odebrano = (zadanie, dane) => {
    if (!czyPrzyjac({ nr: zadanie.nr, klucz: zadanie.klucz }, biezace)) return false;
    widok.dane = dane;
    return true;
  };

  const prog2 = wyslij({ minMentions: 2 });
  const mosty = wyslij({ tylkoMosty: true });

  assert.equal(odebrano(mosty, '15 pojęć'), true, 'odpowiedź na aktualne pytanie wchodzi');
  assert.equal(odebrano(prog2, '157 pojęć'), false, 'spóźniona NIE wchodzi');
  assert.equal(widok.dane, '15 pojęć', 'widok pokazuje dane trybu, który deklaruje');
});

test('odpowiedź o INNYM progu jest odrzucana, choćby numer się zgadzał', () => {
  // Numer pilnuje kolejności, klucz pilnuje tożsamości. Usterka polegała na rozjeździe
  // tożsamości, więc sam numer nie wystarcza jako zabezpieczenie.
  const biezace = { nr: 7, klucz: kluczZadania({ tylkoMosty: true }) };
  assert.equal(czyPrzyjac({ nr: 7, klucz: kluczZadania({ minMentions: 2 }) }, biezace), false);
  assert.equal(czyPrzyjac({ nr: 7, klucz: kluczZadania({ tylkoMosty: true }) }, biezace), true);
});

test('dwa kliknięcia w TO SAMO miejsce: liczy się tylko druga odpowiedź', () => {
  // Klucz jest ten sam, więc odrzucenie musi wynikać z numeru.
  const klucz = kluczZadania({ minMentions: 3 });
  const biezace = { nr: 2, klucz };
  assert.equal(czyPrzyjac({ nr: 1, klucz }, biezace), false, 'pierwsza odpowiedź jest już nieaktualna');
  assert.equal(czyPrzyjac({ nr: 2, klucz }, biezace), true);
});

test('klucz nie myli progu z trybem mostów ani nie gubi wartości', () => {
  assert.equal(kluczZadania({ minMentions: 2 }), 'prog:2');
  assert.equal(kluczZadania({ minMentions: '2' }), 'prog:2', 'próg z adresu URL to tekst');
  assert.equal(kluczZadania({ tylkoMosty: true }), 'mosty');
  // „mosty" wygrywa nad progiem — tak samo jak w zapytaniu do trasy.
  assert.equal(kluczZadania({ minMentions: 5, tylkoMosty: true }), 'mosty');
  assert.notEqual(kluczZadania({ minMentions: 2 }), kluczZadania({ minMentions: 3 }));
  // Brak danych nie może dać klucza pasującego do czegokolwiek.
  assert.equal(kluczZadania(), 'prog:1');
  assert.equal(kluczZadania({ minMentions: 'abc' }), 'prog:1');
});

test('brak któregokolwiek opisu żądania = odrzucenie, nie domysł', () => {
  assert.equal(czyPrzyjac(null, { nr: 1, klucz: 'mosty' }), false);
  assert.equal(czyPrzyjac({ nr: 1, klucz: 'mosty' }, null), false);
});
