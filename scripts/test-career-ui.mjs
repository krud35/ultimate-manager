import { DOMESTIC_COUNTRIES, defaultWorldConfig, setCountryMode, setCountryDepth, normalizeWorldConfig } from '../src/data/domesticLeagues.js'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const outfile = path.resolve('artifacts/.career-ui-render-test.mjs')
await build({ stdin: { contents: `export {default as SimulationOptions} from './src/components/WorldSimulationOptions.jsx'; export {default as CountryChoice} from './src/components/WorldCountryChoice.jsx'; export {default as App} from './src/App.jsx'; export {default as Staff} from './src/components/StaffManagementPanel.jsx'; export {default as Finances} from './src/components/ClubFinancesView.jsx'; export {default as Menu} from './src/components/MainMenuScreen.jsx'; export {default as LeagueSetup} from './src/components/UfaCareerSetup.jsx'; export {default as Wizard} from './src/components/NewCareerScreen.jsx'; export {default as Leagues} from './src/components/DomesticLeaguesView.jsx'; export {default as Cup} from './src/components/CupView.jsx'; export {UiLangProvider} from './src/ui/UiLangContext.jsx'; export {MANAGER_BACKGROUND_QUESTIONS} from './src/career/managerProfiles.js';`, resolveDir: process.cwd() }, outfile, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'], loader: { '.css': 'empty' } })
try {
  const { SimulationOptions, CountryChoice, App, Staff, Finances, Menu, Wizard, LeagueSetup, Leagues, Cup, UiLangProvider, MANAGER_BACKGROUND_QUESTIONS } = await import(pathToFileURL(outfile).href)
  const render = (component, props) => renderToStaticMarkup(React.createElement(UiLangProvider, null, React.createElement(component, props)))
  const country=DOMESTIC_COUNTRIES.find(c=>c.id==='fr')
  const selected=setCountryDepth(setCountryMode(defaultWorldConfig(),'fr','playable'),'fr',2)
  for(const lang of ['pl','en']) {
    const html=render(CountryChoice,{country,config:selected,lang,onChange:()=>{}})
    assert.match(html, /value="2" selected=""/)
    assert.match(html, /Nationale 1 \+ Nationale 2/)
    assert.match(render(CountryChoice,{country,config:defaultWorldConfig(),lang,onChange:()=>{}}), /disabled=""/)
  }
  const focused=normalizeWorldConfig({simulationModel:'focused',mainCountryId:'fr',additionalCountryIds:['pl','au','gb']})
  const focusedHtml=render(CountryChoice,{country,config:focused,lang:'en',onChange:()=>{}})
  const disabledOptions=render(SimulationOptions,{config:{...focused,backgroundSimulation:false},lang:'en',onChange:()=>{}})
  assert.match(disabledOptions,/Game speed:/)
  assert.match(disabledOptions,/Recommended: at least medium/)
  assert.match(disabledOptions,/Simulate background leagues/)
  assert.match(disabledOptions,/Inactive leagues have no domestic matches/)
  assert.doesNotMatch(disabledOptions,/Estimated load/)
  assert.match(focusedHtml,/Main league/)
  assert.match(focusedHtml,/Additional active/)
  assert.match(focusedHtml,/Background/)
  const menu = render(Menu, { lang: 'pl', hasSaves: false })
  assert.match(menu, /Zacznij nową grę/)
  assert.match(menu, /disabled=""[^>]*>Wczytaj grę/)
  assert.match(render(App, {}), /Zacznij nową grę|Start a new game/)
  for (const lang of ['pl', 'en']) {
    const eucsSetup = render(LeagueSetup, { lang, slotIndex: 0, embedded: true, initialCompetition: 'eucs' })
    for (const tier of [1, 2, 3]) assert.ok(eucsSetup.includes('UltiLeague ' + tier))
    assert.match(eucsSetup, /Mooncatchers/)
    assert.doesNotMatch(eucsSetup, /Toronto Rush/)
    const ufaSetup = render(LeagueSetup, { lang, slotIndex: 0, embedded: true, initialCompetition: 'ufa' })
    assert.doesNotMatch(ufaSetup, /Mooncatchers/)
    const wizard = render(Wizard, { lang, slotIndex: 0 })
    assert.match(wizard, /given-name/)
    assert.match(wizard, /family-name/)
    for (const question of MANAGER_BACKGROUND_QUESTIONS) assert.ok(wizard.includes(`background-${question.id}`), question.id)
    assert.match(wizard, /\/20/)
  }
  const team = { id: 'club', name: 'Visible club' }
  const career = { playerTeamId: 'club', world: { teamsById: { club: team } }, worldConfig: { leagues: { 'pl-1': 'playable', 'us-1': 'off' } }, league: { domesticLeagueId: 'pl-1', name: 'Visible league', countryId: 'pl', standings: { club: { teamId: 'club', wins: 2, losses: 1, pointsFor: 42, pointsAgainst: 30 } }, otherLeagues: [{ domesticLeagueId: 'us-1', mode: 'off', name: 'Hidden league', standings: {} }] } }
  const leagues = render(Leagues, { career, lang: 'en' })
  assert.match(leagues, /Visible league/)
  assert.match(leagues, /Visible club/)
  assert.doesNotMatch(leagues, /Hidden league/)
  const playoffCareer = { ...career, league: { ...career.league, frenchPlayoffs: { status:'active', dates:['2027-05-12'], paths:[{name:'nord–ouest',matchIds:['fr-test']}],promotedTeamIds:[] }, fixtures:[{id:'fr-test',date:'2027-05-12',round:'quarterfinal',homeTeamId:'club',awayTeamId:'club',status:'completed',homeScore:15,awayScore:10}] } }
  assert.match(render(Leagues,{career:playoffCareer,lang:'en'}), /promotion playoffs/)
  assert.match(render(Leagues,{career:playoffCareer,lang:'pl'}), /baraże o awans/)
  const league = { ...career.league, teams: [team], currentDate: '2026-08-01', cup: { format: 'domestic', seeds: ['club'], matches: [{ id: 'r64', round: 'round-64', date: '2026-09-09', status: 'scheduled', homeTeamId: 'club', awayTeamId: 'club' }, { id: 'final', round: 'final', date: '2027-05-19', status: 'pending' }] } }
  const cup = renderToStaticMarkup(React.createElement(UiLangProvider, null, React.createElement(Cup, { league })))
  assert.match(cup, /Puchar krajowy|Domestic Cup/)
  assert.match(cup, /Runda 64|Round of 64/)
  assert.doesNotMatch(cup, /Puchar stycznia|January Cup|January tournament/)
  const club = { id: 'test-club', name: 'Test club', country: 'Poland', players: [] }
  const staff = render(Staff, { team: club, lang: 'en', currentDate: '2026-08-01' })
  assert.match(staff, /Club staff/)
  assert.match(staff, /Recruitment market/)
  const finances = render(Finances, { team: club, world: { teamsById: { [club.id]: club } }, seasonYear: 2026, lang: 'en', currentDate: '2026-08-01' })
  assert.match(finances, /Club finances/)
  assert.match(finances, /Player contracts/)
  console.log('Career UI render checks passed: App startup, menu, PL/EN quiz, attributes, domestic league visibility, domestic cup rounds, staff and finance contracts.')
} finally {
  await rm(outfile, { force: true })
}
