import { CLUB_STRATEGY_DEFS, clubObjectives } from '../career/clubObjectives.js'
import ClubFinanceSummary from './ClubFinanceSummary.jsx'
import { clubFinanceForecast } from '../career/clubEconomy.js'
import { ensureClubManagement, buildSquadPlan, setClubStaff,
  STAFF_ROLES, STAFF_WEEKLY_COST } from '../career/clubManagement.js'
import { formatUsd } from '../career/transfers/moneyFormat.js'
import { useState } from 'react'

export default function ClubManagementPanel({ team, seasonYear, lang, onChange }) {
  const [error, setError] = useState(null)
  const en = lang === 'en'
  ensureClubManagement(team, seasonYear)
  const f = clubFinanceForecast(team)
  const plan = buildSquadPlan(team)
  const goal = team.boardObjective
  const roles = en ? { youthCoach: 'Youth coach', chiefScout: 'Chief scout', physio: 'Physiotherapist', sportingDirector: 'Sporting director' }
    : { youthCoach: 'Trener młodzieży', chiefScout: 'Główny skaut', physio: 'Fizjoterapeuta', sportingDirector: 'Dyrektor sportowy' }
  const cells = [
    [en ? 'Weekly operating costs' : 'Utrzymanie klubu / tydzień', f.weeklyOperations],
  ]
  return <section className="space-y-4 rounded-xl border border-ufa-border bg-ufa-panel p-5">
    <h3 className="font-semibold">{en ? 'Club plan and finances' : 'Plan klubu i finanse'}</h3>
      <div>
        <h4 className="text-lg font-semibold">{en ? 'Club strategy' : 'Strategia klubu'}: {CLUB_STRATEGY_DEFS[team.clubStrategy]?.[en ? 'en' : 'pl']}</h4>
        <p className="mt-1 text-xs text-ufa-muted">{en ? 'Set by the board.' : 'Ustalona przez zarząd.'}</p>
        <p className="my-3 text-lg font-semibold">{en ? 'Board confidence' : 'Zaufanie zarządu'}: {goal.confidence}/100</p>
        <h4 className="text-base font-semibold">{en ? 'Objectives and priorities' : 'Cele i priorytety'}</h4>
        <ol className="mt-2 space-y-2">{clubObjectives(team,lang).map(o=><li key={o.id} className="rounded-lg border border-ufa-border bg-ufa-bg/60 p-3"><span className="text-xs font-bold text-ufa-gold">{en ? 'Priority' : 'Priorytet'} {o.priority}</span><p className="font-semibold">{o.label}: {o.target}</p><p className="text-xs text-ufa-muted">{o.deadline}</p></li>)}</ol>
        <p className="mt-2 text-xs">{en ? 'Squad / target' : 'Kadra / cel'}: {team.players.length}/{plan.target}. {en ? 'Missing handlers / cutters / O-line / D-line' : 'Braki: handlerzy / cutterzy / O-line / D-line'}: {plan.needs.handler} / {plan.needs.cutter} / {plan.needs.offense} / {plan.needs.defense}.</p>
      </div>
    <ClubFinanceSummary team={team} lang={lang} onChange={onChange} />
    <div className="grid gap-3 sm:grid-cols-2">
      {cells.map(([label, value]) => <div key={label} className="rounded-lg bg-ufa-bg/60 p-3">
        <p className="text-xs text-ufa-muted">{label}</p>
        <p className="font-semibold tabular-nums">{typeof value === 'number' ? formatUsd(value) : value}</p>
      </div>)}
    </div>
    <div>
      <h4 className="text-sm font-semibold">{en ? '12-month cash forecast' : 'Prognoza gotówki na 12 miesięcy'}</h4>
      <p className="my-1 text-xs text-ufa-muted">{en ? 'Current wages, operating costs, owner funding, TV and sponsors; estimated net receipts from 15 home and 15 away games. Transfers and prizes excluded.' : 'Aktualne pensje, utrzymanie, właściciel, TV i sponsorzy oraz szacunek netto 15 meczów domowych i 15 wyjazdowych. Bez transferów i nagród.'}</p>
      <div className="overflow-x-auto"><table className="w-full text-xs tabular-nums"><thead><tr>{f.months.map(m => <th className="p-2" key={m.month}>+{m.month} {en ? 'mo.' : 'mies.'}</th>)}</tr></thead>
        <tbody><tr>{f.months.map(m => <td className={`p-2 whitespace-nowrap ${m.cash < 0 ? 'text-red-400' : 'text-emerald-400'}`} key={m.month}>{formatUsd(m.cash)}</td>)}</tr></tbody>
      </table></div>
    </div>
    {team.facilities?.lastMatchFinance && <div className="rounded-lg bg-ufa-bg/60 p-3 text-xs">
      <h4 className="mb-2 font-semibold">{en ? 'Last match settlement' : 'Rozliczenie ostatniego meczu'}</h4>
      <div className="grid gap-2 sm:grid-cols-3">
        <span>{en ? 'Attendance' : 'Frekwencja'}: {team.facilities.lastMatchFinance.attendance}</span>
        <span>{en ? 'Tickets' : 'Bilety'}: {formatUsd(team.facilities.lastMatchFinance.tickets)}</span>
        <span>{en ? 'Shirt sales' : 'Sprzedaż koszulek'}: {formatUsd(team.facilities.lastMatchFinance.shirts)}</span>
        <span>Merch: {formatUsd(team.facilities.lastMatchFinance.merch)}</span>
        <span>{en ? 'Production / event / travel costs' : 'Koszty towarów, organizacji i podróży'}: {formatUsd(team.facilities.lastMatchFinance.shirtCosts + team.facilities.lastMatchFinance.merchCosts + team.facilities.lastMatchFinance.matchCosts + team.facilities.lastMatchFinance.travel)}</span>
        <strong>{en ? 'Net result' : 'Wynik netto'}: {formatUsd(team.facilities.lastMatchFinance.net)}</strong>
      </div>
    </div>}
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h4 className="font-semibold text-sm mb-2">{en ? 'Staff' : 'Sztab'}</h4>
        {STAFF_ROLES.map(role => <label key={role} className="flex justify-between items-center gap-2 my-2 text-xs">
          <span>{roles[role]}</span>
          <select aria-label={roles[role]} className="rounded bg-ufa-bg border border-ufa-border p-1" value={team.staff[role]}
            onChange={e => { const result = setClubStaff(team, role, Number(e.target.value)); setError(result.ok ? null : (en ? 'Insufficient available funds.' : 'Brak dostępnych środków.')); if (result.ok) onChange() }}>
            {[0, 1, 2, 3].map(level => <option key={level} value={level}>{level === 0 ? (en ? 'Vacant' : 'Wakat') : `${en ? 'Level' : 'Poziom'} ${level}`} · {formatUsd(STAFF_WEEKLY_COST[level])}/{en ? 'wk' : 'tydz.'}</option>)}
          </select>
        </label>)}
        <p className="text-xs text-ufa-muted">{en ? 'Upgrading staff costs four weeks of salary. Youth coach improves development; scout adds reach and lowers mission costs; physio improves recovery; director improves training.' : 'Zatrudnienie lepszego specjalisty kosztuje cztery tygodnie pensji. Trener rozwija juniorów; skaut zwiększa zasięg i obniża koszty misji; fizjo poprawia regenerację; dyrektor wspiera trening.'}</p>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
    </div>
    <details className="text-xs"><summary className="cursor-pointer">{en ? 'Recent cash transactions' : 'Ostatnie przepływy gotówki'}</summary>
      <ul className="mt-2 space-y-1">{team.finances.ledger.slice(-8).reverse().map((entry, i) => <li key={i} className="flex justify-between gap-2"><span>{entry.date ?? '—'} · {({ match_tickets: en ? 'Tickets' : 'Bilety', shirt_sales: en ? 'Shirts' : 'Koszulki', shirt_production: en ? 'Shirt production' : 'Koszt koszulek', merch_sales: 'Merch', merch_production: en ? 'Merch costs' : 'Koszt merchu', match_operations: en ? 'Match operations' : 'Organizacja meczu', match_travel: en ? 'Travel' : 'Wyjazd', random_event: en ? 'Event' : 'Wydarzenie', transfer_fee: en ? 'Transfer fee' : 'Opłata transferowa', sponsorship: en ? 'Sponsor' : 'Sponsor', tv: 'TV', facility_construction: en ? 'Construction' : 'Budowa', academy_recruitment: en ? 'Youth recruitment' : 'Nabór młodzieży', staff_recruitment: en ? 'Staff recruitment' : 'Zatrudnienie sztabu', wages: en ? 'Wages' : 'Pensje', club_operations: en ? 'Operations' : 'Utrzymanie', owner_funding: en ? 'Owner funding' : 'Wkład właściciela', debt_interest: en ? 'Interest' : 'Odsetki', emergency_grant: en ? 'Emergency grant' : 'Dotacja ratunkowa' })[entry.category] ?? (en ? 'Other cash flow' : 'Pozostały przepływ')}</span><span>{formatUsd(entry.amount)}</span></li>)}</ul>
    </details>
  </section>
}
