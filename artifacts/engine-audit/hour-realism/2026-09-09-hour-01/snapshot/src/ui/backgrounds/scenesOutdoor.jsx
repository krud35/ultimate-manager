/**
 * Sceny "na zewnątrz": stadion, boisko treningowe, trybuny, arena turniejowa.
 * Wszystko rysowane proceduralnie — bez plików graficznych.
 */
import { Disc, Figure, Glow, PerspectiveField, SceneFrame, Stands, Trophy } from './primitives.jsx'
import { INK, VIEW_H, VIEW_W, mulberry32 } from './tokens.js'

/** Pas mgły / kurzu nad murawą. */
function Haze({ y, h, opacity = 0.05, tone = INK.haze }) {
  return <rect x="0" y={y} width={VIEW_W} height={h} fill={tone} opacity={opacity} />
}

/** Maszt oświetleniowy. */
function FloodLight({ x, y, h = 300, scale = 1 }) {
  const w = 150 * scale
  return (
    <g>
      <rect x={x - 7 * scale} y={y} width={14 * scale} height={h} fill={INK.void} opacity="0.85" />
      <rect x={x - w / 2} y={y - 66 * scale} width={w} height={66 * scale} rx={6 * scale} fill={INK.void} opacity="0.9" />
      <Glow x={x} y={y - 34 * scale} rx={230 * scale} ry={170 * scale} tone="pale" opacity={0.3} />
    </g>
  )
}

/* --- 1. career-select (pusty stadion o świcie) -------------------------- */

const CSEL_TOWERS = [190, 640, 1010, 1440]

export function CareerSelect() {
  return (
    <SceneFrame base={INK.void}>
      <defs>
        <linearGradient id="csel-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c1712" />
          <stop offset="62%" stopColor="#16241c" />
          <stop offset="100%" stopColor="#25301f" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={VIEW_W} height="470" fill="url(#csel-sky)" />
      <Glow x={1120} y={430} rx={760} ry={300} tone="warm" opacity={0.28} />

      {CSEL_TOWERS.map((x) => (
        <FloodLight key={x} x={x} y={110} h={330} scale={0.9} />
      ))}

      {/* trybuny po obu stronach */}
      <polygon points="0,330 470,430 470,560 0,560" fill={INK.deep} />
      <Stands x={-20} y={352} w={470} h={150} rows={6} seed={12} tone={INK.high} opacity={0.4} />
      <polygon points={`${VIEW_W},330 1130,430 1130,560 ${VIEW_W},560`} fill={INK.deep} />
      <Stands x={1130} y={352} w={500} h={150} rows={6} seed={44} tone={INK.high} opacity={0.4} />

      {/* murawa */}
      <rect x="0" y="440" width={VIEW_W} height={VIEW_H - 440} fill={INK.mid} />
      <PerspectiveField top={452} bottom={VIEW_H + 40} topInset={330} bottomInset={1180} rows={5} />
      <Haze y={410} h={90} opacity={0.06} />
      <Haze y={470} h={140} opacity={0.035} />
      <rect x="0" y={VIEW_H - 170} width={VIEW_W} height="170" fill={INK.void} opacity="0.45" />
    </SceneFrame>
  )
}

/* --- 2. training-ground ------------------------------------------------- */

const TG_CONES = (() => {
  const rand = mulberry32(151)
  return Array.from({ length: 9 }, (_, i) => {
    const t = i / 8
    const y = 590 + t * 250
    const s = 0.6 + t * 1.5
    return { k: i, x: 180 + t * 260 + rand() * 40, y, s }
  })
})()

const TG_DISCS = (() => {
  const rand = mulberry32(211)
  return Array.from({ length: 6 }, (_, i) => ({
    k: i,
    x: 1120 + rand() * 380,
    y: 690 + rand() * 170,
    r: 22 + rand() * 22,
  }))
})()

function Cone({ x, y, s }) {
  return (
    <g opacity="0.55">
      <ellipse cx={x} cy={y} rx={26 * s} ry={8 * s} fill={INK.void} opacity="0.55" />
      <path d={`M ${x} ${y - 46 * s} l ${20 * s} ${46 * s} h ${-40 * s} z`} fill={INK.gold} opacity="0.75" />
    </g>
  )
}

export function TrainingGround() {
  return (
    <SceneFrame base={INK.void}>
      <defs>
        <linearGradient id="tg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b1610" />
          <stop offset="70%" stopColor="#1b2718" />
          <stop offset="100%" stopColor="#2d3320" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={VIEW_W} height="430" fill="url(#tg-sky)" />
      <Glow x={330} y={410} rx={620} ry={280} tone="warm" opacity={0.42} />
      <Haze y={370} h={80} opacity={0.05} />

      {/* linia drzew na horyzoncie */}
      <g opacity="0.75">
        {Array.from({ length: 26 }, (_, i) => {
          const x = -20 + i * 66
          const h = 34 + ((i * 37) % 46)
          return <ellipse key={i} cx={x} cy={424 - h / 2} rx={40} ry={h} fill={INK.void} opacity="0.55" />
        })}
      </g>

      <rect x="0" y="418" width={VIEW_W} height={VIEW_H - 418} fill={INK.mid} />
      <PerspectiveField top={428} bottom={VIEW_H + 60} topInset={300} bottomInset={1100} rows={4} lineOpacity={0.35} />

      {/* drabinka koordynacyjna */}
      <g opacity="0.4">
        <polygon points="880,560 1010,560 1180,880 820,880" fill="none" stroke={INK.haze} strokeWidth="4" />
        {Array.from({ length: 7 }, (_, i) => {
          const t = i / 6
          const y = 560 + t * 320
          const l = 880 - t * 60
          const r = 1010 + t * 170
          return <line key={i} x1={l} y1={y} x2={r} y2={y} stroke={INK.haze} strokeWidth="4" />
        })}
      </g>

      {TG_CONES.map((c) => (
        <Cone key={c.k} x={c.x} y={c.y} s={c.s} />
      ))}
      {TG_DISCS.map((d) => (
        <Disc key={d.k} x={d.x} y={d.y} rx={d.r} tone={INK.accent} opacity={0.35} />
      ))}
      {/* worek na dyski */}
      <g opacity="0.7">
        <rect x="1380" y="600" width="120" height="150" rx="14" fill={INK.void} />
        <rect x="1380" y="600" width="120" height="26" rx="12" fill={INK.edge} />
      </g>
      <Figure x={640} y={628} s={1.5} tone={INK.void} opacity={0.5} lean={-4} />
      <ellipse cx="700" cy="632" rx="150" ry="12" fill={INK.void} opacity="0.35" />
      <rect x="0" y={VIEW_H - 150} width={VIEW_W} height="150" fill={INK.void} opacity="0.4" />
    </SceneFrame>
  )
}

/* --- 3. scouting-stand -------------------------------------------------- */

export function ScoutingStand() {
  return (
    <SceneFrame base={INK.void}>
      <defs>
        <linearGradient id="sc-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#101c13" />
          <stop offset="100%" stopColor="#1a2a1c" />
        </linearGradient>
      </defs>
      {/* boisko widziane z góry, z trybuny */}
      <rect x="0" y="0" width={VIEW_W} height="640" fill="url(#sc-grass)" />
      <g opacity="0.4">
        <polygon points="250,110 1350,110 1560,560 40,560" fill="none" stroke={INK.rim} strokeWidth="4" />
        {[0.22, 0.46, 0.7].map((t, i) => (
          <line
            key={i}
            x1={250 - t * 210}
            y1={110 + t * 450}
            x2={1350 + t * 210}
            y2={110 + t * 450}
            stroke={INK.rim}
            strokeWidth="3"
          />
        ))}
      </g>
      <Glow x={200} y={60} rx={520} ry={300} tone="pale" opacity={0.2} />
      <Glow x={1400} y={60} rx={520} ry={300} tone="pale" opacity={0.2} />
      {[
        { x: 520, y: 300, s: 0.9 },
        { x: 700, y: 250, s: 0.85 },
        { x: 900, y: 330, s: 0.95 },
        { x: 1080, y: 270, s: 0.9 },
      ].map((f) => (
        <Figure key={f.x} x={f.x} y={f.y} s={f.s} tone={INK.void} opacity={0.45} />
      ))}

      {/* trybuna: barierka i pierwszy plan */}
      <rect x="0" y="600" width={VIEW_W} height={VIEW_H - 600} fill={INK.deep} />
      <Stands x={-20} y={612} w={VIEW_W + 40} h={120} rows={4} seed={81} tone={INK.high} opacity={0.35} />
      <rect x="0" y="586" width={VIEW_W} height="14" fill={INK.edge} opacity="0.8" />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={40 + i * 118} y="600" width="10" height="70" fill={INK.edge} opacity="0.5" />
      ))}

      {/* notes i lornetka na barierce */}
      <g transform="rotate(-5 300 800)">
        <rect x="150" y="720" width="330" height="200" rx="8" fill={INK.haze} opacity="0.14" />
        {Array.from({ length: 5 }, (_, i) => (
          <rect key={i} x="184" y={756 + i * 30} width={i % 2 ? 200 : 262} height="9" fill={INK.void} opacity="0.32" />
        ))}
      </g>
      <g opacity="0.85">
        <rect x="1100" y="742" width="86" height="120" rx="18" fill={INK.void} />
        <rect x="1206" y="742" width="86" height="120" rx="18" fill={INK.void} />
        <rect x="1186" y="778" width="20" height="24" fill={INK.void} />
      </g>
      <Glow x={1500} y={860} rx={330} ry={220} tone="warm" opacity={0.24} />
    </SceneFrame>
  )
}

/* --- 4. academy-field --------------------------------------------------- */

const AC_KIDS = (() => {
  const rand = mulberry32(367)
  return Array.from({ length: 7 }, (_, i) => ({
    k: i,
    x: 200 + rand() * 1200,
    y: 560 + rand() * 210,
    s: 0.85 + rand() * 0.5,
    lean: (rand() - 0.5) * 12,
  }))
})()

export function AcademyField() {
  return (
    <SceneFrame base={INK.void}>
      <defs>
        <linearGradient id="ac-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#101c15" />
          <stop offset="100%" stopColor="#22301e" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={VIEW_W} height="400" fill="url(#ac-sky)" />
      <Glow x={800} y={330} rx={900} ry={260} tone="cool" opacity={0.2} />
      {/* płot i drzewa */}
      <g opacity="0.6">
        {Array.from({ length: 22 }, (_, i) => (
          <ellipse key={i} cx={-10 + i * 78} cy={370} rx={48} ry={62} fill={INK.void} opacity="0.5" />
        ))}
      </g>
      <line x1="0" y1="404" x2={VIEW_W} y2="404" stroke={INK.edge} strokeWidth="4" opacity="0.5" />
      {Array.from({ length: 30 }, (_, i) => (
        <line
          key={i}
          x1={i * 56}
          y1="392"
          x2={i * 56}
          y2="432"
          stroke={INK.edge}
          strokeWidth="3"
          opacity="0.35"
        />
      ))}

      <rect x="0" y="404" width={VIEW_W} height={VIEW_H - 404} fill={INK.mid} />
      <PerspectiveField top={412} bottom={VIEW_H + 30} topInset={260} bottomInset={980} rows={3} lineOpacity={0.4} />
      {AC_KIDS.map((k) => (
        <g key={k.k}>
          <ellipse cx={k.x + 6} cy={k.y + 4} rx={44 * k.s} ry={9} fill={INK.void} opacity="0.32" />
          <Figure x={k.x} y={k.y} s={k.s} tone={INK.void} opacity={0.55} lean={k.lean} />
        </g>
      ))}
      <Disc x={980} y={520} rx={26} tone={INK.gold} opacity={0.4} />
      <Cone x={300} y={840} s={1.4} />
      <Cone x={1330} y={800} s={1.2} />
      <rect x="0" y={VIEW_H - 130} width={VIEW_W} height="130" fill={INK.void} opacity="0.35" />
    </SceneFrame>
  )
}

/* --- 5. league-arena (kilka boisk z lotu ptaka) ------------------------- */

const AR_FIELDS = [
  { x: 120, y: 150, w: 620, h: 300, r: -7 },
  { x: 880, y: 110, w: 600, h: 290, r: 5 },
  { x: 300, y: 560, w: 660, h: 300, r: 3 },
  { x: 1080, y: 540, w: 560, h: 280, r: -5 },
]

const AR_TENTS = (() => {
  const rand = mulberry32(457)
  return Array.from({ length: 9 }, (_, i) => ({
    k: i,
    x: 60 + rand() * 1480,
    y: 460 + rand() * 60,
    w: 90 + rand() * 60,
  }))
})()

export function LeagueArena() {
  return (
    <SceneFrame base={INK.base}>
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={INK.deep} />
      <Glow x={800} y={440} rx={900} ry={620} tone="cool" opacity={0.14} />
      {AR_FIELDS.map((f) => (
        <g key={f.x} transform={`rotate(${f.r} ${f.x + f.w / 2} ${f.y + f.h / 2})`} opacity="0.85">
          <rect x={f.x} y={f.y} width={f.w} height={f.h} rx="6" fill={INK.mid} />
          <rect x={f.x} y={f.y} width={f.w} height={f.h} rx="6" fill="none" stroke={INK.rim} strokeWidth="3" opacity="0.55" />
          <line x1={f.x + f.w * 0.22} y1={f.y} x2={f.x + f.w * 0.22} y2={f.y + f.h} stroke={INK.rim} strokeWidth="3" opacity="0.4" />
          <line x1={f.x + f.w * 0.78} y1={f.y} x2={f.x + f.w * 0.78} y2={f.y + f.h} stroke={INK.rim} strokeWidth="3" opacity="0.4" />
          <rect x={f.x} y={f.y} width={f.w * 0.22} height={f.h} fill={INK.high} opacity="0.35" />
          <rect x={f.x + f.w * 0.78} y={f.y} width={f.w * 0.22} height={f.h} fill={INK.high} opacity="0.35" />
        </g>
      ))}
      {/* namioty i sprzęt między boiskami */}
      {AR_TENTS.map((t) => (
        <g key={t.k} opacity="0.55">
          <path d={`M ${t.x} ${t.y + 44} l ${t.w / 2} -44 l ${t.w / 2} 44 z`} fill={INK.high} />
          <rect x={t.x + 6} y={t.y + 44} width={t.w - 12} height="10" fill={INK.void} opacity="0.6" />
        </g>
      ))}
      <rect x="0" y="470" width={VIEW_W} height="46" fill={INK.void} opacity="0.35" />
      <rect x="0" y={VIEW_H - 120} width={VIEW_W} height="120" fill={INK.void} opacity="0.3" />
    </SceneFrame>
  )
}

/* --- 6. cup-trophy ------------------------------------------------------ */

const CUP_CONFETTI = (() => {
  const rand = mulberry32(929)
  return Array.from({ length: 70 }, (_, i) => ({
    k: i,
    x: rand() * VIEW_W,
    y: rand() * VIEW_H * 0.9,
    w: 6 + rand() * 12,
    h: 10 + rand() * 16,
    r: rand() * 360,
    tone: rand() < 0.55 ? INK.gold : INK.accent,
    o: 0.12 + rand() * 0.3,
  }))
})()

export function CupTrophy() {
  return (
    <SceneFrame base={INK.void}>
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={INK.base} />
      {/* reflektory */}
      {[
        { x: 280, spread: 240 },
        { x: 820, spread: 300 },
        { x: 1380, spread: 240 },
      ].map((s) => (
        <polygon
          key={s.x}
          points={`${s.x - 24},0 ${s.x + 24},0 ${s.x + s.spread},${VIEW_H} ${s.x - s.spread},${VIEW_H}`}
          fill={INK.gold}
          opacity="0.035"
        />
      ))}
      <Glow x={800} y={620} rx={560} ry={360} tone="warm" opacity={0.3} />

      {/* podium */}
      <rect x="600" y="640" width="400" height="120" rx="6" fill={INK.high} />
      <rect x="380" y="700" width="230" height="60" rx="6" fill={INK.mid} />
      <rect x="990" y="716" width="230" height="44" rx="6" fill={INK.mid} />
      <rect x="0" y="760" width={VIEW_W} height={VIEW_H - 760} fill={INK.void} opacity="0.9" />
      <Trophy x={800} y={630} s={3.4} opacity={0.5} />
      <ellipse cx="800" cy="646" rx="150" ry="16" fill={INK.void} opacity="0.5" />

      {CUP_CONFETTI.map((c) => (
        <rect
          key={c.k}
          x={c.x}
          y={c.y}
          width={c.w}
          height={c.h}
          fill={c.tone}
          opacity={c.o}
          transform={`rotate(${c.r} ${c.x + c.w / 2} ${c.y + c.h / 2})`}
        />
      ))}
    </SceneFrame>
  )
}

/* --- 7. pre-match-tunnel ------------------------------------------------ */

export function PreMatchTunnel() {
  // Punkt zbiegu przesunięty w prawo, żeby jasne wyjście nie siedziało
  // dokładnie pod kafelkami na środku ekranu.
  const vx = 1120
  const vy = 470
  return (
    <SceneFrame base={INK.void}>
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={INK.base} />
      {/* ściany i sufit tunelu */}
      <polygon points={`0,0 ${VIEW_W},0 ${vx + 190},${vy - 150} ${vx - 190},${vy - 150}`} fill={INK.deep} />
      <polygon points={`0,0 0,${VIEW_H} ${vx - 190},${vy + 190} ${vx - 190},${vy - 150}`} fill={INK.panel} />
      <polygon
        points={`${VIEW_W},0 ${VIEW_W},${VIEW_H} ${vx + 190},${vy + 190} ${vx + 190},${vy - 150}`}
        fill={INK.mid}
        opacity="0.85"
      />
      <polygon points={`0,${VIEW_H} ${VIEW_W},${VIEW_H} ${vx + 190},${vy + 190} ${vx - 190},${vy + 190}`} fill={INK.void} />

      {/* żebra ścian */}
      {[0.18, 0.38, 0.58, 0.76].map((t, i) => {
        const lx = (vx - 190) * t
        const rx = VIEW_W + (vx + 190 - VIEW_W) * t
        const ty = vy * t - 150 * t
        const by = VIEW_H + (vy + 190 - VIEW_H) * t
        return (
          <g key={i} opacity={0.5 - i * 0.08}>
            <line x1={lx} y1={ty} x2={lx} y2={by} stroke={INK.edge} strokeWidth="6" />
            <line x1={rx} y1={ty} x2={rx} y2={by} stroke={INK.edge} strokeWidth="6" />
          </g>
        )
      })}
      {/* światła sufitowe */}
      {[0.3, 0.55, 0.78].map((t, i) => (
        <Glow key={i} x={vx * t + 300 * (1 - t)} y={vy * t + 60 * (1 - t)} rx={210 * (1 - t) + 60} ry={90} tone="warm" opacity={0.22} />
      ))}

      {/* wyjście na boisko */}
      <rect x={vx - 190} y={vy - 150} width="380" height="340" fill={INK.high} />
      <rect x={vx - 160} y={vy - 120} width="320" height="290" fill={INK.rim} opacity="0.55" />
      <Glow x={vx} y={vy + 20} rx={430} ry={360} tone="pale" opacity={0.45} />
      <rect x={vx - 160} y={vy + 60} width="320" height="110" fill={INK.accent} opacity="0.22" />

      <Figure x={vx - 250} y={vy + 260} s={2.4} tone={INK.void} opacity={0.8} />
      <Figure x={vx + 260} y={vy + 320} s={2.9} tone={INK.void} opacity={0.75} lean={2} />
    </SceneFrame>
  )
}

/* --- 8. post-match-dusk ------------------------------------------------- */

const PM_ITEMS = (() => {
  const rand = mulberry32(1013)
  return Array.from({ length: 5 }, (_, i) => ({
    k: i,
    x: 220 + rand() * 1200,
    y: 640 + rand() * 200,
    s: 0.8 + rand() * 0.9,
  }))
})()

export function PostMatchDusk() {
  return (
    <SceneFrame base={INK.void}>
      <defs>
        <linearGradient id="pm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#080f0c" />
          <stop offset="55%" stopColor="#131d16" />
          <stop offset="100%" stopColor="#33301d" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={VIEW_W} height="450" fill="url(#pm-sky)" />
      <Glow x={1180} y={452} rx={720} ry={230} tone="warm" opacity={0.5} />
      <rect x="0" y="436" width={VIEW_W} height="14" fill={INK.gold} opacity="0.12" />

      {/* dalekie trybuny */}
      <polygon points="0,300 620,380 620,450 0,450" fill={INK.void} opacity="0.85" />
      <polygon points={`${VIEW_W},310 1180,390 1180,450 ${VIEW_W},450`} fill={INK.void} opacity="0.85" />
      <FloodLight x={420} y={130} h={280} scale={0.75} />
      <FloodLight x={1310} y={140} h={270} scale={0.75} />

      <rect x="0" y="446" width={VIEW_W} height={VIEW_H - 446} fill={INK.mid} />
      <PerspectiveField top={452} bottom={VIEW_H + 50} topInset={340} bottomInset={1160} rows={5} lineOpacity={0.3} />
      <Haze y={430} h={110} opacity={0.05} />

      {/* długie cienie i porzucony sprzęt */}
      {PM_ITEMS.map((it) => (
        <g key={it.k}>
          <ellipse cx={it.x - 60 * it.s} cy={it.y + 6} rx={150 * it.s} ry={12} fill={INK.void} opacity="0.4" />
          <Cone x={it.x} y={it.y} s={it.s} />
        </g>
      ))}
      <ellipse cx="640" cy="792" rx="170" ry="14" fill={INK.void} opacity="0.4" />
      <Disc x={760} y={786} rx={46} tone={INK.haze} opacity={0.3} />
      <rect x="0" y={VIEW_H - 160} width={VIEW_W} height="160" fill={INK.void} opacity="0.45" />
    </SceneFrame>
  )
}
