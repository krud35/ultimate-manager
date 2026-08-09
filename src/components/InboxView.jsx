import { useUiLang } from '../ui/UiLangContext'
import { pickLabel, pickCopy, UI_LANG } from '../ui/locale'
import {
  randomEventBodyEn,
  localizeEventChoices,
} from '../career/randomEventCopyEn.js'
import { randomEventTitleEn } from '../career/randomEvents.js'
import { inboxStrings } from '../ui/strings/inbox'
import { useMemo, useRef, useState } from 'react'
import {
  INBOX_TYPES,
  INBOX_TYPE_META,
  ensureInbox,
  unreadInboxCount,
  markInboxRead,
  markAllInboxRead,
  deleteInboxMessage,
} from '../career/inbox.js'
import { formatUsd, formatUsdCompact, isTransferWindowOpen, previewContractOffer, CONTRACT_BONUS_DEFS, CONTRACT_PROMISE_DEFS, paymentModelLabel, describeSponsorOfferTotals, brandDisplayName, performanceBonusLabel, sponsorSlotLabel, findWorldPlayerById } from '../career'
import { formLabel } from '../models/playerForm.js'
import { moraleLabel } from '../models/playerMorale.js'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers'
import { attributeBandLabel, attributeBandToneClass } from '../ui/fogOfWar'
import { scoutingStrings } from '../ui/strings/scouting'
import { BoxScoreTable } from './BoxScoreTable'

function findWorldPlayer(world, playerId) {
  return findWorldPlayerById(world, playerId).player
}

function ScoutReportPanel({ message, career }) {
  const { lang } = useUiLang()
  const ts = scoutingStrings(lang)
  const p = message.payload ?? {}
  const world = career?.world
  const revealed = p.revealedPlayers ?? []

  return (
    <div className="space-y-3">
      {(p.knowledgeGained > 0 || p.tacticsGained > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {p.knowledgeGained > 0 && (
            <span className="rounded border border-ufa-accent/40 bg-ufa-accent/10 px-2 py-0.5 font-semibold text-ufa-accent">
              {ts.knowledgeLabel} +{p.knowledgeGained}
            </span>
          )}
          {p.tacticsGained > 0 && (
            <span className="rounded border border-ufa-gold/40 bg-ufa-gold/10 px-2 py-0.5 font-semibold text-ufa-gold">
              {ts.tacticsLabel} +{p.tacticsGained}
            </span>
          )}
        </div>
      )}
      {revealed.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {revealed.map((r) => {
            const player = findWorldPlayer(world, r.playerId)
            if (!player) return null
            const ovr = getOverallRating(player.skills)
            return (
              <li
                key={r.playerId}
                className="flex items-center justify-between gap-2 rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2 text-sm"
              >
                <span className="text-ufa-text">{getPlayerFullName(player)}</span>
                <span className={`text-xs font-semibold ${attributeBandToneClass(ovr)}`}>
                  {attributeBandLabel(ovr, lang)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function formatDayLabel(iso, lang = UI_LANG.PL) {
  if (!iso) return '—'
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(
      lang === UI_LANG.EN ? 'en-US' : 'pl-PL',
      {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      },
    )
  } catch {
    return iso
  }
}

function enrichRandomEventMessage(message) {
  const p = message?.payload ?? {}
  if (message?.type !== INBOX_TYPES.RANDOM_EVENT || p.kind !== 'decision') {
    return message
  }
  return {
    ...message,
    titleEn: message.titleEn ?? randomEventTitleEn(p.templateId, p.context) ?? undefined,
    bodyEn: message.bodyEn ?? randomEventBodyEn(p.templateId, p.context) ?? undefined,
  }
}

function typeBadgeClass(type) {
  switch (type) {
    case INBOX_TYPES.TRAINING_REPORT:
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    case INBOX_TYPES.TRANSFER_OFFER:
      return 'border-ufa-gold/40 bg-ufa-gold/10 text-ufa-gold'
    case INBOX_TYPES.MATCH_ANALYSIS:
      return 'border-ufa-accent/40 bg-ufa-accent/10 text-ufa-accent'
    case INBOX_TYPES.RANDOM_EVENT:
      return 'border-violet-400/40 bg-violet-400/10 text-violet-300'
    case INBOX_TYPES.INJURY:
      return 'border-red-400/40 bg-red-500/10 text-red-300'
    case INBOX_TYPES.CLUB_NEWS:
      return 'border-sky-400/40 bg-sky-400/10 text-sky-300'
    case INBOX_TYPES.SCOUT_REPORT:
      return 'border-teal-400/40 bg-teal-400/10 text-teal-300'
    default:
      return 'border-ufa-border bg-ufa-bg text-ufa-muted'
  }
}

function IncomingBidPanel({ message, career, onAction, busy }) {
  const { lang } = useUiLang()
  const t = inboxStrings(lang)
  const p = message.payload ?? {}
  const open = isTransferWindowOpen(career)
  const awaiting = p.status === 'awaiting_reply'
  const active = p.status === 'pending' || p.status === 'counter'
  const [counter, setCounter] = useState(() =>
    String(Math.round(((p.fee ?? p.askPrice ?? 0) * 1.08) / 1000) * 1000),
  )
  const counterNum = Math.round(Number(counter) || 0)

  return (
    <div className="rounded-lg border border-ufa-gold/30 bg-ufa-gold/5 px-4 py-3 text-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-ufa-gold/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-ufa-gold">
          {t.offerStatus[p.status] ?? p.status}
        </span>
        {awaiting && p.replyDate ? (
          <span className="text-xs text-ufa-muted">{`${t.replyBy} ${formatDayLabel(p.replyDate)}`}</span>
        ) : null}
        {p.expiresDate ? (
          <span className="text-xs text-ufa-muted">{`${t.expires} ${formatDayLabel(p.expiresDate)}`}</span>
        ) : null}
      </div>

      <p className="text-ufa-text">
        <span className="text-ufa-muted">{t.buyer}:</span> {p.fromTeamName}
      </p>
      <p className="text-ufa-text">
        <span className="text-ufa-muted">{t.currentOffer}:</span>{' '}
        <span className="font-semibold tabular-nums text-ufa-gold">{formatUsd(p.fee)}</span>
      </p>
      <p className="text-xs text-ufa-muted">
        {p.playerAge != null ? `${p.playerAge} ${lang === 'en' ? 'yo' : 'lat'}` : ''}
        {p.playerForm != null
          ? ` · ${lang === 'en' ? 'form' : 'forma'} ${formLabel(p.playerForm, lang)}`
          : ''}
        {p.playerMorale != null
          ? ` · morale ${moraleLabel(p.playerMorale, lang)}`
          : ''}
        {p.targetMotive === 'prospect'
          ? t.youngTarget
          : p.targetMotive === 'veteran'
            ? lang === 'en'
              ? ' — veteran / bargain target'
              : ' — cel: weteran / okazja'
            : ''}
        {p.playerMorale != null && p.playerMorale < 55 ? t.mayPushExit : ''}
      </p>

      {p.lastNegotiationMessage ? (
        <p className="rounded-md border border-ufa-border bg-ufa-bg/50 px-3 py-2 text-xs text-ufa-muted">
          {p.lastNegotiationMessage}
        </p>
      ) : null}

      {awaiting ? (
        <p className="text-xs text-ufa-gold">{t.awaitingBuyer}</p>
      ) : p.status === 'pre_agreed' ? (
        <p className="text-xs text-ufa-gold">{t.preAgreedHint}</p>
      ) : active ? (
        <div className="space-y-3 pt-1">
          {!open ? (
            <p className="text-[11px] text-ufa-muted">{t.preAgreedHint}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction({ action: 'accept', messageId: message.id })}
              className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
            >
              {`${t.accept} ${formatUsd(p.fee)}`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction({ action: 'reject', messageId: message.id })}
              className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
            >{t.reject}</button>
          </div>
          <label className="block text-xs text-ufa-muted">
            {t.counterLabelShort}
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                type="number"
                min={0}
                step={1000}
                value={counter}
                disabled={busy}
                onChange={(e) => setCounter(e.target.value)}
                className="min-w-[140px] flex-1 rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-sm text-ufa-text tabular-nums"
              />
              <button
                type="button"
                disabled={busy || counterNum <= 0}
                onClick={() =>
                  onAction({
                    action: 'counter',
                    messageId: message.id,
                    counterAmount: counterNum,
                  })
                }
                className="rounded-md bg-ufa-gold px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
              >{t.sendCounterShort}</button>
            </div>
          </label>
          <p className="text-[11px] text-ufa-muted leading-relaxed">
            {t.counterHint}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function ContractOfferForm({ demands, fee, budgetHint, busy, onSubmit, lang, t }) {
  const [weeklyWage, setWeeklyWage] = useState(() =>
    String(demands?.minWeeklyWage ?? 1000),
  )
  const [years, setYears] = useState(() => String(demands?.preferredYears ?? 3))
  const [selectedBonuses, setSelectedBonuses] = useState(() => new Set())
  const [selectedPromises, setSelectedPromises] = useState(() => new Set())

  const wageNum = Math.round(Number(weeklyWage) || 0)
  const yearsNum = Math.max(1, Math.min(5, Math.round(Number(years) || 1)))
  const preview = previewContractOffer(wageNum, yearsNum)
  const bonusesPayload = [...selectedBonuses].map((id) => {
    const def = CONTRACT_BONUS_DEFS.find((d) => d.id === id)
    return { type: id, amount: def?.defaultAmount ?? 5000 }
  })
  const promisesPayload = [...selectedPromises].map((id) => ({ type: id }))

  const toggle = (setter, id) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3 pt-1 border-t border-ufa-border/60">
      {demands && (
        <p className="text-[11px] text-ufa-muted leading-relaxed">
          {lang === 'en' ? demands.summaryEn : demands.summaryPl}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-ufa-border bg-ufa-bg/40 px-2 py-1.5">
          <p className="text-ufa-muted">{t.feeAgreed}</p>
          <p className="font-semibold tabular-nums text-ufa-gold">{formatUsd(fee)}</p>
        </div>
        <div className="rounded border border-ufa-border bg-ufa-bg/40 px-2 py-1.5">
          <p className="text-ufa-muted">{t.willingness}</p>
          <p className="font-semibold tabular-nums">{demands?.factors?.willingness ?? '—'}%</p>
        </div>
        <div className="rounded border border-ufa-border bg-ufa-bg/40 px-2 py-1.5">
          <p className="text-ufa-muted">{t.currentWage}</p>
          <p className="font-semibold tabular-nums">{formatUsd(demands?.currentWeeklyWage ?? 0)}</p>
        </div>
        <div className="rounded border border-ufa-border bg-ufa-bg/40 px-2 py-1.5">
          <p className="text-ufa-muted">{t.demandedWage}</p>
          <p className="font-semibold tabular-nums text-ufa-accent">{formatUsd(demands?.minWeeklyWage ?? 0)}</p>
        </div>
      </div>

      <label className="block text-xs text-ufa-muted">
        {t.contractWeekly}
        <input
          type="number"
          min={0}
          step={50}
          value={weeklyWage}
          disabled={busy}
          onChange={(e) => setWeeklyWage(e.target.value)}
          className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-sm text-ufa-text tabular-nums"
        />
      </label>
      <label className="block text-xs text-ufa-muted">
        {t.contractYears}
        <select
          value={years}
          disabled={busy}
          onChange={(e) => setYears(e.target.value)}
          className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-sm text-ufa-text"
        >
          {[1, 2, 3, 4, 5].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded border border-ufa-accent/30 bg-ufa-accent/10 px-2 py-1.5">
          <p className="text-[10px] text-ufa-muted">{t.contractWeekly}</p>
          <p className="font-bold tabular-nums text-ufa-accent">{formatUsd(preview.weeklyWage)}</p>
        </div>
        <div className="rounded border border-ufa-gold/30 bg-ufa-gold/10 px-2 py-1.5">
          <p className="text-[10px] text-ufa-muted">{t.contractTotal}</p>
          <p className="font-bold tabular-nums text-ufa-gold">{formatUsd(preview.totalCost)}</p>
        </div>
      </div>
      {budgetHint}

      <div>
        <p className="text-[10px] uppercase text-ufa-muted mb-1">{t.bonuses}</p>
        <div className="flex flex-wrap gap-1.5">
          {CONTRACT_BONUS_DEFS.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={busy}
              onClick={() => toggle(setSelectedBonuses, b.id)}
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
              disabled={busy}
              onClick={() => toggle(setSelectedPromises, pr.id)}
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || wageNum <= 0}
          onClick={() =>
            onSubmit({
              weeklyWage: wageNum,
              years: yearsNum,
              bonuses: bonusesPayload,
              promises: promisesPayload,
            })
          }
          className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
        >
          {t.proposeContract}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (demands?.minWeeklyWage != null) setWeeklyWage(String(demands.minWeeklyWage))
            if (demands?.preferredYears != null) setYears(String(demands.preferredYears))
          }}
          className="rounded-md border border-ufa-border px-3 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
        >
          {t.setDemand}
        </button>
      </div>
    </div>
  )
}

function OutgoingClubOfferPanel({ message, career, onAction, busy }) {
  const { lang } = useUiLang()
  const t = inboxStrings(lang)
  const p = message.payload ?? {}
  const open = isTransferWindowOpen(career)
  // Negocjacje dozwolone także poza oknem; rejestracja dopiero w oknie.
  const canNegotiate = true

  return (
    <div className="rounded-lg border border-ufa-accent/30 bg-ufa-accent/5 px-4 py-3 text-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-ufa-accent/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-ufa-accent">
          {t.offerStatus[p.status] ?? p.status}
        </span>
        {p.replyDate && p.status === 'awaiting_reply' ? (
          <span className="text-xs text-ufa-muted">{`${t.replyBy} ${formatDayLabel(p.replyDate)}`}</span>
        ) : null}
      </div>
      <p className="text-ufa-text">
        <span className="text-ufa-muted">{lang === 'en' ? 'Club' : 'Klub'}:</span> {p.sellerTeamName}
      </p>
      <p className="text-ufa-text">
        <span className="text-ufa-muted">{lang === 'en' ? 'Your offer' : 'Twoja oferta'}:</span>{' '}
        <span className="font-semibold tabular-nums text-ufa-gold">
          {formatUsd(p.agreedFee ?? p.offerAmount)}
        </span>
      </p>

      {p.status === 'awaiting_reply' && <p className="text-xs text-ufa-gold">{t.awaitingClub}</p>}
      {p.status === 'pre_agreed' && <p className="text-xs text-ufa-gold">{t.preAgreedHint}</p>}

      {p.status === 'counter' && canNegotiate && (
        <div className="space-y-2">
          <p className="text-xs text-ufa-muted">
            {lang === 'en' ? 'Club counter' : 'Kontrpropozycja'}:{' '}
            <span className="font-semibold text-ufa-gold">{formatUsd(p.counterAmount)}</span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction({ action: 'accept_club_counter', messageId: message.id })}
            className="rounded-md bg-ufa-gold px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
          >
            {t.acceptClubCounter}
          </button>
        </div>
      )}

      {p.status === 'club_agreed' && canNegotiate && !p.contractQueued && (
        <ContractOfferForm
          demands={p.playerDemands}
          fee={p.agreedFee ?? p.offerAmount}
          busy={busy}
          lang={lang}
          t={t}
          onSubmit={(contractTerms) =>
            onAction({ action: 'propose_contract', messageId: message.id, contractTerms })
          }
        />
      )}

      {!open && p.negotiatedOutsideWindow && p.status === 'awaiting_reply' && (
        <p className="text-[11px] text-ufa-muted">{t.preAgreedHint}</p>
      )}
    </div>
  )
}

function OutgoingPlayerContractPanel({ message, career, onAction, busy }) {
  const { lang } = useUiLang()
  const t = inboxStrings(lang)
  const p = message.payload ?? {}

  return (
    <div className="rounded-lg border border-ufa-gold/30 bg-ufa-gold/5 px-4 py-3 text-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-ufa-gold/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-ufa-gold">
          {t.offerStatus[p.status] ?? p.status}
        </span>
        {p.replyDate && p.status === 'awaiting_reply' ? (
          <span className="text-xs text-ufa-muted">{`${t.replyBy} ${formatDayLabel(p.replyDate)}`}</span>
        ) : null}
      </div>
      <p className="text-ufa-text">
        {formatUsd(p.weeklyWage)}/tydz. × {p.years} {lang === 'en' ? 'yrs' : 'lat'} ·{' '}
        {t.contractTotal} {formatUsd(p.totalCost)} · {t.feeAgreed} {formatUsd(p.fee)}
      </p>

      {p.status === 'awaiting_reply' && <p className="text-xs text-ufa-gold">{t.awaitingPlayer}</p>}
      {p.status === 'pre_agreed' && <p className="text-xs text-ufa-gold">{t.preAgreedHint}</p>}

      {p.status === 'counter' && (
        <div className="space-y-3">
          <p className="text-xs text-ufa-muted">
            {lang === 'en' ? 'Player wants' : 'Zawodnik chce'}:{' '}
            <span className="font-semibold text-ufa-gold">
              {formatUsd(p.counterWeeklyWage)}/tydz. × {p.counterYears}{' '}
              {lang === 'en' ? 'yrs' : 'lat'}
            </span>
            {' '}({formatUsd(previewContractOffer(p.counterWeeklyWage, p.counterYears).totalCost)})
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction({ action: 'accept_player_counter', messageId: message.id })}
            className="rounded-md bg-ufa-gold px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
          >
            {t.acceptPlayerCounter}
          </button>
          <ContractOfferForm
            demands={p.playerDemands}
            fee={p.fee}
            busy={busy}
            lang={lang}
            t={t}
            onSubmit={(contractTerms) =>
              onAction({ action: 'propose_contract', messageId: message.id, contractTerms })
            }
          />
        </div>
      )}

      {p.status === 'rejected' && (
        <ContractOfferForm
          demands={p.playerDemands}
          fee={p.fee}
          busy={busy}
          lang={lang}
          t={t}
          onSubmit={(contractTerms) =>
            onAction({ action: 'propose_contract', messageId: message.id, contractTerms })
          }
        />
      )}
    </div>
  )
}

function PendingRegistrationPanel({ message, career, onAction, busy }) {
  const { lang } = useUiLang()
  const t = inboxStrings(lang)
  const p = message.payload ?? {}
  const open = isTransferWindowOpen(career)
  const active = p.status === 'pending_confirm'

  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-emerald-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-300">
          {t.offerStatus[p.status] ?? p.status}
        </span>
      </div>
      <p className="text-ufa-text">
        {p.direction === 'sell'
          ? `${lang === 'en' ? 'Sale to' : 'Sprzedaż do'} ${p.buyerTeamName}`
          : `${lang === 'en' ? 'Buy from' : 'Kupno z'} ${p.sellerTeamName}`}
        {' · '}
        <span className="font-semibold tabular-nums text-ufa-gold">{formatUsd(p.fee)}</span>
        {p.contractTerms ? (
          <span className="text-ufa-muted">
            {' '}
            · {formatUsd(p.contractTerms.weeklyWage)}/tydz. × {p.contractTerms.years}{' '}
            {lang === 'en' ? 'yrs' : 'lat'}
          </span>
        ) : null}
      </p>
      {active && open ? (
        <>
          <p className="text-xs text-ufa-muted">{t.registrationHint}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction({ action: 'confirm_registration', messageId: message.id })}
              className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
            >
              {t.confirmRegistration}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction({ action: 'decline_registration', messageId: message.id })}
              className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
            >
              {t.declineRegistration}
            </button>
          </div>
        </>
      ) : active && !open ? (
        <p className="text-xs text-ufa-muted">{t.windowClosedNeg}</p>
      ) : null}
    </div>
  )
}

function fmtTeamCompletion(stats) {
  if (!stats || !(stats.throwAttempts > 0)) return '—'
  const pct =
    stats.completionPct != null
      ? stats.completionPct
      : Math.round((stats.completions / stats.throwAttempts) * 1000) / 10
  return `${stats.completions}/${stats.throwAttempts} (${pct}%)`
}

function PlayerImpactList({ title, players, tone = 'good' }) {
  if (!players?.length) return null
  const toneClass =
    tone === 'bad'
      ? 'border-orange-400/30 bg-orange-500/5'
      : 'border-emerald-500/30 bg-emerald-500/5'
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ufa-muted">{title}</p>
      <ul className="mt-1.5 space-y-1.5 text-sm">
        {players.map((h) => (
          <li
            key={h.playerId ?? h.name}
            className="flex justify-between gap-3 border-b border-ufa-border/40 pb-1.5 last:border-0 last:pb-0"
          >
            <span className="text-ufa-text">{h.name}</span>
            <span className="shrink-0 tabular-nums text-ufa-muted">
              {h.goals ?? 0}G · {h.assists ?? 0}A · {h.blocks ?? 0}B
              {h.turnovers ? ` · ${h.turnovers}TO` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MatchAnalysisPanel({ message }) {
  const { lang } = useUiLang()
  const t = inboxStrings(lang)
  const p = message.payload ?? {}
  const [showBoxScore, setShowBoxScore] = useState(false)
  const best = p.bestPlayers ?? p.highlights ?? []
  const worst = p.worstPlayers ?? []
  const ts = p.teamStats ?? {}
  const ours = ts.ours
  const theirs = ts.theirs
  const ourLine = ts.ourLinePoints
  const theirLine = ts.theirLinePoints
  const hasStats = !!(ours || theirs || ourLine || best.length || worst.length)
  const hasBox = Array.isArray(p.boxScore) && p.boxScore.length > 0

  if (!hasStats && !hasBox) {
    return (
      <p className="text-xs text-ufa-muted">
        {p.autoSimulated ? t.simNoStats : t.noDetailedStats}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {(ours || theirs || ourLine) && (
        <div className="rounded-lg border border-ufa-accent/30 bg-ufa-accent/5 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ufa-muted">
            {t.teamStats}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 text-sm">
            <div className="rounded-md border border-ufa-border/60 bg-ufa-bg/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase text-ufa-muted">Wynik</dt>
              <dd className="font-semibold tabular-nums text-ufa-text">
                {ts.ourPoints ?? p.ourScore ?? '—'}–{ts.theirPoints ?? p.theirScore ?? '—'}
              </dd>
            </div>
            <div className="rounded-md border border-ufa-border/60 bg-ufa-bg/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase text-ufa-muted">{t.completionYou}</dt>
              <dd className="font-semibold tabular-nums text-ufa-text">{fmtTeamCompletion(ours)}</dd>
            </div>
            <div className="rounded-md border border-ufa-border/60 bg-ufa-bg/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase text-ufa-muted">{t.completionOpp}</dt>
              <dd className="font-semibold tabular-nums text-ufa-text">{fmtTeamCompletion(theirs)}</dd>
            </div>
            <div className="rounded-md border border-ufa-border/60 bg-ufa-bg/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase text-ufa-muted">Metry (Ty)</dt>
              <dd className="font-semibold tabular-nums text-ufa-text">
                {ours?.totalYards != null ? `${ours.totalYards} m` : '—'}
              </dd>
            </div>
            <div className="rounded-md border border-ufa-border/60 bg-ufa-bg/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase text-ufa-muted">Metry (rywal)</dt>
              <dd className="font-semibold tabular-nums text-ufa-text">
                {theirs?.totalYards != null ? `${theirs.totalYards} m` : '—'}
              </dd>
            </div>
            <div className="rounded-md border border-ufa-border/60 bg-ufa-bg/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase text-ufa-muted">Punkty O / D (Ty)</dt>
              <dd className="font-semibold tabular-nums text-ufa-text">
                {ourLine
                  ? `${ourLine.offense ?? 0} / ${ourLine.defense ?? 0}`
                  : '—'}
              </dd>
            </div>
            {theirLine ? (
              <div className="rounded-md border border-ufa-border/60 bg-ufa-bg/40 px-2.5 py-2 sm:col-span-2">
                <dt className="text-[10px] uppercase text-ufa-muted">Punkty O / D (rywal)</dt>
                <dd className="font-semibold tabular-nums text-ufa-text">
                  {theirLine.offense ?? 0} / {theirLine.defense ?? 0}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-2 text-[11px] text-ufa-muted">
            {t.odHint}
          </p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <PlayerImpactList title={t.best3} players={best} tone="good" />
        <PlayerImpactList title={t.worst3} players={worst} tone="bad" />
      </div>

      {hasBox ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowBoxScore((v) => !v)}
            className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
          >
            {showBoxScore ? t.hideBoxScore : t.fullBoxScore}
          </button>
          {showBoxScore ? (
            <BoxScoreTable
              rows={p.boxScore}
              homeTeamName={p.homeTeamName ?? (lang === 'en' ? 'Home' : 'Gospodarze')}
              awayTeamName={p.awayTeamName ?? (lang === 'en' ? 'Away' : 'Goście')}
              variant="full"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SponsorOffersPanel({ message, busy, onSign, lang, t }) {
  const p = message.payload ?? {}
  const offers = p.offers ?? []
  const status = p.status ?? 'pending'
  const slotLabel = sponsorSlotLabel(p.slot, lang)

  if (status === 'signed') {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
        {lang === 'en'
          ? `Signed with ${brandDisplayName({ brandName: p.brandName, brandNameEn: p.brandNameEn }, lang)}${
              p.paid ? ` · ${formatUsd(p.paid)}` : ''
            }`
          : `Podpisano z ${brandDisplayName({ brandName: p.brandName, brandNameEn: p.brandNameEn }, lang)}${
              p.paid ? ` · ${formatUsd(p.paid)}` : ''
            }`}
      </div>
    )
  }

  if (status === 'superseded') {
    return (
      <p className="text-xs text-ufa-muted">
        {lang === 'en' ? 'Slot already filled by another deal.' : 'Slot już zajęty inną umową.'}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">
        {slotLabel} · {lang === 'en' ? 'Pick an offer' : 'Wybierz ofertę'}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {offers.map((offer) => (
          <div
            key={offer.id}
            className="rounded-lg border border-sky-400/30 bg-sky-400/5 p-3 flex flex-col gap-1.5"
          >
            <p className="text-[10px] uppercase tracking-wide text-sky-300 font-semibold">
              {lang === 'en' ? `Offer ${offer.offerIndex ?? ''}` : `Oferta ${offer.offerIndex ?? ''}`}
            </p>
            <p className="text-sm font-semibold text-ufa-text">{brandDisplayName(offer, lang)}</p>
            <p className="text-[11px] text-ufa-gold">{paymentModelLabel(offer.paymentModel, lang)}</p>
            <p className="text-[11px] text-ufa-muted leading-snug">
              {describeSponsorOfferTotals(offer, lang)}
            </p>
            {offer.performanceBonus ? (
              <p className="text-[10px] text-amber-300">
                {performanceBonusLabel(offer.performanceBonus, lang)}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy || !onSign}
              onClick={() => onSign?.(message.id, offer.id)}
              className="mt-auto rounded-md bg-sky-500/90 px-3 py-1.5 text-xs font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
            >
              {busy
                ? lang === 'en'
                  ? 'Signing…'
                  : 'Podpisywanie…'
                : lang === 'en'
                  ? 'Sign'
                  : 'Podpisz'}
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ufa-muted">
        {lang === 'en'
          ? 'You can also review deals under Club board.'
          : 'Oferty zobaczysz też w zakładce Zarząd.'}
      </p>
    </div>
  )
}

function MessageDetail({
  message,
  career,
  onNavigate,
  onOpenTeam = null,
  onTransferOfferAction,
  offerBusy,
  onResolveDecision,
  onSponsorSign = null,
}) {
  const { lang } = useUiLang()
  const t = inboxStrings(lang)
  const meta = INBOX_TYPE_META[message.type]
  const p = message.payload ?? {}
  const pendingDecision =
    message.type === INBOX_TYPES.RANDOM_EVENT &&
    p.kind === 'decision' &&
    p.status === 'pending' &&
    Array.isArray(p.choices) &&
    p.choices.length > 0
  const resolvedDecision =
    message.type === INBOX_TYPES.RANDOM_EVENT &&
    p.kind === 'decision' &&
    p.status === 'resolved'

  const displayMessage = enrichRandomEventMessage(message)
  const displayChoices = pendingDecision
    ? localizeEventChoices(p.templateId, p.choices)
    : p.choices

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeBadgeClass(message.type)}`}
          >
            {pickLabel(meta, lang) ?? message.type}
          </span>
          {resolvedDecision ? (
            <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">{t.resolved}</span>
          ) : null}
          {pendingDecision ? (
            <span className="rounded border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
              {t.needsDecision}
            </span>
          ) : null}
          <span className="text-xs text-ufa-muted">{formatDayLabel(message.date, lang)}</span>
        </div>
        <h3 className="mt-2 text-lg font-semibold text-ufa-text">
          {pickCopy(displayMessage, 'title', lang)}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ufa-muted">
          {pickCopy(displayMessage, 'body', lang)}
        </p>
      </div>

      {message.type === INBOX_TYPES.TRAINING_REPORT && p.report && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2">
            <dt className="text-[10px] uppercase text-ufa-muted">{t.quality}</dt>
            <dd className="font-semibold text-ufa-text">
              {p.report.quality}% ·{' '}
              {lang === 'en'
                ? p.report.qualityLabelEn ?? p.report.qualityLabel
                : p.report.qualityLabel}
            </dd>
          </div>
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2">
            <dt className="text-[10px] uppercase text-ufa-muted">{t.attendance}</dt>
            <dd className="font-semibold text-ufa-text">
              {p.report.attendedCount}/{p.report.rosterSize} ({p.report.attendance}%)
            </dd>
          </div>
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2">
            <dt className="text-[10px] uppercase text-ufa-muted">{t.engagement}</dt>
            <dd className="font-semibold text-ufa-text">{p.report.engagement}%</dd>
          </div>
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2">
            <dt className="text-[10px] uppercase text-ufa-muted">{t.skillBumps}</dt>
            <dd className="font-semibold text-ufa-text">{p.report.skillBumps ?? 0}</dd>
          </div>
        </dl>
      )}

      {message.type === INBOX_TYPES.TRANSFER_OFFER && p.kind === 'incoming_bid' && (
        <IncomingBidPanel
          key={`${message.id}-${p.fee}-${p.status}`}
          message={message}
          career={career}
          busy={offerBusy}
          onAction={onTransferOfferAction}
        />
      )}

      {message.type === INBOX_TYPES.TRANSFER_OFFER && p.kind === 'outgoing_club_offer' && (
        <OutgoingClubOfferPanel
          key={`${message.id}-${p.status}-${p.agreedFee ?? p.offerAmount}`}
          message={message}
          career={career}
          busy={offerBusy}
          onAction={onTransferOfferAction}
        />
      )}

      {message.type === INBOX_TYPES.TRANSFER_OFFER && p.kind === 'outgoing_player_contract' && (
        <OutgoingPlayerContractPanel
          key={`${message.id}-${p.status}-${p.weeklyWage}`}
          message={message}
          career={career}
          busy={offerBusy}
          onAction={onTransferOfferAction}
        />
      )}

      {message.type === INBOX_TYPES.TRANSFER_OFFER && p.kind === 'pending_registration' && (
        <PendingRegistrationPanel
          key={`${message.id}-${p.status}`}
          message={message}
          career={career}
          busy={offerBusy}
          onAction={onTransferOfferAction}
        />
      )}

      {message.type === INBOX_TYPES.TRANSFER_OFFER && p.kind === 'completed_deal' && (
        <p className="text-xs text-ufa-muted">{t.dealSaved}</p>
      )}

      {message.type === INBOX_TYPES.MATCH_ANALYSIS && (
        <MatchAnalysisPanel message={message} />
      )}

      {message.type === INBOX_TYPES.SCOUT_REPORT && (
        <ScoutReportPanel message={message} career={career} />
      )}

      {message.type === INBOX_TYPES.INJURY && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
            <dt className="text-[10px] uppercase text-ufa-muted">{t.injuryLabel}</dt>
            <dd className="font-semibold text-red-300">{p.label ?? '—'}</dd>
          </div>
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2">
            <dt className="text-[10px] uppercase text-ufa-muted">{t.unavailable}</dt>
            <dd className="font-semibold text-ufa-text tabular-nums">
              {p.daysRemaining ?? '—'}{' '}
              {lang === UI_LANG.EN
                ? p.daysRemaining === 1
                  ? 'day'
                  : 'days'
                : p.daysRemaining === 1
                  ? 'dzień'
                  : 'dni'}
            </dd>
          </div>
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2">
            <dt className="text-[10px] uppercase text-ufa-muted">{t.source}</dt>
            <dd className="font-semibold text-ufa-text">
              {p.source === 'training'
                ? lang === UI_LANG.EN
                  ? 'Training'
                  : 'Trening'
                : lang === UI_LANG.EN
                  ? 'Match'
                  : 'Mecz'}
            </dd>
          </div>
        </dl>
      )}

      {message.type === INBOX_TYPES.CLUB_NEWS && p.kind === 'sponsor_offers' && (
        <SponsorOffersPanel
          message={message}
          busy={offerBusy}
          onSign={onSponsorSign}
          lang={lang}
          t={t}
        />
      )}

      {message.type === INBOX_TYPES.CLUB_NEWS && p.kind === 'sponsor_expired' && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">
          {lang === 'en'
            ? `Slot freed: ${sponsorSlotLabel(p.slot, lang)}. New offers should be in your inbox.`
            : `Zwolniony slot: ${sponsorSlotLabel(p.slot, lang)}. Nowe oferty powinny być w skrzynce.`}
        </div>
      )}

      {message.type === INBOX_TYPES.RANDOM_EVENT && pendingDecision && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ufa-muted">
            {lang === UI_LANG.EN ? 'Your decision' : 'Twoja decyzja'}
          </p>
          <div className="flex flex-col gap-2">
            {displayChoices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                disabled={!onResolveDecision}
                onClick={() => onResolveDecision?.(message.id, choice.id)}
                className="rounded-lg border border-violet-400/35 bg-violet-400/5 px-4 py-3 text-left transition-colors hover:border-violet-400/60 hover:bg-violet-400/10 disabled:opacity-40"
              >
                <span className="block text-sm font-medium text-ufa-text">
                  {pickLabel(choice, lang) || choice.label}
                </span>
                {choice.hint || choice.hintEn ? (
                  <span className="mt-0.5 block text-xs text-ufa-muted">
                    {lang === 'en' ? choice.hintEn ?? choice.hint : choice.hint ?? choice.hintEn}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {message.type === INBOX_TYPES.RANDOM_EVENT && resolvedDecision && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
          {p.chosenLabel ? (
            <p className="text-ufa-text">
              <span className="text-ufa-muted">
                {lang === UI_LANG.EN ? 'Chose:' : 'Wybrano:'}
              </span>{' '}
              {lang === UI_LANG.EN
                ? p.chosenLabelEn ??
                  localizeEventChoices(p.templateId, [
                    { id: p.chosenId, label: p.chosenLabel },
                  ])[0]?.labelEn ??
                  p.chosenLabel
                : p.chosenLabel}
            </p>
          ) : null}
          {pickCopy(p, 'outcomeSummary', lang) ? (
            <p className="mt-1.5 leading-relaxed text-ufa-muted">
              {pickCopy(p, 'outcomeSummary', lang)}
            </p>
          ) : null}
        </div>
      )}

      {message.type === INBOX_TYPES.RANDOM_EVENT &&
        !pendingDecision &&
        !resolvedDecision && (
          <p className="text-xs text-ufa-muted">
            {lang === UI_LANG.EN
              ? 'Event with no decision options.'
              : 'Zdarzenie bez opcji decyzji.'}
          </p>
        )}

      {meta?.navigateTo && message.type === INBOX_TYPES.SCOUT_REPORT && p.opponentTeamId && onOpenTeam && (
        <button
          type="button"
          onClick={() => onOpenTeam(p.opponentTeamId)}
          className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
        >
          {t.goTo}: {pickLabel(meta, lang)}
        </button>
      )}

      {meta?.navigateTo &&
        onNavigate &&
        message.type !== INBOX_TYPES.TRANSFER_OFFER &&
        !(message.type === INBOX_TYPES.SCOUT_REPORT && p.opponentTeamId && onOpenTeam) && (
          <button
            type="button"
            onClick={() => onNavigate(meta.navigateTo)}
            className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
          >
            {t.goTo}: {pickLabel(meta, lang)}
          </button>
        )}
    </div>
  )
}

/** Swipe-left-to-delete on touch devices; a tap always passes through untouched. */
function SwipeableRow({ onDelete, deleteLabel, children }) {
  const DELETE_THRESHOLD = -76
  const MAX_DRAG = -120
  const [dragX, setDragX] = useState(0)
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const axisLockRef = useRef(null) // 'x' | 'y' | null

  const onTouchStart = (e) => {
    const t = e.touches[0]
    startXRef.current = t.clientX
    startYRef.current = t.clientY
    axisLockRef.current = null
    draggingRef.current = true
  }
  const onTouchMove = (e) => {
    if (!draggingRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - startXRef.current
    const dy = t.clientY - startYRef.current
    if (!axisLockRef.current) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      axisLockRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (axisLockRef.current !== 'x') return
    e.preventDefault()
    setDragX(Math.max(Math.min(dx, 0), MAX_DRAG))
  }
  const onTouchEnd = () => {
    draggingRef.current = false
    if (dragX < DELETE_THRESHOLD) onDelete()
    setDragX(0)
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-red-500/90 px-2 text-center text-[10px] font-bold uppercase tracking-wide text-white">
        {deleteLabel}
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: draggingRef.current ? 'none' : 'transform 200ms ease-out',
        }}
        className="relative bg-ufa-panel"
      >
        {children}
      </div>
    </div>
  )
}

export default function InboxView({
  career,
  onInboxChange,
  onNavigate,
  onOpenTeam = null,
  onTransferOfferAction = null,
  onResolveDecision = null,
  onSponsorSign = null,
}) {
  const { lang } = useUiLang()
  const tInbox = inboxStrings(lang)
  const inbox = ensureInbox(career)
  const unread = unreadInboxCount(career)
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [offerBusy, setOfferBusy] = useState(false)
  const [flash, setFlash] = useState(null)

  const filtered = useMemo(() => {
    let list = inbox
    if (filter === 'unread') list = list.filter((m) => !m.read)
    else if (filter !== 'all') list = list.filter((m) => m.type === filter)
    return list
  }, [inbox, filter])

  const selected =
    filtered.find((m) => m.id === selectedId) ?? filtered[0] ?? null

  const selectMessage = (message) => {
    setSelectedId(message.id)
    setFlash(null)
    if (!message.read && onInboxChange) {
      onInboxChange(markInboxRead(inbox, message.id))
    }
  }

  const handleMarkAll = () => {
    if (!onInboxChange || unread === 0) return
    onInboxChange(markAllInboxRead(inbox))
  }

  const handleDelete = (messageId) => {
    if (!onInboxChange) return
    const next = deleteInboxMessage(inbox, messageId)
    onInboxChange(next)
    if (selectedId === messageId) setSelectedId(null)
  }

  const handleOfferAction = (opts) => {
    if (!onTransferOfferAction || offerBusy) return
    setOfferBusy(true)
    setFlash(null)
    try {
      const result = onTransferOfferAction(opts)
      if (result?.ok === false) {
        setFlash({ type: 'error', text: result.error ?? tInbox.negotiateError })
      } else if (result?.message) {
        setFlash({
          type: result.completed ? 'ok' : result.rejected ? 'warn' : 'ok',
          text: result.message,
        })
      }
      return result
    } finally {
      setOfferBusy(false)
    }
  }

  const handleSponsorSign = (messageId, offerId) => {
    if (!onSponsorSign || offerBusy) return
    setOfferBusy(true)
    setFlash(null)
    try {
      const result = onSponsorSign(messageId, offerId)
      if (result?.ok === false) {
        setFlash({
          type: 'error',
          text: result.error ?? (lang === 'en' ? 'Could not sign' : 'Nie udało się podpisać'),
        })
      } else if (result?.ok) {
        setFlash({
          type: 'ok',
          text:
            lang === 'en'
              ? `Deal signed${result.paid ? ` · ${formatUsd(result.paid)}` : ''}`
              : `Umowa podpisana${result.paid ? ` · ${formatUsd(result.paid)}` : ''}`,
        })
      }
      return result
    } finally {
      setOfferBusy(false)
    }
  }

  return (
    <div className="space-y-6 league-fade-in">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ufa-text">{tInbox.title}</h2>
            <p className="mt-1 text-sm text-ufa-muted">
              {lang === 'en'
                ? 'Training reports, transfer offers, post-match analysis and random events.'
                : 'Raporty treningowe, oferty transferowe, analizy pomeczowe i zdarzenia losowe.'}
              {unread > 0 ? (
                <span className="text-ufa-accent">
                  {' '}
                  · {unread} {lang === 'en' ? 'unread' : 'nieprzeczytanych'}
                </span>
              ) : (
                lang === 'en' ? ' · all read' : ' · wszystko przeczytane'
              )}
            </p>
          </div>
          <button
            type="button"
            disabled={unread === 0}
            onClick={handleMarkAll}
            className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
          >
            Oznacz wszystkie jako przeczytane
          </button>
        </div>

        {flash && (
          <p
            className={`mt-3 text-sm ${
              flash.type === 'ok'
                ? 'text-ufa-accent'
                : flash.type === 'error'
                  ? 'text-red-400'
                  : 'text-ufa-gold'
            }`}
          >
            {flash.text}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {([
            { id: 'all', label: tInbox.filters.all },
            { id: 'unread', label: tInbox.filters.unread },
            { id: INBOX_TYPES.TRAINING_REPORT, label: tInbox.filters.training },
            { id: INBOX_TYPES.TRANSFER_OFFER, label: tInbox.filters.transfers },
            { id: INBOX_TYPES.MATCH_ANALYSIS, label: tInbox.filters.match },
            { id: INBOX_TYPES.INJURY, label: tInbox.filters.injuries },
            { id: INBOX_TYPES.RANDOM_EVENT, label: tInbox.filters.events },
            { id: INBOX_TYPES.CLUB_NEWS, label: tInbox.filters.club },
            { id: INBOX_TYPES.SCOUT_REPORT, label: tInbox.filters.scouting },
          ]).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'bg-ufa-accent text-ufa-bg'
                  : 'border border-ufa-border text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-10 text-center shadow-xl shadow-black/30">
          <p className="text-sm text-ufa-muted">
            {inbox.length === 0
              ? tInbox.empty
              : lang === 'en'
                ? 'No messages in this filter.'
                : tInbox.noFilter}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30 overflow-hidden">
            <ul className="divide-y divide-ufa-border/80 max-h-[70vh] overflow-y-auto">
              {filtered.map((message) => {
                const meta = INBOX_TYPE_META[message.type]
                const active = selected?.id === message.id
                const bidPending =
                  (message.payload?.kind === 'incoming_bid' &&
                    (message.payload?.status === 'pending' ||
                      message.payload?.status === 'counter')) ||
                  (message.payload?.kind === 'outgoing_club_offer' &&
                    (message.payload?.status === 'counter' ||
                      message.payload?.status === 'club_agreed')) ||
                  (message.payload?.kind === 'outgoing_player_contract' &&
                    (message.payload?.status === 'counter' ||
                      message.payload?.status === 'rejected')) ||
                  (message.payload?.kind === 'pending_registration' &&
                    message.payload?.status === 'pending_confirm')
                return (
                  <li key={message.id}>
                    <SwipeableRow
                      onDelete={() => handleDelete(message.id)}
                      deleteLabel={lang === UI_LANG.EN ? 'Delete' : 'Usuń'}
                    >
                      <button
                        type="button"
                        onClick={() => selectMessage(message)}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          active ? 'bg-ufa-accent/10' : 'hover:bg-ufa-panel-hover'
                        } ${!message.read ? 'border-l-2 border-l-ufa-accent' : 'border-l-2 border-l-transparent'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${typeBadgeClass(message.type)}`}
                          >
                            {pickLabel(meta, lang) ?? message.type}
                            {bidPending ? (lang === UI_LANG.EN ? ' · action' : ' · akcja') : ''}
                          </span>
                          <span className="shrink-0 text-[11px] text-ufa-muted">
                            {formatDayLabel(message.date, lang)}
                          </span>
                        </div>
                        <p
                          className={`mt-1.5 text-sm ${
                            message.read ? 'text-ufa-muted' : 'font-medium text-ufa-text'
                          }`}
                        >
                          {pickCopy(enrichRandomEventMessage(message), 'title', lang)}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-ufa-muted">
                          {pickCopy(enrichRandomEventMessage(message), 'body', lang)}
                        </p>
                      </button>
                    </SwipeableRow>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5 sm:p-6 shadow-xl shadow-black/30">
            {selected ? (
              <>
                <MessageDetail
                  message={selected}
                  career={career}
                  onNavigate={onNavigate}
                  onOpenTeam={onOpenTeam}
                  onTransferOfferAction={handleOfferAction}
                  offerBusy={offerBusy}
                  onResolveDecision={onResolveDecision}
                  onSponsorSign={handleSponsorSign}
                />
                <div className="mt-6 flex flex-wrap gap-2 border-t border-ufa-border pt-4">
                  <button
                    type="button"
                    onClick={() => handleDelete(selected.id)}
                    className="rounded-md border border-ufa-border px-3 py-1.5 text-xs text-ufa-muted hover:border-red-400/50 hover:text-red-300"
                  >{tInbox.deleteMessage}</button>
                </div>
              </>
            ) : (
              <p className="text-sm text-ufa-muted">{tInbox.pickMessage}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
