// Widok 3D (12.8) — czysta geometria: obrót, rzut perspektywiczny, sortowanie po głębi
// i sąsiedztwo w trzech wymiarach. Bez window, bez canvasa — sam rachunek.
//
// REGUŁA Z DoD, KTÓREJ PILNUJE TEN PLIK: sąsiedzi 3D liczeni są W PRZEGLĄDARCE
// i trzymani w pamięci. Kolumna rag_chunks.neighbors trzyma WYŁĄCZNIE sąsiedztwo 2D.
// Przełączenie widoku nie ma prawa wywołać zapisu 3091 wierszy — dlatego ta funkcja
// nie zna bazy i nie ma jak niczego zapisać.
//
// UCZCIWOŚĆ (12.9): obrót kamery jest tu dozwolony i wprost przewidziany w 12.8.
// Punkty NIE zmieniają położenia względem siebie — zmienia się punkt patrzenia.
// To transformacja widoku, nie fałszywa animacja danych.

// Obrót wokół osi Y (yaw), potem X (pitch). Kolejność ustalona i stała, żeby ten sam
// kąt zawsze dawał ten sam obraz.
export function obrocPunkt(x, y, z, yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;

  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const y2 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;

  return [x1, y2, z2];
}

// Rzut perspektywiczny. Kamera patrzy z odległości `dystans` wzdłuż osi Z.
// Zwraca współczynnik skali: punkty bliżej kamery są większe (i rysowane później).
// Bez perspektywy chmura wygląda płasko — 12.8 wymaga tego wprost.
export function wspolczynnikPerspektywy(z, dystans) {
  const d = dystans - z;
  // Punkt za kamerą albo dokładnie w jej płaszczyźnie — przycinamy zamiast dzielić
  // przez zero albo odbijać obraz.
  if (d <= 0.05) return null;
  return dystans / d;
}

// Pełne przygotowanie klatki 3D: obrót + perspektywa + SORTOWANIE PO GŁĘBI.
// Sortowanie far→near jest obowiązkowe (12.8): bez niego punkty z tyłu zamalowałyby
// te z przodu w losowej kolejności i głębia zniknęłaby.
//
// punkty: [{ id, x, y, z, ... }] w jednostkach PCA
// → [{ ...punkt, px, py, skalaGlebi, glebia }] posortowane od najdalszego
export function przygotujKlatke3d(punkty, { yaw, pitch, dystans = 3, rozciagniecieZ = 1 }) {
  const out = [];
  for (const p of punkty) {
    const [rx, ry, rz] = obrocPunkt(p.x, p.y, p.z * rozciagniecieZ, yaw, pitch);
    const k = wspolczynnikPerspektywy(rz, dystans);
    if (k === null) continue;
    out.push({ ...p, px: rx * k, py: ry * k, skalaGlebi: k, glebia: rz });
  }
  out.sort((a, b) => a.glebia - b.glebia);
  return out;
}

// Kubełkowanie po głębi. Przy 3091 punktach rysowanie każdego osobno (własna alfa
// i promień) to 3091 wypełnień na klatkę. Kubełki pozwalają zachować efekt głębi —
// dalsze mniejsze i bledsze — przy kilkudziesięciu wywołaniach rysowania.
// Zwraca indeks kubełka 0..(liczba-1), gdzie 0 = najdalej.
export function kubelekGlebi(skalaGlebi, minSkala, maxSkala, liczba) {
  if (!(maxSkala > minSkala)) return 0;
  const t = (skalaGlebi - minSkala) / (maxSkala - minSkala);
  const i = Math.floor(t * liczba);
  return Math.max(0, Math.min(liczba - 1, i));
}

// Sąsiedztwo w PEŁNYCH trzech wymiarach (12.8: "w trzech wymiarach najbliżsi bywają
// inni niż w dwóch"). Ta sama metoda co computeNeighbors2d w rdzeniu, o jedną oś dalej.
// Przy 3091 punktach i k=3 to ~9,5 mln porównań — rzędu 100 ms JEDNORAZOWO przy
// przełączeniu widoku. Na klatkę byłoby to nie do przyjęcia i 12.6 zabrania tego wprost.
//
// punkty: [{ id, x, y, z }] → Map(id → [{ id, dist3d }])
export function computeNeighbors3d(punkty, k) {
  const out = new Map();
  const n = punkty.length;
  const limit = Math.max(0, k | 0);
  if (limit === 0) {
    for (const p of punkty) out.set(p.id, []);
    return out;
  }

  for (let i = 0; i < n; i++) {
    const a = punkty[i];
    const best = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const b = punkty[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (best.length < limit || d2 < best[best.length - 1].d2) {
        let pos = best.length;
        while (pos > 0 && best[pos - 1].d2 > d2) pos--;
        best.splice(pos, 0, { id: b.id, d2 });
        if (best.length > limit) best.pop();
      }
    }
    out.set(
      a.id,
      best.map((b) => ({ id: b.id, dist3d: Math.sqrt(b.d2) }))
    );
  }
  return out;
}

// Krawędzie 3D z policzonego w pamięci sąsiedztwa — ta sama deduplikacja co w 2D.
// Osobna funkcja, bo klucz odległości nazywa się inaczej (dist3d) i nie wolno tych
// dwóch wielkości mieszać.
export function krawedzie3d(mapaSasiadow, kolorFragmentu, mieszaj) {
  const widziane = new Set();
  const out = [];
  for (const [id, sasiedzi] of mapaSasiadow) {
    for (const s of sasiedzi) {
      const klucz = id < s.id ? id + '|' + s.id : s.id + '|' + id;
      if (widziane.has(klucz)) continue;
      widziane.add(klucz);
      out.push({
        a: id,
        b: s.id,
        color: mieszaj(kolorFragmentu.get(id), kolorFragmentu.get(s.id)),
        dist3d: s.dist3d,
      });
    }
  }
  return out;
}
