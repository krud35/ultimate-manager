/**
 * Puchar Piramidy — styczniowy puchar wszystkich 48 drużyn Ligi Europejskiej,
 * jedna ROZSTAWIONA drabinka (rozstawienie wg tabel na dzień losowania, czyli tydzień
 * 1 stycznia — patrz maybeInitializeCup w dayEngine.js):
 *  - Rozstawienie 1–48: Liga 1 = 1–16, Liga 2 = 17–32, Liga 3 = 33–48, a w obrębie
 *    poziomu wg miejsca w jego tabeli (mistrz Ligi 1 = 1, ostatni Ligi 3 = 48).
 *  - Runda 1: 17v48, 18v47 … 32v33 — czyli z definicji zawsze Liga 2 vs Liga 3,
 *    a Liga 1 (1–16) ma pauzę. To standardowa drabinka 64 z 16 wolnymi losami.
 *  - Runda 32: rozstawiony k (1–16) gra ze zwycięzcą pary (33−k, 32+k), więc 1 trafia
 *    na najsłabszego ocalałego, a 1 i 2 mogą się spotkać dopiero w finale.
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

/**
 * Standardowa kolejność rozstawionych w drabince 16 (miejsca 1–16 Ligi 1 wchodzą w
 * rundzie 32). Sąsiednie pary schodzą się rundę wyżej, więc taki układ trzyma 1 i 2 w
 * przeciwnych połówkach: 1v16 i 9v8 spotykają się w 1/8, 1 i 4 w ćwierćfinale itd.
 */
const BRACKET_ORDER_16 = [1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2]

function findMatch(matches, id) {
  return matches.find((m) => m.id === id)
}

function link(matches, fromId, toId, slot) {
  const from = findMatch(matches, fromId)
  from.nextMatchId = toId
  from.nextSlot = slot
}

/**
 * @param {string[]} tier1Ids 16 drużyn Ligi 1 W KOLEJNOŚCI TABELI (1. miejsce pierwsze)
 * @param {string[]} tier2Ids 16 drużyn Ligi 2 w kolejności tabeli
 * @param {string[]} tier3Ids 16 drużyn Ligi 3 w kolejności tabeli
 * @param {object} pyramidCupWeeks — `calendar.pyramidCup` (seasonCalendar.js)
 */
export function createPyramidCup(tier1Ids, tier2Ids, tier3Ids, pyramidCupWeeks) {
  const matches = []
  // Rozstawienie 1–48 (indeks 0–47): Liga 1, potem Liga 2, potem Liga 3 — każda już
  // posortowana wg swojej tabeli przez wywołującego (dayEngine.js: teamIdsByStandings).
  const seeds = [...tier1Ids, ...tier2Ids, ...tier3Ids]
  const teamAt = (seedNo) => seeds[seedNo - 1]

  // Runda 1: 17v48, 18v47 … 32v33. Liga 2 to rozstawienia 17–32, Liga 3 to 33–48,
  // więc każda para jest automatycznie Liga 2 vs Liga 3 — bez żadnej dodatkowej reguły.
  const round1IdBySeed = new Map()
  for (let i = 0; i < 16; i += 1) {
    const homeSeed = 17 + i
    const awaySeed = 48 - i
    const id = `pyr-r1-${i + 1}`
    round1IdBySeed.set(homeSeed, id)
    matches.push({
      id,
      round: 'round1',
      bracketIndex: i,
      homeTeamId: teamAt(homeSeed),
      awayTeamId: teamAt(awaySeed),
      homeSeed,
      awaySeed,
      status: 'scheduled',
      competition: 'cup',
      venue: 'neutral',
      date: pyramidCupWeeks.playWeek2.round1,
      nextMatchId: null,
      nextSlot: null,
    })
  }

  // Runda 32: rozstawiony k (Liga 1) vs zwycięzca pary (33−k, 32+k). Kolejność w
  // tablicy to standardowa drabinka 16, żeby 1 i 2 rozeszły się do przeciwnych połówek.
  const r32Ids = []
  for (let i = 0; i < 16; i += 1) {
    const topSeed = BRACKET_ORDER_16[i]
    const feederId = round1IdBySeed.get(33 - topSeed)
    const id = `pyr-r32-${i + 1}`
    r32Ids.push(id)
    matches.push({
      id,
      round: 'roundOf32',
      bracketIndex: i,
      homeTeamId: teamAt(topSeed),
      awayTeamId: null,
      homeSeed: topSeed,
      awaySeed: null,
      status: 'pending',
      competition: 'cup',
      venue: 'neutral',
      date: pyramidCupWeeks.playWeek2.roundOf32,
      nextMatchId: null,
      nextSlot: null,
      dependsOn: [feederId],
    })
    link(matches, feederId, id, 'away')
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
    // Rozstawienie 1–48. `advanceCupAfterMatch` (cupBracket.js) czyta z tego numery
    // rozstawienia kolejnych rund (indexOf + 1) i ustawia lepiej rozstawionego jako
    // gospodarza — dlatego kolejność MUSI odpowiadać tabelom z dnia losowania.
    seeds,
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
