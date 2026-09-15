import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import { UiLangProvider, useUiLang } from '../src/ui/UiLangContext.jsx'
import TrainingView from '../src/components/TrainingView.jsx'
import ClubManagementPanel from '../src/components/ClubManagementPanel.jsx'
import { createWorldFromTemplate } from '../src/career/worldState.js'
import { ensureClubManagement } from '../src/career/clubManagement.js'
import { processTeamTrainingsForDate } from '../src/career/teamTraining.js'
import { applyDailyDevelopment } from '../src/career/playerDevelopment.js'
import { trainingDateAdd } from '../src/career/trainingSchedule.js'
const team=Object.values(createWorldFromTemplate(2025).teamsById)[0]
team.teamTraining={weekly:[],oneOff:[],sessionLog:[],tacticsFamiliarity:38}
ensureClubManagement(team,2025);team.managementDate='2025-09-01';team.finances.cash=100000000
const league={currentDate:'2025-09-01',teamsById:{[team.id]:team},fixtures:[{id:'qa-match',date:'2025-09-06',homeTeamId:team.id,awayTeamId:'opponent'}],simSeedBase:1,playerTeamId:team.id,playerStats:{}}
function Preview(){const [,render]=useState(0),{lang,setLang}=useUiLang();const update=()=>render(n=>n+1);return <main className="mx-auto max-w-7xl space-y-6 p-4"><h1>Training / staff QA</h1><p>Isolated sample — no career save is written.</p><div className="flex gap-3"><button onClick={()=>setLang(lang==='en'?'pl':'en')}>PL / EN</button><button onClick={()=>{processTeamTrainingsForDate(league,league.currentDate);applyDailyDevelopment(league,{date:league.currentDate});league.currentDate=trainingDateAdd(league.currentDate,1);team.managementDate=league.currentDate;update()}}>Next day</button></div><TrainingView team={team} league={league} onChange={update}/><ClubManagementPanel team={team} seasonYear={2025} lang={lang} onChange={update}/></main>}
const root=createRoot(document.getElementById('root'))
root.render(<UiLangProvider><Preview/></UiLangProvider>)
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount())
