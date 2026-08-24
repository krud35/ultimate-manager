/**
 * Faza 5 planu kadr narodowych: sprzężenie zwrotne coefficientu. Po zakończeniu fazy
 * finałowej (Faza 4) i po zamknięciu kwalifikacji bez awansu (Faza 3) każdy uczestniczący
 * kraj dostaje tłumioną zmianę `countryStrength` (patrz `updateCountryStrength` w
 * nationalTeams.js) — jak realny ranking UEFA/FIFA, nie skok. To domyka pętlę: lepsze
 * wyniki → wyższy coefficient → lepszy siew i mocniejsi dogenerowani zawodnicy następnym
 * razem (patrz `rollFillerOvrBand`/`computeWorldCupContinentSlots`).
 */
import { updateCountryStrength } from './nationalTeams.js'
import { nationalTournamentStandingsTable } from './nationalTeamMatches.js'
import { countryIdFromPseudoTeamId } from './nationalTeamQualifying.js'

/** Delta wg najdalszej rundy drabinki, w której kraj odpadł (mistrz liczony osobno). */
const TOURNAMENT_PLACEMENT_DELTA = {
  final: 4,
  semifinal: 2,
  quarterfinal: 1,
  roundOf16: 1,
}
const TOURNAMENT_CHAMPION_DELTA = 6
/** Odpadnięcie w grupie (nigdy nie dostał seeda do drabinki) — mały bonus wg wygranych
 * w grupie, żeby "zero wygranych" i "prawie awansował" nie kosztowały tyle samo. */
const GROUP_STAGE_EXIT_PER_WIN = 0.15
const GROUP_STAGE_EXIT_CAP = 0.5

/**
 * Nalicza coefficient po zakończonej fazie finałowej — mistrz, finalista, półfinaliści,
 * ćwierćfinaliści/1-8-finaliści i wyeliminowani w grupie dostają osobne delty. Wołane raz,
 * dopiero gdy `finals.phase === 'complete'` (patrz `advanceFinalsKnockout`). Zwraca
 * `{ countryId: delta }` zastosowanych zmian — do zbudowania wiadomości do skrzynki.
 */
export function applyTournamentResultToCountryStrength(career, finals) {
  if (!finals?.knockout || finals.phase !== 'complete') return {}
  // Zabezpieczenie przed podwójnym naliczeniem — wołający (przyszłe spięcie z pętlą
  // dzień-po-dniu) może trafić na `phase === 'complete'` więcej niż raz zanim przetworzy
  // wynik i przejdzie dalej.
  if (finals.coefficientApplied) return {}
  finals.coefficientApplied = true
  const deltas = {}

  for (const match of finals.knockout.matches) {
    if (match.status !== 'completed') continue
    const homeCountryId = countryIdFromPseudoTeamId(match.homeTeamId)
    const awayCountryId = countryIdFromPseudoTeamId(match.awayTeamId)
    const loserCountryId =
      match.winnerTeamId === match.homeTeamId ? awayCountryId : homeCountryId
    deltas[loserCountryId] = TOURNAMENT_PLACEMENT_DELTA[match.round] ?? 0
  }
  if (finals.championCountryId) {
    deltas[finals.championCountryId] = TOURNAMENT_CHAMPION_DELTA
  }

  const knockoutCountryIds = new Set((finals.knockout.seeds ?? []).map(countryIdFromPseudoTeamId))
  for (const group of finals.groups) {
    const table = nationalTournamentStandingsTable(finals.standings[group.id])
    for (const row of table) {
      const countryId = countryIdFromPseudoTeamId(row.teamId)
      if (knockoutCountryIds.has(countryId)) continue
      deltas[countryId] = Math.min(GROUP_STAGE_EXIT_CAP, row.wins * GROUP_STAGE_EXIT_PER_WIN)
    }
  }

  for (const [countryId, delta] of Object.entries(deltas)) {
    updateCountryStrength(career, countryId, delta)
  }
  return deltas
}

/** Kara za nieawansowanie z kwalifikacji — łagodniejsza dla tych, którzy dotarli do
 * baraży i tam odpadli (byli blisko), surowsza dla tych, którzy odpadli daleko w grupie. */
export function applyQualifyingFailureToCountryStrength(career, qualifying) {
  if (!qualifying || qualifying.phase !== 'complete') return {}
  if (qualifying.coefficientApplied) return {}
  qualifying.coefficientApplied = true
  const qualifiedSet = new Set(qualifying.qualifiedCountryIds ?? [])
  const playoffPool = new Set([
    ...(qualifying.playoffCandidateTeamIds ?? []),
    ...(qualifying.playoffByeTeamIds ?? []),
  ])
  const deltas = {}

  for (const group of qualifying.groups) {
    const table = nationalTournamentStandingsTable(qualifying.standings[group.id])
    table.forEach((row, position) => {
      const countryId = countryIdFromPseudoTeamId(row.teamId)
      if (qualifiedSet.has(countryId)) return
      const reachedPlayoff = playoffPool.has(row.teamId)
      deltas[countryId] = reachedPlayoff ? -1 : Math.max(-3, -1 - position * 0.4)
    })
  }

  for (const [countryId, delta] of Object.entries(deltas)) {
    updateCountryStrength(career, countryId, delta)
  }
  return deltas
}
