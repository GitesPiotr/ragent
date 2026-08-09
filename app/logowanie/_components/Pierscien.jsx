import styles from "../logowanie.module.css";

// PIERSCIEN PASKOW wokol formularza. Wypelnia sie w trakcie logowania.
//
// Geometria to czysta matematyka — zero DOM-u, zero losowosci — wiec kreski
// powstaja w JSX i przechodza przez prerendering bez zadnego efektu. Prototyp
// buduje je przez createElementNS przy wejsciu do modulu (linie 671-679); tutaj
// nie ma po co, a przy podwojnym montowaniu Strict Mode tamten zapis dalby
// 96 kresek zamiast 48.
//
// R1 wyznacza WOLNE POLE w srodku, w ktorym siedzi formularz — stad promien
// 164 przy plotnie 400. Zmiana R1 wymaga sprawdzenia, czy pola nadal sie
// miesza (szerokosc formularza jest liczona w cqi od szerokosci pierscienia).
const LICZBA = 48;
const R1 = 164;
const R2 = 192;
const SRODEK = 200;

// Start na godzinie 12, dalej zgodnie z ruchem wskazowek.
const KRESKI = Array.from({ length: LICZBA }, (_, i) => {
  const kat = ((-90 + (i * 360) / LICZBA) * Math.PI) / 180;
  return {
    x1: (SRODEK + Math.cos(kat) * R1).toFixed(2),
    y1: (SRODEK + Math.sin(kat) * R1).toFixed(2),
    x2: (SRODEK + Math.cos(kat) * R2).toFixed(2),
    y2: (SRODEK + Math.sin(kat) * R2).toFixed(2),
  };
});

// postep 0..1 — ile paskow swieci. Etap A podaje 0, etap B animuje.
export function Pierscien({ postep = 0, children }) {
  return (
    <div className={styles.pierscien}>
      <svg className={styles.pierscienSvg} viewBox="0 0 400 400" aria-hidden="true">
        <g>
          {KRESKI.map((k, i) => (
            <line
              key={i}
              x1={k.x1}
              y1={k.y1}
              x2={k.x2}
              y2={k.y2}
              className={`${styles.kreska} ${i / LICZBA < postep ? styles.kreskaWlaczona : ""}`}
            />
          ))}
        </g>
      </svg>
      {children}
    </div>
  );
}
