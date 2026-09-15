export const FRENCH_REGIONS = [
  { id:'fr-3-nord', name:'France Régionale Nord', coordinates:[49,2] },
  { id:'fr-3-ouest', name:'France Régionale Ouest', coordinates:[47,-2] },
  { id:'fr-3-est', name:'France Régionale Est', coordinates:[47,6] },
  { id:'fr-3-sud', name:'France Régionale Sud', coordinates:[44,3] },
]
// Minimum-cost assignment to 48 region slots (Hungarian algorithm).
// Existing memberships dominate the cost; distance chooses the boundary clubs to move.
export function allocateFrenchRegions(clubs, preserve = false) {
  if (clubs.length !== 48) throw new Error('French regional allocation requires 48 clubs')
  const sorted = [...clubs].sort((a,b)=>a.id.localeCompare(b.id))
  const slots = FRENCH_REGIONS.flatMap(r=>Array(12).fill(r)), n=slots.length
  const costs=sorted.map(t=>slots.map(r=>{
    const [lat,lon]=t.coordinates ?? [46.6,2.5]
    const distance=(lat-r.coordinates[0])**2+((lon-r.coordinates[1])*0.7)**2
    const moving=preserve && FRENCH_REGIONS.some(x=>x.id===t.domesticLeagueId) && t.domesticLeagueId!==r.id
    return distance+(moving?10000:0)
  }))
  const u=Array(n+1).fill(0),v=Array(n+1).fill(0),p=Array(n+1).fill(0),way=Array(n+1).fill(0)
  for(let i=1;i<=n;i++) {
    p[0]=i; let j0=0
    const min=Array(n+1).fill(Infinity),used=Array(n+1).fill(false)
    do {
      used[j0]=true; const i0=p[j0]; let delta=Infinity,j1=0
      for(let j=1;j<=n;j++) if(!used[j]) {
        const cur=costs[i0-1][j-1]-u[i0]-v[j]
        if(cur<min[j]) {min[j]=cur;way[j]=j0}
        if(min[j]<delta) {delta=min[j];j1=j}
      }
      for(let j=0;j<=n;j++) if(used[j]) {u[p[j]]+=delta;v[j]-=delta} else min[j]-=delta
      j0=j1
    } while(p[j0]!==0)
    do { const j1=way[j0];p[j0]=p[j1];j0=j1 } while(j0!==0)
  }
  return Object.fromEntries(slots.map((r,j)=>[sorted[p[j+1]-1].id,r.id]))
}
