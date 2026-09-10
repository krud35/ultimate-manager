import { useId, useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { ANALYSIS_COLS, ANALYSIS_ROWS } from '../matchEngine/scoutingAnalysis.js'
import { FIELD_DIMENSIONS } from '../matchEngine/fieldDimensions.js'

const control = 'rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-sm text-ufa-text'
const pct = (a, b) => b ? `${(a / b * 100).toFixed(1)}%` : '—'

function Pitch({ data, marks, layer, lossKind, aggregate, pl, names }) {
  const arrowId = useId()
  const { lengthM: w, widthM: h, endzoneM: ez } = FIELD_DIMENSIONS
  const cw = w / ANALYSIS_COLS
  const ch = h / ANALYSIS_ROWS
  const grid = data.maps[layer === 'accuracy' ? 'throws' : layer === 'losses' ? lossKind : layer] ?? {}
  const maximum = Math.max(1, ...Object.values(grid))
  const showMarks = !aggregate && ['losses', 'goals'].includes(layer)
  const visible = marks.filter(m => layer === 'goals' ? m.kind === 'goals' : lossKind === 'losses' ? ['blocks', 'drops', 'otherLosses'].includes(m.kind) : m.kind === lossKind)
  const kindName = { blocks: pl ? 'Blok' : 'Block', drops: 'Drop', otherLosses: pl ? 'Pozostała strata' : 'Other turnover', goals: pl ? 'Gol' : 'Goal' }
  const color = { blocks: '#f87171', drops: '#fbbf24', otherLosses: '#c084fc', goals: '#34d399' }
  const amount = showMarks ? visible.length : Object.values(grid).reduce((a, b) => a + b, 0)
  return <div className="rounded-lg border border-ufa-border bg-ufa-bg p-3">
    <div className="mb-2 flex justify-between text-xs text-ufa-muted"><span>{pl ? 'Własna strefa' : 'Own endzone'}</span><span>{pl ? 'Kierunek ataku →' : 'Attacking direction →'}</span></div>
    <svg viewBox={`-2 -2 ${w + 4} ${h + 4}`} role="img" aria-label={pl ? 'Mapa boiska i zdarzeń meczowych' : 'Pitch map of match events'} className="w-full">
      <defs><marker id={arrowId} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4" fill="#34d399" /></marker></defs>
      <rect width={w} height={h} fill="#12352d" rx="0.5" />
      {!showMarks && Array.from({ length: ANALYSIS_COLS * ANALYSIS_ROWS }, (_, i) => {
        const count = grid[i] ?? 0
        const completed = data.maps.completedThrows[i] ?? 0
        const rate = count ? completed / count : 0
        const accuracy = layer === 'accuracy'
        const title = accuracy ? `${completed}/${count} · ${pct(completed, count)}` : `${count} ${pl ? 'zdarzeń' : 'events'}`
        return <g key={i}><rect x={i % ANALYSIS_COLS * cw} y={Math.floor(i / ANALYSIS_COLS) * ch} width={cw} height={ch}
          fill={accuracy ? `hsl(${rate * 140} 65% 48%)` : '#34d399'} fillOpacity={count ? accuracy ? 0.7 : 0.12 + 0.78 * count / maximum : 0}
          stroke="#ffffff" strokeOpacity="0.12" strokeWidth="0.12"><title>{title}</title></rect>
          {count > 0 && <text x={i % ANALYSIS_COLS * cw + cw / 2} y={Math.floor(i / ANALYSIS_COLS) * ch + ch / 2} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="1.8" pointerEvents="none">{accuracy ? `${Math.round(rate * 100)}%` : count}</text>}
        </g>
      })}
      <g stroke="white" strokeOpacity="0.7" strokeWidth="0.22" fill="none" pointerEvents="none"><rect width={w} height={h} /><path d={`M${ez},0 V${h} M${w - ez},0 V${h} M${w / 2},0 V${h}`} /></g>
      {showMarks && visible.map((m, i) => <g key={i}>
        {m.from && <line x1={m.from.x} y1={m.from.y} x2={m.x} y2={m.y} stroke="#34d399" strokeOpacity="0.65" strokeWidth="0.35" markerEnd={`url(#${arrowId})`} />}
        <circle cx={m.x} cy={m.y} r="0.85" fill={color[m.kind]} stroke="#0f172a" strokeWidth="0.25" tabIndex="0">
          <title>{kindName[m.kind]} · {names[m.playerId]?.name ?? '—'}{m.throwerId ? ` ← ${names[m.throwerId]?.name ?? m.throwerId}` : m.receiverId ? ` → ${names[m.receiverId]?.name ?? m.receiverId}` : ''} · {m.x}, {m.y} m</title>
        </circle>
      </g>)}
    </svg>
    <p className="mt-2 text-xs text-ufa-muted">{amount === 0 ? (pl ? 'Brak zarejestrowanych zdarzeń dla tego filtra.' : 'No recorded events for this filter.') : layer === 'accuracy' ? (pl ? 'Kolor: celność. Wskaż sektor, aby zobaczyć liczbę prób.' : 'Color: completion rate. Hover over a zone for attempts.') : showMarks ? layer === 'losses' ? (pl ? 'Czerwony: blok · żółty: drop · fioletowy: pozostałe straty' : 'Red: block · yellow: drop · purple: other turnovers') : (pl ? 'Kropka: gol. Strzałka: ostatnie podanie. Wskaż kropkę, aby zobaczyć zawodników.' : 'Dot: goal. Arrow: final pass. Hover over a dot to see the players.') : (pl ? 'Jaśniejszy sektor = więcej zdarzeń. Wskaż sektor, aby zobaczyć szczegóły.' : 'Brighter zones = more events. Hover over a zone for details.')}</p>
  </div>
}

export default function ScoutingAnalysisPanel({ report = null, side = 'home', total = null, title, subtitle }) {
  const { lang } = useUiLang()
  const pl = lang === 'pl'
  const [role, setRole] = useState('all')
  const [playerId, setPlayerId] = useState('')
  const [layer, setLayer] = useState('throws')
  const [lossKind, setLossKind] = useState('losses')
  const [scale, setScale] = useState('total')
  const aggregate = !!total
  const source = total ?? report?.[side]
  const selected = source?.players?.[playerId]
  const entity = selected ?? source
  const data = entity?.[role]
  const enough = aggregate ? total.games > 0 : report?.hasEvents
  const heading = title ?? (pl ? 'Analiza ostatniego meczu' : 'Last match analysis')
  const labels = {
    goals: pl ? 'Gole' : 'Goals', assists: pl ? 'Asysty' : 'Assists', blocks: pl ? 'Bloki' : 'Blocks', turnovers: pl ? 'Straty' : 'Turnovers',
    drops: pl ? 'Dropy' : 'Drops', attempts: pl ? 'Próby podań' : 'Pass attempts', completions: pl ? 'Celne podania' : 'Completions', catches: pl ? 'Chwyty' : 'Catches',
    throwMeters: pl ? 'Metry z podań' : 'Throw meters', catchMeters: pl ? 'Metry z chwytów' : 'Catch meters', pointsPlayed: pl ? 'Rozegrane punkty' : 'Points played',
  }
  const divisor = scale === 'game' ? (entity?.games || 1) : scale === 'points' ? (data?.pointsPlayed ? data.pointsPlayed / 10 : null) : 1
  const number = value => divisor == null ? '—' : (value / divisor).toLocaleString(pl ? 'pl-PL' : 'en-US', { maximumFractionDigits: scale === 'total' ? 0 : 1 })
  const maps = { throws: pl ? 'Heatmapa rzutów' : 'Throw heatmap', catches: pl ? 'Heatmapa chwytów' : 'Catch heatmap', losses: pl ? 'Mapa strat' : 'Turnover map', goals: pl ? 'Mapa punktów' : 'Scoring map', accuracy: pl ? 'Celność według strefy' : 'Completion by zone' }
  const marks = (report?.marks ?? []).filter(m => m.side === side && (role === 'all' || m.role === role) && (!selected || String(m.playerId) === playerId || (m.kind === 'goals' && String(m.throwerId) === playerId)))
  return <details className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20" open>
    <summary className="cursor-pointer font-semibold text-ufa-text">{heading}</summary>
    {subtitle && <p className="mt-2 text-sm text-ufa-muted">{subtitle}</p>}
    {!enough || !data ? <p className="mt-3 text-sm text-ufa-muted">{pl ? 'Brak danych analitycznych. Raport będzie dostępny po kolejnym rozegranym meczu. Starsze mecze i walkowery nie zawierają map.' : 'No analysis data. A report will be available after the next played match. Older matches and forfeits do not contain maps.'}</p> : <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-ufa-muted">{pl ? 'Linia' : 'Line'}<select className={`${control} ml-2`} value={role} onChange={e => setRole(e.target.value)}><option value="all">{pl ? 'Całość' : 'All'}</option><option value="offense">O-line</option><option value="defense">D-line</option></select></label>
        <label className="text-xs text-ufa-muted">{pl ? 'Zawodnik' : 'Player'}<select className={`${control} ml-2 max-w-full`} value={selected ? playerId : ''} onChange={e => setPlayerId(e.target.value)}><option value="">{pl ? 'Cała drużyna' : 'Whole team'}</option>{Object.entries(source.players).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}</select></label>
      </div>
      <p className="text-xs text-ufa-muted">{pl ? 'O-line / D-line oznacza rolę na początku punktu, także po zmianie posiadania.' : 'O-line / D-line is the role at point start, including actions after possession changes.'} {aggregate && (pl ? `Zebrane mecze: ${source.games}. Dane od włączenia analizy, łącznie z poprzednimi sezonami.` : `Matches collected: ${source.games}. Since analysis was enabled, including previous seasons.`)}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={pl ? 'Warstwa mapy' : 'Map layer'}>{Object.entries(maps).map(([key, name]) => <button type="button" key={key} onClick={() => setLayer(key)} aria-pressed={layer === key} className={control} style={layer === key ? { borderColor: '#34d399', color: '#a7f3d0', backgroundColor: '#12352d' } : undefined}>{name}</button>)}</div>
      {layer === 'losses' && <label className="text-xs text-ufa-muted">{pl ? 'Rodzaj straty' : 'Turnover type'}<select className={`${control} ml-2`} value={lossKind} onChange={e => setLossKind(e.target.value)}><option value="losses">{pl ? 'Wszystkie' : 'All'}</option><option value="blocks">{pl ? 'Zablokowane podania' : 'Blocked passes'}</option><option value="drops">{pl ? 'Dropy' : 'Drops'}</option><option value="otherLosses">{pl ? 'Pozostałe' : 'Other'}</option></select></label>}
      <Pitch data={data} marks={marks} layer={layer} lossKind={lossKind} aggregate={aggregate} pl={pl} names={source.players} />
      {(report?.spatialModel === 'simplified' || total?.simplifiedGames > 0) && <p className="text-xs text-ufa-muted">{pl ? 'Mapy szybkiej symulacji bazują na uproszczonych pozycjach silnika, bez pełnego odtwarzania ruchu.' : 'Fast-simulation maps use simplified engine positions, without full movement playback.'}</p>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[[pl ? 'Celność podań' : 'Completion', data.completions, data.attempts], [pl ? 'Długie rzuty' : 'Hucks', data.huckCompletions, data.huckAttempts], [pl ? 'Pod presją (stall ≥ 4)' : 'Under pressure (stall ≥ 4)', data.pressureCompletions, data.pressureAttempts], ...(!selected ? role === 'all' ? [['Hold%', source.offense.pointsWon, source.offense.pointsPlayed], ['Break%', source.defense.pointsWon, source.defense.pointsPlayed]] : [[role === 'offense' ? 'Hold%' : 'Break%', data.pointsWon, data.pointsPlayed]] : [])].map(([label, a, b]) => <div key={label} className="rounded-lg bg-ufa-bg p-3"><p className="text-xs text-ufa-muted">{label}</p><p className="text-lg font-semibold text-ufa-text">{pct(a, b)}</p><p className="text-xs text-ufa-muted">{a}/{b}</p></div>)}
      </div>
      <label className="text-xs text-ufa-muted">{pl ? 'Wartości w tabeli' : 'Table values'}<select className={`${control} ml-2`} value={scale} onChange={e => setScale(e.target.value)}><option value="total">{pl ? 'Suma' : 'Totals'}</option>{aggregate && <option value="game">{pl ? 'Na mecz' : 'Per game'}</option>}<option value="points">{pl ? 'Na 10 rozegranych punktów' : 'Per 10 points played'}</option></select></label>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">{Object.entries(labels).map(([key, label]) => <div key={key} className="flex justify-between gap-2 border-b border-ufa-border py-2 text-sm"><span className="text-ufa-muted">{label}</span><span className="font-semibold text-ufa-text">{number(data[key])}</span></div>)}</div>
      {!selected && <p className="text-sm text-ufa-muted">{pl ? 'Punkty wygrane / przegrane' : 'Points won / lost'}: {number(data.pointsWon)} / {number(data.pointsLost)}</p>}
    </div>}
  </details>
}
