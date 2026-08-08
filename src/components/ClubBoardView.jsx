import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { clubBoardStrings } from '../ui/strings/clubBoard'
import {
  formatUsd,
  getTransferBudget,
  getSalaryBudget,
  worldTeamById,
  ensureTeamFacilities,
  ensureTeamSponsors,
  FACILITY_IDS,
  getFacilityLevel,
  facilityName,
  facilityEffectLabel,
  facilityLevelBlurb,
  facilityToneClass,
  facilityUpgradeCost,
  upgradeFacility,
  FACILITY_LEVEL_MAX,
  getSponsorContract,
  getSponsorOffers,
  refreshSponsorOffers,
  signSponsorOffer,
  sponsorSlotLabel,
  paymentModelLabel,
  seasonalTimingLabel,
  performanceBonusLabel,
  brandDisplayName,
  describeSponsorOfferTotals,
  SPONSOR_SLOTS,
  supersedeSponsorOfferMessages,
} from '../career'

function FacilityCard({ team, facilityId, budget, lang, t, busy, onUpgrade }) {
  const level = getFacilityLevel(team, facilityId)
  const cost = facilityUpgradeCost(facilityId, level)
  const canUpgrade = cost != null && budget >= cost && !busy
  const name = facilityName(facilityId, lang)

  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-bg/50 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ufa-text text-sm">{name}</h3>
          <p className="text-[11px] text-ufa-muted">{facilityEffectLabel(facilityId, lang)}</p>
        </div>
        <span className={`text-lg font-bold tabular-nums ${facilityToneClass(facilityId, level)}`}>
          {level}
          <span className="text-xs font-normal text-ufa-muted">/{FACILITY_LEVEL_MAX}</span>
        </span>
      </div>
      <p className="text-xs text-ufa-muted leading-relaxed min-h-[2.5rem]">
        {facilityLevelBlurb(facilityId, level, lang)}
      </p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-ufa-muted">
          {t.cost}:{' '}
          <span className="text-ufa-text tabular-nums">
            {cost == null ? t.maxLevel : formatUsd(cost)}
          </span>
        </span>
        <button
          type="button"
          disabled={!canUpgrade}
          onClick={() => onUpgrade(facilityId)}
          className="rounded-md bg-ufa-accent px-3 py-1.5 text-xs font-semibold text-ufa-bg disabled:opacity-40 hover:opacity-90"
          title={!canUpgrade && cost != null && budget < cost ? t.cannotAfford : undefined}
        >
          {busy ? t.upgrading : t.upgrade}
        </button>
      </div>
    </div>
  )
}

function OfferCard({ offer, lang, t, busy, onSign }) {
  return (
    <div className="rounded-lg border border-ufa-border bg-ufa-panel/80 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-ufa-accent font-semibold">
          {t.offer(offer.offerIndex ?? 1)}
        </span>
        <span className="text-xs text-ufa-muted">
          {offer.years} {lang === 'en' ? (offer.years === 1 ? 'year' : 'years') : offer.years === 1 ? 'rok' : 'lat'}
        </span>
      </div>
      <p className="font-semibold text-sm text-ufa-text">{brandDisplayName(offer, lang)}</p>
      <p className="text-xs text-ufa-gold">{paymentModelLabel(offer.paymentModel, lang)}</p>
      {offer.seasonalTiming && (
        <p className="text-[11px] text-ufa-muted">{seasonalTimingLabel(offer.seasonalTiming, lang)}</p>
      )}
      <p className="text-xs text-ufa-text leading-snug">{describeSponsorOfferTotals(offer, lang)}</p>
      <p className="text-[11px] text-ufa-muted">
        {t.signingBonus}:{' '}
        <span className="text-emerald-400 tabular-nums">{formatUsd(offer.signingPayout)}</span>
        {' · '}
        {t.totalValue}:{' '}
        <span className="tabular-nums">{formatUsd(offer.totalContractValue)}</span>
      </p>
      {offer.performanceBonus && (
        <p className="text-[11px] text-amber-300">
          {performanceBonusLabel(offer.performanceBonus, lang)}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => onSign(offer.id)}
        className="mt-auto rounded-md border border-ufa-accent/50 bg-ufa-accent/15 px-3 py-1.5 text-xs font-semibold text-ufa-accent hover:bg-ufa-accent/25 disabled:opacity-40"
      >
        {busy ? t.signing : t.sign}
      </button>
    </div>
  )
}

function SponsorSlotPanel({ team, slot, seasonYear, lang, t, busy, onChanged }) {
  const contract = getSponsorContract(team, slot)
  const offers = getSponsorOffers(team, slot)

  const handleRefresh = () => {
    refreshSponsorOffers(team, slot, {
      seasonYear,
      seed: `${team.id}|${slot}|${Date.now()}`,
      date: null,
    })
    onChanged()
  }

  const handleSign = (offerId) => {
    const result = signSponsorOffer(team, slot, offerId, { seasonYear })
    if (result.ok) onChanged(result)
  }

  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-bg/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-sm text-ufa-text">{sponsorSlotLabel(slot, lang)}</h3>
        {!contract && (
          <button
            type="button"
            onClick={handleRefresh}
            className="text-xs text-ufa-accent hover:underline"
          >
            {t.refreshOffers}
          </button>
        )}
      </div>

      {contract ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-emerald-400">{t.activeDeal}</p>
          <p className="font-semibold text-ufa-text">{brandDisplayName(contract, lang)}</p>
          <p className="text-xs text-ufa-muted">{paymentModelLabel(contract.paymentModel, lang)}</p>
          {contract.seasonalTiming && (
            <p className="text-[11px] text-ufa-muted">
              {seasonalTimingLabel(contract.seasonalTiming, lang)}
            </p>
          )}
          <p className="text-xs text-ufa-text">
            {t.yearsLeft(contract.yearsRemaining ?? contract.years ?? 0)}
          </p>
          <p className="text-[11px] text-ufa-muted">
            {t.paidToDate}:{' '}
            <span className="text-emerald-400 tabular-nums">
              {formatUsd(contract.paidToDate ?? 0)}
            </span>
          </p>
          {contract.performanceBonus && (
            <p className="text-[11px] text-amber-300">
              {performanceBonusLabel(contract.performanceBonus, lang)}
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-ufa-muted">{t.slotEmpty}</p>
          {offers.length === 0 ? (
            <p className="text-sm text-ufa-muted">{t.noOffers}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {offers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  lang={lang}
                  t={t}
                  busy={busy}
                  onSign={handleSign}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ClubBoardView({ career, onChange }) {
  const { lang } = useUiLang()
  const t = clubBoardStrings(lang)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)

  const team = useMemo(() => {
    if (!career?.world || !career?.playerTeamId) return null
    return worldTeamById(career.world, career.playerTeamId)
  }, [career])

  useEffect(() => {
    if (!team) return
    ensureTeamFacilities(team)
    ensureTeamSponsors(team, {
      seasonYear: career?.seasonYear,
      autoSign: false,
    })
    for (const slot of SPONSOR_SLOTS) {
      if (!team.sponsors[slot] && !(team.sponsors.offers?.[slot]?.length > 0)) {
        refreshSponsorOffers(team, slot, {
          seasonYear: career?.seasonYear,
          seed: `${team.id}|boot|${slot}|${career?.seasonYear}`,
        })
      }
    }
  }, [team, career?.seasonYear])

  const budget = team ? getTransferBudget(team) : 0
  const salaryBudget = team ? getSalaryBudget(team) : 0
  const lastMerch = team?.facilities?.lastMerchAmount
  const lastTravel = team?.facilities?.lastTravelCost

  const handleSponsorChanged = (result) => {
    if (result?.ok) {
      persist(
        t.signed(
          brandDisplayName(result.contract, lang),
          result.paid > 0 ? formatUsd(result.paid) : '',
        ),
        result.contract?.slot,
      )
    } else {
      persist()
    }
  }

  const persist = useCallback(
    (message, signedSlot = null) => {
      if (message) setFlash(message)
      onChange?.(signedSlot ? { signedSponsorSlot: signedSlot } : undefined)
    },
    [onChange],
  )

  const handleUpgrade = (facilityId) => {
    if (!team || busy) return
    setBusy(true)
    const result = upgradeFacility(team, facilityId)
    setBusy(false)
    if (result.ok) {
      persist(t.upgraded(facilityName(facilityId, lang), result.level))
    }
  }

  if (!team) {
    return <p className="text-sm text-ufa-muted">—</p>
  }

  return (
    <div className="space-y-6 league-fade-in">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ufa-text">{t.title}</h2>
            <p className="text-sm text-ufa-muted mt-0.5">{t.subtitle}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-ufa-muted">{t.budget}</p>
            <p className="text-lg font-semibold tabular-nums text-ufa-gold">{formatUsd(budget)}</p>
            <p className="text-[10px] uppercase tracking-wide text-ufa-muted mt-2">{t.salaryBudget}</p>
            <p className="text-lg font-semibold tabular-nums text-ufa-accent">{formatUsd(salaryBudget)}</p>
            {lastMerch != null && (
              <p className="text-[11px] text-ufa-muted mt-0.5">
                {t.lastMerch}:{' '}
                <span className="text-emerald-400">{formatUsd(lastMerch)}</span>
              </p>
            )}
            {lastTravel != null && (
              <p className="text-[11px] text-ufa-muted mt-0.5">
                {t.lastTravel}:{' '}
                <span className="text-red-400">{formatUsd(lastTravel)}</span>
              </p>
            )}
          </div>
        </div>
        {flash && (
          <p className="mt-3 text-sm text-emerald-400 border border-emerald-500/30 rounded-md bg-emerald-500/10 px-3 py-2">
            {flash}
          </p>
        )}
      </div>

      <section className="space-y-3">
        <div>
          <h3 className="font-semibold text-ufa-text">{t.facilities}</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {FACILITY_IDS.map((id) => (
            <FacilityCard
              key={id}
              team={team}
              facilityId={id}
              budget={budget}
              lang={lang}
              t={t}
              busy={busy}
              onUpgrade={handleUpgrade}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-semibold text-ufa-text">{t.sponsors}</h3>
          <p className="text-xs text-ufa-muted mt-0.5">{t.hintSponsors}</p>
        </div>
        <div className="space-y-4">
          {SPONSOR_SLOTS.map((slot) => (
            <SponsorSlotPanel
              key={slot}
              team={team}
              slot={slot}
              seasonYear={career.seasonYear}
              lang={lang}
              t={t}
              busy={busy}
              onChanged={handleSponsorChanged}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
