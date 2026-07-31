import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zmierzJakoscTekstu, opiszJakosc, STANY } from './jakosc-tekstu.js';

// Próbki ZAPISANE, nie czytane z plików ani z bazy — testy mają chodzić bez sieci,
// bez Supabase i bez PDF-ów. Każda pochodzi z prawdziwego dokumentu z korpusu, poza
// próbkami obcojęzycznymi, które są ułożone i tak opisane.

const POLSKI_POPRAWNY = `
Pracownikowi przysługuje prawo do corocznego, nieprzerwanego, płatnego urlopu
wypoczynkowego. Wymiar urlopu wynosi dwadzieścia dni, jeżeli pracownik jest zatrudniony
krócej niż dziesięć lat, oraz dwadzieścia sześć dni, jeżeli pracownik jest zatrudniony
co najmniej dziesięć lat. Pracodawca jest obowiązany udzielić na żądanie pracownika i w
terminie przez niego wskazanym nie więcej niż cztery dni urlopu w każdym roku
kalendarzowym. Do okresu pracy, od którego zależy wymiar urlopu, wlicza się z tytułu
ukończenia szkoły okresy nauki przewidziane w przepisach o systemie oświaty. Urlopu
udziela się w dni, które są dla pracownika dniami pracy, zgodnie z obowiązującym go
rozkładem czasu pracy, w wymiarze godzinowym odpowiadającym dobowemu wymiarowi czasu
pracy pracownika w danym dniu. Na wniosek pracownika urlop może być podzielony na
części, przy czym co najmniej jedna część wypoczynku powinna trwać nie mniej niż
czternaście kolejnych dni kalendarzowych, a pozostałe dni pracodawca ustala w
porozumieniu z pracownikiem oraz z zakładową organizacją związkową.
`;

// Ten sam gatunek tekstu po utracie warstwy znaków — z warunki_zycia_rodzin_w_polsce.pdf.
const POLSKI_OKALECZONY = `
Sporód wszystkich gospodarstw rodzinnych 62% stanowiy te tworzone wycznie przez
samodzielne maestwa oraz zwizki nieformalne z dziemi bd bez dzieci na utrzymaniu i przez
samotnych rodziców z dziemi na utrzymaniu. Natomiast wród ogóu gospodarstw rodzinnych
byo 38% tych tworzonych dodatkowo przez inne osoby. W badaniu bud etów gospodarstw
domowych w roku 2011 gospodarstw rodzinnych najwiksz grup stanowiy ma estwa bez dzieci
na utrzymaniu, a ich udzia w ogóle gospodarstw rodzinnych wynosi 23,4%. Pozostae
gospodarstwa rodzinne bez dzieci na utrzymaniu stanowiy drug w kolejnoci najliczniejsz
grup, wród zbadanych gospodarstw rodzinnych, 20,1% naleao do tej grupy. Ma estwa z
jednym dzieckiem na utrzymaniu oraz z dwojgiem dzieci na utrzymaniu tworzyy kolejne
grupy, a ich udzia w ogóle gospodarstw rodzinnych by zbli ony do siebie i wynosi
odpowiednio 11,5% oraz 10,9% w skali kraju i w poszczególnych regionach.
`;

const ANGIELSKI_POPRAWNY = `
The controller shall implement appropriate technical and organisational measures to
ensure a level of security appropriate to the risk. In assessing the appropriate level
of security account shall be taken in particular of the risks that are presented by
processing, in particular from accidental or unlawful destruction, loss, alteration,
unauthorised disclosure of, or access to personal data transmitted, stored or otherwise
processed. The controller and the processor shall take steps to ensure that any natural
person acting under the authority of the controller who has access to personal data does
not process them except on instructions from the controller, unless he or she is required
to do so by Union or Member State law. Adherence to an approved code of conduct may be
used as an element by which to demonstrate compliance with the requirements set out in
this Regulation. The processor shall not engage another processor without prior specific
or general written authorisation of the controller, and where a processor engages another
processor the same obligations shall be imposed on that other processor by contract.
`;

// 03-pracownicy.csv — tabela imion i stanowisk. Zero słów funkcyjnych, bo to nie proza.
const TABELA_KRÓTKA = `Imię;Nazwisko;Stanowisko
Anna;Kowalska;Specjalista
Piotr;Nowak;Kierownik
Maria;Wiśniewska;Księgowa`;

test('polski poprawny → bez oznaczenia', () => {
  const j = zmierzJakoscTekstu(POLSKI_POPRAWNY);
  assert.equal(j.werdykt, STANY.OK);
  assert.ok(j.diakrytyki >= 2.5, `diakrytyki ${j.diakrytyki}% powinny być nad progiem`);
  assert.ok(j.funkcyjnePl >= 8, `słowa funkcyjne ${j.funkcyjnePl}% powinny być nad progiem`);
  assert.equal(opiszJakosc(j), null, 'poprawny dokument nie dostaje żadnego komunikatu');
});

test('polski okaleczony → ostrzeżenie z konkretną liczbą', () => {
  const j = zmierzJakoscTekstu(POLSKI_OKALECZONY);
  assert.equal(j.werdykt, STANY.OKALECZONY);
  // Sedno reguły: słowa funkcyjne PRZEŻYŁY uszkodzenie, znaki diakrytyczne nie.
  assert.ok(j.funkcyjnePl >= 8, 'słowa funkcyjne przeżywają utratę diakrytyków');
  assert.ok(j.diakrytyki < 2.5, 'diakrytyki poniżej progu');
  const o = opiszJakosc(j);
  assert.equal(o.waga, 'ostrzezenie');
  assert.ok(o.tekst.includes(String(j.diakrytyki)), 'komunikat musi zawierać zmierzoną liczbę');
});

test('REGRESJA: poprawny angielski NIGDY nie dostaje werdyktu „okaleczony"', () => {
  // To był najczęstszy fałszywy alarm poprzedniej miary (4 na 8) i dokładnie ten,
  // który wróci przy niedbale obniżonym progu diakrytyków. Angielski MA 0% polskich
  // znaków i to jest poprawne — nie wolno tego mylić z uszkodzeniem.
  const j = zmierzJakoscTekstu(ANGIELSKI_POPRAWNY);
  assert.notEqual(j.werdykt, STANY.OKALECZONY);
  assert.equal(j.werdykt, STANY.OBCY);
  assert.equal(j.jezykObcy, 'angielski');
  assert.equal(opiszJakosc(j).waga, 'informacja', 'obcy język to informacja, nie ostrzeżenie');
});

test('za krótki / tabela → „nieoceniony", nigdy „OK"', () => {
  const j = zmierzJakoscTekstu(TABELA_KRÓTKA);
  assert.equal(j.werdykt, STANY.NIEOCENIONY);
  assert.notEqual(j.werdykt, STANY.OK, 'reguła, która milczy, nie może wyglądać jak reguła, która przepuściła (12.9)');
  const o = opiszJakosc(j);
  assert.equal(o.waga, 'informacja');
  assert.match(o.tekst, /nie wiadomo/, 'komunikat musi mówić „nie wiadomo", a nie „w porządku"');
});

test('pusty i nie-tekst nie wywracają miary', () => {
  for (const wejscie of ['', null, undefined, 42, {}]) {
    const j = zmierzJakoscTekstu(wejscie);
    assert.equal(j.werdykt, STANY.NIEOCENIONY);
    assert.equal(j.slow, 0);
  }
});

test('zapisujemy LICZBY, nie sam werdykt — inaczej zmiana progu kosztuje ponowną ekstrakcję', () => {
  const j = zmierzJakoscTekstu(POLSKI_OKALECZONY);
  for (const pole of ['funkcyjnePl', 'diakrytyki', 'slow', 'zmierzono']) {
    assert.ok(j[pole] !== undefined, `brak pola ${pole}`);
  }
  assert.equal(typeof j.funkcyjnePl, 'number');
  assert.equal(typeof j.diakrytyki, 'number');
});
