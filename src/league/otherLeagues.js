/**
 * Generyczny silnik "innej ligi" — dowolna rozgrywka równoległa do ligi gracza, w
 * której gracz nie zarządza żadną drużyną, ale mecze i tak mają rozgrywać się TYM
 * SAMYM silnikiem co liga gracza (realne składy, realny box score, realne staty
 * zawodników), dzień po dniu, w tym samym kalendarzu.
 *
 * Zaprojektowane tak, żeby nie wiedzieć nic o Lidze Europejskiej / piramidzie — to
 * jest baza, którą w przyszłości można użyć też dla lig krajowych czy innych
 * równoległych rozgrywek. Cała wiedza o tym SKĄD biorą się drużyny (piramida EUCS,
 * kraj, cokolwiek) leży po stronie wywołującego (patrz careerModel.js).
 *
 * Sztuczka: `simulateFixtureMatch` / `applyMatchResultToLeague` (leagueEngine.js) są
 * już w pełni generyczne — działają na dowolnym obiekcie kształtu `league` (potrzebują
 * tylko `teamsById`, `standings`, `playerStats`, `matchHistory`, `simSeedBase`,
 * `fixtures`). `OtherLeague` ma dokładnie ten kształt, więc może być karmiony do tych
 * samych funkcji bez żadnego duplikowania logiki meczowej/finansowej/reputacyjnej.
 */
import { generateDoubleRoundRobinSchedule, flattenSchedule, shuffledTeamOrder } from './schedule.js'
import { createStandings } from './standings.js'
import { createLeaguePlayerStats } from './leagueStats.js'
import { assignDatesToLeagueFixtures } from './seasonCalendar.js'
import { simulateFixtureMatch, applyMatchResultToLeague } from './leagueEngine.js'

/**
 * @param {{ id: string, label: string, teamIds: string[], calendar: object, simSeedBase: number }} options
 */
export function createOtherLeague({ id, label, teamIds, calendar, simSeedBase }) {
  // Losowy terminarz per-kariera — patrz notatka w schedule.js (bez tasowania metoda
  // koła daje identyczny terminarz za każdym razem).
  const scheduleRounds = generateDoubleRoundRobinSchedule(shuffledTeamOrder(teamIds, simSeedBase))
  const fixtures = assignDatesToLeagueFixtures(flattenSchedule(scheduleRounds), calendar)
  return {
    id,
    label,
    teamIds,
    fixtures,
    standings: createStandings(teamIds),
    playerStats: createLeaguePlayerStats(),
    matchHistory: [],
    totalRounds: scheduleRounds.length,
    simSeedBase,
    status: 'active',
    // `teamsById` jest podpinane dopiero przy pierwszym `advanceOtherLeagueToDate`
    // (patrz notatka tam) — nie zapisujemy referencji tutaj, żeby uniknąć nieaktualnej
    // referencji po `structuredClone`/przeładowaniu save'a.
  }
}

/**
 * Rozstrzyga wszystkie zaległe mecze tej ligi z datą <= `dateIso` (zwykle dokładnie
 * dzisiejszą — łapanie zaległości tylko na wypadek przeskoczenia dnia). Mutuje
 * `otherLeague`. Wymaga, żeby WSZYSTKIE drużyny tej ligi miały już pełny skład w
 * `teamsById` (patrz `materializeFullPyramidTeams` w shadowLeague.js) — inaczej
 * `simulateFixtureMatch` rzuci błąd braku drużyny, dokładnie jak dla ligi gracza.
 * @param {object} otherLeague
 * @param {Record<string, object>} teamsById — zwykle `world.teamsById` (współdzielone)
 * @param {string} dateIso
 */
export function advanceOtherLeagueToDate(otherLeague, teamsById, dateIso) {
  if (!otherLeague || !teamsById || !dateIso) return otherLeague
  // Podpięcie referencji świata — jak `bindLeagueToWorld` dla ligi gracza. Robione przy
  // każdym wywołaniu (tanie, zawsze aktualne) zamiast raz przy tworzeniu, żeby przeżyć
  // `structuredClone`/przeładowanie zapisu bez ręcznej re-hydratacji.
  otherLeague.teamsById = teamsById

  const due = otherLeague.fixtures.filter(
    (f) => f.status !== 'completed' && f.date && f.date <= dateIso && f.homeTeamId && f.awayTeamId,
  )
  for (const fixture of due) {
    const record = simulateFixtureMatch(otherLeague, fixture)
    applyMatchResultToLeague(otherLeague, record)
  }

  if (otherLeague.fixtures.length && otherLeague.fixtures.every((f) => f.status === 'completed')) {
    otherLeague.status = 'complete'
  }
  return otherLeague
}

/** Czy wszystkie mecze tej ligi zostały rozegrane. */
export function isOtherLeagueComplete(otherLeague) {
  return otherLeague?.status === 'complete'
}
