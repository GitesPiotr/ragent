import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wyjsciaDlaWiadomosci, RODZAJ } from './wyjscia.js';

const idy = (lista) => lista.map((w) => w.id);
const rodzaje = (lista) => lista.map((w) => w.rodzaj);

// --- propozycja zastosowana ---------------------------------------------------

test('po wpisaniu do kreatora nie ma juz zadnej decyzji', () => {
  const w = wyjsciaDlaWiadomosci({
    krok: 'rules',
    propozycja: { field: 'rules', value: ['a'] },
    zastosowana: true,
  });
  assert.deepEqual(w, []);
});

// --- ocena wlasnego opisu persony ---------------------------------------------

test('ocena wlasnego opisu daje trzy wyjscia', () => {
  const w = wyjsciaDlaWiadomosci({
    krok: 'persona',
    propozycja: { field: 'persona', value: 'moj opis', wlasny: true },
    personaPath: 'self',
    edycjaOpisu: false,
  });
  assert.deepEqual(idy(w), [
    'popraw-swoj-opis',
    'mentor-z-opisu',
    'akceptuj-swoj-opis',
  ]);
  assert.deepEqual(rodzaje(w), [RODZAJ.WPISZ, RODZAJ.POWIEDZ, RODZAJ.AKCEPTUJ]);
});

test('w trakcie poprawiania opisu wyjsc nie ma', () => {
  // Inaczej pole edycji i przyciski wyboru stalyby naraz.
  const w = wyjsciaDlaWiadomosci({
    krok: 'persona',
    propozycja: { field: 'persona', value: 'moj opis', wlasny: true },
    personaPath: 'self',
    edycjaOpisu: true,
  });
  assert.deepEqual(w, []);
});

test('ocena wlasnego opisu poza sciezka „opisz sam" nie pokazuje wyjsc', () => {
  const w = wyjsciaDlaWiadomosci({
    krok: 'persona',
    propozycja: { field: 'persona', value: 'x', wlasny: true },
    personaPath: 'propose',
  });
  assert.deepEqual(w, []);
});

// --- propozycje mentora --------------------------------------------------------

test('gotowa persona ma akceptacje, przejecie do edycji i inna wersje', () => {
  const w = wyjsciaDlaWiadomosci({
    krok: 'persona',
    propozycja: { field: 'persona', value: 'persona od mentora' },
  });
  assert.deepEqual(idy(w), ['akceptuj', 'przejmij-persone', 'inna-wersja-persony']);
  assert.equal(w[1].przejmijWartosc, true);
  assert.equal(w[1].pole, 'opis');
});

test('kazda inna propozycja ma trzy wyjscia, nie samo „Zaakceptuj"', () => {
  // Sedno etapu 2: mentor pytal „akceptujesz, czy chcialbys cos zmienic?",
  // a druga polowa pytania nie miala odpowiedzi.
  for (const field of ['model', 'temperature', 'rules', 'tools', 'knowledgeBase', 'rag']) {
    const w = wyjsciaDlaWiadomosci({ krok: field, propozycja: { field, value: 'x' } });
    assert.deepEqual(idy(w), ['akceptuj', 'chce-zmienic', 'zdecyduj-za-mnie'], `pole ${field}`);
    // Dwa akceptujace i jedno kierujace do pola rozmowy — patrz test nizej
    // o tym, czym „zdecyduj za mnie" rozni sie od zwyklej akceptacji.
    assert.deepEqual(rodzaje(w), [RODZAJ.AKCEPTUJ, RODZAJ.WPISZ, RODZAJ.AKCEPTUJ]);
  }
});

test('„Chcę to zmienić" celuje w pole rozmowy i niczego nie wysyla', () => {
  // Tresci zmiany zna tylko uzytkownik — wyjscie ma pokazac GDZIE ja napisac,
  // a nie zgadnac, co chcial powiedziec.
  const w = wyjsciaDlaWiadomosci({ krok: 'rules', propozycja: { field: 'rules', value: ['a'] } });
  const zmien = w.find((x) => x.id === 'chce-zmienic');
  assert.equal(zmien.pole, 'rozmowa');
  assert.equal(zmien.tresc, undefined);
});

test('„Nie wiem — zdecyduj za mnie" ZAPISUJE propozycje, a nie tylko o niej mowi', () => {
  // Wczesniej bylo to POWIEDZ: mentor odpisywal „juz zrobione", uzasadnial
  // i wystawial DRUGA, identyczna karte, bo nic nie zostalo zapisane.
  // Decyzja w tej aplikacji znaczy „wartosc w kreatorze", wiec przy propozycji
  // na ekranie ten przycisk musi akceptowac.
  const w = wyjsciaDlaWiadomosci({ krok: 'model', propozycja: { field: 'model', value: 'x' } });
  const nieWiem = w.find((x) => x.id === 'zdecyduj-za-mnie');
  assert.equal(nieWiem.rodzaj, RODZAJ.AKCEPTUJ);
  // Tresc tury jest inna niz przy zwyklej akceptacji — prosi o uzasadnienie.
  assert.match(nieWiem.tresc, /wyjaśnij/i);
});

test('oba wyjscia akceptujace roznia sie tylko trescia tury', () => {
  const w = wyjsciaDlaWiadomosci({ krok: 'rules', propozycja: { field: 'rules', value: ['a'] } });
  const akceptujace = w.filter((x) => x.rodzaj === RODZAJ.AKCEPTUJ);
  assert.deepEqual(idy(akceptujace), ['akceptuj', 'zdecyduj-za-mnie']);
  // Zwykla akceptacja nie narzuca tresci — panel wstawia swoja domyslna.
  assert.equal(akceptujace[0].tresc, undefined);
  assert.ok(akceptujace[1].tresc);
});

// --- start kroku persony -------------------------------------------------------

test('start kroku persony daje wybor sciezki', () => {
  const w = wyjsciaDlaWiadomosci({ krok: 'persona', personaPath: null });
  assert.deepEqual(idy(w), ['opisz-sam', 'popros-o-persone']);
});

test('wybor sciezki znika, gdy sciezka jest juz wybrana', () => {
  assert.deepEqual(wyjsciaDlaWiadomosci({ krok: 'persona', personaPath: 'self' }), []);
  assert.deepEqual(wyjsciaDlaWiadomosci({ krok: 'persona', personaPath: 'done' }), []);
});

// --- kroki bez wiersza w tabeli ------------------------------------------------

// --- kroki BEZ propozycji ------------------------------------------------------

test('baza wiedzy bez propozycji daje obie drogi: mimo wszystko albo pomijam', () => {
  // Mentor stwierdzal — slusznie — ze zaden plik nie pasuje, i na tym konczyl.
  const w = wyjsciaDlaWiadomosci({ krok: 'knowledgeBase' });
  assert.deepEqual(idy(w), ['zaznacz-mimo-wszystko', 'pomijam-pliki']);
  assert.deepEqual(rodzaje(w), [RODZAJ.POWIEDZ, RODZAJ.POWIEDZ]);
});

test('RAG bez propozycji pozwala zdecydowac za uzytkownika albo pominac', () => {
  const w = wyjsciaDlaWiadomosci({ krok: 'rag' });
  assert.deepEqual(idy(w), ['zdecyduj-za-mnie', 'pomijam-rag']);
});

// --- nazwa wyjscia mowi, CO SIE STANIE -----------------------------------------

test('model bez propozycji nie „pomija kroku", tylko zostawia domyslny model', () => {
  // „Pomijam ten krok" nie niosl informacji dla kogos, kto nie wie, co pomija.
  const w = wyjsciaDlaWiadomosci({ krok: 'model' });
  assert.deepEqual(idy(w), ['zdecyduj-za-mnie', 'zostaw-domyslny-model']);
  assert.match(w[1].tytul, /domyślny model/i);
});

test('narzedzia mowia o agencie, nie o kroku', () => {
  const w = wyjsciaDlaWiadomosci({ krok: 'tools' });
  assert.deepEqual(idy(w), ['zdecyduj-za-mnie', 'bez-narzedzi']);
});

test('temperatura zostawia obecne ustawienie, gdy model ja przyjmuje', () => {
  const w = wyjsciaDlaWiadomosci({ krok: 'temperature', temperaturaDostepna: true });
  assert.deepEqual(idy(w), ['zdecyduj-za-mnie', 'zostaw-temperature']);
});

test('temperatura, ktorej model nie przyjmuje, NIE MA zadnych wyjsc', () => {
  // Przyciski dotyczylyby suwaka, ktory dla tego modelu nic nie robi.
  const w = wyjsciaDlaWiadomosci({ krok: 'temperature', temperaturaDostepna: false });
  assert.deepEqual(w, []);
});

test('zasady NIE MAJA wyjscia „pomijam" — zostaje sama prosba o decyzje', () => {
  // Zasady jako jedyne realnie ksztaltuja zachowanie agenta, wiec przejscie
  // dalej bez nich nie moze byc jednym klinieciem.
  const w = wyjsciaDlaWiadomosci({ krok: 'rules' });
  assert.deepEqual(idy(w), ['zdecyduj-za-mnie']);
});

test('zaden wiersz nie uzywa juz formulki „Pomijam ten krok"', () => {
  // Uniwersalne POMIN_KROK zostaje wylacznie dla krokow, ktorych jeszcze nie
  // ma — kazdy istniejacy krok ma nazwe dobrana do swojej konsekwencji.
  for (const krok of ['model', 'temperature', 'rules', 'tools', 'knowledgeBase', 'rag']) {
    const tytuly = wyjsciaDlaWiadomosci({ krok }).map((w) => w.tytul);
    assert.ok(
      !tytuly.includes('Pomijam ten krok'),
      `krok ${krok} nie powinien mowic „Pomijam ten krok"`,
    );
  }
});

test('BEZ propozycji „zdecyduj za mnie" jest wypowiedzia, nie akceptacja', () => {
  // Ten sam napis, dwie rozne sytuacje: nie ma czego akceptowac, wiec mentor
  // musi najpierw cokolwiek zaproponowac.
  const bez = wyjsciaDlaWiadomosci({ krok: 'rules' }).find(
    (x) => x.id === 'zdecyduj-za-mnie',
  );
  const zProp = wyjsciaDlaWiadomosci({
    krok: 'rules',
    propozycja: { field: 'rules', value: ['a'] },
  }).find((x) => x.id === 'zdecyduj-za-mnie');

  assert.equal(bez.rodzaj, RODZAJ.POWIEDZ);
  assert.equal(zProp.rodzaj, RODZAJ.AKCEPTUJ);
  assert.equal(bez.tytul, zProp.tytul);
});

test('nieznany krok i koniec prowadzenia nie dostaja wyjsc', () => {
  // null = ekstraktor nie podal kroku; „Pomijam ten krok" obiecywaloby wiedze,
  // ktorej nie mamy. „done" ma juz pod soba blok „Agent gotowy".
  assert.deepEqual(wyjsciaDlaWiadomosci({ krok: null }), []);
  assert.deepEqual(wyjsciaDlaWiadomosci({ krok: 'done' }), []);
});

test('krok persony po wyborze sciezki nie dostaje uniwersalnych wyjsc', () => {
  // Pole edycji i przyciski wyboru nie moga stac naraz.
  assert.deepEqual(wyjsciaDlaWiadomosci({ krok: 'persona', personaPath: 'self' }), []);
  assert.deepEqual(wyjsciaDlaWiadomosci({ krok: 'persona', personaPath: 'propose' }), []);
});

test('brak argumentow nie wywraca funkcji', () => {
  assert.deepEqual(wyjsciaDlaWiadomosci(), []);
});
