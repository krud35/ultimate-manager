import { useState } from 'react'
import { topLeaders, topPlusMinusLeaders } from '../league'
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

/**
 * Ligi dostępne do podglądu liderów: własna liga gracza + (dla Ligi Europejskiej)
 * pozostałe poziomy piramidy — `league.otherLeagues`, generyczna lista {id,label,
 * playerStats}. Zaprojektowane tak, żeby w przyszłości dowolna inna równoległa
 * rozgrywka (np. liga krajowa) automatycznie pojawiła się tu bez zmian w tym pliku —
 * wystarczy że trafi do `league.otherLeagues`.
 */
function leagueOptionsFor(league, t) {
  const options = [{ id: 'mine', label: t.leadersMyLeague, playerStats: league.playerStats }]
  for (const other of league.otherLeagues ?? []) {
    options.push({ id: other.id, label: other.label, playerStats: other.playerStats })
  }
  return options
}

export default function LeagueLeadersView({ league, career, onCareerUpdate }) {
  const { lang } = useUiLang()
  const t = leagueViewsStrings(lang)
  const world = career?.world

  const leagueOptions = leagueOptionsFor(league, t)
  const [selectedLeagueId, setSelectedLeagueId] = useState('mine')
  const selected = leagueOptions.find((o) => o.id === selectedLeagueId) ?? leagueOptions[0]
  const selectedPlayerStats = selected.playerStats

  // Nazwy drużyn zawsze z world.teamsById — działa jednolicie dla własnej ligi i dla
  // pozostałych poziomów piramidy (wszystkie 48 klubów mają tam pełny skład od startu
  // sezonu), bez potrzeby osobnego `teamNameMap` per liga.
  const teamNames = {}
  if (world?.teamsById) {
    for (const id of Object.keys(world.teamsById)) {
      teamNames[id] = resolveTeamName(world.teamsById[id], lang) ?? id
    }
  }

  const goals = topLeaders(selectedPlayerStats, 'goals', 10)
  const assists = topLeaders(selectedPlayerStats, 'assists', 10)
  const blocks = topLeaders(selectedPlayerStats, 'blocks', 10)
  const plusMinus = topPlusMinusLeaders(selectedPlayerStats, 10)
  const pointsPlayed = topLeaders(selectedPlayerStats, 'pointsPlayed', 10)

  const [profilePlayer, setProfilePlayer] = useState(null)
  const [profileTeam, setProfileTeam] = useState(null)

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
        {leagueOptions.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {leagueOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedLeagueId(opt.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  opt.id === selectedLeagueId
                    ? 'bg-ufa-accent text-ufa-bg'
                    : 'bg-ufa-bg text-ufa-muted hover:text-ufa-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
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
        leaguePlayerStats={selectedPlayerStats}
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
