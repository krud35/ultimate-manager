import { pickDict, UI_LANG } from '../locale'

const pl = {
  clubTitle: 'Skład drużyny',
  leagueTitle: 'Składy ligi',
  clubHint: 'kliknij imię, aby zobaczyć profil',
  leagueHint: (n) => `Świat kariery · ${n} zawodników`,
  sort: 'Sortuj',
  show: 'Pokaż',
  all: 'Wszyscy',
  allTeams: 'Wszystkie',
  player: 'Zawodnik',
  team: 'Drużyna',
  age: 'Wiek',
  value: 'Wartość',
  form: 'Forma',
  morale: 'Morale',
  traits: 'Cechy',
  pointsPlayed: 'Punkty rozegrane',
  showing: (shown, total) => `${shown} / ${total}`,
  playerCount: (n) => (n === 1 ? '1 zawodnik' : `${n} zawodników`),
  ofTotal: (shown, total) => `${shown} z ${total}`,
  matchStamina: ' · stamina z meczu',
  matchFreshnessCol: 'Świeżość mecz.',
  hand: 'Ręka',
  transferListedBadge: 'Na liście',
  loanedInBadge: (club) => `Wypożyczony od ${club}`,
}

const en = {
  clubTitle: 'Team roster',
  leagueTitle: 'League rosters',
  clubHint: 'click a name to open the profile',
  leagueHint: (n) => `Career world · ${n} players`,
  sort: 'Sort',
  show: 'Show',
  all: 'All',
  allTeams: 'All',
  player: 'Player',
  team: 'Team',
  age: 'Age',
  value: 'Value',
  form: 'Form',
  morale: 'Morale',
  traits: 'Traits',
  pointsPlayed: 'Points played',
  showing: (shown, total) => `${shown} / ${total}`,
  playerCount: (n) => (n === 1 ? '1 player' : `${n} players`),
  ofTotal: (shown, total) => `${shown} of ${total}`,
  matchStamina: ' · match stamina',
  matchFreshnessCol: 'Match freshness',
  hand: 'Hand',
  transferListedBadge: 'Listed',
  loanedInBadge: (club) => `On loan from ${club}`,
}

export function rosterStrings(lang = UI_LANG.PL) {
  return pickDict({ pl, en }, lang)
}
