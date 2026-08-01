// Krawędzie mapy — czyste przekształcenia danych dla widoku połączeń (12.6).
//
// DLACZEGO POZA lib/rag/: sekcja 3 mówi, że rdzeń nie zna Reacta ani window, a Sesja I1
// kopiuje `lib/rag/` do AIDEAS. Pomocniki widoku nie mają tam czego szukać i nie powinny
// jechać razem z rdzeniem. Tutaj jest czysty JS bez window — importuje to komponent
// kliencki mapy, a `npm test` obejmuje ten katalog bez żadnej zmiany konfiguracji.
//
// NAZEWNICTWO (12.6, wymóg, nie kosmetyka): to są POŁĄCZENIA ZNACZENIOWE, nie
// "k najbliższych sąsiadów". Sąsiedztwo liczone przyrostowo jest niesymetryczne —
// nowy punkt znajduje swoich najbliższych, ale listy punktów istniejących nie są
// aktualizowane do pełnego przeliczenia. Interfejs nie ma prawa obiecywać czegoś,
// czego dane nie gwarantują.
//
// `dist2d` to odległość w rzucie 2D. NIE jest to `score` z sekcji 11 (podobieństwo
// cosinusowe w pełnym wymiarze) i nie wolno pokazywać jej jako miary trafności.

const HEX = /^#?([0-9a-f]{6})$/i;

function doRgb(hex) {
  const m = HEX.exec(String(hex || '').trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function doHex(rgb) {
  const s = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'));
  return '#' + s.join('');
}

// Kolor zastępczy dla fragmentu bez znanego dokumentu. Zinc-500 z rampy AIDEAS —
// czytelny na jasnym tle mapy (kontrast 4,0:1 wobec #fafafa). Poprzednia wartość
// #8a93a6 była dobrana pod tło #0f1115 i na białym rozpływała się w tle.
// Ta sama wartość siedzi jako PALETA.fallback w MapaFragmentow.jsx i GrafWiedzy.jsx
// — muszą się zgadzać, inaczej ten sam fragment ma dwa różne szare.
const ZASTEPCZY = '#71717a';

// Kolor krawędzi = średnia z obu końców (12.6). Krawędź między fragmentami tego samego
// dokumentu wychodzi w jego kolorze; krawędź międzydokumentowa daje kolor pośredni,
// co samo w sobie niesie informację: takich linii jest na mapie widocznie mniej.
export function sredniKolor(a, b) {
  const ra = doRgb(a);
  const rb = doRgb(b);
  if (!ra && !rb) return ZASTEPCZY;
  if (!ra) return doHex(rb);
  if (!rb) return doHex(ra);
  return doHex([(ra[0] + rb[0]) / 2, (ra[1] + rb[1]) / 2, (ra[2] + rb[2]) / 2]);
}

// Buduje listę krawędzi z zapisanego sąsiedztwa 2D.
//
// DEDUPLIKACJA (12.6): A→B i B→A to JEDNA linia. Bez tego przy 3091 fragmentach
// i k=3 rysowalibyśmy ~9000 krawędzi zamiast ~7000, a każda wspólna para byłaby
// kreślona dwa razy — grubsza i ciemniejsza od pozostałych, czyli wizualnie kłamiąca.
//
// chunks: [{ id, documentId, neighbors: [{ id, dist2d }] }]
// colorByDocument: Map(documentId → '#rrggbb')
// → [{ a, b, color, dist2d }]  (a, b to identyfikatory fragmentów)
export function buildEdges(chunks, colorByDocument) {
  const kolorFragmentu = new Map();
  for (const c of chunks) kolorFragmentu.set(c.id, colorByDocument.get(c.documentId) || ZASTEPCZY);

  const widziane = new Set();
  const out = [];

  for (const c of chunks) {
    const sasiedzi = c.neighbors;
    if (!Array.isArray(sasiedzi)) continue;
    for (const s of sasiedzi) {
      if (!s || !s.id || s.id === c.id) continue;
      // Sąsiad wskazujący na nieistniejący fragment (np. usunięty dokument) —
      // pomijamy zamiast rysować linię donikąd.
      if (!kolorFragmentu.has(s.id)) continue;

      const klucz = c.id < s.id ? c.id + '|' + s.id : s.id + '|' + c.id;
      if (widziane.has(klucz)) continue;
      widziane.add(klucz);

      out.push({
        a: c.id,
        b: s.id,
        color: sredniKolor(kolorFragmentu.get(c.id), kolorFragmentu.get(s.id)),
        dist2d: typeof s.dist2d === 'number' ? s.dist2d : null,
      });
    }
  }
  return out;
}

// Grupowanie po kolorze — to jest cały sekret wydajności trybu połączeń.
// Prototyp rysuje każdą krawędź osobno (beginPath → moveTo → lineTo → stroke),
// co przy 7000 krawędzi daje 7000 wywołań rysowania NA KLATKĘ i zatyka canvas.
// Po zgrupowaniu jest jedna ścieżka na kolor: uśrednienie 9 kolorów dokumentów
// daje najwyżej 45 różnych wartości, czyli kilkadziesiąt wywołań stroke() zamiast 7000.
export function grupujPoKolorze(edges) {
  const grupy = new Map();
  for (const e of edges) {
    let lista = grupy.get(e.color);
    if (!lista) {
      lista = [];
      grupy.set(e.color, lista);
    }
    lista.push(e);
  }
  return grupy;
}

// Mapa fragment → jego krawędzie. Używane przy najechaniu: podświetlamy połączenia
// jednego punktu bez przeglądania całej listy przy każdym ruchu myszy.
export function indeksKrawedzi(edges) {
  const idx = new Map();
  const dodaj = (id, e) => {
    let l = idx.get(id);
    if (!l) {
      l = [];
      idx.set(id, l);
    }
    l.push(e);
  };
  for (const e of edges) {
    dodaj(e.a, e);
    dodaj(e.b, e);
  }
  return idx;
}
