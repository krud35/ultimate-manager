import { useState } from 'react'
import {
  ACADEMY_COUNTRIES,
  academyCountryLabel,
  academyContinentLabel,
} from '../../data/academyScoutGeography.js'
import { realWorldMedalsForCountryName } from '../../data/eucs/worldChampionshipHistoryReal.js'
import {
  computePublicWorldRanking,
  countryRankingTierLabel,
  countryRankingTierToneClass,
} from '../../career/nationalTeamRanking.js'
import { ensureCareerNationalTeams } from '../../career/nationalTeams.js'
import { getOverallRating } from '../../models/playerStats.js'
import { resolveTeamName } from '../../ui/locale'
import {
  worldTeamById,
  worldTeamsList,
  findWorldPlayerById,
  getPlayerKnowledge,
} from '../../career'
import { scoutedValueDisplay } from '../../ui/fogOfWar'
import PlayerProfileModal from '../PlayerProfileModal'

const TOP_PLAYERS_LIMIT = 12

function PlayerRow({ player, clubLabel, isOwnPlayer, knowledge, lang, onSelect }) {
  const ovrDisplay = isOwnPlayer
    ? { label: String(getOverallRating(player.skills)), toneClass: 'text-ufa-accent' }
    : scoutedValueDisplay(getOverallRating(player.skills), knowledge, lang)
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2 text-sm">
      <button
        type="button"
        onClick={() => onSelect(player)}
        className="min-w-0 flex-1 truncate text-left text-ufa-text hover:text-ufa-accent hover:underline"
      >
        {player.firstName} {player.lastName}
        {clubLabel && <span className="ml-1.5 text-xs text-ufa-muted">({clubLabel})</span>}
      </button>
      <span className={`shrink-0 text-xs font-semibold tabular-nums ${ovrDisplay.toneClass}`}>
        OVR {ovrDisplay.label}
      </span>
    </li>
  )
}

export default function CountryProfileView({ career, countryId, onBack, t, lang }) {
  const world = career?.world
  const country = ACADEMY_COUNTRIES[countryId]
  const nt = ensureCareerNationalTeams(career)
  const viewerTeam = world && career?.playerTeamId ? worldTeamById(world, career.playerTeamId) : null

  const [profilePlayer, setProfilePlayer] = useState(null)
  const [profileTeam, setProfileTeam] = useState(null)

  if (!country) return null

  const ranking = computePublicWorldRanking(career)
  const rankingRow = ranking.find((r) => r.countryId === countryId)
  const points = rankingRow?.points ?? 0

  const realMedals = realWorldMedalsForCountryName(country.nameEn)
  const careerAppearances = (nt.history ?? [])
    .filter((entry) => entry.placements && countryId in entry.placements)
    .map((entry) => ({ year: entry.year, kind: entry.kind, placement: entry.placements[countryId] }))
    .sort((a, b) => b.year - a.year)

  const squad = nt.squadsByCountry?.[countryId] ?? null
  const squadRows = (squad?.playerIds ?? [])
    .map((id) => {
      const found = findWorldPlayerById(world, id)
      if (found.player) return { player: found.player, teamId: found.teamId }
      const generated = squad.generatedPlayers?.find((p) => p.id === id)
      return generated ? { player: generated, teamId: null } : null
    })
    .filter(Boolean)
    .sort((a, b) => getOverallRating(b.player.skills) - getOverallRating(a.player.skills))

  const topPlayers = []
  for (const team of worldTeamsList(world)) {
    for (const p of team.players ?? []) {
      if (p.nationality === country.nameEn) topPlayers.push({ player: p, teamId: team.id })
    }
  }
  for (const p of world?.freeAgents ?? []) {
    if (p.nationality === country.nameEn) topPlayers.push({ player: p, teamId: null })
  }
  topPlayers.sort((a, b) => getOverallRating(b.player.skills) - getOverallRating(a.player.skills))
  const topPlayersLimited = topPlayers.slice(0, TOP_PLAYERS_LIMIT)

  function handleSelectPlayer(player, teamId) {
    const team = teamId ? worldTeamById(world, teamId) : null
    setProfilePlayer(player)
    setProfileTeam(team)
  }

  const isOwnPlayer = Boolean(profileTeam && profileTeam.id === career?.playerTeamId)

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="text-sm text-ufa-accent hover:underline">
        {t.backToCountries}
      </button>

      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <p className="text-xs uppercase tracking-wide text-ufa-muted">
          {academyContinentLabel(country.continent, lang)}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-ufa-text">{academyCountryLabel(countryId, lang)}</h2>
        <p className={`mt-1 text-sm font-medium ${countryRankingTierToneClass(points)}`}>
          {t.tier}: {countryRankingTierLabel(points, lang)}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
          <h3 className="text-sm font-semibold text-ufa-text">{t.trophyCabinetReal}</h3>
          {!realMedals ? (
            <p className="mt-2 text-xs text-ufa-muted">{t.noTrophies}</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {realMedals.appearances.map((a) => (
                <li key={a.year} className="flex items-center justify-between text-ufa-text">
                  <span className="text-ufa-muted">{a.year}</span>
                  <span>
                    {a.result === 'champion' ? t.medalGold : a.result === 'runnerUp' ? t.medalSilver : t.medalSemifinal}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
          <h3 className="text-sm font-semibold text-ufa-text">{t.trophyCabinetCareer}</h3>
          {!careerAppearances.length ? (
            <p className="mt-2 text-xs text-ufa-muted">{t.noTrophies}</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {careerAppearances.map((a) => (
                <li key={`${a.year}-${a.kind}`} className="flex items-center justify-between text-ufa-text">
                  <span className="text-ufa-muted">
                    {a.year} · {t.kindShort[a.kind] ?? a.kind}
                  </span>
                  <span>{t.round[a.placement] ?? a.placement}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ufa-text">{t.currentSquad}</h3>
          {squad?.asOfDate && <span className="text-xs text-ufa-muted">{t.squadAsOf(squad.asOfDate)}</span>}
        </div>
        {!squadRows.length ? (
          <p className="mt-2 text-xs text-ufa-muted">{t.noSquad}</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {squadRows.map(({ player, teamId }) => (
              <PlayerRow
                key={player.id}
                player={player}
                clubLabel={teamId ? resolveTeamName(worldTeamById(world, teamId), lang) : null}
                isOwnPlayer={teamId === career?.playerTeamId}
                knowledge={
                  teamId && teamId !== career?.playerTeamId && viewerTeam
                    ? getPlayerKnowledge(viewerTeam, player.id)
                    : 0
                }
                lang={lang}
                onSelect={() => handleSelectPlayer(player, teamId)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
        <h3 className="text-sm font-semibold text-ufa-text">{t.topPlayersTitle}</h3>
        {!topPlayersLimited.length ? (
          <p className="mt-2 text-xs text-ufa-muted">{t.noTopPlayers}</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {topPlayersLimited.map(({ player, teamId }) => (
              <PlayerRow
                key={player.id}
                player={player}
                clubLabel={teamId ? resolveTeamName(worldTeamById(world, teamId), lang) : null}
                isOwnPlayer={teamId === career?.playerTeamId}
                knowledge={
                  teamId && teamId !== career?.playerTeamId && viewerTeam
                    ? getPlayerKnowledge(viewerTeam, player.id)
                    : 0
                }
                lang={lang}
                onSelect={() => handleSelectPlayer(player, teamId)}
              />
            ))}
          </ul>
        )}
      </div>

      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => {
          setProfilePlayer(null)
          setProfileTeam(null)
        }}
        teamName={profileTeam ? resolveTeamName(profileTeam, lang) : null}
        isOwnPlayer={isOwnPlayer}
        knowledge={
          !isOwnPlayer && viewerTeam && profilePlayer ? getPlayerKnowledge(viewerTeam, profilePlayer.id) : null
        }
        onToggleShortlist={null}
        onScoutPlayer={null}
      />
    </div>
  )
}
