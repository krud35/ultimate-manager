import TacticsForm from './TacticsForm'
import { pointStartRoleForTeam } from '../matchEngine'
import { useUiLang } from '../ui/UiLangContext'
import { tacticsStrings } from '../ui/strings/tactics'
import { matchStrings } from '../ui/strings/match'

function PointStartBadge({ role, t }) {
  const isOffense = role === 'offense'
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-3 py-1 text-sm font-semibold ${
        isOffense
          ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40'
          : 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40'
      }`}
    >
      {isOffense ? t.startOffense : t.startDefense}
    </span>
  )
}

/**
 * Panel przed punktem: skład 7 + taktyka ataku/obrony + force.
 */
export default function LineupSelector({
  session,
  playerTeam,
  playerSide,
  pullTeam,
  tactics,
  onTacticsChange,
  staminaMap,
  onPlayPoint,
  onEnterPointByPoint,
  lineupError,
  playDisabled = false,
  playLabel,
  onSimulateToEnd,
  /** Przed 1. punktem: edycja obu domyślnych siódemek O/D. */
  editDefaultLines = false,
  leaguePlayerStats = null,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const tm = matchStrings(lang)
  const pointStartRole = pointStartRoleForTeam(playerSide, pullTeam)
  const pointNumber = session?.pointIndex ?? 1
  const lineupMode = editDefaultLines ? 'dual' : 'single'
  /** Sesja trzyma aktualne kontuzje z meczu — roster drużyny poza meczem jeszcze nie. */
  const roster = session?.[playerSide]?.players ?? playerTeam?.players ?? []

  return (
    <div className="rounded-xl border border-ufa-accent/40 bg-ufa-panel p-5 shadow-lg shadow-black/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="font-semibold text-ufa-text">
            {editDefaultLines ? t.prepTitle : t.pointLineupTitle(pointNumber)}
          </h3>
          {editDefaultLines ? (
            <p className="text-xs text-ufa-muted mt-1">{t.setDefaultLines}</p>
          ) : null}
        </div>
        {!editDefaultLines ? <PointStartBadge role={pointStartRole} t={t} /> : null}
      </div>

      {lineupError ? (
        <p className="mb-3 text-sm text-red-400">{lineupError}</p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={playDisabled}
          onClick={onPlayPoint}
          className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
        >
          {playLabel}
        </button>
        {onEnterPointByPoint ? (
          <button
            type="button"
            onClick={onEnterPointByPoint}
            className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
          >
            {tm.switchPointByPoint}
          </button>
        ) : null}
        {onSimulateToEnd ? (
          <button
            type="button"
            disabled={playDisabled}
            onClick={onSimulateToEnd}
            className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
          >
            {tm.simToEnd}
          </button>
        ) : null}
      </div>

      <TacticsForm
        roster={roster}
        tactics={tactics}
        onTacticsChange={onTacticsChange}
        staminaMap={staminaMap}
        lineupMode={lineupMode}
        pointStartRole={pointStartRole}
        teamName={playerTeam?.name}
        leaguePlayerStats={leaguePlayerStats}
        compact
      />
    </div>
  )
}
