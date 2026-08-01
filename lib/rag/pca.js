// PCA i rzutowanie 2D/3D (sekcja 12). CZYSTA MATEMATYKA — zero bazy, zero Reacta,
// zero window. Wszystko tutaj jest funkcją danych wejściowych, więc testuje się
// bez Supabase i bez Ollamy.
//
// CZTERY REGUŁY, KTÓRYCH TU PILNUJEMY (każda broni innego punktu DoD Sesji 6):
//
// 1. WEKTOR ŚREDNIEJ (12.1). Rzut to v0 = v - mean, dopiero potem iloczyny skalarne.
//    Bez centrowania nowe fragmenty lądują w innym miejscu niż reszta mapy.
// 2. KONWENCJA ZNAKU (12.3). Składowe PCA są określone z dokładnością do znaku —
//    bez konwencji przeliczenie bazy odbiłoby całą mapę lustrzanie.
// 3. VIEWPORT (12.1) liczony RAZEM z bazą jako 5. i 95. percentyl współrzędnych.
//    Skala ekranu nie może brać się z bieżącego zakresu punktów, bo jeden odległy
//    fragment przeskalowałby cały obraz.
// 4. DETERMINIZM. Dwa przebiegi na tych samych danych muszą dać IDENTYCZNY wynik:
//    - ZERO Math.random() (12.9 zakazuje tego wprost — to błąd prototypu),
//    - start iteracji z generatora o STAŁYM ziarnie,
//    - stałe kryterium zbieżności,
//    - a poza tym KOLEJNOŚĆ WEJŚCIA MA ZNACZENIE: sumowanie zmiennoprzecinkowe nie
//      jest przemienne, więc te same wektory podane w innej kolejności dają wynik
//      różniący się na ostatnich bitach. Wołający musi podawać je posortowane
//      (u nas: zawsze `order by id`). Ta funkcja niczego nie sortuje sama, bo nie
//      zna identyfikatorów — pilnuje tego map.js.

// Liczba składowych liczona ZAWSZE (12.2): trzecia jest do widoku 3D z 6b, ale dokładamy
// ją teraz, bo później oznaczałaby przeliczenie współrzędnych wszystkich fragmentów.
export const COMPONENT_COUNT = 3;

// Minimum, przy którym PCA ma z czego wyznaczyć składowe (12.4).
export const MIN_CHUNKS_FOR_PCA = 3;

const MAX_ITER = 300;
const EPS_CONVERGENCE = 1e-10;
// Stałe ziarno — patrz reguła 4. Wartość jest dowolna, ale MUSI być stała.
const SEED = 0x9e3779b9;

// Deterministyczny generator (mulberry32). Zastępuje Math.random() w miejscu, gdzie
// potrzebny jest tylko "dowolny, ale niezdegenerowany" wektor startowy.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function norm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

function normalizeInPlace(v) {
  const n = norm(v);
  if (n === 0) return false;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return true;
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Odejmuje od v rzuty na już znalezione składowe (Gram-Schmidt). Dzięki temu kolejna
// składowa wychodzi prostopadła do poprzednich — to nasza deflacja, bez modyfikowania
// danych wejściowych.
function orthogonalize(v, components) {
  for (const c of components) {
    const d = dot(v, c);
    for (let i = 0; i < v.length; i++) v[i] -= d * c[i];
  }
}

// Średnia po próbkach (12.1). Kolejność sumowania = kolejność wejścia.
export function computeMean(vectors) {
  const dim = vectors[0].length;
  const mean = new Float64Array(dim);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) mean[i] += v[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= vectors.length;
  return mean;
}

// Konwencja znaku (12.3): szukamy elementu o największej wartości bezwzględnej;
// jeśli jest ujemny, odwracamy znak CAŁEJ składowej. Przy remisie wygrywa niższy
// indeks — remis jest teoretyczny, ale reguła musi być jednoznaczna, bo od niej
// zależy, czy mapa nie odbije się lustrzanie przy przeliczeniu.
export function applySignConvention(component) {
  let idx = 0;
  let best = Math.abs(component[0]);
  for (let i = 1; i < component.length; i++) {
    const a = Math.abs(component[i]);
    if (a > best) {
      best = a;
      idx = i;
    }
  }
  if (component[idx] < 0) {
    for (let i = 0; i < component.length; i++) component[i] = -component[i];
  }
  return component;
}

// Jedna składowa metodą potęgową. C·v liczone jako suma po próbkach:
//   C·v = (1/n) * Σ_i v0_i * (v0_i · v)
// czyli bez budowania macierzy kowariancji 1024×1024.
function powerIteration(centered, dim, found, rand) {
  const v = new Float64Array(dim);
  for (let i = 0; i < dim; i++) v[i] = rand() * 2 - 1;
  orthogonalize(v, found);
  if (!normalizeInPlace(v)) {
    // Zdegenerowany start (teoretycznie możliwy przy pełnej ortogonalności) —
    // deterministyczny plan awaryjny: wektor jednostkowy na pierwszej wolnej osi.
    v.fill(0);
    v[found.length % dim] = 1;
    orthogonalize(v, found);
    if (!normalizeInPlace(v)) return null;
  }

  const next = new Float64Array(dim);
  for (let iter = 0; iter < MAX_ITER; iter++) {
    next.fill(0);
    for (const v0 of centered) {
      const d = dot(v0, v);
      if (d === 0) continue;
      for (let i = 0; i < dim; i++) next[i] += d * v0[i];
    }
    for (let i = 0; i < dim; i++) next[i] /= centered.length;

    orthogonalize(next, found);
    if (!normalizeInPlace(next)) return null; // składowa zdegenerowana (zerowa wariancja)

    let delta = 0;
    for (let i = 0; i < dim; i++) {
      const d = Math.abs(next[i] - v[i]);
      if (d > delta) delta = d;
    }
    v.set(next);
    if (delta < EPS_CONVERGENCE) break;
  }
  return v;
}

// Buduje bazę rzutowania: { mean, components }. NIE liczy viewportu — ten wymaga
// współrzędnych, więc powstaje krok później (buildProjection).
export function buildBasis(vectors) {
  if (!Array.isArray(vectors) || vectors.length < MIN_CHUNKS_FOR_PCA) {
    const e = new Error(
      `PCA potrzebuje co najmniej ${MIN_CHUNKS_FOR_PCA} fragmentów z wektorem (jest ${
        Array.isArray(vectors) ? vectors.length : 0
      }).`
    );
    e.code = 'invalid_input';
    throw e;
  }
  const dim = vectors[0].length;
  for (const v of vectors) {
    if (v.length !== dim) {
      const e = new Error('Wektory mają różny wymiar — kolekcja jest niespójna.');
      e.code = 'dim_mismatch';
      throw e;
    }
  }

  const mean = computeMean(vectors);

  // Wersja wycentrowana liczona RAZ i trzymana w pamięci: przy 1306×1024 to ~10 MB,
  // a oszczędza odejmowanie średniej w każdej iteracji każdej składowej.
  const centered = vectors.map((v) => {
    const c = new Float64Array(dim);
    for (let i = 0; i < dim; i++) c[i] = v[i] - mean[i];
    return c;
  });

  const rand = mulberry32(SEED);
  const components = [];
  for (let k = 0; k < COMPONENT_COUNT; k++) {
    const c = powerIteration(centered, dim, components, rand);
    if (!c) {
      // Zdegenerowany kierunek (np. 3 identyczne wektory): składowa zerowa. Wtedy
      // odpowiednia współrzędna wyjdzie 0 dla wszystkich — mapa nadal działa.
      components.push(new Float64Array(dim));
      continue;
    }
    applySignConvention(c);
    components.push(c);
  }

  return { mean, components };
}

// Rzut pojedynczego wektora istniejącą bazą (12.2). Ta sama funkcja obsługuje
// budowę mapy i dokładanie nowych fragmentów — dzięki temu nowy punkt trafia
// dokładnie tam, gdzie trafiłby przy pełnym przeliczeniu.
export function projectVector(vector, mean, components) {
  const dim = vector.length;
  const out = [];
  for (const c of components) {
    let s = 0;
    for (let i = 0; i < dim; i++) s += (vector[i] - mean[i]) * c[i];
    out.push(s);
  }
  return out;
}

// Percentyl z interpolacją liniową na posortowanej rosnąco tablicy.
export function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = p * (sortedAsc.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

// viewport = 5. i 95. percentyl każdej osi (12.1). ŚWIADOMIE nie min/max: pojedynczy
// odległy fragment nie ma prawa zdecydować o skali całego obrazu. Punkty poza
// zakresem przycina się do brzegu przy RYSOWANIU, nie tutaj.
export function computeViewport(coords) {
  const osie = [[], [], []];
  for (const c of coords) {
    osie[0].push(c[0]);
    osie[1].push(c[1]);
    osie[2].push(c[2]);
  }
  const out = {};
  const nazwy = ['x', 'y', 'z'];
  for (let a = 0; a < 3; a++) {
    const sorted = osie[a].slice().sort((p, q) => p - q);
    let min = percentile(sorted, 0.05);
    let max = percentile(sorted, 0.95);
    // Zakres zdegenerowany (wszystkie punkty w jednym miejscu na tej osi) rozsuwamy,
    // żeby UI nie dzieliło przez zero przy przeliczaniu na piksele.
    if (!(max > min)) {
      const srodek = Number.isFinite(min) ? min : 0;
      min = srodek - 0.5;
      max = srodek + 0.5;
    }
    out[nazwy[a] + 'Min'] = min;
    out[nazwy[a] + 'Max'] = max;
  }
  return out;
}

// Pełna baza rzutowania wg struktury z 12.1 + współrzędne wszystkich fragmentów.
// vectors i ids muszą być w TEJ SAMEJ, ustalonej kolejności (patrz reguła 4).
export function buildProjection(vectors, { embedModel, builtAt } = {}) {
  const { mean, components } = buildBasis(vectors);
  const coords = vectors.map((v) => projectVector(v, mean, components));
  const viewport = computeViewport(coords);

  return {
    projection: {
      method: 'pca',
      mean: Array.from(mean),
      components: components.map((c) => Array.from(c)),
      viewport,
      embedModel: embedModel || null,
      chunkCount: vectors.length,
      builtAt: builtAt || new Date().toISOString(),
    },
    coords,
  };
}

// Sąsiedztwo w przestrzeni 2D (12.6) — NA coord_x/y, nie w pełnym wymiarze.
// Powód z 12.6: liczy się w milisekundach i łączy punkty, które użytkownik WIDZI
// jako bliskie. Prawdziwe sąsiedztwo w pełnym wymiarze pokazuje wyszukiwanie.
//
// `dist2d` celowo nie nazywa się `score` — to odległość w rzucie, a nie podobieństwo
// cosinusowe z sekcji 11. Zestawianie tych dwóch wielkości jest błędem.
//
// points: [{ id, x, y }] → Map(id → [{ id, dist2d }])
export function computeNeighbors2d(points, k) {
  const out = new Map();
  const n = points.length;
  const limit = Math.max(0, k | 0);
  if (limit === 0) {
    for (const p of points) out.set(p.id, []);
    return out;
  }

  for (let i = 0; i < n; i++) {
    const a = points[i];
    // Lista najbliższych trzymana jako mała tablica sortowana wstawianiem —
    // przy k=3 to szybsze niż sortowanie całości (n log n) dla każdego punktu.
    const best = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const b = points[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (best.length < limit || d2 < best[best.length - 1].d2) {
        let pos = best.length;
        while (pos > 0 && best[pos - 1].d2 > d2) pos--;
        best.splice(pos, 0, { id: b.id, d2 });
        if (best.length > limit) best.pop();
      }
    }
    out.set(
      a.id,
      best.map((b) => ({ id: b.id, dist2d: Math.sqrt(b.d2) }))
    );
  }
  return out;
}

// Sąsiedzi WYŁĄCZNIE dla nowych punktów, względem całej mapy (12.6, wariant przyrostowy:
// "porównanie jednego punktu z istniejącymi, ułamek milisekundy").
//
// DLACZEGO OSOBNA FUNKCJA, a nie computeNeighbors2d na sumie zbiorów: tamta buduje listy
// dla WSZYSTKICH punktów, czyli przy 3091 punktach ~9,5 mln porównań na partię, z których
// 99% idzie do kosza — zapisujemy tylko wiersze nowych fragmentów. Tu koszt to
// |nowe| × |wszystkie|: dla partii 32 fragmentów ~100 tys. porównań. Ta różnica decyduje
// o tym, czy rzutowanie po każdej partii (12.4) jest w ogóle wykonalne.
//
// NIESYMETRYCZNOŚĆ JEST ZAMIERZONA: listy istniejących punktów NIE są aktualizowane.
// Punkt A może mieć bliższego sąsiada i nie wiedzieć o tym do pełnego przeliczenia.
// Dlatego w UI to "połączenia znaczeniowe", nigdy "k najbliższych sąsiadów".
export function neighborsForNewPoints(nowe, istniejace, k) {
  const out = new Map();
  const limit = Math.max(0, k | 0);
  if (limit === 0) {
    for (const p of nowe) out.set(p.id, []);
    return out;
  }

  // Nowe punkty widzą też siebie wzajemnie. Bez tego partia 32 fragmentów z jednego
  // rozdziału szukałaby sąsiadów wyłącznie w starej części mapy i pierwsze połączenia
  // wewnątrz nowego dokumentu pojawiłyby się dopiero po pełnym przeliczeniu.
  const cel = istniejace.concat(nowe);

  for (const a of nowe) {
    const best = [];
    for (const b of cel) {
      if (b.id === a.id) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (best.length < limit || d2 < best[best.length - 1].d2) {
        let pos = best.length;
        while (pos > 0 && best[pos - 1].d2 > d2) pos--;
        best.splice(pos, 0, { id: b.id, d2 });
        if (best.length > limit) best.pop();
      }
    }
    out.set(
      a.id,
      best.map((b) => ({ id: b.id, dist2d: Math.sqrt(b.d2) }))
    );
  }
  return out;
}

// Sąsiedzi dla JEDNEGO nowego punktu — cienka nakładka na neighborsForNewPoints,
// żeby nie istniały dwie implementacje tej samej reguły.
export function neighborsForPoint(point, existing, k) {
  return neighborsForNewPoints([point], existing, k).get(point.id) || [];
}
