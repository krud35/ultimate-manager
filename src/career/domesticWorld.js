import { focusManagerLeague, syncSimulationScope } from './simulationScope.js'
import { initializeFrenchPlayoffs, frenchSeasonMoves } from '../league/frenchPlayoffs.js'
import { DOMESTIC_LEAGUES, normalizeWorldConfig, domesticKey } from '../data/domesticLeagues.js'
import { ACADEMY_COUNTRIES } from '../data/academyScoutGeography.js'
import { createAcademyProspect } from './academy.js'
import { createRng } from '../matchEngine/rng.js'
import { rollRandomSkillsForRoster } from '../data/randomRosterSkills.js'
import { applyClubOvrDistribution } from '../data/eucsRosterBalance.js'
import { sampleRosterCoverage } from '../data/rosterStructures.js'
import { assignRosterArchetypes, finalizeGeneratedPotential } from '../models/playerArchetypes.js'
import { ensurePlayerTraits } from '../models/playerTraits.js'
import { createStandings, standingsTable } from '../league/standings.js'
import { buildDomesticCalendar, domesticFixtures, reconcileDomesticCalendar } from '../league/domesticCalendar.js'
import { createDomesticCup } from '../league/domesticCup.js'
import { syncCupMatchesIntoFixtures } from '../league/cupBracket.js'
import { ensurePlayerContract } from './transfers/playerContracts.js'

/** Shared senior model, applied once when creating a new club. */
function initializeDomesticRoster(players, source, seed, rng) {
  const tier = source.tier ?? 1
  const profileTier = Math.min(3, Math.max(1, tier))
  const random = () => rng.float()
  const rosterCoverage = sampleRosterCoverage(profileTier, random)
  rollRandomSkillsForRoster(players, `${seed}|${source.id}|senior-v2`)
  assignRosterArchetypes(players, profileTier, random, rosterCoverage, { preserveAge: true })
  const countryStrength = ACADEMY_COUNTRIES[source.countryId]?.strength ?? 55
  const strength = Math.max(67, Math.min(83, 78 + (countryStrength - 55) / 10 - (tier - 1) * 5))
    + Math.max(-2.5, Math.min(2.5, source.skillAdjustment ?? 0)) + (random() - 0.5) * 2
  const rosterShape = applyClubOvrDistribution(players, { tier, strength, rng: random, coverage: rosterCoverage })
  finalizeGeneratedPotential(players)
  for (const player of players) ensurePlayerTraits(player, { force: true })
  return { rosterShape, rosterCoverage }
}

/** Off leagues keep only their cup representative; replace retired roster members annually. */
export function replenishCupRepresentatives(world, year) {
  for (const team of Object.values(world.teamsById)) {
    if (team.simulationMode !== 'off') continue
    const rng = createRng(year * 1709 + team.id.length * 31)
    while (team.players.length < 16) {
      const player = createAcademyProspect(() => rng.float(), { teamId: team.id, seasonYear: year, countryId: team.countryId, source: 'cup-representative', index: team.players.length })
      Object.assign(player, { inAcademy: false, status: 'club', age: 19 + Math.floor(rng.float() * 10) })
      ensurePlayerContract(player, { seasonYear: year })
      team.players.push(player)
    }
  }
}

export function buildDomesticWorldTemplate(input, year, seed) {
  const config = normalizeWorldConfig(input)
  // Draw once per competition group; all levels share the same policy in later seasons.
  const holidayRng = createRng(seed + 7319)
  config.christmasBreakByCountry = Object.fromEntries([...new Set(DOMESTIC_LEAGUES.map(l => l.countryId))].map(id => [
    id, config.christmasBreakByCountry?.[id] ?? config.christmasBreak ?? (holidayRng.float() < 0.5),
  ]))
  const clubs = [], seenPlayers = new Map(), importConflicts = []
  const international = Object.entries(config.international).some(([key, enabled]) => key !== 'nationals' && enabled)
  for (const league of DOMESTIC_LEAGUES) {
    const mode = config.leagues[league.id]
    const entries = mode === 'off' && config.simulationModel !== 'focused' ? (international && league.tier === 1 ? league.teams.slice(0, 1) : []) : league.teams
    for (const source of entries) {
      const rng = createRng(seed + clubs.length * 1709)
      const players = []
      const targetSize = source.rawPlayers.length ? 16 : rng.int(16, 29)
      for (const record of source.rawPlayers) {
        const key = domesticKey(`${record.firstName} ${record.lastName}`)
        if (seenPlayers.has(key)) { importConflicts.push({ name: key, retainedAt: seenPlayers.get(key), skippedAt: source.id }); continue }
        seenPlayers.set(key, source.id)
        const p = createAcademyProspect(() => rng.float(), { teamId: source.id, seasonYear: year, countryId: source.countryId, source: 'domestic-roster', index: players.length })
        Object.assign(p, { id: `dom-player-${key}`, firstName: record.firstName, lastName: record.lastName,
          age: 19 + Math.floor(rng.float() * 17), jersey: record.jersey ?? players.length + 1,
          domesticReference: { ...record, generatedAgeAndAbilities: true }, inAcademy: false, status: 'club', contract: null })
        players.push(p)
      }
      while (players.length < targetSize) {
        const p = createAcademyProspect(() => rng.float(), { teamId: source.id, seasonYear: year, countryId: source.countryId, source: 'domestic-fill', index: players.length })
        Object.assign(p, { age: 18 + Math.floor(rng.float() * 18), inAcademy: false, status: 'club', contract: null })
        players.push(p)
      }
      const rosterProfile = initializeDomesticRoster(players, source, seed, rng)
      const identity = { ...source }
      delete identity.rawPlayers
      clubs.push({ ...identity, ...rosterProfile, players, namePl: source.name, nameEn: source.name, shortName: source.name.slice(0, 3).toUpperCase(),
        primaryColor: ['#0369a1', '#166534', '#b91c1c', '#7c3aed'][clubs.length % 4], awayColor: '#f1f5f9', simulationMode: mode === "background" ? "off" : mode, backgroundSimulation: mode === "background" })
    }
  }
  // Countries without a local club catalogue retain a fictional cup-only representative.
  if (config.international.wucc) for (const [countryId, meta] of Object.entries(ACADEMY_COUNTRIES).filter(([, c]) => c.continent === 'africa')) {
    if (clubs.some(t => t.countryId === countryId)) continue
    const id = `cup-representative-${countryId}`, rng = createRng(seed + clubs.length * 1709)
    const players = Array.from({ length: rng.int(16, 29) }, (_, index) => {
      const player = createAcademyProspect(() => rng.float(), { teamId: id, seasonYear: year, countryId, source: 'cup-representative', index })
      return { ...player, age: 19 + Math.floor(rng.float() * 15), inAcademy: false, status: 'club', contract: null }
    })
    const rosterProfile = initializeDomesticRoster(players, { id, countryId, tier: 1 }, seed, rng)
    clubs.push({ id, ...rosterProfile, name: `${meta.labelEn} Cup Representative`, nameEn: `${meta.labelEn} Cup Representative`, namePl: `Reprezentant pucharowy: ${meta.labelPl}`, countryId, country: meta.nameEn, tier: 1, simulationMode: 'off', isFictional: true, players })
  }
  return { teams: clubs, worldConfig: config, importConflicts, usedFictionalFill: false }
}

export function createDomesticSeason(world, playerTeamId, year, seed) {
  focusManagerLeague(world,playerTeamId)
  const config = world.worldConfig
  for (const team of Object.values(world.teamsById)) team.simulationMode = config.leagues[team.domesticLeagueId] ?? 'off'
  syncSimulationScope(world)
  const chosen = world.teamsById[playerTeamId]
  if (playerTeamId && (!chosen || config.leagues[chosen.domesticLeagueId] !== 'playable')) throw new Error('Choose a club from a playable league')
  const competitions = []
  // Persist this world's competition identities. Catalogue changes affect new careers.
  world.domesticLeagueCatalog ??= [...new Set(Object.values(world.teamsById).map(t => t.domesticLeagueId).filter(Boolean))].map(id => {
    const known = DOMESTIC_LEAGUES.find(l => l.id === id)
    const team = Object.values(world.teamsById).find(t => t.domesticLeagueId === id)
    return { id, name: known?.name ?? `${ACADEMY_COUNTRIES[team.countryId]?.labelEn ?? team.countryId} ${team.tier}`, countryId: known?.countryId ?? team.countryId, tier: known?.tier ?? team.tier, frenchPyramid: !!known?.frenchPyramid && Object.values(world.teamsById).some(t=>t.domesticLeagueId?.startsWith("fr-3-")) }
  })
  for (const meta of world.domesticLeagueCatalog) {
    if (config.leagues[meta.id] === 'off') continue
    const teamIds = Object.values(world.teamsById).filter(t => t.domesticLeagueId === meta.id).map(t => t.id)
    if (teamIds.length < 2) continue
    const calendar = buildDomesticCalendar({ seasonYear: year, teamIds, frenchPyramid: meta.frenchPyramid, regionalPlayoffs: meta.frenchPyramid && meta.tier === 3, christmasBreak: config.christmasBreakByCountry?.[meta.countryId] ?? config.christmasBreak ?? true })
    const fixtures = domesticFixtures(teamIds, calendar, seed + competitions.length * 13)
    competitions.push({ id: meta.id, label: meta.name, countryId: meta.countryId, tier: meta.tier, mode: config.leagues[meta.id], focusedSimulation: config.simulationModel === "focused", mainCountryId: config.mainCountryId, frenchPyramid: !!meta.frenchPyramid,
      seasonLabel: `${meta.name} ${year}/${String(year + 1).slice(-2)}`, seasonYear: year, teamIds, calendar,
      currentDate: calendar.startDate, currentRound: 1, totalRounds: Object.keys(calendar.roundDates).length,
      fixtures, standings: createStandings(teamIds), playerStats: {}, cupPlayerStats: {}, matchHistory: [],
      simSeedBase: seed + competitions.length * 13, status: 'active', phase: 'fall', cup: null,
      scheduleRounds: Object.keys(calendar.roundDates).map(r => fixtures.filter(f => f.round === Number(r))) })
  }
  const main = competitions.find(c => c.teamIds.includes(playerTeamId)) ?? competitions.find(c => c.mode === 'playable')
  if (!main) throw new Error('Choose at least one playable league')
  main.playerTeamId = playerTeamId
  main.teamsById = world.teamsById
  main.otherLeagues = competitions.filter(c => c !== main)
  for (const country of new Set(competitions.map(c => c.countryId))) {
    const owner = main.countryId === country ? main : competitions.find(c => c.countryId === country)
    const teamIds = competitions.filter(c => c.countryId === country).flatMap(c => c.teamIds)
    owner.cup = createDomesticCup(country, teamIds, year, seed)
    syncCupMatchesIntoFixtures(owner)
  }
  initializeFrenchPlayoffs(main)
  reconcileDomesticCalendar(main)
  syncSimulationScope(world,main)
  return main
}

export function finishDomesticSeason(career) {
  const world = career.world, year = career.seasonYear
  if (world.domesticSeasonFinalized === year) return
  const tables = [career.league, ...(career.league.otherLeagues ?? [])]
  if (tables.some(l=>l.frenchPyramid) && career.league.frenchPlayoffs?.status !== 'complete') throw new Error('French promotion playoffs must finish before season rollover')
  world.domesticHistory ??= []
  world.domesticHistory.push({ year, leagues: tables.map(l => ({ id: l.id, countryId: l.countryId, standings: standingsTable(l.standings), championTeamId: standingsTable(l.standings)[0]?.teamId, cupChampionTeamId: l.cup?.championTeamId })) })
  world.domesticMovements = []
  for (const country of new Set(tables.map(l => l.countryId))) {
    const levels = tables.filter(l => l.countryId === country).sort((a, b) => a.tier - b.tier)
    const moves = country === "fr" && levels.some(l=>l.frenchPyramid) ? frenchSeasonMoves(career, levels) : []
    for (let i = 0; i < (country === "fr" && levels.some(l=>l.frenchPyramid) ? 0 : levels.length - 1); i++) {
      const upper = levels[i], lower = levels[i + 1]
      const count = Math.min(2, Math.floor(Math.min(upper.teamIds.length, lower.teamIds.length) / 4))
      for (const row of standingsTable(upper.standings).slice(-count)) if (count) moves.push({ teamId: row.teamId, to: lower, type: 'relegations' })
      for (const row of standingsTable(lower.standings).slice(0, count)) moves.push({ teamId: row.teamId, to: upper, type: 'promotions' })
    }
    for (const move of moves) {
      const team = world.teamsById[move.teamId]
      team.domesticLeagueId = move.to.id; team.tier = move.to.tier; team.simulationMode = world.worldConfig.leagues[move.to.id]
      // A human appointment remains playable when their club changes level.
      if (team.id === career.playerTeamId) { team.simulationMode = 'playable'; world.worldConfig.leagues[move.to.id] = 'playable' }
      world.domesticMovements.push({ teamId: team.id, leagueId: move.to.id, type: move.type, year })
    }
  }
  for (const team of Object.values(world.teamsById)) team.simulationMode = world.worldConfig.leagues[team.domesticLeagueId] ?? 'off'
  focusManagerLeague(world,career.playerTeamId)
  syncSimulationScope(world,career.league)
  career.worldConfig = world.worldConfig
  world.domesticSeasonFinalized = year
}
