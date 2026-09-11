import assert from 'node:assert/strict'
import { RANDOM_EVENT_TEMPLATES, RANDOM_EVENT_FOLLOWUP_TEMPLATES, applyRandomEventChoice, processPendingEventFollowUps, randomEventRng } from '../src/career/randomEvents.js'
import { generateRandomEvents, messageFromInjury } from '../src/career/inbox.js'
import { roundReviewArticles, playerOfMonthArticle, safePostponementDate, processUltiworldTick } from '../src/career/ultiworld.js'
import { INJURY_LABELS, MODERATE_INJURY_LABELS, SERIOUS_INJURY_LABELS, injuryLabelEn } from '../src/models/playerInjury.js'
import { getTransferBudget } from '../src/career/transfers/clubFinances.js'
import { processMonthlySponsorPayouts } from '../src/career/clubSponsors.js'
import { EXTRA_RANDOM_EVENTS, EXTRA_FOLLOWUP_EVENTS } from '../src/career/randomEventStories.js'

function clubCash(team) {
  return team.finances?.economyVersion >= 2 ? team.finances.cash : getTransferBudget(team)
}

function makeCareer() {
  const teamsById = Object.fromEntries(['a', 'b', 'c', 'd'].map(id => [id, {
    id, name: `Club ${id}`, finances: { cash: 1000000, transferBudget: 1000000, salaryBudget: 1000000 },
    sponsors: { sponsorsGen: 1, main: { id: 's1', brandName: 'Sponsor', brandNameEn: 'Sponsor', paymentModel: 'monthly', perMonthAmount: 2000, yearsRemaining: 2 }, secondary: null, offers: { main: [], secondary: [] }, eventLog: [] },
    players: Array.from({ length: 8 }, (_, n) => ({ id: `${id}${n}`, firstName: 'Player', lastName: `${id}${n}`, age: 21 + n,
      skills: { throwing: 70, catching: 70, speed: 70, defense: 70, vision: 70, spirit: 70 }, potential: 90, morale: 70, form: 70,
      contract: { weeklyWage: 500, weeksRemaining: 4, weeksTotal: 52, years: 1, bonuses: [], promises: [] },
    })),
  }]))
  for (const team of Object.values(teamsById)) getTransferBudget(team)
  return { id: 'event-regression', seasonIndex: 1, seasonYear: 2026, playerTeamId: 'a', inbox: [], pendingEventFollowUps: [],
    world: { teamsById, teamIds: Object.keys(teamsById), freeAgents: [] },
    league: { currentDate: '2026-09-01', calendar: { seasonYear: 2026 }, teamsById, teamIds: Object.keys(teamsById), fixtures: [], matchHistory: [], playerStats: {}, standings: {}, totalRounds: 0 },
    ultiworld: { seeded: true, transferNewsSeeded: true, articles: [], coveredFixtureIds: [], lastPomMonth: '2026-09', lastPowerRankingMonth: '2026-09' }, transferLog: [], loanLog: [] }
}
const templates = [...RANDOM_EVENT_TEMPLATES, ...RANDOM_EVENT_FOLLOWUP_TEMPLATES]
function decide(career, templateId, choiceId, context = {}) {
  const t = templates.find(t => t.id === templateId)
  const id = `test-${templateId}`
  career.inbox = [{ id, type: 'random_event', date: career.league.currentDate, payload: { kind: 'decision', status: 'pending', templateId, context, choices: t.choices(context) } }]
  return applyRandomEventChoice(career, id, choiceId)
}
function commit(c, r) {
  assert.equal(r.ok, true, r.error)
  return { ...c, world: r.world, inbox: r.nextInbox, pendingEventFollowUps: r.pendingEventFollowUps }
}
let passed = 0
function test(name, run) { run(); passed++; console.log(`PASS ${name}`) }

test('Real contract extension, higher wages, fee exactly once; input stays unchanged', () => {
  const c = makeCareer(), before = JSON.stringify(c.world)
  const r = decide(c, 'foreign_interest_formal_offer', 'lock_in', { starId: 'a0', starName: 'Player a0' })
  assert.equal(r.ok, true, r.error)
  assert.ok(r.world.teamsById.a.players[0].contract.weeksRemaining > 4)
  assert.ok(r.world.teamsById.a.players[0].contract.weeklyWage > 500)
  const updated = r.world.teamsById.a
  const contract = updated.players[0].contract
  const escrowChange = updated.finances.economyVersion >= 2 ? 0 : contract.weeklyWage * contract.weeksRemaining - 500 * 4
  assert.equal(clubCash(updated), 995000 - escrowChange)
  assert.equal(JSON.stringify(c.world), before)
  assert.equal(applyRandomEventChoice(commit(c,r), c.inbox[0].id, 'lock_in').ok, false)
})
test('Opening transfer talks lists the player without minting cash', () => {
  const c = makeCareer(), r = decide(c, 'foreign_interest_formal_offer', 'open_talks', { starId: 'a0', starName: 'Player a0' })
  assert.equal(r.ok, true)
  assert.equal(r.world.teamsById.a.players[0].transferListed, true)
  assert.equal(clubCash(r.world.teamsById.a), 1000000)
})
test('All sponsor termination choices free the slot and stop monthly payments', () => {
  for (const [template, choice] of [['sponsor_rumor','cut_now'], ['sponsor_investigation_guilty','cut_public'], ['sponsor_investigation_guilty','cut_quiet']]) {
    const c = makeCareer(), r = decide(c, template, choice, { sponsorId: 's1', sponsorName: 'Sponsor' })
    assert.equal(r.ok, true)
    const team = r.world.teamsById.a
    assert.equal(team.sponsors.main, null)
    assert.equal(team.sponsors.offers.main.length, 3)
    const before = clubCash(team)
    processMonthlySponsorPayouts(r.world, '2026-10-01')
    assert.equal(clubCash(team), before)
  }
})
test('Legacy context matches the sponsor by name; replacement sponsor is preserved', () => {
  let c = makeCareer()
  assert.equal(decide(c, 'sponsor_rumor', 'cut_now', { sponsorName: 'Sponsor' }).world.teamsById.a.sponsors.main, null)
  c = makeCareer()
  const r = decide(c, 'sponsor_rumor', 'cut_now', { sponsorId: 'old', sponsorName: 'Sponsor' })
  assert.equal(r.world.teamsById.a.sponsors.main.id, 's1')
})
test('Treatment shortens real injury; recovered or departed players incur no fee', () => {
  for (const state of ['injured', 'healthy', 'departed']) {
    const c = makeCareer()
    if (state === 'injured') c.world.teamsById.a.players[0].injury = { daysRemaining: 8, label: 'skręcenie' }
    if (state === 'departed') c.world.teamsById.a.players.shift()
    const r = decide(c, 'specialist_rehab_result', 'treat', { playerId: 'a0', playerName: 'Player a0' })
    assert.equal(r.ok, true)
    assert.equal(clubCash(r.world.teamsById.a), state === 'injured' ? 998500 : 1000000)
    if (state === 'injured') assert.equal(r.world.teamsById.a.players[0].injury.daysRemaining, 4)
  }
})
test('Rest actually makes the player unavailable', () => {
  const r = decide(makeCareer(), 'training_overload', 'rest', { playerId: 'a0', playerName: 'Player a0' })
  assert.equal(r.world.teamsById.a.players[0].injury.daysRemaining, 2)
  assert.equal(injuryLabelEn(r.world.teamsById.a.players[0].injury.label), 'muscle overload')
})
test('Workshop follow-up runs on its due date once and changes a real skill', () => {
  let c = makeCareer()
  c = commit(c, decide(c, 'technical_mentor', 'fund', { playerId: 'a0', playerName: 'Player a0' }))
  assert.equal(processPendingEventFollowUps(c, { date: '2026-09-07' }).messages.length, 0)
  const due = processPendingEventFollowUps(c, { date: '2026-09-08' })
  assert.equal(due.messages.length, 1)
  assert.equal(due.pendingEventFollowUps.length, 0)
  c = { ...c, inbox: due.messages, pendingEventFollowUps: due.pendingEventFollowUps }
  const r = applyRandomEventChoice(c, due.messages[0].id, 'throwing')
  assert.equal(r.ok, true)
  assert.equal(r.world.teamsById.a.players[0].skills.throwing, 71)
  assert.equal(processPendingEventFollowUps(c, { date: '2026-09-09' }).messages.length, 0)
})
test('Insufficient funds do not partially change the world; free alternative works', () => {
  const c = makeCareer(); c.world.teamsById.a.finances.cash = 0; c.world.teamsById.a.finances.transferBudget = 0
  const before = JSON.stringify(c.world)
  assert.equal(decide(c, 'technical_mentor', 'fund', { playerId: 'a0' }).ok, false)
  assert.equal(JSON.stringify(c.world), before)
  assert.equal(decide(c, 'technical_mentor', 'standard', { playerId: 'a0' }).ok, true)
})
test('All injury labels translate and inbox stores English copy', () => {
  for (const label of [...INJURY_LABELS, ...MODERATE_INJURY_LABELS, ...SERIOUS_INJURY_LABELS, 'przeciążenie mięśniowe']) {
    assert.notEqual(injuryLabelEn(label), label)
    const m = messageFromInjury(makeCareer(), { playerId: 'a0', label, daysRemaining: 3 })
    assert.equal(m.payload.labelEn, injuryLabelEn(label))
    assert.ok(!m.bodyEn.includes(label))
  }
})
test('Round review contains actual results, close games and totals; at most 2 articles', () => {
  const c = makeCareer(), names = { a: 'Alpha', b: 'Beta', c: 'Gamma', d: 'Delta' }
  c.league.fixtures = [{ id: 'f1', round: 1, date: '2026-09-05', status: 'completed', homeTeamId: 'a', awayTeamId: 'b', homeScore: 15, awayScore: 14 }, { id: 'f2', round: 1, date: '2026-09-05', status: 'completed', homeTeamId: 'c', awayTeamId: 'd', homeScore: 8, awayScore: 15 }]
  const articles = roundReviewArticles(c, c.league, 1, names, names)
  assert.equal(articles.length, 1)
  assert.ok(articles[0].body.includes('52 punktów'))
  assert.ok(articles[0].body.includes('Alpha 15–14 Beta'))
  assert.ok(articles[0].body.includes('Gamma 8–15 Delta'))
  assert.ok(articles[0].bodyEn.includes('52 points'))
  assert.equal(articles[0].date, '2026-09-07')
})
test('Player of month ignores prior-month season leader and current form', () => {
  const c = makeCareer()
  c.league.matchHistory = [{ fixtureId: 'old', date: '2026-07-01', homeTeamId: 'a', awayTeamId: 'b', boxScore: [{ playerId: 'a0', firstName: 'Old', lastName: 'Leader', teamId: 'home', goals: 100 }] }, { fixtureId: 'new', date: '2026-08-30', homeTeamId: 'a', awayTeamId: 'b', boxScore: [{ playerId: 'a1', firstName: 'Monthly', lastName: 'Leader', teamId: 'home', goals: 4 }, { playerId: 'b0', firstName: 'Other', teamId: 'away', goals: 1 }] }]
  const a = playerOfMonthArticle(c, c.league, { a: 'Alpha', b: 'Beta' }, '2026-08')
  assert.deepEqual(a.relatedPlayerIds, ['a1'])
  assert.ok(a.body.includes('4 goli'))
  assert.equal(playerOfMonthArticle(c, c.league, {}, '2026-06'), null)
})
test('Postponement avoids adjacent games, exhausted schedules and cup brackets', () => {
  const c = makeCareer(), f = { id: 'f', date: '2026-09-01', homeTeamId: 'a', awayTeamId: 'b' }
  c.league.fixtures = [f, { id: 'next', date: '2026-09-04', homeTeamId: 'a', awayTeamId: 'c' }]
  assert.equal(safePostponementDate(c.league, f), '2026-09-06')
  c.league.fixtures.push({ id: 'another', date: '2026-09-07', homeTeamId: 'b', awayTeamId: 'd' })
  assert.equal(safePostponementDate(c.league, f), null)
  assert.equal(safePostponementDate(c.league, { ...f, competition: 'cup' }), null)
})
test('New stories have complete bilingual copy and valid follow-up targets for every choice', () => {
  const c = makeCareer(), team = c.world.teamsById.a
  team.players[0].injury = { daysRemaining: 20, label: 'skręcenie' }
  const rng = randomEventRng(42)
  for (const t of [...EXTRA_RANDOM_EVENTS, ...EXTRA_FOLLOWUP_EVENTS]) {
    const ctx = t.pickContext ? t.pickContext(team.players, rng, team) : { playerId: 'a0', playerName: 'Player a0', failed: true }
    assert.ok(ctx, t.id)
    for (const key of ['title','titleEn','body','bodyEn']) assert.ok(t[key](ctx), `${t.id} ${key}`)
    for (const choice of t.choices(ctx)) {
      assert.ok(choice.labelEn && choice.hintEn)
      for (const roll of [0, 0.99]) {
        const r = t.resolve(ctx, choice.id, () => roll)
        assert.ok(r.summary && r.summaryEn)
        if (r.followUp) assert.ok(templates.some(t => t.id === r.followUp.templateId))
      }
    }
  }
})
test('365-day event simulation respects 3-day spacing and template cooldown after inbox deletion', () => {
  const c = makeCareer(), history = []
  for (let day = 0; day < 365; day++) {
    const date = new Date(Date.UTC(2026, 8, 1 + day)).toISOString().slice(0,10)
    c.league.currentDate = date
    const messages = generateRandomEvents(c, { date })
    for (const m of messages) {
      const previous = history.at(-1)
      if (previous) assert.ok((Date.parse(date) - Date.parse(previous.date)) / 86400000 >= 3)
      const lastSame = history.findLast(e => e.payload.templateId === m.payload.templateId)
      const cooldown = templates.find(t => t.id === m.payload.templateId).cooldownDays ?? 21
      if (lastSame) assert.ok((Date.parse(date) - Date.parse(lastSame.date)) / 86400000 > cooldown)
      history.push(m)
    }
    c.inbox = []
  }
  assert.ok(history.length > 20)
  console.log(`  annual decision messages: ${history.length}`)
})
test('Same-day Ultiworld ticks cannot replay world effects', () => {
  let c = makeCareer()
  for (let i = 0; i < 40; i++) {
    c.league.currentDate = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0,10)
    const first = processUltiworldTick(c)
    c = { ...c, ...first }
    const second = processUltiworldTick(c)
    assert.ok(!second.newArticles.some(a => a.worldEventId))
  }
})
console.log(`${passed} event/news regression checks passed`)
