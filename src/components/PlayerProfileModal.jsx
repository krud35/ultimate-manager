import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers'
import {
  CATEGORY_LABELS,
  PLAYER_STAT_CATEGORIES,
  SUB_STAT_LABELS,
  getCategoryOverall,
  getSubStat,
  normalizePlayerSkills,
} from '../models/playerStats.js'
import { getSubStatGrowth } from '../models/playerSkillsHistory.js'
import { DOMINANT_HAND, getDominantHand } from '../models/playerProfile.js'
import { seasonStatsForPlayer } from '../league/leagueStats.js'
import { UFA_LEAGUE_TEAMS } from '../data/ufaLeagueTeams.js'
import {
  ensurePlayerMorale,
  getPlayerMorale,
  moraleLabel,
  moraleToneClass,
} from '../models/playerMorale.js'
import {
  ensurePlayerForm,
  getPlayerForm,
  formLabel,
  formToneClass,
} from '../models/playerForm.js'
import {
  ensurePlayerInjury,
  getInjuryDaysRemaining,
  injuryLabelEn,
  injuryStatusLabel,
  isPlayerInjured,
} from '../models/playerInjury.js'
import {
  formatUsd,
  formatUsdCompact,
  getPlayerMarketValue,
  ensurePlayerContract,
  computePlayerContractDemands,
  previewContractOffer,
} from '../career'
import { eucsCountryByName } from '../data/eucs/eucsCountryStrength.js'
import { academyCountryByEnglishName } from '../data/academyScoutGeography.js'
import { SkillBar, ThrowingHandBadge } from './TeamRosterPanel'
import StaminaBar from './StaminaBar'
import PlayerTraitChips from './PlayerTraitChips'
import { useUiLang } from '../ui/UiLangContext'
import { UI_LANG } from '../ui/locale'
import { playerProfileStrings } from '../ui/strings/playerProfile'
import { scoutingStrings } from '../ui/strings/scouting'
import { resolveTeamName } from '../ui/locale'
import {
  scoutedValueDisplay,
  fatigueBandLabel,
  fatigueBandToneClass,
} from '../ui/fogOfWar'
import { currentMatchStamina } from '../matchEngine/stamina.js'

/** @param {{ knowledge: number }} props — znajomość zawodnika 0–100 (100 = własny zawodnik, dokładne wartości) */
function CategoryBlock({
  category,
  skills,
  knowledge = 100,
  isOwnPlayer = false,
  skillsSnapshots = null,
  growthTitle = '',
}) {
  const { lang } = useUiLang()
  const overall = Math.round(getCategoryOverall(skills, category))
  const keys = PLAYER_STAT_CATEGORIES[category]
  const labels = SUB_STAT_LABELS[category] ?? {}
  const overallDisplay = scoutedValueDisplay(overall, knowledge, lang)

  return (
    <section className="rounded-lg border border-ufa-border bg-ufa-bg/50 p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-ufa-text">{CATEGORY_LABELS[category]}</h3>
        {overallDisplay.kind === 'exact' ? (
          <span className="text-xs font-bold tabular-nums text-ufa-accent">{overallDisplay.label}</span>
        ) : (
          <span className={`text-xs font-bold ${overallDisplay.toneClass}`}>{overallDisplay.label}</span>
        )}
      </div>
      <ul className="space-y-2">
        {keys.map((key) => {
          const value = getSubStat(skills, category, key)
          const display = scoutedValueDisplay(value, knowledge, lang)
          const growth =
            isOwnPlayer && display.kind === 'exact'
              ? getSubStatGrowth(skillsSnapshots, skills, category, key)
              : null
          return (
            <li key={key} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-xs text-ufa-muted sm:w-[9.5rem] shrink-0">
                {labels[key] ?? key}
              </span>
              {display.kind === 'exact' ? (
                <div className="flex items-center gap-1.5">
                  <SkillBar value={value} />
                  {growth && growth.delta !== 0 && (
                    <span
                      className={`text-[11px] font-semibold tabular-nums ${
                        growth.delta > 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                      title={growthTitle}
                    >
                      ({growth.delta > 0 ? `+${growth.delta}` : growth.delta})
                    </span>
                  )}
                </div>
              ) : (
                <span className={`text-xs font-semibold ${display.toneClass}`}>{display.label}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function PlayerProfileModal({
  player,
  onClose,
  stamina = null,
  leaguePlayerStats = null,
  teamName = null,
  isOwnPlayer = true,
  knowledge = null,
  onExtendContract = null,
  onToggleTransferList = null,
  onProposeLoanOut = null,
  loanCounterpartyName = null,
  isShortlisted = false,
  onToggleShortlist = null,
  onScoutPlayer = null,
  scoutPending = false,
  scoutCost = null,
  onStartNegotiation = null,
}) {
  const effectiveKnowledge = knowledge ?? (isOwnPlayer ? 100 : 40)
  const { lang } = useUiLang()
  const t = playerProfileStrings(lang)
  const ts = scoutingStrings(lang)
  const [extendOpen, setExtendOpen] = useState(false)
  const [extendWage, setExtendWage] = useState('')
  const [extendYears, setExtendYears] = useState('3')
  const [extendBusy, setExtendBusy] = useState(false)
  const [extendFlash, setExtendFlash] = useState(null)
  const [scoutFlash, setScoutFlash] = useState(null)
  const [scoutBusy, setScoutBusy] = useState(false)

  useEffect(() => {
    if (!player) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player, onClose])

  useEffect(() => {
    setExtendOpen(false)
    setExtendFlash(null)
    if (player?.contract?.weeklyWage) {
      const demands = computePlayerContractDemands({
        player,
        sellerTeam: null,
        buyerTeam: null,
        renew: true,
      })
      setExtendWage(String(demands.minWeeklyWage ?? player.contract.weeklyWage))
      setExtendYears(String(demands.preferredYears ?? 3))
    }
  }, [player])

  if (!player) return null

  ensurePlayerMorale(player)
  ensurePlayerForm(player)
  ensurePlayerInjury(player)
  ensurePlayerContract(player)
  const skills = normalizePlayerSkills(player.skills ?? {})
  const ovr = getOverallRating(skills)
  const morale = getPlayerMorale(player)
  const form = getPlayerForm(player)
  const injured = isPlayerInjured(player)
  const contract = player.contract
  const s = seasonStatsForPlayer(leaguePlayerStats, player)
  const dominantHand = getDominantHand(player)
  const dominantLabel =
    dominantHand === DOMINANT_HAND.LEFT ? t.dominantLeft : t.dominantRight

  const handleExtendSubmit = () => {
    if (!onExtendContract || extendBusy) return
    setExtendBusy(true)
    setExtendFlash(null)
    const result = onExtendContract({
      playerId: player.id,
      weeklyWage: Math.round(Number(extendWage) || 0),
      years: Math.max(1, Math.min(5, Math.round(Number(extendYears) || 1))),
    })
    setExtendBusy(false)
    if (result?.completed) {
      setExtendFlash({ ok: true, text: t.extendAccepted })
      setExtendOpen(false)
    } else if (result?.ok === false) {
      setExtendFlash({ ok: false, text: result.error ?? t.extendRejected })
    } else {
      const msg =
        result?.playerEvaluation?.messageEn && lang === 'en'
          ? result.playerEvaluation.messageEn
          : result?.playerEvaluation?.message ?? t.extendRejected
      setExtendFlash({ ok: false, text: msg })
      if (result?.playerEvaluation?.counterWeeklyWage) {
        setExtendWage(String(result.playerEvaluation.counterWeeklyWage))
      }
    }
  }

  const handleScoutClick = () => {
    if (!onScoutPlayer || scoutBusy || scoutPending) return
    setScoutBusy(true)
    const result = onScoutPlayer(player.id)
    setScoutBusy(false)
    if (result?.ok) {
      setScoutFlash({ ok: true, text: ts.scoutQueued })
    } else {
      const errorKey = result?.error
      const text =
        errorKey === 'capacity'
          ? ts.errorCapacity
          : errorKey === 'insufficient_funds'
            ? ts.errorInsufficientFunds
            : ts.errorGeneric
      setScoutFlash({ ok: false, text })
    }
  }

  const extendPreview = previewContractOffer(
    Math.round(Number(extendWage) || 0),
    Math.max(1, Math.min(5, Math.round(Number(extendYears) || 1))),
  )
  const injuryDays = getInjuryDaysRemaining(player)
  const injuryLabel =
    lang === UI_LANG.EN
      ? injuryLabelEn(player.injury?.label) ?? player.injury?.label
      : player.injury?.label
  const teamObj =
    typeof teamName === 'object' && teamName
      ? teamName
      : UFA_LEAGUE_TEAMS.find((tm) => tm.players.some((p) => p.id === player.id))
  const teamLabel =
    (typeof teamName === 'string' && teamName) ||
    resolveTeamName(teamObj, lang) ||
    player.team ||
    '—'
  const fatigue = player.developmentFatigue ?? 0
  const matchFreshness = Math.round(currentMatchStamina(player))

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-0 sm:p-4 sm:pt-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-profile-title"
    >
      <button
        type="button"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        aria-label={t.closeAria}
        onClick={onClose}
      />
      <div className="relative z-10 mt-0 w-full max-w-3xl max-h-[min(92vh,100%)] overflow-auto rounded-t-xl sm:mt-0 sm:rounded-xl border border-ufa-border bg-ufa-panel shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ufa-border bg-ufa-panel/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-wide text-ufa-muted">{teamLabel}</p>
            <h2 id="player-profile-title" className="text-xl font-semibold text-ufa-text">
              #{player.jersey} {getPlayerFullName(player)}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ThrowingHandBadge player={player} />
              {player.age != null && (
                <span className="rounded bg-ufa-bg px-2 py-0.5 text-xs text-ufa-muted ring-1 ring-ufa-border">
                  {t.age} <span className="font-semibold text-ufa-text">{player.age}</span>
                </span>
              )}
              {player.nationality && (
                <span className="rounded bg-ufa-bg px-2 py-0.5 text-xs text-ufa-muted ring-1 ring-ufa-border">
                  {t.nationality}{' '}
                  <span className="font-semibold text-ufa-text">
                    {lang === UI_LANG.EN
                      ? (eucsCountryByName(player.nationality)?.labelEn ??
                        academyCountryByEnglishName(player.nationality)?.labelEn ??
                        player.nationality)
                      : (eucsCountryByName(player.nationality)?.labelPl ??
                        academyCountryByEnglishName(player.nationality)?.labelPl ??
                        player.nationality)}
                  </span>
                </span>
              )}
              {isOwnPlayer && (
                <span
                  className={`rounded bg-ufa-bg px-2 py-0.5 text-xs ring-1 ring-ufa-border ${fatigueBandToneClass(fatigue)}`}
                >
                  {t.fatigue} <span className="font-semibold">{fatigueBandLabel(fatigue, lang)}</span>
                </span>
              )}
              {isOwnPlayer && (
                <span
                  className={`rounded bg-ufa-bg px-2 py-0.5 text-xs ring-1 ring-ufa-border ${fatigueBandToneClass(100 - matchFreshness)}`}
                  title={`${matchFreshness}/100`}
                >
                  {t.matchFreshness}{' '}
                  <span className="font-semibold">{fatigueBandLabel(100 - matchFreshness, lang)}</span>
                </span>
              )}
              {injured ? (
                <span
                  className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400 ring-1 ring-red-500/40"
                  title={injuryStatusLabel(player, lang)}
                >
                  {t.injury} · {injuryDays} {t.days(injuryDays)}
                  {injuryLabel ? (
                    <span className="font-normal text-red-300/80"> · {injuryLabel}</span>
                  ) : null}
                </span>
              ) : null}
              <span
                className={`rounded bg-ufa-bg px-2 py-0.5 text-xs ring-1 ring-ufa-border ${formToneClass(form)}`}
              >
                {t.form} <span className="font-semibold">{formLabel(form, lang)}</span>
              </span>
              <span
                className={`rounded bg-ufa-bg px-2 py-0.5 text-xs ring-1 ring-ufa-border ${moraleToneClass(morale)}`}
              >
                {t.morale} <span className="font-semibold">{moraleLabel(morale, lang)}</span>
              </span>
              <span className="text-xs text-ufa-muted">
                {t.dominant}:{' '}
                <span className="font-medium text-ufa-text">{dominantLabel}</span>
              </span>
              {isOwnPlayer && (
                <span
                  className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-bold ${
                    ovr >= 85 ? 'bg-ufa-accent/20 text-ufa-accent' : 'bg-slate-700/50 text-slate-200'
                  }`}
                >
                  OVR {ovr}
                </span>
              )}
              {isOwnPlayer && player.transferListed && (
                <span className="rounded bg-ufa-gold/15 px-2 py-0.5 text-xs font-semibold text-ufa-gold ring-1 ring-ufa-gold/40">
                  {t.transferListedBadge}
                </span>
              )}
              {isOwnPlayer && player.loan && (
                <span className="rounded bg-ufa-gold/15 px-2 py-0.5 text-xs font-semibold text-ufa-gold ring-1 ring-ufa-gold/40">
                  {loanCounterpartyName
                    ? t.loanedInBadge(loanCounterpartyName, player.loan.returnDate)
                    : t.transferListedBadge}
                </span>
              )}
              <span
                className="rounded bg-ufa-bg px-2 py-0.5 text-xs text-ufa-gold ring-1 ring-ufa-border tabular-nums"
                title={t.marketValueTitle}
              >
                {formatUsdCompact(getPlayerMarketValue(player))}
              </span>
              {contract && (
                <span
                  className="rounded bg-ufa-bg px-2 py-0.5 text-xs text-ufa-accent ring-1 ring-ufa-border tabular-nums"
                  title={
                    isOwnPlayer
                      ? t.contractTitle(
                          formatUsd(contract.weeklyWage),
                          contract.years,
                          contract.weeksRemaining,
                        )
                      : undefined
                  }
                >
                  {isOwnPlayer
                    ? t.contractWeekShort(formatUsdCompact(contract.weeklyWage), contract.years)
                    : t.yearsShort(contract.years)}
                </span>
              )}
              {stamina != null && (
                <div className="min-w-[120px]">
                  <StaminaBar stamina={stamina} />
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-ufa-muted ring-1 ring-ufa-border hover:bg-ufa-panel-hover hover:text-ufa-text"
          >
            {t.close}
          </button>
        </div>

        {!isOwnPlayer && (onToggleShortlist || onScoutPlayer || onStartNegotiation) && (
          <div className="px-5 py-3 border-b border-ufa-border/80 flex flex-wrap items-center gap-2">
            {onStartNegotiation && (
              <button
                type="button"
                onClick={() => onStartNegotiation(player.id)}
                className="rounded-md bg-ufa-accent px-3 py-1.5 text-sm font-semibold text-ufa-bg hover:opacity-90"
              >
                {t.startNegotiation}
              </button>
            )}
            {onToggleShortlist && (
              <button
                type="button"
                onClick={() => onToggleShortlist(player.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ${
                  isShortlisted
                    ? 'bg-ufa-gold/15 text-ufa-gold ring-ufa-gold/40'
                    : 'text-ufa-text ring-ufa-border hover:bg-ufa-panel-hover'
                }`}
              >
                {isShortlisted ? ts.removeFromShortlist : ts.addToShortlist}
              </button>
            )}
            {onScoutPlayer && (
              <button
                type="button"
                onClick={handleScoutClick}
                disabled={scoutBusy || scoutPending}
                className="rounded-md bg-ufa-accent px-3 py-1.5 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
              >
                {scoutPending
                  ? ts.scoutPlayerPending
                  : scoutCost != null
                    ? `${ts.scoutPlayerButton} (${formatUsd(scoutCost)})`
                    : ts.scoutPlayerButton}
              </button>
            )}
            {scoutFlash && (
              <span className={`text-xs ${scoutFlash.ok ? 'text-ufa-accent' : 'text-red-400'}`}>
                {scoutFlash.text}
              </span>
            )}
          </div>
        )}

        <div className="px-5 py-4 border-b border-ufa-border/80 text-sm">
          <p className="text-xs uppercase tracking-wide text-ufa-muted mb-2">{t.contractSection}</p>
          {contract ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {isOwnPlayer && (
                <div>
                  <p className="text-xs text-ufa-muted">{t.weeklyWage}</p>
                  <p className="text-lg font-semibold tabular-nums">{formatUsd(contract.weeklyWage)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-ufa-muted">{t.years}</p>
                <p className="text-lg font-semibold tabular-nums">{contract.years}</p>
              </div>
              <div>
                <p className="text-xs text-ufa-muted">{t.remaining}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {t.weeks(contract.weeksRemaining)}
                </p>
              </div>
              {isOwnPlayer && (
                <div>
                  <p className="text-xs text-ufa-muted">{t.totalCost}</p>
                  <p className="text-lg font-semibold tabular-nums text-ufa-gold">
                    {formatUsd(contract.weeklyWage * (contract.weeksRemaining ?? 0))}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-ufa-muted text-xs">{t.noContract}</p>
          )}
          {isOwnPlayer && onExtendContract && !player.loan && (
            <div className="mt-3 space-y-2">
              {!extendOpen ? (
                <button
                  type="button"
                  onClick={() => setExtendOpen(true)}
                  className="rounded-md bg-ufa-accent/15 px-3 py-1.5 text-xs font-semibold text-ufa-accent ring-1 ring-ufa-accent/30 hover:bg-ufa-accent/25"
                >
                  {t.extendContract}
                </button>
              ) : (
                <div className="rounded-lg border border-ufa-border bg-ufa-bg/40 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-ufa-muted">
                      {t.extendWage}
                      <input
                        type="number"
                        value={extendWage}
                        onChange={(e) => setExtendWage(e.target.value)}
                        className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-panel px-2 py-1.5 text-sm text-ufa-text"
                      />
                    </label>
                    <label className="text-xs text-ufa-muted">
                      {t.extendYears}
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={extendYears}
                        onChange={(e) => setExtendYears(e.target.value)}
                        className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-panel px-2 py-1.5 text-sm text-ufa-text"
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-ufa-muted tabular-nums">
                    {formatUsd(extendPreview.totalCost)}
                  </p>
                  <button
                    type="button"
                    disabled={extendBusy}
                    onClick={handleExtendSubmit}
                    className="rounded-md bg-ufa-accent px-3 py-1.5 text-xs font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
                  >
                    {extendBusy ? t.extending : t.extendSubmit}
                  </button>
                </div>
              )}
              {extendFlash && (
                <p
                  className={`text-xs ${extendFlash.ok ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {extendFlash.text}
                </p>
              )}
            </div>
          )}
          {isOwnPlayer && onToggleTransferList && !player.loan && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => onToggleTransferList(player.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ring-1 ${
                  player.transferListed
                    ? 'bg-ufa-gold/15 text-ufa-gold ring-ufa-gold/40 hover:bg-ufa-gold/25'
                    : 'bg-ufa-bg text-ufa-text ring-ufa-border hover:bg-ufa-panel-hover'
                }`}
              >
                {player.transferListed ? t.removeFromTransferList : t.addToTransferList}
              </button>
            </div>
          )}
          {isOwnPlayer && onProposeLoanOut && !player.loan && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => onProposeLoanOut(player.id)}
                className="rounded-md px-3 py-1.5 text-xs font-semibold ring-1 bg-ufa-bg text-ufa-text ring-ufa-border hover:bg-ufa-panel-hover"
              >
                {t.proposeLoanOut}
              </button>
            </div>
          )}
        </div>

        {isOwnPlayer && (
          <div className="px-5 py-4 border-b border-ufa-border/80 text-sm">
            <p className="text-xs uppercase tracking-wide text-ufa-muted mb-2">{t.traits}</p>
            <PlayerTraitChips player={player} />
          </div>
        )}

        <div className="px-5 py-4 border-b border-ufa-border/80 text-sm">
          <p className="text-xs uppercase tracking-wide text-ufa-muted mb-2">{t.season}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-ufa-muted">{t.goals}</p>
              <p className="text-lg font-semibold tabular-nums">{s.goals}</p>
            </div>
            <div>
              <p className="text-xs text-ufa-muted">{t.assists}</p>
              <p className="text-lg font-semibold tabular-nums">{s.assists}</p>
            </div>
            <div>
              <p className="text-xs text-ufa-muted">{t.blocks}</p>
              <p className="text-lg font-semibold tabular-nums">{s.blocks}</p>
            </div>
            <div>
              <p className="text-xs text-ufa-muted">{t.pointsPlayed}</p>
              <p className="text-lg font-semibold tabular-nums">{s.pointsPlayed}</p>
              {s.pointsPlayedMatch > 0 && (
                <p className="text-[11px] text-ufa-muted mt-0.5">
                  {t.thisMatch(s.pointsPlayedMatch)}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-ufa-muted">{t.turnovers}</p>
              <p className="text-lg font-semibold tabular-nums">{s.turnovers}</p>
            </div>
            <div>
              <p className="text-xs text-ufa-muted">{t.plusMinus}</p>
              <p
                className={`text-lg font-semibold tabular-nums ${
                  s.plusMinus > 0 ? 'text-emerald-400' : s.plusMinus < 0 ? 'text-red-400' : ''
                }`}
              >
                {s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus}
              </p>
            </div>
            <div>
              <p className="text-xs text-ufa-muted">{t.completionPct}</p>
              <p className="text-lg font-semibold tabular-nums">
                {s.completionPct != null ? `${Math.round(s.completionPct)}%` : t.noData}
              </p>
            </div>
            <div>
              <p className="text-xs text-ufa-muted">{t.throwMeters}</p>
              <p className="text-lg font-semibold tabular-nums">{Math.round(s.throwMeters)}m</p>
              {s.avgThrowMetersPerAttempt != null && (
                <p className="text-[11px] text-ufa-muted mt-0.5">
                  {t.avgPerAttempt(s.avgThrowMetersPerAttempt.toFixed(1))}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-ufa-muted">{t.catchMeters}</p>
              <p className="text-lg font-semibold tabular-nums">{Math.round(s.catchMeters)}m</p>
              {s.avgCatchMetersPerCatch != null && (
                <p className="text-[11px] text-ufa-muted mt-0.5">
                  {t.avgPerCatch(s.avgCatchMetersPerCatch.toFixed(1))}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-ufa-muted">{t.runDistance}</p>
              <p className="text-lg font-semibold tabular-nums">{s.runKm.toFixed(1)} km</p>
            </div>
          </div>
        </div>

        <div className="p-5 grid gap-4 sm:grid-cols-2">
          {Object.keys(PLAYER_STAT_CATEGORIES).map((cat) => (
            <CategoryBlock
              key={cat}
              category={cat}
              skills={skills}
              knowledge={effectiveKnowledge}
              isOwnPlayer={isOwnPlayer}
              skillsSnapshots={player.skillsSnapshots}
              growthTitle={t.growthTitle}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
