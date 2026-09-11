/**
 * Sceny "pod dachem": biuro trenera, szatnia, tablica, sala zarządu itd.
 * Każda scena to czysty SVG — bez stanu, bez animacji, bez assetów.
 */
import { Bands, Disc, Figure, Glow, SceneFrame, Trophy } from './primitives.jsx'
import { INK, VIEW_H, VIEW_W, mulberry32 } from './tokens.js'

/* --- wspólne dla wnętrz ------------------------------------------------- */

function Wall({ tone = INK.deep, seams = 0, seed = 11 }) {
  const rand = mulberry32(seed)
  return (
    <g>
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={tone} />
      {Array.from({ length: seams }, (_, i) => {
        const x = (VIEW_W / (seams + 1)) * (i + 1) + (rand() - 0.5) * 40
        return (
          <line key={i} x1={x} y1="0" x2={x} y2={VIEW_H} stroke={INK.mid} strokeWidth="2" opacity="0.5" />
        )
      })}
    </g>
  )
}

function Floor({ y, tone = INK.void, opacity = 1 }) {
  return <rect x="0" y={y} width={VIEW_W} height={VIEW_H - y} fill={tone} opacity={opacity} />
}

/** Stożek światła z lampy / okna. */
function LightCone({ x, y, spread, bottom, tone = INK.gold, opacity = 0.1 }) {
  return (
    <polygon
      points={`${x - 14},${y} ${x + 14},${y} ${x + spread},${bottom} ${x - spread},${bottom}`}
      fill={tone}
      opacity={opacity}
    />
  )
}

/* --- 1. coach-office ---------------------------------------------------- */

const CO_PAPERS = (() => {
  const rand = mulberry32(41)
  return Array.from({ length: 7 }, (_, i) => ({
    k: i,
    x: 470 + rand() * 150,
    y: 676 + rand() * 14,
    w: 90 + rand() * 60,
    r: (rand() - 0.5) * 14,
  }))
})()

export function CoachOffice() {
  return (
    <SceneFrame>
      <Wall seams={3} seed={5} />
      {/* okno z chłodnym, porannym światłem */}
      <g>
        <rect x="86" y="96" width="352" height="392" fill={INK.panel} />
        <rect x="98" y="108" width="328" height="368" fill="#16241a" />
        <Glow x={262} y={292} rx={300} ry={330} tone="cool" opacity={0.5} />
        <line x1="262" y1="108" x2="262" y2="476" stroke={INK.deep} strokeWidth="10" />
        <line x1="98" y1="292" x2="426" y2="292" stroke={INK.deep} strokeWidth="10" />
        <rect x="78" y="86" width="368" height="412" fill="none" stroke={INK.edge} strokeWidth="6" />
      </g>
      {/* smuga światła padająca na podłogę */}
      <polygon points="98,488 426,488 720,900 -40,900" fill={INK.accent} opacity="0.05" />

      {/* tablica taktyczna na ścianie */}
      <g>
        <rect x="1012" y="128" width="470" height="300" rx="6" fill={INK.panel} />
        <rect x="1012" y="128" width="470" height="300" rx="6" fill="none" stroke={INK.edge} strokeWidth="5" />
        <rect x="1044" y="160" width="406" height="236" fill="none" stroke={INK.rim} strokeWidth="2" opacity="0.5" />
        <line x1="1044" y1="216" x2="1450" y2="216" stroke={INK.rim} strokeWidth="2" opacity="0.35" />
        <line x1="1044" y1="340" x2="1450" y2="340" stroke={INK.rim} strokeWidth="2" opacity="0.35" />
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={1090 + i * 92} cy={268 + (i % 2) * 44} r="11" fill={INK.accent} opacity="0.65" />
        ))}
        {[0, 1, 2].map((i) => (
          <circle key={`d${i}`} cx={1140 + i * 92} cy={318 - (i % 2) * 40} r="11" fill={INK.gold} opacity="0.4" />
        ))}
        <path
          d="M 1096 300 q 60 44 128 -12"
          fill="none"
          stroke={INK.accent}
          strokeWidth="3"
          strokeDasharray="9 8"
          opacity="0.6"
        />
      </g>

      {/* lampa i biurko */}
      <Glow x={1430} y={520} rx={340} ry={280} tone="warm" opacity={0.45} />
      <Floor y={640} tone={INK.void} opacity={0.85} />
      <rect x="-40" y="628" width={VIEW_W + 80} height="26" fill={INK.high} opacity="0.9" />
      <rect x="-40" y="654" width={VIEW_W + 80} height="246" fill={INK.base} />

      {CO_PAPERS.map((p) => (
        <rect
          key={p.k}
          x={p.x}
          y={p.y}
          width={p.w}
          height="52"
          fill={INK.haze}
          opacity="0.13"
          transform={`rotate(${p.r} ${p.x + p.w / 2} ${p.y + 26})`}
        />
      ))}

      {/* monitor */}
      <g>
        <rect x="1120" y="452" width="300" height="176" rx="5" fill={INK.void} />
        <rect x="1132" y="464" width="276" height="152" fill={INK.mid} opacity="0.9" />
        <Glow x={1270} y={540} rx={240} ry={170} tone="cool" opacity={0.32} />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x="1150" y={486 + i * 26} width={200 - i * 26} height="8" fill={INK.accent} opacity="0.22" />
        ))}
      </g>

      {/* kubek */}
      <g opacity="0.8">
        <rect x="392" y="576" width="52" height="56" rx="6" fill={INK.high} />
        <path d="M 444 592 a 16 16 0 0 1 0 28" fill="none" stroke={INK.high} strokeWidth="7" />
        <ellipse cx="418" cy="576" rx="26" ry="8" fill={INK.edge} />
      </g>
      <Disc x={700} y={612} rx={40} tone={INK.accent} opacity={0.28} />
    </SceneFrame>
  )
}

/* --- 2. coach-desk-mail ------------------------------------------------- */

const CM_LETTERS = (() => {
  const rand = mulberry32(77)
  return Array.from({ length: 9 }, (_, i) => ({
    k: i,
    x: 1090 + (rand() - 0.5) * 46,
    y: 604 - i * 13,
    w: 268 + rand() * 30,
    r: (rand() - 0.5) * 7,
  }))
})()

export function CoachDeskMail() {
  return (
    <SceneFrame>
      <Wall tone={INK.base} seams={2} seed={19} />
      <Glow x={1340} y={180} rx={420} ry={340} tone="warm" opacity={0.4} />
      <LightCone x={1332} y={120} spread={260} bottom={640} opacity={0.07} />
      <Floor y={604} tone={INK.void} opacity={0.9} />
      <rect x="-40" y="592" width={VIEW_W + 80} height="20" fill={INK.high} opacity="0.75" />

      {/* laptop */}
      <g>
        <polygon points="300,586 700,586 742,352 342,352" fill={INK.panel} />
        <polygon points="352,362 732,362 700,576 334,576" fill={INK.mid} opacity="0.7" />
        <polygon points="286,592 756,592 776,616 266,616" fill={INK.high} />
        <Glow x={520} y={470} rx={330} ry={250} tone="pale" opacity={0.3} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect
            key={i}
            x={392 + i * 4}
            y={396 + i * 28}
            width={280 - i * 22}
            height="10"
            fill={INK.haze}
            opacity="0.16"
          />
        ))}
      </g>

      {/* stos listów */}
      {CM_LETTERS.map((l) => (
        <g key={l.k} transform={`rotate(${l.r} ${l.x + l.w / 2} ${l.y + 40})`}>
          <rect x={l.x} y={l.y} width={l.w} height="78" rx="3" fill={INK.haze} opacity="0.16" />
          <path
            d={`M ${l.x} ${l.y} L ${l.x + l.w / 2} ${l.y + 40} L ${l.x + l.w} ${l.y}`}
            fill="none"
            stroke={INK.haze}
            strokeWidth="2"
            opacity="0.2"
          />
        </g>
      ))}
      <rect
        x="1042"
        y="476"
        width="70"
        height="16"
        rx="8"
        fill={INK.gold}
        opacity="0.35"
        transform="rotate(-18 1077 484)"
      />
    </SceneFrame>
  )
}

/* --- 3. tactics-board --------------------------------------------------- */

const TB_MARKS = (() => {
  const rand = mulberry32(23)
  const offense = Array.from({ length: 7 }, (_, i) => ({
    k: `o${i}`,
    x: 320 + rand() * 900,
    y: 250 + rand() * 400,
  }))
  const defense = offense.map((o, i) => ({
    k: `d${i}`,
    x: o.x + 40 + rand() * 46,
    y: o.y - 30 + rand() * 60,
  }))
  return { offense, defense }
})()

export function TacticsBoard() {
  return (
    <SceneFrame base={INK.void}>
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={INK.panel} />
      <Glow x={280} y={120} rx={620} ry={460} tone="pale" opacity={0.18} />
      <rect x="46" y="44" width={VIEW_W - 92} height={VIEW_H - 150} rx="8" fill={INK.mid} opacity="0.85" />
      <rect
        x="46"
        y="44"
        width={VIEW_W - 92}
        height={VIEW_H - 150}
        rx="8"
        fill="none"
        stroke={INK.edge}
        strokeWidth="10"
      />
      {/* schemat boiska */}
      <g stroke={INK.rim} strokeWidth="3" fill="none" opacity="0.45">
        <rect x="120" y="130" width={VIEW_W - 240} height={VIEW_H - 330} />
        <line x1="120" y1="290" x2={VIEW_W - 120} y2="290" />
        <line x1="120" y1="410" x2={VIEW_W - 120} y2="410" />
        <line x1="800" y1="130" x2="800" y2={VIEW_H - 200} strokeDasharray="14 12" opacity="0.6" />
      </g>
      {TB_MARKS.defense.map((d) => (
        <g key={d.k} opacity="0.4">
          <line x1={d.x - 13} y1={d.y - 13} x2={d.x + 13} y2={d.y + 13} stroke={INK.gold} strokeWidth="5" />
          <line x1={d.x + 13} y1={d.y - 13} x2={d.x - 13} y2={d.y + 13} stroke={INK.gold} strokeWidth="5" />
        </g>
      ))}
      {TB_MARKS.offense.map((o, i) => (
        <g key={o.k}>
          <circle cx={o.x} cy={o.y} r="17" fill={INK.accent} opacity="0.55" />
          <path
            d={`M ${o.x} ${o.y} q ${60 + i * 8} ${i % 2 ? -70 : 64} ${118 + i * 6} ${i % 2 ? -22 : 30}`}
            fill="none"
            stroke={INK.accent}
            strokeWidth="3.5"
            strokeDasharray="10 9"
            opacity="0.4"
          />
        </g>
      ))}
      {/* półka na markery */}
      <rect x="150" y={VIEW_H - 112} width={VIEW_W - 300} height="20" rx="6" fill={INK.high} opacity="0.9" />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={340 + i * 130}
          y={VIEW_H - 124}
          width="96"
          height="12"
          rx="6"
          fill={i === 1 ? INK.gold : INK.accent}
          opacity="0.45"
        />
      ))}
    </SceneFrame>
  )
}

/* --- 4. locker-room (+ wariant przedmeczowy) ---------------------------- */

const LR_UNITS = (() => {
  const rand = mulberry32(97)
  const units = []
  for (let x = -30; x < VIEW_W + 30; x += 196) {
    units.push({ k: x, x, jersey: rand() < 0.72, tone: rand() < 0.5 ? INK.mid : INK.high, num: rand() })
  }
  return units
})()

function Jersey({ x, y, w, h, tone, opacity }) {
  return (
    <path
      d={`M ${x} ${y + 20} l ${w * 0.2} -16 h ${w * 0.6} l ${w * 0.2} 16 l -14 16 l -${w * 0.14} -10 v ${h - 30} h -${w * 0.72} v -${h - 30} l -${w * 0.14} 10 z`}
      fill={tone}
      opacity={opacity}
    />
  )
}

export function LockerRoom({ variant = 'default' }) {
  const warm = variant === 'pre'
  return (
    <SceneFrame>
      <Wall tone={INK.deep} />
      {/* świetlówki pod sufitem */}
      {[300, 800, 1300].map((x) => (
        <g key={x}>
          <rect x={x - 130} y="44" width="260" height="12" rx="6" fill={warm ? INK.gold : INK.haze} opacity="0.3" />
          <Glow x={x} y={70} rx={330} ry={300} tone={warm ? 'warm' : 'pale'} opacity={warm ? 0.4 : 0.24} />
        </g>
      ))}
      {/* szafki */}
      {LR_UNITS.map((u) => (
        <g key={u.k}>
          <rect x={u.x} y="150" width="182" height="470" fill={u.tone} opacity="0.85" />
          <rect x={u.x} y="150" width="182" height="470" fill="none" stroke={INK.void} strokeWidth="6" />
          <rect x={u.x + 20} y="176" width="142" height="60" fill={INK.void} opacity="0.55" />
          {[0, 1, 2].map((i) => (
            <line
              key={i}
              x1={u.x + 42}
              y1={192 + i * 14}
              x2={u.x + 140}
              y2={192 + i * 14}
              stroke={INK.rim}
              strokeWidth="3"
              opacity="0.4"
            />
          ))}
          {u.jersey ? (
            <Jersey
              x={u.x + 26}
              y={262}
              w={130}
              h={210}
              tone={u.num > 0.5 ? INK.accent : INK.edge}
              opacity={u.num > 0.5 ? 0.32 : 0.5}
            />
          ) : null}
          <rect x={u.x + 60} y="596" width="62" height="10" rx="4" fill={INK.void} opacity="0.6" />
        </g>
      ))}
      {/* ławka */}
      <rect x="-40" y="700" width={VIEW_W + 80} height="34" rx="6" fill={INK.high} />
      <rect x="-40" y="734" width={VIEW_W + 80} height="12" fill={INK.void} opacity="0.6" />
      {[120, 520, 1080, 1480].map((x) => (
        <rect key={x} x={x} y="746" width="26" height="86" fill={INK.mid} opacity="0.8" />
      ))}
      <Floor y={832} tone={INK.void} opacity={0.95} />
      {warm ? <Glow x={800} y={640} rx={620} ry={300} tone="warm" opacity={0.3} /> : null}
    </SceneFrame>
  )
}

export function LockerRoomPre() {
  return <LockerRoom variant="pre" />
}

/* --- 5. planning-wall --------------------------------------------------- */

const PW_CELLS = (() => {
  const rand = mulberry32(313)
  const cells = []
  for (let r = 0; r < 5; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      const roll = rand()
      cells.push({
        k: `${r}-${c}`,
        x: 250 + c * 158,
        y: 178 + r * 108,
        kind: roll > 0.86 ? 'match' : roll > 0.72 ? 'travel' : 'idle',
      })
    }
  }
  return cells
})()

const PW_NOTES = [
  { x: 120, y: 250, r: -8, tone: INK.gold },
  { x: 108, y: 470, r: 6, tone: INK.accent },
  { x: 1400, y: 300, r: 5, tone: INK.accent },
  { x: 1412, y: 540, r: -6, tone: INK.gold },
]

export function PlanningWall() {
  return (
    <SceneFrame>
      <Wall tone={INK.deep} />
      <Bands x={0} y={0} w={VIEW_W} h={VIEW_H} count={26} tone={INK.panel} opacity={0.28} seed={9} />
      <Glow x={1180} y={110} rx={520} ry={420} tone="warm" opacity={0.22} />
      {/* siatka kalendarza */}
      <rect x="236" y="120" width="1122" height="586" fill={INK.panel} opacity="0.75" />
      <rect x="236" y="120" width="1122" height="586" fill="none" stroke={INK.edge} strokeWidth="4" />
      <rect x="236" y="120" width="1122" height="44" fill={INK.high} opacity="0.8" />
      {PW_CELLS.map((c) => (
        <g key={c.k}>
          <rect x={c.x} y={c.y} width="142" height="92" fill="none" stroke={INK.mid} strokeWidth="2" opacity="0.8" />
          {c.kind !== 'idle' ? (
            <rect
              x={c.x + 12}
              y={c.y + 58}
              width="118"
              height="16"
              rx="4"
              fill={c.kind === 'match' ? INK.accent : INK.gold}
              opacity={c.kind === 'match' ? 0.42 : 0.24}
            />
          ) : null}
          <rect x={c.x + 12} y={c.y + 14} width="34" height="10" rx="4" fill={INK.haze} opacity="0.16" />
        </g>
      ))}
      {/* karteczki i pinezki */}
      {PW_NOTES.map((n) => (
        <g key={`${n.x}-${n.y}`} transform={`rotate(${n.r} ${n.x + 60} ${n.y + 60})`}>
          <rect x={n.x} y={n.y} width="126" height="122" fill={n.tone} opacity="0.16" />
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              x={n.x + 16}
              y={n.y + 28 + i * 24}
              width={92 - i * 18}
              height="8"
              fill={n.tone}
              opacity="0.22"
            />
          ))}
          <circle cx={n.x + 63} cy={n.y + 10} r="7" fill={INK.gold} opacity="0.5" />
        </g>
      ))}
      <Floor y={782} tone={INK.void} opacity={0.75} />
    </SceneFrame>
  )
}

/* --- 6. negotiation-room ------------------------------------------------ */

const NR_DOCS = [
  { x: 430, y: 690, r: -12 },
  { x: 690, y: 716, r: 4 },
  { x: 1010, y: 686, r: 9 },
]

export function NegotiationRoom() {
  return (
    <SceneFrame base={INK.void}>
      <Wall tone={INK.base} />
      {/* lampa nad stołem */}
      <line x1="820" y1="0" x2="820" y2="150" stroke={INK.edge} strokeWidth="5" />
      <path d="M 748 200 l 40 -50 h 64 l 40 50 z" fill={INK.high} />
      <Glow x={820} y={230} rx={560} ry={420} tone="warm" opacity={0.5} />
      <LightCone x={820} y={200} spread={470} bottom={720} opacity={0.09} />

      {/* stół */}
      <ellipse cx="800" cy="740" rx="760" ry="190" fill={INK.high} />
      <ellipse cx="800" cy="726" rx="760" ry="190" fill={INK.mid} />
      <ellipse cx="800" cy="720" rx="640" ry="140" fill={INK.panel} opacity="0.55" />
      {/* dokumenty na stole */}
      {NR_DOCS.map((d) => (
        <g key={d.x} transform={`rotate(${d.r} ${d.x + 90} ${d.y + 30})`}>
          <rect x={d.x} y={d.y} width="180" height="118" rx="4" fill={INK.haze} opacity="0.15" />
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              x={d.x + 20}
              y={d.y + 24 + i * 24}
              width={140 - i * 30}
              height="8"
              fill={INK.void}
              opacity="0.3"
            />
          ))}
        </g>
      ))}
      {/* telefon i długopis */}
      <rect x="1230" y="690" width="120" height="52" rx="10" fill={INK.void} opacity="0.7" />
      <rect x="1246" y="672" width="88" height="26" rx="12" fill={INK.edge} opacity="0.7" />
      <rect x="352" y="770" width="86" height="10" rx="5" fill={INK.gold} opacity="0.3" transform="rotate(-14 395 775)" />
      {/* sylwetki po obu stronach */}
      <Figure x={228} y={720} s={2.1} tone={INK.void} opacity={0.72} />
      <Figure x={1408} y={726} s={2.2} tone={INK.void} opacity={0.72} lean={-2} />
    </SceneFrame>
  )
}

/* --- 7. boardroom ------------------------------------------------------- */

const BR_CHART = (() => {
  const rand = mulberry32(511)
  let y = 470
  return Array.from({ length: 9 }, (_, i) => {
    y -= 8 + rand() * 34
    return { k: i, x: 150 + i * 74, y }
  })
})()

export function Boardroom() {
  return (
    <SceneFrame>
      <Wall tone={INK.base} />
      <Bands x={0} y={0} w={VIEW_W} h={VIEW_H} count={14} tone={INK.panel} opacity={0.4} seed={31} />
      <Glow x={1180} y={260} rx={520} ry={420} tone="warm" opacity={0.34} />

      {/* wykres na ścianie */}
      <g>
        <rect x="110" y="150" width="700" height="400" fill={INK.panel} opacity="0.7" />
        <rect x="110" y="150" width="700" height="400" fill="none" stroke={INK.edge} strokeWidth="4" />
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1="140"
            y1={210 + i * 96}
            x2="780"
            y2={210 + i * 96}
            stroke={INK.mid}
            strokeWidth="2"
            opacity="0.8"
          />
        ))}
        <polyline
          points={BR_CHART.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={INK.accent}
          strokeWidth="5"
          opacity="0.55"
        />
        {BR_CHART.map((p) => (
          <circle key={p.k} cx={p.x} cy={p.y} r="7" fill={INK.accent} opacity="0.5" />
        ))}
      </g>

      {/* gablota z pucharami */}
      <g>
        <rect x="1000" y="120" width="480" height="520" fill={INK.panel} opacity="0.9" />
        <rect x="1000" y="120" width="480" height="520" fill="none" stroke={INK.edge} strokeWidth="6" />
        {[300, 452, 604].map((y) => (
          <rect key={y} x="1004" y={y} width="472" height="10" fill={INK.high} />
        ))}
        <Trophy x={1120} y={300} s={1.5} opacity={0.42} />
        <Trophy x={1360} y={300} s={1.1} tone={INK.haze} opacity={0.28} />
        <Trophy x={1240} y={452} s={1.3} opacity={0.34} />
        <Trophy x={1090} y={604} s={1} tone={INK.haze} opacity={0.24} />
        <Trophy x={1400} y={604} s={1.2} opacity={0.3} />
        <polygon points="1000,120 1180,120 1000,420" fill={INK.haze} opacity="0.05" />
      </g>

      {/* stół w pierwszym planie */}
      <rect x="-40" y="716" width={VIEW_W + 80} height="30" rx="8" fill={INK.high} />
      <Floor y={746} tone={INK.void} opacity={0.95} />
    </SceneFrame>
  )
}

/* --- 8. press-room ------------------------------------------------------ */

const PRESS_FLASHES = (() => {
  const rand = mulberry32(613)
  return Array.from({ length: 11 }, (_, i) => ({
    k: i,
    x: 90 + rand() * 1420,
    y: 620 + rand() * 200,
    r: 40 + rand() * 90,
    o: 0.1 + rand() * 0.28,
  }))
})()

const PRESS_MICS = [
  { x: 660, tilt: -14 },
  { x: 800, tilt: 3 },
  { x: 930, tilt: 15 },
]

export function PressRoom() {
  return (
    <SceneFrame>
      <Wall tone={INK.deep} />
      {/* ścianka sponsorska */}
      <rect x="80" y="60" width={VIEW_W - 160} height="620" fill={INK.panel} opacity="0.85" />
      <rect x="80" y="60" width={VIEW_W - 160} height="620" fill="none" stroke={INK.edge} strokeWidth="5" />
      <g opacity="0.22">
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 7 }, (_, c) => {
            const x = 150 + c * 196
            const y = 118 + r * 124
            return (r + c) % 2 === 0 ? (
              <rect key={`${r}-${c}`} x={x} y={y} width="120" height="40" rx="8" fill={INK.accent} opacity="0.5" />
            ) : (
              <g key={`${r}-${c}`}>
                <circle cx={x + 34} cy={y + 20} r="20" fill={INK.haze} opacity="0.4" />
                <rect x={x + 66} y={y + 10} width="72" height="20" rx="6" fill={INK.haze} opacity="0.3" />
              </g>
            )
          }),
        )}
      </g>
      {/* pulpit i mikrofony */}
      <rect x="520" y="640" width="560" height="260" rx="10" fill={INK.high} />
      <rect x="520" y="640" width="560" height="18" fill={INK.edge} />
      {PRESS_MICS.map((m) => (
        <g key={m.x} transform={`rotate(${m.tilt} ${m.x} 640)`}>
          <line x1={m.x} y1="640" x2={m.x} y2="540" stroke={INK.void} strokeWidth="7" />
          <ellipse cx={m.x} cy="528" rx="15" ry="22" fill={INK.void} />
        </g>
      ))}
      {PRESS_FLASHES.map((f) => (
        <Glow key={f.k} x={f.x} y={f.y} rx={f.r} tone="pale" opacity={f.o} />
      ))}
      <Floor y={840} tone={INK.void} opacity={0.8} />
    </SceneFrame>
  )
}

/* --- 9. trophy-cabinet -------------------------------------------------- */

const TC_NODES = (() => {
  const rand = mulberry32(719)
  return Array.from({ length: 8 }, (_, i) => ({ k: i, x: 180 + i * 178, r: 8 + rand() * 8 }))
})()

export function TrophyCabinet() {
  return (
    <SceneFrame base={INK.void}>
      <Wall tone={INK.base} />
      <Glow x={800} y={120} rx={700} ry={420} tone="warm" opacity={0.24} />
      <rect x="90" y="70" width={VIEW_W - 180} height="600" fill={INK.panel} opacity="0.8" />
      <rect x="90" y="70" width={VIEW_W - 180} height="600" fill="none" stroke={INK.edge} strokeWidth="6" />
      {[268, 466, 664].map((y) => (
        <rect key={y} x="94" y={y} width={VIEW_W - 188} height="12" fill={INK.high} />
      ))}

      {/* medale */}
      {[240, 360, 480].map((x, i) => (
        <g key={x} opacity={0.42 - i * 0.06}>
          <path d={`M ${x - 20} 120 l 20 56 l 20 -56 z`} fill={INK.accent} />
          <circle cx={x} cy="216" r="34" fill={INK.gold} opacity="0.65" />
          <circle cx={x} cy="216" r="20" fill={INK.void} opacity="0.35" />
        </g>
      ))}
      {/* ramki ze zdjęciami */}
      {[760, 980, 1200].map((x, i) => (
        <g key={x} opacity="0.5">
          <rect x={x} y="110" width="170" height="146" fill={INK.mid} />
          <rect x={x} y="110" width="170" height="146" fill="none" stroke={INK.edge} strokeWidth="4" />
          <circle cx={x + 85} cy={170 + i * 4} r="22" fill={INK.haze} opacity="0.18" />
          <path d={`M ${x + 24} 250 q 61 -60 122 0 z`} fill={INK.haze} opacity="0.16" />
        </g>
      ))}
      <Trophy x={330} y={466} s={1.6} opacity={0.4} />
      <Trophy x={620} y={466} s={1.2} tone={INK.haze} opacity={0.24} />
      <Trophy x={1180} y={466} s={1.35} opacity={0.34} />
      <Disc x={880} y={430} rx={54} tone={INK.accent} opacity={0.22} />

      {/* oś czasu kariery */}
      <line x1="150" y1="760" x2={VIEW_W - 150} y2="760" stroke={INK.edge} strokeWidth="4" opacity="0.8" />
      {TC_NODES.map((n) => (
        <g key={n.k}>
          <circle cx={n.x} cy="760" r={n.r} fill={INK.accent} opacity="0.4" />
          <line
            x1={n.x}
            y1={760 - n.r - 6}
            x2={n.x}
            y2={760 - n.r - 34}
            stroke={INK.edge}
            strokeWidth="3"
            opacity="0.6"
          />
        </g>
      ))}
      {/* refleks szyby */}
      <polygon points="90,70 420,70 90,470" fill={INK.haze} opacity="0.05" />
      <polygon points="1180,70 1400,70 1010,670 900,670" fill={INK.haze} opacity="0.035" />
    </SceneFrame>
  )
}

/* --- 10. career-new (biurko z góry) ------------------------------------- */

const CN_MAP = (() => {
  const rand = mulberry32(829)
  return Array.from({ length: 14 }, (_, i) => ({
    k: i,
    x: 1080 + rand() * 420,
    y: 180 + rand() * 380,
    r: 20 + rand() * 60,
  }))
})()

export function CareerNew() {
  return (
    <SceneFrame base={INK.void}>
      <Wall tone={INK.base} />
      <Bands x={0} y={0} w={VIEW_W} h={VIEW_H} count={9} tone={INK.panel} opacity={0.35} seed={57} />
      <Glow x={260} y={140} rx={560} ry={480} tone="warm" opacity={0.3} />

      {/* mapa */}
      <g transform="rotate(-4 1290 370)">
        <rect x="1040" y="140" width="500" height="470" fill={INK.panel} opacity="0.8" />
        <rect x="1040" y="140" width="500" height="470" fill="none" stroke={INK.edge} strokeWidth="3" />
        {CN_MAP.map((m) => (
          <circle key={m.k} cx={m.x} cy={m.y} r={m.r} fill={INK.mid} opacity="0.55" />
        ))}
        {CN_MAP.slice(0, 6).map((m) => (
          <circle key={`p${m.k}`} cx={m.x} cy={m.y} r="6" fill={INK.gold} opacity="0.5" />
        ))}
      </g>

      {/* kontrakt */}
      <g transform="rotate(-6 560 500)">
        <rect x="250" y="180" width="620" height="700" rx="6" fill={INK.haze} opacity="0.13" />
        <rect x="310" y="250" width="360" height="20" rx="6" fill={INK.void} opacity="0.35" />
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x="310"
            y={320 + i * 40}
            width={i % 4 === 3 ? 300 : 500}
            height="12"
            rx="5"
            fill={INK.void}
            opacity="0.22"
          />
        ))}
        <path
          d="M 330 830 q 60 -46 116 -6 q 44 32 108 -26"
          fill="none"
          stroke={INK.accent}
          strokeWidth="6"
          opacity="0.5"
        />
      </g>
      <rect x="900" y="700" width="240" height="14" rx="7" fill={INK.gold} opacity="0.35" transform="rotate(24 1020 707)" />
      <Disc x={1180} y={760} rx={90} tone={INK.accent} opacity={0.3} />
      <ellipse cx="240" cy="120" rx="86" ry="30" fill={INK.high} opacity="0.5" />
    </SceneFrame>
  )
}
