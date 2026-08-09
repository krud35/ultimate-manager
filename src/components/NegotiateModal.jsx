import { useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { transfersStrings } from '../ui/strings/transfers'
import {
  formatUsd,
  formatUsdCompact,
  computePlayerContractDemands,
  previewContractOffer,
  CONTRACT_BONUS_DEFS,
  CONTRACT_PROMISE_DEFS,
} from '../career'

/**
 * Okno negocjacji — wolny agent podpisuje od razu (kontrakt), zawodnik klubowy
 * dostaje ofertę wysłaną do skrzynki (`onSubmitOffer(offerAmount, contractTerms)`).
 * Czysty UI — logika wysyłki (`submitTransferOffer`) żyje w wywołującym.
 */
export default function NegotiateModal({ row, budget, onClose, onSubmitOffer }) {
  const { lang } = useUiLang()
  const t = transfersStrings(lang)
  const isFa = !!row?.freeAgent
  const [offer, setOffer] = useState(() => String(row?.marketValue ?? 0))
  const [wage, setWage] = useState(() => {
    if (!row?.player) return '500'
    const d = computePlayerContractDemands({
      player: row.player,
      sellerTeam: null,
      buyerTeam: null,
    })
    return String(d.minWeeklyWage)
  })
  const [years, setYears] = useState('3')
  const [selectedBonuses, setSelectedBonuses] = useState(() => new Set())
  const [selectedPromises, setSelectedPromises] = useState(() => new Set())

  const toggleSet = (setter, id) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const bonusesPayload = [...selectedBonuses].map((id) => {
    const def = CONTRACT_BONUS_DEFS.find((d) => d.id === id)
    return { type: id, amount: def?.defaultAmount ?? 5000 }
  })
  const promisesPayload = [...selectedPromises].map((id) => ({ type: id }))

  if (!row) return null

  const offerNum = Math.round(Number(offer) || 0)
  const overBudget = !isFa && offerNum > budget
  const preview = previewContractOffer(
    Math.round(Number(wage) || 0),
    Math.max(1, Math.min(5, Math.round(Number(years) || 1))),
  )
  const faOverBudget = isFa && preview.totalCost > budget

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
            <p className="text-xs uppercase tracking-wide text-ufa-muted">{t.negotiateTitle}</p>
            <h3 className="text-lg font-semibold text-ufa-text">{row.name}</h3>
            <p className="mt-1 text-sm text-ufa-muted">
              {row.teamName}
              {row.age != null ? ` · ${row.age}` : ''}
              {!isFa && row.rank === 0
                ? t.clubTop1
                : !isFa && row.rank <= 2
                  ? t.clubTopN(row.rank + 1)
                  : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ufa-muted hover:text-ufa-text text-sm">
            {t.close}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2">
            <p className="text-[10px] uppercase text-ufa-muted">{t.value}</p>
            <p className="font-semibold tabular-nums text-ufa-text">{formatUsd(row.marketValue)}</p>
          </div>
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2">
            <p className="text-[10px] uppercase text-ufa-muted">{t.years}</p>
            <p className="font-semibold tabular-nums text-ufa-text">
              {isFa ? 'FA' : row.contractYears ?? '—'}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-ufa-muted">
          {t.yourBudget}: {formatUsd(budget)}
        </p>

        {isFa ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-ufa-muted leading-relaxed">{t.faHint}</p>
            <label className="block text-sm text-ufa-text">
              {t.weeklyWage}
              <input
                type="number"
                value={wage}
                onChange={(e) => setWage(e.target.value)}
                className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text tabular-nums"
              />
            </label>
            <label className="block text-sm text-ufa-text">
              {t.years}
              <input
                type="number"
                min={1}
                max={5}
                value={years}
                onChange={(e) => setYears(e.target.value)}
                className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text tabular-nums"
              />
            </label>
            <p className="text-xs text-ufa-muted tabular-nums">{formatUsd(preview.totalCost)}</p>
            {faOverBudget && <p className="text-xs text-red-400">{t.overBudgetContract}</p>}

            <div>
              <p className="text-[10px] uppercase text-ufa-muted mb-1">{t.bonuses}</p>
              <div className="flex flex-wrap gap-1.5">
                {CONTRACT_BONUS_DEFS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleSet(setSelectedBonuses, b.id)}
                    className={`rounded px-2 py-1 text-[10px] ring-1 ${
                      selectedBonuses.has(b.id)
                        ? 'bg-ufa-gold/20 text-ufa-gold ring-ufa-gold/40'
                        : 'bg-ufa-bg text-ufa-muted ring-ufa-border'
                    }`}
                  >
                    {lang === 'en' ? b.labelEn : b.labelPl} · {formatUsdCompact(b.defaultAmount)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase text-ufa-muted mb-1">{t.promises}</p>
              <div className="flex flex-wrap gap-1.5">
                {CONTRACT_PROMISE_DEFS.map((pr) => (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => toggleSet(setSelectedPromises, pr.id)}
                    className={`rounded px-2 py-1 text-[10px] ring-1 ${
                      selectedPromises.has(pr.id)
                        ? 'bg-ufa-accent/20 text-ufa-accent ring-ufa-accent/40'
                        : 'bg-ufa-bg text-ufa-muted ring-ufa-border'
                    }`}
                  >
                    {lang === 'en' ? pr.labelEn : pr.labelPl}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={faOverBudget || budget <= 0}
              onClick={() =>
                onSubmitOffer(0, {
                  weeklyWage: Math.round(Number(wage) || 0),
                  years: Math.max(1, Math.min(5, Math.round(Number(years) || 1))),
                  bonuses: bonusesPayload,
                  promises: promisesPayload,
                })
              }
              className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
            >
              {t.sendOffer}
            </button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-xs text-ufa-muted leading-relaxed">{t.negotiateHint}</p>
            <p className="mt-2 text-xs text-ufa-gold leading-relaxed">
              {t.negotiateInboxHint}
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-ufa-text">
                {t.yourOffer}
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={offer}
                  onChange={(e) => setOffer(e.target.value)}
                  className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text tabular-nums"
                />
              </label>
              {overBudget && <p className="text-xs text-red-400">{t.overBudget}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={overBudget || offerNum <= 0 || budget <= 0}
                  onClick={() => onSubmitOffer(offerNum)}
                  className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
                >
                  {t.sendOffer}
                </button>
                <button
                  type="button"
                  onClick={() => setOffer(String(row.marketValue))}
                  className="rounded-md border border-ufa-border px-3 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
                >
                  {t.setValue}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
