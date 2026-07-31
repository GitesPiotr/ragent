import { test } from 'node:test';
import assert from 'node:assert/strict';
import { czyScalic, dzielaRdzen, grupuj, cosinus } from './normalize-concepts.js';

// Sesja 8. Wartości podobieństwa w testach to REALNE POMIARY na 18 pojęciach
// z 01-regulamin-pracy.md (bge-m3, 1024 wymiary), nie liczby z wyobraźni.

const PROG = 0.88;
const bezSygnalu = { mergeThreshold: PROG, mergeLexical: false, mergeLexicalMin: 0.82, stemMin: 5 };
const zSygnalem = { mergeThreshold: PROG, mergeLexical: true, mergeLexicalMin: 0.82, stemMin: 5 };

// =============================================================================
//  TESTY REGRESYJNE — PARY, KTÓRE MUSZĄ ZOSTAĆ ROZDZIELONE
//
//  Obie leżą blisko granicy i obie dzielą rdzeń, więc przy każdym przyszłym
//  strojeniu `mergeLexicalMin` są pierwsze do przypadkowego sklejenia.
// =============================================================================

test('REGRESJA: „pracodawca" i „pracownik" NIGDY nie mogą być jednym węzłem', () => {
  // Zmierzone 0,7958 — tylko 0,0242 poniżej mergeLexicalMin = 0,82, i dzielą
  // rdzeń „prac". Ktoś kiedyś obniży próg do 0,79, bo „rodzina urlopowa się nie
  // skleja", i połączy DWIE STRONY STOSUNKU PRACY w jeden węzeł grafu.
  // Ten test ma wtedy zapalić się czerwono.
  const COS = 0.7958;
  assert.equal(dzielaRdzen('pracodawca', 'pracownik', 5), true, 'dzielą rdzeń — dlatego są groźne');
  assert.equal(czyScalic(COS, 'pracodawca', 'pracownik', bezSygnalu), false);
  assert.equal(czyScalic(COS, 'pracodawca', 'pracownik', zSygnalem), false);
});

// --- rodzina „wspólna głowa rzeczownikowa, krótki wyróżnik" ------------------
//
// Osobna klasa zagrożenia od par typu „pracodawca"/„pracownik". Tam wspólny jest
// PRZEDROSTEK jednego wyrazu; tutaj wspólny jest CAŁY WYRAZ niosący większość
// znaczenia („umowa", „stanowisko", „okres"), a rozróżnia krótki wyróżnik.
// Wektor uśrednia po wyrazach, więc im dłuższa wspólna głowa i krótszy wyróżnik,
// tym wyżej ląduje para — NIEZALEŻNIE od tego, czy chodzi o tę samą dziedzinę.
//
// Drugi sygnał NIE CHRONI przed tą klasą: wspólna głowa to wspólny rdzeń
// z definicji, więc `dzielaRdzen` zawsze zwraca tu true. Broni wyłącznie próg.

test('REGRESJA: „umowa o pracę" i „umowa najmu" NIGDY nie mogą być jednym węzłem', () => {
  // Zmierzone 0,7416 (bge-m3, skrypt diag-scalenia.mjs). Dwie umowy z dwóch
  // dziedzin prawa: zatrudnienie kontra wynajem lokalu. Scalenie zbudowałoby
  // w grafie krawędź między umową najmu a Kodeksem pracy, której te dokumenty
  // nie mają — czyli fałszywe połączenie, nie uporządkowany wariant.
  const COS = 0.7416;
  assert.equal(dzielaRdzen('umowa o pracę', 'umowa najmu', 5), true, 'wspólny wyraz „umowa" — drugi sygnał ich NIE rozdzieli');
  assert.equal(czyScalic(COS, 'umowa o pracę', 'umowa najmu', bezSygnalu), false);
  assert.equal(czyScalic(COS, 'umowa o pracę', 'umowa najmu', zSygnalem), false);
});

test('REGRESJA: „umowa o pracę" i „umowa zlecenia" zostają osobno — margines 0,0128', () => {
  // Zmierzone 0,8072. To ta sama dziedzina, ale DWIE RÓŻNE PODSTAWY ZATRUDNIENIA
  // o innych skutkach prawnych. Leży 0,0128 pod mergeLexicalMin — czyli bliżej
  // granicy niż „pracodawca"/„pracownik" (0,0242). Najciaśniejszy margines,
  // jaki mamy zmierzony.
  assert.equal(dzielaRdzen('umowa o pracę', 'umowa zlecenia', 5), true);
  assert.equal(czyScalic(0.8072, 'umowa o pracę', 'umowa zlecenia', zSygnalem), false);
});

test('ZNANY DEFEKT: „stanowisko pracy" i „stanowisko służbowe" SCALAJĄ SIĘ błędnie', () => {
  // Zmierzone 0,8933 — POWYŻEJ progu 0,88. Ta para przechodzi i nie powinna:
  // stanowisko pracy w rozumieniu BHP (fizyczne miejsce, gdzie stoi człowiek
  // i maszyna) to nie to samo, co stanowisko służbowe (pozycja w hierarchii).
  //
  // Test asertuje ZACHOWANIE BŁĘDNE, tak jak test o progu 0,75 niżej — jest
  // zapisem, gdzie leży defekt, nie tego, czego chcemy. Gdy ktoś naprawi regułę,
  // ten test zapali się czerwono i będzie to DOBRA wiadomość: wtedy odwrócić
  // asercję i przenieść test wyżej, do rodziny regresyjnej.
  //
  // Czego to dowodzi: przy tej klasie par PRÓG NIE ROZDZIELA KLAS. „umowa
  // o pracę"/„umowa zlecenia" (różne, 0,8072) leży NIŻEJ niż „stanowisko
  // pracy"/„stanowisko służbowe" (różne, 0,8933) i niżej niż „urlop
  // wypoczynkowy"/„urlop" (to samo, 0,8911). Poprawne i błędne pary przeplatają
  // się na osi — żadne przesunięcie progu ich nie rozdzieli.
  assert.equal(czyScalic(0.8933, 'stanowisko pracy', 'stanowisko służbowe', bezSygnalu), true);
});

test('REGRESJA: „godzina pracy" i „godziny nadliczbowe" zostają osobno', () => {
  // Zmierzone 0,7575. Dzielą rdzeń „godzin" (6 liter), więc przechodzą przez
  // drugi sygnał bez trudu — chroni je WYŁĄCZNIE próg wektorowy.
  const COS = 0.7575;
  assert.equal(dzielaRdzen('godzina pracy', 'godziny nadliczbowe', 5), true);
  assert.equal(czyScalic(COS, 'godzina pracy', 'godziny nadliczbowe', zSygnalem), false);
});

test('REGRESJA: obniżenie progu do 0,75 sklejałoby obie groźne pary', () => {
  // Test pokazuje, DLACZEGO nie wolno obniżać w nieskończoność. Nie jest to
  // zachowanie oczekiwane — to zapis, gdzie leży granica bezpieczeństwa.
  const luzny = { ...zSygnalem, mergeLexicalMin: 0.75 };
  assert.equal(czyScalic(0.7958, 'pracodawca', 'pracownik', luzny), true, 'przy 0,75 wpada — i to jest zła wiadomość');
  assert.equal(czyScalic(0.7575, 'godzina pracy', 'godziny nadliczbowe', luzny), true);
});

// =============================================================================
//  DRUGI SYGNAŁ — co naprawia i czego NIE naprawia
// =============================================================================

test('drugi sygnał scala frazy rozszerzone, których sam próg nie łapie', () => {
  for (const [cos, a, b] of [
    [0.8643, 'praca nadliczbowa', 'godziny nadliczbowe'],
    [0.8311, 'wymiar urlopu', 'urlop'],
    [0.8281, 'prawo do urlopu', 'urlop'],
  ]) {
    assert.equal(czyScalic(cos, a, b, bezSygnalu), false, `${a}/${b}: sam próg tego nie łapie`);
    assert.equal(czyScalic(cos, a, b, zSygnalem), true, `${a}/${b}: drugi sygnał ma to złapać`);
  }
});

test('ZNANE OGRANICZENIE: „coroczny urlop" i „przedłużony urlop" zostają osobno', () => {
  // Mimo wspólnego rdzenia „urlop" leżą PONIŻEJ mergeLexicalMin = 0,82.
  // Rodzina urlopowa schodzi z sześciu węzłów do TRZECH, nie do jednego.
  // To nie jest usterka do naprawienia progiem — to granica tego, co drugi
  // sygnał potrafi. Zapisane, żeby nikt nie odkrywał tego na Kodeksie.
  assert.equal(czyScalic(0.7868, 'przedłużony urlop', 'urlop', zSygnalem), false);
  assert.equal(czyScalic(0.7483, 'coroczny urlop', 'urlop', zSygnalem), false);
});

test('sam próg działa niezależnie od drugiego sygnału', () => {
  assert.equal(czyScalic(0.8911, 'urlop wypoczynkowy', 'urlop', bezSygnalu), true);
  assert.equal(czyScalic(0.9287, 'czas pracy', 'godzina pracy', bezSygnalu), true);
});

test('wspólny rdzeń SAM W SOBIE nie scala niczego — jest warunkiem dodatkowym', () => {
  // Nawet identyczne słowo nie pomoże, gdy wektory są daleko.
  assert.equal(czyScalic(0.30, 'urlop', 'urlopowicz', zSygnalem), false);
});

// --- nakładanie leksykalne ---------------------------------------------------

test('długość rdzenia SAMA odsiewa część pułapek — ale nie wszystkie', () => {
  // Zmierzone przy pisaniu testów, nieoczywiste: „praca"/„pracownik" mają wspólny
  // przedrostek tylko 4 („prac" — piąta litera to „a" kontra „o"), więc przy
  // stemMin = 5 W OGÓLE nie kwalifikują się jako wspólny rdzeń.
  assert.equal(dzielaRdzen('praca', 'pracownik', 5), false, 'wspólny przedrostek to 4 litery');
  assert.equal(dzielaRdzen('praca', 'pracownik', 4), true, 'przy stemMin = 4 już tak');

  // Ale „pracodawca"/„pracownik" dzielą PIĘĆ liter („praco") i przechodzą.
  // To dlatego test regresyjny na tę parę jest nośny, a na „praca"/„pracownik"
  // nie byłby — pierwszą chroni wyłącznie próg wektorowy.
  assert.equal(dzielaRdzen('pracodawca', 'pracownik', 5), true);

  // Krótki wyraz nie może „zawierać się" w dłuższym o tym samym początku.
  assert.equal(dzielaRdzen('pra', 'pracownik', 5), false, '„pra" ma 3 litery');
});

test('rdzeń liczy się na POJEDYNCZYCH WYRAZACH, nie na całej etykiecie', () => {
  // „wymiar urlopu" i „prawo do urlopu" jako całe napisy mają wspólny przedrostek 0,
  // ale dzielą wyraz „urlopu" — i to on decyduje.
  assert.equal(dzielaRdzen('wymiar urlopu', 'prawo do urlopu', 5), true, 'wspólny wyraz „urlopu"');
  assert.equal(dzielaRdzen('czas pracy', 'wniosek pracownika', 5), false, '„pracy"/„pracownika" to 4 litery');
  assert.equal(dzielaRdzen('akumulator', 'reklamacja', 5), false);
});

test('puste i nietekstowe wejście nie wywraca reguły', () => {
  assert.equal(dzielaRdzen('', 'urlop', 5), false);
  assert.equal(dzielaRdzen(null, undefined, 5), false);
});

// =============================================================================
//  GRUPOWANIE (SPEC punkt 2)
// =============================================================================

// Wektory syntetyczne: ortogonalne osie plus mieszanki, żeby dało się sterować
// podobieństwem bez modelu.
const w = (x, y) => [x, y];

function p(id, label, mentionCount, wek, jestZiarnem = false) {
  return { id, label, labelNormalized: label, mentionCount, wek, jestZiarnem };
}

test('ziarnem zostaje pojęcie o najwyższym mention_count', () => {
  const grupy = grupuj(
    [p('a', 'a', 1, w(1, 0)), p('b', 'b', 9, w(1, 0.01)), p('c', 'c', 5, w(0, 1))],
    bezSygnalu
  );
  assert.equal(grupy[0].ziarno.id, 'b', 'najwyższy mention_count');
  assert.deepEqual(grupy[0].czlonkowie.map((x) => x.id), ['a']);
  assert.equal(grupy[1].ziarno.id, 'c', 'ortogonalne zostaje osobno');
});

test('PIERWSZEŃSTWO ZIAREN: kanoniczne zostaje ziarnem mimo niższego licznika', () => {
  // Bez tej reguły powstaje łańcuch: gdyby „nowe" (licznik 99) zostało ziarnem,
  // wchłonęłoby „stare", które JEST już kanoniczne dla czegoś innego — i tamto
  // wskazywałoby na pojęcie, które samo ma merged_into.
  const grupy = grupuj(
    [p('nowe', 'nowe', 99, w(1, 0.01)), p('stare', 'stare', 1, w(1, 0), true)],
    bezSygnalu
  );
  assert.equal(grupy[0].ziarno.id, 'stare', 'istniejące ziarno ma pierwszeństwo');
  assert.deepEqual(grupy[0].czlonkowie.map((x) => x.id), ['nowe']);
});

test('remis w mention_count rozstrzygany alfabetycznie, nie losowo', () => {
  const raz = grupuj([p('b', 'beta', 5, w(0, 1)), p('a', 'alfa', 5, w(1, 0))], bezSygnalu);
  const dwa = grupuj([p('a', 'alfa', 5, w(1, 0)), p('b', 'beta', 5, w(0, 1))], bezSygnalu);
  assert.deepEqual(raz.map((g) => g.ziarno.id), dwa.map((g) => g.ziarno.id));
  assert.equal(raz[0].ziarno.id, 'a');
});

test('podobieństwo liczone DO ZIARNA, nie parami — brak błędnej przechodniości', () => {
  // „a" i „c" są daleko od siebie, ale oba blisko „b". Gdyby algorytm porównywał
  // parami, „c" wpadłoby do grupy przez „a". Porównanie do ziarna temu zapobiega.
  const a = w(1, 0);
  const b = w(0.94, 0.34); // ~0,94 do „a"
  const c = w(0.77, 0.64); // ~0,77 do „a", ~0,94 do „b"
  const grupy = grupuj([p('b', 'b', 9, b), p('a', 'a', 5, a), p('c', 'c', 1, c)], bezSygnalu);
  assert.equal(grupy[0].ziarno.id, 'b');
  // Do ziarna „b" pasują oba — to poprawne. Sedno: „c" nie wpada przez „a".
  assert.ok(grupy[0].czlonkowie.length <= 2);
});

test('pojęcie bez pary zostaje samodzielną grupą', () => {
  const grupy = grupuj([p('a', 'a', 1, w(1, 0)), p('b', 'b', 1, w(0, 1))], bezSygnalu);
  assert.equal(grupy.length, 2);
  assert.equal(grupy[0].czlonkowie.length, 0);
  assert.equal(grupy[1].czlonkowie.length, 0);
});

test('pusta lista nie wywraca grupowania', () => {
  assert.deepEqual(grupuj([], bezSygnalu), []);
});

test('cosinus wektora zerowego nie daje NaN', () => {
  assert.equal(cosinus([0, 0], [1, 0]), 0);
});
