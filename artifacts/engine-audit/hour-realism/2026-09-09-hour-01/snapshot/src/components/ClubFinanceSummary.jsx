import { useEffect, useId, useRef, useState } from 'react'
import { clubBudgetAllocation, adjustClubBudget, budgetAdjustmentStatus, contractualWeeklyBill, BUDGET_ADJUSTMENT_DAYS } from '../career/clubEconomy.js'
import { formatUsd, getMoneyCurrency } from '../career/transfers/moneyFormat.js'

export default function ClubFinanceSummary({ team, lang, onChange }) {
  const sliderId = useId()
  const titleId = useId()
  const dialogRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(0)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [open])
  if (!team) return null
  const en = lang === 'en'
  const a = clubBudgetAllocation(team)
  const status = budgetAdjustmentStatus(team)
  const wages = contractualWeeklyBill(team)
  const moneyWeekly = value => new Intl.NumberFormat(getMoneyCurrency() === 'EUR' ? 'de-DE' : 'en-US', { style: 'currency', currency: getMoneyCurrency(), minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  const disabled = !onChange || !a.weeks || a.cash < a.minimum || !status.available
  const validDraft = draft >= a.minimum && draft <= a.cash && a.weeks > 0
  const close = () => { dialogRef.current?.close(); setOpen(false); setError(null) }
  const save = () => {
    const result = adjustClubBudget(team, draft)
    if (!result.ok) {
      setError(result.error === 'budget_adjustment_cooldown'
        ? (en ? 'The adjustment is on cooldown. Close this window to see the next available date.' : 'Korekta jest jeszcze zablokowana. Zamknij okno, aby zobaczyć datę kolejnej zmiany.')
        : (en ? 'The available funds or wage commitments have changed. Reopen the adjustment.' : 'Dostępne środki lub zobowiązania uległy zmianie. Otwórz korektę ponownie.'))
      return
    }
    close()
    onChange?.()
  }
  return <section className="space-y-3" aria-label={en ? 'Club finances' : 'Finanse klubu'}>
    <div className="grid gap-3 md:grid-cols-3">
      {[
        [en ? 'Club money' : 'Wszystkie pieniądze klubu', formatUsd(a.cash)],
        [en ? 'Transfer budget' : 'Budżet transferowy', formatUsd(a.transferBudget)],
        [en ? 'Weekly wage budget' : 'Budżet płacowy / tydzień', moneyWeekly(a.weeklyWageLimit)],
      ].map(([label,value]) => <div key={label} className="rounded-lg border border-ufa-border bg-ufa-bg/60 p-4">
        <p className="text-xs text-ufa-muted">{label}</p><p className="text-xl font-bold tabular-nums text-ufa-text">{value}</p>
      </div>)}
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={disabled} className="rounded-lg border border-ufa-border px-4 py-2 text-sm font-semibold text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
        onClick={() => { setDraft(Math.min(a.cash,Math.max(a.minimum,a.seasonPayrollBudget))); setError(null); setOpen(true) }}>
        {en ? 'Adjust transfer budget / wages' : 'Zmień budżet transferowy / płacowy'}
      </button>
      <p className="text-xs text-ufa-muted">{!status.available
        ? `${en ? 'Next adjustment' : 'Kolejna korekta'}: ${status.nextDate}`
        : `${en ? 'Available once every' : 'Zmiana dostępna raz na'} ${BUDGET_ADJUSTMENT_DAYS} ${en ? 'in-game days.' : 'dni gry.'}`}</p>
    </div>
    <p className="text-xs text-ufa-muted">{en ? 'Current weekly wages' : 'Obecne pensje tygodniowe'}: {formatUsd(wages)}</p>
    {a.shortfall > 0 && <p className="text-sm text-red-400">{en ? 'Wage funding shortfall' : 'Brak pokrycia pensji'}: {formatUsd(a.shortfall)}</p>}
    {!a.weeks && <p className="text-xs text-ufa-muted">{en ? 'No payrolls remain this season. The split resets for the new season.' : 'W tym sezonie nie ma już wypłat. Podział zostanie odnowiony na nowy sezon.'}</p>}
    {open && <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={close}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-ufa-border bg-ufa-panel p-5 text-ufa-text shadow-xl backdrop:bg-black/70">
      <h3 id={titleId} className="text-lg font-semibold">{en ? 'Adjust transfer budget / wages' : 'Zmień budżet transferowy / płacowy'}</h3>
      <p className="mt-2 text-xs text-ufa-muted">{en ? 'Confirming a change locks further adjustments for 30 in-game days. Cancelling leaves the budget unchanged.' : 'Zatwierdzenie zmiany blokuje kolejną korektę na 30 dni gry. Anulowanie nie zmienia budżetu.'}</p>
      <label htmlFor={sliderId} className="mt-5 block text-sm font-semibold">{en ? 'Split your money' : 'Podział pieniędzy'}</label>
      <div className="my-2 flex justify-between text-xs text-ufa-muted"><span>{en ? 'More for transfers' : 'Więcej na transfery'}</span><span>{en ? 'More for wages' : 'Więcej na płace'}</span></div>
      <input autoFocus id={sliderId} type="range" className="w-full accent-emerald-500" min={a.minimum} max={Math.max(a.minimum,a.cash)} step="1"
        value={draft} aria-valuetext={moneyWeekly(a.weeks ? draft/a.weeks : 0) + '; ' + formatUsd(a.cash-draft)}
        onChange={e => setDraft(Number(e.target.value))} />
      <div className="my-4 grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-ufa-muted">{en ? 'Transfer budget' : 'Budżet transferowy'}</p><strong>{formatUsd(a.cash-draft)}</strong></div>
        <div><p className="text-ufa-muted">{en ? 'Weekly wage budget' : 'Budżet płacowy / tydzień'}</p><strong>{moneyWeekly(a.weeks ? draft/a.weeks : 0)}</strong></div>
      </div>
      <p className="text-xs text-ufa-muted">{en ? 'Season wage budget' : 'Sezonowy budżet płacowy'}: {formatUsd(draft)} · {a.weeks} {en ? 'payroll weeks left' : 'pozostałych tygodni wypłat'}.</p>
      <p className="mt-2 text-xs text-ufa-muted">{en ? 'Signed contracts remain protected. Moving the slider does not create money.' : 'Pieniądze na podpisane kontrakty są chronione. Przesuwanie suwaka nie tworzy pieniędzy.'}</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" className="rounded-lg border border-ufa-border px-4 py-2 text-sm" onClick={close}>{en ? 'Cancel' : 'Anuluj'}</button>
        <button type="button" disabled={!validDraft || draft === a.seasonPayrollBudget || !status.available} className="rounded-lg bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg disabled:opacity-40" onClick={save}>{en ? 'Confirm change' : 'Zatwierdź zmianę'}</button>
      </div>
    </dialog>}
  </section>
}
