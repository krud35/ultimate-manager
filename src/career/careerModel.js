/**
 * Model kariery managerskiej: tworzenie, archiwizacja sezonu, start kolejnego.
 */

import { createLeagueSeason } from '../league/leagueState.js'
import { isOfficialSeasonEnded } from '../league/dayEngine.js'
import { resolvePlayerDefaultTactics } from '../matchEngine'
import { SAVE_VERSION, STARTING_SEASON_YEAR, EUCS_STARTING_SEASON_YEAR } from './constants.js'
import { writeSlot, saveCareerNow } from './saveStore.js'
import { standingsTable } from '../league/standings.js'
import { simulateAdHocMatch } from '../league/leagueEngine.js'
import {
  EUCS_TIERS,
  buildEucsLeagueTemplate,
  eucsTeamsForTier,
  eucsTeamTier,
} from '../data/eucsLeagueTeams.js'
import { materializeFullPyramidTeams } from '../league/shadowLeague.js'
import { createOtherLeague } from '../league/otherLeagues.js'
import { computePyramidMovement } from '../league/promotionRelegation.js'
import {
  createWorldFromTemplate,
  initWorldPlayerStats,
  resetWorldSeasonStats,
  worldTeamById,
  worldTeamsList,
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
import { setMoneyCurrency } from './transfers/moneyFormat.js'
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
import { ensureTeamFacilities, ensureWorldFacilities } from './clubFacilities.js'
import { processLeaguePlacementPrizes, messagesFromLeaguePlacementPrizes, messageFromCupPlacementPrize } from './placementPrizes.js'
import { mergeInbox, messagesFromAcademyAgedOut } from './inbox.js'
import { ensureWorldReputation } from '../models/teamReputation.js'
import { ensureWorldFans } from '../models/teamFans.js'
import { ensureWorldScouting } from './scouting.js'
import { ensureWorldSponsors } from './clubSponsors.js'
import { refreshTeamMarketValues } from './transfers/playerValue.js'
import { ensureAiCoachProfiles } from '../matchEngine/aiCoachProfile.js'
import { ensureCareerNationalTeams } from './nationalTeams.js'
import { maybeStartNationalTeamSeason } from './nationalTeamSeason.js'

/** Cel łącznej liczby zawodników w lidze (senior roster, 16 drużyn) — utrzymuje pulę graczy w ryzach. */
const ROSTER_STABILIZE_TARGET = 500

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
  if (options.competition === 'eucs') {
    return createEucsCareer(slotIndex, { ...options, managerName })
  }
  // Kwoty $ zapisywane w treści wiadomości powitalnych (np. oferty sponsorskie) są
  // formatowane od razu tutaj, zanim App.jsx zdąży zsynchronizować walutę przy
  // następnym renderze — ustawiamy więc jawnie na start tworzenia kariery.
  setMoneyCurrency('USD')
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
 * Nowa kariera w Lidze Europejskiej (EUCS) — piramida 3 poziomów. `options.playerTeamId`
 * ustala start Ligę (1/2/3); pozostałe dwa poziomy startują jako lekkie ligi cieniowe.
 */
function createEucsCareer(slotIndex, options) {
  // Patrz notatka w createCareer() — walutę trzeba ustawić przed budową wiadomości
  // powitalnych, nie po (App.jsx synchronizuje ją dopiero przy kolejnym renderze).
  setMoneyCurrency('EUR')
  const managerName = options.managerName
  const playerTeamId = options.playerTeamId
  const tier = eucsTeamTier(playerTeamId)
  if (!tier) {
    throw new Error(`Nieznana drużyna Ligi Europejskiej: ${playerTeamId}`)
  }
  const seasonYear = options.seasonYear ?? EUCS_STARTING_SEASON_YEAR

  const financeSeed = seasonYear * 1009 + slotIndex * 17 + Math.floor(Math.random() * 1000)
  const template = buildEucsLeagueTemplate({
    tier,
    teamIds: eucsTeamsForTier(tier).map((t) => t.id),
    seed: financeSeed,
  })
  const world = createWorldFromTemplate(seasonYear, {
    financeSeed,
    rosterMode: 'random',
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
  ensureTeamFacilities(team, { seed: financeSeed })
  ensureTeamSponsors(team, { seed: financeSeed, seasonYear, autoSign: false })
  team.sponsors.main = null
  team.sponsors.secondary = null
  refreshSponsorOffers(team, 'main', { seed: `${financeSeed}|player|main`, seasonYear })
  refreshSponsorOffers(team, 'secondary', {
    seed: `${financeSeed}|player|secondary`,
    seasonYear,
  })

  const simSeedBase = seasonYear * 1000 + slotIndex * 17 + Math.floor(Math.random() * 1000)
  const league = createLeagueSeason({
    world,
    playerTeamId,
    seasonYear,
    simSeedBase,
    // Jawnie — world.teamIds zaraz urośnie do wszystkich 48 klubów piramidy (patrz
    // materializeFullPyramidTeams poniżej); liga gracza ma zostać przy jego 16.
    teamIds: eucsTeamsForTier(tier).map((t) => t.id),
    seasonLabel: `UltiLeague ${tier} ${seasonYear}/${String(seasonYear + 1).slice(-2)}`,
  })

  const tierIds = Object.fromEntries(EUCS_TIERS.map((t) => [t, eucsTeamsForTier(t).map((x) => x.id)]))
  league.eucsPyramid = { tier1Ids: tierIds[1], tier2Ids: tierIds[2], tier3Ids: tierIds[3] }

  // Wszystkie 48 klubów piramidy dostają pełny skład + finanse + obiekty OD RAZU (nie
  // tylko poziom gracza) — bo odtąd KAŻDY mecz w tle (liga i puchar) idzie przez ten
  // sam silnik co liga gracza, więc każdy klub potrzebuje prawdziwego składu do
  // rozegrania i realnych staty zawodników. Poziom gracza jest już w world.teamsById
  // (z buildEucsLeagueTemplate powyżej) — materializeFullPyramidTeams pomija go.
  const allPyramidIds = [...tierIds[1], ...tierIds[2], ...tierIds[3]]
  materializeFullPyramidTeams(world, allPyramidIds, financeSeed)
  ensureAiCoachProfiles(world, playerTeamId)
  initWorldPlayerStats(world, { playerTeamId })
  initWorldPlayerDevelopment(world, { playerTeamId })
  for (const t of worldTeamsList(world)) refreshTeamMarketValues(t)

  // Dwie pozostałe ligi rozgrywają się DZIEŃ PO DNIU w tym samym kalendarzu co liga
  // gracza (ten sam `league.calendar`, więc kolejka N wypada tego samego dnia na
  // wszystkich 3 poziomach) — patrz advanceCalendarDay w dayEngine.js.
  const otherLeagues = EUCS_TIERS.filter((t) => t !== tier).map((otherTier) =>
    createOtherLeague({
      id: `tier${otherTier}`,
      label: `UltiLeague ${otherTier}`,
      teamIds: tierIds[otherTier],
      calendar: league.calendar,
      simSeedBase: simSeedBase + otherTier,
    }),
  )
  league.otherLeagues = otherLeagues

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
    rosterMode: 'random',
    competition: 'eucs',
    pyramid: { tier },
    usedFictionalFill: false,
    fictionalTeamCount: 0,
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

  // Kadry narodowe (Fazy 1-5, EUCS-only — patrz nationalTeamSeason.js) — pierwszy sezon
  // bywa od razu rokiem turniejowym (ME 2027 startuje bez kwalifikacji, kariera zaczyna
  // się za późno na sezon kwalifikacyjny przed nim), więc trzeba to sprawdzić już tutaj,
  // nie tylko przy starcie kolejnego sezonu (startNextSeasonEucs).
  ensureCareerNationalTeams(draftCareer)
  maybeStartNationalTeamSeason(draftCareer, { seasonYear, calendar: league.calendar })

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
    JSON.stringify(prev.oLinePlayerInstructions ?? prev.playerInstructions ?? {}) ===
      JSON.stringify(resolved.oLinePlayerInstructions ?? {}) &&
    JSON.stringify(prev.dLinePlayerInstructions ?? {}) ===
      JSON.stringify(resolved.dLinePlayerInstructions ?? {}) &&
    JSON.stringify(prev.playerSubRoles ?? {}) ===
      JSON.stringify(resolved.playerSubRoles ?? {}) &&
    JSON.stringify(prev.lineupWhenOffenseStartPlayerIds) ===
      JSON.stringify(resolved.lineupWhenOffenseStartPlayerIds) &&
    JSON.stringify(prev.lineupWhenDefenseStartPlayerIds) ===
      JSON.stringify(resolved.lineupWhenDefenseStartPlayerIds)
  if (unchanged) return career
  return persistCareer(career, { homeTactics: resolved })
}

/**
 * Oblicza nowy stan kariery (świat, liga, taktyka, faza) po zastosowaniu
 * `patch` — TYLKO w pamięci, bez zapisu na dysk. Gra zapisuje na dysk
 * wyłącznie przy jawnych checkpointach (koniec dnia, symulacja do meczu/
 * daty, rozegrany mecz, zmiana sezonu, wyjście do menu) przez
 * `saveCareerNow()` — patrz saveStore.js. Reszta akcji (wiadomości, taktyka,
 * negocjacje...) aktualizuje tylko stan w React, żeby nie blokować UI
 * kosztownym zapisem przy każdym kliknięciu.
 */
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
  return {
    ...career,
    ...patch,
    world,
    league,
    homeTactics,
  }
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
    // Liczba podpisań FA skalowana do niedoboru wobec celu ligi — stabilizuje
    // łączną liczbę zawodników w lidze wokół ROSTER_STABILIZE_TARGET zamiast
    // pozwalać jej kurczyć się z sezonu na sezon (emerytury > dopływ).
    const rosterTotalBeforeFa = worldTeamsList(career.world).reduce(
      (sum, t) => sum + (t.players?.length ?? 0),
      0,
    )
    const rosterDeficit = ROSTER_STABILIZE_TARGET - rosterTotalBeforeFa
    const dynamicFaMaxDeals = Math.max(10, Math.min(60, 10 + Math.round(rosterDeficit * 0.8)))
    const faSign = simulateAiFreeAgentSignings(
      { ...career, world: career.world, transferLog: transferLogAfterCycle },
      {
        maxDeals: dynamicFaMaxDeals,
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

  // Liga Europejska: premia ligowa (lokata) + premia pucharowa (Puchar Piramidy).
  let prizeInbox = []
  if (worldAfterCycle && career.competition === 'eucs' && career.pyramid?.tier) {
    const leaguePrizes = processLeaguePlacementPrizes(
      worldAfterCycle,
      career.league,
      career.pyramid.tier,
    )
    const probe = { ...career, world: worldAfterCycle, league: career.league }
    prizeInbox = messagesFromLeaguePlacementPrizes(leaguePrizes, probe, {
      date: career.league?.currentDate,
    })
    const cupMsg = messageFromCupPlacementPrize(probe, { date: career.league?.currentDate })
    if (cupMsg) prizeInbox.push(cupMsg)
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

  return saveCareerNow(persistCareer(career, {
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
      [...seasonCycleInbox, ...sponsorInbox, ...prizeInbox, ...contractObligationInbox],
    ),
  }))
}

/** Start kolejnego sezonu — offseason development + nowy kalendarz. */
export function startNextSeason(career) {
  if (career.competition === 'eucs') {
    return startNextSeasonEucs(career)
  }
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

  return saveCareerNow(persistCareer(base, {
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
  }))
}

/**
 * Start kolejnego sezonu w Lidze Europejskiej: rozstrzyga ligi cieniowe, liczy
 * awanse/spadki (computePyramidMovement), i przebudowuje world/league drużyny gracza
 * dla jej nowego poziomu (przycina odchodzące drużyny, dogenerowuje przychodzące).
 */
function eucsSeedHash(...parts) {
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

function startNextSeasonEucs(career) {
  const base = career.phase === 'season_complete' ? career : finalizeSeason({ ...career })

  const nextYear = base.seasonYear + 1
  const nextIndex = base.seasonIndex + 1
  const currentTier = base.pyramid.tier
  const seed = nextYear * 1000 + base.slotIndex * 17 + nextIndex * 31
  const world = base.world

  // Obie pozostałe ligi rozegrały już cały sezon dzień po dniu (patrz otherLeagues.js /
  // advanceCalendarDay) — ich tabele są więc już ostateczne, bez żadnego dodatkowego
  // rozstrzygania w tle.
  const tables = {
    [currentTier]: standingsTable(base.league.standings).map((r) => r.teamId),
  }
  for (const otherLeague of base.league.otherLeagues ?? []) {
    const tierNum = Number(otherLeague.id.replace('tier', ''))
    tables[tierNum] = standingsTable(otherLeague.standings).map((r) => r.teamId)
  }

  // Wszystkie 48 drużyn mają już pełny skład od startu sezonu, więc barażowe mecze
  // (3v6 / 4v5 / finał) zawsze idą przez ten sam silnik co liga gracza — nie ma już
  // rozróżnienia "gracz kontra reszta".
  const resolveMatch = (teamAId, teamBId) => {
    const teamA = worldTeamById(world, teamAId)
    const teamB = worldTeamById(world, teamBId)
    const matchSeed = seed ^ eucsSeedHash(seed, teamAId, teamBId)
    return simulateAdHocMatch(teamA, teamB, matchSeed).winner
  }

  const movement = computePyramidMovement({
    tier1Table: tables[1],
    tier2Table: tables[2],
    tier3Table: tables[3],
    resolveMatch,
  })
  const nextTierIds = { 1: movement.tier1Next, 2: movement.tier2Next, 3: movement.tier3Next }
  const newTier = EUCS_TIERS.find((t) => nextTierIds[t].includes(base.playerTeamId))

  applyOffseasonDevelopment(world, {
    leaguePlayerStats:
      base.seasonHistory?.[base.seasonHistory.length - 1]?.playerStats ??
      base.league?.playerStats ??
      null,
    playerTeamId: base.playerTeamId,
    seed,
  })
  applyAcademyOffseasonDevelopment(world, { seed })
  initAllAiTeamTraining(world, base.playerTeamId)
  ensureTeamTraining(worldTeamById(world, base.playerTeamId))
  resetWorldSeasonStats(world)
  resetWorldSeasonInjuryCounts(world)
  ensureWorldFreeAgents(world)
  rollSeasonBudgets(world, { seed })
  const seasonStartPayouts = processSeasonStartSponsorPayouts(world, nextYear)

  // Wszystkie 48 drużyn piramidy zostają w world.teamsById na stałe (rosną/starzeją
  // się/rozwijają jak prawdziwe kluby) — żadnego przycinania/dogenerowywania między
  // sezonami. `world.teamIds` = kanoniczna lista wszystkich 48 (dla ensureWorldX,
  // cotygodniowych przebiegów finansowych itd.); `league.teamIds` (poniżej, przez
  // createLeagueSeason) zostaje tym co zawsze było — tylko 16 drużyn poziomu gracza.
  const newTierIds = nextTierIds[newTier]
  world.teamIds = [...nextTierIds[1], ...nextTierIds[2], ...nextTierIds[3]]

  ensureAiCoachProfiles(world, base.playerTeamId)
  ensureWorldFinances(world, { seed, force: false })
  ensureWorldContracts(world, { seed, force: false, syncBudgets: true })
  ensureWorldReputation(world)
  ensureWorldFans(world, { seed, force: false })
  ensureWorldFacilities(world, { seed, force: false })
  ensureWorldScouting(world)
  ensureWorldAcademy(world)
  ensureWorldSponsors(world, {
    seed,
    seasonYear: nextYear,
    force: false,
    autoSign: true,
    playerTeamId: base.playerTeamId,
  })
  for (const t of worldTeamsList(world)) refreshTeamMarketValues(t)
  initWorldPlayerStats(world, { playerTeamId: base.playerTeamId })
  initWorldPlayerDevelopment(world, { playerTeamId: base.playerTeamId })

  const team = worldTeamById(world, base.playerTeamId)

  const league = createLeagueSeason({
    world,
    playerTeamId: base.playerTeamId,
    seasonYear: nextYear,
    simSeedBase: seed,
    teamIds: newTierIds,
    seasonLabel: `UltiLeague ${newTier} ${nextYear}/${String(nextYear + 1).slice(-2)}`,
  })
  const tierIds = Object.fromEntries(
    EUCS_TIERS.map((t) => [t, nextTierIds[t]]),
  )
  league.eucsPyramid = { tier1Ids: tierIds[1], tier2Ids: tierIds[2], tier3Ids: tierIds[3] }

  const otherLeagues = EUCS_TIERS.filter((t) => t !== newTier).map((otherTier) =>
    createOtherLeague({
      id: `tier${otherTier}`,
      label: `UltiLeague ${otherTier}`,
      teamIds: nextTierIds[otherTier],
      calendar: league.calendar,
      simSeedBase: seed + otherTier,
    }),
  )
  league.otherLeagues = otherLeagues

  // Kadry narodowe (Fazy 1-5) — sprawdza, czy nadchodzący sezon jest kwalifikacyjny czy
  // turniejowy dla `nextTournament` (patrz nationalTeamSeason.js). Mutuje `base` w miejscu;
  // `draft`/`persistCareer` niżej biorą `nationalTeams` przez zwykły spread `...base`.
  maybeStartNationalTeamSeason(base, { seasonYear: nextYear, calendar: league.calendar })

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
    pyramid: { tier: newTier },
    lastPyramidMovements: movement.movements,
    inbox: keptSponsor,
  }
  const sponsorFresh = [
    ...messagesFromSponsorPayouts(seasonStartPayouts, draft, {
      kind: 'season_start',
      date: league.currentDate,
    }),
    ...messagesFromOpenSponsorOffers(draft, { date: league.currentDate }),
  ]

  return saveCareerNow(persistCareer(base, {
    seasonYear: nextYear,
    seasonIndex: nextIndex,
    phase: 'active',
    world,
    league,
    pyramid: { tier: newTier },
    lastPyramidMovements: movement.movements,
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
  }))
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
