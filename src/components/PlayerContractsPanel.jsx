import { useState } from 'react'
import { clubContractOverview } from '../career/clubContractOverview.js'
import { CONTRACT_BONUS_DEFS, CONTRACT_PROMISE_DEFS } from '../career/transfers/playerContracts.js'
import { formatUsd } from '../career/transfers/moneyFormat.js'

export default function PlayerContractsPanel({ team, world, currentDate, lang }) {
  const en = lang === 'en'
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('end')
  const [filter, setFilter] = useState('all')
  const kindLabels = { senior: en ? 'First team' : 'Pierwsza drużyna', academy: en ? 'Academy' : 'Akademia', incoming: en ? 'Loan in' : 'Wypożyczony do klubu', outgoing: en ? 'Loan out' : 'Wypożyczony z klubu' }
  const all = clubContractOverview(team, world, currentDate)
  const name = p => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()
  const rows = all.filter(r => name(r.player).toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (filter === 'all' || r.kind === filter))
    .sort((a, b) => sort === 'wage' ? b.weeklyCost - a.weeklyCost : sort === 'name' ? name(a.player).localeCompare(name(b.player)) : (a.contract?.endDate ?? '9999').localeCompare(b.contract?.endDate ?? '9999'))
  const definition = (defs, type) => defs.find(d => d.id === type)?.[en ? 'labelEn' : 'labelPl'] ?? type
  const inputClass = 'rounded-sm border border-ufa-border bg-ufa-bg p-2 text-sm'
  return <section className="space-y-3">
    <h3 className="text-xl font-semibold">{en ? 'Player contracts' : 'Kontrakty zawodników'}</h3>
    <p className="text-sm text-ufa-muted">{en ? 'Weekly club commitment' : 'Tygodniowe zobowiązania klubu'}: {formatUsd(all.reduce((n, r) => n + r.weeklyCost, 0))}. {en ? 'Remaining base wages' : 'Pozostałe pensje podstawowe'}: {formatUsd(all.reduce((n, r) => n + r.remainingCost, 0))}.</p>
    <p className="text-xs text-ufa-muted">{en ? 'Includes academy contracts and both loan directions. Conditional bonuses are shown in details and excluded from base wage totals.' : 'Uwzględnia umowy akademii i wypożyczenia w obie strony. Premie warunkowe są w szczegółach i nie wchodzą do sumy pensji podstawowych.'}</p>
    <div className="flex flex-wrap gap-3">
      <input className={inputClass} aria-label={en ? 'Find player' : 'Znajdź zawodnika'} placeholder={en ? 'Find player…' : 'Znajdź zawodnika…'} value={query} onChange={e => setQuery(e.target.value)} />
      <select className={inputClass} aria-label={en ? 'Squad filter' : 'Filtr kadry'} value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">{en ? 'All players' : 'Wszyscy zawodnicy'}</option>
        {Object.entries(kindLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <select className={inputClass} aria-label={en ? 'Sort contracts' : 'Sortuj kontrakty'} value={sort} onChange={e => setSort(e.target.value)}>
        <option value="end">{en ? 'Expiry: earliest first' : 'Koniec umowy: najbliższe'}</option>
        <option value="wage">{en ? 'Club wage: highest first' : 'Pensja klubu: najwyższe'}</option>
        <option value="name">{en ? 'Name' : 'Imię i nazwisko'}</option>
      </select>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead><tr>{[en ? 'Player' : 'Zawodnik', en ? 'Squad' : 'Kadra', en ? 'Contract until' : 'Umowa do', en ? 'Wage / week' : 'Pensja / tydz.', en ? 'Club pays / week' : 'Klub płaci / tydz.', en ? 'Details' : 'Szczegóły'].map(h => <th key={h} scope="col" className="p-2 whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{rows.map(({ player: p, contract: c, kind, location, weeklyCost, remainingCost }) => <tr key={p.id} className="border-t border-ufa-border">
          <td className="p-2 font-semibold">{name(p)}</td><td className="p-2">{kindLabels[kind]}</td>
          <td className="p-2 whitespace-nowrap">{c?.endDate ?? '—'}{c && c.endDate && currentDate && c.endDate < currentDate && <span className="block text-ufa-danger">{en ? 'Expired' : 'Wygasła'}</span>}</td>
          <td className="p-2 tabular-nums whitespace-nowrap">{c ? formatUsd(c.weeklyWage) : '—'}</td><td className="p-2 tabular-nums whitespace-nowrap">{formatUsd(weeklyCost)}</td>
          <td className="p-2 min-w-52">{c ? <details><summary className="cursor-pointer text-ufa-accent">{en ? 'View contract' : 'Podgląd umowy'}</summary>
            <div className="space-y-1 py-2 text-xs">
              <p>{en ? 'Signed' : 'Podpisana'}: {c.signedDate ?? '—'}</p>
              <p>{en ? 'Weeks remaining' : 'Pozostało tygodni'}: {c.weeksRemaining ?? '—'}</p>
              <p>{en ? 'Remaining club wages' : 'Pozostałe pensje po stronie klubu'}: {formatUsd(remainingCost)}</p>
              {p.loan && <><p>{en ? 'Return date' : 'Powrót z wypożyczenia'}: {p.loan.returnDate ?? '—'}</p><p>{en ? 'Borrowing club wage share' : 'Udział klubu wypożyczającego w pensji'}: {p.loan.wageSplitPct ?? 50}%</p>{kind === 'outgoing' && <p>{en ? 'Current club' : 'Obecny klub'}: {location}</p>}</>}
              <p className="font-semibold">{en ? 'Bonuses' : 'Premie'}</p>
              {(c.bonuses ?? []).filter(Boolean).map((b, i) => <p key={i}>{definition(CONTRACT_BONUS_DEFS, b.type)}: {formatUsd(b.amount)}{b.target != null ? ` (${en ? 'target' : 'próg'}: ${b.target})` : ''}</p>)}
              {!(c.bonuses ?? []).some(Boolean) && <p>—</p>}
              <p className="font-semibold">{en ? 'Promises' : 'Obietnice'}</p>
              {(c.promises ?? []).filter(Boolean).map((promise, i) => <p key={i}>{definition(CONTRACT_PROMISE_DEFS, promise.type)}</p>)}
              {!(c.promises ?? []).some(Boolean) && <p>—</p>}
            </div>
          </details> : <span className="text-ufa-muted">{en ? 'No professional contract' : 'Brak kontraktu zawodowego'}</span>}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className="py-4 text-ufa-muted">{en ? 'No matching players.' : 'Brak pasujących zawodników.'}</p>}
    </div>
  </section>
}
