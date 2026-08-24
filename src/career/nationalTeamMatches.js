/**
 * Faza 2 planu kadr narodowych: rozstrzyganie meczów. Kadra narodowa (patrz
 * `nationalTeams.js`, `selectNationalSquad`) NIE jest prawdziwym, trwałym klubem w
 * `world.teamsById` — nie ma finansów/kibiców/reputacji/tacticsFamiliarity — więc pełne
 * `applyMatchResultToLeague` się nie nadaje (odpala efekty klubowe, których kadra nie ma).
 *
 * Zamiast tego:
 * - mecz: `simulateAdHocMatch` z `leagueEngine.js` — dokładnie ten sam mechanizm, którego
 *   dziś używają baraże promocja/relegacja piramidy EUCS (`careerModel.js`). Wymaga tylko
 *   `{ id, name, players }` po stronie drużyny (patrz `teamForMatchEngine` — reszta pól jest
 *   opcjonalna i ma bezpieczne wartości domyślne, zweryfikowane: nieznany `id` dostaje
 *   domyślną tożsamość taktyczną z `teamTacticalIdentity`, brak `tacticsFamiliarity` spada
 *   do 38).
 * - tabela grupowa / staty turniejowe: te same generyczne cegiełki co liga klubowa
 *   (`createStandings`/`applyGameToStandings`/`mergeMatchBoxScore`), ale bez ŻADNYCH efektów
 *   klubowych (reputacja/kibice/finanse/taktyka) — i celowo bez zapisu do `player.stats`
 *   klubowych, żeby międzynarodowe capsy nie zanieczyszczały sezonu ligowego zawodnika.
 */
import { simulateAdHocMatch } from '../league/leagueEngine.js'
import { createStandings, applyGameToStandings, standingsTable } from '../league/standings.js'
import { createLeaguePlayerStats, mergeMatchBoxScore } from '../league/leagueStats.js'

/**
 * Zawija wynik `selectNationalSquad` w lekki obiekt "drużyny" wymagany przez silnik meczowy.
 * `teamForMatchEngine` (ufaLeagueTeams.js) i tak czyta tylko id/name/kolory/players — reszta
 * pól klubowych jest dla niego nieistotna.
 */
export function nationalTeamPseudoTeam(squad) {
  return {
    id: `nt-${squad.countryId}`,
    name: squad.countryName,
    players: squad.players,
  }
}

/**
 * Rozstrzyga pojedynczy mecz między dwiema kadrami — bezpośredni alias `simulateAdHocMatch`,
 * nazwany pod kątem czytelności w kodzie kwalifikacji/turnieju (Fazy 3-4).
 *
 * Próbowano `fastMode: false` (pełna pozycyjna symulacja 14 agentów zamiast statystycznego
 * skrótu) dla wyższej jakości meczów reprezentacji — zmierzony koszt: ~71s/mecz vs ~0.6s
 * w fastMode (~120x). Przy skali kwalifikacji/turnieju (dziesiątki-setki meczów) to
 * realnie godziny obliczeń na jedno okno reprezentacyjne, więc świadomie zostajemy przy
 * fastMode: true (jak wszystkie pozostałe mecze AI w grze).
 */
export function simulateNationalTeamMatch(teamA, teamB, seed) {
  return simulateAdHocMatch(teamA, teamB, seed)
}

/** Pusta tabela grupowa/turniejowa — alias `createStandings` dla krajów zamiast klubów. */
export function createNationalTournamentStandings(countryIds) {
  return createStandings(countryIds)
}

/** Posortowana tabela (wygrane, potem bilans punktów) — alias `standingsTable`. */
export function nationalTournamentStandingsTable(standings, countryNameById) {
  return standingsTable(standings, countryNameById)
}

export function createNationalTournamentPlayerStats() {
  return createLeaguePlayerStats()
}

/** Silnik nie zawsze wypełnia `boxScore[].teamId` (patrz analogiczny fallback w
 * `applyMatchResultToLeague`/`inferTeamSide`) — tu dociągamy stronę bezpośrednio z przekazanych
 * obiektów drużyn, bez potrzeby `league`/`world.teamsById` (kadry tam nie mieszkają). */
function inferNationalTeamSide(teamA, teamB, row) {
  if (teamA.players.some((p) => p.id === row.playerId)) return 'home'
  if (teamB.players.some((p) => p.id === row.playerId)) return 'away'
  return null
}

/**
 * Zapisuje wynik meczu reprezentacji do lekkiego stanu turnieju (mutuje `standings`/
 * `playerStats`) — odpowiednik `applyMatchResultToLeague`, ale świadomie BEZ efektów
 * klubowych (reputacja/kibice/finanse/tacticsFamiliarity) i bez dopisywania do `player.stats`
 * klubowych. `teamA`/`teamB` muszą być tymi samymi obiektami przekazanymi wcześniej do
 * `simulateNationalTeamMatch` (potrzebne tylko do `inferNationalTeamSide`).
 */
export function recordNationalTeamMatch(standings, playerStats, matchRecord, teamA, teamB) {
  applyGameToStandings(
    standings,
    matchRecord.homeTeamId,
    matchRecord.awayTeamId,
    matchRecord.homeScore,
    matchRecord.awayScore,
  )

  if (matchRecord.boxScore?.length) {
    const boxWithTeams = matchRecord.boxScore.map((row) => ({
      ...row,
      teamId: row.teamId ?? inferNationalTeamSide(teamA, teamB, row),
    }))
    mergeMatchBoxScore(playerStats, boxWithTeams, matchRecord.homeTeamId, matchRecord.awayTeamId)
  }

  return { standings, playerStats }
}
