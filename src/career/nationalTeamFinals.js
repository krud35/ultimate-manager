/**
 * Faza 4 planu kadr narodowych: faza finałowa ME/MŚ. Grupy 4-drużynowe (pojedyncza runda,
 * jak w kwalifikacjach — Faza 3), potem drabinka pucharowa zbudowana DOKŁADNIE na wzorcu
 * `pyramidCup.js` (dependsOn/nextMatchId/nextSlot, seedowane mulberry32/hashSeed) — z jedną
 * różnicą: w przeciwieństwie do Pucharu Piramidy (gdzie wszystkie 48 drużyn są znane od razu,
 * losowanie w pełni losowe) TU drabinka jest budowana DOPIERO po fazie grupowej, bo kto do
 * niej wchodzi zależy od wyników grup — dwuetapowo, tak jak baraże w Fazie 3.
 *
 * Kluczowe odkrycie: mecze Pucharu Piramidy idą przez WSPÓLNĄ maszynerię ligi/pucharu
 * (`applyMatchResultToLeague`'s isCup branch, `advanceCupAfterMatch` z cupBracket.js) — ale
 * ta maszyneria zakłada prawdziwe, trwałe drużyny w `world.teamsById` (finanse/kibice/
 * reputacja). Kadry narodowe (efemeryczne pseudo-drużyny, Faza 1-2) się tam nie mieszczą.
 * `advanceCupAfterMatch` jest jednak w 100% generyczny (operuje tylko na tablicy
 * `cup.matches`/`cup.seeds`, żadnego `world.teamsById`) — więc REUŻYWAMY go bezpośrednio do
 * propagacji zwycięzców w drabince, tylko z WŁASNYM rozstrzyganiem meczu (silnik z Fazy 2:
 * `simulateNationalTeamMatch`/`recordNationalTeamMatch`), nie przez ligowe `simulateFixtureMatch`.
 *
 * Pierwszy cykl (ME 2027, patrz nationalTeams.js: FIRST_EURO_YEAR) nie ma kwalifikacji —
 * wywołujący przekazuje 16 najlepszych krajów wg STARTOWEGO coefficientu bezpośrednio jako
 * `participantCountryIds` (patrz `topCountriesByStrength`), pomijając cały moduł
 * nationalTeamQualifying.js. Od kolejnego turnieju uczestnicy to `qualifying.qualifiedCountryIds`.
 */
import { generateRoundRobinSchedule } from '../league/schedule.js'
import { advanceCupAfterMatch } from '../league/cupBracket.js'
import { ensureCareerNationalTeams, getCountryStrength, selectNationalSquad } from './nationalTeams.js'
import {
  nationalTeamPseudoTeam,
  simulateNationalTeamMatch,
  recordNationalTeamMatch,
  createNationalTournamentStandings,
  nationalTournamentStandingsTable,
  createNationalTournamentPlayerStats,
} from './nationalTeamMatches.js'
import { pseudoTeamId, countryIdFromPseudoTeamId, buildQualifyingGroups } from './nationalTeamQualifying.js'

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

/** Bootstrapping pierwszego cyklu (ME 2027, bez kwalifikacji) — top `count` krajów wg
 * aktualnego (na starcie kariery: startowego) coefficientu, bezpośrednio do fazy finałowej. */
export function topCountriesByStrength(career, countryIds, count) {
  return [...countryIds]
    .sort((a, b) => getCountryStrength(career, b) - getCountryStrength(career, a))
    .slice(0, count)
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
 * Buduje kaskadową drabinkę pucharową (bez ponownego losowania) z już uszeregowanej listy
 * seedów: runda 1 parowana 1-vs-N/2-vs-N-1/... (klasyczny seeding), kolejne rundy przez
 * dependsOn/nextMatchId/nextSlot — dokładnie ten sam kształt co roundOf16/quarterfinal/
 * semifinal/final w pyramidCup.js, tylko sparametryzowany długością (Euro: 3 rundy z 8
 * seedów; MŚ: 4 rundy z 16 seedów).
 */
function buildKnockoutBracket(seedTeamIds, { idPrefix, roundNames, dates }) {
  const matches = []
  let seedRoundIds = null
  let prevRoundIds = null

  for (let r = 0; r < roundNames.length; r += 1) {
    const roundName = roundNames[r]
    const date = dates[r] ?? dates[dates.length - 1] ?? null
    const count = r === 0 ? seedTeamIds.length / 2 : prevRoundIds.length / 2
    const roundIds = []

    for (let i = 0; i < count; i += 1) {
      const id = `${idPrefix}-${roundName}-${i + 1}`
      roundIds.push(id)
      if (r === 0) {
        matches.push({
          id,
          round: roundName,
          bracketIndex: i,
          homeTeamId: seedTeamIds[i],
          awayTeamId: seedTeamIds[seedTeamIds.length - 1 - i],
          status: 'scheduled',
          date,
          nextMatchId: null,
          nextSlot: null,
          dependsOn: null,
        })
      } else {
        const from = [prevRoundIds[i * 2], prevRoundIds[i * 2 + 1]]
        matches.push({
          id,
          round: roundName,
          bracketIndex: i,
          homeTeamId: null,
          awayTeamId: null,
          status: 'pending',
          date,
          nextMatchId: null,
          nextSlot: null,
          dependsOn: from,
        })
        link(matches, from[0], id, 'home')
        link(matches, from[1], id, 'away')
      }
    }

    prevRoundIds = roundIds
    seedRoundIds = seedRoundIds ?? roundIds
  }

  return matches
}

/** ME: 3 rundy knockout z 8 seedów (4 grupy → top2). MŚ: 4 rundy z 16 seedów (8 grup → top2). */
const KNOCKOUT_ROUND_NAMES = {
  euro: ['quarterfinal', 'semifinal', 'final'],
  world: ['roundOf16', 'quarterfinal', 'semifinal', 'final'],
}

/**
 * `calendar.nationalTournamentFinals.dates` to płaska lista 7 dat co 3-4 dni (patrz
 * seasonCalendar.js: buildTournamentFinalsWeeks) — indeksy: 0-2 kolejki grupowe,
 * 3 runda 1/8 (tylko MŚ), 4 ćwierćfinał, 5 półfinał, 6 finał. ME pomija indeks 3, więc
 * jej ćwierćfinał wypada 3 dni po ostatniej kolejce grupowej zamiast 7 — ten sam odstęp
 * co wszędzie indziej w drabince, bez "osieroconej" luki po pominiętej rundzie 1/8.
 */
function groupStageDates(kind, calendar) {
  const dates = calendar.nationalTournamentFinals.dates
  return dates.slice(0, 3)
}

function knockoutDates(kind, calendar) {
  const dates = calendar.nationalTournamentFinals.dates
  // Obie wersje zaczynają pierwszą rundę knockout na indeksie 3 (3 dni po ostatniej
  // kolejce grupowej na indeksie 2) — ME ma o rundę mniej, więc zajmuje indeksy 3-5
  // (ćwierćfinał/półfinał/finał), a nie 4-6, inaczej jej ćwierćfinał wypadłby 7 dni po
  // grupach zamiast 3-4.
  return kind === 'world' ? dates.slice(3, 7) : dates.slice(3, 6)
}

/**
 * Zakłada fazę finałową: grupy 4-drużynowe (snake draft wg coefficientu — reużywa
 * buildQualifyingGroups z Fazy 3), terminarz grupowy, puste tabele/staty. Drabinka
 * pucharowa NIE jest jeszcze budowana — dopiero po fazie grupowej (patrz
 * `resolveFinalsGroupStage`/`buildFinalsKnockout`), bo zależy od wyników grup.
 */
export function createTournamentFinals(career, { kind, year, participantCountryIds, calendar }) {
  const nt = ensureCareerNationalTeams(career)
  const groupCount = participantCountryIds.length / 4
  const groups = buildQualifyingGroups(career, participantCountryIds, { groupCount })
  const dates = groupStageDates(kind, calendar)

  const fixtures = []
  const standings = {}
  for (const group of groups) {
    const teamIds = group.countryIds.map(pseudoTeamId)
    const rounds = generateRoundRobinSchedule(teamIds)
    for (const pairings of rounds) {
      for (const p of pairings) {
        fixtures.push({
          id: `${kind}${year}-${group.id}-r${p.round}-${p.homeTeamId}-vs-${p.awayTeamId}`,
          round: p.round,
          groupId: group.id,
          homeTeamId: p.homeTeamId,
          awayTeamId: p.awayTeamId,
          date: dates[p.round - 1] ?? dates[dates.length - 1] ?? null,
          status: 'scheduled',
        })
      }
    }
    standings[group.id] = createNationalTournamentStandings(teamIds)
  }

  const finals = {
    kind,
    year,
    phase: 'groupStage',
    groups,
    fixtures,
    standings,
    playerStats: createNationalTournamentPlayerStats(),
    // Zapamiętane w chwili tworzenia (a nie dociągane od nowa przy buildFinalsKnockout) —
    // wtedy grupy dopiero się rozstrzygają, mogą minąć dni/tygodnie do fazy pucharowej, a
    // wołający (pętla kariery) nie musi trzymać przy sobie oryginalnego obiektu `calendar`.
    knockoutDates: knockoutDates(kind, calendar),
    knockout: null,
    championCountryId: null,
  }
  nt.finals = finals
  return finals
}

function resolveOneFixture(fixture, world, career, seasonYear, standings, playerStats) {
  const homeCountryId = countryIdFromPseudoTeamId(fixture.homeTeamId)
  const awayCountryId = countryIdFromPseudoTeamId(fixture.awayTeamId)
  const homeSquad = selectNationalSquad(world, career, homeCountryId, { seasonYear })
  const awaySquad = selectNationalSquad(world, career, awayCountryId, { seasonYear })
  const teamA = nationalTeamPseudoTeam(homeSquad)
  const teamB = nationalTeamPseudoTeam(awaySquad)
  const record = simulateNationalTeamMatch(teamA, teamB, hashSeed(fixture.id))

  fixture.status = 'completed'
  fixture.homeScore = record.homeScore
  fixture.awayScore = record.awayScore
  fixture.winnerTeamId = record.winner

  if (standings) recordNationalTeamMatch(standings, playerStats, record, teamA, teamB)
  return record
}

/** Rozstrzyga zaległe mecze fazy grupowej <= `dateIso` — ten sam wzorzec co
 * `advanceQualifyingGroupStage` (Faza 3) / `advanceOtherLeagueToDate`. */
export function advanceFinalsGroupStage(finals, world, career, dateIso) {
  if (!finals || finals.phase !== 'groupStage') return finals
  const due = finals.fixtures.filter((f) => f.status !== 'completed' && f.date && f.date <= dateIso)
  for (const fixture of due) {
    resolveOneFixture(fixture, world, career, finals.year, finals.standings[fixture.groupId], finals.playerStats)
  }
  return finals
}

export function isFinalsGroupStageComplete(finals) {
  return !!finals && finals.fixtures.every((f) => f.status === 'completed')
}

/**
 * Zamyka fazę grupową: wg każdej grupy ranguje zwycięzcę i wicelidera (tabela: wygrane,
 * potem bilans), zwraca listę seedów do drabinki — WSZYSCY zwycięzcy grup przed WSZYSTKIMI
 * wicederami (silniejszy seeding), każdy blok posortowany wewnętrznie wg wyniku w grupie.
 * Nie tworzy jeszcze drabinki (patrz `buildFinalsKnockout`) — samo wyliczenie seedów.
 */
export function resolveFinalsGroupStage(finals) {
  const winners = []
  const runnersUp = []
  for (const group of finals.groups) {
    const table = nationalTournamentStandingsTable(finals.standings[group.id])
    if (table[0]) winners.push(table[0])
    if (table[1]) runnersUp.push(table[1])
  }
  const byResult = (a, b) => b.wins - a.wins || b.diff - a.diff
  winners.sort(byResult)
  runnersUp.sort(byResult)
  const seedTeamIds = [...winners, ...runnersUp].map((row) => row.teamId)
  finals.phase = 'knockout'
  return seedTeamIds
}

/** Buduje drabinkę pucharową z seedów wyliczonych przez `resolveFinalsGroupStage` — kształt
 * kompatybilny z `advanceCupAfterMatch` (cupBracket.js), więc propagacja zwycięzców między
 * rundami korzysta z tej samej, w pełni generycznej funkcji co Puchar Piramidy. */
export function buildFinalsKnockout(finals, seedTeamIds) {
  const roundNames = KNOCKOUT_ROUND_NAMES[finals.kind] ?? KNOCKOUT_ROUND_NAMES.euro
  const dates = finals.knockoutDates
  const matches = buildKnockoutBracket(seedTeamIds, {
    idPrefix: `${finals.kind}${finals.year}`,
    roundNames,
    dates,
  })
  finals.knockout = {
    status: 'active',
    seeds: seedTeamIds,
    matches,
    championTeamId: null,
  }
  return finals.knockout
}

/** Mecze drabinki gotowe do gry (oba sloty wypełnione) w danym dniu — analogiczne do
 * `cupFixturesOnDate`/`pyramidCupFixturesOnDate`. */
function finalsKnockoutFixturesOnDate(knockout, dateIso) {
  const day = String(dateIso).slice(0, 10)
  return knockout.matches.filter(
    (m) => m.date === day && m.status === 'scheduled' && m.homeTeamId && m.awayTeamId,
  )
}

/**
 * Rozstrzyga zaległe mecze drabinki <= `dateIso`: nasz silnik (Faza 2) rozstrzyga mecz,
 * `advanceCupAfterMatch` (reużyte 1:1 z cupBracket.js) propaguje zwycięzcę do kolejnej
 * rundy i — po finale — ustawia `knockout.championTeamId`/`status: 'complete'`.
 *
 * Świadomie NIE wołamy tu `resolveOneFixture` — `advanceCupAfterMatch` samo ustawia
 * `match.status`/`homeScore`/`awayScore`/`winnerTeamId` PO znalezieniu meczu po id w
 * `cup.matches` (i na starcie ignoruje mecze już `status === 'completed'`), więc
 * pre-mutowanie tych pól przed jego wywołaniem uciszyłoby propagację do kolejnej rundy.
 */
export function advanceFinalsKnockout(finals, world, career, dateIso) {
  if (!finals?.knockout) return finals
  const knockout = finals.knockout
  const day = String(dateIso).slice(0, 10)
  const due = knockout.matches.filter(
    (m) => m.status !== 'completed' && m.date && m.date <= day && m.homeTeamId && m.awayTeamId,
  )
  for (const match of due) {
    const homeCountryId = countryIdFromPseudoTeamId(match.homeTeamId)
    const awayCountryId = countryIdFromPseudoTeamId(match.awayTeamId)
    const homeSquad = selectNationalSquad(world, career, homeCountryId, { seasonYear: finals.year })
    const awaySquad = selectNationalSquad(world, career, awayCountryId, { seasonYear: finals.year })
    const teamA = nationalTeamPseudoTeam(homeSquad)
    const teamB = nationalTeamPseudoTeam(awaySquad)
    const record = simulateNationalTeamMatch(teamA, teamB, hashSeed(match.id))
    // Staty zawodników owszem (playerStats globalne dla całego turnieju); tabela — nie,
    // drabinka knockout nie ma "grupy" do policzenia (throwaway obiekt, jak w barażach
    // kwalifikacyjnych z Fazy 3 — applyGameToStandings cicho pomija nieznane klucze).
    recordNationalTeamMatch({}, finals.playerStats, record, teamA, teamB)
    advanceCupAfterMatch(knockout, {
      fixtureId: match.id,
      winner: record.winner,
      homeScore: record.homeScore,
      awayScore: record.awayScore,
    })
  }
  if (knockout.status === 'complete') {
    finals.phase = 'complete'
    finals.championCountryId = countryIdFromPseudoTeamId(knockout.championTeamId)
  }
  return finals
}

export { finalsKnockoutFixturesOnDate }
