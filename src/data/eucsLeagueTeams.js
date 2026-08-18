/**
 * Liga Europejska (EUCS Open) — piramida 3 poziomów (16+16+16), zbudowana z realnych
 * klubów (nazwy/wyniki: src/data/eucs/eucsPyramidTeams.json). Składy zawodników są
 * zawsze losowe (brak publicznych danych o zawodnikach na poziomie klubu w tym źródle),
 * a siła składu jest skalowana realnym winPct/goal-diff klubu w ramach jego poziomu.
 */
import eucsPyramidTeams from './eucs/eucsPyramidTeams.json' with { type: 'json' }
import eucsClubHistory from './eucs/eucsClubHistory.json' with { type: 'json' }
import eucsRealRosters from './eucs/eucsRealRosters.json' with { type: 'json' }
import { buildTeamRoster } from './playerStatsFromUfa.js'
import { applyRandomOvrBands, rollRandomSkillsForRoster } from './randomRosterSkills.js'
import { rollTeamTacticalIdentity } from './seasonLeagueBuilder.js'
import { rollTraitsForPlayer, TRAITS_GEN_VERSION } from '../models/playerTraits.js'
import { getOverallRating } from '../models/playerStats.js'

export const EUCS_LEAGUE_TIER_SLOTS = 16
export const EUCS_TIERS = [1, 2, 3]

const EUCS_TEAMS = eucsPyramidTeams.teams

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

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

/** Paleta klubowa — pary kolorów dobrane pod kątem kontrastu dom/wyjazd. */
const COLOR_PAIRS = [
  ['#0d9488', '#f8fafc'], ['#1e40af', '#f8fafc'], ['#b91c1c', '#f8fafc'],
  ['#7c3aed', '#fbbf24'], ['#ca8a04', '#0f172a'], ['#0f766e', '#fbbf24'],
  ['#c2410c', '#0f172a'], ['#1d4ed8', '#f97316'], ['#be123c', '#f8fafc'],
  ['#15803d', '#f8fafc'], ['#0ea5e9', '#0f172a'], ['#dc2626', '#0f172a'],
  ['#7c2d12', '#fde68a'], ['#4338ca', '#f8fafc'], ['#065f46', '#f8fafc'],
  ['#9d174d', '#f8fafc'], ['#334155', '#f8fafc'], ['#166534', '#facc15'],
  ['#1e3a8a', '#f8fafc'], ['#a21caf', '#f8fafc'],
]

function colorsFor(teamId) {
  const idx = hashSeed('eucs-colors', teamId) % COLOR_PAIRS.length
  return COLOR_PAIRS[idx]
}

function shortNameFor(name) {
  const cleaned = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim()
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase().slice(0, 4)
}

/** Tożsamość klubu (bez pełnego składu) — do listy wyboru drużyny przy tworzeniu kariery. */
export function eucsTeamIdentity(team) {
  const [primaryColor, awayColor] = colorsFor(team.id)
  return {
    id: team.id,
    name: team.name,
    namePl: team.name,
    nameEn: team.name,
    shortName: shortNameFor(team.name),
    primaryColor,
    awayColor,
    tier: team.tier,
    isFictional: false,
    winPct: team.winPct,
    wins: team.wins,
    losses: team.losses,
  }
}

export function eucsTeamsForTier(tier) {
  return EUCS_TEAMS.filter((t) => t.tier === tier).map(eucsTeamIdentity)
}

export function eucsTeamById(teamId) {
  const raw = EUCS_TEAMS.find((t) => t.id === teamId)
  return raw ? eucsTeamIdentity(raw) : null
}

/** Realny winPct (0–100) dowolnej z 48 drużyn — do rozstrzygania meczów cieniowych poza wielką ligą. */
export function eucsTeamStrength(teamId) {
  return EUCS_TEAMS.find((t) => t.id === teamId)?.winPct ?? 50
}

export function eucsTeamTier(teamId) {
  return EUCS_TEAMS.find((t) => t.id === teamId)?.tier ?? null
}

/** Realne osiągnięcia klubu w EUCF (ultimate-reference.com) — puste [] gdy brak dopasowania. */
export function eucsTeamHistory(teamId) {
  return eucsClubHistory.achievements?.[teamId] ?? []
}

const FIRST_NAMES = [
  'Lukas', 'Mateo', 'Elias', 'Anton', 'Nils', 'Sven', 'Henrik', 'Oskar', 'Emil', 'Viggo',
  'Mathis', 'Louis', 'Hugo', 'Théo', 'Gabriel', 'Antoine', 'Bruno', 'Rafael', 'Diego', 'Marco',
  'Luca', 'Giulio', 'Enzo', 'Tomas', 'Jakub', 'Wojciech', 'Vaclav', 'Andris', 'Karlis', 'Rasmus',
  'Erik', 'Magnus', 'Bjorn', 'Finn', 'Cormac', 'Declan', 'Callum', 'Rory', 'Sean', 'Aidan',
]

const LAST_NAMES = [
  'Müller', 'Schneider', 'Weber', 'Novak', 'Kovac', 'Dubois', 'Lefevre', 'Moreau', 'Bernard', 'Rossi',
  'Bianchi', 'Ferrari', 'Garcia', 'Martinez', 'Fernandez', 'Silva', 'Costa', 'Andersson', 'Johansson', 'Nielsen',
  'Hansen', 'Larsen', 'Virtanen', 'Korhonen', 'Berg', 'Halvorsen', 'De Vries', 'Bakker', 'Janssen', 'Kowalski',
  'Nowak', 'Horvat', 'Novakova', 'Doyle', 'Walsh', 'Kelly', 'Murphy', 'Byrne', 'Wallace', 'Fraser',
]

/**
 * Realny skład klubu (nazwiska/numery z eucsRealRosters.json), przekonwertowany na
 * surowy format wiersza jak przy UFA — tylko dla przygotowania rosteru; sam poziom
 * umiejętności i tak jest potem w pełni losowy (rollRandomSkillsForRoster), zgodnie
 * z tym samym wzorcem co losowe składy UFA. `ha` = liczba meczów, żeby zawodnicy z
 * 0 goli i 0 asyst (typowo obrońcy/handlerzy wspierający) nie odpadli z rosteru jako
 * "nieaktywni" mimo że naprawdę grali. Zwraca null gdy brak realnych danych dla klubu.
 */
function realRawRowsFor(teamId) {
  const entry = eucsRealRosters.teams?.[teamId]
  if (!entry || entry.notFound || !entry.players?.length) return null
  return entry.players.map((p) => ({
    jersey: p.jersey ?? 0,
    firstName: p.firstName,
    lastName: p.lastName,
    gls: p.goals ?? 0,
    ast: p.assists ?? 0,
    blk: 0,
    // Zawsze > 0: kilka rosterów źródłowych ma "0 meczów" dla całego składu (dane
    // wystawione bez wpisanego boxscore) — to i tak realni, nazwani zawodnicy, więc
    // nie mogą odpaść z filtra "aktywności" tylko dlatego że statystyki są puste.
    ha: 1,
    throwingYards: 0,
    receivingYards: 0,
  }))
}

/** Surowy wiersz zawodnika (jak UFA raw) — profil statystyk podobny do fictionalTeams.js. */
function inventRawPlayer(rng, index) {
  const tier = rng()
  const star = tier > 0.92
  const good = !star && tier > 0.78
  const scale = star ? 1.35 + rng() * 0.4 : good ? 0.85 + rng() * 0.35 : 0.25 + rng() * 0.55
  const handlerBias = rng() > 0.55
  const gls = Math.round((handlerBias ? 4 : 12) * scale + rng() * 6)
  const ast = Math.round((handlerBias ? 14 : 5) * scale + rng() * 5)
  const blk = Math.round((3 + rng() * 8) * (star ? 1.2 : 0.8))
  const ha = Math.round((handlerBias ? 12 : 4) * scale)
  const throwingYards = Math.round((handlerBias ? 1400 : 400) * scale + rng() * 200)
  const receivingYards = Math.round((handlerBias ? 500 : 1200) * scale + rng() * 200)
  return {
    jersey: index + 1,
    firstName: pick(rng, FIRST_NAMES),
    lastName: pick(rng, LAST_NAMES),
    gls, ast, blk, ha, throwingYards, receivingYards,
  }
}

/**
 * Podgląd składu (numer + imię i nazwisko, BEZ statystyk/skilli) — tani do pokazania
 * w profilu klubu przy wyborze drużyny, bez uruchamiania pełnego builda umiejętności.
 * Ta sama formuła seeda co buildEucsLeagueTemplate (domyślny seed per poziom), więc
 * nazwiska są stabilne między odsłonami tego samego klubu w tej samej sesji.
 */
export function eucsTeamRosterPreview(teamId, seed) {
  const raw = EUCS_TEAMS.find((t) => t.id === teamId)
  if (!raw) return []
  const realRows = realRawRowsFor(teamId)
  if (realRows) {
    return realRows.map((p) => ({ jersey: p.jersey, firstName: p.firstName, lastName: p.lastName }))
  }
  const effectiveSeed = seed ?? raw.tier * 7919 + 1
  const teamRng = mulberry32(hashSeed(effectiveSeed, raw.id, 'roster'))
  const rosterSize = 22 + Math.floor(teamRng() * 8)
  const rows = []
  for (let i = 0; i < rosterSize; i += 1) {
    const p = inventRawPlayer(teamRng, i)
    rows.push({ jersey: p.jersey, firstName: p.firstName, lastName: p.lastName })
  }
  return rows
}

/** Maks. przesunięcie OVR między najsłabszą a najsilniejszą drużyną W RAMACH poziomu. */
const TIER_STRENGTH_SPREAD = 6.5

/**
 * Bazowe przesunięcie OVR MIĘDZY poziomami piramidy — rosnąca (niby-wykładnicza) luka,
 * żeby Liga 2 była zauważalnie słabsza od Ligi 1, a Liga 3 wyraźnie słabsza od Ligi 2
 * (ale nie degenerująco), i żeby w Lidze 3 prawie nie było zawodników z OVR 90+.
 */
const TIER_BASE_OFFSET = { 1: 0, 2: -4, 3: -6 }

/** Przesunięcie OVR drużyny: baza poziomu + pozycja w ramach realnego winPct tego poziomu (+ szum). */
function strengthOffsetFromRealResult(team, tierTeams, seed) {
  const values = tierTeams.map((t) => t.winPct ?? 0)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const norm = span > 0 ? ((team.winPct ?? 0) - min) / span : 0.5
  const rng = mulberry32(hashSeed(seed, team.id, 'eucs-strength-noise'))
  const noise = (rng() - 0.5) * 2
  const withinTier = (norm - 0.5) * 2 * TIER_STRENGTH_SPREAD + noise * 1.5
  return (TIER_BASE_OFFSET[team.tier] ?? 0) + withinTier
}

let idCursorBase = 900000000

/**
 * @param {{ tier: 1|2|3, teamIds?: string[], seed?: number }} options
 */
export function buildEucsLeagueTemplate(options) {
  const tier = options.tier
  const seed = options.seed ?? tier * 7919 + 1
  const tierTeamsRaw = EUCS_TEAMS.filter((t) => t.tier === tier)
  const requestedIds = options.teamIds?.length
    ? new Set(options.teamIds)
    : new Set(tierTeamsRaw.map((t) => t.id))
  const selected = tierTeamsRaw.filter((t) => requestedIds.has(t.id))

  const teams = []
  const tacticalByTeamId = {}
  let idCursor = idCursorBase + tier * 1000000

  for (const rawTeam of selected) {
    const identity = eucsTeamIdentity(rawTeam)
    const realRows = realRawRowsFor(rawTeam.id)
    let rawRows
    if (realRows) {
      rawRows = realRows
    } else {
      const teamRng = mulberry32(hashSeed(seed, rawTeam.id, 'roster'))
      const rosterSize = 22 + Math.floor(teamRng() * 8)
      rawRows = []
      for (let i = 0; i < rosterSize; i += 1) {
        rawRows.push(inventRawPlayer(teamRng, i))
      }
    }

    const idStart = idCursor
    idCursor += rawRows.length + 5

    let players = buildTeamRoster(identity.name, rawRows, idStart, {
      mode: 'equalized',
      balance: false,
    })
    players = rollRandomSkillsForRoster(players, `${seed}:${rawTeam.id}`)
    const teamStrengthOffset = strengthOffsetFromRealResult(rawTeam, tierTeamsRaw, seed)
    applyRandomOvrBands(players, `${seed}:${rawTeam.id}:ovr`, teamStrengthOffset)

    // Potencjał zawodnika liczy się później (ensurePlayerDevelopment) z bieżącego OVR —
    // ale bieżący OVR zawiera już "boost" między-poziomowy (TIER_BASE_OFFSET), którego
    // NIE chcemy przenosić na sufit rozwoju. Zapisujemy więc "OVR bez boostu" jako
    // podpowiedź; ensurePlayerDevelopment użyje jej zamiast bieżącego OVR przy pierwszym
    // liczeniu potencjału, więc sam boost wpływa tylko na obecną siłę, nie na sufit.
    const tierBoost = TIER_BASE_OFFSET[tier] ?? 0
    for (const p of players) {
      const actualOvr = getOverallRating(p.skills)
      p.eucsBaselineOvr = Math.max(60, Math.min(97, Math.round(actualOvr - tierBoost)))
    }

    for (const p of players) {
      p.traits = rollTraitsForPlayer({ ...p, id: hashSeed(seed, p.id, 'career-traits') })
      p.traitsGen = TRAITS_GEN_VERSION
    }

    tacticalByTeamId[rawTeam.id] = rollTeamTacticalIdentity(rawTeam.id, seed)

    teams.push({
      ...identity,
      isFictional: false,
      players,
    })
  }

  return {
    tier,
    realTeamCount: teams.length,
    fictionalCount: 0,
    usedFictionalFill: false,
    teams,
    tacticalByTeamId,
  }
}
