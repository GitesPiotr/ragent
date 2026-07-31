import { test } from 'node:test';
import assert from 'node:assert/strict';
import { czytajStronami, ROZMIAR_STRONY } from './db.js';

// =============================================================================
//  ODCZYT STRONAMI
//
//  Ta pułapka wróciła trzy razy — rag_chunk_concepts, rag_concepts, a wcześniej
//  odczyty w skryptach diagnostycznych. Reguła „wszystkie odczyty muszą stronicować"
//  jej nie zatrzymała, bo reguła nie jest wykonywalna. Te testy są.
// =============================================================================

// Udawana tabela: oddaje wycinek, ale TYLKO jeśli zapytanie poda zakres — dokładnie
// jak PostgREST, który bez `.range()` ucina na 1000 i nie mówi, że uciął.
function tabela(ile, { szanujeRange = true, limitBezRange = 1000 } = {}) {
  const wiersze = [];
  for (let i = 0; i < ile; i++) wiersze.push({ id: i, tekst: 'w' + i });
  return (od, do_) => {
    if (!szanujeRange) return Promise.resolve({ data: wiersze.slice(0, limitBezRange), error: null });
    return Promise.resolve({ data: wiersze.slice(od, do_ + 1), error: null });
  };
}

test('odczyt poniżej jednej strony robi JEDNO zapytanie', async () => {
  let wywolan = 0;
  const t = tabela(3);
  const wynik = await czytajStronami((od, do_) => {
    wywolan++;
    return t(od, do_);
  });
  assert.equal(wynik.length, 3);
  assert.equal(wywolan, 1, 'jedna niepełna strona kończy odczyt');
});

test('odczyt POWYŻEJ 1000 wierszy jest pełny — to jest cała racja bytu tej funkcji', async () => {
  const t = tabela(1234);
  const wynik = await czytajStronami((od, do_) => t(od, do_));
  assert.equal(wynik.length, 1234);
  assert.deepEqual(wynik[0], { id: 0, tekst: 'w0' });
  assert.deepEqual(wynik[1233], { id: 1233, tekst: 'w1233' });
});

test('liczba wierszy równa wielokrotności strony nie gubi ani nie dubluje', async () => {
  // Przypadek brzegowy, na którym łamią się ręczne pętle: ostatnia strona jest
  // PEŁNA, więc trzeba wykonać jeszcze jedno zapytanie, żeby zobaczyć, że nic nie ma.
  const t = tabela(ROZMIAR_STRONY * 2);
  let wywolan = 0;
  const wynik = await czytajStronami((od, do_) => {
    wywolan++;
    return t(od, do_);
  });
  assert.equal(wynik.length, ROZMIAR_STRONY * 2);
  assert.equal(wywolan, 3, 'dwie pełne strony plus jedna pusta na potwierdzenie');
  assert.equal(new Set(wynik.map((w) => w.id)).size, ROZMIAR_STRONY * 2, 'żaden wiersz nie zdublowany');
});

test('ZAPOMNIANY .range() kończy się jawnym błędem, nie pętlą bez końca', async () => {
  // Bez tego zabezpieczenia ręczna pętla dostaje wciąż tę samą stronę i kręci się
  // w nieskończoność — cicho, bez objawu, do wyczerpania czasu żądania.
  const t = tabela(5000, { szanujeRange: false });
  await assert.rejects(
    () => czytajStronami((od, do_) => t(od, do_)),
    (e) => e.code === 'internal' && /nie stosuje \.range/.test(e.message)
  );
});

test('błąd bazy leci do wywołującego, a nie jest zjadany jako pusta strona', async () => {
  await assert.rejects(
    () => czytajStronami(() => Promise.resolve({ data: null, error: { message: 'padło' } })),
    (e) => e.code === 'internal' && /padło/.test(e.message)
  );
});

test('naBlad pozwala przetłumaczyć błąd bazy na własny kod', async () => {
  // graph.js zamienia 22P02 na invalid_input („to nie jest UUID"). Helper nie może
  // tego zabrać, bo komunikat dla użytkownika należy do modułu dziedzinowego.
  await assert.rejects(
    () =>
      czytajStronami(() => Promise.resolve({ data: null, error: { code: '22P02' } }), {
        naBlad: (e) => {
          const b = new Error('Nieprawidłowy identyfikator.');
          b.code = e.code === '22P02' ? 'invalid_input' : 'internal';
          return b;
        },
      }),
    (e) => e.code === 'invalid_input'
  );
});

test('pusta tabela zwraca pustą tablicę, nie null', async () => {
  const wynik = await czytajStronami((od, do_) => tabela(0)(od, do_));
  assert.deepEqual(wynik, []);
});

test('rozmiar strony da się nadpisać — grupy .in() mają inny limit niż odczyt masowy', async () => {
  const t = tabela(25);
  let wywolan = 0;
  const wynik = await czytajStronami(
    (od, do_) => {
      wywolan++;
      return t(od, do_);
    },
    { rozmiar: 10 }
  );
  assert.equal(wynik.length, 25);
  assert.equal(wywolan, 3);
});
