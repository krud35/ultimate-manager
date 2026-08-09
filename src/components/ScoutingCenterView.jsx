import { useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { resolveTeamName } from '../ui/locale'
import { scoutingStrings } from '../ui/strings/scouting'
import { scoutedValueDisplay, attributeBandToneClass } from '../ui/fogOfWar'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers'
import PlayerProfileModal from './PlayerProfileModal'
import {
  worldTeamById,
  worldTeamsList,
  findWorldPlayerById,
  getPlayerKnowledge,
  getOpponentKnowledge,
  getOpponentTacticsKnowledge,
  pendingScoutMissions,
  hasPendingScoutMission,
  queueScoutMission,
  isPlayerShortlisted,
  toggleShortlist,
  removeFromShortlist,
} from '../career'

export default function ScoutingCenterView({ career, onCareerUpdate, onOpenTeam }) {
  const { lang } = useUiLang()
  const ts = scoutingStrings(lang)
  const [profilePlayer, setProfilePlayer] = useState(null)
  const [profileTeamName, setProfileTeamName] = useState(null)

  const buyer = worldTeamById(career.world, career.playerTeamId)
  const shortlist = buyer?.scouting?.shortlist ?? []

  const shortlistRows = shortlist
    .map((playerId) => {
      const { player, teamId } = findWorldPlayerById(career.world, playerId)
      if (!player) return null
      const knowledge = getPlayerKnowledge(buyer, playerId)
      const ovr = getOverallRating(player.skills)
      const clubTeam = teamId ? worldTeamById(career.world, teamId) : null
      return {
        playerId,
        player,
        teamId,
        clubName: clubTeam ? resolveTeamName(clubTeam, lang) : ts.freeAgent,
        knowledge,
        ovrDisplay: scoutedValueDisplay(ovr, knowledge, lang),
        pending: hasPendingScoutMission(buyer, { kind: 'player', targetPlayerId: playerId }),
      }
    })
    .filter(Boolean)

  const leagueTeams = worldTeamsList(career.world).filter((t) => t.id !== career.playerTeamId)

  function handleScout(playerId, clubId) {
    const result = queueScoutMission(buyer, {
      kind: 'player',
      targetPlayerId: playerId,
      opponentTeamId: clubId,
      date: career.league?.currentDate ?? null,
    })
    if (result.ok) onCareerUpdate({ world: career.world })
    return result
  }

  function handleRemove(playerId) {
    removeFromShortlist(buyer, playerId)
    onCareerUpdate({ world: career.world })
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-ufa-text">{ts.centerTitle}</h2>

      <section className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
        <h3 className="font-semibold text-ufa-text mb-3">{ts.shortlistTitle}</h3>
        {shortlistRows.length === 0 ? (
          <p className="text-sm text-ufa-muted">{ts.shortlistEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ufa-muted">
                <tr className="border-b border-ufa-border">
                  <th className="px-2 py-2 font-medium">{ts.colPlayer}</th>
                  <th className="px-2 py-2 font-medium">{ts.colClub}</th>
                  <th className="px-2 py-2 font-medium">{ts.colAge}</th>
                  <th className="px-2 py-2 font-medium">{ts.colOvr}</th>
                  <th className="px-2 py-2 font-medium">{ts.colKnowledge}</th>
                  <th className="px-2 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {shortlistRows.map((row) => (
                  <tr key={row.playerId} className="border-b border-ufa-border/70 hover:bg-ufa-bg/40">
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setProfilePlayer(row.player)
                          setProfileTeamName(row.clubName)
                        }}
                        className="font-medium text-ufa-accent hover:underline text-left"
                      >
                        {getPlayerFullName(row.player)}
                      </button>
                    </td>
                    <td className="px-2 py-2.5 text-ufa-muted">{row.clubName}</td>
                    <td className="px-2 py-2.5 tabular-nums">{row.player.age ?? '—'}</td>
                    <td
                      className={`px-2 py-2.5 font-semibold tabular-nums ${
                        row.ovrDisplay.kind === 'exact' ? 'text-ufa-accent' : row.ovrDisplay.toneClass
                      }`}
                    >
                      {row.ovrDisplay.label}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">{row.knowledge}%</td>
                    <td className="px-2 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleScout(row.playerId, row.teamId)}
                          disabled={row.pending}
                          className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
                        >
                          {row.pending ? ts.scoutPlayerPending : ts.scoutAction}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(row.playerId)}
                          className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-text hover:bg-ufa-panel-hover"
                        >
                          {ts.removeAction}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
        <h3 className="font-semibold text-ufa-text mb-3">{ts.leagueTeamsTitle}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ufa-muted">
              <tr className="border-b border-ufa-border">
                <th className="px-2 py-2 font-medium">{ts.colTeam}</th>
                <th className="px-2 py-2 font-medium">{ts.colKnowledge}</th>
                <th className="px-2 py-2 font-medium">{ts.colTactics}</th>
                <th className="px-2 py-2 font-medium">{ts.colPending}</th>
                <th className="px-2 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {leagueTeams.map((opponent) => {
                const knowledge = getOpponentKnowledge(buyer, opponent.id)
                const tacticsKnowledge = getOpponentTacticsKnowledge(buyer, opponent.id)
                const pendingCount = pendingScoutMissions(buyer).filter(
                  (m) => m.opponentTeamId === opponent.id,
                ).length
                return (
                  <tr key={opponent.id} className="border-b border-ufa-border/70 hover:bg-ufa-bg/40">
                    <td className="px-2 py-2.5 font-medium text-ufa-text">
                      {resolveTeamName(opponent, lang)}
                    </td>
                    <td
                      className={`px-2 py-2.5 tabular-nums font-semibold ${attributeBandToneClass(knowledge)}`}
                    >
                      {knowledge}%
                    </td>
                    <td
                      className={`px-2 py-2.5 tabular-nums font-semibold ${attributeBandToneClass(tacticsKnowledge)}`}
                    >
                      {tacticsKnowledge}%
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-ufa-muted">{pendingCount}</td>
                    <td className="px-2 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenTeam?.(opponent.id)}
                        className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-text hover:bg-ufa-panel-hover"
                      >
                        {ts.openProfile}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => {
          setProfilePlayer(null)
          setProfileTeamName(null)
        }}
        teamName={profileTeamName}
        isOwnPlayer={false}
        knowledge={profilePlayer ? getPlayerKnowledge(buyer, profilePlayer.id) : null}
        isShortlisted={profilePlayer ? isPlayerShortlisted(buyer, profilePlayer.id) : false}
        scoutPending={
          profilePlayer
            ? hasPendingScoutMission(buyer, { kind: 'player', targetPlayerId: profilePlayer.id })
            : false
        }
        onToggleShortlist={(playerId) => {
          toggleShortlist(buyer, playerId)
          onCareerUpdate({ world: career.world })
        }}
        onScoutPlayer={(playerId) =>
          handleScout(playerId, findWorldPlayerById(career.world, playerId).teamId)
        }
      />
    </div>
  )
}
