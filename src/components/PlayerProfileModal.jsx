import { useEffect } from 'react'
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
import { formatUsd, formatUsdCompact, getPlayerMarketValue, ensurePlayerContract } from '../career'
import { SkillBar, ThrowingHandBadge } from './TeamRosterPanel'
import StaminaBar from './StaminaBar'
import PlayerTraitChips from './PlayerTraitChips'
import { useUiLang } from '../ui/UiLangContext'
import { UI_LANG } from '../ui/locale'
import { playerProfileStrings } from '../ui/strings/playerProfile'
import { resolveTeamName } from '../ui/locale'

function CategoryBlock({ category, skills }) {
  const overall = Math.round(getCategoryOverall(skills, category))
  const keys = PLAYER_STAT_CATEGORIES[category]
  const labels = SUB_STAT_LABELS[category] ?? {}

  return (
    <section className="rounded-lg border border-ufa-border bg-ufa-bg/50 p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-ufa-text">{CATEGORY_LABELS[category]}</h3>
        <span className="text-xs font-bold tabular-nums text-ufa-accent">{overall}</span>
      </div>
      <ul className="space-y-2">
        {keys.map((key) => (
          <li key={key} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-xs text-ufa-muted sm:w-[9.5rem] shrink-0">
              {labels[key] ?? key}
            </span>
            <SkillBar value={getSubStat(skills, category, key)} />
          </li>
        ))}
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
}) {
  const { lang } = useUiLang()
  const t = playerProfileStrings(lang)

  useEffect(() => {
    if (!player) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player, onClose])

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
              {player.potential != null && (
                <span className="rounded bg-ufa-accent/10 px-2 py-0.5 text-xs text-ufa-accent ring-1 ring-ufa-accent/30">
                  POT {player.potential}
                </span>
              )}
              {player.developmentFatigue != null && player.developmentFatigue > 0 && (
                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400 ring-1 ring-amber-500/30">
                  {t.fatigue} {player.developmentFatigue}
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
                title={t.formTitle(form)}
              >
                {t.form} <span className="font-semibold">{form}</span>
                <span className="text-ufa-muted font-normal"> · {formLabel(form, lang)}</span>
              </span>
              <span
                className={`rounded bg-ufa-bg px-2 py-0.5 text-xs ring-1 ring-ufa-border ${moraleToneClass(morale)}`}
                title={t.moraleTitle(morale)}
              >
                {t.morale} <span className="font-semibold">{morale}</span>
                <span className="text-ufa-muted font-normal"> · {moraleLabel(morale, lang)}</span>
              </span>
              <span className="text-xs text-ufa-muted">
                {t.dominant}:{' '}
                <span className="font-medium text-ufa-text">{dominantLabel}</span>
              </span>
              <span
                className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-bold ${
                  ovr >= 85 ? 'bg-ufa-accent/20 text-ufa-accent' : 'bg-slate-700/50 text-slate-200'
                }`}
              >
                OVR {ovr}
              </span>
              <span
                className="rounded bg-ufa-bg px-2 py-0.5 text-xs text-ufa-gold ring-1 ring-ufa-border tabular-nums"
                title={t.marketValueTitle}
              >
                {formatUsdCompact(getPlayerMarketValue(player))}
              </span>
              {contract && (
                <span
                  className="rounded bg-ufa-bg px-2 py-0.5 text-xs text-ufa-accent ring-1 ring-ufa-border tabular-nums"
                  title={t.contractTitle(
                    formatUsd(contract.weeklyWage),
                    contract.years,
                    contract.weeksRemaining,
                  )}
                >
                  {t.contractWeekShort(formatUsdCompact(contract.weeklyWage), contract.years)}
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

        <div className="px-5 py-4 border-b border-ufa-border/80 text-sm">
          <p className="text-xs uppercase tracking-wide text-ufa-muted mb-2">{t.contractSection}</p>
          {contract ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-ufa-muted">{t.weeklyWage}</p>
                <p className="text-lg font-semibold tabular-nums">{formatUsd(contract.weeklyWage)}</p>
              </div>
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
              <div>
                <p className="text-xs text-ufa-muted">{t.totalCost}</p>
                <p className="text-lg font-semibold tabular-nums text-ufa-gold">
                  {formatUsd(contract.weeklyWage * (contract.weeksRemaining ?? 0))}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-ufa-muted text-xs">{t.noContract}</p>
          )}
        </div>

        <div className="px-5 py-4 border-b border-ufa-border/80 text-sm">
          <p className="text-xs uppercase tracking-wide text-ufa-muted mb-2">{t.traits}</p>
          <PlayerTraitChips player={player} />
        </div>

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
          </div>
        </div>

        <div className="p-5 grid gap-4 sm:grid-cols-2">
          {Object.keys(PLAYER_STAT_CATEGORIES).map((cat) => (
            <CategoryBlock key={cat} category={cat} skills={skills} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
