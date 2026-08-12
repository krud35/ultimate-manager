import { useState } from 'react'
import { topLeaders, topPlusMinusLeaders, teamNameMap } from '../league'
import { useUiLang } from '../ui/UiLangContext'
import { leagueViewsStrings } from '../ui/strings/leagueViews'
import { resolveTeamName } from '../ui/locale'
import {
  worldTeamById,
  getPlayerKnowledge,
  isPlayerShortlisted,
  toggleShortlist,
  hasPendingScoutMission,
  queueScoutMission,
  scoutMissionCost,
} from '../career'
import PlayerProfileModal from './PlayerProfileModal'

function LeaderColumn({ title, rows, valueKey, teamNames, emptyLabel, onSelectPlayer }) {
  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-lg shadow-black/20">
      <h3 className="font-semibold text-ufa-text text-sm mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-ufa-muted">{emptyLabel}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row, i) => (
            <li key={row.playerId} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ufa-muted w-5 tabular-nums">{i + 1}.</span>
              <button
                type="button"
                onClick={() => onSelectPlayer(row)}
                className="flex-1 min-w-0 truncate text-left text-ufa-text hover:text-ufa-accent hover:underline"
              >
                {row.firstName} {row.lastName}
                <span className="text-xs text-ufa-muted ml-1">
                  ({teamNames[row.teamId]?.split(' ').pop()})
                </span>
              </button>
              <span className="font-semibold tabular-nums text-ufa-accent">{row[valueKey]}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default function LeagueLeadersView({ league, career, onCareerUpdate }) {
  const { lang } = useUiLang()
  const t = leagueViewsStrings(lang)
  const teamNames = teamNameMap(league, lang)
  const goals = topLeaders(league.playerStats, 'goals', 10)
  const assists = topLeaders(league.playerStats, 'assists', 10)
  const blocks = topLeaders(league.playerStats, 'blocks', 10)
  const plusMinus = topPlusMinusLeaders(league.playerStats, 10)
  const pointsPlayed = topLeaders(league.playerStats, 'pointsPlayed', 10)

  const [profilePlayer, setProfilePlayer] = useState(null)
  const [profileTeam, setProfileTeam] = useState(null)

  const world = career?.world
  const viewerTeam = world && career?.playerTeamId ? worldTeamById(world, career.playerTeamId) : null

  function handleSelectPlayer(row) {
    const team = world ? worldTeamById(world, row.teamId) : null
    const player = team?.players?.find((p) => p.id === row.playerId) ?? null
    if (!player) return
    setProfilePlayer(player)
    setProfileTeam(team)
  }

  const isOwnPlayer = Boolean(profileTeam && profileTeam.id === career?.playerTeamId)

  function handleScout(playerId) {
    if (!viewerTeam || !profileTeam) return { ok: false, error: 'no_team' }
    const result = queueScoutMission(viewerTeam, {
      kind: 'player',
      targetPlayerId: playerId,
      opponentTeamId: profileTeam.id,
      date: career?.league?.currentDate ?? null,
    })
    if (result.ok) onCareerUpdate?.({ world })
    return result
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <h2 className="text-lg font-semibold text-ufa-text">{t.leadersTitle}</h2>
        <p className="mt-1 text-sm text-ufa-muted">{t.leadersHint}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <LeaderColumn
          title={`${t.goals} (G)`}
          rows={goals}
          valueKey="goals"
          teamNames={teamNames}
          emptyLabel={t.noData}
          onSelectPlayer={handleSelectPlayer}
        />
        <LeaderColumn
          title={`${t.assists} (A)`}
          rows={assists}
          valueKey="assists"
          teamNames={teamNames}
          emptyLabel={t.noData}
          onSelectPlayer={handleSelectPlayer}
        />
        <LeaderColumn
          title={`${t.blocks} (D)`}
          rows={blocks}
          valueKey="blocks"
          teamNames={teamNames}
          emptyLabel={t.noData}
          onSelectPlayer={handleSelectPlayer}
        />
        <LeaderColumn
          title={`${t.plusMinus} (+/-)`}
          rows={plusMinus}
          valueKey="plusMinus"
          teamNames={teamNames}
          emptyLabel={t.noData}
          onSelectPlayer={handleSelectPlayer}
        />
        <LeaderColumn
          title={`${t.pointsPlayed} (PP)`}
          rows={pointsPlayed}
          valueKey="pointsPlayed"
          teamNames={teamNames}
          emptyLabel={t.noData}
          onSelectPlayer={handleSelectPlayer}
        />
      </div>

      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => {
          setProfilePlayer(null)
          setProfileTeam(null)
        }}
        leaguePlayerStats={league.playerStats}
        teamName={profileTeam ? resolveTeamName(profileTeam, lang) : null}
        isOwnPlayer={isOwnPlayer}
        knowledge={
          !isOwnPlayer && viewerTeam && profilePlayer ? getPlayerKnowledge(viewerTeam, profilePlayer.id) : null
        }
        isShortlisted={
          !isOwnPlayer && viewerTeam && profilePlayer ? isPlayerShortlisted(viewerTeam, profilePlayer.id) : false
        }
        scoutPending={
          !isOwnPlayer && viewerTeam && profilePlayer
            ? hasPendingScoutMission(viewerTeam, { kind: 'player', targetPlayerId: profilePlayer.id })
            : false
        }
        scoutCost={!isOwnPlayer && viewerTeam ? scoutMissionCost('player', viewerTeam) : null}
        onToggleShortlist={
          !isOwnPlayer && viewerTeam
            ? (playerId) => {
                toggleShortlist(viewerTeam, playerId)
                onCareerUpdate?.({ world })
              }
            : null
        }
        onScoutPlayer={!isOwnPlayer && viewerTeam ? handleScout : null}
      />
    </div>
  )
}
