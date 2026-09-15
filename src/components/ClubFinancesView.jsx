import ClubFinanceSummary from './ClubFinanceSummary.jsx'
import PlayerContractsPanel from './PlayerContractsPanel.jsx'
import { clubFinanceForecast } from '../career/clubEconomy.js'
import { ensureClubManagement } from '../career/clubManagement.js'
import { formatUsd } from '../career/transfers/moneyFormat.js'
import { clubFinancialMarket } from '../career/financialMarkets.js'
import { clubMonthlyTvIncome } from '../career/economyBalance.js'
import { ACADEMY_COUNTRIES } from '../data/academyScoutGeography.js'

export default function ClubFinancesView({ team, world, league, seasonYear, currentDate, lang, onChange }) {
  const en = lang === 'en'
  ensureClubManagement(team, seasonYear)
  const f = clubFinanceForecast(team, { league, currentDate, world })
  const market = clubFinancialMarket(team)
  const country = ACADEMY_COUNTRIES[market.countryId]
  const cells = [[en ? 'Weekly operating costs' : 'Utrzymanie klubu / tydzień', f.weeklyOperations]]
  return <div className='um-section space-y-5 league-fade-in'>
    <h2 className='text-2xl font-semibold text-ufa-text'>{en ? 'Club finances' : 'Finanse klubu'}</h2>
    {market.domestic && <div className="rounded-sm bg-ufa-bg/60 p-3 text-xs space-y-1">
      <h3 className="font-semibold">{en ? 'Local financial market' : 'Lokalny rynek finansowy'}: {country?.[en ? 'labelEn' : 'labelPl'] ?? team.country ?? '—'} · {en ? 'Division' : 'Dywizja'} {market.tier}</h3>
      <p>{en ? 'Monthly TV rights' : 'Prawa TV / miesiąc'}: {formatUsd(clubMonthlyTvIncome(team))}</p>
      <p className="text-ufa-muted">{en ? 'Country and division affect transfer funding, sponsor offers, new wages and match income. Promotion and relegation change future funding; signed contracts remain binding.' : 'Kraj i dywizja wpływają na środki transferowe, oferty sponsorów, nowe płace i wpływy z meczów. Awans i spadek zmieniają przyszłe finansowanie; podpisane umowy pozostają ważne.'}</p>
    </div>}
    <ClubFinanceSummary team={team} lang={lang} onChange={onChange} />
    <div className="grid gap-3 sm:grid-cols-2">
      {cells.map(([label, value]) => <div key={label} className="rounded-sm bg-ufa-bg/60 p-3">
        <p className="text-xs text-ufa-muted">{label}</p>
        <p className="font-semibold tabular-nums">{typeof value === 'number' ? formatUsd(value) : value}</p>
      </div>)}
    </div>
    <div>
      <h4 className="text-sm font-semibold">{en ? '12-month cash forecast' : 'Prognoza gotówki na 12 miesięcy'}</h4>
      <p className="my-1 text-xs text-ufa-muted">{en ? 'Current wages, operating costs, owner funding, TV and sponsors. Transfers, prizes and unconfirmed future cup rounds excluded.' : 'Aktualne pensje, utrzymanie, właściciel, TV i sponsorzy. Bez transferów, nagród i niepotwierdzonych kolejnych rund pucharowych.'}</p>
      <p className="my-1 text-xs text-ufa-muted">{f.matchForecast ? (en ? `Confirmed upcoming matches: ${f.matchForecast.counts.home} home, ${f.matchForecast.counts.away} away, ${f.matchForecast.counts.neutral} neutral (${f.matchForecast.counts.cup} cup matches). Match income follows fixture dates. Next season's fixtures are included once scheduled.` : `Potwierdzone nadchodzące mecze: ${f.matchForecast.counts.home} u siebie, ${f.matchForecast.counts.away} na wyjeździe, ${f.matchForecast.counts.neutral} na neutralnym boisku (w tym ${f.matchForecast.counts.cup} pucharowych). Przychody przypisano do terminów spotkań. Mecze kolejnego sezonu uwzględnimy po utworzeniu terminarza.`) : (en ? 'No fixture schedule supplied: standard estimate of 15 home and 15 away games.' : 'Brak terminarza: standardowy szacunek 15 meczów domowych i 15 wyjazdowych.')}</p>
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
