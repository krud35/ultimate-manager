import { CLUB_STRATEGY_DEFS } from '../career/clubObjectives.js'
import { formatUsd } from '../career/transfers/moneyFormat.js'

export default function ClubWelcomeMessage({ welcome, lang }) {
  const en = lang === 'en', f = welcome.funds
  const objectives = welcome.objectives[en ? 'en' : 'pl']
  const tiles = [
    [en ? 'Club cash' : 'Gotówka klubu', f.cash, en ? 'Total funds' : 'Wszystkie środki'],
    [en ? 'Transfer budget' : 'Budżet transferowy', f.transferBudget, en ? 'After reserving season wages' : 'Po wydzieleniu płac na sezon'],
    [en ? 'Weekly wage budget' : 'Budżet płacowy / tydzień', f.weeklyWageLimit, `${en ? 'Current wages' : 'Obecne pensje'}: ${formatUsd(f.weeklyWages)}`],
    [en ? 'Wage headroom / week' : 'Wolne środki na płace / tydzień', f.weeklyWageLimit - f.weeklyWages, `${f.weeks} ${en ? 'payroll weeks remaining' : 'tygodni wypłat do końca sezonu'}`],
  ]
  return <div className="mt-4 space-y-5">
    <div className="rounded-xl border border-ufa-accent/30 bg-ufa-accent/5 p-4">
      <p className="text-xs text-ufa-muted">{en ? 'Welcome to' : 'Witamy w'} {welcome.teamName}</p>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-ufa-accent">{en ? 'Club strategy' : 'Strategia klubu'}</p>
      <p className="mt-1 text-lg font-semibold text-ufa-text">{CLUB_STRATEGY_DEFS[welcome.strategy]?.[en ? 'en' : 'pl']}</p>
      <p className="mt-2 text-xs text-ufa-muted">{en ? 'Set by the board' : 'Ustalona przez zarząd'} · {en ? 'Board confidence' : 'Zaufanie zarządu'}: <span className="font-semibold text-ufa-text">{welcome.confidence}/100</span></p>
    </div>
    {welcome.currentData && <p className="text-xs text-ufa-muted">{en ? 'This archived message has no snapshot. The cards show current club data.' : 'Ta archiwalna wiadomość nie ma zapisanej migawki. Kafelki pokazują aktualne dane klubu.'}</p>}
    <section aria-label={en ? 'Board objectives' : 'Cele zarządu'}>
      <h4 className="mb-2 text-sm font-semibold text-ufa-text">{en ? 'Board objectives' : 'Cele zarządu'}</h4>
      <ul className="grid gap-2 sm:grid-cols-2">
        {objectives.map(o => <li key={o.id} className={`min-w-0 rounded-lg border p-3 ${o.priority === 1 ? 'border-ufa-gold/40 bg-ufa-gold/5 sm:col-span-2' : 'border-ufa-border bg-ufa-bg/40'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-ufa-muted">{o.label}</span><span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${o.priority === 1 ? 'bg-ufa-gold/15 text-ufa-gold' : 'bg-ufa-panel text-ufa-muted'}`}>{en ? 'Priority' : 'Priorytet'} {o.priority}</span></div>
          <p className="mt-2 text-base font-semibold text-ufa-text">{o.target}</p>
          <p className="mt-1 text-xs text-ufa-muted">{o.deadline}</p>
        </li>)}
      </ul>
    </section>
    <section aria-label={en ? 'Available funds' : 'Dostępne środki'}>
      <h4 className="mb-2 text-sm font-semibold text-ufa-text">{en ? 'Available funds' : 'Dostępne środki'}</h4>
      <dl className="grid gap-2 sm:grid-cols-2">{tiles.map(([label, value, note]) => <div key={label} className="min-w-0 rounded-lg border border-ufa-border bg-ufa-bg/40 p-3">
        <dt className="text-xs text-ufa-muted">{label}</dt><dd className={`mt-1 break-words text-xl font-semibold tabular-nums ${value < 0 ? 'text-red-400' : 'text-ufa-text'}`}>{formatUsd(value)}</dd>
        <dd className="mt-1 text-[11px] text-ufa-muted">{note}</dd>
      </div>)}</dl>
      <p className="mt-2 text-xs text-ufa-muted">{en ? 'Season wage allocation' : 'Płace wydzielone do końca sezonu'}: {formatUsd(f.seasonPayrollBudget)}</p>
    </section>
    <p className="border-t border-ufa-border pt-3 text-xs leading-relaxed text-ufa-muted">{en ? 'The board reviews your work monthly. Warnings and time to improve precede dismissal.' : 'Zarząd ocenia Twoją pracę co miesiąc. Przed zwolnieniem otrzymasz ostrzeżenia i czas na poprawę.'}</p>
  </div>
}
