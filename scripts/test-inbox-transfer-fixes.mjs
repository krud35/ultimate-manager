import assert from 'node:assert/strict'
import { createCareer } from '../src/career/careerModel.js'
import {
  acceptIncomingBid,
  queueSalePlayerDecision,
  processDelayedTransferReplies,
  evaluateLoanOffer,
  computeLoanWillingness,
  getTransferBudget,
  isImportantInboxMessage,
  INBOX_TYPES,
} from '../src/career/index.js'
import { playerOfMonthArticle } from '../src/career/ultiworld.js'
import { applyMatchResultToLeague } from '../src/league/leagueEngine.js'
import { advanceCareerDay } from '../src/career/calendarSimulation.js'
import { processManagerCareer } from '../src/career/managerCareer.js'

globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null },
  setItem(k, v) { this._d[k] = String(v) },
  removeItem(k) { delete this._d[k] },
}

let passed = 0
function test(name, fn) { fn(); passed++; console.log('OK ' + name) }

const base = createCareer(0, {
  managerName: 'Tester',
  playerTeamId: 'toronto-rush',
  seasonYear: 2025,
  rosterMode: 'historical',
})

// ---- 1. isImportantInboxMessage: items that should now block ----
test('scout_report now blocks the sim loop', () => {
  assert.equal(isImportantInboxMessage({ type: INBOX_TYPES.SCOUT_REPORT, payload: {} }), true)
})
test('facility_completed still blocks (never was silenced)', () => {
  assert.equal(
    isImportantInboxMessage({ type: INBOX_TYPES.CLUB_NEWS, payload: { kind: 'facility_completed' } }),
    true,
  )
})
test('decision random_event always blocks, even with an "ignore" choice', () => {
  const msg = {
    type: INBOX_TYPES.RANDOM_EVENT,
    payload: { kind: 'decision', status: 'pending', choices: [{ id: 'ignore', label: 'Ignore' }] },
  }
  assert.equal(isImportantInboxMessage(msg), true)
})
test('training_report / match_analysis / injury stay silent', () => {
  assert.equal(isImportantInboxMessage({ type: INBOX_TYPES.TRAINING_REPORT, payload: {} }), false)
  assert.equal(isImportantInboxMessage({ type: INBOX_TYPES.MATCH_ANALYSIS, payload: {} }), false)
  assert.equal(isImportantInboxMessage({ type: INBOX_TYPES.INJURY, payload: {} }), false)
})

// ---- 2. acceptIncomingBid no longer finalizes instantly ----
test('acceptIncomingBid queues a player decision instead of finalizing on the spot', () => {
  const career = structuredClone(base)
  const team = career.world.teamsById[career.playerTeamId]
  const player = team.players[team.players.length - 1] // a bench player, cheap to sell
  const buyerId = career.world.teamIds.find((id) => id !== career.playerTeamId)
  const buyer = career.world.teamsById[buyerId]
  buyer.finances = buyer.finances ?? {}
  buyer.finances.transferBudget = 5_000_000
  const fee = 50_000

  const result = acceptIncomingBid(career, { playerId: player.id, buyerTeamId: buyerId, fee })
  assert.equal(result.ok, true)
  assert.equal(result.completed, false)
  assert.equal(result.pending, 'player_decision')
  // Player must NOT have moved yet.
  const stillHere = team.players.some((p) => p.id === player.id)
  assert.equal(stillHere, true, 'player should still be on the seller roster before the delayed decision')
})

// ---- 3. queueSalePlayerDecision + processDelayedTransferReplies resolves definitively ----
test('sale_player_decision resolves to a terminal state (accepted or rejected), never stays re-clickable', () => {
  const career = structuredClone(base)
  const team = career.world.teamsById[career.playerTeamId]
  const player = team.players[team.players.length - 2]
  const buyerId = career.world.teamIds.find((id) => id !== career.playerTeamId)
  const buyer = career.world.teamsById[buyerId]
  buyer.finances = buyer.finances ?? {}
  buyer.finances.transferBudget = 5_000_000
  const fee = 40_000

  const accept = acceptIncomingBid(career, { playerId: player.id, buyerTeamId: buyerId, fee })
  assert.equal(accept.pending, 'player_decision')

  const queued = queueSalePlayerDecision(career, {
    messageId: null,
    playerId: accept.playerId,
    playerName: accept.playerName,
    buyerTeamId: accept.buyerTeamId,
    fee: accept.fee,
  })
  assert.equal(queued.ok, true)
  assert.equal(queued.message.payload.kind, 'sale_player_decision')
  assert.equal(queued.message.payload.status, 'awaiting_reply')
  const replyDate = queued.message.payload.replyDate
  assert.ok(replyDate > career.league.currentDate, 'reply date must be in the future, not instant')

  career.inbox = [queued.message, ...(queued.inboxBase ?? career.inbox)]

  // Resolving before the reply date must leave THIS message untouched (the
  // career may carry other, unrelated ambient awaiting_reply messages).
  const tooEarly = processDelayedTransferReplies(career, { date: career.league.currentDate })
  const stillQueued = tooEarly.inbox.find((m) => m.id === queued.message.id)
  assert.equal(stillQueued?.payload?.status, 'awaiting_reply')

  const resolved = processDelayedTransferReplies(career, { date: replyDate })
  assert.equal(resolved.resolved, 1)
  const decisionMsg = resolved.inbox.find((m) => m.id === queued.message.id)
  assert.equal(decisionMsg.payload.superseded, true, 'original queued message must be closed, not left clickable')
  const followUp = resolved.inbox.find((m) => m.payload?.threadId === queued.message.id && m.id !== queued.message.id)
  assert.ok(followUp, 'a fresh follow-up message must exist (item 1: new message, not silent mutation)')
  assert.ok(['accepted', 'rejected'].includes(followUp.payload.status))

  // Re-resolving the same (now closed) date must not touch this thread again.
  const again = processDelayedTransferReplies({ ...career, inbox: resolved.inbox, world: resolved.world ?? career.world }, { date: replyDate })
  const stillClosed = again.inbox.find((m) => m.id === queued.message.id)
  assert.equal(stillClosed?.payload?.superseded, true)
  const stillFollowUp = again.inbox.find((m) => m.id === followUp.id)
  assert.equal(stillFollowUp?.payload?.status, followUp.payload.status)

  if (followUp.payload.status === 'accepted') {
    const movedTeam = resolved.world.teamsById[buyerId]
    assert.ok(movedTeam.players.some((p) => String(p.id) === String(player.id)), 'accepted decision must actually move the player')
  } else {
    const stillHere = career.world.teamsById[career.playerTeamId].players.some((p) => String(p.id) === String(player.id))
    assert.equal(stillHere, true, 'rejected decision must NOT move the player')
  }
})

// ---- 4. evaluateLoanOffer rejects when the AI club can't afford it (item 3 fix) ----
test('evaluateLoanOffer rejects an unaffordable loan instead of accepting then failing later', () => {
  const career = structuredClone(base)
  const parentTeam = career.world.teamsById[career.playerTeamId]
  const player = parentTeam.players[0]
  const destinationId = career.world.teamIds.find((id) => id !== career.playerTeamId)
  const destinationTeam = career.world.teamsById[destinationId]
  destinationTeam.finances = destinationTeam.finances ?? {}
  destinationTeam.finances.transferBudget = 0 // can't afford anything

  const evaluation = evaluateLoanOffer({
    player,
    destinationTeam,
    parentTeam,
    fee: 999_999,
    wageSplitPct: 50,
    buyClause: null,
    seed: 12345,
  })
  assert.equal(evaluation.status, 'rejected')
})

// ---- 5. computeLoanWillingness produces a sane bounded score ----
test('computeLoanWillingness returns a value in [0.05, 0.95]', () => {
  const parentTeam = base.world.teamsById[base.playerTeamId]
  const player = parentTeam.players[0]
  const destinationId = base.world.teamIds.find((id) => id !== base.playerTeamId)
  const destinationTeam = base.world.teamsById[destinationId]
  const w = computeLoanWillingness({ player, parentTeam, destinationTeam })
  assert.ok(w >= 0.05 && w <= 0.95, `willingness out of bounds: ${w}`)
})

// ---- 6. Player of the month: boxScore fix ----
test('playerOfMonthArticle finds a winner once matches carry boxScore', () => {
  const career = structuredClone(base)
  const league = career.league
  const home = league.teamIds[0]
  const away = league.teamIds[1]
  const fixture = league.fixtures.find((f) => f.homeTeamId === home && f.awayTeamId === away) ?? league.fixtures[0]
  const homePlayer = career.world.teamsById[fixture.homeTeamId].players[0]
  const record = {
    fixtureId: fixture.id,
    round: fixture.round,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeScore: 15,
    awayScore: 10,
    winner: fixture.homeTeamId,
    boxScore: [{ playerId: homePlayer.id, teamId: 'home', firstName: homePlayer.firstName, lastName: homePlayer.lastName, goals: 5, assists: 2, blocks: 1, turnovers: 0 }],
  }
  applyMatchResultToLeague(league, record)
  const entry = league.matchHistory.at(-1)
  assert.ok(Array.isArray(entry.boxScore) && entry.boxScore.length > 0, 'matchHistory entry must carry boxScore')

  const monthIso = league.currentDate.slice(0, 7)
  const article = playerOfMonthArticle(career, league, {}, monthIso)
  assert.ok(article, 'playerOfMonthArticle must not return null once a scoring match exists that month')
  assert.ok(article.headline.includes(homePlayer.lastName) || article.headlineEn?.includes(homePlayer.lastName))
})

// ---- 7. Manager job offers no longer land in the inbox ----
test('processManagerCareer does not push job-offer messages into the inbox', () => {
  const career = structuredClone(base)
  career.managerCareer.lastOfferMonth = null
  const before = career.inbox.length
  processManagerCareer(career)
  const jobMsgs = career.inbox.filter((m) => String(m.id).startsWith('job-'))
  assert.equal(jobMsgs.length, 0, 'no job- prefixed messages should be in the inbox')
  assert.ok(Array.isArray(career.managerCareer.offers), 'offers data must still be computed for the career panel')
})

// ---- 8. allowRandomEvents gates event generation on fast-forward ----
test('advanceCareerDay skips random events when allowRandomEvents is false', () => {
  const career = structuredClone(base)
  let anyRandomEvent = false
  for (let i = 0; i < 15; i++) {
    const result = advanceCareerDay(career, { autoSimulatePlayer: true, allowRandomEvents: false })
    if (result.blocked) break
    if ((result.inboxMessages ?? []).some((m) => m.type === INBOX_TYPES.RANDOM_EVENT && m.payload?.kind === 'decision')) {
      anyRandomEvent = true
    }
    Object.assign(career, result.career)
  }
  assert.equal(anyRandomEvent, false, 'no decision random_event should be generated while allowRandomEvents is false')
})

console.log(`Passed ${passed} inbox/transfer/loan fix tests`)
