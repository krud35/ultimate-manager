import fs from 'node:fs'
import { AI_COACH_ARCHETYPES } from '../src/matchEngine/aiCoachProfile.js'
import { tacticsForTeam, resolveAiTeamIdentity, autoRotateTacticsForTeam, autoSubstituteTacticsForTeam } from '../src/matchEngine/aiLineup.js'
import { normalizeTactics } from '../src/matchEngine/lineups.js'
import { defaultCoachDirectives } from '../src/matchEngine/coachDirectives.js'
import { analyzePointForSide, adaptAiTacticsBetweenPoints, promoteAiAdaptObservation, updateAiAdaptObservation, createAiAdaptSideState } from '../src/matchEngine/aiTacticsAdapt.js'
import { createRng } from '../src/matchEngine/rng.js'

export function atomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data))
  fs.renameSync(tmp, file)
}
export const styles = ['oLineAttackStyle', 'dLineAttackStyle', 'oLineDefenseStyle', 'dLineDefenseStyle']
export function makeTeam(raw, config = {}, job = {}) {
  const team = structuredClone(raw)
  const zero = { ...defaultCoachDirectives(), forceSide: 'force_forehand' }
  team.tacticalIdentity = { label: 'Explicit neutral club', attackStyle: 'vertical_stack', defenseStyle: 'person',
    coachDirectives: zero, oLineCoachDirectives: zero, dLineCoachDirectives: zero, forceSide: zero.forceSide }
  team.aiCoachProfile = config.profile ? structuredClone(AI_COACH_ARCHETYPES.find(p => p.id === config.profile)) : null
  if (config.profile && !team.aiCoachProfile) throw new Error(`Unknown profile ${config.profile}`)
  if (team.aiCoachProfile && config.ablation === 'preferences') {
    for (const k of ['oLineAttackStyles', 'dLineAttackStyles', 'oLineDefenseStyles', 'dLineDefenseStyles']) team.aiCoachProfile[k] = []
  }
  if (team.aiCoachProfile && config.ablation === 'biases') {
    team.aiCoachProfile.oLineDirectiveBias = {}; team.aiCoachProfile.dLineDirectiveBias = {}
  }
  if (team.aiCoachProfile && config.jitter) {
    const rng = createRng(job.seed + 987)
    for (const line of ['oLineDirectiveBias', 'dLineDirectiveBias']) for (const k of Object.keys(team.aiCoachProfile[line] ?? {}))
      team.aiCoachProfile[line][k] = Math.max(-1, Math.min(1, team.aiCoachProfile[line][k] + (rng.float() * 2 - 1) * .12))
  }
  team.teamTraining = { tacticsFamiliarity: job.familiarity ?? 65 }
  team.tacticsFamiliarity = team.teamTraining.tacticsFamiliarity
  for (const p of team.players) {
    if (job.morale != null) p.morale = job.morale
    if (job.trait && (job.traitSide ?? 'home') === config.side) p.traits = [job.trait]
    if (job.attribute && (job.attributeSide ?? 'home') === config.side) {
      const [cat, key] = job.attribute.split('.'); p.skills[cat][key] = job.attributeValue
    }
  }
  let t = tacticsForTeam(team, { withPlayerInstructions: config.ablation !== 'instructions', lossStreak: config.lossStreak ?? 0 })
  if (config.ablation === 'lineup') {
    t.lineupWhenOffenseStartPlayerIds = team.players.slice(0, 7).map(p => p.id)
    t.lineupWhenDefenseStartPlayerIds = team.players.slice(7, 14).map(p => p.id)
    t.playerSubRoles = {}
  }
  team.tactics = applyConfig(t, team, config)
  return team
}
export function applyConfig(tactics, team, config) {
  const t = structuredClone(tactics)
  if (config.attack) t.oLineAttackStyle = t.dLineAttackStyle = config.attack
  if (config.defense) t.oLineDefenseStyle = t.dLineDefenseStyle = config.defense
  for (const k of styles) if (config[k]) t[k] = config[k]
  for (const line of ['oLine', 'dLine']) {
    t[`${line}CoachDirectives`] = { ...t[`${line}CoachDirectives`], ...config.directives, ...config[`${line}Directives`] }
    if (config.force) t[`${line}CoachDirectives`].forceSide = config.force
    if (config.instructions || config.ablation === 'instructions') {
      const ids = t[line === 'oLine' ? 'lineupWhenOffenseStartPlayerIds' : 'lineupWhenDefenseStartPlayerIds']
      const selected = config.instructionRole === 'handler' ? ids.slice(0, 3) : config.instructionRole === 'cutter' ? ids.slice(3) : ids
      t[`${line}PlayerInstructions`] = Object.fromEntries((selected ?? []).map(id => [id, config.instructions ?? []]))
    }
  }
  t.coachDirectives = t.oLineCoachDirectives; t.forceSide = t.oLineCoachDirectives.forceSide
  return normalizeTactics(t)
}
export function beforePoint(session, configs, job) {
  const log = {}
  for (const side of ['home', 'away']) {
    const c = configs[side], team = session[side]
    const before = structuredClone(team.tactics)
    if (job.rotate !== false && c.ablation !== 'rotation') {
      team.tactics = c.profile ? autoRotateTacticsForTeam(team, session.stamina[side], session.rng, { pointIndex: session.pointIndex })
        : autoSubstituteTacticsForTeam(team, session.stamina[side], { pointIndex: session.pointIndex })
    }
    // Persistent prescribed experimental settings are restored after production lineup refresh.
    team.tactics = applyConfig(team.tactics, team, c)
    let analysis = {}, reason = 'initial-or-fixed', changed = false
    if (session.lastPoint && c.profile && c.adapt !== false && c.ablation !== 'adaptation') {
      analysis = analyzePointForSide(session.lastPoint.events, side, session.boxScore)
      analysis.weScored = session.lastPoint.scoringTeam === side; analysis.theyScored = !analysis.weScored
      if (analysis.weScored) analysis.offenseFailed = false
      let state = promoteAiAdaptObservation(session.aiAdaptState[side])
      const previous = structuredClone(team.tactics)
      const next = adaptAiTacticsBetweenPoints({ team, tactics: team.tactics, identity: resolveAiTeamIdentity(team),
        adaptSide: state, pointAnalysis: analysis, matchStatsSide: session.matchStats?.[side], side,
        ourScore: side === 'home' ? session.homeScore : session.awayScore,
        theirScore: side === 'home' ? session.awayScore : session.homeScore,
        rng: session.rng, isAi: true, staminaMap: session.stamina[side] })
      reason = 'production-adaptation'
      if (c.policy === 'stable') {
        const failures = analysis.weScored ? 0 : (state.auditFailures ?? 0) + 1
        const since = session.pointIndex - (state.auditLastChange ?? -99)
        if (failures < 2 || since < (c.cooldown ?? 3)) { next.tactics = previous; reason = 'stable-persistence' }
        next.adaptSide.auditFailures = failures
        next.adaptSide.auditLastChange = JSON.stringify(previous) !== JSON.stringify(next.tactics) ? session.pointIndex : state.auditLastChange
      }
      if (c.policy === 'random') {
        next.tactics = previous
        if (session.rng.float() < .25) next.tactics.oLineAttackStyle = ['vertical_stack', 'horizontal_stack', 'hex_offense'][Math.floor(session.rng.float() * 3)]
        reason = 'random-control-quarter-probability'
      }
      team.tactics = next.tactics; session.aiAdaptState[side] = next.adaptSide
      if (c.ablation === 'instructions') team.tactics.oLinePlayerInstructions = team.tactics.dLinePlayerInstructions = {}
      changed = JSON.stringify(previous) !== JSON.stringify(team.tactics)
    }
    log[side] = { before, used: structuredClone(team.tactics), analysis, reason, changed,
      state: structuredClone(session.aiAdaptState[side]) }
  }
  return log
}
export function afterPoint(session) {
  for (const side of ['home', 'away']) session.aiAdaptState[side] = updateAiAdaptObservation(session.aiAdaptState[side], session[side === 'home' ? 'away' : 'home'].tactics)
}
export function adaptationProbes(raw, job) {
  const histories = {
    ordinary_hold: [{ weScored: false, theyScored: true, ourThrows: 0, ourTurnovers: 0, throwComp: 1 }],
    reset_failure: Array(4).fill({ weScored: false, theyScored: true, ourThrows: 6, ourTurnovers: 2, throwComp: .5, offenseFailed: true }),
    good_drop: [{ weScored: false, theyScored: true, ourThrows: 8, ourTurnovers: 1, throwComp: .875 }],
    bad_caught: [{ weScored: true, theyScored: false, ourThrows: 8, ourTurnovers: 0, throwComp: 1 }],
    panic_recovery: [...Array(5).fill({ weScored: false, theyScored: true, ourThrows: 6, ourTurnovers: 2, throwComp: .5 }), ...Array(4).fill({ weScored: true, theyScored: false, ourThrows: 8, ourTurnovers: 0, throwComp: 1 })],
    opponent_zone: Array(4).fill({ weScored: false, theyScored: true, ourThrows: 5, ourTurnovers: 1, throwComp: .8 }),
  }
  const rows = []
  for (const profile of AI_COACH_ARCHETYPES) for (const [history, analyses] of Object.entries(histories)) {
    const team = makeTeam(raw, { profile: profile.id, lossStreak: job.lossStreak ?? 0 }, job)
    let state = createAiAdaptSideState(), ours = 0, theirs = 0
    const rng = createRng(job.seed)
    for (const [step, analysis] of analyses.entries()) {
      if (analysis.weScored) ours++; else theirs++
      const before = structuredClone(team.tactics)
      state = promoteAiAdaptObservation(state)
      const next = adaptAiTacticsBetweenPoints({ team, tactics: before, identity: resolveAiTeamIdentity(team, { lossStreak: job.lossStreak ?? 0 }),
        adaptSide: state, pointAnalysis: analysis, side: 'home', ourScore: ours, theirScore: theirs, rng, isAi: true })
      team.tactics = next.tactics
      state = updateAiAdaptObservation(next.adaptSide, { ...before, oLineDefenseStyle: history === 'opponent_zone' ? 'zone_cup' : 'person', dLineDefenseStyle: history === 'opponent_zone' ? 'zone_cup' : 'person' })
      rows.push({ profile: profile.id, history, step, before, after: next.tactics, state, score: [ours, theirs],
        knowledge: 'Synthetic point aggregates and delayed opponent tactic metadata; no geometric decision-quality input exists here.' })
    }
  }
  return rows
}
