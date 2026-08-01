import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBasis,
  buildProjection,
  projectVector,
  applySignConvention,
  computeMean,
  computeViewport,
  percentile,
  computeNeighbors2d,
  neighborsForPoint,
  neighborsForNewPoints,
  COMPONENT_COUNT,
} from './pca.js';

// Dane syntetyczne o ZNANEJ strukturze: wariancja maleje wzdłuż kolejnych osi,
// czwarta oś jest stała. PCA musi to odtworzyć — i to daje się sprawdzić liczbowo.
function daneTestowe(n = 12) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push([
      (i - (n - 1) / 2) * 2, // największa wariancja
      ((i % 3) - 1) * 1.0, //  średnia
      ((i % 2) * 2 - 1) * 0.3, // najmniejsza
      5, //                      zerowa (stała)
    ]);
  }
  return out;
}

// --- DETERMINIZM: pierwszy punkt DoD Sesji 6 --------------------------------------

test('dwa przebiegi na tych samych danych dają IDENTYCZNE współrzędne (co do bitu)', () => {
  const dane = daneTestowe();
  const a = buildProjection(dane, { builtAt: 'x' });
  const b = buildProjection(dane, { builtAt: 'x' });

  assert.deepEqual(a.projection.components, b.projection.components);
  assert.deepEqual(a.projection.mean, b.projection.mean);
  assert.deepEqual(a.coords, b.coords);
  assert.deepEqual(a.projection.viewport, b.projection.viewport);
});

test('12.9: ścieżka PCA nie woła Math.random ani razu', () => {
  const oryginal = Math.random;
  Math.random = () => {
    throw new Error('Math.random() jest zakazane w ścieżce PCA (12.9)');
  };
  try {
    const out = buildProjection(daneTestowe());
    assert.equal(out.projection.components.length, COMPONENT_COUNT);
  } finally {
    Math.random = oryginal;
  }
});

// --- STRUKTURA: czy to w ogóle jest PCA ------------------------------------------

test('pierwsza składowa trafia w oś o największej wariancji', () => {
  const { projection } = buildProjection(daneTestowe());
  const c0 = projection.components[0];
  assert.ok(Math.abs(c0[0]) > 0.99, `oczekiwano osi 0, dostano ${JSON.stringify(c0)}`);
});

test('składowe są jednostkowe i wzajemnie prostopadłe', () => {
  const { projection } = buildProjection(daneTestowe());
  const [c0, c1, c2] = projection.components;
  const dlugosc = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  const iloczyn = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

  for (const c of [c0, c1, c2]) assert.ok(Math.abs(dlugosc(c) - 1) < 1e-9);
  assert.ok(Math.abs(iloczyn(c0, c1)) < 1e-9);
  assert.ok(Math.abs(iloczyn(c0, c2)) < 1e-9);
  assert.ok(Math.abs(iloczyn(c1, c2)) < 1e-9);
});

test('współrzędne są wycentrowane — średnia rzutu wypada w zerze', () => {
  const { coords } = buildProjection(daneTestowe());
  const srednia = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  assert.ok(Math.abs(srednia) < 1e-9, `średnia coord_x = ${srednia}`);
});

test('liczone są ZAWSZE trzy składowe (12.2), także gdy trzecia jest zdegenerowana', () => {
  const { coords, projection } = buildProjection([
    [1, 0, 0, 0],
    [2, 0, 0, 0],
    [3, 0, 0, 0],
  ]);
  assert.equal(projection.components.length, 3);
  for (const c of coords) assert.equal(c.length, 3);
});

// --- KONWENCJA ZNAKU (12.3) -------------------------------------------------------

test('konwencja znaku: dominujący element ujemny → cała składowa odwrócona', () => {
  assert.deepEqual(Array.from(applySignConvention(new Float64Array([-0.9, 0.1, 0.2]))), [0.9, -0.1, -0.2]);
});

test('konwencja znaku: dominujący element dodatni → bez zmian', () => {
  assert.deepEqual(Array.from(applySignConvention(new Float64Array([0.9, -0.1, 0.2]))), [0.9, -0.1, 0.2]);
});

test('konwencja znaku decyduje o dominującym elemencie, nie o pierwszym', () => {
  // Największa wartość bezwzględna to -0.8 na indeksie 1 → odwracamy.
  assert.deepEqual(Array.from(applySignConvention(new Float64Array([0.3, -0.8, 0.1]))), [-0.3, 0.8, -0.1]);
});

test('każda zbudowana składowa spełnia konwencję znaku', () => {
  const { projection } = buildProjection(daneTestowe());
  for (const c of projection.components) {
    let idx = 0;
    for (let i = 1; i < c.length; i++) if (Math.abs(c[i]) > Math.abs(c[idx])) idx = i;
    if (Math.abs(c[idx]) > 0) assert.ok(c[idx] > 0, `składowa łamie konwencję: ${JSON.stringify(c)}`);
  }
});

// --- ROZBUDOWA BEZ PRZELICZANIA BAZY (DoD: istniejące punkty się NIE ruszają) ------

test('projectVector istniejącą bazą odtwarza dokładnie te same współrzędne', () => {
  const dane = daneTestowe();
  const { projection, coords } = buildProjection(dane);
  const mean = projection.mean;
  const comps = projection.components;

  dane.forEach((v, i) => {
    assert.deepEqual(projectVector(v, mean, comps), coords[i]);
  });
});

test('nowy wektor rzutowany starą bazą nie zmienia współrzędnych istniejących', () => {
  const dane = daneTestowe();
  const { projection, coords } = buildProjection(dane);

  // Dokładamy fragment i rzutujemy go BEZ przeliczania bazy.
  const nowy = [7.5, 0.5, -0.2, 5];
  const nowe = projectVector(nowy, projection.mean, projection.components);

  assert.equal(nowe.length, 3);
  // Stare współrzędne policzone ponownie tą samą bazą — identyczne.
  dane.forEach((v, i) => {
    assert.deepEqual(projectVector(v, projection.mean, projection.components), coords[i]);
  });
});

test('mean jest zapisany w projection i zgadza się ze średnią danych', () => {
  const dane = daneTestowe();
  const { projection } = buildProjection(dane);
  assert.deepEqual(projection.mean, Array.from(computeMean(dane)));
});

// --- VIEWPORT (12.1) --------------------------------------------------------------

test('percentyl: interpolacja liniowa na znanych danych', () => {
  const s = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.equal(percentile(s, 0), 0);
  assert.equal(percentile(s, 1), 9);
  assert.equal(percentile(s, 0.5), 4.5);
});

test('viewport to 5. i 95. percentyl, NIE min/max — odstający punkt nie ustala skali', () => {
  const coords = [];
  for (let i = 0; i < 100; i++) coords.push([i / 99, i / 99, 0]); // równomiernie 0..1
  coords.push([1000, 1000, 0]); // jeden bardzo odległy fragment

  const vp = computeViewport(coords);
  assert.ok(vp.xMax < 2, `odstający punkt przeskalował viewport: xMax=${vp.xMax}`);
  assert.ok(vp.xMin >= 0 && vp.xMin < 0.2);
});

test('viewport zdegenerowany (wszystkie punkty w jednym miejscu) jest rozsunięty', () => {
  const vp = computeViewport([
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ]);
  assert.ok(vp.xMax > vp.xMin, 'zerowy zakres złamałby przeliczanie na piksele');
  assert.ok(vp.zMax > vp.zMin);
});

test('viewport ma komplet sześciu granic (także osi Z)', () => {
  const { projection } = buildProjection(daneTestowe());
  assert.deepEqual(Object.keys(projection.viewport).sort(), [
    'xMax', 'xMin', 'yMax', 'yMin', 'zMax', 'zMin',
  ]);
});

// --- PRZYPADKI BRZEGOWE -----------------------------------------------------------

test('mniej niż 3 fragmenty → invalid_input (12.4: mapa niedostępna)', () => {
  assert.throws(() => buildBasis([[1, 2, 3], [4, 5, 6]]), (e) => e.code === 'invalid_input');
});

test('niespójny wymiar wektorów → dim_mismatch', () => {
  assert.throws(
    () => buildBasis([[1, 2, 3], [4, 5], [7, 8, 9]]),
    (e) => e.code === 'dim_mismatch'
  );
});

test('identyczne wektory (zerowa wariancja) nie wywracają budowy', () => {
  const out = buildProjection([
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ]);
  assert.equal(out.coords.length, 3);
  for (const c of out.coords) for (const v of c) assert.ok(Number.isFinite(v));
});

// --- SĄSIEDZI 2D (12.6) -----------------------------------------------------------

test('computeNeighbors2d znajduje k najbliższych i nie wlicza samego siebie', () => {
  const punkty = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 1, y: 0 },
    { id: 'c', x: 5, y: 0 },
    { id: 'd', x: 10, y: 0 },
  ];
  const s = computeNeighbors2d(punkty, 2);
  assert.deepEqual(s.get('a').map((n) => n.id), ['b', 'c']);
  assert.ok(!s.get('a').some((n) => n.id === 'a'));
  assert.equal(s.get('a')[0].dist2d, 1);
});

test('dist2d to odległość euklidesowa w 2D, nie podobieństwo', () => {
  const s = computeNeighbors2d(
    [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 3, y: 4 },
      { id: 'c', x: 30, y: 40 },
    ],
    1
  );
  assert.equal(s.get('a')[0].dist2d, 5);
});

test('k większe niż liczba punktów → tyle, ile jest', () => {
  const s = computeNeighbors2d([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 1 }], 5);
  assert.equal(s.get('a').length, 1);
});

test('k = 0 → puste listy, bez wywrotki', () => {
  const s = computeNeighbors2d([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 1 }], 0);
  assert.deepEqual(s.get('a'), []);
});

test('neighborsForPoint liczy sąsiadów nowego punktu względem istniejących', () => {
  const istniejace = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 10, y: 10 },
  ];
  const sasiedzi = neighborsForPoint({ id: 'nowy', x: 0.5, y: 0.5 }, istniejace, 1);
  assert.equal(sasiedzi.length, 1);
  assert.equal(sasiedzi[0].id, 'a');
});

// --- neighborsForNewPoints: wariant przyrostowy z 12.6 ----------------------------

test('neighborsForNewPoints liczy listy TYLKO dla nowych punktów', () => {
  const stare = [
    { id: 's1', x: 0, y: 0 },
    { id: 's2', x: 10, y: 10 },
  ];
  const out = neighborsForNewPoints([{ id: 'n1', x: 0.1, y: 0.1 }], stare, 1);
  assert.deepEqual([...out.keys()], ['n1'], 'stare punkty nie mają prawa dostać nowych list');
  assert.equal(out.get('n1')[0].id, 's1');
});

test('nowe punkty widzą siebie wzajemnie, nie tylko starą mapę', () => {
  const stare = [{ id: 's1', x: 100, y: 100 }];
  const nowe = [
    { id: 'n1', x: 0, y: 0 },
    { id: 'n2', x: 0.5, y: 0 },
  ];
  const out = neighborsForNewPoints(nowe, stare, 1);
  assert.equal(out.get('n1')[0].id, 'n2', 'partia z jednego rozdziału musi łączyć się sama ze sobą');
  assert.equal(out.get('n2')[0].id, 'n1');
});

test('neighborsForNewPoints nie wlicza samego siebie i respektuje k', () => {
  const stare = [
    { id: 's1', x: 1, y: 0 },
    { id: 's2', x: 2, y: 0 },
    { id: 's3', x: 3, y: 0 },
  ];
  const out = neighborsForNewPoints([{ id: 'n1', x: 0, y: 0 }], stare, 2);
  const ids = out.get('n1').map((s) => s.id);
  assert.equal(ids.length, 2);
  assert.equal(ids.includes('n1'), false);
  assert.deepEqual(ids, ['s1', 's2'], 'kolejność od najbliższego');
});

test('k = 0 → puste listy, bez wywrotki', () => {
  const out = neighborsForNewPoints([{ id: 'n1', x: 0, y: 0 }], [{ id: 's1', x: 1, y: 1 }], 0);
  assert.deepEqual(out.get('n1'), []);
});

test('klucz odległości to dist2d — nie score z sekcji 11', () => {
  const out = neighborsForNewPoints([{ id: 'n1', x: 0, y: 0 }], [{ id: 's1', x: 3, y: 4 }], 1);
  const s = out.get('n1')[0];
  assert.equal(s.dist2d, 5);
  assert.equal('score' in s, false);
});

test('neighborsForNewPoints daje ten sam wynik co pełne przeliczenie — dla nowego punktu', () => {
  const stare = [
    { id: 's1', x: 0, y: 0 },
    { id: 's2', x: 1, y: 2 },
    { id: 's3', x: -3, y: 1 },
    { id: 's4', x: 2, y: -2 },
  ];
  const nowy = { id: 'n1', x: 0.4, y: 0.4 };
  const przyrostowo = neighborsForNewPoints([nowy], stare, 2).get('n1');
  const pelne = computeNeighbors2d(stare.concat([nowy]), 2).get('n1');
  assert.deepEqual(przyrostowo, pelne, 'tania ścieżka nie może dawać innych sąsiadów niż droga');
});

test('neighborsForPoint zostaje zgodne z wersją przyrostową (jedna reguła, nie dwie)', () => {
  const stare = [
    { id: 's1', x: 0, y: 0 },
    { id: 's2', x: 5, y: 5 },
  ];
  const p = { id: 'n1', x: 1, y: 1 };
  assert.deepEqual(neighborsForPoint(p, stare, 1), neighborsForNewPoints([p], stare, 1).get('n1'));
});
