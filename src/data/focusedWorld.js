// Simulation scope is separate from club access: background leagues still exist in full.
export const focusedLimit = config => [config.mainCountryId,...(config.additionalCountryIds??[])].includes('fr') ? 3 : 4
export function focusedSelection(input, countries) {
  const ids=new Set(countries.map(c=>c.id))
  const mainCountryId=ids.has(input.mainCountryId)?input.mainCountryId:'pl'
  const additionalCountryIds=[...new Set(input.additionalCountryIds??[])].filter(id=>ids.has(id)&&id!==mainCountryId)
  const config={...input,simulationModel:'focused',mainCountryId,additionalCountryIds}
  config.additionalCountryIds=additionalCountryIds.slice(0,focusedLimit(config))
  const active=new Set([mainCountryId,...config.additionalCountryIds])
  config.depths={...input.depths}
  config.leagues={}
  for(const c of countries) {
    const levels=c.leagues.map(l=>l.tier)
    const depth=levels.includes(Number(config.depths[c.id]))?Number(config.depths[c.id]):Math.max(...levels)
    config.depths[c.id]=depth
    for(const l of c.leagues)config.leagues[l.id]=active.has(c.id)&&l.tier<=depth?'playable':'background'
  }
  return config
}
export function focusedRole(config,id) {
  return config.mainCountryId===id?'main':config.additionalCountryIds.includes(id)?'active':'background'
}
export function changeFocusedRole(config,id,role,countries) {
  let next={...config,additionalCountryIds:[...config.additionalCountryIds]}
  if(role==='main') {
    next.mainCountryId=id
    next.additionalCountryIds=next.additionalCountryIds.filter(c=>c!==id)
  } else {
    if(id===next.mainCountryId)return config
    next.additionalCountryIds=next.additionalCountryIds.filter(c=>c!==id)
    if(role==='active')next.additionalCountryIds.push(id)
  }
  if(next.additionalCountryIds.length>focusedLimit(next))return config
  return focusedSelection(next,countries)
}
