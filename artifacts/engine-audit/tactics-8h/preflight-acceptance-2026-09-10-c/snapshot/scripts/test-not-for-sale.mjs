import assert from 'node:assert/strict'
import { setPlayerNotForSale, setPlayerLoanListed, setPlayerTransferListed } from '../src/career/transfers/transferEngine.js'
import { computeAskPrice, aiIncomingInterestChance } from '../src/career/transfers/negotiation.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'

const seller = structuredClone(demoHomeTeam), buyer = structuredClone(demoAwayTeam)
const player = seller.players[0]
player.age = 20
player.potential = 95
player.form = 90
player.morale = 60
const normalAsk = computeAskPrice(player, seller, 0, 100000)
const normalInterest = aiIncomingInterestChance(buyer, player, seller, () => .5)
assert(normalInterest > 0)
setPlayerLoanListed(seller, player.id, true)
assert.equal(setPlayerNotForSale(seller, player.id, true).ok, true)
assert.equal(player.loanListed, false)
assert.equal(player.transferListed, false)
assert.equal(computeAskPrice(player, seller, 0, 100000), Math.round(normalAsk * 1.5 / 1000) * 1000)
assert.equal(aiIncomingInterestChance(buyer, player, seller, () => .5), normalInterest * .2)
assert.equal(JSON.parse(JSON.stringify(player)).notForSale, true)
setPlayerNotForSale(seller, player.id, false)
assert.equal(computeAskPrice(player, seller, 0, 100000), normalAsk)
setPlayerNotForSale(seller, player.id, true)
setPlayerTransferListed(seller, player.id, true)
assert.equal(player.notForSale, false)
setPlayerNotForSale(seller, player.id, true)
setPlayerLoanListed(seller, player.id, true)
assert.equal(player.notForSale, false)
player.loan = { fromTeamId: 'other' }
assert.equal(setPlayerNotForSale(seller, player.id, true).error, 'on_loan')
assert.equal(setPlayerNotForSale(seller, 'missing', true).error, 'not_on_roster')
console.log('Not for sale: higher ask, reduced interest, exclusive listing flags, persistence and roster guards passed')
