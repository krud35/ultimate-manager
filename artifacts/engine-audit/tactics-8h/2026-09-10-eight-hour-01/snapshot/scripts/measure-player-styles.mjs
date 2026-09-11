/** Paired decision probes for all traits. This is not a league win-rate estimate. */
import fs from 'node:fs'
import { TRAIT_DEFS, getTraitMods } from '../src/models/playerTraits.js'
import { demoHomeTeam, demoAwayTeam } from '../src/data/demoMatchTeams.js'
import { createRng } from '../src/matchEngine/rng.js'
import { pickThrowType } from '../src/matchEngine/throwTypes.js'
import { scanThrowOptions } from '../src/matchEngine/ai/throwerBrain.js'
import { resetPlayerPerception } from '../src/matchEngine/ai/playerPerception.js'
import { mergeTraitAndCoachMods } from '../src/matchEngine/coachDirectives.js'

const output = { description: '256 paired fast decisions and 8 spatial scenes per trait/instruction combination; same skills, neutral morale, no wind. Zero changes can mean the trait acts elsewhere.', variants: [] }
for (const trait of [null, ...Object.keys(TRAIT_DEFS)]) {
  for (const huckAppetite of [-1, 0, 1]) {
    const thrower = { ...structuredClone(demoHomeTeam.players[0]), traits: trait ? [trait] : [], morale: 72, currentStamina: 100 }
    const tactics = { coachDirectives: { huckAppetite }, oLineCoachDirectives: { huckAppetite }, dLineCoachDirectives: { huckAppetite } }
    const counts = {}, spatial = {}, recipients = {}
    let chosenDistanceSum = 0, chosenCount = 0, deepLooks = 0
    for (let i = 0; i < 256; i++) {
      const type = pickThrowType({ rng: createRng(92000 + i * 137), thrower, tactics,
        discPosition: 45, stallCount: 3, defender: demoAwayTeam.players[0], separation: { outcome: 'open' },
        attackStyle: 'horizontal_stack', defenseStyle: 'person' })
      counts[type] = (counts[type] ?? 0) + 1
    }
    for (let i = 0; i < 8; i++) {
      resetPlayerPerception(thrower)
      const offense = demoHomeTeam.players.slice(0, 7).map((p, j) => ({ id: p.id,
        player: j === 0 ? thrower : { ...p, traits: [] }, x: j === 0 ? 35 : j === 1 ? 30 : 32 + j * 6,
        y: j === 0 ? 18 : 5 + j * 4, vx: j < 2 ? 0 : i % 2 ? 3 : -3, vy: 0,
        targetX: 45 + j * 5, targetY: 5 + j * 4, isThrower: j === 0, isDump: j === 1,
        state: j > 1 ? 'ACTIVE_CUT' : 'WAITING', stackIndex: j }))
      const defense = demoAwayTeam.players.slice(0, 7).map((p, j) => ({ id: p.id, player: p,
        x: offense[j].x + (i % 3 + 1), y: offense[j].y + 3, vx: 0, vy: 0 }))
      let decision = null
      for (const ms of [0, 250, 500, 750, 1000]) decision = scanThrowOptions(thrower, offense, defense,
        { disc: { x: 35, y: 18 }, setupElapsedMs: ms, stallCount: 3, possessionTeam: 'home',
          rng: createRng(84000 + i * 31 + ms), offenseTactics: tactics })
      const choice = decision?.throwType ?? 'wait'
      spatial[choice] = (spatial[choice] ?? 0) + 1
      if (decision) {
        const distance = Math.hypot(decision.catchX - 35, decision.catchY - 18)
        chosenDistanceSum += distance; chosenCount++; if (distance >= 26) deepLooks++
        recipients[decision.player.id] = (recipients[decision.player.id] ?? 0) + 1
      }
    }
    output.variants.push({ trait: trait ?? 'none', huckAppetite, fastDecisions: counts,
      spatialDecisions: spatial, spatialRecipients: recipients, deepLooks,
      meanChosenDistanceM: chosenCount ? chosenDistanceSum / chosenCount : null,
      mods: getTraitMods(thrower), effectiveHuckWeight: mergeTraitAndCoachMods(thrower, tactics).huckWeightMult })
  }
}
fs.mkdirSync('artifacts/recommendations', { recursive: true })
fs.writeFileSync('artifacts/recommendations/trait-probes.json', JSON.stringify(output, null, 2) + '\n')
console.log(`Zapisano ${output.variants.length} wariantów: 82 cechy + brak cechy, po 3 rozkazy; 63744 decyzje fast i 1992 sceny przestrzenne.`)
