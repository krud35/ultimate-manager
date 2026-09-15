import assert from 'node:assert/strict'
import { clubContractOverview } from '../src/career/clubContractOverview.js'

const contract = { weeklyWage: 1000, weeksRemaining: 52, endDate: '2026-07-31' }
const team = { id: 'home', name: 'Home', players: [
  { id: 'senior', contract },
  { id: 'incoming', contract, loan: { parentTeamId: 'other', wageSplitPct: 40, returnDate: '2025-08-31' } },
  { id: 'expired', contract: { ...contract, weeksRemaining: 0 } },
], academyPlayers: [{ id: 'junior', contract: null }] }
const world = { teamsById: { home: team, other: { id: 'other', name: 'Other', players: [
  { id: 'outgoing', contract, loan: { parentTeamId: 'home', wageSplitPct: 70, returnDate: '2025-08-31' } },
] } } }
const before = structuredClone(world)
const rows = clubContractOverview(team, world, '2025-08-01')
const byId = Object.fromEntries(rows.map(r => [r.player.id, r]))
assert.equal(rows.length, 5)
assert.equal(byId.senior.weeklyCost, 1000)
assert.equal(byId.incoming.weeklyCost, 400)
assert(Math.abs(byId.outgoing.weeklyCost - 300) < 1e-6)
assert.equal(byId.junior.weeklyCost, 0)
assert.equal(byId.expired.weeklyCost, 0)
assert(byId.incoming.remainingCost > 0 && byId.incoming.remainingCost < 52000)
assert.equal(byId.outgoing.remainingCost, 52000 - byId.incoming.remainingCost / .4 * .7)
assert.deepEqual(world, before)
const longLoan = { id: 'long', contract: { ...contract, weeksRemaining: 104 }, loan: { wageSplitPct: 40, returnDate: '2026-09-01' } }
const longRow = clubContractOverview({ id: 'long-club', players: [longLoan] }, null, '2025-08-01')[0]
assert(longRow.remainingCost > 52 * 400, 'Loan commitment must include wages beyond the current season')
assert.equal(clubContractOverview({ id: 'long-club', players: [longLoan] }, null, '2026-09-01')[0].weeklyCost, 0)
console.log('Contract overview: senior/academy, incoming/outgoing loans, expiry, remaining liabilities and no mutation passed')
