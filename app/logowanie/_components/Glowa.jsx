import { KRAWEDZIE, KROPKI, TROJKATY, WEZLY } from "../_lib/siatka.js";
import styles from "../logowanie.module.css";

// GLOWA AGENTA — prawa polowa to render helmu, lewa to siatka punktow.
// Na tym etapie scena jest STATYCZNA: pokazuje klatke koncowa, czyli to,
// co prototyp ustawia po zakonczeniu przebiegu. Animacje dokladamy w etapie B.
//
// ZERO IDENTYFIKATOROW. Prototyp trzyma sie #mesh, #scatter, #weld, #helmGrp
// i #flare, bo tak go czyta jego wlasny JavaScript. Identyfikator jest globalny
// na cala strone, wiec dwie zamontowane instancje deptalyby sobie po nogach —
// stylowanie idzie przez klasy modulu, a dostep z JS w etapie B pojdzie przez
// referencje.

// Prototyp rysuje rozproszenie z opacity oscylujacym miedzy 0,32 a 0,92
// (linia 375). Bez animacji biore wartosc srednia, zeby waga plamy sie zgadzala.
const ROZPROSZENIE_SPOCZYNKOWE = 0.62;

export function Glowa() {
  return (
    <div className={styles.glowa}>
      <div className={styles.glowaWnetrze}>
        <svg
          className={styles.glowaSvg}
          viewBox="0 0 624 649"
          preserveAspectRatio="xMidYMid meet"
          aria-label="Prawa polowa helmu robota, lewa z punktow i polaczen"
        >
          {/* preserveAspectRatio="none" jest bezpieczne mimo nazwy: proporcja
              zrodla 367/972 = 0,3776 i docelowa 230,84/611,39 = 0,3776 sa
              identyczne, wiec nic sie nie rozciaga. Tak samo wizjer:
              341/372 = 0,9167 wobec 149,93/163,56 = 0,9166. */}
          <g>
            <image
              href="/logowanie/helm.webp"
              x="324.26"
              y="-1"
              width="230.84"
              height="611.39"
              preserveAspectRatio="none"
            />
            <image
              href="/logowanie/wizjer.webp"
              x="324.00"
              y="294.62"
              width="149.93"
              height="163.56"
              preserveAspectRatio="none"
            />
          </g>

          {/* Rozblysk wizjera. W spoczynku wygaszony — zapala sie dopiero przy
              logowaniu (etap B). Dziewiec elips o malejacych promieniach daje
              miekkie halo bez filtra rozmycia. */}
          <g opacity="0" style={{ mixBlendMode: "screen" }}>
            {[86.0, 76.4, 66.9, 57.3, 47.8, 38.2, 28.7, 19.1, 9.6].map((rx, i) => (
              <ellipse
                key={rx}
                cx="373"
                cy="366"
                rx={rx}
                ry={[30.0, 26.7, 23.3, 20.0, 16.7, 13.3, 10.0, 6.7, 3.3][i]}
                fill="var(--visor)"
                opacity="0.100"
              />
            ))}
          </g>

          <g className={`${styles.rozproszenie} ${styles.poswiata}`} opacity={ROZPROSZENIE_SPOCZYNKOWE}>
            {KROPKI.map((d, i) => (
              <circle
                key={`k${i}`}
                cx={d.x}
                cy={d.y}
                r={d.r * 0.8}
                className={d.m ? styles.magenta : undefined}
              />
            ))}
            {TROJKATY.map((t, i) => (
              <polygon
                key={`t${i}`}
                points={t.pts.map((q) => q.join(",")).join(" ")}
                className={t.m ? styles.magenta : undefined}
              />
            ))}
          </g>

          <g className={`${styles.siatka} ${styles.poswiata}`}>
            {KRAWEDZIE.map(([a, b, m], i) => (
              <line
                key={`e${i}`}
                x1={WEZLY[a][0]}
                y1={WEZLY[a][1]}
                x2={WEZLY[b][0]}
                y2={WEZLY[b][1]}
                className={m ? styles.magenta : undefined}
              />
            ))}
            {WEZLY.map(([x, y, m], i) => (
              <circle key={`w${i}`} cx={x} cy={y} className={m ? styles.magenta : undefined} />
            ))}
          </g>

          {/* Okregi spawow sa przejsciowe — powstaja i znikaja w trakcie
              animacji, wiec w spoczynku grupa jest pusta. Zostaje, bo etap B
              bedzie ja wypelnial przez referencje. */}
          <g className={`${styles.spawy} ${styles.poswiata}`} />
        </svg>
      </div>
    </div>
  );
}
