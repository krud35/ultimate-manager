import { pickDict, UI_LANG } from '../locale'

const pl = {
  preMatch: 'Przed meczem',
  league: 'Liga',
  cup: 'Puchar',
  yourTeam: 'Twoja drużyna',
  opponent: 'Przeciwnik',
  place: 'miejsce',
  unranked: 'Poza tabelą',
  wins: 'Wygrane',
  losses: 'Porażki',
  pointsDiff: 'Różnica',
  topPlayers: 'Najlepsi w sezonie',
  noPlayerStats: 'Brak statystyk zawodników w tym sezonie.',
  teamProfile: 'Profil',
  matchDayToday: 'Dzień meczu — możesz rozegrać spotkanie',
  matchScheduled: 'Termin zaplanowany',
  daysUntil: (n) =>
    n === 1 ? 'Za 1 dzień' : n < 5 ? `Za ${n} dni` : `Za ${n} dni`,
  hintPlayOnDay:
    'Mecz będzie dostępny dopiero w dniu spotkania. Do tego czasu możesz przeglądać statystyki i wrócić do innych zakładek.',
  backHub: 'Centrum',
  calendar: 'Kalendarz',
  teamSchedule: 'Terminarz',
  standings: 'Tabela',
  simUntilMatch: 'Symuluj do meczu',
  simulating: 'Symulacja…',
}

const en = {
  preMatch: 'Pre-match',
  league: 'League',
  cup: 'Cup',
  yourTeam: 'Your team',
  opponent: 'Opponent',
  place: 'place',
  unranked: 'Unranked',
  wins: 'Wins',
  losses: 'Losses',
  pointsDiff: 'Diff',
  topPlayers: 'Season leaders',
  noPlayerStats: 'No player stats this season yet.',
  teamProfile: 'Profile',
  matchDayToday: 'Match day — you can play now',
  matchScheduled: 'Fixture scheduled',
  daysUntil: (n) => (n === 1 ? 'In 1 day' : `In ${n} days`),
  hintPlayOnDay:
    'The match unlocks on its scheduled day. Until then you can review stats and browse other tabs.',
  backHub: 'Hub',
  calendar: 'Calendar',
  teamSchedule: 'Schedule',
  standings: 'Standings',
  simUntilMatch: 'Simulate until match',
  simulating: 'Simulating…',
}

export function preMatchStrings(lang = UI_LANG.PL) {
  return pickDict({ pl, en }, lang)
}
