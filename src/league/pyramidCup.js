/**
 * Puchar Piramidy — styczniowy puchar wszystkich 48 drużyn Ligi Europejskiej,
 * jedna losowa drabinka:
 *  - Runda 1: Liga 2 (16) vs Liga 3 (16), losowe pary — Liga 1 ma pauzę.
 *  - Runda 32: 16 zwycięzców rundy 1 + 16 drużyn Ligi 1, losowe pary.
 *  - Dalej zwykła drabinka pojedynczej eliminacji: 1/8 → ćwierćfinał → półfinał → finał.
 * Awans w drabince liczony jest przez współdzielone `advanceCupAfterMatch` z cupBracket.js.
 *
 * Mecze mają `competition: 'cup'` (nie osobny tag) i konkretne daty (patrz
 * seasonCalendar.js: buildJanuaryPyramidCupWeeks) — to wystarcza, żeby cała reszta
 * dnia-po-dniu (dayEngine.js: `simulateAiFixturesOnDate`/`getPlayerFixtureOnDate`,
 * `applyMatchResultToLeague`'s isCup branch) obsłużyła je DOKŁADNIE tak jak zwykły
 * puchar UFA — łącznie z tym, że mecz gracza czeka na swoją datę i jest grywalny, a
 * nie rozstrzygany po cichu w tle. Wymaga, żeby wszystkie 48 drużyn miało już pełny
 * skład w `world.teamsById` ZANIM ich mecz nadejdzie — patrz `materializeFullPyramidTeams`
 * w shadowLeague.js, wołane raz na starcie sezonu w careerModel.js.
 */

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(...parts) {
  let h = 2166136261
  for (const part of parts) {
    const s = String(part)
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  return h >>> 0
}

function shuffled(arr, rng) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function findMatch(matches, id) {
  return matches.find((m) => m.id === id)
}

function link(matches, fromId, toId, slot) {
  const from = findMatch(matches, fromId)
  from.nextMatchId = toId
  from.nextSlot = slot
}

/**
 * @param {string[]} tier1Ids 16 drużyn Ligi 1 (pauza w rundzie 1)
 * @param {string[]} tier2Ids 16 drużyn Ligi 2
 * @param {string[]} tier3Ids 16 drużyn Ligi 3
 * @param {number} seed
 * @param {object} pyramidCupWeeks — `calendar.pyramidCup` (seasonCalendar.js)
 */
export function createPyramidCup(tier1Ids, tier2Ids, tier3Ids, seed, pyramidCupWeeks) {
  const rng = mulberry32(hashSeed(seed, 'pyramid-cup-draw'))
  const matches = []

  // Runda 1: Liga 2 vs Liga 3, losowe pary.
  const l2Draw = shuffled(tier2Ids, rng)
  const l3Draw = shuffled(tier3Ids, rng)
  const round1Ids = []
  for (let i = 0; i < 16; i += 1) {
    const id = `pyr-r1-${i + 1}`
    round1Ids.push(id)
    matches.push({
      id,
      round: 'round1',
      bracketIndex: i,
      homeTeamId: l2Draw[i],
      awayTeamId: l3Draw[i],
      status: 'scheduled',
      competition: 'cup',
      venue: 'neutral',
      date: pyramidCupWeeks.playWeek2.round1,
      nextMatchId: null,
      nextSlot: null,
    })
  }

  // Runda 32: 16 drużyn Ligi 1 + 16 zwycięzców rundy 1, losowe pary.
  const l1Draw = shuffled(tier1Ids, rng)
  const round1DrawOrder = shuffled(round1Ids, rng)
  const r32Ids = []
  for (let i = 0; i < 16; i += 1) {
    const id = `pyr-r32-${i + 1}`
    r32Ids.push(id)
    matches.push({
      id,
      round: 'roundOf32',
      bracketIndex: i,
      homeTeamId: l1Draw[i],
      awayTeamId: null,
      status: 'pending',
      competition: 'cup',
      venue: 'neutral',
      date: pyramidCupWeeks.playWeek2.roundOf32,
      nextMatchId: null,
      nextSlot: null,
      dependsOn: [round1DrawOrder[i]],
    })
    link(matches, round1DrawOrder[i], id, 'away')
  }

  // Od tego miejsca: zwykła drabinka (bez ponownego losowania) — 1/8, ćwierćfinał, półfinał, finał.
  const roundOf16Defs = []
  for (let i = 0; i < 8; i += 1) {
    const id = `pyr-r16-${i + 1}`
    const from = [r32Ids[i * 2], r32Ids[i * 2 + 1]]
    roundOf16Defs.push({ id, from })
    matches.push({
      id,
      round: 'roundOf16',
      bracketIndex: i,
      homeTeamId: null,
      awayTeamId: null,
      status: 'pending',
      competition: 'cup',
      venue: 'neutral',
      date: pyramidCupWeeks.playWeek3.roundOf16,
      nextMatchId: null,
      nextSlot: null,
      dependsOn: from,
    })
    link(matches, from[0], id, 'home')
    link(matches, from[1], id, 'away')
  }

  const qfDefs = []
  for (let i = 0; i < 4; i += 1) {
    const id = `pyr-qf-${i + 1}`
    const from = [roundOf16Defs[i * 2].id, roundOf16Defs[i * 2 + 1].id]
    qfDefs.push({ id, from })
    matches.push({
      id,
      round: 'quarterfinal',
      bracketIndex: i,
      homeTeamId: null,
      awayTeamId: null,
      status: 'pending',
      competition: 'cup',
      venue: 'neutral',
      date: pyramidCupWeeks.playWeek3.quarterfinal,
      nextMatchId: null,
      nextSlot: null,
      dependsOn: from,
    })
    link(matches, from[0], id, 'home')
    link(matches, from[1], id, 'away')
  }

  const sfDefs = []
  for (let i = 0; i < 2; i += 1) {
    const id = `pyr-sf-${i + 1}`
    const from = [qfDefs[i * 2].id, qfDefs[i * 2 + 1].id]
    sfDefs.push({ id, from })
    matches.push({
      id,
      round: 'semifinal',
      bracketIndex: i,
      homeTeamId: null,
      awayTeamId: null,
      status: 'pending',
      competition: 'cup',
      venue: 'neutral',
      date: pyramidCupWeeks.playWeek4.semifinal,
      nextMatchId: null,
      nextSlot: null,
      dependsOn: from,
    })
    link(matches, from[0], id, 'home')
    link(matches, from[1], id, 'away')
  }

  const finalId = 'pyr-final'
  matches.push({
    id: finalId,
    round: 'final',
    bracketIndex: 0,
    homeTeamId: null,
    awayTeamId: null,
    status: 'pending',
    competition: 'cup',
    venue: 'neutral',
    date: pyramidCupWeeks.playWeek4.final,
    nextMatchId: null,
    nextSlot: null,
    dependsOn: [sfDefs[0].id, sfDefs[1].id],
  })
  link(matches, sfDefs[0].id, finalId, 'home')
  link(matches, sfDefs[1].id, finalId, 'away')

  return {
    status: 'active',
    // `advanceCupAfterMatch` (cupBracket.js) używa cup.seeds tylko do kosmetycznego
    // ułożenia home/away — przy losowej drabince kolejność nie ma znaczenia.
    seeds: [...tier1Ids, ...tier2Ids, ...tier3Ids],
    matches,
    championTeamId: null,
    pyramidCupDates: pyramidCupWeeks,
  }
}

/**
 * Mecze pucharu piramidy zaplanowane na dany dzień. Rozstrzyganie samo w sobie idzie
 * teraz przez generyczną maszynerię pucharu w dayEngine.js (`simulateAiFixturesOnDate`
 * dla AI, normalny mecz gracza dla jego własnych spotkań) — ta funkcja to tylko
 * pomocniczy odczyt, np. do wyświetlenia "dziś gra się runda X" w kalendarzu.
 */
export function pyramidCupFixturesOnDate(cup, dateIso) {
  if (!cup?.matches) return []
  const day = String(dateIso).slice(0, 10)
  return cup.matches.filter(
    (m) => m.date === day && (m.status === 'scheduled' || m.status === 'pending') && m.homeTeamId && m.awayTeamId,
  )
}
