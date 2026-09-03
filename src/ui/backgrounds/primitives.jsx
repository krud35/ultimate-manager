/**
 * Wspólne cegiełki proceduralnych teł.
 *
 * Wszystkie sceny to statyczny SVG generowany w kodzie (zero plików, zero fetchy).
 * Kształty liczone są raz, przy imporcie modułu — komponenty tylko je renderują.
 *
 * Konwencja id-ków: gradienty współdzielone mają prefiks `ufa-`, a lokalne dla
 * sceny — prefiks skrótu sceny (np. `lr-`), żeby dwie warstwy w trakcie
 * przenikania nie podmieniły sobie definicji.
 */
import { INK, mulberry32, VIEW_H, VIEW_W } from './tokens.js'

function SharedDefs() {
  return (
    <defs>
      <radialGradient id="ufa-vignette" cx="50%" cy="44%" r="82%">
        <stop offset="40%" stopColor="#000000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.72" />
      </radialGradient>

      <radialGradient id="ufa-glow-warm">
        <stop offset="0%" stopColor={INK.gold} stopOpacity="0.55" />
        <stop offset="45%" stopColor={INK.gold} stopOpacity="0.16" />
        <stop offset="100%" stopColor={INK.gold} stopOpacity="0" />
      </radialGradient>

      <radialGradient id="ufa-glow-cool">
        <stop offset="0%" stopColor={INK.accent} stopOpacity="0.5" />
        <stop offset="45%" stopColor={INK.accent} stopOpacity="0.14" />
        <stop offset="100%" stopColor={INK.accent} stopOpacity="0" />
      </radialGradient>

      <radialGradient id="ufa-glow-pale">
        <stop offset="0%" stopColor="#dce9d3" stopOpacity="0.42" />
        <stop offset="45%" stopColor="#dce9d3" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#dce9d3" stopOpacity="0" />
      </radialGradient>
    </defs>
  )
}

/**
 * Ramka sceny: tło bazowe, treść, ziarno i winieta.
 * `preserveAspectRatio="slice"` — scena zawsze wypełnia ekran, kadr przycina boki.
 */
export function SceneFrame({ children, base = INK.base }) {
  return (
    <svg
      className="ufa-bg-svg"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <SharedDefs />
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={base} />
      {children}
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#ufa-vignette)" />
    </svg>
  )
}

/** Miękka poświata (lampa, okno, reflektor) bez filtrów — sam gradient. */
export function Glow({ x, y, rx, ry = rx, tone = 'warm', opacity = 1 }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={`url(#ufa-glow-${tone})`} opacity={opacity} />
}

/**
 * Boisko w perspektywie: trapez murawy + linie stref końcowych i autów.
 * `top`/`bottom` to y, `topInset`/`bottomInset` to zwężenie w poziomie.
 */
export function PerspectiveField({
  top,
  bottom,
  topInset,
  bottomInset,
  fill = INK.mid,
  line = INK.rim,
  lineOpacity = 0.5,
  rows = 5,
  cx = VIEW_W / 2,
}) {
  const lerp = (a, b, t) => a + (b - a) * t
  const edges = (t) => {
    const inset = lerp(bottomInset, topInset, t)
    return [cx - inset, cx + inset, lerp(bottom, top, t)]
  }
  const [bl, br, by] = edges(0)
  const [tl, tr, ty] = edges(1)
  const cross = Array.from({ length: rows }, (_, i) => {
    const t = (i + 1) / (rows + 1)
    // Skrót perspektywiczny: linie bliżej horyzontu zagęszczają się.
    const eased = t * t
    const [l, r, y] = edges(eased)
    return { k: i, l, r, y, o: lineOpacity * (0.35 + 0.65 * (1 - eased)) }
  })
  return (
    <g>
      <polygon points={`${bl},${by} ${br},${by} ${tr},${ty} ${tl},${ty}`} fill={fill} />
      <polygon
        points={`${bl},${by} ${br},${by} ${tr},${ty} ${tl},${ty}`}
        fill="none"
        stroke={line}
        strokeWidth="3"
        opacity={lineOpacity * 0.8}
      />
      {cross.map((c) => (
        <line
          key={c.k}
          x1={c.l}
          y1={c.y}
          x2={c.r}
          y2={c.y}
          stroke={line}
          strokeWidth="2.5"
          opacity={c.o}
        />
      ))}
    </g>
  )
}

/** Trybuny: rzędy proceduralnych „siedzisk” jako plamki. */
export function Stands({ x, y, w, h, rows = 7, seed = 7, tone = INK.high, opacity = 0.55, flip = false }) {
  const rand = mulberry32(seed)
  const items = []
  for (let r = 0; r < rows; r += 1) {
    const t = r / Math.max(1, rows - 1)
    const ry = y + h * t
    const step = 26 + t * 10
    const inset = flip ? w * t * 0.12 : 0
    for (let sx = x + inset; sx < x + w - inset; sx += step) {
      if (rand() < 0.12) continue
      items.push({
        k: `${r}-${sx.toFixed(0)}`,
        x: sx + rand() * 4,
        y: ry,
        w: step * 0.62,
        h: 7 + t * 4,
        o: opacity * (0.45 + rand() * 0.55) * (0.5 + 0.5 * (1 - t)),
      })
    }
  }
  return (
    <g>
      {items.map((s) => (
        <rect key={s.k} x={s.x} y={s.y} width={s.w} height={s.h} rx="2" fill={tone} opacity={s.o} />
      ))}
    </g>
  )
}

/** Poziome pasy (podłoga, ściana, drewno) — tanie budowanie faktury. */
export function Bands({ x, y, w, h, count, tone = INK.panel, opacity = 0.5, seed = 3 }) {
  const rand = mulberry32(seed)
  const step = h / count
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <rect
          key={i}
          x={x}
          y={y + i * step}
          width={w}
          height={step * (0.5 + rand() * 0.35)}
          fill={tone}
          opacity={opacity * (0.4 + rand() * 0.6)}
        />
      ))}
    </g>
  )
}

/** Sylwetka pucharu (zarząd, gablota, ekran pucharowy). */
export function Trophy({ x, y, s = 1, tone = INK.gold, opacity = 0.5 }) {
  const p = (v) => v * s
  return (
    <g opacity={opacity} transform={`translate(${x} ${y})`}>
      <path
        d={`M ${-p(26)} ${-p(74)} h ${p(52)} v ${p(22)} a ${p(26)} ${p(30)} 0 0 1 ${-p(52)} 0 z`}
        fill={tone}
      />
      <path
        d={`M ${-p(26)} ${-p(68)} a ${p(16)} ${p(16)} 0 1 0 ${-p(16)} ${p(24)}`}
        fill="none"
        stroke={tone}
        strokeWidth={p(5)}
      />
      <path
        d={`M ${p(26)} ${-p(68)} a ${p(16)} ${p(16)} 0 1 1 ${p(16)} ${p(24)}`}
        fill="none"
        stroke={tone}
        strokeWidth={p(5)}
      />
      <rect x={-p(6)} y={-p(24)} width={p(12)} height={p(16)} fill={tone} />
      <rect x={-p(20)} y={-p(9)} width={p(40)} height={p(9)} rx={p(2)} fill={tone} />
    </g>
  )
}

/** Sylwetka zawodnika — na tyle prosta, żeby czytała się w rozmyciu. */
export function Figure({ x, y, s = 1, tone = INK.void, opacity = 0.6, lean = 0 }) {
  const p = (v) => v * s
  return (
    <g opacity={opacity} transform={`translate(${x} ${y}) rotate(${lean})`}>
      <circle cx="0" cy={-p(64)} r={p(10)} fill={tone} />
      <path
        d={`M ${-p(13)} ${-p(50)} q ${p(13)} ${-p(8)} ${p(26)} 0 l ${p(5)} ${p(30)} l ${-p(8)} ${p(4)} l ${-p(4)} ${p(34)} h ${-p(11)} l ${-p(3)} ${-p(24)} l ${-p(4)} ${p(24)} h ${-p(11)} l ${-p(3)} ${-p(38)} z`}
        fill={tone}
      />
    </g>
  )
}

/** Dysk w rzucie perspektywicznym. */
export function Disc({ x, y, rx = 26, tone = INK.accent, opacity = 0.7 }) {
  return (
    <g opacity={opacity}>
      <ellipse cx={x} cy={y} rx={rx} ry={rx * 0.34} fill={tone} />
      <ellipse cx={x} cy={y - rx * 0.08} rx={rx * 0.62} ry={rx * 0.2} fill={INK.void} opacity="0.45" />
    </g>
  )
}
