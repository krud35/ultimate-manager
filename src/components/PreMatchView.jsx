import { useMemo } from 'react'
import {
  standingsTable,
  teamNameMap,
  parseISODate,
  pointDifferential,
} from '../league'
import { worldTeamById, getOpponentTacticsKnowledge } from '../career'
import { useUiLang } from '../ui/UiLangContext'
import { pickLabel } from '../ui/locale'
import { preMatchStrings } from '../ui/strings/preMatch'
import { scoutingStrings } from '../ui/strings/scouting'
import { scoutKnowledgeTier } from '../ui/fogOfWar'
import { TACTICS_MODIFIERS } from '../matchEngine/tacticsModifiers.js'

function daysBetweenIso(fromIso, toIso) {
  if (!fromIso || !toIso) return null
  const a = parseISODate(fromIso).getTime()
  const b = parseISODate(toIso).getTime()
  return Math.round((b - a) / 86_400_000)
}

function formatDayLabel(iso) {
  if (!iso) return '—'
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function teamLeaders(playerStats, teamId, limit = 5) {
  return Object.values(playerStats ?? {})
    .filter((row) => row.teamId === teamId)
    .map((row) => ({
      ...row,
      production: (row.goals ?? 0) + (row.assists ?? 0) + (row.blocks ?? 0),
    }))
    .sort((a, b) => {
      if (b.production !== a.production) return b.production - a.production
      if ((b.goals ?? 0) !== (a.goals ?? 0)) return (b.goals ?? 0) - (a.goals ?? 0)
      return (b.assists ?? 0) - (a.assists ?? 0)
    })
    .slice(0, limit)
}

function LeadersList({ leaders, emptyLabel }) {
  if (leaders.length === 0) {
    return <p className="text-xs text-ufa-muted">{emptyLabel}</p>
  }
  return (
    <ul className="space-y-1.5">
      {leaders.map((row, i) => (
        <li
          key={row.playerId ?? i}
          className="flex items-center justify-between gap-2 rounded-md border border-ufa-border/70 bg-ufa-bg/40 px-2.5 py-1.5 text-sm"
        >
          <span className="min-w-0 truncate text-ufa-text">
            <span className="text-ufa-muted tabular-nums mr-1.5">{i + 1}.</span>
            {row.firstName} {row.lastName}
          </span>
          <span className="shrink-0 tabular-nums text-xs text-ufa-muted">
            <span className="text-ufa-accent font-medium">{row.goals ?? 0}</span>G
            {' · '}
            <span className="text-ufa-gold font-medium">{row.assists ?? 0}</span>A
            {' · '}
            <span className="font-medium text-ufa-text">{row.blocks ?? 0}</span>B
          </span>
        </li>
      ))}
    </ul>
  )
}

function styleLabel(id, dict) {
  return dict?.[id]?.label ?? id ?? '—'
}

function ScoutingReportSection({ opponentTeam, opponentLeaders, tacticsKnowledge, t, ts, lang, onOpenTeam }) {
  const tier = scoutKnowledgeTier(tacticsKnowledge)
  const showExact = tier === 'range' || tier === 'exact'
  const tactics = opponentTeam?.tacticalIdentity ?? {}
  const forceSide = tactics.oLineCoachDirectives?.forceSide ?? tactics.dLineCoachDirectives?.forceSide

  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-lg shadow-black/20">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ufa-accent mb-3">
        {ts.scoutReportTitle}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ufa-muted mb-2">
            {ts.bestSevenTitle}
          </p>
          <LeadersList leaders={opponentLeaders} emptyLabel={t.noPlayerStats} />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ufa-muted">
              {ts.expectedStyleTitle}
            </p>
            <span className="text-xs text-ufa-muted tabular-nums">
              {ts.tacticsKnowledgeLabel}: {tacticsKnowledge}%
            </span>
          </div>
          {showExact ? (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-[10px] uppercase text-ufa-muted">O-Line</dt>
                <dd className="text-ufa-text">
                  {styleLabel(tactics.oLineAttackStyle ?? tactics.attackStyle, TACTICS_MODIFIERS.attack)}
                  {' / '}
                  {styleLabel(tactics.oLineDefenseStyle ?? tactics.defenseStyle, TACTICS_MODIFIERS.defense)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-ufa-muted">D-Line</dt>
                <dd className="text-ufa-text">
                  {styleLabel(tactics.dLineAttackStyle ?? tactics.attackStyle, TACTICS_MODIFIERS.attack)}
                  {' / '}
                  {styleLabel(tactics.dLineDefenseStyle ?? tactics.defenseStyle, TACTICS_MODIFIERS.defense)}
                </dd>
              </div>
              {forceSide && (
                <div className="col-span-2">
                  <dt className="text-[10px] uppercase text-ufa-muted">{ts.forceLabel}</dt>
                  <dd className="text-ufa-text">{styleLabel(forceSide, TACTICS_MODIFIERS.force)}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div>
              <p className="text-sm text-ufa-text">
                {opponentTeam?.aiCoachProfile ? pickLabel(opponentTeam.aiCoachProfile, lang) : '—'}
              </p>
              <p className="mt-1 text-xs text-ufa-muted">{ts.styleUnknownHint}</p>
            </div>
          )}
          {onOpenTeam && (
            <button
              type="button"
              onClick={() => onOpenTeam(opponentTeam.id)}
              className="mt-3 rounded-md border border-ufa-border px-3 py-1.5 text-xs text-ufa-text hover:bg-ufa-panel-hover"
            >
              {t.teamProfile}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TeamCard({
  teamId,
  teamName,
  standing,
  place,
  leaders,
  highlight = false,
  t,
  onOpenTeam,
}) {
  const record = standing
    ? `${standing.wins ?? 0}-${standing.losses ?? 0}`
    : '0-0'
  const diff = standing ? pointDifferential(standing) : 0
  const diffLabel = `${diff >= 0 ? '+' : ''}${diff}`

  return (
    <div
      className={`rounded-xl border bg-ufa-panel p-4 shadow-lg shadow-black/20 ${
        highlight ? 'border-ufa-accent/50' : 'border-ufa-border'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-ufa-muted">
            {highlight ? t.yourTeam : t.opponent}
          </p>
          <h3 className="mt-0.5 text-lg font-semibold text-ufa-text truncate">{teamName}</h3>
          <p className="mt-1 text-sm text-ufa-muted">
            {place != null ? `${place}. ${t.place}` : t.unranked}
            {' · '}
            <span className="tabular-nums text-ufa-text font-medium">{record}</span>
            {' · '}
            <span className="tabular-nums">{diffLabel}</span>
          </p>
        </div>
        {onOpenTeam && (
          <button
            type="button"
            onClick={() => onOpenTeam(teamId)}
            className="shrink-0 rounded-md border border-ufa-border px-3 py-1.5 text-xs text-ufa-text hover:bg-ufa-panel-hover"
          >
            {t.teamProfile}
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-ufa-border bg-ufa-bg/60 px-2 py-2">
          <p className="text-[10px] uppercase text-ufa-muted">{t.wins}</p>
          <p className="text-base font-semibold tabular-nums text-ufa-text">
            {standing?.wins ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-ufa-border bg-ufa-bg/60 px-2 py-2">
          <p className="text-[10px] uppercase text-ufa-muted">{t.losses}</p>
          <p className="text-base font-semibold tabular-nums text-ufa-text">
            {standing?.losses ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-ufa-border bg-ufa-bg/60 px-2 py-2">
          <p className="text-[10px] uppercase text-ufa-muted">{t.pointsDiff}</p>
          <p className="text-base font-semibold tabular-nums text-ufa-text">{diffLabel}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ufa-muted mb-2">
          {t.topPlayers}
        </p>
        <LeadersList leaders={leaders} emptyLabel={t.noPlayerStats} />
      </div>
    </div>
  )
}

/**
 * Okno przedmeczowe — gdy następny mecz jest w przyszłości.
 */
export default function PreMatchView({
  fixture,
  league,
  world = null,
  onNavigate,
  onOpenTeam = null,
  onSimulateUntilMatch = null,
  simulating = false,
}) {
  const { lang } = useUiLang()
  const t = preMatchStrings(lang)
  const ts = scoutingStrings(lang)
  const names = useMemo(() => teamNameMap(league), [league])
  const table = useMemo(
    () => standingsTable(league.standings ?? {}, (id) => names[id] ?? id),
    [league.standings, names],
  )

  const homeId = fixture.homeTeamId
  const awayId = fixture.awayTeamId
  const playerId = league.playerTeamId
  const homeHighlight = homeId === playerId
  const awayHighlight = awayId === playerId

  const homePlace = table.findIndex((r) => r.teamId === homeId) + 1 || null
  const awayPlace = table.findIndex((r) => r.teamId === awayId) + 1 || null
  const homeStanding = league.standings?.[homeId]
  const awayStanding = league.standings?.[awayId]

  const homeLeaders = useMemo(
    () => teamLeaders(league.playerStats, homeId, 5),
    [league.playerStats, homeId],
  )
  const awayLeaders = useMemo(
    () => teamLeaders(league.playerStats, awayId, 5),
    [league.playerStats, awayId],
  )

  const daysLeft = daysBetweenIso(league.currentDate, fixture.date)
  const canPlayNow = isFixtureMatchDay(fixture, league)
  const isCup = fixture.competition === 'cup'

  const opponentId = homeHighlight ? awayId : awayHighlight ? homeId : null
  const playerTeam = worldTeamById(world, playerId)
  const opponentTeam = worldTeamById(world, opponentId)
  const opponentLeaders7 = useMemo(
    () => teamLeaders(league.playerStats, opponentId, 7),
    [league.playerStats, opponentId],
  )
  const tacticsKnowledge = playerTeam && opponentId
    ? getOpponentTacticsKnowledge(playerTeam, opponentId)
    : 0

  return (
    <div className="space-y-5 league-fade-in">
      <div className="rounded-xl border border-ufa-accent/35 bg-ufa-panel p-5 shadow-xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-ufa-accent">
          {t.preMatch}
          {isCup ? ` · ${t.cup}` : ` · ${t.league}`}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4 sm:gap-8">
          <div className="text-center min-w-[8rem]">
            <p
              className={`text-sm font-medium truncate max-w-[12rem] ${
                homeHighlight ? 'text-ufa-accent' : 'text-ufa-text'
              }`}
            >
              {names[homeId] ?? homeId}
            </p>
          </div>
          <span className="text-xl font-bold text-ufa-muted">vs</span>
          <div className="text-center min-w-[8rem]">
            <p
              className={`text-sm font-medium truncate max-w-[12rem] ${
                awayHighlight ? 'text-ufa-accent' : 'text-ufa-text'
              }`}
            >
              {names[awayId] ?? awayId}
            </p>
          </div>
        </div>
        <p className="mt-3 text-center text-sm text-ufa-muted capitalize">
          {formatDayLabel(fixture.date)}
        </p>
        <p className="mt-1 text-center text-sm font-medium text-ufa-text">
          {canPlayNow
            ? t.matchDayToday
            : daysLeft == null
              ? t.matchScheduled
              : daysLeft <= 0
                ? t.matchDayToday
                : t.daysUntil(daysLeft)}
        </p>
        {!canPlayNow ? (
          <p className="mt-2 text-center text-xs text-ufa-muted">{t.hintPlayOnDay}</p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TeamCard
          teamId={homeId}
          teamName={names[homeId] ?? homeId}
          standing={homeStanding}
          place={homePlace || null}
          leaders={homeLeaders}
          highlight={homeHighlight}
          t={t}
          onOpenTeam={onOpenTeam}
        />
        <TeamCard
          teamId={awayId}
          teamName={names[awayId] ?? awayId}
          standing={awayStanding}
          place={awayPlace || null}
          leaders={awayLeaders}
          highlight={awayHighlight}
          t={t}
          onOpenTeam={onOpenTeam}
        />
      </div>

      {world && opponentTeam && (
        <ScoutingReportSection
          opponentTeam={opponentTeam}
          opponentLeaders={opponentLeaders7}
          tacticsKnowledge={tacticsKnowledge}
          t={t}
          ts={ts}
          lang={lang}
          onOpenTeam={onOpenTeam}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onNavigate?.('hub')}
          className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
        >
          {t.backHub}
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.('calendar')}
          className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
        >
          {t.calendar}
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.('team-schedule')}
          className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
        >
          {t.teamSchedule}
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.('standings')}
          className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
        >
          {t.standings}
        </button>
        {onSimulateUntilMatch && !canPlayNow && (
          <button
            type="button"
            onClick={onSimulateUntilMatch}
            disabled={simulating}
            className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
          >
            {simulating ? t.simulating : t.simUntilMatch}
          </button>
        )}
      </div>
    </div>
  )
}

export function isFixtureMatchDay(fixture, league) {
  if (!fixture?.date || !league?.currentDate) return false
  if (fixture.status === 'completed') return false
  // Dziś lub zaległy — nie przyszły.
  return fixture.date <= league.currentDate
}
