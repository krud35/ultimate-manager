import { AI_COACH_ARCHETYPES } from '../matchEngine/aiCoachProfile.js'
import { generateStaffName } from './staffNames.js'
import { standingsTable } from '../league/standings.js'

const clamp = (n, min = 1, max = 20) => Math.max(min, Math.min(max, n))
const hash = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
export const MANAGER_ATTRIBUTES = {
  tactics: { pl: 'Taktyka', en: 'Tactics' }, adaptability: { pl: 'Adaptacja', en: 'Adaptability' },
  coaching: { pl: 'Trening', en: 'Coaching' }, youthDevelopment: { pl: 'Rozwój młodzieży', en: 'Youth development' },
  peopleManagement: { pl: 'Zarządzanie ludźmi', en: 'People management' }, motivation: { pl: 'Motywowanie', en: 'Motivation' },
  judgement: { pl: 'Ocena zawodników', en: 'Judging players' }, workloadPlanning: { pl: 'Planowanie obciążeń', en: 'Workload planning' },
}
export const MANAGER_PLAYING_BACKGROUNDS = [
  { id: 'none', pl: 'Bez kariery zawodniczej', en: 'No playing career' },
  { id: 'amateur', pl: 'Gra amatorska', en: 'Amateur player' },
  { id: 'elite', pl: 'Gra na wysokim poziomie', en: 'Elite player' },
]
const option = (id, pl, en, effects) => ({ id, pl, en, effects })
export const MANAGER_BACKGROUND_QUESTIONS = [
  { id: 'discovery', pl: 'Jak ultimate pojawiło się w Twoim życiu?', en: 'How did ultimate enter your life?', options: [
    option('friends', 'Znajomi zabrali mnie na trening', 'Friends invited me to practice', { peopleManagement: 2, motivation: 1 }),
    option('film', 'Zaciekawiły mnie nagrania i taktyka', 'Match film and tactics caught my interest', { tactics: 2, judgement: 1 }),
    option('sport', 'Przyszedłem z innej dyscypliny', 'I came from another sport', { adaptability: 2, workloadPlanning: 1 }),
  ] },
  { id: 'tournament', pl: 'Po ostatnim meczu turnieju zwykle…', en: 'After the last tournament match, I usually…', options: [
    option('rookies', 'Pomagałem debiutantom odnaleźć się w grupie', 'Helped newcomers settle in', { youthDevelopment: 2, peopleManagement: 1 }),
    option('notes', 'Zapisywałem pomysły i obserwacje', 'Wrote down ideas and observations', { judgement: 2, tactics: 1 }),
    option('logistics', 'Pilnowałem transportu, jedzenia i odpoczynku', 'Organised travel, food and rest', { workloadPlanning: 2, peopleManagement: 1 }),
  ] },
  { id: 'defeat', pl: 'Drużyna przegrała bolesny finał. Co robisz następnego dnia?', en: 'The team lost a painful final. What do you do the next day?', options: [
    option('listen', 'Rozmawiam z każdym i słucham', 'Talk to everyone and listen', { peopleManagement: 2, motivation: 1 }),
    option('analyse', 'Szukam powtarzających się błędów', 'Look for recurring mistakes', { tactics: 2, judgement: 1 }),
    option('experiment', 'Wymyślam ćwiczenie rozwiązujące problem', 'Invent a drill to solve the problem', { coaching: 2, adaptability: 1 }),
  ] },
  { id: 'break', pl: 'Przez rok nie możesz regularnie uczestniczyć w meczach. Jak zostajesz przy sporcie?', en: 'For a year you cannot attend matches regularly. How do you stay involved?', options: [
    option('youth', 'Prowadzę zajęcia dla początkujących', 'Run beginners sessions', { youthDevelopment: 2, coaching: 1 }),
    option('organise', 'Pomagam organizować lokalne rozgrywki', 'Help organise local events', { peopleManagement: 2, workloadPlanning: 1 }),
    option('learn', 'Poznaję metody treningu innych dyscyplin', 'Study training in other sports', { adaptability: 2, coaching: 1 }),
  ] },
  { id: 'memory', pl: 'Co inni najczęściej wspominają z pracy z Tobą?', en: 'What do others remember about working with you?', options: [
    option('calm', 'Spokój w trudnych momentach', 'Calm under pressure', { peopleManagement: 1, workloadPlanning: 2 }),
    option('energy', 'Energię, która udzielała się grupie', 'Energy that lifted the group', { motivation: 2, youthDevelopment: 1 }),
    option('ideas', 'Nietypowe pomysły i eksperymenty', 'Unusual ideas and experiments', { adaptability: 2, tactics: 1 }),
  ] },
  { id: 'satisfaction', pl: 'Który drobny moment daje Ci najwięcej satysfakcji?', en: 'Which small moment gives you the most satisfaction?', options: [
    option('junior', 'Debiutant wykonuje coś, czego długo się uczył', 'A newcomer masters a difficult skill', { youthDevelopment: 2, coaching: 1 }),
    option('read', 'Wcześniej dostrzegam zamiar przeciwnika', 'Anticipating an opponent correctly', { judgement: 2, tactics: 1 }),
    option('comeback', 'Zespół odzyskuje wiarę po słabym początku', 'The team regains belief after a poor start', { motivation: 2, peopleManagement: 1 }),
  ] },
  { id: 'preparation', pl: 'Masz wolny wieczór przed ważnym weekendem. Na co go przeznaczasz?', en: 'You have a free evening before an important weekend. How do you use it?', options: [
    option('recovery', 'Dopasowuję odpoczynek do potrzeb każdej osoby', 'Tailor rest to individual needs', { workloadPlanning: 2, judgement: 1 }),
    option('drill', 'Upraszczam instrukcje do ćwiczeń', 'Make drill instructions clearer', { coaching: 2, youthDevelopment: 1 }),
    option('talk', 'Przygotowuję rozmowę, która zjednoczy drużynę', 'Prepare a talk to bring the team together', { motivation: 2, adaptability: 1 }),
  ] },
]

/** Pure and deterministic: calling this for a wizard preview never creates world people. */
export function createManagerProfile(input = {}) {
  const background = input.background ?? {}
  const rawPlaying = input.formerPlayer ?? background.formerPlayer ?? 'amateur'
  const formerPlayer = rawPlaying === true ? 'amateur' : rawPlaying === false ? 'none' : MANAGER_PLAYING_BACKGROUNDS.some(x => x.id === rawPlaying) ? rawPlaying : 'amateur'
  const answers = input.answers ?? background.answers ?? {}
  const attributes = Object.fromEntries(Object.keys(MANAGER_ATTRIBUTES).map(key => [key, 7]))
  const boosts = { none: { coaching: 2, youthDevelopment: 2, judgement: 1 }, amateur: { peopleManagement: 2, workloadPlanning: 2, adaptability: 1 }, elite: { tactics: 2, motivation: 2, judgement: 1 } }
  for (const [key, n] of Object.entries(boosts[formerPlayer])) attributes[key] += n
  const validAnswers = {}
  for (const question of MANAGER_BACKGROUND_QUESTIONS) {
    const selected = question.options.find(o => o.id === answers[question.id])
    if (!selected) continue
    validAnswers[question.id] = selected.id
    for (const [key, n] of Object.entries(selected.effects)) attributes[key] = clamp(attributes[key] + n)
  }
  const firstName = String(input.firstName ?? 'Alex').trim().slice(0,60) || 'Alex'
  const lastName = String(input.lastName ?? '').trim().slice(0,80)
  const nationality = String(input.nationality ?? 'pl')
  const styleId = AI_COACH_ARCHETYPES.some(p => p.id === input.styleId) ? input.styleId : 'balanced_pro'
  return { id: input.id ?? 'manager-human', name: `${firstName} ${lastName}`.trim(), firstName, lastName, nationality,
    age: clamp(Math.round(Number(input.age) || 35), 18, 80), attributes, background: { formerPlayer, answers: validAnswers },
    styleId, preferences: { youth: attributes.youthDevelopment >= 12, rotation: attributes.workloadPlanning >= 12, risk: ['huck_gambler','creative_iso'].includes(styleId) ? 'high' : 'balanced' },
    reputation: formerPlayer === 'elite' ? 48 : formerPlayer === 'amateur' ? 35 : 28,
    knownCountries: [nationality], history: [], stats: { matches: 0, wins: 0, losses: 0, draws: 0, bySeason: {}, trophies: [], promotions: 0, relegations: 0, academyGraduates: 0 }, isHuman: true,
  }
}

function generatedManager(team, id, excluded = []) {
  const seed = hash(id), name = generateStaffName(id, team.country ?? team.countryId, excluded)
  const manager = createManagerProfile({ id, firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' '), nationality: team.countryId ?? team.country ?? 'pl', age: 30 + seed % 31, styleId: (id === `manager-${team.id}` ? team.aiCoachProfile?.id : null) ?? AI_COACH_ARCHETYPES[seed % AI_COACH_ARCHETYPES.length].id })
  manager.isHuman = false
  manager.reputation = clamp(Number(team.reputation?.value ?? team.reputation) || 40, 5, 90)
  manager.attributes = Object.fromEntries(Object.keys(MANAGER_ATTRIBUTES).map(key => [key, clamp(6 + hash(`${id}:${key}`) % 10 + Math.floor(manager.reputation / 30))]))
  return manager
}

export function ensureClubPreferences(team) {
  const seed = hash(team.id)
  team.boardPreferences ??= { styleId: AI_COACH_ARCHETYPES[seed % AI_COACH_ARCHETYPES.length].id, youth: ['development','promotion'].includes(team.clubStrategy), finance: team.clubStrategy === 'financial', patience: 40 + seed % 41 }
  team.fanPreferences ??= { styleId: AI_COACH_ARCHETYPES[hash(`${team.id}:fans`) % AI_COACH_ARCHETYPES.length].id, youth: seed % 3 !== 0, localIdentity: seed % 2 === 0, effort: true }
  return { board: team.boardPreferences, fans: team.fanPreferences }
}
export function managerClubFit(manager, team) {
  const { board, fans } = ensureClubPreferences(team)
  const score = prefs => clamp(55 + (prefs.styleId === manager.styleId ? 20 : 0) + (prefs.youth && manager.attributes.youthDevelopment >= 12 ? 15 : 0) + (prefs.finance && manager.attributes.judgement >= 12 ? 10 : 0), 0, 100)
  return { board: score(board), fans: score(fans) }
}

export function appointClubManager(world, team, manager, date, reason = 'appointed') {
  const previous = world.managersById?.[team.managerId]
  if (previous && previous.id !== manager.id && previous.teamId === team.id) {
    previous.history.push({ teamId: team.id, teamName: team.name, from: previous.joinedDate, to: date, reason: 'replaced' })
    previous.teamId = null
  }
  world.managersById ??= {}
  world.managersById[manager.id] = manager
  manager.teamId = team.id; manager.joinedDate = date; manager.appointmentReason = reason
  team.managerId = manager.id; team.manager = manager
  const archetype = AI_COACH_ARCHETYPES.find(p => p.id === manager.styleId) ?? AI_COACH_ARCHETYPES[0]
  team.aiCoachProfile = manager.isHuman ? null : { ...structuredClone(archetype), adaptability: manager.attributes.adaptability / 20 }
  team.managerTransition = { from: date, familiarity: previous ? 30 : 75 }
  if (previous && previous.id !== manager.id && previous.styleId !== manager.styleId && team.teamTraining) {
    team.teamTraining.tacticsFamiliarity = Math.max(15, (team.teamTraining.tacticsFamiliarity ?? 38) - 12)
  }
  return manager
}

export function ensureWorldManagers(world, { managerProfile, playerTeamId, seasonYear = 2026, currentDate = `${seasonYear}-08-01` } = {}) {
  if (!world?.teamsById) return world
  world.managersById ??= {}
  world.managerCandidates ??= []
  for (const team of Object.values(world.teamsById)) {
    ensureClubPreferences(team)
    let manager = world.managersById[team.managerId] ?? team.manager
    if (!manager) manager = generatedManager(team, `manager-${team.id}`, Object.values(world.managersById).map(m => m.name))
    if (!world.managersById[manager.id]) appointClubManager(world, team, manager, currentDate)
    else { team.managerId = manager.id; team.manager = world.managersById[manager.id] }
    manager.lastAgeYear ??= seasonYear
    if (seasonYear > manager.lastAgeYear) { manager.age += seasonYear - manager.lastAgeYear; manager.lastAgeYear = seasonYear }
  }
  if (managerProfile) {
    world.managersById[managerProfile.id] ??= managerProfile
    const canonical = world.managersById[managerProfile.id], team = world.teamsById[playerTeamId]
    if (team && team.managerId !== canonical.id) appointClubManager(world, team, canonical, currentDate)
    canonical.lastAgeYear ??= seasonYear
    if (seasonYear > canonical.lastAgeYear) { canonical.age += seasonYear - canonical.lastAgeYear; canonical.lastAgeYear = seasonYear }
  }
  return world
}

/** This is also the integration point for cup engines; event IDs remain unique across seasons. */
export function recordManagerMatch(career, record, competitionId = 'league') {
  if (!record || !Number.isFinite(record.homeScore) || !Number.isFinite(record.awayScore)) return
  const world = career.world
  world.managerRecordedMatches ??= {}
  // Fixture IDs contain the teams/round or cup edition. A league's container ID changes
  // when a human moves jobs in legacy EUCS, so it must not be part of the receipt identity.
  const stableCompetition = record.competitionId ?? record.competition ?? (competitionId === 'cup' || competitionId.endsWith(':cup') ? 'cup' : 'league')
  const key = `${career.seasonYear}:${stableCompetition}:${record.fixtureId ?? `${record.date}:${record.homeTeamId}:${record.awayTeamId}`}`
  if (world.managerRecordedMatches[key]) return
  world.managerRecordedMatches[key] = true
  for (const [teamId, goals, conceded] of [[record.homeTeamId,record.homeScore,record.awayScore],[record.awayTeamId,record.awayScore,record.homeScore]]) {
    const team = world.teamsById[teamId], manager = world.managersById?.[team?.managerId]
    if (!manager || (record.date && manager.joinedDate && record.date < manager.joinedDate)) continue
    const stats = manager.stats, won = goals > conceded, lost = goals < conceded
    const seasonKey = `${career.seasonYear}:${competitionId}`
    stats.bySeason[seasonKey] ??= { seasonYear: career.seasonYear, competitionId, matches: 0, wins: 0, losses: 0, draws: 0 }
    for (const row of [stats, stats.bySeason[seasonKey]]) { row.matches++; row.wins += Number(won); row.losses += Number(lost); row.draws += Number(!won && !lost) }
    manager.reputation = clamp(manager.reputation + (won ? 0.8 : lost ? -0.5 : 0), 5, 95)
  }
}
export function recordManagerResults(career) {
  const competitions=[career.league,...(career.league?.otherLeagues ?? [])].filter(Boolean)
  for (const league of competitions) {
    for (const match of league?.matchHistory ?? []) recordManagerMatch(career, match, match.competitionId ?? (match.competition === 'cup' ? `${league.id ?? 'main'}:cup` : league.id ?? 'league'))
    if (career.competition === 'domestic') {
      const cup = league?.cup, final = cup?.matches?.find(f => f.round === 'final' && f.status === 'completed')
      if (cup?.championTeamId && final) recordManagerAchievement(career,cup.championTeamId,{ id:`domestic-cup-${cup.countryId??league.countryId??league.id}-${career.seasonYear}`,type:'trophy',title:cup.name??`${cup.countryId??league.countryId??league.id} Cup`,competitionId:cup.id,date:final.date })
      const fixtures=(league?.fixtures??[]).filter(f => !f.competition || f.competition==='league')
      if (fixtures.length && fixtures.every(f=>f.status==='completed')) {
        const champion=standingsTable(league.standings??{})[0]?.teamId
        const date=fixtures.map(f=>f.date).filter(Boolean).sort().at(-1)
        if(champion)recordManagerAchievement(career,champion,{id:`domestic-league-${league.id}-${career.seasonYear}`,type:'trophy',title:league.label??league.id,competitionId:league.id,date})
      }
    }
  }
  if(career.competition==='domestic')for(const country of new Set(competitions.map(l=>l.countryId))){
    const levels=competitions.filter(l=>l.countryId===country).sort((a,b)=>a.tier-b.tier)
    for(let i=0;i<levels.length-1;i++){
      const upper=levels[i],lower=levels[i+1]
      const leagueFixtures=l=>(l.fixtures??[]).filter(f=>!f.competition||f.competition==='league')
      if(![upper,lower].every(l=>leagueFixtures(l).length&&leagueFixtures(l).every(f=>f.status==='completed')))continue
      const count=Math.min(2,Math.floor(Math.min(upper.teamIds.length,lower.teamIds.length)/4))
      if(!count)continue
      for(const [source,target,type,rows] of [[upper,lower,'relegations',standingsTable(upper.standings).slice(-count)],[lower,upper,'promotions',standingsTable(lower.standings).slice(0,count)]]){
        const date=leagueFixtures(source).map(f=>f.date).filter(Boolean).sort().at(-1)
        for(const row of rows)recordManagerAchievement(career,row.teamId,{id:`domestic-${type}-${row.teamId}-${career.seasonYear}`,type,competitionId:target.id,date})
      }
    }
  }
  for (const team of Object.values(career.world?.teamsById ?? {})) {
    for (const trophy of team.trophies ?? []) {
      if (trophy.seasonYear !== career.seasonYear) continue
      recordManagerAchievement(career, team.id, { id: trophy.id, type: 'trophy', title: trophy.name ?? trophy.title, competitionId: trophy.competitionId,date:trophy.date })
    }
  }
  for (const season of career.world?.domesticHistory ?? []) for (const league of season.leagues ?? []) {
    for (const [kind,teamId] of [['league',league.championTeamId],['cup',league.cupChampionTeamId]]) {
      if (!teamId) continue
      recordManagerAchievement(career,teamId,{id:`domestic-${kind}-${kind==='cup'?(league.countryId??league.id):league.id}-${season.year}`,type:'trophy',title:`${league.id} ${kind}`,competitionId:league.id,seasonYear:season.year,date:`${season.year+1}-05-31`})
    }
  }
  for (const move of career.world?.domesticMovements ?? []) recordManagerAchievement(career,move.teamId,{id:`domestic-${move.type}-${move.teamId}-${move.year}`,type:move.type,competitionId:move.leagueId,seasonYear:move.year,date:`${move.year+1}-05-31`})
}
export function recordManagerAchievement(career, teamId, { id, type, title, competitionId, seasonYear = career.seasonYear, date }) {
  const world=career.world
  const key = `${seasonYear}:${id}`
  world.managerAchievementRecipients ??= {}
  const receiptKey=`${key}:${teamId}`
  if(world.managerAchievementRecipients[receiptKey])return
  // Migrate receipts of saves that already recorded the achievement on its owner.
  const previous=Object.values(world.managersById??{}).find(m=>m.achievementIds?.includes(key))
  if(previous){world.managerAchievementRecipients[receiptKey]=previous.id;return}
  let manager = world.managersById?.[world.teamsById[teamId]?.managerId]
  if(date && (!manager || date<manager.joinedDate))manager=Object.values(world.managersById??{}).find(m=>(m.history??[]).some(h=>h.teamId===teamId&&h.from<=date&&h.to>=date))
  if (!manager) return
  manager.achievementIds ??= []
  world.managerAchievementRecipients[receiptKey]=manager.id
  manager.achievementIds.push(key)
  if (type === 'trophy') manager.stats.trophies.push({ id, title, competitionId, teamId, seasonYear })
  else if (['promotions','relegations','academyGraduates'].includes(type)) manager.stats[type]++
}

export function processWorldManagers(career) {
  const world = career.world, date = career.league?.currentDate
  if (!world || !date) return
  ensureWorldManagers(world, { managerProfile: career.managerProfile, playerTeamId: career.playerTeamId, seasonYear: career.seasonYear, currentDate: date })
  recordManagerResults(career)
  const month = date.slice(0,7)
  if (world.managerReviewMonth === month) return
  world.managerReviewMonth = month
  const staffAppointments = new Map(Object.values(world.teamsById).flatMap(t => Object.values(t.staffMembers ?? {}).filter(Boolean).map(p => [p.id,t.id])))
  for (const candidate of world.staffCandidates ?? []) candidate.hiredTeamId = staffAppointments.get(candidate.id) ?? candidate.hiredTeamId ?? null
  for (const team of Object.values(world.teamsById)) {
    const manager = world.managersById[team.managerId]
    if (team.managerTransition) team.managerTransition.familiarity = Math.min(100, team.managerTransition.familiarity + 10)
    const fit = managerClubFit(manager, team)
    team.managerFit = fit
    // Small cultural reactions complement the existing results/finance objective reviews.
    if (team.boardObjective) team.boardObjective.confidence = clamp(team.boardObjective.confidence + (fit.board >= 75 ? 1 : 0), 0, 100)
    if (team.fans && Number.isFinite(team.fans.mood)) team.fans.mood = clamp(team.fans.mood + (fit.fans >= 75 ? 0.5 : 0), 15, 99)
    const communication = (manager.attributes.peopleManagement + manager.attributes.motivation) / 2
    if (communication > 12) for (const player of team.players ?? []) {
      if (Number.isFinite(player.morale)) player.morale = clamp(player.morale + Math.min(1,(communication-12)/8),25,99)
    }
    if (team.id === career.playerTeamId || manager.isHuman) continue
    const league = [career.league,...(career.league.otherLeagues ?? [])].find(l => l.teamIds?.includes(team.id))
    const recent = (league?.matchHistory ?? []).filter(r => r.date >= manager.joinedDate && (r.homeTeamId === team.id || r.awayTeamId === team.id)).slice(-8)
    const losses = recent.filter(r => r.homeTeamId === team.id ? r.homeScore < r.awayScore : r.awayScore < r.homeScore).length
    const crisis = recent.length >= 6 && losses >= 6
    team.managerCrisisMonths = crisis ? (team.managerCrisisMonths ?? 0) + 1 : 0
    if (team.managerCrisisMonths < 2) continue
    const candidates = Object.values(world.managersById).filter(m => !m.isHuman && !m.teamId && m.id !== manager.id)
      .sort((a,b) => (managerClubFit(b,team).board+b.reputation)-(managerClubFit(a,team).board+a.reputation))
    const replacement = candidates[0] ?? generatedManager(team, `manager-${team.id}-${date}`)
    appointClubManager(world, team, replacement, date)
    team.managerCrisisMonths = 0
    if (team.boardObjective) team.boardObjective.confidence = 55
    career.inbox ??= []
    career.inbox.push({ id: `manager-change-${team.id}-${date}`, date, type: 'club_news', read: false, title: `${team.name}: nowy manager`, titleEn: `${team.name}: new manager`, body: `${replacement.name} zastępuje ${manager.name}.`, bodyEn: `${replacement.name} replaces ${manager.name}.`, payload: { kind: 'manager_career', teamId: team.id } })
  }
}

/** Preserve the person link; athletic ability is not converted directly into coaching ability. */
export function createPostPlayingCareer(world, player, team, date) {
  if (player.postPlayingCareer) return player.postPlayingCareer
  const traits = Array.isArray(player.traits) ? player.traits : []
  const seed = hash(`post-playing:${player.id}`), path = seed % 10 < 3 + Number(traits.includes('ambitious')) ? 'manager' : seed % 10 < 6 + Number(traits.includes('professional')) ? 'staff' : 'retired'
  player.postPlayingCareer = { path, personId: player.personId ?? player.id, date }
  if (path === 'retired') return player.postPlayingCareer
  const profile = generatedManager({ ...team, country: player.nationality ?? team.country }, `former-player-${player.id}`)
  profile.name = [player.firstName,player.lastName].filter(Boolean).join(' ') || player.name || profile.name
  profile.firstName = player.firstName; profile.lastName = player.lastName; profile.age = player.age
  profile.personId = player.personId ?? player.id; profile.formerPlayerId = player.id; profile.teamId = null
  profile.attributes = Object.fromEntries(Object.keys(MANAGER_ATTRIBUTES).map(key => [key, 5 + hash(`${player.id}:${key}`) % 9]))
  if (traits.includes('professional')) { profile.attributes.coaching += 2; profile.attributes.workloadPlanning += 2 }
  if (traits.includes('leader')) { profile.attributes.peopleManagement += 2; profile.attributes.motivation += 2 }
  profile.reputation = clamp((player.reputation?.value ?? 35) * 0.6, 10, 55)
  if (path === 'manager') { world.managersById ??= {}; world.managersById[profile.id] = profile; world.managerCandidates ??= []; world.managerCandidates.push(profile.id) }
  else {
    world.staffCandidates ??= []
    const role = ['assistantCoach','youthCoach','analyst'][seed % 3]
    const roleSkills = role === 'analyst' ? ['analysis','judgement','communication'] : role === 'youthCoach' ? ['coaching','development','communication'] : ['coaching','planning','communication']
    const candidate = { id: profile.id, personId: profile.personId, formerPlayerId: player.id, name: profile.name, nameGenerationVersion: 2, nationality: profile.nationality, age: player.age, role, level: 1, skills: Object.fromEntries(roleSkills.map((k,i) => [k, Object.values(profile.attributes)[i]])), specialty: 'structural', weeklyWage: 400, expiresOn: `${Number(date.slice(0,4))+1}-07-31`, availableFrom: date }
    world.staffCandidates.push(candidate)
    // An initial offer goes to the former club (one club only avoids duplicate appointments).
    const clubs = Object.values(world.teamsById ?? {}), destination = world.teamsById?.[team.id] ?? clubs[seed % Math.max(1,clubs.length)]
    if (destination) { destination.retiredStaffCandidates ??= []; destination.retiredStaffCandidates.push(candidate) }
  }
  return player.postPlayingCareer
}
