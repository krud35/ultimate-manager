/**
 * Budowa szablonu ligi 16 drużyn dla wybranego roku (historyczne / losowe składy).
 */
import season2013 from './historical/season-2013.json' with { type: 'json' }
import season2014 from './historical/season-2014.json' with { type: 'json' }
import season2015 from './historical/season-2015.json' with { type: 'json' }
import season2016 from './historical/season-2016.json' with { type: 'json' }
import season2017 from './historical/season-2017.json' with { type: 'json' }
import season2018 from './historical/season-2018.json' with { type: 'json' }
import season2019 from './historical/season-2019.json' with { type: 'json' }
import season2020 from './historical/season-2020.json' with { type: 'json' }
import season2021 from './historical/season-2021.json' with { type: 'json' }
import season2022 from './historical/season-2022.json' with { type: 'json' }
import season2023 from './historical/season-2023.json' with { type: 'json' }
import season2024 from './historical/season-2024.json' with { type: 'json' }
import season2025 from './historical/season-2025.json' with { type: 'json' }
import historicalIndex from './historical/index.json' with { type: 'json' }
import { createFictionalTeams } from './fictionalTeams.js'
import { buildTeamRoster, isActiveRawRow, teamMaxFromRows } from './playerStatsFromUfa.js'
import {
  applyRandomOvrBands,
  rollRandomSkillsForRoster,
  rollTeamStrengthOffset,
} from './randomRosterSkills.js'
import { rollTraitsForPlayer, TRAITS_GEN_VERSION } from '../models/playerTraits.js'
import { ATTACK_STYLES, DEFENSE_STYLES, FORCE_SIDES } from '../matchEngine/tacticsModifiers.js'

const SEASON_DATA = {
  2013: season2013,
  2014: season2014,
  2015: season2015,
  2016: season2016,
  2017: season2017,
  2018: season2018,
  2019: season2019,
  2020: season2020,
  2021: season2021,
  2022: season2022,
  2023: season2023,
  2024: season2024,
  2025: season2025,
}

/** Priorytet franchise’ów z obecnego szablonu przy trim >16. */
export const MODERN_TEAM_PRIORITY = [
  'seattle-cascades',
  'boston-glory',
  'austin-sol',
  'carolina-flyers',
  'chicago-union',
  'colorado-apex',
  'houston-havoc',
  'minnesota-wind-chill',
  'dc-breeze',
  'new-york-empire',
  'oakland-spiders',
  'atlanta-hustle',
  'toronto-rush',
  'montreal-royal',
  'san-diego-growlers',
  'salt-lake-shred',
]

export const HISTORICAL_YEARS = Object.keys(SEASON_DATA)
  .map(Number)
  .sort((a, b) => a - b)

export const LEAGUE_TEAM_SLOTS = 16

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(...parts) {
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

export function getSeasonRawData(year) {
  const data = SEASON_DATA[year]
  if (!data) return null
  return normalizeSeasonDisplayNames(data)
}

const DISPLAY_NAME_BY_ID = {
  'dc-breeze': 'DC Breeze',
  'la-aviators': 'Los Angeles Aviators',
}

function normalizeSeasonDisplayNames(data) {
  if (!data?.teams?.length) return data
  let changed = false
  const teams = data.teams.map((t) => {
    const canonical = DISPLAY_NAME_BY_ID[t.id]
    if (canonical && t.name !== canonical) {
      changed = true
      return { ...t, name: canonical }
    }
    return t
  })
  return changed ? { ...data, teams } : data
}

export function getYearMeta(year) {
  const data = getSeasonRawData(year)
  const fromIndex = (historicalIndex.years ?? []).find((y) => y.year === year)
  const realTeamCount =
    data?.realTeamCount ?? data?.teams?.length ?? fromIndex?.realTeamCount ?? 0
  if (!data && !fromIndex) return null
  return {
    year,
    realTeamCount,
    fictionalFill: Math.max(0, LEAGUE_TEAM_SLOTS - realTeamCount),
    note: data?.note ?? fromIndex?.note,
  }
}

/**
 * Wszystkie realne drużyny z sezonu (bez limitu 16).
 */
export function listSeasonTeams(year) {
  const data = getSeasonRawData(year)
  return [...(data?.teams ?? [])]
}

/**
 * Wybór do 16 realnych drużyn z sezonu (domyślny).
 */
export function selectRealTeamsForYear(year) {
  const data = getSeasonRawData(year)
  if (!data?.teams?.length) return []
  const teams = [...data.teams]
  if (teams.length <= LEAGUE_TEAM_SLOTS) return teams

  const priority = new Map(MODERN_TEAM_PRIORITY.map((id, i) => [id, i]))
  teams.sort((a, b) => {
    const pa = priority.has(a.id) ? priority.get(a.id) : 1000
    const pb = priority.has(b.id) ? priority.get(b.id) : 1000
    if (pa !== pb) return pa - pb
    const wa = (a.wins ?? 0) - (a.losses ?? 0)
    const wb = (b.wins ?? 0) - (b.losses ?? 0)
    if (wb !== wa) return wb - wa
    return String(a.name).localeCompare(String(b.name))
  })
  return teams.slice(0, LEAGUE_TEAM_SLOTS)
}

/**
 * Surowy szablon 16 drużyn (jeszcze bez buildTeamRoster).
 * @param {number} year
 * @param {{ selectedTeamIds?: string[] }} [options]
 */
export function buildRawLeagueTeams(year, options = {}) {
  const allReal = listSeasonTeams(year)
  const byId = new Map(allReal.map((t) => [t.id, t]))

  let requestedIds = options.selectedTeamIds
  if (!requestedIds?.length) {
    requestedIds = selectRealTeamsForYear(year).map((t) => t.id)
  }

  const seen = new Set()
  const real = []
  for (const id of requestedIds) {
    if (seen.has(id) || !byId.has(id)) continue
    seen.add(id)
    real.push({ ...byId.get(id), isFictional: false })
    if (real.length >= LEAGUE_TEAM_SLOTS) break
  }

  if (!real.length && allReal.length) {
    for (const t of selectRealTeamsForYear(year)) {
      real.push({ ...t, isFictional: false })
    }
  }

  const need = LEAGUE_TEAM_SLOTS - real.length
  const usedIds = new Set(real.map((t) => t.id))
  const fictional = createFictionalTeams(need, `year-${year}`, usedIds)
  const selectedIds = real.map((t) => t.id)
  const benchTeams = allReal.filter((t) => !selectedIds.includes(t.id))

  return {
    year,
    realTeamCount: allReal.length,
    selectedRealCount: real.length,
    fictionalCount: fictional.length,
    teams: [...real, ...fictional],
    allSeasonTeams: allReal,
    benchTeams,
    selectedTeamIds: selectedIds,
  }
}

const ATTACK_POOL = Object.values(ATTACK_STYLES)
const DEFENSE_POOL = Object.values(DEFENSE_STYLES)
const FORCE_POOL = Object.values(FORCE_SIDES)

export function rollTeamTacticalIdentity(teamId, seed) {
  const rng = mulberry32(hashSeed(seed, teamId, 'tactics'))
  const attackStyle = ATTACK_POOL[Math.floor(rng() * ATTACK_POOL.length)]
  const defenseStyle = DEFENSE_POOL[Math.floor(rng() * DEFENSE_POOL.length)]
  const forceSide = FORCE_POOL[Math.floor(rng() * FORCE_POOL.length)]
  return {
    label: 'Rolled identity',
    attackStyle,
    defenseStyle,
    forceSide,
    coachDirectives: {
      creativity: rng() * 1.2 - 0.6,
      coverageShade: rng() * 1.0 - 0.5,
      huckAppetite: rng() * 1.2 - 0.6,
      breakAppetite: rng() * 1.0 - 0.5,
      possessionTempo: rng() * 1.2 - 0.6,
    },
    blurb: 'Wylosowany charakter drużyny na start kariery.',
    blurbEn: 'Randomly rolled team identity at career start.',
  }
}

/**
 * @param {{ year: number, rosterMode?: 'historical'|'random', seed?: number, selectedTeamIds?: string[] }} options
 */
export function buildSeasonLeagueTemplate(options) {
  const year = options.year
  const rosterMode = options.rosterMode ?? 'historical'
  const seed = options.seed ?? year * 1009
  const data = getSeasonRawData(year)
  if (!data) {
    throw new Error(`Brak bazy historycznej dla roku ${year}`)
  }
  const raw = buildRawLeagueTeams(year, { selectedTeamIds: options.selectedTeamIds })

  let idCursor = year * 100000 + 1
  const teams = []
  const tacticalByTeamId = {}

  // Historyczne: normalizacja względem całej ligi (nie składu), bez balance OVR.
  const leagueStatMax =
    rosterMode === 'historical'
      ? teamMaxFromRows(
          raw.teams.flatMap((t) => (t.players ?? []).filter(isActiveRawRow)),
        )
      : null

  for (const rawTeam of raw.teams) {
    const idStart = idCursor
    idCursor += Math.max(40, (rawTeam.players?.length ?? 0) + 5)

    let players =
      rosterMode === 'historical'
        ? buildTeamRoster(rawTeam.name, rawTeam.players ?? [], idStart, {
            mode: 'historical',
            balance: false,
            statMax: leagueStatMax,
          })
        : buildTeamRoster(rawTeam.name, rawTeam.players ?? [], idStart, {
            mode: 'equalized',
            balance: false,
          })

    if (rosterMode === 'random') {
      players = rollRandomSkillsForRoster(players, `${seed}:${rawTeam.id}`)
      const teamStrengthOffset = rollTeamStrengthOffset(`${seed}:${rawTeam.id}`)
      applyRandomOvrBands(players, `${seed}:${rawTeam.id}:ovr`, teamStrengthOffset)
    }

    for (const p of players) {
      p.traits = rollTraitsForPlayer({
        ...p,
        id: hashSeed(seed, p.id, 'career-traits'),
      })
      p.traitsGen = TRAITS_GEN_VERSION
    }

    tacticalByTeamId[rawTeam.id] = rollTeamTacticalIdentity(rawTeam.id, seed)

    teams.push({
      id: rawTeam.id,
      name: rawTeam.namePl ?? rawTeam.name,
      namePl: rawTeam.namePl ?? rawTeam.name,
      nameEn: rawTeam.nameEn ?? rawTeam.namePl ?? rawTeam.name,
      shortName: rawTeam.shortName,
      primaryColor: rawTeam.primaryColor,
      awayColor: rawTeam.awayColor,
      isFictional: !!rawTeam.isFictional,
      players,
    })
  }

  return {
    year,
    rosterMode,
    realTeamCount: raw.realTeamCount,
    fictionalCount: raw.fictionalCount,
    usedFictionalFill: raw.fictionalCount > 0,
    teams,
    tacticalByTeamId,
  }
}
