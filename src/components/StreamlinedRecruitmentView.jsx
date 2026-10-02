import { useMemo, useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { buildSquadPlan, playerSquadProfile } from '../career/clubManagement.js'
import { recruitmentCandidates, startRecruitment } from '../career/streamlinedRecruitment.js'
import { academyMilestone } from '../career/streamlinedStories.js'
import { clubBudgetAllocation } from '../career/clubEconomy.js'
import { academyRecruitmentCost, promoteAcademyPlayer, signAcademyCandidate } from '../career/academy.js'
import { mergeInbox } from '../career/inbox.js'
import { formatUsd } from '../career/transfers/moneyFormat.js'
import { buildContract, weeklyWageFromOvr } from '../career/transfers/playerContracts.js'
import { clubFinancialMarket } from '../career/financialMarkets.js'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers.js'
import SquadRoleSelect from './SquadRoleSelect.jsx'

export default function StreamlinedRecruitmentView({ career, onCareerUpdate, children, academyOnly = false }) {
  const { lang } = useUiLang(), en = lang === 'en'
  const team = career.world.teamsById[career.playerTeamId], plan = buildSquadPlan(team)
  const money = clubBudgetAllocation(team)
  const [need, setNeed] = useState(() => Object.entries(plan.needs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'handler')
  const [maxFee, setFee] = useState(Math.max(0, Math.round(money.transferBudget * .25)))
  const [maxWage, setWage] = useState(Math.max(50, Math.round(money.transferBudget / 156)))
  const [years, setYears] = useState(2), [role, setRole] = useState('rotation'), [delegate, setDelegate] = useState(false)
  const [full, setFull] = useState(false), [flash, setFlash] = useState('')
  const candidates = useMemo(() => academyOnly || full ? [] : recruitmentCandidates(career, { need, maxFee, maxWage, years }), [career, need, maxFee, maxWage, years, academyOnly, full])
  const field = 'rounded border border-ufa-border bg-ufa-bg p-2'
  function recruit(row) {
    const result = startRecruitment(career, row, { maxFee, maxWage, years, role, delegated: delegate })
    if (!result.ok) return setFlash(result.error)
    onCareerUpdate({ world: result.world ?? career.world, transferLog: result.transferLog ?? career.transferLog, ...(result.message ? { inbox: mergeInbox(career, [result.message]) } : {}) })
    setFlash(en ? 'Offer submitted. Follow the response in your inbox.' : 'Oferta złożona. Odpowiedź znajdziesz w skrzynce.')
  }
  function academyAction(p, candidate) {
    const result = candidate ? signAcademyCandidate(team, p.id, { world: career.world, seasonYear: career.seasonYear }) : promoteAcademyPlayer(team, p.id, { league: career.league })
    if (!result.ok) return setFlash(result.error)
    onCareerUpdate({ world: career.world })
    setFlash(en ? 'Squad updated.' : 'Zaktualizowano kadrę.')
  }
  const needLabels = { handler: ['Handler', 'Handler'], cutter: ['Cutter', 'Cutter'], offense: ['Atak', 'Offense'], defense: ['Obrona', 'Defense'] }
  const prospects = [...(team.academyPlayers ?? [])].sort((a, b) => getOverallRating(b.skills) - getOverallRating(a.skills)).slice(0, 3)
  const intake = [...(team.academyCandidates ?? [])].sort((a, b) => getOverallRating(b.skills) - getOverallRating(a.skills)).slice(0, 3)
  function academyQuote(p, candidate) {
    const upkeep = Math.round(80 * clubFinancialMarket(team).prices)
    const contract = buildContract(p, { weeklyWage: Math.round(weeklyWageFromOvr(getOverallRating(p.skills), team) * .85), years: 1, signedDate: career.league.currentDate })
    const now = candidate ? academyRecruitmentCost(p) : 0
    const weekly = candidate ? upkeep : contract.weeklyWage - upkeep
    const reserve = candidate ? (team.streamlinedClub.economyActive ? upkeep * 8 : 0) : contract.weeklyWage * Math.min(contract.weeksTotal, money.weeks)
    return `${en ? 'Now / weekly change / remaining' : 'Teraz / zmiana tygodniowo / zostanie'}: ${formatUsd(now)} / ${formatUsd(weekly)} / ${formatUsd(money.transferBudget - now - reserve)}${candidate ? '' : en ? ' · First contract: 1 year, reserve role.' : ' · Pierwsza umowa: 1 rok, rola rezerwowego.'}`
  }
  return <div className="space-y-4">
    <section className="um-section space-y-3"><h2 className="text-2xl font-semibold">{en ? 'Squad planning & recruitment' : 'Plan kadry i rekrutacja'}</h2>
      <p>{en ? 'Missing depth' : 'Braki w kadrze'}: {Object.entries(plan.needs).map(([key, count]) => `${needLabels[key][en ? 1 : 0]}: ${count}`).join(' · ')}</p>
      <p className="text-sm text-ufa-muted">{en ? 'Available after reserves' : 'Dostępne po rezerwie'}: {formatUsd(Math.max(0, money.transferBudget))}</p>
      <button className="um-button" onClick={() => setFull(!full)}>{full ? (en ? 'Back to recommendations' : 'Wróć do rekomendacji') : academyOnly ? (en ? 'All juniors & ongoing scouting' : 'Wszyscy juniorzy i trwający scouting') : (en ? 'Browse the full market' : 'Przeglądaj cały rynek')}</button>
    </section>
    {flash && <p role="status" className="rounded border border-ufa-gold p-3">{flash}</p>}
    {full ? children : <>
      {!academyOnly && <section className="um-section space-y-4">
        <div className="grid gap-3 sm:grid-cols-4"><label>{en ? 'Need' : 'Potrzeba'}<select className={`${field} w-full`} value={need} onChange={e => setNeed(e.target.value)}>{Object.entries(needLabels).map(([id, labels]) => <option key={id} value={id}>{labels[en ? 1 : 0]}</option>)}</select></label>
          <label>{en ? 'Maximum fee' : 'Maksymalna kwota'}<input className={`${field} w-full`} type="number" min="0" value={maxFee} onChange={e => setFee(Number(e.target.value))} /></label>
          <label>{en ? 'Weekly wage limit' : 'Limit pensji / tydzień'}<input className={`${field} w-full`} type="number" min="50" value={maxWage} onChange={e => setWage(Number(e.target.value))} /></label>
          <label>{en ? 'Years' : 'Lata'}<select className={`${field} w-full`} value={years} onChange={e => setYears(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>
        </div>
        <SquadRoleSelect value={role} onChange={setRole} lang={lang} />
        <label className="block"><input type="checkbox" checked={delegate} onChange={e => setDelegate(e.target.checked)} /> {en ? 'Delegate this player’s negotiation within these limits' : 'Deleguj negocjacje wybranego zawodnika w tych limitach'}</label>
        <p className="text-xs text-ufa-muted">{en ? 'Offers use your wage limit. Higher fees, wages or longer contracts return to you. Registration outside the transfer window still needs confirmation.' : 'Oferta wykorzysta ustawiony limit pensji. Wyższa kwota, pensja lub dłuższy kontrakt wrócą do Ciebie. Rejestracja po otwarciu okna nadal wymaga potwierdzenia.'}</p>
        {!candidates.length && <p>{en ? 'No affordable candidates for these limits. Change the need or budget.' : 'Brak kandydatów mieszczących się w tych limitach i rezerwie klubu. Zmień potrzebę lub budżet.'}</p>}
        <div className="grid gap-3 lg:grid-cols-2">{candidates.map(row => <article key={row.playerId} className="space-y-2 rounded border border-ufa-border p-4"><h3 className="font-semibold">{row.name} · {row.age}</h3><p>{needLabels[need][en ? 1 : 0]} · {row.freeAgent ? (en ? 'Free agent' : 'Wolny zawodnik') : row.teamName}</p><p className="text-sm">{en ? 'Fee now' : 'Kwota teraz'}: {formatUsd(row.askPrice)} · {en ? 'Wage demand' : 'Oczekiwana pensja'}: {formatUsd(row.demands.minWeeklyWage)}/{en ? 'wk' : 'tydz.'}</p><p className="text-sm">{en ? 'Contract at your wage limit + fee' : 'Kontrakt przy Twoim limicie pensji + transfer'}: {formatUsd(row.totalCost)}</p><p className="text-xs">{en ? "Offered weekly wage / remaining after reserve" : "Oferowana pensja tygodniowo / zostanie po rezerwie"}: {formatUsd(row.offeredWage)} / {formatUsd(money.transferBudget - row.askPrice - row.offeredWage * Math.min(row.weeks, money.weeks))}</p><p className="text-xs text-ufa-muted">{row.age >= 30 ? (en ? 'Experience now; a shorter development horizon.' : 'Doświadczenie od zaraz; krótsza perspektywa rozwoju.') : row.age <= 22 ? (en ? 'Development prospect; needs match opportunities.' : 'Perspektywa rozwoju; potrzebuje okazji do gry.') : (en ? 'Immediate squad depth; ongoing wage commitment.' : 'Wzmocnienie kadry od zaraz; stałe obciążenie płac.')}</p><button className="um-button" onClick={() => recruit(row)}>{en ? 'Make offer' : 'Złóż ofertę'}</button></article>)}</div>
      </section>}
      <section className="um-section space-y-3"><h3 className="text-xl font-semibold">{en ? 'Academy → senior squad' : 'Akademia → pierwsza drużyna'}</h3><p className="text-sm text-ufa-muted">{en ? 'Intakes: 1 September and 1 March. Up to three recommendations; the complete academy remains available above.' : 'Nabory: 1 września i 1 marca. Do trzech rekomendacji; pełna akademia pozostaje dostępna w zakładce Akademia.'}</p>
        {[...prospects.map(p => ({ p, candidate: false })), ...intake.map(p => ({ p, candidate: true }))].map(({ p, candidate }) => <article key={p.id} className="rounded border border-ufa-border p-3"><strong>{getPlayerFullName(p)} · {p.age} · {playerSquadProfile(p).role}</strong><p className="text-sm">{candidate ? (en ? 'Intake candidate' : 'Kandydat z naboru') : academyMilestone(p, team.id)[en ? 1 : 0]}</p>{candidate && <p>{en ? 'Cost now' : 'Koszt teraz'}: {formatUsd(academyRecruitmentCost(p))} · {en ? 'expires' : 'do'} {p.offerExpires}</p>}<p className="my-2 text-xs text-ufa-muted">{academyQuote(p, candidate)}</p><button className="um-button mt-2" onClick={() => academyAction(p, candidate)}>{candidate ? (en ? 'Recruit to academy' : 'Przyjmij do akademii') : (en ? 'Promote to seniors' : 'Awansuj do seniorów')}</button></article>)}
        {(team.players ?? []).filter(p => p.academyJoinedSeason != null).map(p => <p key={p.id} className="text-sm">{getPlayerFullName(p)} → {academyMilestone(p, team.id)[en ? 1 : 0]}</p>)}
        {!prospects.length && !intake.length && <p>{en ? 'No academy recommendations today.' : 'Brak rekomendacji z akademii na dziś.'}</p>}
      </section>
    </>}
  </div>
}
