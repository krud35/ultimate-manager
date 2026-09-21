import assert from 'node:assert/strict'
import { INBOX_TYPES, replyToInboxMessage } from '../src/career/inbox.js'
import {
  processDelayedTransferReplies,
  processDelayedTransferRepliesForDateRange,
} from '../src/career/transfers/delayedNegotiation.js'

const pending = {
  id: 'sale-decision',
  type: INBOX_TYPES.TRANSFER_OFFER,
  date: '2026-08-06',
  read: false,
  body: 'Buyer accepted the terms.',
  payload: {
    kind: 'sale_player_decision',
    status: 'awaiting_reply',
    replyDate: '2026-08-07',
    playerId: 'player',
    playerName: 'Sold Player',
    buyerTeamId: 'buyer',
    fee: 50_000,
  },
}

// Saved career after a completed sale: the original retains awaiting_reply,
// while superseded marks it as historical. The player is already at the buyer.
const sold = replyToInboxMessage(pending, {
  title: 'Sold',
  body: 'Transfer completed.',
  date: '2026-08-07',
  payload: { ...pending.payload, status: 'accepted' },
})
const career = {
  playerTeamId: 'seller',
  league: { currentDate: '2026-08-07' },
  world: {
    teamIds: ['seller', 'buyer'],
    teamsById: {
      seller: { id: 'seller', players: [], finances: { transferBudget: 50_000 } },
      buyer: { id: 'buyer', players: [{ id: 'player' }], finances: { transferBudget: 100_000 } },
    },
  },
  inbox: [sold.followUpMessage, sold.message],
  transferLog: [{ playerId: 'player', fromTeamId: 'seller', toTeamId: 'buyer', fee: 50_000 }],
  loanLog: [],
}
const before = structuredClone(career)
for (const date of ['2026-08-07', '2026-08-08', '2026-08-10']) {
  const result = processDelayedTransferReplies(career, { date })
  assert.equal(result.resolved, 0, 'completed sale must not be resolved again')
  assert.deepEqual(result.inbox, before.inbox, 'completed sale must not produce Deal expired')
  assert.deepEqual(result.transferLog, before.transferLog)
  assert.deepEqual(result.world, before.world, 'rosters and budgets must remain unchanged')
}
const range = processDelayedTransferRepliesForDateRange(career, '2026-08-07', '2026-08-14')
assert.equal(range.resolved, 0)
assert.deepEqual(range.inbox, before.inbox, 'fast-forward must also leave completed deals alone')

// All delayed negotiation types share the same archival contract.
for (const kind of ['outgoing_club_offer', 'outgoing_player_contract', 'incoming_bid', 'sale_player_decision', 'loan_out_offer', 'loan_in_request']) {
  const archived = { ...sold.message, payload: { ...sold.message.payload, kind } }
  const result = processDelayedTransferReplies({ ...career, inbox: [archived] })
  assert.equal(result.resolved, 0, `${kind}: archived message must be skipped`)
  assert.deepEqual(result.inbox, [archived])
}

// A genuinely pending sale for an unavailable player must still expire once,
// including when the manager has already read the original message.
const activeCareer = { ...career, inbox: [{ ...pending, read: true }] }
const early = processDelayedTransferReplies(activeCareer, { date: '2026-08-06' })
assert.equal(early.resolved, 0)
const expired = processDelayedTransferReplies(activeCareer)
assert.equal(expired.resolved, 1)
assert.equal(expired.inbox.length, 2)
assert.equal(expired.inbox[0].payload.status, 'withdrawn')
assert.equal(expired.inbox[1].payload.superseded, true)
const afterExpiry = processDelayedTransferRepliesForDateRange(
  { ...activeCareer, inbox: expired.inbox }, '2026-08-07', '2026-08-14',
)
assert.equal(afterExpiry.resolved, 0)
assert.deepEqual(afterExpiry.inbox, expired.inbox, 'expiry notification must be sent only once')
assert.deepEqual(career, before, 'processing archived messages must not mutate the career')

console.log('Passed delayed transfer reply regression tests')
