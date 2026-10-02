import assert from 'node:assert/strict'
import { unlinkSync } from 'node:fs'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const outfile = path.resolve('artifacts/career-edition-baseline/ui-bundle.mjs')
await build({ stdin: { contents: `
export {default as Training} from './src/components/StreamlinedTrainingView.jsx';
export {default as Roster} from './src/components/RosterView.jsx';
export {default as Saves} from './src/components/CareerSelectScreen.jsx';
export {default as Report} from './src/components/match/CoachReport.jsx';
export {default as Hub} from './src/components/LeagueHub.jsx';
export {default as Tactics} from './src/components/TacticsForm.jsx';
export {default as Recruitment} from './src/components/StreamlinedRecruitmentView.jsx';
export {default as Club} from './src/components/StreamlinedClubView.jsx';
export {default as Board} from './src/components/ClubBoardView.jsx';
export {default as Inbox} from './src/components/InboxView.jsx';
export {UiLangProvider} from './src/ui/UiLangContext.jsx';
export {createCareer} from './src/career/careerModel.js';
export {DOMESTIC_LEAGUES} from './src/data/domesticLeagues.js';
export {setDevelopmentProject} from './src/career/streamlinedTraining.js';
`, resolveDir: process.cwd() }, outfile, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react','react-dom','react/jsx-runtime'], loader: {'.css':'empty'} })
globalThis.localStorage = { data: {}, getItem(k) {return this.data[k]??null}, setItem(k,v) {this.data[k]=v}, removeItem(k) {delete this.data[k]} }
const {Training,Roster,Saves,Report,Hub,Tactics,Recruitment,Club,Board,Inbox,UiLangProvider,createCareer,DOMESTIC_LEAGUES,setDevelopmentProject} = await import(pathToFileURL(outfile).href)
const meta=[...DOMESTIC_LEAGUES].sort((a,b)=>a.teams.length-b.teams.length)[0]
const c=createCareer(0,{managerName:'QA',competition:'domestic',playerTeamId:meta.teams[0].id,gameplayEdition:'streamlined',worldConfig:{leagues:Object.fromEntries(DOMESTIC_LEAGUES.map(l=>[l.id,l.id===meta.id?'playable':'off'])),international:{nationals:false,europe:false,paucc:false,aoucc:false,wucc:false}}})
const t=c.world.teamsById[c.playerTeamId]
setDevelopmentProject(t,String(t.players[0].id),'physical')
const render=(Component,props)=>renderToStaticMarkup(React.createElement(UiLangProvider,null,React.createElement(Component,props)))
for(const lang of ['pl','en']) {
  localStorage.setItem('ufa-ui-lang',lang)
  const training=render(Training,{team:t,league:c.league,onChange:()=>{}})
  assert(training.includes(lang==='pl'?'Gotowość do gry':'Readiness'))
  assert(training.includes(lang==='pl'?'Dodaj zawodnika':'Add a player'))
  assert(!training.includes('NaN')); assert(!training.includes('undefined'))
  const roster=render(Roster,{teams:[t],focusTeamName:t.name,clubOnly:true,streamlined:true})
  assert(roster.includes(lang==='pl'?'Mocne strony':'Strengths'))
  const oldRoster=render(Roster,{teams:[t],focusTeamName:t.name,clubOnly:true})
  assert(!oldRoster.includes(lang==='pl'?'Mocne strony':'Strengths'))
  const saves=render(Saves,{slots:[c],lang})
  assert(saves.includes(lang==='pl'?'Uproszczona':'Streamlined'));assert(saves.includes(lang==='pl'?'Przywróć kopię':'Restore backup'))
  const report=render(Report,{result:{events:[]},side:'home',onReview:()=>{}})
  assert.equal((report.match(/<article/g)??[]).length,3)
  const hub=render(Hub,{career:c,league:c.league,onNavigate:()=>{},onPlayFixture:()=>{}})
  assert(hub.includes(lang==='pl'?'Odprawa zespołu':'Team briefing'))
  const tactics = render(Tactics, { tactics: c.homeTactics, roster: t.players, onTacticsChange: () => {} })
  assert(tactics.includes(lang === 'pl' ? 'Ryzyko podań' : 'Passing risk'))
  assert(!tactics.includes(lang === 'pl' ? 'Wymagana separacja' : 'Required separation'))
  for (const [Component, props, label] of [
    [Recruitment, { career: c, onCareerUpdate: () => {} }, lang === 'pl' ? 'Plan kadry' : 'Squad planning'],
    [Club, { career: c, onChange: () => {} }, lang === 'pl' ? 'Przygotowanie zespołu' : 'Team preparation'],
    [Club, { career: c, onChange: () => {}, section: 'staff' }, lang === 'pl' ? 'Trzy funkcje sztabu' : 'Three staff functions'],
    [Board, { career: c, onChange: () => {} }, lang === 'pl' ? 'Pozyskiwanie talentów' : 'Talent recruitment'],
    [Inbox, { career: c, onAction: () => {}, onCareerUpdate: () => {} }, lang === 'pl' ? 'Skrzynka' : 'Inbox'],
  ]) {
    const html = render(Component, props)
    assert(html.includes(label), label)
    assert(!html.includes('NaN'), `${label}: no NaN`)
    assert(!html.includes('undefined'), `${label}: no undefined`)
  }
  console.log(`PASS ${lang}: training, simple/classic rosters, saves, report and briefing render`)
}
unlinkSync(outfile)
