/**
 * Terminarz „każdy z każdym” — metoda koła: pierwsza drużyna stoi, reszta rotuje.
 * Dla 16 drużyn: 15 kolejek (jedna runda) lub 30 (podwójny round-robin).
 *
 * Gospodarz/gość: w nieparzystych kolejkach lewa strona koła jest u siebie,
 * w parzystych — odwrócenie. Bez tego lewa połowa koła dostaje serie domowe,
 * a prawa wyjazdowe (nawet 8–15 meczów pod rząd).
 */

export function generateRoundRobinSchedule(teamIds) {
  if (teamIds.length % 2 !== 0) {
    throw new Error('Liczba drużyn musi być parzysta')
  }

  const n = teamIds.length
  const rounds = []
  const fixed = teamIds[0]
  let rotating = teamIds.slice(1)

  for (let r = 0; r < n - 1; r += 1) {
    const order = [fixed, ...rotating]
    const pairings = []
    const roundNumber = r + 1
    const flipHomeAway = r % 2 === 1

    for (let i = 0; i < n / 2; i += 1) {
      let homeTeamId = order[i]
      let awayTeamId = order[n - 1 - i]
      if (flipHomeAway) {
        ;[homeTeamId, awayTeamId] = [awayTeamId, homeTeamId]
      }
      pairings.push({
        id: `r${roundNumber}-${homeTeamId}-vs-${awayTeamId}`,
        round: roundNumber,
        homeTeamId,
        awayTeamId,
        status: 'scheduled',
        competition: 'league',
      })
    }

    rounds.push(pairings)
    const last = rotating.pop()
    rotating = [last, ...rotating]
  }

  return rounds
}

/**
 * Podwójny round-robin: pierwsza połowa (n-1 kolejek), druga połowa z odwróconym
 * gospodarzem/gościem. Dla 16 drużyn → 30 kolejek.
 */
export function generateDoubleRoundRobinSchedule(teamIds) {
  if (teamIds.length % 2 !== 0) {
    throw new Error('Liczba drużyn musi być parzysta')
  }

  const firstHalf = generateRoundRobinSchedule(teamIds)
  const halfRounds = firstHalf.length
  const secondHalf = firstHalf.map((pairings, index) => {
    const roundNumber = halfRounds + index + 1
    return pairings.map((fixture) => {
      const homeTeamId = fixture.awayTeamId
      const awayTeamId = fixture.homeTeamId
      return {
        id: `r${roundNumber}-${homeTeamId}-vs-${awayTeamId}`,
        round: roundNumber,
        homeTeamId,
        awayTeamId,
        status: 'scheduled',
        competition: 'league',
      }
    })
  })

  return [...firstHalf, ...secondHalf]
}

export function flattenSchedule(rounds) {
  return rounds.flat()
}
