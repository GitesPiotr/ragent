import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { koloryDokumentow, paletaPlotna, ZAPASOWA, LICZBA_DOKUMENTOW } from './paletaPlotna.js';

// =============================================================================
//  PARZYSTOŚĆ DWÓCH PALET — TEST, KTÓRY ISTNIEJE ZAMIAST KOMENTARZA „PAMIĘTAJ"
//
//  Kolor dokumentu jest przypisywany po indeksie w DWÓCH miejscach: serwer
//  liczy go z tablicy w lib/rag/map.js, a przeglądarka nadpisuje wartością
//  ze zmiennej --dokument-N. Dopóki oba zestawy JASNE są identyczne, podmiana
//  w motywie jasnym jest niewidoczna i nic nie może się rozjechać po cichu.
//
//  Gdyby ktoś zmienił paletę w map.js, nie ruszając arkusza, motyw JASNY
//  zacząłby pokazywać inne kolory niż zapisane w bazie migawki i niż legenda
//  na wydrukach. Ten test pilnuje właśnie tego — i dlatego czyta OBA pliki
//  jako tekst, zamiast je importować: `lib/rag/map.js` ciągnie klienta
//  Supabase i konfigurację, których ten test nie potrzebuje i nie powinien
//  wymagać do uruchomienia.
// =============================================================================

const KORZEN = new URL('../../../', import.meta.url);

function hexZPliku(sciezka, wzorzec) {
  const tekst = readFileSync(new URL(sciezka, KORZEN), 'utf8');
  const dopasowanie = tekst.match(wzorzec);
  assert.ok(dopasowanie, `nie znaleziono wzorca w ${sciezka}`);
  return dopasowanie[1].match(/#[0-9a-fA-F]{6}/g) || [];
}

// KOMENTARZE LECĄ PRZED PODZIAŁEM NA BLOKI — i to nie jest ostrożność na zapas.
// Pierwsza wersja tego testu dzieliła arkusz po `indexOf('@media (prefers-color-
// scheme: dark)')` i trafiała we WZMIANKĘ o tej regule w komentarzu nagłówkowym,
// 1300 znaków przed samą regułą. Blok „jasny" wychodził wtedy pusty, a „ciemny"
// zawierał oba zestawy naraz.
function bezKomentarzy(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Zwraca [jasne, ciemne] — dwa bloki arkusza rozdzielone regułą motywu ciemnego.
function blokiArkusza() {
  const css = bezKomentarzy(readFileSync(new URL('app/kreator-rag/kreator-rag.module.css', KORZEN), 'utf8'));
  const granica = css.indexOf('@media (prefers-color-scheme: dark)');
  assert.ok(granica > 0, 'arkusz nie ma bloku motywu ciemnego');
  return [css.slice(0, granica), css.slice(granica)];
}

function dokumentyZBloku(blok, gdzie) {
  const out = [];
  for (let i = 0; i < LICZBA_DOKUMENTOW; i++) {
    const m = blok.match(new RegExp(`--dokument-${i}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(m, `brak --dokument-${i} w motywie ${gdzie}`);
    out.push(m[1].toLowerCase());
  }
  return out;
}

test('paleta dokumentów w CSS (motyw jasny) zgadza się z paletą rdzenia', () => {
  // Tablica PALETA z lib/rag/map.js — dziesięć kolorów przypisywanych po indeksie.
  const zRdzenia = hexZPliku('lib/rag/map.js', /const PALETA = \[([\s\S]*?)\];/);
  const [blokJasny] = blokiArkusza();
  const zCss = dokumentyZBloku(blokJasny, 'jasnym');

  assert.equal(zRdzenia.length, LICZBA_DOKUMENTOW, 'rdzeń ma mieć dokładnie 10 kolorów');
  assert.deepEqual(
    zCss,
    zRdzenia.map((c) => c.toLowerCase()),
    'kolejność też ma znaczenie: kolor wynika z INDEKSU dokumentu'
  );
});

test('zestaw zapasowy w JS jest tym samym, co motyw jasny w arkuszu', () => {
  // ZAPASOWA wchodzi, gdy odczyt z CSS się nie uda. Gdyby się rozjechała,
  // awaria odczytu zmieniałaby kolory zamiast je zachować.
  const [blokJasny] = blokiArkusza();
  assert.deepEqual(
    ZAPASOWA.dokumenty.map((c) => c.toLowerCase()),
    dokumentyZBloku(blokJasny, 'jasnym')
  );
});

test('motyw ciemny ma komplet dziesięciu kolorów i żaden nie powtarza jasnego', () => {
  const [blokJasny, blokCiemny] = blokiArkusza();
  const ciemne = dokumentyZBloku(blokCiemny, 'ciemnym');
  const jasne = dokumentyZBloku(blokJasny, 'jasnym');

  assert.equal(new Set(ciemne).size, LICZBA_DOKUMENTOW, 'żaden kolor nie może się powtórzyć');
  // To ma być INNY zestaw, nie przepisany jasny — na żadnej pozycji.
  assert.equal(ciemne.some((c, i) => c === jasne[i]), false, 'ciemny zestaw ma być inny');
});

test('oba bloki motywu ciemnego niosą tę samą paletę', () => {
  // Konwencja AIDEAS wymaga duplikatu: @media dla „auto" i :root[data-theme]
  // dla wymuszenia. Rozjazd między nimi znaczyłby, że kolory zależą od tego,
  // CZY motyw wymuszono — a nie od tego, jaki jest.
  const [, blokCiemny] = blokiArkusza();
  const granica = blokCiemny.indexOf(':root[data-theme="dark"] .panel');
  assert.ok(granica > 0, 'brak bloku wymuszonego');
  assert.deepEqual(
    dokumentyZBloku(blokCiemny.slice(0, granica), 'ciemnym (auto)'),
    dokumentyZBloku(blokCiemny.slice(granica), 'ciemnym (wymuszonym)')
  );
});

// --- przypisanie koloru po indeksie ---------------------------------------------

test('kolor bierze się z POZYCJI dokumentu, nie z pola color', () => {
  const dokumenty = [
    { id: 'a', color: '#111111' },
    { id: 'b', color: '#222222' },
  ];
  const paleta = { ...ZAPASOWA, dokumenty: ['#aaaaaa', '#bbbbbb'] };
  const kolory = koloryDokumentow(dokumenty, paleta);

  assert.equal(kolory.get('a'), '#aaaaaa');
  assert.equal(kolory.get('b'), '#bbbbbb');
});

test('jedenasty dokument zawija się tak samo jak w rdzeniu (modulo)', () => {
  // kolorDokumentu() robi `index % PALETA.length` — tutaj musi wyjść to samo,
  // inaczej ten sam dokument miałby inny kolor w każdym motywie.
  const dokumenty = Array.from({ length: 12 }, (_, i) => ({ id: 'd' + i, color: '#000000' }));
  const kolory = koloryDokumentow(dokumenty, ZAPASOWA);

  assert.equal(kolory.get('d10'), kolory.get('d0'));
  assert.equal(kolory.get('d11'), kolory.get('d1'));
});

test('brak dokumentów nie wywraca budowania mapy kolorów', () => {
  assert.equal(koloryDokumentow(null, ZAPASOWA).size, 0);
  assert.equal(koloryDokumentow([], ZAPASOWA).size, 0);
});

test('kolor z serwera wchodzi, gdy lista z CSS jest krótsza niż powinna', () => {
  const dokumenty = [{ id: 'a', color: '#feffff' }];
  const kolory = koloryDokumentow(dokumenty, { dokumenty: [''] });
  assert.equal(kolory.get('a'), '#feffff');
});

// --- odczyt bez DOM --------------------------------------------------------------

test('paletaPlotna bez elementu oddaje zestaw zapasowy, nie pustkę', () => {
  // `fillStyle` ustawiony pustym napisem canvas cicho ignoruje i maluje czernią —
  // dlatego brak odczytu musi oddać wartości, a nie undefined.
  const p = paletaPlotna(null);
  assert.equal(p, ZAPASOWA);
  assert.equal(p.dokumenty.length, LICZBA_DOKUMENTOW);
  for (const pole of ['siatka', 'podpis', 'wyroznienie', 'obrysPodpisu', 'przygaszony', 'most', 'fallback']) {
    assert.equal(typeof p[pole], 'string');
    assert.ok(p[pole].length > 0, `${pole} nie może być puste`);
  }
});
