import assert from 'node:assert/strict'
import { completeTransferBetweenClubs, checkForcedTransferListDemands } from '../src/career/transfers/transferEngine.js'
import { MORALE_DEFAULT } from '../src/models/playerMorale.js'
import { ensureClubEconomy, setClubBudgetAllocation } from '../src/career/clubEconomy.js'

function fixture(morale, playerTeamId = 'buyer') {
  const player = { id: 'player', morale, recentPlayingTime: [0, 0, 0, 0] }
  const seller = { id: 'seller', name: 'Seller', players: [player] }
  const buyer = { id: 'buyer', name: 'Buyer', players: [] }
  for (const team of [seller, buyer]) {
    team.managementDate = '2025-08-01'
    team.finances = { cash: 1_000_000, transferBudget: 1_000_000 }
    ensureClubEconomy(team)
    setClubBudgetAllocation(team, 100_000)
  }
  const career = { playerTeamId, seasonYear: 2025, league: { currentDate: '2025-08-01' }, world: { teamsById: { seller, buyer } } }
  const opts = { playerId: player.id, buyerTeamId: buyer.id, fee: 1000, contract: { weeklyWage: 500, years: 1 } }
  return { career, opts, player, seller, buyer }
}

for (const playerTeamId of ['buyer', 'seller', 'other']) {
  const { career, opts, player, seller, buyer } = fixture(25, playerTeamId)
  assert.equal(checkForcedTransferListDemands(career.world).length, 1)
  const result = completeTransferBetweenClubs(career, opts)
  assert.equal(result.ok, true, result.error)
  assert.equal(seller.players.length, 0)
  assert.equal(buyer.players[0], player)
  assert.equal(player.morale, MORALE_DEFAULT)
  assert.equal(player.transferListed, false)
  assert.deepEqual(player.recentPlayingTime, [])
  assert.deepEqual(checkForcedTransferListDemands(career.world, {
    standings: { buyer: { wins: 4, losses: 4 } }, leaguePlayerStats: {},
  }), [])
}

for (const morale of [42, 99, undefined]) {
  const { career, opts, player } = fixture(morale)
  const result = completeTransferBetweenClubs(career, opts)
  assert.equal(result.ok, true, result.error)
  assert.equal(player.morale, MORALE_DEFAULT)
}

const { career, opts, player, seller, buyer } = fixture(25)
const rejected = completeTransferBetweenClubs(career, { ...opts, fee: 2_000_000 })
assert.equal(rejected.ok, false)
assert.equal(player.morale, 25)
assert.equal(seller.players[0], player)
assert.equal(buyer.players.length, 0)
console.log('Transfer morale: purchases, sales, AI deals, fresh starts and rejected transfers passed')
