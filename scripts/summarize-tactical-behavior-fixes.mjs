import assert from 'node:assert/strict'
import fs from 'node:fs'
const dir='artifacts/tactical-behavior-fixes-final'
const after=JSON.parse(fs.readFileSync(`${dir}/matches.json`))
assert.equal(after.length,14,'Wait for the seven formations × two seeds comparison to finish')
const keys=new Set(after.map(r=>`${r.style}:${r.seed}`))
const before=JSON.parse(fs.readFileSync('artifacts/match-behavior-2026-09-27/matches.json'))
  .filter(r=>keys.has(`${r.style}:${r.seed}`))
assert.equal(before.length,14)
const aggregate=rows=>{
  const out={}
  for(const r of rows){
    const a=out[r.style]??={attempts:0,successes:0,filler:0,primary:0,secondary:0,nonFinite:0}
    for(const key of ['attempts','successes','nonFinite'])a[key]+=r[key]
    a.filler+=r.receiveRoles.filler_cutter??0
    a.primary+=r.receiveRoles.primary_cutter??0
    a.secondary+=r.receiveRoles.secondary_cutter??0
  }
  return out
}
const old=aggregate(before),current=aggregate(after)
for(const row of Object.values(current)){
  assert.equal(row.nonFinite,0)
  assert.ok(row.filler < row.primary && row.filler < row.secondary,'Filler should not dominate this fixture')
}
fs.writeFileSync(`${dir}/comparison.json`,JSON.stringify({before:old,after:current},null,2))
const pct=(a,b)=>(100*a/b).toFixed(1)
const total=after.reduce((n,r)=>n+r.attempts,0)
const lines=['# Poprawki ról i zachowania meczowego', '',
  'Wprowadzone po audycie z 27.09.2026:', '',
  '- Podrole są rozwiązywane dla faktycznej siódemki i formacji na początku punktu. Pełny oraz uproszczony silnik, rejestr modyfikatorów i decyzje korzystają z tej samej mapy. Zapisane preferencje zawodnika nie są nadpisywane.',
  '- Nieaktywny cutter może być odbiorcą bardzo dobrego podania. Filler potrzebuje przed wysokim stallem co najmniej 6,5 m separacji i okna 78/100; dostaje karę 22 punktów do oceny i zauważalności. Przy stallu 8–9 wymagania i kara maleją. Ograniczenia inicjowania cutów oraz liczba miejsc pozostają bez zmian.',
  '- Handlery mają osobne cele boczne, dostosowane do horizontal/motion/zone. Przy dysku u cuttera trzeci handler daje centralną opcję z tyłu. Rozdzielone są także cele resetu w dwuhandlerowych ustawieniach i oferty po pullu.',
  '- W uproszczonym silniku presja stallu zmienia wagi bazowe; modyfikatory formacji, dyrektyw i instrukcji nakładają się przed wspólnym losowaniem również przy stallu 5–9 i błędnej decyzji zawodnika.', '',
  `Końcowa próba: 14 meczów do 5 punktów, 7 formacji × seedy 92701/92702, ${total} prób rzutu. Porównanie z tymi samymi seedami poprzedniego audytu. Składy demonstracyjne, obrona person, bez adaptacji AI i rotacji. Udziały odnoszą się do odbiorców zdarzeń rzutowych i nie są normalizowane przez czas gry.`, '',
  '| Formacja | Filler przed % | Filler po % | Primary cutter po % | Secondary cutter po % | Rzuty po |',
  '|---|---:|---:|---:|---:|---:|']
for(const [style,r]of Object.entries(current))lines.push(`| ${style} | ${pct(old[style].filler,old[style].attempts)} | ${pct(r.filler,r.attempts)} | ${pct(r.primary,r.attempts)} | ${pct(r.secondary,r.attempts)} | ${r.attempts} |`)
lines.push('', 'W każdej badanej formacji filler pozostał mniej częstym odbiorcą niż primary i secondary cutter. To kontrola regresji na niewielkiej próbie, nie gwarancja rozkładu dla wszystkich składów i sytuacji.', '',
  'Walidacja: `scripts/test-tactical-behavior-fixes.mjs` sprawdza zgodność ról, instrukcje D-Line po zmianie posiadania, zachowanie zapisu, cele handlerów przy liniach bocznych i po pullu, rzeczywistą decyzję podania do wolnego fillera oraz przeciwne instrukcje przy stallu 1/5/6/7/8/9. `scripts/test-full-no-replay.mjs` sprawdza zgodność wyników z zapisem animacji i bez niego, także przy silnym wietrze. Kompilacja produkcyjna i kontrola zmienionych modułów przeszły. Historyczny skrypt `probe-behavior-gaps-2026-09-27.mjs` opisuje reprodukcje sprzed poprawek; aktualnym testem regresji jest `test-tactical-behavior-fixes.mjs`.')
fs.writeFileSync('docs/tactical-behavior-fixes-2026-09-27.md',lines.join('\n')+'\n')
console.log(JSON.stringify({matches:after.length,attempts:total,current},null,2))
