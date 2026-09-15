import WorldScopeSettings from './WorldScopeSettings.jsx'
import { useState } from 'react'
import { standingsTable } from '../league/standings.js'
import { ACADEMY_COUNTRIES } from '../data/academyScoutGeography.js'
import { DOMESTIC_LEAGUES, REGIONAL_LEAGUES } from '../data/domesticLeagues.js'
import { resolveTeamName } from '../ui/locale'

/** Off leagues deliberately never enter this view, including cup-only clubs. */
export default function DomesticLeaguesView({ career, lang = 'pl', onTeamClick, onTeamSelect, onScopeChange }) {
  const [countryFilter, setCountryFilter] = useState('all')
  const en = lang === 'en'
  const openTeam = onTeamClick ?? onTeamSelect
  const competitions = [career.league, ...(career.league?.otherLeagues ?? [])].filter(Boolean)
  const config = career.world?.worldConfig ?? career.worldConfig
  const visible = competitions.filter(comp => comp.mode !== 'off' && config?.leagues?.[comp.domesticLeagueId ?? comp.id] !== 'off')
  const metadata = comp => DOMESTIC_LEAGUES.find(l => l.id === (comp.domesticLeagueId ?? comp.id))
  const cid = comp => comp.countryId ?? metadata(comp)?.countryId
  const countryName = id => REGIONAL_LEAGUES[id]?.[en ? 'labelEn' : 'labelPl'] ?? ACADEMY_COUNTRIES[id]?.[en ? 'labelEn' : 'labelPl'] ?? id
  const countries = [...new Set(visible.map(cid).filter(Boolean))].sort((a, b) => countryName(a).localeCompare(countryName(b), lang))
  return <div className="space-y-6">
    <WorldScopeSettings career={career} lang={lang} onChange={onScopeChange} />
    <header><h2 className="um-page-title text-ufa-text">{en ? 'Domestic leagues' : 'Ligi krajowe'}</h2><p className="mt-2 text-sm text-ufa-muted">{en ? 'Active leagues allow transfers and changing clubs. Background leagues retain simplified results.' : 'Aktywne ligi umożliwiają transfery i zmianę klubu. Ligi tła zachowują uproszczone wyniki.'}</p></header>
    <label className="block max-w-sm text-sm text-ufa-text">{en ? 'Country' : 'Kraj'}<select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className="mt-2 w-full rounded border border-ufa-border bg-ufa-bg px-3 py-2"><option value="all">{en ? 'All countries' : 'Wszystkie kraje'}</option>{countries.map(id => <option key={id} value={id}>{countryName(id)}</option>)}</select></label>
    {visible.filter(comp => countryFilter === 'all' || cid(comp) === countryFilter).map((comp, i) => {
      const meta = metadata(comp)
      const rows = standingsTable(comp.standings ?? {}, id => resolveTeamName(career.world.teamsById[id], lang) || id)
      const mode = comp.mode ?? config?.leagues?.[comp.domesticLeagueId ?? comp.id] ?? 'playable'
      return <section key={comp.domesticLeagueId ?? comp.id ?? i} className="overflow-hidden rounded border border-ufa-border bg-ufa-panel">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ufa-border px-4 py-4"><h3 className="font-semibold text-ufa-text">{comp.name ?? meta?.name ?? comp.seasonLabel} · {countryName(cid(comp))}</h3><span className="text-xs text-ufa-muted">{mode === 'background' ? (en ? 'Background' : 'Tło') : mode === 'transfers' ? (en ? 'Transfers · simplified simulation' : 'Transfery · uproszczona symulacja') : (en ? 'Playable' : 'Grywalna')}</span></header>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-ufa-border text-xs text-ufa-muted">{['#', en ? 'Club' : 'Klub', en ? 'P' : 'M', 'W', 'L', 'PF', 'PA', '+/−'].map(label => <th key={label} scope="col" className="px-4 py-3 text-left font-normal">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.teamId} className={`border-b border-ufa-border/40 ${row.teamId === career.playerTeamId ? 'bg-ufa-accent/10' : ''}`}><td className="px-4 py-3 text-ufa-muted">{index + 1}</td><td className="px-4 py-3 font-medium text-ufa-text">{openTeam ? <button type="button" onClick={() => openTeam(row.teamId)} className="text-left hover:text-ufa-accent hover:underline">{row.teamName}</button> : row.teamName}</td>{[row.wins + row.losses, row.wins, row.losses, row.pointsFor, row.pointsAgainst, row.diff].map((value, n) => <td key={n} className="px-4 py-3 tabular-nums text-ufa-muted">{value}</td>)}</tr>)}</tbody></table></div>
      </section>
    })}
    {(countryFilter === 'all' || countryFilter === 'fr') && career.league.frenchPlayoffs && <section className="rounded border border-ufa-border bg-ufa-panel p-4">
      <h3 className="font-semibold text-ufa-text">{en ? 'France — promotion playoffs' : 'Francja — baraże o awans'}</h3>
      <p className="my-3 text-sm text-ufa-muted">{en ? 'Top three eligible clubs per region. Region winners enter the semifinals; two path winners are promoted. Reserve teams cannot be promoted to their first team’s level.' : 'Trzy najwyżej sklasyfikowane uprawnione kluby z każdego regionu. Liderzy zaczynają od półfinałów; zwycięzcy dwóch ścieżek awansują. Rezerwy nie mogą awansować na poziom pierwszego zespołu.'}</p>
      {career.league.frenchPlayoffs.status === 'awaiting-standings' && <p className="text-sm text-ufa-muted">{en ? 'Draw after the French leagues finish. Match dates: ' : 'Drabinka po zakończeniu lig francuskich. Terminy: '}{career.league.frenchPlayoffs.dates.join(' · ')}</p>}
      <div className="grid gap-4 md:grid-cols-2">{career.league.frenchPlayoffs.paths.map(path => <div key={path.name}><h4 className="font-semibold text-ufa-text">{path.name}</h4>{path.matchIds.map(id => {const f=career.league.fixtures.find(m=>m.id===id);return <p key={id} className="mt-2 text-sm text-ufa-muted">{f.date} · {({quarterfinal:en?'Quarterfinal':'Ćwierćfinał',semifinal:en?'Semifinal':'Półfinał',final:en?'Final':'Finał'})[f.round]}<br />{career.world.teamsById[f.homeTeamId]?.name ?? 'TBD'} — {career.world.teamsById[f.awayTeamId]?.name ?? 'TBD'}{f.status==='completed' ? ' · '+f.homeScore+':'+f.awayScore : ''}</p>})}</div>)}</div>
      {!!career.league.frenchPlayoffs.promotedTeamIds.length && <p className="mt-3 font-semibold text-ufa-accent">{en?'Promoted: ':'Awans: '}{career.league.frenchPlayoffs.promotedTeamIds.map(id=>career.world.teamsById[id]?.name).join(', ')}</p>}
    </section>}
    {!!career.world.domesticMovements?.filter(m=>m.type==='regional-reassignment').length && (countryFilter==='all'||countryFilter==='fr') && <section className="rounded border border-ufa-border p-4"><h3 className="font-semibold text-ufa-text">{en?'Regional reassignment for this season':'Zmiany grup regionalnych w tym sezonie'}</h3>{career.world.domesticMovements.filter(m=>m.type==='regional-reassignment').map(m=><p key={m.teamId} className="mt-2 text-sm text-ufa-muted">{career.world.teamsById[m.teamId]?.name} → {DOMESTIC_LEAGUES.find(l=>l.id===m.leagueId)?.name ?? m.leagueId}</p>)}</section>}
    {!visible.length && <p className="text-sm text-ufa-muted">{en ? 'No active domestic leagues.' : 'Brak aktywnych lig krajowych.'}</p>}
  </div>
}
