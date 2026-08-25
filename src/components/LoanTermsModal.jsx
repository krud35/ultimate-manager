import { useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { transfersStrings } from '../ui/strings/transfers'
import { LOAN_DURATION_PRESETS } from '../career'
import { pickLabel } from '../ui/locale'

/**
 * Formularz warunków wypożyczenia — tryb 'out' (własny zawodnik → wybrany klub AI)
 * lub 'in' (zawodnik klubu AI → Twój klub, z wiersza rynku). Czysty UI — logika
 * wysyłki (`queueLoanOutOffer`/`queueLoanInRequest`) żyje w wywołującym.
 */
export default function LoanTermsModal({
  mode,
  player = null,
  teams = [],
  row = null,
  budget = 0,
  onClose,
  onSubmit,
}) {
  const { lang } = useUiLang()
  const t = transfersStrings(lang)
  const isOut = mode === 'out'
  const targetPlayer = isOut ? player : row?.player
  const marketValue = isOut ? (player?.marketValue ?? 0) : (row?.marketValue ?? 0)

  const [destinationTeamId, setDestinationTeamId] = useState(() => teams[0]?.id ?? '')
  const [fee, setFee] = useState(() => String(Math.round((row?.marketValue ?? 0) * 0.08)))
  const [durationPreset, setDurationPreset] = useState('rest_of_season')
  const [wageSplitPct, setWageSplitPct] = useState('50')
  const [buyClauseType, setBuyClauseType] = useState('none')
  const [buyClauseFee, setBuyClauseFee] = useState(() => String(marketValue))

  if (!targetPlayer) return null

  const feeNum = Math.max(0, Math.round(Number(fee) || 0))
  const pct = Math.max(0, Math.min(100, Math.round(Number(wageSplitPct) || 0)))
  const overBudget = !isOut && feeNum > budget

  const handleSubmit = () => {
    const buyClause =
      buyClauseType === 'none'
        ? null
        : { type: buyClauseType, fee: Math.max(0, Math.round(Number(buyClauseFee) || 0)) }
    onSubmit({
      destinationTeamId: isOut ? destinationTeamId : undefined,
      fee: feeNum,
      durationPreset,
      wageSplitPct: pct,
      buyClause,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label={t.close}
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg max-h-[min(92vh,100%)] overflow-y-auto rounded-t-xl sm:rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ufa-muted">
              {isOut ? t.loanOutTitle : t.loanInTitle}
            </p>
            <h3 className="text-lg font-semibold text-ufa-text">
              {isOut ? player?.name : row?.name}
            </h3>
            {!isOut && <p className="mt-1 text-sm text-ufa-muted">{row?.teamName}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-ufa-muted hover:text-ufa-text text-sm">
            {t.close}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {isOut && (
            <label className="block text-sm text-ufa-text">
              {t.loanDestinationClub}
              <select
                value={destinationTeamId}
                onChange={(e) => setDestinationTeamId(e.target.value)}
                className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text"
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-sm text-ufa-text">
            {t.loanFee}
            <input
              type="number"
              min={0}
              step={1000}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text tabular-nums"
            />
          </label>
          {overBudget && <p className="text-xs text-red-400">{t.overBudget}</p>}

          <label className="block text-sm text-ufa-text">
            {t.loanDuration}
            <select
              value={durationPreset}
              onChange={(e) => setDurationPreset(e.target.value)}
              className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text"
            >
              {LOAN_DURATION_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {pickLabel(preset, lang)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-ufa-text">
            {t.loanWageSplit(pct)}
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={wageSplitPct}
              onChange={(e) => setWageSplitPct(e.target.value)}
              className="mt-2 w-full"
            />
            <p className="mt-1 text-xs text-ufa-muted">
              {isOut ? t.loanWageSplitHintOut(pct) : t.loanWageSplitHintIn(pct)}
            </p>
          </label>

          <div>
            <p className="text-[10px] uppercase text-ufa-muted mb-1">{t.loanBuyClause}</p>
            <div className="flex flex-wrap gap-1.5">
              {['none', 'option', 'obligation'].map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setBuyClauseType(id)}
                  className={`rounded px-2 py-1 text-[11px] ring-1 ${
                    buyClauseType === id
                      ? 'bg-ufa-gold/20 text-ufa-gold ring-ufa-gold/40'
                      : 'bg-ufa-bg text-ufa-muted ring-ufa-border'
                  }`}
                >
                  {id === 'none' ? t.loanBuyClauseNone : id === 'option' ? t.loanBuyClauseOption : t.loanBuyClauseObligation}
                </button>
              ))}
            </div>
            {buyClauseType !== 'none' && (
              <label className="mt-2 block text-sm text-ufa-text">
                {t.loanBuyClauseFee}
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={buyClauseFee}
                  onChange={(e) => setBuyClauseFee(e.target.value)}
                  className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text tabular-nums"
                />
              </label>
            )}
          </div>

          <button
            type="button"
            disabled={overBudget || (isOut && !destinationTeamId)}
            onClick={handleSubmit}
            className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
          >
            {t.sendLoanProposal}
          </button>
        </div>
      </div>
    </div>
  )
}
