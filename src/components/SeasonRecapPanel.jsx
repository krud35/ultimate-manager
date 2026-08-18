import {
  standingsTable,
  teamNameMap,
  topLeaders,
  getLeagueChampionTeamId,
  areCompetitionsComplete,
  isOfficialSeasonEnded,
  officialSeasonEndDate,
} from '../league'
import { worldTeamById, getTransferBudget, formatUsd } from '../career'
import { useUiLang } from '../ui/UiLangContext'
import { displaySeasonLabel } from '../ui/locale'
import { seasonRecapStrings } from '../ui/strings/seasonRecap'
import { shadowStandingsThroughRound, simulateShadowMatchResult } from '../league/shadowLeague.js'
import { computePyramidMovement } from '../league/promotionRelegation.js'
import { eucsTeamById, eucsTeamStrength } from '../data/eucsLeagueTeams.js'

function previewHashSeed(...parts) {
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
 * Projekcja awansów/spadków na bazie tabel „na dziś" (nie mutuje niczego) — do
 * podglądu w recapie, zanim gracz faktycznie przejdzie do kolejnego sezonu.
 */
function computeEucsMovementPreview(career, playerTierIds) {
  if (career?.competition !== 'eucs' || !career.pyramid) return null
  const tables = { [career.pyramid.tier]: playerTierIds }
  for (const [tierNumStr, shadowLeague] of Object.entries(career.pyramid.otherTiers ?? {})) {
    tables[Number(tierNumStr)] = shadowStandingsThroughRound(shadowLeague, null).map((r) => r.teamId)
  }
  if (!tables[1] || !tables[2] || !tables[3]) return null
  const resolveMatch = (a, b) => {
    const result = simulateShadowMatchResult(
      eucsTeamStrength(a),
      eucsTeamStrength(b),
      previewHashSeed('pyramid-preview', a, b),
    )
    return result.winner === 'A' ? a : b
  }
  try {
    return computePyramidMovement({
      tier1Table: tables[1],
      tier2Table: tables[2],
      tier3Table: tables[3],
      resolveMatch,
    })
  } catch {
    return null
  }
}

function eucsName(id) {
  return eucsTeamById(id)?.name ?? id
}

function PyramidMovementSection({ career, playerTierIds, t }) {
  const movement = computeEucsMovementPreview(career, playerTierIds)
  if (!movement) return null

  const tier = career.pyramid.tier
  const idx = playerTierIds.indexOf(career.playerTeamId)
  let status = t.pyramidStatusSafe
  if (tier !== 1 && idx < 2) status = t.pyramidStatusPromoteDirect
  else if (tier !== 1 && idx < 6) status = t.pyramidStatusPlayoff
  else if (tier !== 3 && idx >= playerTierIds.length - 3) status = t.pyramidStatusRelegate

  const groups = new Map()
  for (const m of movement.movements) {
    const label = m.reason.startsWith('promoted')
      ? t.pyramidMovePromotedTo(m.to)
      : t.pyramidMoveRelegatedFrom(m.from)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(eucsName(m.teamId))
  }

  return (
    <div className="mt-5 rounded-lg border border-ufa-border bg-ufa-panel px-4 py-3">
      <p className="text-sm font-semibold text-ufa-text">{t.pyramidMovementTitle}</p>
      <p className="mt-1 text-xs font-medium text-ufa-accent">{status}</p>
      <ul className="mt-2 space-y-1 text-xs text-ufa-muted">
        {[...groups.entries()].map(([label, teams]) => (
          <li key={label}>
            <span className="text-ufa-text">{label}:</span> {teams.join(', ')}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-ufa-muted">{t.pyramidMovementHint}</p>
    </div>
  )
}

/**
 * Podsumowanie po zakończeniu rozgrywek (mecze skończone) — przed 31 lipca.
 */
export function SeasonSummaryPanel({ career, onViewStandings, onOpenTransfers = null }) {
  const { lang } = useUiLang()
  const t = seasonRecapStrings(lang)
  const league = career.league
  const names = teamNameMap(league, lang)
  const table = standingsTable(league.standings, (id) => names[id])
  const championId = getLeagueChampionTeamId(league)
  const championName = championId ? names[championId] ?? championId : '—'
  const place = table.findIndex((r) => r.teamId === career.playerTeamId) + 1
  const standing = league.standings[career.playerTeamId]
  const cupChampion =
    league.cup?.championTeamId != null
      ? names[league.cup.championTeamId] ?? league.cup.championTeamId
      : null
  const leaders = topLeaders(league.playerStats, 'goals', 5)
  const officialEnd =
    league.calendar?.officialEndDate ??
    officialSeasonEndDate(league.calendar ?? league.seasonYear)

  return (
    <div className="rounded-xl border border-ufa-gold/35 bg-ufa-panel p-6 shadow-xl shadow-black/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-ufa-gold">{t.compsDone}</p>
      <h2 className="mt-2 text-xl font-bold text-ufa-text">
        {displaySeasonLabel(league.seasonLabel, lang)}
      </h2>
      <p className="mt-2 text-sm text-ufa-text">
        {t.leagueChampion}:{' '}
        <span className="font-semibold text-ufa-gold">{championName}</span>
        {cupChampion ? (
          <>
            {' · '}
            {t.cup}: <span className="font-semibold text-ufa-accent">{cupChampion}</span>
          </>
        ) : null}
      </p>
      <p className="mt-1 text-sm text-ufa-muted">
        {t.yourPlace}: {place || '—'} · {standing?.wins ?? 0}-{standing?.losses ?? 0}
        {officialEnd ? ` · ${t.officialEnd}: ${officialEnd}` : ''}
      </p>

      {leaders.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ufa-muted mb-2">
            {t.topScorers}
          </h3>
          <ul className="space-y-1 text-sm">
            {leaders.map((row, i) => (
              <li key={row.playerId ?? i} className="flex justify-between gap-3 text-ufa-muted">
                <span className="text-ufa-text truncate">
                  {i + 1}. {row.firstName} {row.lastName}
                  <span className="text-ufa-muted"> · {names[row.teamId] ?? ''}</span>
                </span>
                <span className="tabular-nums text-ufa-accent font-medium">{row.goals ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-ufa-muted">{t.summaryHint}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        {onViewStandings && (
          <button
            type="button"
            onClick={onViewStandings}
            className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
          >
            {t.fullTable}
          </button>
        )}
        {onOpenTransfers && (
          <button
            type="button"
            onClick={onOpenTransfers}
            className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
          >
            {t.transfers}
          </button>
        )}
      </div>
    </div>
  )
}

export default function SeasonRecapPanel({
  career,
  onStartNextSeason,
  onViewStandings,
  onOpenTransfers = null,
}) {
  const { lang } = useUiLang()
  const t = seasonRecapStrings(lang)
  const league = career.league
  const names = teamNameMap(league, lang)
  const table = standingsTable(league.standings, (id) => names[id])
  const championId = getLeagueChampionTeamId(league)
  const championName = championId ? names[championId] ?? championId : '—'
  const place = table.findIndex((r) => r.teamId === career.playerTeamId) + 1
  const standing = league.standings[career.playerTeamId]
  const team = worldTeamById(career.world, career.playerTeamId)
  const budget = getTransferBudget(team)
  const history = career.seasonHistory ?? []
  const lastArchive =
    history.find(
      (s) => s.seasonIndex === career.seasonIndex && s.seasonYear === career.seasonYear,
    ) ?? history[history.length - 1]
  const cupChampion =
    league.cup?.championTeamId != null
      ? names[league.cup.championTeamId] ?? league.cup.championTeamId
      : lastArchive?.cupChampionId
        ? names[lastArchive.cupChampionId] ?? lastArchive.cupChampionId
        : null
  const leaders = topLeaders(league.playerStats ?? lastArchive?.playerStats, 'goals', 5)
  const nextLabel = t.nextLeague(
    career.seasonYear + 1,
    String(career.seasonYear + 2).slice(-2),
  )
  const atOfficialEnd =
    isOfficialSeasonEnded(league) || career.phase === 'season_complete'

  return (
    <div className="rounded-xl border border-ufa-gold/40 bg-ufa-panel p-6 shadow-xl shadow-black/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-ufa-gold">
        {atOfficialEnd ? t.seasonEndOfficial : t.seasonEnded}
      </p>
      <h2 className="mt-2 text-xl font-bold text-ufa-text">
        {displaySeasonLabel(league.seasonLabel, lang)} · {team?.name}
      </h2>

      <div className="mt-3 rounded-lg border border-ufa-gold/30 bg-ufa-gold/10 px-4 py-3">
        <p className="text-sm font-semibold text-ufa-gold">
          {t.leagueChampion}: {championName}
        </p>
        {cupChampion && (
          <p className="mt-1 text-xs text-ufa-muted">
            {t.cup}: <span className="text-ufa-accent">{cupChampion}</span>
          </p>
        )}
      </div>

      <p className="mt-3 text-sm text-ufa-muted">
        {t.yourPlace} {place || '—'} · {t.record}{' '}
        {standing?.wins ?? lastArchive?.wins ?? 0}-
        {standing?.losses ?? lastArchive?.losses ?? 0}
        {standing
          ? ` · ${t.pointDiff} ${standing.pointsFor - standing.pointsAgainst >= 0 ? '+' : ''}${standing.pointsFor - standing.pointsAgainst}`
          : ''}
      </p>

      {leaders.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ufa-muted mb-2">
            {t.scorersSummary}
          </h3>
          <ul className="space-y-1 text-sm">
            {leaders.map((row, i) => (
              <li key={row.playerId ?? i} className="flex justify-between gap-3 text-ufa-muted">
                <span className="text-ufa-text truncate">
                  {i + 1}. {row.firstName} {row.lastName}
                </span>
                <span className="tabular-nums text-ufa-accent">{row.goals ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-ufa-accent/30 bg-ufa-accent/5 px-4 py-3">
        <p className="text-sm font-semibold text-ufa-accent">{t.transferWindow}</p>
        <p className="mt-1 text-xs text-ufa-muted">
          {t.budget}: {formatUsd(budget)}. {t.transferBudgetHint}
        </p>
      </div>

      {history.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-ufa-text">{t.careerHistory}</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ufa-muted">
            {history.map((season) => (
              <li key={`${season.seasonYear}-${season.seasonIndex}`}>
                <span className="text-ufa-text">
                  {displaySeasonLabel(season.seasonLabel, lang)}
                </span>
                {' · '}
                {t.placeN(season.finalPlace)} · {season.wins}-{season.losses}
              </li>
            ))}
          </ul>
        </div>
      )}

      {career.competition === 'eucs' && (
        <PyramidMovementSection
          career={career}
          playerTierIds={table.map((r) => r.teamId)}
          t={t}
        />
      )}

      {lastArchive && (
        <p className="mt-4 text-xs text-ufa-muted">{t.archiveNote(nextLabel)}</p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {onOpenTransfers && (
          <button
            type="button"
            onClick={onOpenTransfers}
            className="rounded-md border border-ufa-border px-5 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
          >
            {t.transfers}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const ok = window.confirm(t.confirmNext(nextLabel))
            if (!ok) return
            onStartNextSeason?.()
          }}
          className="rounded-md bg-ufa-accent px-5 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
        >
          {t.goToNext(nextLabel)}
        </button>
        {onViewStandings && (
          <button
            type="button"
            onClick={onViewStandings}
            className="rounded-md border border-ufa-border px-5 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
          >
            {t.viewTable}
          </button>
        )}
      </div>
    </div>
  )
}

/** Czy pokazać lekkie podsumowanie (mecze skończone, jeszcze przed 31 lipca). */
export function shouldShowSeasonSummary(career) {
  const league = career?.league
  if (!league || career.phase === 'season_complete') return false
  if (!areCompetitionsComplete(league)) return false
  return !isOfficialSeasonEnded(league)
}
