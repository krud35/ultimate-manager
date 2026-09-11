/** Additional stories use the same effect resolver and delayed inbox queue as legacy events. */
import { getPlayerFullName } from '../data/mockPlayers.js'

const choosePlayer = (players, rng) => {
  const p = players[Math.floor(rng() * players.length)]
  return p ? { playerId: p.id, playerName: getPlayerFullName(p) } : null
}
const choice = (id, label, labelEn, hint, hintEn) => ({ id, label, labelEn, hint, hintEn })
const result = (effects, summary, summaryEn, followUp) => ({ effects, summary, summaryEn, ...(followUp ? { followUp } : {}) })

export const EXTRA_RANDOM_EVENTS = [
  {
    id: 'specialist_rehab', weight: 1.2, cooldownDays: 30,
    canSpawn: (_c, t) => t.players.some(p => p.injury?.daysRemaining >= 8),
    pickContext: (roster, rng) => choosePlayer(roster.filter(p => p.injury?.daysRemaining >= 8), rng),
    title: c => `Konsultacja specjalisty: ${c.playerName}`,
    titleEn: c => `Specialist consultation: ${c.playerName}`,
    body: c => `Specjalista proponuje dodatkową rehabilitację dla ${c.playerName}. Konsultacja kosztuje $2000. Po trzech dniach otrzymasz zalecenia; standardowe leczenie trwa niezależnie.`,
    bodyEn: c => `A specialist offers additional rehabilitation for ${c.playerName}. The consultation costs $2,000. Recommendations arrive in three days; standard treatment continues meanwhile.`,
    choices: () => [choice('consult', 'Zamów konsultację', 'Book the consultation', '−$2000; decyzja o terapii za 3 dni', '−$2,000; treatment decision in 3 days'), choice('standard', 'Kontynuuj standardowe leczenie', 'Continue standard treatment', 'Bez dodatkowych kosztów', 'No additional cost')],
    resolve: (c, id) => id === 'consult'
      ? result([{ type: 'budget', delta: -2000 }], 'Konsultacja opłacona. Czekasz na plan terapii.', 'Consultation paid for. A treatment plan will follow.', { templateId: 'specialist_rehab_result', delayDays: 3, ctx: c })
      : result([], 'Zawodnik kontynuuje dotychczasową rehabilitację.', 'The player continues standard rehabilitation.'),
  },
  {
    id: 'technical_mentor', weight: 1, cooldownDays: 45,
    canSpawn: (_c, t) => t.players.some(p => p.age <= 23 && !p.injury && p.skills?.throwing < 95),
    pickContext: (roster, rng) => choosePlayer(roster.filter(p => p.age <= 23 && !p.injury && p.skills?.throwing < 95), rng),
    title: c => `Indywidualny warsztat rzutowy: ${c.playerName}`,
    titleEn: c => `Individual throwing workshop: ${c.playerName}`,
    body: c => `Trener techniki ma wolny termin dla ${c.playerName}. Tygodniowy warsztat kosztuje $2500. Po nim zawodnik wybierze element do utrwalenia.`,
    bodyEn: c => `A skills coach has an opening for ${c.playerName}. The week-long workshop costs $2,500. Afterwards the player can consolidate one skill.`,
    choices: () => [choice('fund', 'Sfinansuj warsztat', 'Fund the workshop', '−$2500; rozwój umiejętności za 7 dni', '−$2,500; skill development in 7 days'), choice('standard', 'Zostań przy treningu klubowym', 'Keep club training', 'Bez zmian', 'No change')],
    resolve: (c, id) => id === 'fund'
      ? result([{ type: 'budget', delta: -2500 }], 'Warsztat rozpoczęty. Raport za tydzień.', 'The workshop has started. Report in a week.', { templateId: 'technical_mentor_result', delayDays: 7, ctx: c })
      : result([], 'Zawodnik pozostaje przy planie klubowym.', 'The player stays with the club training plan.'),
  },
  {
    id: 'equipment_failure', weight: 0.8, cooldownDays: 45,
    pickContext: () => ({}),
    title: () => 'Zużyty sprzęt treningowy', titleEn: () => 'Worn-out training equipment',
    body: () => 'Maty i siatki wymagają wymiany. Pełny zestaw kosztuje $1800. Doraźna naprawa to $500, ale po czterech dniach sprawdzimy, czy wytrzymała.',
    bodyEn: () => 'Mats and nets need replacing. A full set costs $1,800. A temporary repair is $500; in four days staff will check whether it held.',
    choices: () => [choice('replace', 'Wymień zestaw', 'Replace the set', '−$1800, forma zespołu +1', '−$1,800, team form +1'), choice('repair', 'Napraw prowizorycznie', 'Make a temporary repair', '−$500; możliwa kolejna awaria', '−$500; another failure is possible'), choice('reduce', 'Ogranicz ćwiczenia', 'Reduce drills', 'Forma zespołu −2, bez kosztów', 'Team form −2, no cost')],
    resolve: (c, id, rng) => id === 'replace'
      ? result([{ type: 'budget', delta: -1800 }, { type: 'formTeam', delta: 1 }], 'Nowy sprzęt pozwala przeprowadzić pełną sesję.', 'New equipment allows a full session.')
      : id === 'repair' ? result([{ type: 'budget', delta: -500 }], 'Naprawa gotowa. Sztab sprawdzi jej trwałość.', 'The repair is done. Staff will check its durability.', { templateId: 'equipment_failure_result', delayDays: 4, ctx: { ...c, failed: rng() < 0.5 } })
        : result([{ type: 'formTeam', delta: -2 }], 'Część ćwiczeń odwołano. Spada gotowość meczowa.', 'Some drills were cancelled. Match readiness drops.'),
  },
  {
    id: 'community_clinic', weight: 0.8, cooldownDays: 45,
    pickContext: () => ({}),
    title: () => 'Szkoły proszą o otwarty trening', titleEn: () => 'Schools request an open clinic',
    body: () => 'Lokalne szkoły chcą poznać ultimate. Klub może sfinansować otwarty trening za $1200 i dotrzeć do nowych kibiców kosztem jednej sesji zespołu.',
    bodyEn: () => 'Local schools want to discover ultimate. The club can fund a $1,200 open clinic and reach new fans at the cost of one team session.',
    choices: () => [choice('host', 'Zorganizuj otwarty trening', 'Host the clinic', '−$1200, kibice +100, reputacja +2, forma −1', '−$1,200, fans +100, reputation +2, form −1'), choice('decline', 'Odmów w tym terminie', 'Decline this date', 'Bez zmian', 'No change')],
    resolve: (_c, id) => id === 'host' ? result([{ type: 'budget', delta: -1200 }, { type: 'fansSize', delta: 100 }, { type: 'reputation', delta: 2 }, { type: 'formTeam', delta: -1 }], 'Otwarty trening przyciągnął nowych kibiców; drużyna straciła sesję taktyczną.', 'The clinic attracted new fans; the team missed a tactical session.') : result([], 'Szkoły poszukają innego terminu.', 'The schools will look for another date.'),
  },
  {
    id: 'training_overload', weight: 0.9, cooldownDays: 30,
    canSpawn: (_c, t) => t.players.some(p => !p.injury),
    pickContext: (roster, rng) => choosePlayer(roster.filter(p => !p.injury), rng),
    title: c => `Sygnał przeciążenia: ${c.playerName}`, titleEn: c => `Overload warning: ${c.playerName}`,
    body: c => `${c.playerName} zgłasza ból mięśnia. Możesz wyłączyć zawodnika na dwa dni. Dokończenie sesji daje szansę wzrostu formy, ale niesie 35% ryzyka siedmiodniowego urazu.`,
    bodyEn: c => `${c.playerName} reports muscle pain. You can rule the player out for two days. Finishing the session may improve form but carries a 35% risk of a seven-day injury.`,
    choices: () => [choice('rest', 'Wyłącz na dwa dni', 'Rule out for two days', 'Niedostępność 2 dni', 'Unavailable for 2 days'), choice('continue', 'Dokończ sesję', 'Finish the session', '35%: uraz 7 dni; inaczej forma +2', '35%: 7-day injury; otherwise form +2')],
    resolve: (c, id, rng) => id === 'rest'
      ? result([{ type: 'injury', playerId: c.playerId, days: 2, label: 'przeciążenie mięśniowe' }], 'Sztab wstrzymuje treningi i występy zawodnika na dwa dni.', 'Staff suspend the player’s training and appearances for two days.')
      : rng() < 0.35 ? result([{ type: 'injury', playerId: c.playerId, days: 7, label: 'naciągnięcie' }], 'Ból nasilił się. Zawodnik wymaga przerwy.', 'The pain worsened. The player needs time out.')
        : result([{ type: 'form', playerId: c.playerId, delta: 2 }], 'Sesja zakończona bez urazu. Wzrasta forma.', 'The session ended without injury. Form improves.'),
  },
]

export const EXTRA_FOLLOWUP_EVENTS = [
  {
    id: 'specialist_rehab_result',
    title: c => `Plan rehabilitacji: ${c.playerName}`, titleEn: c => `Rehabilitation plan: ${c.playerName}`,
    body: c => `Dodatkowa terapia ${c.playerName} kosztuje $1500 i skróci pozostałą rekonwalescencję maksymalnie o cztery dni.`,
    bodyEn: c => `Additional treatment for ${c.playerName} costs $1,500 and shortens the remaining recovery by up to four days.`,
    choices: () => [choice('treat', 'Opłać terapię', 'Pay for treatment', '−$1500, do 4 dni krótsza kontuzja', '−$1,500, injury shortened by up to 4 days'), choice('standard', 'Pozostań przy leczeniu klubowym', 'Keep standard treatment', 'Bez dodatkowych kosztów', 'No additional cost')],
    resolve: (c, id) => id === 'treat' ? result([{ type: 'budget', delta: -1500 }, { type: 'recover', playerId: c.playerId, days: 4 }], 'Dodatkowa terapia zakończona.', 'Additional treatment completed.') : result([], 'Kontynuujesz dotychczasowe leczenie.', 'Standard treatment continues.'),
  },
  {
    id: 'technical_mentor_result',
    title: c => `Raport z warsztatu: ${c.playerName}`, titleEn: c => `Workshop report: ${c.playerName}`,
    body: c => `${c.playerName} zakończył warsztat. Wybierz umiejętność do utrwalenia; wzrost jest trwały.`,
    bodyEn: c => `${c.playerName} finished the workshop. Choose a skill to consolidate; the improvement is permanent.`,
    choices: () => [choice('throwing', 'Utrwal technikę rzutu', 'Consolidate throwing technique', 'Rzucanie +1', 'Throwing +1'), choice('vision', 'Utrwal czytanie gry', 'Consolidate reading the game', 'Wizja +1', 'Vision +1')],
    resolve: (c, id) => result([{ type: 'skill', playerId: c.playerId, skill: id, delta: 1 }], 'Zawodnik utrwalił nowe umiejętności.', 'The player consolidated the new skill.'),
  },
  {
    id: 'equipment_failure_result',
    title: c => c.failed ? 'Naprawa sprzętu nie wytrzymała' : 'Naprawiony sprzęt działa',
    titleEn: c => c.failed ? 'The equipment repair failed' : 'The repaired equipment works',
    body: c => c.failed ? 'Sztab zgłasza ponowną awarię. Wymiana kosztuje teraz $1800; można też ograniczyć ćwiczenia.' : 'Sztab potwierdza: naprawa działa, ćwiczenia mogą być kontynuowane.',
    bodyEn: c => c.failed ? 'Staff report another failure. Replacement costs $1,800; alternatively, reduce drills.' : 'Staff confirm the repair works and drills can continue.',
    choices: c => c.failed ? [choice('replace', 'Wymień sprzęt', 'Replace the equipment', '−$1800', '−$1,800'), choice('reduce', 'Ogranicz ćwiczenia', 'Reduce drills', 'Forma zespołu −2', 'Team form −2')] : [choice('done', 'Przyjmij raport', 'Acknowledge', 'Forma zespołu +1', 'Team form +1')],
    resolve: (c, id) => result(c.failed ? (id === 'replace' ? [{ type: 'budget', delta: -1800 }] : [{ type: 'formTeam', delta: -2 }]) : [{ type: 'formTeam', delta: 1 }], c.failed ? 'Plan treningowy dostosowano do decyzji.' : 'Treningi wróciły do pełnego wymiaru.', c.failed ? 'The training plan reflects your decision.' : 'Full training has resumed.'),
  },
]
