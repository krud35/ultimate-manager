import fs from 'node:fs'

const dir=process.env.OUTPUT_DIR || 'artifacts/primary-handler-dominate-final'
const rows=JSON.parse(fs.readFileSync(`${dir}/paired-matches.json`,'utf8'))
const samePlayers=(a,b)=>JSON.stringify(Object.keys(a).sort())===JSON.stringify(Object.keys(b).sort())
const valid=rows.filter(r=>r.dominate.phWithOrder===r.dominate.phThrows
  && samePlayers(r.baseline.phThrowers,r.dominate.phThrowers))
const excluded=rows.filter(r=>!valid.includes(r)).map(r=>({style:r.style,seed:r.seed}))
const sum=(group,key)=>group.reduce((a,r)=>{
  for(const k of ['attempts','phThrows','phTargets','phCompletions','phThrowsCompleted']) a[k]=(a[k]??0)+r[key][k]
  return a
},{})
const percent=(n,d)=>(100*n/d).toFixed(1)
const summary=group=>{
  const baseline=sum(group,'baseline'),dominate=sum(group,'dominate')
  return {pairs:group.length,baseline,dominate,
    throws:[baseline,dominate].map(r=>percent(r.phThrows,r.attempts)),
    targets:[baseline,dominate].map(r=>percent(r.phTargets,r.attempts)),
    involved:[baseline,dominate].map(r=>percent(r.phThrows+r.phTargets,r.attempts))}
}
const total=summary(valid)
const styles=[...new Set(rows.map(r=>r.style))].map(style=>({style,...summary(valid.filter(r=>r.style===style))}))
const cutters=['before','after'].map(phase=>{
  const r=JSON.parse(fs.readFileSync(`artifacts/primary-handler-dominate/cutter-${phase}.json`,'utf8'))
  const totals=r.reduce((a,v)=>{
    for(const k of ['throws','earlyCutActions','offBallSamples','cutSamples','fillerTargets']) a[k]=(a[k]??0)+v[k]
    return a
  },{})
  return {phase,matches:r.length,...totals,earlyCutPct:percent(totals.earlyCutActions,totals.throws),
    cuttingSamplePct:percent(totals.cutSamples,totals.offBallSamples),fillerPct:percent(totals.fillerTargets,totals.throws)}
})
const output={completedPairs:rows.length,excluded,total,styles,cutters}
fs.writeFileSync(`${dir}/summary.json`,JSON.stringify(output,null,2))
console.log(JSON.stringify(output,null,2))
const table=styles.map(r=>`| ${r.style} | ${r.pairs} | ${r.throws.join(' → ')} | ${r.targets.join(' → ')} |`).join('\n')
const report=`# Primary handler, „dominuj grę” i ciągłość cutów — 27.09.2026

Pomiar po poprawkach ciągłości cutów. ${rows.length} par meczów do 5 punktów, te same składy demo i seedy 92701–92704, siedem formacji, obrona person, bez wiatru, rotacji i adaptacji AI. W wariancie rozkazu tylko primary handler gospodarzy w O-Line i D-Line ma „dominuj grę”; przeciwnik pozostaje bez rozkazu. Liczymy wyłącznie próby podań gospodarzy. Losowania rozchodzą się po zmianie decyzji, więc nie jest to porównanie identycznych akcji. To mała próba diagnostyczna, bez oceny istotności statystycznej.

Wykluczone pary (inna obsada primary handlera albo nie wszystkie jego rzuty z rozkazem): ${JSON.stringify(excluded)}. Kontuzje są zapisane w surowych wynikach; filtry zapobiegają przypisywaniu efektu rozkazu zastępcy bez instrukcji.

Łącznie ${total.baseline.attempts} prób bazowych i ${total.dominate.attempts} z rozkazem. Udział PH jako rzucającego: ${total.throws.join(' → ')}%; jako celu podania: ${total.targets.join(' → ')}%; jako jednej ze stron podania: ${total.involved.join(' → ')}%. Cel podania obejmuje też próby nieudane; to nie jest udział w czasie posiadania dysku.

| Formacja | Pary | PH rzuca, % bez → rozkaz | Podania do PH, % bez → rozkaz |
|---|---:|---:|---:|
${table}

## Co robi rozkaz

Rola primary handlera daje mnożnik 1,45 przy wyborze początkowego rzucającego oraz premię 16 punktów do oceny odbiorcy w promieniu 18 m. Nie oznacza to 45% więcej wszystkich rzutów: po chwycie rzuca posiadacz dysku. Rozkaz nominalnie mnoży skłonność do cutu przez 2,2, obniża próg jego rozpoczęcia o 28, rozszerza skan o 3 m, dodaje jedną dostrzeganą opcję, mnoży wagę wyboru rzucającego przez 1,3 i obniża próg akceptacji podania o 4. Wykonanie instrukcji osłabia te wartości zależnie od zawodnika. Dla badanego PH mnożnik cutu wynosił około 2,03, a wagi rzucającego 1,26. Rozkaz nie zwiększa bezpośrednio oceny podań kolegów do tego handlera, więc nie gwarantuje dominującego udziału w rozegraniu.

## Poprawka cutterów

- Continuation cutter może otrzymać wolne miejsce od początku okna po chwycie (0–700 ms), zamiast dopiero po 1200 ms. W tym oknie ma pierwszeństwo przed oczekującymi cutterami; trwające cuty zachowują pierwszeństwo.
- Stan trwającego lub rozpoczynanego cutu zachowuje rezerwację przy następnym podaniu, nawet gdy nie ma już chwilowej flagi isActive. Zmiana posiadacza dysku nie zeruje biegu z powodu bramki czasowej roli.
- Reorganizacja po chwycie nie przerywa rozpoczynanego cutu tylko dlatego, że zawodnik znajduje się w korytarzu podania. Limit miejsc, odpoczynek po czyszczeniu oraz późny start nowych cutów fillera pozostają zachowane.

Sześć meczów kontrolnych do 3 punktów (vertical/horizontal/motion, po dwa seedy): akcje z rozpoczynanym lub trwającym cutem w pierwszych 700 ms: ${cutters[0].earlyCutPct} → ${cutters[1].earlyCutPct}%. Udział próbek ruchu off-ball cutterów w tych stanach: ${cutters[0].cuttingSamplePct} → ${cutters[1].cuttingSamplePct}%. Podania do fillerów: ${cutters[0].fillerPct} → ${cutters[1].fillerPct}%. Porównanie zawiera ${cutters[0].throws} i ${cutters[1].throws} prób podania obu zespołów. Nie jest to pomiar liczby nowych cutów ani gwarancja poprawy każdej akcji.

Walidacja: test-cutter-offer-continuity, test-tactical-behavior-fixes oraz test-full-no-replay. Kontrola ESLint zmienionych modułów i kompilacja produkcyjna.
`
fs.writeFileSync('docs/primary-handler-and-cutter-offers-2026-09-27.md',report)
