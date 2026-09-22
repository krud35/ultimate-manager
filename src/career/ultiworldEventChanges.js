/** Local copies for Ultiworld effects; fixtures and match history can be very large. */
export function createUltiworldEventChanges(world, league) {
  let nextWorld = world
  let nextLeague = league
  const teams = new Map()

  return {
    get world() { return nextWorld },
    get league() { return nextLeague },
    team(team) {
      if (!team) return team
      if (teams.has(team.id)) return teams.get(team.id)
      // Finance, injury and loyalty helpers also mutate nested fields. Keep the
      // affected club independent without copying every other club in the world.
      const copy = structuredClone(team)
      teams.set(team.id, copy)
      const teamsById = { ...nextWorld.teamsById, [team.id]: copy }
      nextWorld = { ...nextWorld, teamsById }
      const previousTeams = nextLeague.teamsById
      nextLeague = { ...nextLeague, teamsById }
      if (nextLeague.otherLeagues) {
        nextLeague.otherLeagues = nextLeague.otherLeagues.map(other => {
          if (!other.teamsById?.[team.id]) return other
          return {
            ...other,
            teamsById: other.teamsById === previousTeams
              ? teamsById
              : { ...other.teamsById, [team.id]: copy },
          }
        })
      }
      return copy
    },
    fixture(fixture) {
      if (!fixture) return fixture
      const copy = { ...fixture }
      nextLeague = {
        ...nextLeague,
        fixtures: nextLeague.fixtures.map(item => item === fixture ? copy : item),
      }
      return copy
    },
  }
}
