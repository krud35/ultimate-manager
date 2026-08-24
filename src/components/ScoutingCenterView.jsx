import { useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { resolveTeamName } from '../ui/locale'
import { scoutingStrings } from '../ui/strings/scouting'
import { transfersStrings } from '../ui/strings/transfers'
import { translateTransferError } from '../ui/strings/transferErrors'
import { scoutedValueDisplay, attributeBandToneClass } from '../ui/fogOfWar'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers'
import { seasonStatsForPlayer } from '../league/leagueStats'
import PlayerProfileModal from './PlayerProfileModal'
import NegotiateModal from './NegotiateModal'
import {
  worldTeamById,
  worldTeamsList,
  findWorldPlayerById,
  getPlayerKnowledge,
  getOpponentKnowledge,
  getOpponentTacticsKnowledge,
  getTransferBudget,
  getPlayerMarketValue,
  pendingScoutMissions,
  hasPendingScoutMission,
  queueScoutMission,
  scoutMissionCost,
  isPlayerShortlisted,
  toggleShortlist,
  removeFromShortlist,
  buildTransferRowForPlayer,
  submitTransferOffer,
  mergeInbox,
  formatUsd,
  PLAYER_SEARCH_PROFILES,
  playerSearchProfile,
  profileFitScore,
  recallScoutMission,
} from '../career'

export default function ScoutingCenterView({ career, onCareerUpdate, onOpenTeam }) {
  const { lang } = useUiLang()
  const ts = scoutingStrings(lang)
  const tt = transfersStrings(lang)
  const [profilePlayer, setProfilePlayer] = useState(null)
  const [profileTeamName, setProfileTeamName] = useState(null)
  const [negotiateRow, setNegotiateRow] = useState(null)
  const [negotiateFlash, setNegotiateFlash] = useState(null)
  const [searchProfileId, setSearchProfileId] = useState(PLAYER_SEARCH_PROFILES[0]?.id ?? '')
  const [searchError, setSearchError] = useState(null)
  const [searchMsg, setSearchMsg] = useState(null)

  const buyer = worldTeamById(career.world, career.playerTeamId)
  const shortlist = buyer?.scouting?.shortlist ?? []
  const playerScoutCost = buyer ? scoutMissionCost('player', buyer) : null
  const playerSearchCost = buyer ? scoutMissionCost('playerSearch', buyer) : null
  const playerSearchMissions = pendingScoutMissions(buyer).filter((m) => m.kind === 'playerSearch')

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

  function handleSendSearch() {
    setSearchError(null)
    setSearchMsg(null)
    if (!searchProfileId) {
      setSearchError(ts.errorGeneric)
      return
    }
    const result = queueScoutMission(buyer, {
      kind: 'playerSearch',
      profileId: searchProfileId,
      world: career.world,
      date: career.league?.currentDate ?? null,
    })
    if (!result.ok) {
      if (result.error === 'capacity') setSearchError(ts.errorCapacity)
      else if (result.error === 'insufficient_funds') setSearchError(ts.errorInsufficientFunds)
      else setSearchError(ts.errorGeneric)
      return
    }
    setSearchMsg(ts.scoutQueued)
    onCareerUpdate({ world: career.world })
  }

  function handleRecallSearch(missionId) {
    const result = recallScoutMission(buyer, missionId, career.league?.currentDate ?? null)
    if (!result.ok) return
    onCareerUpdate({ world: career.world })
  }

  function buildSearchCandidateRow(mission, playerId) {
    const { player, teamId } = findWorldPlayerById(career.world, playerId)
    if (!player) return null
    const knowledge = getPlayerKnowledge(buyer, playerId)
    const ovr = getOverallRating(player.skills)
    const fit = profileFitScore(player.skills, mission.profileId)
    const clubTeam = teamId ? worldTeamById(career.world, teamId) : null
    const s = seasonStatsForPlayer(career.league?.playerStats, player)
    return {
      playerId,
      player,
      teamId,
      clubName: clubTeam ? resolveTeamName(clubTeam, lang) : ts.freeAgent,
      knowledge,
      ovrDisplay: scoutedValueDisplay(ovr, knowledge, lang),
      fitDisplay: scoutedValueDisplay(fit, knowledge, lang),
      production: `${s.goals}G/${s.assists}A/${s.blocks}B`,
      value: getPlayerMarketValue(player),
    }
  }

  function handleNegotiateOffer(offerAmount, contractTerms = null) {
    const result = submitTransferOffer(career, { row: negotiateRow, offerAmount, contractTerms })
    if (!result.ok) {
      const text =
        result.code === 'negative_budget'
          ? tt.negativeBudgetBlock
          : translateTransferError(result.error, lang) ?? tt.transferError
      setNegotiateFlash({ type: 'error', text })
      return
    }
    if (result.kind === 'fa_signed') {
      onCareerUpdate({ world: result.world, transferLog: result.transferLog })
      setNegotiateFlash({ type: 'ok', text: tt.faSigned })
    } else {
      onCareerUpdate({ inbox: mergeInbox(career, [result.message]) })
      setNegotiateFlash({ type: 'ok', text: result.flash ?? tt.offerSentFlash })
    }
    setNegotiateRow(null)
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
                          {row.pending
                            ? ts.scoutPlayerPending
                            : playerScoutCost != null
                              ? `${ts.scoutAction} (${formatUsd(playerScoutCost)})`
                              : ts.scoutAction}
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

      <section className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
        <h3 className="font-semibold text-ufa-text mb-1">{ts.playerSearchTitle}</h3>
        <p className="mb-3 text-xs text-ufa-muted">{ts.playerSearchHint}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-ufa-muted">
            {ts.profileLabel}
            <select
              value={searchProfileId}
              onChange={(e) => setSearchProfileId(e.target.value)}
              className="rounded-md border border-ufa-border bg-ufa-bg px-2.5 py-1.5 text-sm text-ufa-text"
            >
              {PLAYER_SEARCH_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {lang === 'pl' ? p.labelPl : p.labelEn}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleSendSearch}
            className="rounded-md border border-ufa-border px-3 py-1.5 text-sm text-ufa-text hover:bg-ufa-panel-hover"
          >
            {playerSearchCost != null ? `${ts.sendScoutButton} (${formatUsd(playerSearchCost)})` : ts.sendScoutButton}
          </button>
        </div>
        {searchError && <p className="mt-2 text-sm text-red-400">{searchError}</p>}
        {searchMsg && <p className="mt-2 text-sm text-emerald-400">{searchMsg}</p>}

        <h4 className="mt-5 text-sm font-semibold text-ufa-text">{ts.resultsTitle}</h4>
        {playerSearchMissions.length === 0 ? (
          <p className="mt-1 text-sm text-ufa-muted">{ts.resultsEmpty}</p>
        ) : (
          <div className="mt-2 space-y-4">
            {playerSearchMissions.map((mission) => {
              const profile = playerSearchProfile(mission.profileId)
              const label = lang === 'pl' ? profile?.labelPl : profile?.labelEn
              const rows = (mission.candidateIds ?? [])
                .map((id) => buildSearchCandidateRow(mission, id))
                .filter(Boolean)
              return (
                <div key={mission.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ufa-text">
                      {label ?? mission.profileId} ·{' '}
                      {mission.recalling
                        ? ts.recalling
                        : ts.weekProgress(mission.weeksElapsed ?? 0, mission.weeksTotal ?? 3)}
                    </span>
                    {!mission.recalling && (
                      <button
                        type="button"
                        onClick={() => handleRecallSearch(mission.id)}
                        className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-text hover:bg-ufa-panel-hover"
                      >
                        {ts.recallAction}
                      </button>
                    )}
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-ufa-muted">
                        <tr className="border-b border-ufa-border">
                          <th className="px-2 py-2 font-medium">{ts.colPlayer}</th>
                          <th className="px-2 py-2 font-medium">{ts.colClub}</th>
                          <th className="px-2 py-2 font-medium">{ts.colOvr}</th>
                          <th className="px-2 py-2 font-medium">{ts.fitLabel}</th>
                          <th className="px-2 py-2 font-medium">{ts.productionLabel}</th>
                          <th className="px-2 py-2 font-medium">{ts.colValue}</th>
                          <th className="px-2 py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
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
                            <td
                              className={`px-2 py-2.5 font-semibold tabular-nums ${
                                row.ovrDisplay.kind === 'exact' ? 'text-ufa-accent' : row.ovrDisplay.toneClass
                              }`}
                            >
                              {row.ovrDisplay.label}
                            </td>
                            <td
                              className={`px-2 py-2.5 font-semibold tabular-nums ${
                                row.fitDisplay.kind === 'exact' ? 'text-ufa-accent' : row.fitDisplay.toneClass
                              }`}
                            >
                              {row.fitDisplay.label}
                            </td>
                            <td className="px-2 py-2.5 tabular-nums text-ufa-muted">{row.production}</td>
                            <td className="px-2 py-2.5 tabular-nums text-ufa-muted">{formatUsd(row.value)}</td>
                            <td className="px-2 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setProfilePlayer(row.player)
                                  setProfileTeamName(row.clubName)
                                }}
                                className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-text hover:bg-ufa-panel-hover"
                              >
                                {ts.openProfile}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => {
          setProfilePlayer(null)
          setProfileTeamName(null)
        }}
        leaguePlayerStats={career.league?.playerStats}
        teamName={profileTeamName}
        isOwnPlayer={false}
        knowledge={profilePlayer ? getPlayerKnowledge(buyer, profilePlayer.id) : null}
        isShortlisted={profilePlayer ? isPlayerShortlisted(buyer, profilePlayer.id) : false}
        scoutPending={
          profilePlayer
            ? hasPendingScoutMission(buyer, { kind: 'player', targetPlayerId: profilePlayer.id })
            : false
        }
        scoutCost={playerScoutCost}
        onToggleShortlist={(playerId) => {
          toggleShortlist(buyer, playerId)
          onCareerUpdate({ world: career.world })
        }}
        onScoutPlayer={(playerId) =>
          handleScout(playerId, findWorldPlayerById(career.world, playerId).teamId)
        }
        onStartNegotiation={(playerId) => {
          const row = buildTransferRowForPlayer(career.world, career.playerTeamId, playerId)
          if (!row) return
          setProfilePlayer(null)
          setProfileTeamName(null)
          setNegotiateFlash(null)
          setNegotiateRow(row)
        }}
      />

      {negotiateRow && (
        <NegotiateModal
          row={negotiateRow}
          budget={getTransferBudget(buyer)}
          onClose={() => setNegotiateRow(null)}
          onSubmitOffer={handleNegotiateOffer}
        />
      )}
      {negotiateFlash && (
        <p className={`text-sm ${negotiateFlash.type === 'ok' ? 'text-ufa-accent' : 'text-red-400'}`}>
          {negotiateFlash.text}
        </p>
      )}
    </div>
  )
}
