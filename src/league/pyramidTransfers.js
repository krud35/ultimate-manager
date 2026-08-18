/**
 * Rynek transferowy Ligi Europejskiej obejmuje WSZYSTKIE 48 klubów, nie tylko poziom
 * gracza. Drużyny z dwóch pozostałych (cieniowych) poziomów dostają pełny skład +
 * finanse dopiero przy pierwszym wejściu w zakładkę Transfery — od tego momentu są
 * zwykłymi drużynami w `world` (ten sam mechanizm co reszta ligi gracza), więc cały
 * istniejący silnik transferowy (oferty, negocjacje, aktywność AI) działa bez zmian.
 */
import { ensureShadowTeamRoster } from './shadowLeague.js'
import { ensureTeamFinances } from '../career/transfers/clubFinances.js'

/**
 * Materializuje w `career.world` każdą drużynę cieniową, która jeszcze nie ma
 * pełnego składu. Idempotentne — bezpieczne wołać wielokrotnie. Mutuje `career.world`
 * i zwraca `true` jeśli cokolwiek dodano (żeby wywołujący wiedział, czy zapisać stan).
 */
export function materializeAllShadowTeams(career) {
  const world = career?.world
  const otherTiers = career?.pyramid?.otherTiers
  if (!world?.teamsById || !otherTiers) return false

  const seed = career.league?.simSeedBase ?? 0
  let changed = false

  for (const shadowLeague of Object.values(otherTiers)) {
    for (const id of shadowLeague.teamIds ?? []) {
      if (world.teamsById[id]) continue
      const shadowTeam = shadowLeague.teamsById?.[id]
      if (!shadowTeam) continue
      const team = ensureShadowTeamRoster(shadowTeam, seed)
      if (!team) continue
      ensureTeamFinances(team, { seed, force: true })
      world.teamsById[id] = team
      if (!world.teamIds.includes(id)) world.teamIds.push(id)
      changed = true
    }
  }

  return changed
}
