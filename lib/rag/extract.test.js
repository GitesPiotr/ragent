import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kluczPaginy,
  wykryjZywePaginy,
  urwaneZdanie,
  naglowekStrukturalny,
  adnotacjaWNawiasie,
  rozbijPrefiksNumeracyjny,
  statystykaRodzinNumeracyjnych,
  odsiejNiepewneRodziny,
  golyMarker,
  poziomNaglowka,
} from './extract.js';
import { buildExtractedText } from './chunk.js';

// Odsiewanie fałszywych nagłówków (10.a.2). Wszystkie przypadki pochodzą z realnych
// plików korpusu — RODO, Kodeks pracy, 05-instrukcja-bhp.pdf — a nie z wyobraźni.

// Pomocnik: buduje strony z linii, dosypując wypełniacz, żeby "krawędź" strony
// (2 pierwsze / 3 ostatnie linie) miała sens.
function strona({ gora = [], srodek = 10, dol = [] }) {
  const wypelniacz = [];
  for (let i = 0; i < srodek; i++) {
    wypelniacz.push(`Zwykły wiersz akapitu numer ${i}, wystarczająco długi, żeby wyglądał na tekst.`);
  }
  return [...gora, ...wypelniacz, ...dol];
}

// --- klucz porównania ------------------------------------------------------------

test('klucz zrównuje numer strony', () => {
  assert.equal(kluczPaginy('©Kancelaria Sejmu s. 1/186'), kluczPaginy('©Kancelaria Sejmu s. 87/186'));
});

test('klucz zrównuje WARIANTY ODSTĘPÓW — bez tego stopka RODO nie jest wykrywalna', () => {
  // Strony nieparzyste i parzyste RODO mają stopkę złożoną inaczej. Każdy wariant
  // trafia na DOKŁADNIE połowę stron, więc próg "ponad połowa" nie łapie żadnego.
  const nieparzysta = '4.5.2016 L 119/1Dziennik Urzędowy Unii EuropejskiejPL';
  const parzysta = '4.5.2016L 119/2 Dziennik Urzędowy Unii EuropejskiejPL';
  assert.equal(kluczPaginy(nieparzysta), kluczPaginy(parzysta));
});

test('klucz NIE zrównuje różnych treści', () => {
  assert.notEqual(kluczPaginy('Artykuł 5'), kluczPaginy('Rozdział 5'));
});

// --- reguła A: żywe paginy -------------------------------------------------------

test('stopka powtarzana przy krawędzi na wszystkich stronach zostaje odrzucona', () => {
  const strony = [];
  for (let i = 1; i <= 10; i++) {
    strony.push(strona({ dol: [`4.5.2016 L 119/${i}Dziennik Urzędowy Unii EuropejskiejPL`] }));
  }
  const { klucze, raport } = wykryjZywePaginy(strony);
  assert.equal(klucze.size, 1);
  assert.equal(raport[0].wystapien, 10);
  assert.equal(raport[0].stron, 10);
});

test('stopka o zmiennym składzie też — klucz jest odporny na odstępy', () => {
  const strony = [];
  for (let i = 1; i <= 10; i++) {
    const linia = i % 2
      ? `4.5.2016 L 119/${i}Dziennik Urzędowy Unii EuropejskiejPL`
      : `4.5.2016L 119/${i} Dziennik Urzędowy Unii EuropejskiejPL`;
    strony.push(strona({ dol: [linia] }));
  }
  assert.equal(wykryjZywePaginy(strony).klucze.size, 1, 'dwa warianty to jedna pagina');
});

test('NAGŁÓWEK powtarzalny, ale ze ŚRODKA strony, zostaje — to "Artykuł N" z RODO', () => {
  // Zmierzone na realnym pliku: stopka leży przy krawędzi w 92% wystąpień,
  // "Artykuł N" w 8%. Sama powtarzalność skasowałaby prawdziwe nagłówki.
  const strony = [];
  for (let i = 1; i <= 10; i++) {
    const s = strona({ srodek: 10, dol: ['4.5.2016 L 119/1Dziennik Urzędowy Unii EuropejskiejPL'] });
    s.splice(5, 0, `Artykuł ${i}`);
    strony.push(s);
  }
  const { klucze } = wykryjZywePaginy(strony);
  assert.equal(klucze.has(kluczPaginy('Artykuł 4')), false, 'prawdziwy nagłówek nie może wypaść');
  assert.equal(klucze.has(kluczPaginy('4.5.2016 L 119/1Dziennik Urzędowy Unii EuropejskiejPL')), true);
});

test('linia z połowy stron NIE wystarcza — próg to "ponad połowa"', () => {
  const strony = [];
  for (let i = 1; i <= 10; i++) {
    strony.push(i <= 5 ? strona({ gora: ['Tylko na pierwszej połowie'] }) : strona({}));
  }
  assert.equal(wykryjZywePaginy(strony).klucze.size, 0);
});

test('dokument krótszy niż 5 stron jest wyłączony spod reguły', () => {
  // Przy trzech stronach prawdziwy nagłówek rozdziału potrafi wypaść na dwóch z nich.
  const strony = [];
  for (let i = 0; i < 3; i++) strony.push(strona({ gora: ['Rozdział pierwszy'] }));
  assert.equal(wykryjZywePaginy(strony).klucze.size, 0);
});

test('przypisy NIE są paginami — każdy jest inny', () => {
  // "(1) Dz.U. C 229 z 31.7.2012, s. 90." to prawdziwa treść RODO i ma zostać.
  const zrodla = ['C 229 z 31.7.2012', 'L 88 z 4.4.2011', 'C 326 z 26.10.2012', 'L 281 z 23.11.1995'];
  const strony = [];
  for (let i = 0; i < 10; i++) {
    strony.push(strona({ dol: [`(${i + 1}) Dz.U. ${zrodla[i % zrodla.length]}, s. ${i}`] }));
  }
  const { klucze } = wykryjZywePaginy(strony);
  assert.equal(klucze.size, 0, 'różne przypisy nie mogą zlać się w jedną paginę');
});

test('zwykły wiersz tekstu nie skazuje nikogo — liczą się tylko kandydaci na nagłówek', () => {
  const strony = [];
  for (let i = 0; i < 10; i++) {
    // Kończy się kropką, więc nie jest kandydatem na nagłówek wg 8.1.
    strony.push(strona({ dol: ['Powtarzalna stopka zakończona kropką.'] }));
  }
  assert.equal(wykryjZywePaginy(strony).klucze.size, 0);
});

test('pusty dokument nie wywraca reguły', () => {
  assert.deepEqual(wykryjZywePaginy([]), { klucze: new Set(), raport: [] });
  assert.deepEqual(wykryjZywePaginy(null), { klucze: new Set(), raport: [] });
});

// --- reguła B: urwane zdania -----------------------------------------------------

test('kandydat zaczynający się małą literą to zawinięty wiersz', () => {
  assert.equal(urwaneZdanie('pełna przez co najmniej osiem godzin. Nie wolno pozostawiać urządzeń', null), true);
  assert.equal(urwaneZdanie('pod numerem alarmowym 112. Apteczka pierwszej pomocy znajduje się w', null), true);
});

test('kandydat kończący się przyimkiem albo spójnikiem jest urwany', () => {
  assert.equal(urwaneZdanie('Apteczka pierwszej pomocy znajduje się w', null), true);
  assert.equal(urwaneZdanie('Pracownik może wystąpić z wnioskiem oraz', null), true);
});

test('kandydat kontynuujący poprzedni długi wiersz jest urwany', () => {
  const poprzednia = 'Przed pierwszym uruchomieniem urządzenia należy naładować akumulator do';
  assert.equal(urwaneZdanie('Pełnej pojemności baterii wewnętrznej', poprzednia), true);
});

test('krótki poprzednik niczego nie dowodzi — to zwykle sam nagłówek', () => {
  assert.equal(urwaneZdanie('Definicje', '§ 2. (uchylony)'), false);
});

test('kandydat kontynuowany przez NASTĘPNY wiersz jest urwany', () => {
  // 05-instrukcja-bhp.pdf: ta linia stoi tuż po nagłówku, więc sygnał "wstecz"
  // nie ma czego badać — rozstrzyga dopiero linia następna.
  assert.equal(
    urwaneZdanie(
      'W przypadku zauważenia dymu, iskrzenia lub nietypowego zapachu należy',
      null,
      'natychmiast odłączyć urządzenie od zasilania i powiadomić przełożonego.'
    ),
    true
  );
});

test('kontynuacja LICZBĄ też się liczy — tak zawijają się artykuły Kodeksu pracy', () => {
  assert.equal(
    urwaneZdanie('Art. 293. § 1. Pracownik zatrudniony u danego pracodawcy co najmniej', null, '6 miesięcy może raz w roku kalendarzowym wystąpić do pracodawcy'),
    true
  );
});

test('prawdziwe nagłówki przechodzą', () => {
  assert.equal(urwaneZdanie('Definicje', null, 'Na użytek niniejszego rozporządzenia:'), false);
  assert.equal(urwaneZdanie('1. Zasady ogólne', null, 'Przed pierwszym uruchomieniem urządzenia należy'), false);
  assert.equal(urwaneZdanie('2. Postępowanie w razie awarii', null, 'W przypadku zauważenia dymu'), false);
  assert.equal(urwaneZdanie('Instrukcja BHP przy obsłudze urządzeń biurowych', null, 'Niniejsza instrukcja określa'), false);
});

test('nagłówek, po którym stoi POZYCJA LISTY, przechodzi', () => {
  // "Definicje" bywa kontynuowane przez "a) …" i nie znaczy to, że nagłówka nie było.
  assert.equal(urwaneZdanie('Definicje', null, 'a) dane osobowe oznaczają informacje'), false);
  assert.equal(urwaneZdanie('Wyjątki', null, '3) w zakresie określonym w ustawie'), false);
  assert.equal(urwaneZdanie('Zakres', null, '— przepisy przejściowe'), false);
});

test('skrót "r." nie udaje pozycji listy', () => {
  // Kolizja z realnego Kodeksu pracy: "1423, 1661, z 2026" chroniło się przed
  // odrzuceniem, bo następna linia "r. poz. 25." uchodziła za pozycję listy.
  assert.equal(urwaneZdanie('1423, 1661, z 2026', 'poz. 277, 807,', 'r. poz. 25.'), true);
});

test('pusta linia nie jest urwanym zdaniem', () => {
  assert.equal(urwaneZdanie('', null, null), false);
});

// --- osłona: nagłówki strukturalne nigdy nie giną -------------------------------
//
// Przypadku nie ma w korpusie, ale jest realny: dokument, w którym każdy rozdział
// zaczyna się od nowej strony z tytułem u góry. Wtedy "Rozdział 1", "Rozdział 2"…
// po normalizacji cyfr dają JEDEN klucz, powtarzalny i zawsze przy górnej krawędzi —
// czyli dokładnie profil żywej paginy.

test('rozpoznanie nagłówka strukturalnego', () => {
  for (const l of [
    'Rozdział 1', 'ROZDZIAŁ IV', 'Dział III', 'Dział 3', 'Artykuł 17', 'Art. 293.',
    'Część II', '§ 5', '§§ 12', 'Załącznik nr 2', 'Sekcja 3', 'Tytuł I', 'Księga 2',
  ]) {
    assert.equal(naglowekStrukturalny(l), true, `powinno być strukturalne: ${l}`);
  }
});

test('zwykły tekst i paginy NIE są nagłówkiem strukturalnym', () => {
  for (const l of [
    '©Kancelaria Sejmu s. 1/186',
    '4.5.2016 L 119/1Dziennik Urzędowy Unii EuropejskiejPL',
    '2026-04-16',
    'Definicje',
    'Rozdziały są ponumerowane', // słowo bez numeru — nie marker
  ]) {
    assert.equal(naglowekStrukturalny(l), false, `nie powinno być strukturalne: ${l}`);
  }
});

test('REGRESJA: "Rozdział N" u góry KAŻDEJ strony przeżywa regułę pagin', () => {
  // Bez osłony ten kandydat ma profil idealnej paginy: 10/10 stron, 100% przy krawędzi.
  const strony = [];
  for (let i = 1; i <= 10; i++) {
    strony.push([
      `Rozdział ${i}`,
      ...Array.from({ length: 10 }, (_, k) => `Treść rozdziału ${i}, akapit ${k}, odpowiednio długi wiersz.`),
      `©Wydawnictwo s. ${i}/10`,
    ]);
  }
  const { klucze, raport } = wykryjZywePaginy(strony);
  assert.equal(klucze.has(kluczPaginy('Rozdział 1')), false, 'prawdziwy nagłówek nie może wypaść');
  assert.equal(klucze.has(kluczPaginy('©Wydawnictwo s. 1/10')), true, 'pagina nadal ma wypaść');
  assert.equal(raport.length, 1);
});

test('osłona działa też dla paragrafów u góry strony', () => {
  const strony = [];
  for (let i = 1; i <= 8; i++) {
    strony.push([`§ ${i}`, ...Array.from({ length: 8 }, (_, k) => `Zwykły wiersz treści numer ${k} w paragrafie.`)]);
  }
  assert.equal(wykryjZywePaginy(strony).klucze.size, 0);
});

// --- wzorzec C: adnotacja w nawiasie nie jest nagłówkiem ------------------------
//
// "(Tekst mający znaczenie dla EOG)" z czołówki RODO stało się ścieżką dla 231 z 504
// fragmentów — całej preambuły, która własnych śródtytułów nie ma.

test('linia w całości w nawiasie to adnotacja', () => {
  assert.equal(adnotacjaWNawiasie('(Tekst mający znaczenie dla EOG)'), true);
  assert.equal(adnotacjaWNawiasie('(uchylony)'), true);
  assert.equal(adnotacjaWNawiasie('[przypis redakcyjny]'), true);
  assert.equal(adnotacjaWNawiasie('  (Dz.U. L 281 z 23.11.1995)  '), true);
});

test('nawias w ŚRODKU tytułu go nie dyskwalifikuje', () => {
  // To prawdziwy tytuł artykułu RODO i ma zostać nagłówkiem.
  assert.equal(adnotacjaWNawiasie('Prawo do usunięcia danych („prawo do bycia zapomnianym”)'), false);
  assert.equal(adnotacjaWNawiasie('ROZPORZĄDZENIE PARLAMENTU I RADY (UE) 2016/679'), false);
  assert.equal(adnotacjaWNawiasie('Art. 291. § 1. (uchylony)'), false);
  assert.equal(adnotacjaWNawiasie('Definicje'), false);
});

test('dwie osobne grupy nawiasów to nie jedna adnotacja', () => {
  assert.equal(adnotacjaWNawiasie('(a) tekst (b)'), false);
});

test('adnotacja jest DEGRADOWANA, nie usuwana — kasujemy tylko żywe paginy', () => {
  // Tekst zostaje w dokumencie jako akapit; znika wyłącznie ze ścieżki nagłówków.
  // Warunek z 10.a.2: usuwanie treści jest zarezerwowane dla powtarzalnych pagin.
  assert.equal(adnotacjaWNawiasie('(Tekst mający znaczenie dla EOG)'), true);
  assert.equal(naglowekStrukturalny('(Tekst mający znaczenie dla EOG)'), false);
});

// --- 10.a.5: strażnik pokrycia rodziny numeracyjnej -----------------------------
//
// Reguła powstała, bo kryterium domkniętości linii selekcjonuje pod BRAK treści:
// w Kodeksie pracy przeżyły 102 nagłówki artykułowe z 702 kandydatów, a 98 z nich
// to artykuły uchylone. 229 z 519 fragmentów dostawało ścieżkę wskazującą NIE TEN
// przepis co trzeba.

test('prefiks numeracyjny rozbija się na rodzinę i numer', () => {
  assert.deepEqual(rozbijPrefiksNumeracyjny('Art. 36. § 1. Okres wypowiedzenia'), {
    rodzina: 'art', numer: '36', pelny: 'Art. 36.',
  });
  assert.deepEqual(rozbijPrefiksNumeracyjny('§ 5. (uchylony)'), {
    rodzina: '§', numer: '5', pelny: '§ 5.',
  });
  assert.equal(rozbijPrefiksNumeracyjny('Artykuł 17').rodzina, 'artykuł');
  assert.equal(rozbijPrefiksNumeracyjny('1. Zasady ogólne').rodzina, '', 'goła liczba to własna rodzina');
  assert.equal(rozbijPrefiksNumeracyjny('Dział III').rodzina, 'dział');
});

test('liczby rzymskie nie rozpadają się na słowo i numer', () => {
  // Bez rozstrzygnięcia kolizji "IV." czyta się jako słowo "I" + numer "V", a "V."
  // jako sam numer — ta sama numeracja w dwóch rodzinach zaniża pokrycie obu.
  for (const [linia, numer] of [['IV. Postanowienia', 'iv'], ['V. Zakres', 'v'], ['XII. Uwagi', 'xii']]) {
    const p = rozbijPrefiksNumeracyjny(linia);
    assert.equal(p.rodzina, '', `${linia}: liczba rzymska to goła liczba, nie słowo`);
    assert.equal(p.numer, numer, linia);
  }
});

test('jednoliterowa liczba rzymska bez kropki NIE jest numeratorem', () => {
  // Zdanie otwarte polskim spójnikiem "I" czytało się jako numer I i zasilało
  // mianownik pokrycia szumem — w "Ludziach bezdomnych" tak wpadły 4 linie.
  assert.equal(rozbijPrefiksNumeracyjny('I znowu pieści się z oczyma to wzgórze'), null);
  assert.equal(rozbijPrefiksNumeracyjny('I sama go pochowam. Nikt mnie nie powstrzyma!'), null);
  // …ale prawdziwy numer sekcji z kropką dalej działa.
  assert.equal(rozbijPrefiksNumeracyjny('I. Wstęp').numer, 'i');
  assert.equal(rozbijPrefiksNumeracyjny('X. Uwagi końcowe').numer, 'x');
});

test('ZNANY OSAD: inicjał "M. SCHULZ" nadal uchodzi za liczbę rzymską', () => {
  // Kropka nie odróżnia inicjału od numeru sekcji ("I. Wstęp" ma ją tak samo).
  // Zostawione świadomie: to jedno wystąpienie na 402 w RODO, a podpis pod
  // rozporządzeniem i tak nie jest tytułem sekcji, więc degradacja mu nie szkodzi.
  // Test istnieje po to, żeby zmiana tego zachowania była widoczna, a nie cicha.
  assert.deepEqual(rozbijPrefiksNumeracyjny('M. SCHULZ'), { rodzina: '', numer: 'm', pelny: 'M.' });
});

test('zdanie bez numeru nie ma prefiksu numeracyjnego', () => {
  assert.equal(rozbijPrefiksNumeracyjny('Urlopy wypoczynkowe'), null);
  assert.equal(rozbijPrefiksNumeracyjny('Definicje'), null);
  assert.equal(rozbijPrefiksNumeracyjny(''), null);
  assert.equal(rozbijPrefiksNumeracyjny(null), null);
});

test('rodzina o ZNIKOMYM pokryciu zostaje zdegradowana do akapitu', () => {
  // Odwzorowanie Kodeksu: marker "Art. N." otwiera 20 linii, ale nagłówkiem został
  // tylko jeden — i to ten pusty. Pokrycie 1/20 = 5%, poniżej progu 0,5.
  const strony = [[]];
  for (let i = 1; i <= 20; i++) {
    strony[0].push(`Art. ${i}. Treść przepisu numer ${i}, dostatecznie długa, żeby być akapitem.`);
  }
  const blocks = [
    { type: 'heading', level: 1, text: 'Urlopy wypoczynkowe', page: 1 },
    { type: 'heading', level: 1, text: 'Art. 7. (uchylony)', page: 1 },
    { type: 'paragraph', text: 'Art. 8. Nie można czynić ze swego prawa użytku.', page: 1 },
  ];
  const raport = odsiejNiepewneRodziny(blocks, strony);

  assert.equal(blocks[0].type, 'heading', 'tytuł rozdziału bez numeru zostaje nietknięty');
  assert.equal(blocks[1].type, 'paragraph', 'pusty nagłówek artykułu traci status nagłówka');
  assert.equal(raport.length, 1);
  assert.equal(raport[0].rodzina, 'art');
  assert.equal(raport[0].naglowkow, 1);
  assert.equal(raport[0].wystapien, 20);
});

test('rodzina o ZDROWYM pokryciu zostaje — to "Artykuł N" z RODO', () => {
  // W RODO marker stoi w osobnej linii, więc niemal każde wystąpienie JEST nagłówkiem.
  const strony = [Array.from({ length: 20 }, (_, i) => `Artykuł ${i + 1}`)];
  const blocks = strony[0].map((t) => ({ type: 'heading', level: 1, text: t, page: 1 }));
  const raport = odsiejNiepewneRodziny(blocks, strony);

  assert.equal(raport.length, 0, 'zdrowa rodzina nie trafia do raportu');
  assert.ok(blocks.every((b) => b.type === 'heading'), 'żaden nagłówek nie może zniknąć');
});

test('rodzina o kilku wystąpieniach jest POZA oceną — to szum, nie statystyka', () => {
  // Próg POKRYCIE_MIN_WYSTAPIEN = 10. Krótka instrukcja z jednym "§ 1" nie może
  // stracić nagłówka tylko dlatego, że ma go raz.
  const strony = [['§ 1. Postanowienia wstępne', 'Zwykły akapit treści instrukcji.']];
  const blocks = [
    { type: 'heading', level: 1, text: '§ 1. Postanowienia wstępne', page: 1 },
    { type: 'paragraph', text: 'Zwykły akapit treści instrukcji.', page: 1 },
  ];
  assert.deepEqual(odsiejNiepewneRodziny(blocks, strony), []);
  assert.equal(blocks[0].type, 'heading');
});

test('REGRESJA BHP: nagłówki numerowane "1." przeżywają, gdy pokrycie jest zdrowe', () => {
  // 05-instrukcja-bhp.pdf ma ścieżki "1. Zasady ogólne", "2. Postępowanie w razie
  // awarii"… Rodzina "(goła liczba)" ma tam wysokie pokrycie i nie wolno jej ruszyć.
  const naglowki = Array.from({ length: 12 }, (_, i) => `${i + 1}. Sekcja numer ${i + 1}`);
  const strony = [naglowki];
  const blocks = naglowki.map((t) => ({ type: 'heading', level: 1, text: t, page: 1 }));
  odsiejNiepewneRodziny(blocks, strony);
  assert.ok(blocks.every((b) => b.type === 'heading'));
});

test('DEGRADACJA NIE RUSZA TEKSTU — to warunek zerowego kosztu reindeksu', () => {
  // Cała wartość wariantu B polega na tym, że extracted_text jest bajt w bajt taki
  // sam, więc offsety (niezmiennik 8.4) zostają, a przecięcia wymaga tylko ten jeden
  // dokument. Gdyby degradacja zmieniała tekst, koszt byłby zupełnie inny.
  const strony = [Array.from({ length: 20 }, (_, i) => `Art. ${i + 1}. Treść przepisu numer ${i + 1}.`)];
  const zrob = () => [
    { type: 'heading', level: 1, text: 'Urlopy wypoczynkowe', page: 1 },
    { type: 'heading', level: 1, text: 'Art. 7. (uchylony)', page: 1 },
    { type: 'paragraph', text: 'Art. 8. Nie można czynić ze swego prawa użytku.', page: 1 },
  ];
  const przed = buildExtractedText(zrob()).extractedText;
  const po = zrob();
  odsiejNiepewneRodziny(po, strony);
  assert.equal(buildExtractedText(po).extractedText, przed);
});

test('statystyka liczy wystąpienia rodzin w całym dokumencie', () => {
  const strony = [['Art. 1. Coś', '§ 2. Coś innego'], ['Art. 3. Jeszcze coś', 'Bez numeru wcale']];
  const stat = statystykaRodzinNumeracyjnych(strony);
  assert.equal(stat.get('art'), 2);
  assert.equal(stat.get('§'), 1);
  assert.equal(stat.has('bez'), false, 'słowo bez liczby nie tworzy rodziny');
});

test('pusty dokument nie wywraca strażnika', () => {
  assert.deepEqual(odsiejNiepewneRodziny([], []), []);
  assert.deepEqual([...statystykaRodzinNumeracyjnych(null)], []);
});

// --- poziomy nagłówków: para "etykieta + tytuł" ---------------------------------
//
// Powód: w RODO "Artykuł 36" i "Uprzednie konsultacje" to dwie osobne linie
// nagłówkowe. Przy jednym poziomie dla wszystkich tytuł ZRZUCAŁ numer ze stosu
// i numer artykułu wyparowywał z cytowania — 53 z 503 fragmentów RODO miały
// w heading_path jakąkolwiek cyfrę.

test('goły marker to sama etykieta, bez tytułu', () => {
  for (const l of ['Artykuł 36', 'Rozdział IV', 'Oddział 1', 'Art. 152.', '§ 5', 'IV.']) {
    assert.equal(golyMarker(l), true, `powinno być gołym markerem: ${l}`);
  }
});

test('marker Z tytułem gołym markerem NIE jest', () => {
  for (const l of ['Artykuł 36 Uprzednie konsultacje', 'Rozdział II Umowa o pracę', '1. Zasady ogólne']) {
    assert.equal(golyMarker(l), false, `nie powinno być gołym markerem: ${l}`);
  }
  assert.equal(golyMarker('Definicje'), false, 'brak numeru — to nie marker');
  assert.equal(golyMarker('DZIAŁ ÓSMY'), false, 'liczebnik słowny to nie numer');
});

test('tytuł po gołym markerze schodzi o poziom — tak wraca numer artykułu RODO', () => {
  const marker = { type: 'heading', level: 1, text: 'Artykuł 36' };
  assert.equal(poziomNaglowka('Uprzednie konsultacje', marker), 2);
});

test('MARKER PO MARKERZE zostaje na tym samym poziomie', () => {
  // Regresja z wariantu naiwnego: "Rozdział II" + "DZIAŁ ÓSMY" to sąsiedzi z dwóch
  // sekcji, nie rodzic i dziecko. Zagnieżdżenie ich dawało ścieżkę twierdzącą,
  // że Dział VIII leży w Rozdziale II, i podnosiło realne sprzeczności z 0 do 1.
  const marker = { type: 'heading', level: 1, text: 'Rozdział II' };
  assert.equal(poziomNaglowka('Oddział 1', marker), 1);
});

test('nagłówek po AKAPICIE zawsze zaczyna od poziomu 1', () => {
  assert.equal(poziomNaglowka('Definicje', { type: 'paragraph', text: 'jakaś treść' }), 1);
  assert.equal(poziomNaglowka('Definicje', null), 1);
});

test('tytuł po tytule NIE schodzi głębiej — inaczej proza łączy przypisy w hierarchie', () => {
  // "Ludzie bezdomni": wariant naiwny sklejał kolejne przypisy redakcyjne
  // w fałszywe ścieżki rodzic-dziecko (188 zmienionych ścieżek zamiast 10).
  const tytul = { type: 'heading', level: 1, text: 'Pierwsza pomoc' };
  assert.equal(poziomNaglowka('Zasady ogólne', tytul), 1);
});

test('zagnieżdżenie nie schodzi bez końca', () => {
  const gleboki = { type: 'heading', level: 6, text: 'Artykuł 9' };
  assert.equal(poziomNaglowka('Tytuł artykułu', gleboki), 6);
});
