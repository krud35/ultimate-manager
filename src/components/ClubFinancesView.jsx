import ClubFinanceSummary from './ClubFinanceSummary.jsx'
import PlayerContractsPanel from './PlayerContractsPanel.jsx'
import { clubFinanceForecast } from '../career/clubEconomy.js'
import { ensureClubManagement } from '../career/clubManagement.js'
import { formatUsd } from '../career/transfers/moneyFormat.js'

export default function ClubFinancesView({ team, world, seasonYear, currentDate, lang, onChange }) {
  const en = lang === 'en'
  ensureClubManagement(team, seasonYear)
  const f = clubFinanceForecast(team)
  const cells = [[en ? 'Weekly operating costs' : 'Utrzymanie klubu / tydzień', f.weeklyOperations]]
  return <div className='um-section space-y-5 league-fade-in'>
    <h2 className='text-2xl font-semibold text-ufa-text'>{en ? 'Club finances' : 'Finanse klubu'}</h2>
    <ClubFinanceSummary team={team} lang={lang} onChange={onChange} />
    <div className="grid gap-3 sm:grid-cols-2">
      {cells.map(([label, value]) => <div key={label} className="rounded-sm bg-ufa-bg/60 p-3">
        <p className="text-xs text-ufa-muted">{label}</p>
        <p className="font-semibold tabular-nums">{typeof value === 'number' ? formatUsd(value) : value}</p>
      </div>)}
    </div>
    <div>
      <h4 className="text-sm font-semibold">{en ? '12-month cash forecast' : 'Prognoza gotówki na 12 miesięcy'}</h4>
      <p className="my-1 text-xs text-ufa-muted">{en ? 'Current wages, operating costs, owner funding, TV and sponsors; estimated net receipts from 15 home and 15 away games. Transfers and prizes excluded.' : 'Aktualne pensje, utrzymanie, właściciel, TV i sponsorzy oraz szacunek netto 15 meczów domowych i 15 wyjazdowych. Bez transferów i nagród.'}</p>
      <div className="overflow-x-auto"><table className="w-full text-xs tabular-nums"><thead><tr>{f.months.map(m => <th className="p-2" key={m.month}>+{m.month} {en ? 'mo.' : 'mies.'}</th>)}</tr></thead>
        <tbody><tr>{f.months.map(m => <td className={`p-2 whitespace-nowrap ${m.cash < 0 ? 'text-ufa-danger' : 'text-ufa-success'}`} key={m.month}>{formatUsd(m.cash)}</td>)}</tr></tbody>
      </table></div>
    </div>
    {team.facilities?.lastMatchFinance && <div className="rounded-sm bg-ufa-bg/60 p-3 text-xs">
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
    <details className="text-xs"><summary className="cursor-pointer">{en ? 'Recent cash transactions' : 'Ostatnie przepływy gotówki'}</summary>
      <ul className="mt-2 space-y-1">{team.finances.ledger.slice(-8).reverse().map((entry, i) => <li key={i} className="flex justify-between gap-2"><span>{entry.date ?? '—'} · {({ match_tickets: en ? 'Tickets' : 'Bilety', shirt_sales: en ? 'Shirts' : 'Koszulki', shirt_production: en ? 'Shirt production' : 'Koszt koszulek', merch_sales: 'Merch', merch_production: en ? 'Merch costs' : 'Koszt merchu', match_operations: en ? 'Match operations' : 'Organizacja meczu', match_travel: en ? 'Travel' : 'Wyjazd', random_event: en ? 'Event' : 'Wydarzenie', transfer_fee: en ? 'Transfer fee' : 'Opłata transferowa', sponsorship: en ? 'Sponsor' : 'Sponsor', tv: 'TV', facility_construction: en ? 'Construction' : 'Budowa', academy_recruitment: en ? 'Youth recruitment' : 'Nabór młodzieży', staff_recruitment: en ? 'Staff recruitment' : 'Zatrudnienie sztabu', wages: en ? 'Wages' : 'Pensje', club_operations: en ? 'Operations' : 'Utrzymanie', owner_funding: en ? 'Owner funding' : 'Wkład właściciela', debt_interest: en ? 'Interest' : 'Odsetki', emergency_grant: en ? 'Emergency grant' : 'Dotacja ratunkowa' })[entry.category] ?? (en ? 'Other cash flow' : 'Pozostały przepływ')}</span><span>{formatUsd(entry.amount)}</span></li>)}</ul>
    </details>
    <PlayerContractsPanel team={team} world={world} currentDate={currentDate} lang={lang} />
  </div>
}
