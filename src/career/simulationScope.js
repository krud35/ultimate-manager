import { DOMESTIC_COUNTRIES, normalizeWorldConfig } from '../data/domesticLeagues.js'

export function syncSimulationScope(world, league = null) {
  if(world.worldConfig?.simulationModel!=='focused')return
  const config=world.worldConfig
  for(const team of Object.values(world.teamsById)) {
    const mode=config.leagues[team.domesticLeagueId]??'background'
    team.backgroundSimulation=mode==='background'
    // 'off' remains the business-access guard. The league itself is still simulated.
    team.simulationMode=team.backgroundSimulation?'off':mode
  }
  if(league)for(const comp of [league,...(league.otherLeagues??[])]) {
    comp.mode=config.leagues[comp.id]??'background'
    comp.focusedSimulation=true
    comp.mainCountryId=config.mainCountryId
  }
}
export function focusManagerLeague(world, teamId) {
  if(world.worldConfig?.simulationModel!=='focused')return
  const team=world.teamsById[teamId]
  const group=DOMESTIC_COUNTRIES.find(c=>c.leagues.some(l=>l.id===team?.domesticLeagueId))
  if(!group)return
  const config=world.worldConfig
  const previous=config.mainCountryId
  const extra=config.additionalCountryIds.filter(id=>id!==group.id)
  if(previous!==group.id&&!extra.includes(previous))extra.push(previous)
  world.worldConfig=normalizeWorldConfig({...config,mainCountryId:group.id,additionalCountryIds:extra,depths:{...config.depths,[group.id]:Math.max(config.depths[group.id]??1,team.tier)}})
  syncSimulationScope(world)
}
export function updateCupAttention(league,date) {
  if(!league?.focusedSimulation)return
  const active=new Set()
  for(const edition of league.internationalClubCups?.editions??[]) {
    if(['complete','unavailable'].includes(edition.phase))continue
    for(const f of edition.fixtures.filter(f=>f.status!=='completed')) {
      if(Date.parse(f.date)-Date.parse(date)>7*86400000)continue
      active.add(f.homeTeamId);active.add(f.awayTeamId)
    }
  }
  for(const team of Object.values(league.teamsById??{}))team.detailedCupAttention=active.has(team.id)
}
export function applyPendingSimulationScope(world,playerTeamId) {
  if(world.worldConfig?.simulationModel!=='focused'||!world.pendingSimulationConfig)return false
  world.worldConfig=normalizeWorldConfig({...world.pendingSimulationConfig,mainCountryId:world.worldConfig.mainCountryId})
  delete world.pendingSimulationConfig
  focusManagerLeague(world,playerTeamId)
  syncSimulationScope(world)
  return true
}
