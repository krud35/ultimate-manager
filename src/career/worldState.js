/**
 * Świat kariery: żywe składy wszystkich drużyn.
 *
 * Szablon startowy = statyczne `UFA_LEAGUE_TEAMS` / pliki rosterów (łatwa edycja).
 * Każda kariera dostaje głęboki klon — mutacje sezonowe nie ruszają szablonu.
 */

import { UFA_LEAGUE_TEAMS } from '../data/ufaLeagueTeams.js'
import { buildSeasonLeagueTemplate } from '../data/seasonLeagueBuilder.js'
import {
  SKILLS_GEN_VERSION,
  applyHistoricalOvrFromUfa,
  ensurePlayerStats,
  regeneratePlayerSkills,
  teamMaxFromPlayers,
} from '../models/playerStats.js'
import {
  applyRandomOvrBands,
  rollRandomSkillsForRoster,
} from '../data/randomRosterSkills.js'
import { ensurePlayerDevelopment } from './playerDevelopment.js'
import { ensurePlayerMorale } from '../models/playerMorale.js'
import { ensurePlayerForm } from '../models/playerForm.js'
import { ensurePlayerLoyalty } from '../models/playerLoyalty.js'
import { ensurePlayerTraits } from '../models/playerTraits.js'
import { ensurePlayerInjury } from '../models/playerInjury.js'
import { ensurePlayerSkillsSnapshots } from '../models/playerSkillsHistory.js'
import { eucsTeamCountry } from '../data/eucsLeagueTeams.js'
import { eucsNationalityOverride } from '../data/eucs/eucsNationalityOverrides.js'
import {
  ensureWorldFinances,
} from './transfers/clubFinances.js'
import { ensureWorldContracts, ensurePlayerContract } from './transfers/playerContracts.js'
import { refreshTeamMarketValues } from './transfers/playerValue.js'
import { ensureWorldReputation } from '../models/teamReputation.js'
import { ensureWorldElo } from '../models/teamElo.js'
import { ensureWorldFans } from '../models/teamFans.js'
import { ensureWorldFacilities } from './clubFacilities.js'
import { ensureWorldSponsors, refreshSponsorOffers } from './clubSponsors.js'
import { ensureWorldScouting } from './scouting.js'
import { ensureWorldAcademy } from './academy.js'
import { officialSeasonEndDate } from '../league/seasonCalendar.js'
import { areCompetitionsComplete, isOfficialSeasonEnded } from '../league/dayEngine.js'
import { ensureAiCoachProfiles } from '../matchEngine/aiCoachProfile.js'
import { ensureCareerNationalTeams } from './nationalTeams.js'

/**
 * @typedef {object} WorldTeam
 * @property {string} id
 * @property {string} name
 * @property {string} [shortName]
 * @property {string} [primaryColor]
 * @property {string} [awayColor]
 * @property {number} [reputation] — prestiż klubu 0–100 (ensureTeamReputation)
 * @property {{ size: number, traits: string[], mood: number, fansGen?: number }} [fans]
 * @property {object[]} players
 */

/**
 * @typedef {object} WorldState
 * @property {number} templateSeasonYear
 * @property {string[]} teamIds
 * @property {Record<string, WorldTeam>} teamsById
 */

function cloneTemplateTeam(team) {
  return {
    id: team.id,
    name: team.name,
    namePl: team.namePl ?? team.name ?? null,
    nameEn: team.nameEn ?? null,
    shortName: team.shortName,
    primaryColor: team.primaryColor ?? null,
    awayColor: team.awayColor ?? null,
    isFictional: !!team.isFictional,
    tacticalIdentity: team.tacticalIdentity ? structuredClone(team.tacticalIdentity) : null,
    players: structuredClone(team.players ?? []),
  }
}

/** Uzupełnia brakujące kolory kitów ze szablonu (np. starsze save'y). */
export function ensureTeamKitColors(world) {
  if (!world?.teamsById) return world
  for (const template of UFA_LEAGUE_TEAMS) {
    const team = world.teamsById[template.id]
    if (!team) continue
    if (team.primaryColor == null && template.primaryColor != null) {
      team.primaryColor = template.primaryColor
    }
    if (team.awayColor == null && template.awayColor != null) {
      team.awayColor = template.awayColor
    }
  }
  return world
}

/** Nowy świat z szablonu sezonu (historyczny / losowy) albo legacy UFA_LEAGUE_TEAMS. */
export function createWorldFromTemplate(templateSeasonYear = 2025, options = {}) {
  const rosterMode = options.rosterMode ?? 'historical'
  const financeSeed = options.financeSeed ?? templateSeasonYear * 1009

  let teams
  let tacticalByTeamId = null

  if (options.teams?.length) {
    teams = options.teams.map(cloneTemplateTeam)
  } else {
    try {
      const built = buildSeasonLeagueTemplate({
        year: templateSeasonYear,
        rosterMode,
        seed: financeSeed,
      })
      teams = built.teams.map(cloneTemplateTeam)
      tacticalByTeamId = built.tacticalByTeamId
      for (const t of teams) {
        if (tacticalByTeamId?.[t.id]) {
          t.tacticalIdentity = tacticalByTeamId[t.id]
        }
      }
    } catch {
      teams = UFA_LEAGUE_TEAMS.map(cloneTemplateTeam)
    }
  }

  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]))
  const world = {
    templateSeasonYear,
    rosterMode,
    teamIds: teams.map((t) => t.id),
    teamsById,
    freeAgents: [],
    retiredPlayers: [],
  }
  ensureWorldFinances(world, { seed: financeSeed, force: true })
  ensureWorldContracts(world, { seed: financeSeed, force: true, syncBudgets: true })
  ensureWorldReputation(world)
  ensureWorldElo(world)
  ensureWorldFans(world, { seed: financeSeed, force: true })
  ensureWorldFacilities(world, { seed: financeSeed, force: true })
  ensureWorldScouting(world)
  ensureWorldAcademy(world)
  ensureWorldSponsors(world, {
    seed: financeSeed,
    seasonYear: templateSeasonYear,
    force: true,
    autoSign: true,
  })
  for (const team of teams) {
    refreshTeamMarketValues(team)
  }
  return world
}

export function worldTeamsList(world) {
  if (!world?.teamsById) return []
  const ids = world.teamIds ?? Object.keys(world.teamsById)
  return ids.map((id) => world.teamsById[id]).filter(Boolean)
}

export function worldTeamById(world, teamId) {
  if (!world?.teamsById || teamId == null) return null
  return world.teamsById[teamId] ?? null
}

/** Znajduje zawodnika w świecie — klubowego, prospekta akademii, lub wolnego agenta. */
export function findWorldPlayerById(world, playerId) {
  if (playerId == null) return { player: null, teamId: null }
  for (const team of worldTeamsList(world)) {
    const player = (team.players ?? []).find((p) => p.id === playerId)
    if (player) return { player, teamId: team.id }
  }
  for (const team of worldTeamsList(world)) {
    const prospect = (team.academyPlayers ?? []).find((p) => p.id === playerId)
    if (prospect) return { player: prospect, teamId: team.id, inAcademy: true }
  }
  const freeAgent = (world?.freeAgents ?? []).find((p) => p.id === playerId)
  if (freeAgent) return { player: freeAgent, teamId: null }
  return { player: null, teamId: null }
}

export function initWorldPlayerStats(world, options = {}) {
  const rosterMode = world?.rosterMode ?? options.rosterMode ?? 'historical'
  const allPlayers = worldTeamsList(world).flatMap((t) => t.players ?? [])
  const leagueMax = teamMaxFromPlayers(allPlayers)

  for (const team of worldTeamsList(world)) {
    const players = team.players ?? []
    const needsSkillRegen = players.some((p) => p?.skillsGen !== SKILLS_GEN_VERSION)
    if (needsSkillRegen) {
      if (rosterMode === 'random') {
        rollRandomSkillsForRoster(players, `regen:${world.templateSeasonYear ?? 0}:${team.id}`)
        applyRandomOvrBands(players, `regen:${world.templateSeasonYear ?? 0}:${team.id}:ovr`)
        for (const player of players) {
          player.potential = undefined
        }
      } else {
        for (const player of players) {
          regeneratePlayerSkills(player, leagueMax ?? teamMaxFromPlayers(players), {
            mode: 'historical',
          })
          player.potential = undefined
        }
        applyHistoricalOvrFromUfa(players)
      }
    }
    for (const player of players) {
      ensurePlayerStats(player)
      ensurePlayerMorale(player)
      ensurePlayerForm(player)
      ensurePlayerLoyalty(player)
      ensurePlayerTraits(player)
      ensurePlayerInjury(player)
      ensurePlayerDevelopment(player, options)
      ensurePlayerContract(player)
      ensurePlayerSkillsSnapshots(player)
      // Uzupełnienie dla zapisów założonych przed dodaniem narodowości — nowe kariery
      // dostają ją już przy generowaniu składu (patrz eucsLeagueTeams.js). Ręczna korekta
      // (eucsNationalityOverrides.js) wygrywa zawsze, nawet gdy zapis ma już zły domyślny
      // kraj klubu zapisany z wcześniejszej sesji.
      const override = eucsNationalityOverride(team.id, player.firstName, player.lastName)
      if (override) player.nationality = override
      else if (player.nationality == null) player.nationality = eucsTeamCountry(team.id)
    }
    refreshTeamMarketValues(team)
  }
  return world
}

/**
 * Reset liczników sezonowych przed nowym sezonem.
 * Zachowuje skills / atrybuty / skład (transfery później mutują world).
 */
export function resetWorldSeasonStats(world) {
  for (const team of worldTeamsList(world)) {
    for (const player of team.players ?? []) {
      ensurePlayerStats(player)
      player.stats.goals = 0
      player.stats.assists = 0
      player.stats.blocks = 0
      player.stats.pointsPlayed = 0
      player.stats.pointsPlayedMatch = 0
      if (player.seasonStats && typeof player.seasonStats === 'object') {
        player.seasonStats.goals = 0
        player.seasonStats.assists = 0
        player.seasonStats.blocks = 0
      }
    }
  }
  return world
}

/** Lookup drużyny z ligi (świat) — bez fallbacku do szablonu. */
export function teamFromLeague(league, teamId) {
  if (!league?.teamsById || teamId == null) return null
  return league.teamsById[teamId] ?? null
}

/** Podpina wspólne referencje składów: league.teamsById === world.teamsById */
export function bindLeagueToWorld(league, world) {
  if (!league || !world?.teamsById) return league
  league.teamsById = world.teamsById
  if (!league.teamIds?.length) {
    league.teamIds = world.teamIds ?? Object.keys(world.teamsById)
  }
  return league
}

/**
 * Po wczytaniu z JSON: world jest źródłem prawdy dla składów;
 * league dostaje te same referencje (bez duplikatu w storage).
 */
export function rehydrateCareerWorld(career) {
  if (!career || typeof career !== 'object') return career

  const world = career.world?.teamsById
    ? career.world
    : createWorldFromTemplate(career.seasonYear ?? 2025)

  if (!Array.isArray(world.activeLoans)) world.activeLoans = []

  initWorldPlayerStats(world)
  ensureTeamKitColors(world)
  ensureAiCoachProfiles(world, career.playerTeamId ?? null)

  const financeSeed =
    (career.seasonYear ?? 2025) * 1009 +
    (career.slotIndex ?? 0) * 17 +
    (career.seasonIndex ?? 1) * 31
  ensureWorldFinances(world, { seed: financeSeed, force: false })
  ensureWorldContracts(world, { seed: financeSeed, force: false, syncBudgets: true })
  ensureWorldReputation(world)
  ensureWorldElo(world)
  ensureWorldFans(world, { seed: financeSeed, force: false })
  ensureWorldFacilities(world, { seed: financeSeed, force: false })
  ensureWorldScouting(world)
  ensureWorldAcademy(world)
  ensureWorldSponsors(world, {
    seed: financeSeed,
    seasonYear: career.seasonYear ?? world.templateSeasonYear ?? 2025,
    force: false,
    autoSign: true,
    playerTeamId: career.playerTeamId ?? null,
  })

  const league = career.league
    ? bindLeagueToWorld({ ...career.league }, world)
    : career.league

  if (league?.calendar && !league.calendar.officialEndDate) {
    const end = officialSeasonEndDate(league.calendar)
    if (end) league.calendar.officialEndDate = end
  }
  // Stare save'y: status complete zaraz po ostatnim meczu — kalendarz ma iść do 31 lipca.
  if (
    league &&
    league.status === 'complete' &&
    areCompetitionsComplete(league) &&
    !isOfficialSeasonEnded(league)
  ) {
    league.status = 'active'
    league.competitionsComplete = true
  }

  return {
    ...career,
    world,
    league,
    // Kadry narodowe (Fazy 1-5) — leniwa inicjalizacja/dopełnienie dla zapisów sprzed tej
    // funkcji, dokładnie ten sam wzorzec co transferLog/inbox/ultiworld poniżej.
    nationalTeams: ensureCareerNationalTeams(career),
    transferLog: Array.isArray(career.transferLog) ? career.transferLog : [],
    loanLog: Array.isArray(career.loanLog) ? career.loanLog : [],
    inbox: Array.isArray(career.inbox) ? career.inbox : [],
    ultiworld:
      career.ultiworld && typeof career.ultiworld === 'object'
        ? {
            articles: Array.isArray(career.ultiworld.articles)
              ? career.ultiworld.articles
              : [],
            lastRoundCovered: career.ultiworld.lastRoundCovered ?? 0,
            lastPomMonth: career.ultiworld.lastPomMonth ?? null,
            coveredFixtureIds: Array.isArray(career.ultiworld.coveredFixtureIds)
              ? career.ultiworld.coveredFixtureIds
              : [],
            cupChampionCovered: !!career.ultiworld.cupChampionCovered,
            seeded: !!career.ultiworld.seeded,
            worldEventCooldowns:
              career.ultiworld.worldEventCooldowns &&
              typeof career.ultiworld.worldEventCooldowns === 'object'
                ? career.ultiworld.worldEventCooldowns
                : {},
            powerRankingsSnapshot:
              career.ultiworld.powerRankingsSnapshot &&
              typeof career.ultiworld.powerRankingsSnapshot === 'object'
                ? career.ultiworld.powerRankingsSnapshot
                : null,
            lastPowerRankingMonth: career.ultiworld.lastPowerRankingMonth ?? null,
          }
        : {
            articles: [],
            lastRoundCovered: 0,
            lastPomMonth: null,
            coveredFixtureIds: [],
          },
  }
}

/** Do zapisu: składy tylko w `world` (liga i otherLeagues nie dublują teamsById —
 * to ten sam obiekt co world.teamsById, podpinany na nowo w advanceOtherLeagueToDate). */
export function careerForStorage(career) {
  if (!career) return career
  const { league, world, ...rest } = career
  let leagueOut = league
  if (league) {
    const { teamsById: _drop, otherLeagues, ...leagueRest } = league
    leagueOut = leagueRest
    if (Array.isArray(otherLeagues)) {
      leagueOut.otherLeagues = otherLeagues.map(({ teamsById: _dropOl, ...otherRest }) => otherRest)
    }
  }
  return {
    ...rest,
    world,
    league: leagueOut,
  }
}
