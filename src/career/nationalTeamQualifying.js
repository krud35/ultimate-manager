/**
 * Faza 3 planu kadr narodowych: kwalifikacje w stylu piłkarskim. Grupy (siew wg
 * coefficientu, snake draft jak kosze UEFA), terminarz "każdy z każdym" w grupie
 * (reużywa dokładnie ten sam generator co liga klubowa — `generateRoundRobinSchedule`),
 * mecze rozstrzygane w przerwach reprezentacyjnych (`calendar.internationalWindows` —
 * patrz `seasonCalendar.js`) przez silnik z Fazy 2 (`nationalTeamMatches.js`). Po fazie
 * grupowej: top 2 z grupy awansuje wprost, reszta idzie do jednorundowego baraża
 * (najlepszy vs najgorszy z puli) o brakujące miejsca.
 *
 * Świadomie generyczne względem "puli krajów" — te same funkcje budują zarówno kwalifikacje
 * do ME (pula = Europa) jak i strefę kwalifikacyjną do MŚ (pula = jeden kontynent, wywołane
 * raz na kontynent z jego dynamiczną kwotą — patrz `computeWorldCupContinentSlots`).
 */
import { generateRoundRobinSchedule } from '../league/schedule.js'
import { ACADEMY_COUNTRIES, ACADEMY_CONTINENTS } from '../data/academyScoutGeography.js'
import { ensureCareerNationalTeams, getCountryStrength, selectNationalSquad } from './nationalTeams.js'
import {
  nationalTeamPseudoTeam,
  simulateNationalTeamMatch,
  recordNationalTeamMatch,
  createNationalTournamentStandings,
  nationalTournamentStandingsTable,
  createNationalTournamentPlayerStats,
} from './nationalTeamMatches.js'

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

export function pseudoTeamId(countryId) {
  return `nt-${countryId}`
}

export function countryIdFromPseudoTeamId(pseudoId) {
  return typeof pseudoId === 'string' && pseudoId.startsWith('nt-') ? pseudoId.slice(3) : pseudoId
}

/**
 * Dynamiczna alokacja miejsc MŚ na kontynenty — proporcjonalnie do sumy coefficientów
 * krajów danego kontynentu (silniejszy kontynent = więcej miejsc), z gwarantowanym
 * minimum 1 na kontynent (jak realne MŚ). Metoda największej reszty: część całkowita
 * z proporcji + dobitka dla największych reszt ułamkowych, żeby suma zawsze wyszła
 * dokładnie `totalSlots`. Przeliczane na nowo na starcie KAŻDEGO cyklu kwalifikacyjnego
 * MŚ — więc kwoty z czasem migrują w stronę kontynentów, które faktycznie się wzmacniają.
 */
export function computeWorldCupContinentSlots(career, { totalSlots = 32, minPerContinent = 1 } = {}) {
  const byContinent = {}
  for (const c of ACADEMY_CONTINENTS) byContinent[c.id] = []
  for (const [id, entry] of Object.entries(ACADEMY_COUNTRIES)) {
    byContinent[entry.continent]?.push(id)
  }
  const continents = Object.keys(byContinent).filter((c) => byContinent[c].length > 0)

  const weight = {}
  let totalWeight = 0
  for (const c of continents) {
    const sum = byContinent[c].reduce((s, id) => s + getCountryStrength(career, id), 0)
    weight[c] = sum
    totalWeight += sum
  }
  if (totalWeight <= 0) totalWeight = 1

  const exact = {}
  const slots = {}
  let allocated = 0
  for (const c of continents) {
    exact[c] = (weight[c] / totalWeight) * totalSlots
    slots[c] = Math.max(minPerContinent, Math.floor(exact[c]))
    allocated += slots[c]
  }

  let remaining = totalSlots - allocated
  const byRemainder = [...continents].sort((a, b) => (exact[b] % 1) - (exact[a] % 1))
  let i = 0
  while (remaining > 0 && byRemainder.length > 0) {
    slots[byRemainder[i % byRemainder.length]] += 1
    remaining -= 1
    i += 1
  }
  // Skrajny, w praktyce nieosiągalny przy 6 kontynentach/32 miejscach przypadek: gdyby
  // gwarantowane minimum samo przekroczyło totalSlots, ucinamy od najsłabszych kontynentów.
  while (remaining < 0 && byRemainder.length > 0) {
    const weakest = [...continents].sort((a, b) => weight[a] - weight[b])
    for (const c of weakest) {
      if (remaining >= 0) break
      if (slots[c] > minPerContinent) {
        slots[c] -= 1
        remaining += 1
      }
    }
    if (weakest.every((c) => slots[c] <= minPerContinent)) break
  }

  return slots
}

/** Snake draft (jak kosze UEFA) wg aktualnego coefficientu — najsilniejsi rozstawieni
 * równomiernie po grupach zamiast się kumulować w jednej. */
export function buildQualifyingGroups(career, countryIds, { groupCount } = {}) {
  const size = Math.max(2, groupCount ?? Math.round(countryIds.length / 5))
  const seeded = [...countryIds].sort((a, b) => getCountryStrength(career, b) - getCountryStrength(career, a))
  const groups = Array.from({ length: size }, () => [])
  seeded.forEach((id, i) => {
    const round = Math.floor(i / size)
    const posInRound = i % size
    const groupIndex = round % 2 === 0 ? posInRound : size - 1 - posInRound
    groups[groupIndex].push(id)
  })
  return groups.filter((ids) => ids.length > 0).map((ids, i) => ({ id: `group-${i + 1}`, countryIds: ids }))
}

const BYE = '__bye__'

/** Terminarz "każdy z każdym" grupy — dokładnie `generateRoundRobinSchedule` z ligi
 * klubowej, z placeholderem dla nieparzystej liczby krajów (mecze z placeholderem
 * odrzucane, więc ten kraj "pauzuje" tę kolejkę zamiast grać). */
function groupRoundRobinFixtures(group) {
  const teamIds = group.countryIds.map(pseudoTeamId)
  const padded = teamIds.length % 2 === 0 ? teamIds : [...teamIds, BYE]
  const rounds = generateRoundRobinSchedule(padded)
  const fixtures = []
  for (const pairings of rounds) {
    for (const p of pairings) {
      if (p.homeTeamId === BYE || p.awayTeamId === BYE) continue
      fixtures.push({
        id: `${group.id}-r${p.round}-${p.homeTeamId}-vs-${p.awayTeamId}`,
        round: p.round,
        groupId: group.id,
        homeTeamId: p.homeTeamId,
        awayTeamId: p.awayTeamId,
        date: null,
        status: 'scheduled',
      })
    }
  }
  return fixtures
}

function assignFixtureDates(fixtures, availableDates) {
  for (const f of fixtures) {
    f.date = availableDates[f.round - 1] ?? availableDates[availableDates.length - 1] ?? null
  }
  return fixtures
}

/**
 * Zakłada kampanię kwalifikacyjną: buduje grupy, terminarz i puste tabele/staty, zapisuje
 * w `career.nationalTeams.qualifying`. `availableDates` — spłaszczona, uporządkowana lista
 * dat przerw reprezentacyjnych (np. z `calendar.internationalWindows` obu sezonów cyklu) —
 * runda `N` terminarza grupy dostaje `availableDates[N-1]`.
 */
export function createQualifyingCampaign(career, { kind, year, countryIds, groupCount, availableDates = [] } = {}) {
  const nt = ensureCareerNationalTeams(career)
  const groups = buildQualifyingGroups(career, countryIds, { groupCount })
  const fixtures = []
  const standings = {}
  for (const group of groups) {
    fixtures.push(...assignFixtureDates(groupRoundRobinFixtures(group), availableDates))
    standings[group.id] = createNationalTournamentStandings(group.countryIds.map(pseudoTeamId))
  }

  const qualifying = {
    kind,
    year,
    phase: 'groupStage',
    groups,
    fixtures,
    standings,
    playerStats: createNationalTournamentPlayerStats(),
    autoQualifiedCountryIds: [],
    playoffCandidateTeamIds: [],
    playoffByeTeamIds: [],
    playoff: null,
    qualifiedCountryIds: [],
  }
  nt.qualifying = qualifying
  return qualifying
}

function resolveOneFixture(fixture, world, career, seasonYear, standings, playerStats) {
  const homeCountryId = countryIdFromPseudoTeamId(fixture.homeTeamId)
  const awayCountryId = countryIdFromPseudoTeamId(fixture.awayTeamId)
  const homeSquad = selectNationalSquad(world, career, homeCountryId, { seasonYear })
  const awaySquad = selectNationalSquad(world, career, awayCountryId, { seasonYear })
  const teamA = nationalTeamPseudoTeam(homeSquad)
  const teamB = nationalTeamPseudoTeam(awaySquad)
  const record = simulateNationalTeamMatch(teamA, teamB, hashSeed(fixture.id))

  fixture.status = 'completed'
  fixture.homeScore = record.homeScore
  fixture.awayScore = record.awayScore
  fixture.winnerTeamId = record.winner

  recordNationalTeamMatch(standings, playerStats, record, teamA, teamB)
  return record
}

/** Rozstrzyga wszystkie zaległe mecze fazy grupowej z datą <= `dateIso` — ten sam wzorzec
 * co `advanceOtherLeagueToDate` (patrz otherLeagues.js): wołane co dzień z pętli kariery,
 * mecz rozstrzyga się dopiero gdy jego data faktycznie nadeszła. */
export function advanceQualifyingGroupStage(qualifying, world, career, dateIso) {
  if (!qualifying || qualifying.phase !== 'groupStage') return qualifying
  const due = qualifying.fixtures.filter((f) => f.status !== 'completed' && f.date && f.date <= dateIso)
  for (const fixture of due) {
    const groupStandings = qualifying.standings[fixture.groupId]
    resolveOneFixture(fixture, world, career, qualifying.year, groupStandings, qualifying.playerStats)
  }
  return qualifying
}

export function isQualifyingGroupStageComplete(qualifying) {
  return !!qualifying && qualifying.fixtures.every((f) => f.status === 'completed')
}

/**
 * Zamyka fazę grupową: top `autoQualifyPerGroup` z każdej grupy (tabela: wygrane, potem
 * bilans punktów — `standingsTable`) awansuje wprost. Reszta trafia do puli barażowej wg
 * miejsca w grupie i wyniku.
 *
 * Dwa brzegowe przypadki, realne przy małych strefach (MŚ: niektóre kontynenty mają mało
 * krajów na sporo/mało przyznanych miejsc — patrz computeWorldCupContinentSlots) —
 * pierwsza wersja tej funkcji ich nie obsługiwała poprawnie (złapane dopiero testem
 * integracyjnym całego cyklu, nie testem jednostkowym samej funkcji):
 *  1. Samych bezpośrednich awansów z grup jest WIĘCEJ niż `totalSpots` (mało krajów, ale
 *     wystarczająco na 2+ grupy) — przycinamy do najlepszych `totalSpots` wg miejsca w
 *     grupie/wyniku, reszta odpada BEZ baraży (nie ma się o co grać).
 *  2. Puli barażowej brakuje kandydatów, żeby sparować WSZYSTKICH potrzebnych do
 *     `totalSpots` (za mało krajów zostało po odjęciu bezpośrednich awansów) — zamiast
 *     zakładać dokładnie jeden "bye", liczymy minimalną liczbę bye'ów potrzebną, żeby
 *     `bye + pary*2 <= dostępna_pula`, a resztę pary jak zwykle (najlepszy z najgorszym).
 */
export function resolveQualifyingGroupStage(qualifying, { totalSpots, autoQualifyPerGroup = 2 } = {}) {
  const ranked = []
  for (const group of qualifying.groups) {
    const table = nationalTournamentStandingsTable(qualifying.standings[group.id])
    table.forEach((row, position) => {
      ranked.push({ teamId: row.teamId, position, wins: row.wins, diff: row.diff })
    })
  }
  const byRank = (a, b) => a.position - b.position || b.wins - a.wins || b.diff - a.diff
  const directGroupWinners = ranked.filter((r) => r.position < autoQualifyPerGroup).sort(byRank)

  let autoQualifiedTeamIds
  let remainder
  if (directGroupWinners.length >= totalSpots) {
    autoQualifiedTeamIds = directGroupWinners.slice(0, totalSpots).map((r) => r.teamId)
    remainder = []
  } else {
    autoQualifiedTeamIds = directGroupWinners.map((r) => r.teamId)
    remainder = ranked.filter((r) => r.position >= autoQualifyPerGroup).sort(byRank)
  }

  let playoffCandidateTeamIds = []
  let byeTeamIds = []
  const spotsWanted = totalSpots - autoQualifiedTeamIds.length
  if (spotsWanted > 0 && remainder.length) {
    const spotsLeft = Math.min(spotsWanted, remainder.length)
    // Minimalna liczba bye'ów, żeby reszta dała się sparować w mecze i razem trafić
    // dokładnie w `spotsLeft`: bye + (spotsLeft-bye)*2 <= remainder.length.
    const byeCount = Math.max(0, 2 * spotsLeft - remainder.length)
    byeTeamIds = remainder.slice(0, byeCount).map((r) => r.teamId)
    playoffCandidateTeamIds = remainder
      .slice(byeCount, byeCount + (spotsLeft - byeCount) * 2)
      .map((r) => r.teamId)
  }

  qualifying.phase = 'playoff'
  qualifying.autoQualifiedCountryIds = autoQualifiedTeamIds.map(countryIdFromPseudoTeamId)
  qualifying.playoffCandidateTeamIds = playoffCandidateTeamIds
  qualifying.playoffByeTeamIds = byeTeamIds

  return { autoQualifiedTeamIds, playoffCandidateTeamIds, byeTeamIds }
}

/** Jednorundowy baraż o pozostałe miejsca: najlepszy z puli vs najgorszy, drugi najlepszy
 * vs drugi najgorszy itd. — jeden mecz, zwycięzca awansuje. `availableDates[0]` to zwykle
 * ostatnie wolne okno cyklu. */
export function buildQualifyingPlayoff(qualifying, availableDates = []) {
  const candidates = qualifying.playoffCandidateTeamIds ?? []
  const half = candidates.length / 2
  const matches = []
  for (let i = 0; i < half; i += 1) {
    matches.push({
      id: `${qualifying.kind}${qualifying.year}-playoff-${i + 1}`,
      homeTeamId: candidates[i],
      awayTeamId: candidates[candidates.length - 1 - i],
      date: availableDates[0] ?? null,
      status: 'scheduled',
    })
  }
  qualifying.playoff = { matches }
  return qualifying.playoff
}

function finalizeQualifying(qualifying) {
  const playoffWinnerCountryIds = (qualifying.playoff?.matches ?? []).map((m) =>
    countryIdFromPseudoTeamId(m.winnerTeamId),
  )
  const byeCountryIds = (qualifying.playoffByeTeamIds ?? []).map(countryIdFromPseudoTeamId)
  qualifying.qualifiedCountryIds = [
    ...qualifying.autoQualifiedCountryIds,
    ...playoffWinnerCountryIds,
    ...byeCountryIds,
  ]
  qualifying.phase = 'complete'
}

/** Rozstrzyga zaległe mecze baraży <= `dateIso`; gdy wszystkie skończone, zamyka
 * kwalifikacje (`qualifying.qualifiedCountryIds` gotowe pod fazę finałową — Faza 4). */
export function advanceQualifyingPlayoff(qualifying, world, career, dateIso) {
  if (!qualifying?.playoff) return qualifying
  const due = qualifying.playoff.matches.filter((m) => m.status !== 'completed' && m.date && m.date <= dateIso)
  const pseudoStandings = {}
  for (const fixture of due) {
    resolveOneFixture(fixture, world, career, qualifying.year, pseudoStandings, qualifying.playerStats)
  }
  if (qualifying.playoff.matches.every((m) => m.status === 'completed')) {
    finalizeQualifying(qualifying)
  }
  return qualifying
}
