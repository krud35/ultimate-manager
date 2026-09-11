/**
 * Terminarz „każdy z każdym” — metoda koła: pierwsza drużyna stoi, reszta rotuje.
 * Dla 16 drużyn: 15 kolejek (jedna runda) lub 30 (podwójny round-robin).
 *
 * Gospodarz/gość: w nieparzystych kolejkach lewa strona koła jest u siebie,
 * w parzystych — odwrócenie. Bez tego lewa połowa koła dostaje serie domowe,
 * a prawa wyjazdowe (nawet 8–15 meczów pod rząd).
 *
 * Metoda koła jest deterministyczna względem KOLEJNOŚCI drużyn na wejściu — ta sama
 * lista `teamIds` zawsze daje ten sam terminarz. Dlatego losowanie terminarza (żeby
 * każda kariera miała inny) polega na potasowaniu kolejności PRZED wywołaniem
 * `generate*RoundRobinSchedule`, seedem per-kariera (patrz `shuffledTeamOrder`).
 */

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

/** Tasowanie Fisher–Yates, deterministyczne po `seed` (ta sama kariera po przeładowaniu = ten sam terminarz). */
export function shuffledTeamOrder(teamIds, seed) {
  const rng = mulberry32(seed >>> 0)
  const copy = [...teamIds]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

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
 * Podwójny round-robin: pierwsza połowa (n-1 kolejek) losowana z `firstHalfTeamIds`,
 * druga połowa (kolejne n-1 kolejek) losowana NIEZALEŻNIE z `secondHalfTeamIds` — inna
 * kolejność wejściowa drużyn daje inne pary przeciwników w każdej kolejce, więc druga
 * połowa sezonu nie jest już zwykłym lustrzanym odbiciem pierwszej (dom/wyjazd odwrócone
 * przy tych samych parach), tylko osobno wylosowanym terminarzem. Każda drużyna nadal
 * gra z każdą inną dokładnie raz w każdej połowie (czyli dwa razy w sezonie) — metoda
 * koła gwarantuje to niezależnie od kolejności wejściowej.
 *
 * Gdy `secondHalfTeamIds` nie zostanie podane, druga połowa używa tej samej kolejności
 * co pierwsza (kompatybilność wsteczna dla wywołań z jednym argumentem).
 */
export function generateDoubleRoundRobinSchedule(firstHalfTeamIds, secondHalfTeamIds = firstHalfTeamIds) {
  if (firstHalfTeamIds.length % 2 !== 0) {
    throw new Error('Liczba drużyn musi być parzysta')
  }

  const firstHalf = generateRoundRobinSchedule(firstHalfTeamIds)
  const halfRounds = firstHalf.length
  const secondHalfRounds = generateRoundRobinSchedule(secondHalfTeamIds)
  const secondHalf = secondHalfRounds.map((pairings, index) => {
    const roundNumber = halfRounds + index + 1
    return pairings.map((fixture) => ({
      ...fixture,
      id: `r${roundNumber}-${fixture.homeTeamId}-vs-${fixture.awayTeamId}`,
      round: roundNumber,
    }))
  })

  return [...firstHalf, ...secondHalf]
}

export function flattenSchedule(rounds) {
  return rounds.flat()
}
