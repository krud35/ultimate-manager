/**
 * Pomocnicze funkcje tożsamości/materializacji drużyn piramidy Ligi Europejskiej,
 * którymi gracz aktualnie NIE zarządza. Od kiedy WSZYSTKIE mecze tła (liga + puchar)
 * przechodzą przez ten sam silnik co liga gracza (patrz otherLeagues.js), te drużyny
 * dostają pełny skład + finanse + obiekty raz, na starcie sezonu — bez tego zawodnicy
 * spoza poziomu gracza nie mieliby żadnych realnych statystyk.
 */
import { eucsTeamsForTier, buildEucsLeagueTemplate, eucsTeamById, eucsTeamTier } from '../data/eucsLeagueTeams.js'
import { ensureTeamFinances } from '../career/transfers/clubFinances.js'
import { ensureTeamFacilities } from '../career/clubFacilities.js'

/** Drużyny poziomu (tożsamość + siła = winPct realny, 0–100) — do list wyboru/etykiet. */
export function shadowTeamsForTier(tier) {
  return eucsTeamsForTier(tier).map((t) => ({
    id: t.id,
    name: t.name,
    tier,
    strength: t.winPct ?? 50,
  }))
}

/** Tożsamości z listy id drużyn (np. po awansach/spadkach na nowy sezon). */
export function shadowTeamsFromIds(ids, tier) {
  return ids.map((id) => ({
    id,
    name: eucsTeamById(id)?.name ?? id,
    tier,
    strength: eucsTeamStrengthSafe(id),
  }))
}

function eucsTeamStrengthSafe(id) {
  return eucsTeamById(id) ? (eucsTeamById(id).winPct ?? 50) : 50
}

/**
 * Generuje pełny skład dla JEDNEJ drużyny (deterministyczne po id + seed) — bez
 * finansów/obiektów (patrz `materializeFullPyramidTeams` dla pełnego bootstrapu).
 */
export function ensureShadowTeamRoster(shadowTeam, seed) {
  const template = buildEucsLeagueTemplate({
    tier: shadowTeam.tier,
    teamIds: [shadowTeam.id],
    seed,
  })
  const team = template.teams[0] ?? null
  if (team) team.tacticalIdentity = template.tacticalByTeamId?.[team.id] ?? null
  return team
}

/**
 * Materializuje w `world.teamsById` KAŻDĄ z podanych 48 drużyn piramidy, która jeszcze
 * nie ma pełnego składu (skład + finanse + obiekty) — idempotentne, bezpieczne wołać
 * wielokrotnie. Reszta bootstrapu (statystyki/rozwój/kontrakty zawodników, profile AI,
 * wyceny transferowe) leży po stronie wywołującego — patrz `initWorldPlayerStats` itd.
 * w careerModel.js, wołane generycznie na całym `world` po materializacji.
 * @returns {boolean} true jeśli cokolwiek dodano
 */
export function materializeFullPyramidTeams(world, teamIds, seed) {
  if (!world?.teamsById) return false
  let added = false
  for (const id of teamIds) {
    if (world.teamsById[id]) continue
    const tier = eucsTeamTier(id)
    if (!tier) continue
    const team = ensureShadowTeamRoster({ id, tier }, seed)
    if (!team) continue
    ensureTeamFinances(team, { seed, force: true })
    ensureTeamFacilities(team, { seed })
    world.teamsById[id] = team
    if (Array.isArray(world.teamIds) && !world.teamIds.includes(id)) {
      world.teamIds.push(id)
    }
    added = true
  }
  return added
}
