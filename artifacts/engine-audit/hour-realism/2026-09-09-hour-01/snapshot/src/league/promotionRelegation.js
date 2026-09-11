/**
 * Awanse/spadki w piramidzie Ligi Europejskiej — symetrycznie 3 w górę / 3 w dół na
 * każdej granicy (jak Premier League ↔ Championship ↔ League One), żeby wszystkie
 * 3 poziomy zostawały po 16 drużyn na zawsze.
 *
 * Liga 1 → Liga 2: spadają miejsca 14–16.
 * Liga 2 → Liga 1: awansują bezpośrednio 1–2, o 3. miejsce baraż 3v6 / 4v5 → finał.
 *                  Do Ligi 3 spadają miejsca 14–16.
 * Liga 3 → Liga 2: jak wyżej (bez spadku — dno piramidy).
 */

/**
 * @param {[string,string,string,string]} seeds — [miejsce3, miejsce4, miejsce5, miejsce6]
 * @param {(teamA: string, teamB: string) => string} resolveMatch — zwraca id zwycięzcy
 */
export function runPromotionPlayoff(seeds, resolveMatch) {
  const [seed3, seed4, seed5, seed6] = seeds
  const semi1Winner = resolveMatch(seed3, seed6)
  const semi2Winner = resolveMatch(seed4, seed5)
  const finalWinner = resolveMatch(semi1Winner, semi2Winner)
  return {
    semis: [
      { home: seed3, away: seed6, winner: semi1Winner },
      { home: seed4, away: seed5, winner: semi2Winner },
    ],
    final: { home: semi1Winner, away: semi2Winner, winner: finalWinner },
    finalWinner,
  }
}

function assertSixteen(label, ids) {
  const unique = new Set(ids)
  if (unique.size !== 16 || ids.length !== 16) {
    throw new Error(`[promotionRelegation] ${label} powinna mieć 16 unikalnych drużyn, ma ${ids.length} (${unique.size} unikalnych)`)
  }
}

/**
 * @param {{
 *   tier1Table: string[], tier2Table: string[], tier3Table: string[],
 *   resolveMatch: (teamA: string, teamB: string) => string,
 * }} params — tabele posortowane 1..16 (id drużyny, miejsce 1 = index 0)
 */
export function computePyramidMovement({ tier1Table, tier2Table, tier3Table, resolveMatch }) {
  assertSixteen('Liga 1', tier1Table)
  assertSixteen('Liga 2', tier2Table)
  assertSixteen('Liga 3', tier3Table)

  const l1Relegated = tier1Table.slice(-3)
  const l1Survivors = tier1Table.slice(0, -3)

  const l2Direct = tier2Table.slice(0, 2)
  const l2PlayoffSeeds = tier2Table.slice(2, 6)
  const l2Playoff = runPromotionPlayoff(l2PlayoffSeeds, resolveMatch)
  const l2Promoted = [...l2Direct, l2Playoff.finalWinner]
  const l2Relegated = tier2Table.slice(-3)
  const l2PromotedOrRelegated = new Set([...l2Promoted, ...l2Relegated])
  const l2Survivors = tier2Table.filter((id) => !l2PromotedOrRelegated.has(id))

  const l3Direct = tier3Table.slice(0, 2)
  const l3PlayoffSeeds = tier3Table.slice(2, 6)
  const l3Playoff = runPromotionPlayoff(l3PlayoffSeeds, resolveMatch)
  const l3Promoted = [...l3Direct, l3Playoff.finalWinner]
  const l3PromotedSet = new Set(l3Promoted)
  const l3Survivors = tier3Table.filter((id) => !l3PromotedSet.has(id))

  const tier1Next = [...l1Survivors, ...l2Promoted]
  const tier2Next = [...l2Survivors, ...l1Relegated, ...l3Promoted]
  const tier3Next = [...l3Survivors, ...l2Relegated]

  assertSixteen('Liga 1 (nowy sezon)', tier1Next)
  assertSixteen('Liga 2 (nowy sezon)', tier2Next)
  assertSixteen('Liga 3 (nowy sezon)', tier3Next)

  const movements = [
    ...l1Relegated.map((teamId) => ({ teamId, from: 1, to: 2, reason: 'relegated' })),
    ...l2Direct.map((teamId) => ({ teamId, from: 2, to: 1, reason: 'promoted-direct' })),
    { teamId: l2Playoff.finalWinner, from: 2, to: 1, reason: 'promoted-playoff' },
    ...l2Relegated.map((teamId) => ({ teamId, from: 2, to: 3, reason: 'relegated' })),
    ...l3Direct.map((teamId) => ({ teamId, from: 3, to: 2, reason: 'promoted-direct' })),
    { teamId: l3Playoff.finalWinner, from: 3, to: 2, reason: 'promoted-playoff' },
  ]

  return {
    tier1Next,
    tier2Next,
    tier3Next,
    movements,
    playoffs: { tier2: l2Playoff, tier3: l3Playoff },
  }
}
