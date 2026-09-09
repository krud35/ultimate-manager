// node --import ./scripts/register-world-tests.mjs scripts/bench-world-market.mjs
import { createWorldFromTemplate, worldTeamsList } from '../src/career/worldState.js'
import { buildEucsLeagueTemplate, eucsTeamsForTier } from '../src/data/eucsLeagueTeams.js'
import { simulateAiTransferActivity } from '../src/career/transfers/aiMarket.js'

for (const size of [16, 48]) {
  const teams = size === 48 ? [1, 2, 3].flatMap(tier => buildEucsLeagueTemplate({
    tier, teamIds: eucsTeamsForTier(tier).map(t => t.id), seed: 2025,
  }).teams) : undefined
  const world = createWorldFromTemplate(2025, { teams, rosterMode: 'historical' })
  const base = { id: 'world-market-benchmark', seasonYear: 2025, seasonIndex: 1,
    playerTeamId: world.teamIds[0], world, league: { currentDate: '2025-08-01' },
    transferLog: [], loanLog: [] }
  for (const scenario of ['closed', 'open', 'low-budget']) {
    const samples = []
    let deals = 0, loans = 0, evaluations = 0
    for (let i = 0; i < 30; i++) {
      const career = structuredClone(base)
      career.league.currentDate = `2025-${scenario === 'closed' ? '09' : '08'}-${String(i + 1).padStart(2, '0')}`
      if (scenario === 'low-budget') for (const t of worldTeamsList(career.world)) {
        t.finances.cash = 40_000
        t.finances.transferLimit = 40_000
      }
      const start = performance.now()
      const result = simulateAiTransferActivity(career, { seed: 101 + i, date: career.league.currentDate })
      samples.push(performance.now() - start)
      deals += result.deals.length
      loans += result.loanDeals.length
      evaluations += result.metrics?.candidateEvaluations ?? 0
    }
    samples.sort((a, b) => a - b)
    console.log(JSON.stringify({ size, scenario, medianMs: +samples[15].toFixed(2),
      p95Ms: +samples[28].toFixed(2), deals, loans, evaluations }))
  }
}
