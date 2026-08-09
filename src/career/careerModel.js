/**
 * Model kariery managerskiej: tworzenie, archiwizacja sezonu, start kolejnego.
 */

import { createLeagueSeason } from '../league/leagueState.js'
import { isOfficialSeasonEnded } from '../league/dayEngine.js'
import { resolvePlayerDefaultTactics } from '../matchEngine'
import { SAVE_VERSION, STARTING_SEASON_YEAR } from './constants.js'
import { writeSlot } from './saveStore.js'
import {
  createWorldFromTemplate,
  initWorldPlayerStats,
  resetWorldSeasonStats,
  worldTeamById,
} from './worldState.js'
import { buildSeasonLeagueTemplate } from '../data/seasonLeagueBuilder.js'
import { rollAiCoachProfilesForWorld } from '../matchEngine/aiCoachProfile.js'
import {
  applyOffseasonDevelopment,
  ageWorldPlayersOneYear,
  initWorldPlayerDevelopment,
} from './playerDevelopment.js'
import { initAllAiTeamTraining, ensureTeamTraining } from './teamTraining.js'
import {
  applyArchiveToAllTime,
  buildSeasonArchiveRecord,
  createAllTimeStats,
  pruneLeagueMemory,
} from './seasonArchive.js'
import { ensureWorldFinances, rollSeasonBudgets } from './transfers/clubFinances.js'
import {
  ensureWorldContracts,
  processSeasonEndContractObligations,
  messagesFromContractBonusPayouts,
  messagesFromBrokenPromises,
} from './transfers/playerContracts.js'
import { simulateAiOffseasonTransferBurst } from './transfers/aiMarket.js'
import { processAiContractCycle, simulateAiFreeAgentSignings, ensureWorldFreeAgents } from './transfers/freeAgency.js'
import { processSeasonRetirements } from './retirement.js'
import {
  ensureWorldAcademy,
  runAcademyIntake,
  sweepAgedOutAcademyPlayers,
  runAiAcademyPromotionPass,
  applyAcademyOffseasonDevelopment,
} from './academy.js'
import { resetWorldSeasonInjuryCounts } from '../models/playerInjury.js'
import {
  processSeasonEndSponsorPayouts,
  processSeasonStartSponsorPayouts,
  refreshSponsorOffers,
  ensureTeamSponsors,
  messagesFromSponsorExpirations,
  messagesFromOpenSponsorOffers,
  messagesFromSponsorExpiringSoon,
  messagesFromSponsorPayouts,
} from './clubSponsors.js'
import { ensureTeamFacilities } from './clubFacilities.js'
import { mergeInbox, messagesFromAcademyAgedOut } from './inbox.js'

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `career-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function seasonLabelForYear(year) {
  return `UFA ${year}/${String(year + 1).slice(-2)}`
}

function emptyCareerStats() {
  return {}
}

function teamNameFromCareer(career, teamId) {
  return worldTeamById(career.world, teamId)?.name ?? teamId
}

/** Scalanie statystyk zawodnika między sezonami. */
export function mergePlayerStatRows(into, row) {
  if (!row?.playerId) return into
  const existing = into[row.playerId]
  if (!existing) {
    into[row.playerId] = {
      playerId: row.playerId,
      firstName: row.firstName,
      lastName: row.lastName,
      teamId: row.teamId,
      goals: row.goals ?? 0,
      assists: row.assists ?? 0,
      blocks: row.blocks ?? 0,
      turnovers: row.turnovers ?? 0,
      games: row.games ?? 0,
      pointsPlayed: row.pointsPlayed ?? 0,
      seasons: 1,
    }
    return into
  }
  existing.goals += row.goals ?? 0
  existing.assists += row.assists ?? 0
  existing.blocks += row.blocks ?? 0
  existing.turnovers += row.turnovers ?? 0
  existing.games += row.games ?? 0
  existing.pointsPlayed += row.pointsPlayed ?? 0
  existing.seasons = (existing.seasons ?? 0) + 1
  if (row.teamId) existing.teamId = row.teamId
  return into
}

export function mergeLeagueStatsIntoCareer(careerStats, leaguePlayerStats) {
  const next = { ...careerStats }
  for (const row of Object.values(leaguePlayerStats ?? {})) {
    mergePlayerStatRows(next, row)
  }
  return next
}

export function buildSeasonArchive(career) {
  return buildSeasonArchiveRecord(career, (id) => teamNameFromCareer(career, id))
}

/**
 * Nowa kariera w wskazanym slocie.
 */
export function createCareer(slotIndex, options) {
  const managerName = (options.managerName ?? '').trim() || 'Manager'
  const playerTeamId = options.playerTeamId
  const seasonYear = options.seasonYear ?? STARTING_SEASON_YEAR
  const rosterMode = options.rosterMode === 'random' ? 'random' : 'historical'

  const financeSeed = seasonYear * 1009 + slotIndex * 17 + Math.floor(Math.random() * 1000)
  const template = buildSeasonLeagueTemplate({
    year: seasonYear,
    rosterMode,
    seed: financeSeed,
    selectedTeamIds: options.selectedTeamIds,
  })
  const world = createWorldFromTemplate(seasonYear, {
    financeSeed,
    rosterMode,
    teams: template.teams.map((t) => ({
      ...t,
      tacticalIdentity: template.tacticalByTeamId?.[t.id] ?? null,
    })),
  })
  rollAiCoachProfilesForWorld(world, playerTeamId, financeSeed)
  initWorldPlayerStats(world, { playerTeamId })
  initWorldPlayerDevelopment(world, { playerTeamId })
  initAllAiTeamTraining(world, playerTeamId)
  ensureTeamTraining(worldTeamById(world, playerTeamId))
  ensureWorldFinances(world, { seed: financeSeed, force: true })
  ensureWorldContracts(world, { seed: financeSeed, force: true, syncBudgets: true })
  const team = worldTeamById(world, playerTeamId)
  if (!team) {
    throw new Error(`Nieznana drużyna: ${playerTeamId}`)
  }
  // Gracz wybiera sponsorów sam — czyścimy auto-sign i dajemy 3 oferty na slot.
  ensureTeamFacilities(team, { seed: financeSeed })
  ensureTeamSponsors(team, { seed: financeSeed, seasonYear, autoSign: false })
  team.sponsors.main = null
  team.sponsors.secondary = null
  refreshSponsorOffers(team, 'main', { seed: `${financeSeed}|player|main`, seasonYear })
  refreshSponsorOffers(team, 'secondary', {
    seed: `${financeSeed}|player|secondary`,
    seasonYear,
  })

  const league = createLeagueSeason({
    world,
    playerTeamId,
    seasonYear,
    simSeedBase: seasonYear * 1000 + slotIndex * 17 + Math.floor(Math.random() * 1000),
  })

  const now = new Date().toISOString()
  const draftCareer = {
    version: SAVE_VERSION,
    id: newId(),
    slotIndex,
    createdAt: now,
    updatedAt: now,
    managerName,
    playerTeamId,
    seasonYear,
    seasonIndex: 1,
    phase: 'active',
    rosterMode,
    usedFictionalFill: !!template.usedFictionalFill,
    fictionalTeamCount: template.fictionalCount ?? 0,
    world,
    league,
    homeTactics: resolvePlayerDefaultTactics(team.players),
    seasonHistory: [],
    careerStats: emptyCareerStats(),
    allTimeStats: createAllTimeStats(),
    transferLog: [],
    inbox: [],
    ultiworld: {
      articles: [],
      lastRoundCovered: 0,
      lastPomMonth: null,
      coveredFixtureIds: [],
      seeded: true,
    },
  }
  const sponsorInbox = messagesFromOpenSponsorOffers(draftCareer, {
    date: league.currentDate,
  })
  draftCareer.inbox = mergeInbox(draftCareer, sponsorInbox)

  return writeSlot(slotIndex, draftCareer)
}

/**
 * Upewnia się, że kariera ma kompletną domyślną taktykę (style + O/D-Line).
 * Używane przy ładowaniu starych zapisów bez homeTactics.
 */
export function ensureCareerHomeTactics(career) {
  if (!career) return career
  const team =
    worldTeamById(career.world, career.playerTeamId) ??
    career.league?.teamsById?.[career.playerTeamId] ??
    null
  const players = team?.players ?? []
  const resolved = resolvePlayerDefaultTactics(players, career.homeTactics)
  const prev = career.homeTactics
  const unchanged =
    prev &&
    prev.oLineAttackStyle === resolved.oLineAttackStyle &&
    prev.oLineDefenseStyle === resolved.oLineDefenseStyle &&
    prev.dLineAttackStyle === resolved.dLineAttackStyle &&
    prev.dLineDefenseStyle === resolved.dLineDefenseStyle &&
    prev.forceSide === resolved.forceSide &&
    JSON.stringify(prev.coachDirectives ?? null) ===
      JSON.stringify(resolved.coachDirectives ?? null) &&
    JSON.stringify(prev.oLineCoachDirectives ?? null) ===
      JSON.stringify(resolved.oLineCoachDirectives ?? null) &&
    JSON.stringify(prev.dLineCoachDirectives ?? null) ===
      JSON.stringify(resolved.dLineCoachDirectives ?? null) &&
    JSON.stringify(prev.playerInstructions ?? {}) ===
      JSON.stringify(resolved.playerInstructions ?? {}) &&
    JSON.stringify(prev.playerSubRoles ?? {}) ===
      JSON.stringify(resolved.playerSubRoles ?? {}) &&
    JSON.stringify(prev.lineupWhenOffenseStartPlayerIds) ===
      JSON.stringify(resolved.lineupWhenOffenseStartPlayerIds) &&
    JSON.stringify(prev.lineupWhenDefenseStartPlayerIds) ===
      JSON.stringify(resolved.lineupWhenDefenseStartPlayerIds)
  if (unchanged) return career
  return persistCareer(career, { homeTactics: resolved })
}

/** Zapisuje bieżący stan kariery (świat, liga, taktyka, faza). */
export function persistCareer(career, patch = {}) {
  const world = patch.world ?? career.world
  let league = patch.league ?? career.league
  if (league && world?.teamsById) {
    league = { ...league, teamsById: world.teamsById }
  }
  const team =
    worldTeamById(world, career.playerTeamId ?? patch.playerTeamId) ??
    league?.teamsById?.[career.playerTeamId ?? patch.playerTeamId] ??
    null
  const players = team?.players ?? []
  const rawTactics = patch.homeTactics ?? career.homeTactics
  const homeTactics = resolvePlayerDefaultTactics(players, rawTactics)
  const next = {
    ...career,
    ...patch,
    world,
    league,
    homeTactics,
  }
  return writeSlot(career.slotIndex, next)
}

/** Po oficjalnym końcu sezonu (31 lipca) — archiwizuje (per-season + all-time). */
export function finalizeSeason(career) {
  if (career.phase === 'season_complete') return career
  const league = career.league
  if (!league || !isOfficialSeasonEnded(league)) {
    throw new Error('Sezon nie jest jeszcze zakończony (oficjalny koniec: 31 lipca)')
  }
  league.status = 'complete'
  league.phase = 'offseason'
  league.competitionsComplete = true

  const archive = buildSeasonArchive(career)
  const alreadyArchived = career.seasonHistory.some(
    (s) => s.seasonIndex === career.seasonIndex && s.seasonYear === career.seasonYear,
  )

  const seasonHistory = alreadyArchived
    ? career.seasonHistory
    : [...career.seasonHistory, archive]

  const careerStats = alreadyArchived
    ? career.careerStats
    : mergeLeagueStatsIntoCareer(career.careerStats ?? {}, archive.playerStats)

  const allTimeStats = alreadyArchived
    ? career.allTimeStats ?? createAllTimeStats()
    : applyArchiveToAllTime(career.allTimeStats ?? createAllTimeStats(), archive)

  pruneLeagueMemory(career.league)

  // Koniec sezonu → wszyscy +1 rok (przed offseason transferami / startem kolejnego).
  if (career.world) {
    ageWorldPlayersOneYear(career.world)
  }

  let seasonCycleInbox = []
  let worldAfterCycle = career.world
  let transferLogAfterCycle = career.transferLog ?? []
  if (career.world) {
    ensureWorldFreeAgents(career.world)
    const retire = processSeasonRetirements(
      { ...career, world: career.world },
      {
        leaguePlayerStats: archive.playerStats,
        seed: (career.seasonYear ?? 2025) * 7919 + (career.seasonIndex ?? 1),
      },
    )
    seasonCycleInbox = [...(retire.inboxMessages ?? [])]

    ensureWorldAcademy(career.world)
    runAcademyIntake(career.world, {
      seasonYear: (career.seasonYear ?? 2025) + 1,
      seed: (career.seasonYear ?? 2025) * 13331 + (career.seasonIndex ?? 1),
    })
    const academySweep = sweepAgedOutAcademyPlayers(career.world, {
      playerTeamId: career.playerTeamId,
    })
    runAiAcademyPromotionPass(career.world, {
      playerTeamId: career.playerTeamId,
      seed: (career.seasonYear ?? 2025) * 8081 + (career.seasonIndex ?? 1),
      league: career.league,
    })
    if (academySweep.releasedToFreeAgency?.length) {
      seasonCycleInbox = [
        ...seasonCycleInbox,
        ...messagesFromAcademyAgedOut(academySweep.releasedToFreeAgency, career, {
          date: career.league?.currentDate,
        }),
      ]
    }

    processAiContractCycle(career.world, {
      playerTeamId: career.playerTeamId,
      seed: (career.seasonYear ?? 2025) * 4243,
      league: career.league,
    })
    const faSign = simulateAiFreeAgentSignings(
      { ...career, world: career.world, transferLog: transferLogAfterCycle },
      {
        maxDeals: 6,
        seed: (career.seasonYear ?? 2025) * 5557,
      },
    )
    transferLogAfterCycle = faSign.transferLog ?? transferLogAfterCycle
    worldAfterCycle = career.world
  }

  // Wypłaty sponsorskie na koniec sezonu + wygaśnięcia umów
  let sponsorInbox = []
  if (worldAfterCycle) {
    const seasonEnd = processSeasonEndSponsorPayouts(
      worldAfterCycle,
      career.league,
      career.seasonYear,
    )
    const probe = { ...career, world: worldAfterCycle, league: career.league }
    sponsorInbox = [
      ...messagesFromSponsorPayouts(seasonEnd.payouts, probe, {
        kind: 'season_end',
        date: career.league?.currentDate,
      }),
      ...messagesFromSponsorExpirations(seasonEnd.expirations, probe, {
        date: career.league?.currentDate,
        seasonYear: career.seasonYear,
      }),
      ...messagesFromSponsorExpiringSoon(probe, {
        date: career.league?.currentDate,
        seasonYear: career.seasonYear,
      }),
      ...messagesFromOpenSponsorOffers(probe, {
        date: career.league?.currentDate,
      }),
    ]
  }

  // Bonusy kontraktowe zawodników (spełnione warunki) + kara morale za złamane obietnice.
  let contractObligationInbox = []
  if (worldAfterCycle) {
    const obligations = processSeasonEndContractObligations(worldAfterCycle, {
      league: career.league,
      seasonYear: career.seasonYear,
      playerStats: archive.playerStats,
    })
    const probe = { ...career, world: worldAfterCycle, league: career.league }
    contractObligationInbox = [
      ...messagesFromContractBonusPayouts(obligations.bonusPayouts, probe, {
        date: career.league?.currentDate,
        seasonYear: career.seasonYear,
      }),
      ...messagesFromBrokenPromises(obligations.brokenPromises, probe, {
        date: career.league?.currentDate,
        seasonYear: career.seasonYear,
      }),
    ]
  }

  // Off-season: kluby AI robią serię transferów między sobą.
  const ai = simulateAiOffseasonTransferBurst(
    { ...career, phase: 'season_complete', world: worldAfterCycle, transferLog: transferLogAfterCycle },
    {
      maxDeals: 12,
      seed: (career.seasonYear ?? 2025) * 1009 + (career.seasonIndex ?? 1) * 47,
    },
  )

  return persistCareer(career, {
    phase: 'season_complete',
    seasonHistory,
    careerStats,
    allTimeStats,
    league: career.league,
    world: ai.world ?? worldAfterCycle,
    transferLog: ai.transferLog ?? transferLogAfterCycle,
    aiOffseasonTransferWaves: 1,
    inbox: mergeInbox(
      { ...career, inbox: career.inbox },
      [...seasonCycleInbox, ...sponsorInbox, ...contractObligationInbox],
    ),
  })
}

/** Start kolejnego sezonu — offseason development + nowy kalendarz. */
export function startNextSeason(career) {
  const base =
    career.phase === 'season_complete' ? career : finalizeSeason({ ...career })

  const nextYear = base.seasonYear + 1
  const nextIndex = base.seasonIndex + 1
  const world = base.world ?? createWorldFromTemplate(nextYear)

  applyOffseasonDevelopment(world, {
    leaguePlayerStats: base.seasonHistory?.[base.seasonHistory.length - 1]?.playerStats
      ?? base.league?.playerStats
      ?? null,
    playerTeamId: base.playerTeamId,
    seed: nextYear * 1000 + base.slotIndex * 17 + nextIndex * 31,
  })
  applyAcademyOffseasonDevelopment(world, {
    seed: nextYear * 1000 + base.slotIndex * 17 + nextIndex * 31,
  })
  initAllAiTeamTraining(world, base.playerTeamId)
  ensureTeamTraining(worldTeamById(world, base.playerTeamId))
  resetWorldSeasonStats(world)
  resetWorldSeasonInjuryCounts(world)
  ensureWorldFreeAgents(world)
  rollSeasonBudgets(world, {
    seed: nextYear * 1009 + base.slotIndex * 17 + nextIndex * 31,
  })
  const seasonStartPayouts = processSeasonStartSponsorPayouts(world, nextYear)

  const team = worldTeamById(world, base.playerTeamId)

  const league = createLeagueSeason({
    world,
    playerTeamId: base.playerTeamId,
    seasonYear: nextYear,
    simSeedBase: nextYear * 1000 + base.slotIndex * 17 + nextIndex * 31,
  })

  // Zachowaj wiadomości sponsorskie z końca sezonu (wygaśnięcia / oferty / wypłaty)
  const keptSponsor = (base.inbox ?? []).filter((m) => {
    const k = m?.payload?.kind
    return (
      m?.type === 'club_news' &&
      (k === 'sponsor_expired' ||
        k === 'sponsor_offers' ||
        k === 'sponsor_expiring_soon' ||
        (k === 'sponsor_payout' && m.payload?.payoutKind === 'season_end'))
    )
  })

  const draft = {
    ...base,
    seasonYear: nextYear,
    seasonIndex: nextIndex,
    world,
    league,
    inbox: keptSponsor,
  }
  const sponsorFresh = [
    ...messagesFromSponsorPayouts(seasonStartPayouts, draft, {
      kind: 'season_start',
      date: league.currentDate,
    }),
    ...messagesFromOpenSponsorOffers(draft, { date: league.currentDate }),
  ]

  return persistCareer(base, {
    seasonYear: nextYear,
    seasonIndex: nextIndex,
    phase: 'active',
    world,
    league,
    homeTactics: resolvePlayerDefaultTactics(team?.players ?? [], base.homeTactics),
    transferLog: [],
    inbox: mergeInbox(draft, sponsorFresh),
    ultiworld: {
      articles: [],
      lastRoundCovered: 0,
      lastPomMonth: null,
      coveredFixtureIds: [],
      cupChampionCovered: false,
      seeded: false,
    },
    aiOffseasonTransferWaves: 0,
    aiTransfersLastDate: null,
  })
}

export function careerRecordSummary(career) {
  const history = career.seasonHistory ?? []
  let wins = 0
  let losses = 0
  for (const season of history) {
    wins += season.wins ?? 0
    losses += season.losses ?? 0
  }
  if (career.phase === 'active' && career.league?.standings?.[career.playerTeamId]) {
    wins += career.league.standings[career.playerTeamId].wins ?? 0
    losses += career.league.standings[career.playerTeamId].losses ?? 0
  }
  return { wins, losses, seasonsCompleted: history.length }
}
