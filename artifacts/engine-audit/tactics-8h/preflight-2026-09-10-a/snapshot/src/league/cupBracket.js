/**
 * Puchar styczniowy po jesieni: 16 drużyn według tabeli (1–16).
 * Mecze na boisku neutralnym (venue: 'neutral') — bez przewagi gospodarza.
 * Wyższy seed jest tylko „po lewej” w drabince (homeTeamId) dla czytelności.
 */

import { formatISODate, addDays } from './seasonCalendar.js'

function higherSeedHome(seedA, teamA, seedB, teamB) {
  if (seedA <= seedB) {
    return { homeTeamId: teamA, awayTeamId: teamB, homeSeed: seedA, awaySeed: seedB }
  }
  return { homeTeamId: teamB, awayTeamId: teamA, homeSeed: seedB, awaySeed: seedA }
}

/**
 * @param {string[]} standingsTableOrderedTeamIds — miejsca 1..16 po jesieni
 * @param {object} januaryDates — calendar.cup (playWeek2 / playWeek3 z friday/saturday/sunday)
 */
export function createCupFromFallStandings(standingsTableOrderedTeamIds, januaryDates) {
  const seeds = standingsTableOrderedTeamIds.slice(0, 16)
  if (seeds.length < 16) {
    throw new Error('Puchar wymaga 16 drużyn w tabeli po jesieni')
  }

  const week2 = januaryDates.playWeek2
  const week3 = januaryDates.playWeek3
  const w2Fri = week2.friday
  const w2Sat = week2.saturday ?? formatISODate(addDays(w2Fri, 1))
  const w2Sun = week2.sunday ?? formatISODate(addDays(w2Fri, 2))
  const w3Fri = week3.friday
  const w3Sat = week3.saturday ?? formatISODate(addDays(w3Fri, 1))
  const w3Sun = week3.sunday ?? formatISODate(addDays(w3Fri, 2))

  const seedOf = (teamId) => seeds.indexOf(teamId) + 1

  /** Prequarters: 1v16, 2v15, … 8v9 — wyższy seed po lewej (neutralnie). */
  const pqPairings = []
  for (let s = 1; s <= 8; s += 1) {
    const high = seeds[s - 1]
    const low = seeds[16 - s]
    pqPairings.push({
      highSeed: s,
      lowSeed: 17 - s,
      ...higherSeedHome(s, high, 17 - s, low),
    })
  }

  // Daty PQ: 4×Fri + 4×Sat; ćwierćfinały: 4×Sun; półfinały: Fri/Sat; finał: Sun.
  const pqDates = [
    w2Fri, w2Fri, w2Fri, w2Fri,
    w2Sat, w2Sat, w2Sat, w2Sat,
  ]

  const matches = []

  // Pre-quarters → quarters linking (standard bracket):
  // Q1: W(1v16) vs W(8v9)
  // Q2: W(2v15) vs W(7v10)
  // Q3: W(3v14) vs W(6v11)
  // Q4: W(4v13) vs W(5v12)
  const quarterDefs = [
    { id: 'cup-q1', fromPq: [0, 7], date: w2Sun },
    { id: 'cup-q2', fromPq: [1, 6], date: w2Sun },
    { id: 'cup-q3', fromPq: [2, 5], date: w2Sun },
    { id: 'cup-q4', fromPq: [3, 4], date: w2Sun },
  ]

  const semiDefs = [
    { id: 'cup-s1', fromQ: [0, 1], date: w3Fri },
    { id: 'cup-s2', fromQ: [2, 3], date: w3Sat },
  ]

  const finalDef = { id: 'cup-final', fromS: [0, 1], date: w3Sun }

  for (let i = 0; i < pqPairings.length; i += 1) {
    const p = pqPairings[i]
    const qIndex = quarterDefs.findIndex((q) => q.fromPq.includes(i))
    const q = quarterDefs[qIndex]
    const nextSlot = q.fromPq[0] === i ? 'home' : 'away'

    matches.push({
      id: `cup-pq${i + 1}`,
      round: 'prequarter',
      bracketIndex: i,
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
      homeSeed: p.homeSeed,
      awaySeed: p.awaySeed,
      status: 'scheduled',
      competition: 'cup',
      venue: 'neutral',
      date: pqDates[i],
      nextMatchId: q.id,
      nextSlot,
    })
  }

  for (let qi = 0; qi < quarterDefs.length; qi += 1) {
    const q = quarterDefs[qi]
    const semiIndex = Math.floor(qi / 2)
    const semi = semiDefs[semiIndex]
    const nextSlot = semi.fromQ[0] === qi ? 'home' : 'away'

    matches.push({
      id: q.id,
      round: 'quarter',
      bracketIndex: qi,
      homeTeamId: null,
      awayTeamId: null,
      status: 'pending',
      competition: 'cup',
      venue: 'neutral',
      date: q.date,
      nextMatchId: semi.id,
      nextSlot,
      dependsOn: q.fromPq.map((i) => `cup-pq${i + 1}`),
    })
  }

  for (let si = 0; si < semiDefs.length; si += 1) {
    const s = semiDefs[si]
    const nextSlot = finalDef.fromS[0] === si ? 'home' : 'away'

    matches.push({
      id: s.id,
      round: 'semi',
      bracketIndex: si,
      homeTeamId: null,
      awayTeamId: null,
      status: 'pending',
      competition: 'cup',
      venue: 'neutral',
      date: s.date,
      nextMatchId: finalDef.id,
      nextSlot,
      dependsOn: s.fromQ.map((i) => `cup-q${i + 1}`),
    })
  }

  matches.push({
    id: finalDef.id,
    round: 'final',
    bracketIndex: 0,
    homeTeamId: null,
    awayTeamId: null,
    status: 'pending',
    competition: 'cup',
    venue: 'neutral',
    date: finalDef.date,
    nextMatchId: null,
    nextSlot: null,
    dependsOn: ['cup-s1', 'cup-s2'],
  })

  return {
    status: 'active',
    seeds,
    seedOf,
    matches,
    championTeamId: null,
    januaryDates: {
      freeWeek1: januaryDates.freeWeek1,
      playWeek2: week2,
      playWeek3: week3,
      freeWeek4: januaryDates.freeWeek4,
    },
  }
}

function findCupMatch(cup, matchId) {
  return cup.matches.find((m) => m.id === matchId) ?? null
}

/** Wyższy seed po lewej w drabince (bez przewagi boiska — venue neutralne). */
function ensureHigherSeedListedFirst(match, cup) {
  if (!match.homeTeamId || !match.awayTeamId) return
  match.venue = 'neutral'
  const homeSeed = cup.seeds.indexOf(match.homeTeamId) + 1
  const awaySeed = cup.seeds.indexOf(match.awayTeamId) + 1
  if (homeSeed === 0 || awaySeed === 0) return
  if (awaySeed < homeSeed) {
    const tmp = match.homeTeamId
    match.homeTeamId = match.awayTeamId
    match.awayTeamId = tmp
    match.homeSeed = awaySeed
    match.awaySeed = homeSeed
  } else {
    match.homeSeed = homeSeed
    match.awaySeed = awaySeed
  }
}

/**
 * Po zakończonym meczu pucharu: wpisz zwycięzcę do kolejnej rundy.
 * @param {object} cup
 * @param {{ fixtureId?: string, id?: string, winner?: string, winnerTeamId?: string, homeScore?: number, awayScore?: number }} matchResult
 */
export function advanceCupAfterMatch(cup, matchResult) {
  const matchId = matchResult.fixtureId ?? matchResult.id
  const match = findCupMatch(cup, matchId)
  if (!match || match.status === 'completed') return cup

  const winner =
    matchResult.winner ??
    matchResult.winnerTeamId ??
    (matchResult.homeScore > matchResult.awayScore ? match.homeTeamId : match.awayTeamId)

  match.status = 'completed'
  match.homeScore = matchResult.homeScore
  match.awayScore = matchResult.awayScore
  match.winnerTeamId = winner

  if (!match.nextMatchId) {
    cup.championTeamId = winner
    cup.status = 'complete'
    return cup
  }

  const next = findCupMatch(cup, match.nextMatchId)
  if (!next) return cup

  if (match.nextSlot === 'home') next.homeTeamId = winner
  else if (match.nextSlot === 'away') next.awayTeamId = winner

  if (next.homeTeamId && next.awayTeamId) {
    ensureHigherSeedListedFirst(next, cup)
    if (next.status === 'pending') next.status = 'scheduled'
  }

  return cup
}

/** Mecze pucharu gotowe do gry w danym dniu. */
export function cupFixturesOnDate(cup, dateIso) {
  if (!cup?.matches) return []
  const day = String(dateIso).slice(0, 10)
  return cup.matches.filter(
    (m) => m.date === day && (m.status === 'scheduled' || m.status === 'pending') && m.homeTeamId && m.awayTeamId,
  )
}

/** Synchronizuje drabinkę pucharu z `league.fixtures` (kolejne rundy, wyniki). */
export function syncCupMatchesIntoFixtures(league) {
  if (!league?.cup?.matches) return league
  if (!Array.isArray(league.fixtures)) league.fixtures = []

  for (const match of league.cup.matches) {
    const existing = league.fixtures.find((f) => f.id === match.id)
    if (existing) {
      Object.assign(existing, {
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        status: match.status,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        winnerTeamId: match.winnerTeamId,
        date: match.date,
        competition: 'cup',
        venue: match.venue ?? 'neutral',
        round: match.round,
        homeSeed: match.homeSeed,
        awaySeed: match.awaySeed,
      })
    } else if (match.homeTeamId && match.awayTeamId) {
      league.fixtures.push({ ...match, competition: 'cup', venue: match.venue ?? 'neutral' })
    }
  }
  return league
}
