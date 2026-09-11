import { traitLabel } from '../models/playerTraits.js'
export function playingStyleMessages(changes, playerTeamId) {
 return changes.filter(c=>c.teamId===playerTeamId).map(c=>{
  const label=traitLabel(c.style,'pl'),en=traitLabel(c.style,'en')
  const body=c.kind==='acquired'?`${c.playerName} wykształcił styl „${label}” dzięki regularnej praktyce meczowej.`
   :c.kind==='weakening'?`${c.playerName} coraz rzadziej korzysta ze stylu „${label}”. Jeśli ten sposób gry się utrzyma, może się od niego odzwyczaić.`
   :c.kind==='lost'?`${c.playerName} odzwyczaił się od stylu „${label}” po długim okresie gry w inny sposób.`
   :`${c.playerName} zmienił sposób gry: „${c.replaced.map(id=>traitLabel(id,'pl')).join(', ')}” zastąpił stylem „${label}”.`
  const bodyEn=c.kind==='acquired'?`${c.playerName} developed ${en} through regular match practice.`
   :c.kind==='weakening'?`${c.playerName} uses ${en} less often and may eventually lose this habit.`
   :c.kind==='lost'?`${c.playerName} lost ${en} after a prolonged change in playing behavior.`
   :`${c.playerName} replaced ${c.replaced.map(id=>traitLabel(id,'en')).join(', ')} with ${en}.`
  return {id:`playing-style:${c.date}:${c.playerId}:${c.kind}:${c.style}`,type:'training_report',
   title:'Zmiana stylu gry',titleEn:'Playing style development',body,bodyEn,date:c.date,
   createdAt:`${c.date}T12:00:00.000Z`,read:false,payload:{kind:'playing_style',playerId:c.playerId}}
 })
}
