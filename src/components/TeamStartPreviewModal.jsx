import { useMemo } from 'react'
import { buildTeamRoster } from '../data/playerStatsFromUfa.js'
import {
  applyRandomOvrBands,
  rollRandomSkillsForRoster,
} from '../data/randomRosterSkills.js'
import {
  getCategoryOverall,
  getOverallRating,
  readCategorySkill,
} from '../models/playerStats.js'
import { getPlayerFullName } from '../data/mockPlayers'
import { resolveTeamName } from '../ui/locale'

const CATEGORIES = [
  { id: 'throwing', label: 'THR' },
  { id: 'physical', label: 'PHY' },
  { id: 'mental', label: 'MEN' },
  { id: 'offensive', label: 'OFF' },
  { id: 'defensive', label: 'DEF' },
]

function hashSeed(...parts) {
  let h = 2166136261
  for (const part of parts) {
    const s = String(part)
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  return h >>> 0
}

/**
 * Buduje podgląd startowy drużyny (skills jak przy starcie kariery).
 */
export function buildTeamStartPreview(rawTeam, { rosterMode = 'historical', seasonYear = 2025 } = {}) {
  if (!rawTeam) return null
  const idStart = hashSeed(seasonYear, rawTeam.id, 'preview') % 900000 + 1000
  let players = buildTeamRoster(
    rawTeam.namePl ?? rawTeam.name,
    rawTeam.players ?? [],
    idStart,
    rosterMode === 'historical'
      ? { mode: 'historical', balance: false }
      : { mode: 'equalized', balance: false },
  )

  if (rosterMode === 'random') {
    const seed = `${seasonYear}:${rawTeam.id}:preview`
    players = rollRandomSkillsForRoster(players, seed)
    applyRandomOvrBands(players, `${seed}:ovr`)
  }

  const n = players.length || 1
  let ovrSum = 0
  const catSums = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]))
  for (const p of players) {
    ovrSum += getOverallRating(p.skills)
    for (const c of CATEGORIES) {
      catSums[c.id] += getCategoryOverall(p.skills, c.id)
    }
  }

  const byOvr = [...players].sort(
    (a, b) => getOverallRating(b.skills) - getOverallRating(a.skills),
  )

  const wins = rawTeam.wins ?? null
  const losses = rawTeam.losses ?? null
  const games =
    wins != null && losses != null ? wins + losses : null
  const winPct =
    games != null && games > 0 ? wins / games : null

  return {
    team: rawTeam,
    players: byOvr,
    averages: {
      ovr: Math.round(ovrSum / n),
      categories: Object.fromEntries(
        CATEGORIES.map((c) => [c.id, Math.round(catSums[c.id] / n)]),
      ),
    },
    record: {
      wins,
      losses,
      games,
      winPct,
      isFictional: !!rawTeam.isFictional,
    },
  }
}

function AvgPill({ label, value }) {
  return (
    <div className="rounded-lg border border-ufa-border bg-ufa-bg/60 px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-ufa-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-ufa-text">{value}</p>
    </div>
  )
}

/**
 * Modal: średnie atrybuty, roster, historyczny bilans sezonu.
 */
export default function TeamStartPreviewModal({
  preview,
  lang,
  labels,
  onClose,
  onSelect,
}) {
  const team = preview?.team
  const title = team ? resolveTeamName(team, lang) : ''

  const recordLabel = useMemo(() => {
    if (!preview?.record || preview.record.isFictional) return labels.previewNoRecord
    const { wins, losses, winPct } = preview.record
    if (wins == null || losses == null) return labels.previewNoRecord
    const pct =
      winPct != null ? ` · ${(winPct * 100).toFixed(0)}%` : ''
    return labels.previewRecord(wins, losses, pct)
  }, [preview, labels])

  if (!preview || !team) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label={labels.previewClose}
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-xl sm:rounded-xl border border-ufa-border bg-ufa-panel shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-ufa-border px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: team.primaryColor }}
            >
              {team.shortName}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ufa-text truncate">{title}</h2>
              <p className="text-xs text-ufa-muted">
                {labels.rosterCount(preview.players.length)}
                {team.isFictional ? ` · ${labels.fictionalBadge}` : ''}
              </p>
              <p className="mt-0.5 text-xs text-ufa-gold">{recordLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-muted hover:text-ufa-text"
          >
            {labels.previewClose}
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ufa-muted mb-2">
              {labels.previewAverages}
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <AvgPill label="OVR" value={preview.averages.ovr} />
              {CATEGORIES.map((c) => (
                <AvgPill
                  key={c.id}
                  label={c.label}
                  value={preview.averages.categories[c.id]}
                />
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ufa-muted mb-2">
              {labels.previewRoster}
            </h3>
            <div className="overflow-x-auto rounded-lg border border-ufa-border">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-ufa-muted bg-ufa-bg/60">
                  <tr className="border-b border-ufa-border">
                    <th className="px-2 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">{labels.previewPlayer}</th>
                    <th className="px-2 py-2 font-medium text-center">OVR</th>
                    <th className="px-2 py-2 font-medium text-center">THR</th>
                    <th className="px-2 py-2 font-medium text-center">PHY</th>
                    <th className="px-2 py-2 font-medium text-center">MEN</th>
                    <th className="px-2 py-2 font-medium text-center">OFF</th>
                    <th className="px-2 py-2 font-medium text-center">DEF</th>
                    <th
                      className="px-2 py-2 font-medium text-center"
                      title={lang === 'en' ? 'Goals' : 'Gole'}
                    >
                      G
                    </th>
                    <th
                      className="px-2 py-2 font-medium text-center"
                      title={lang === 'en' ? 'Assists' : 'Asysty'}
                    >
                      A
                    </th>
                    <th
                      className="px-2 py-2 font-medium text-center"
                      title={lang === 'en' ? 'Blocks' : 'Bloki'}
                    >
                      B
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.players.map((p) => {
                    const ovr = getOverallRating(p.skills)
                    const ref = p.ufaReference ?? {}
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-ufa-border/60 hover:bg-ufa-bg/40"
                      >
                        <td className="px-2 py-1.5 tabular-nums text-ufa-muted">
                          {p.jersey || '—'}
                        </td>
                        <td className="px-2 py-1.5 font-medium text-ufa-text whitespace-nowrap">
                          {getPlayerFullName(p)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span
                            className={`inline-flex min-w-7 justify-center rounded px-1 text-xs font-bold ${
                              ovr >= 85
                                ? 'bg-ufa-accent/20 text-ufa-accent'
                                : 'text-ufa-text'
                            }`}
                          >
                            {ovr}
                          </span>
                        </td>
                        {CATEGORIES.map((c) => (
                          <td
                            key={c.id}
                            className="px-2 py-1.5 text-center tabular-nums text-ufa-muted text-xs"
                          >
                            {Math.round(readCategorySkill(p.skills, c.id))}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-center tabular-nums text-ufa-muted text-xs">
                          {ref.goals ?? 0}
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-ufa-muted text-xs">
                          {ref.assists ?? 0}
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-ufa-muted text-xs">
                          {ref.blocks ?? 0}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-ufa-muted">{labels.previewUfaHint}</p>
          </section>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-ufa-border px-5 py-3">
          {onSelect && (
            <button
              type="button"
              onClick={() => onSelect(team.id)}
              className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
            >
              {labels.previewSelect}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-muted hover:text-ufa-text"
          >
            {labels.previewClose}
          </button>
        </div>
      </div>
    </div>
  )
}
