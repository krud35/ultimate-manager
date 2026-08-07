import { pickDict, UI_LANG } from '../locale'

function plMatchWord(n) {
  if (n === 1) return 'mecz'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'mecze'
  return 'meczów'
}

function plMeetingWord(n) {
  if (n === 1) return 'spotkanie'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'spotkania'
  return 'spotkań'
}

const pl = {
  views: {
    week: 'Tydzień',
    month: 'Miesiąc',
    season: 'Sezon',
  },
  training: 'Trening',
  trainingOneOff: 'Jednorazowy',
  trainingWeekly: 'Cotygodniowy',
  trainingDot: 'Trening',
  yourMatch: 'Twój mecz',
  otherMatches: 'Inne mecze',
  freeDay: 'Wolny dzień',
  scheduled: 'zaplanowany',
  play: 'Graj',
  today: 'dziś',
  todayChip: 'Dziś',
  noEvents: 'Brak wydarzeń',
  noEventsDay: 'Brak wydarzeń tego dnia.',
  eventsTitle: (date, todaySuffix) => `Wydarzenia · ${date}${todaySuffix}`,
  trainingsSection: 'Treningi',
  matchesSection: 'Mecze',
  fixturesSection: 'Spotkania',
  simToDay: 'Symuluj do tego dnia',
  confirmSim: (iso) => `Przewinąć czas do ${iso}?`,
  confirmSimKeep: 'Mecze w dniu docelowym pozostaną do rozegrania.',
  confirmMatchNotePlayer: (n) =>
    ` Po drodze automatycznie rozegra ${n} ${n === 1 ? 'Twój' : 'Twoje'} ${plMatchWord(n)}.`,
  confirmMatchNoteAi: ' Mecze AI po drodze zostaną zsymulowane automatycznie.',
  simOverlayHint: (n) =>
    n > 0
      ? `Symulacja przewinie kalendarz do wybranej daty i rozegra wszystkie mecze po drodze (w tym Twoje: ${n}).`
      : 'Symulacja przewinie kalendarz do wybranej daty i rozegra wszystkie mecze po drodze.',
  seasonOverview: 'Przegląd sezonu',
  seasonMap: 'Mapa sezonu',
  freeWeek: 'Tydzień wolny',
  pqQuarters: 'PQ + ćwierćfinały',
  semisFinal: 'Półfinały + finał',
  weekLabel: 'Tydzień',
  monthLabel: 'Miesiąc',
  calendarTitle: 'Kalendarz',
  tileTitle: 'Kalendarz',
  tileOpen: 'Otwórz kalendarz →',
  planTeamTraining: 'Plan treningów drużynowych',
  season: 'Sezon',
  currentPhase: 'Bieżąca faza',
  januaryCupSchedule: 'Rozkład stycznia (puchar)',
  noScheduledTrainings: 'Brak zaplanowanych treningów — dodaj je w zakładce Trening.',
  everyWeek: '· co tydzień',
  matchCount: (n) => `${n} ${plMatchWord(n)}`,
  otherMatchCount: (n) => `+${n} inne`,
  noScheduledFixtures: 'Brak zaplanowanych spotkań.',
  yourSeasonFixtures: 'Twoje spotkania w sezonie',
  weeklyOneOffCounts: (weekly, oneOff) => `${weekly} cotyg. · ${oneOff} jednoraz.`,
  roundsRange: (a, b) => `Kolejki ${a}–${b}`,
  summerWindowEnd: 'Okno letnie · koniec sezonu',
  calendarIntro: 'Mecze i treningi drużynowe · wybierz przyszły dzień, aby przewinąć czas.',
  trainingChip: (label) => `Trening · ${label}`,
  cupShort: ' · Puchar',
  roundShort: (n) => ` · Kolejka ${n}`,
  thisWeekMeetings: (n) => `Ten tydzień: ${n} ${plMeetingWord(n)}`,
  yoursCount: (n) => ` · Twoje: ${n}`,
  noUpcomingYours: 'Brak nadchodzących Twoich meczów',
  viewsHint: 'Widok tygodniowy · miesięczny · sezonowy',
  doneSession: ' · odbyty',
  venueHome: 'Dom',
  venueAway: 'Wyjazd',
  venueNeutral: 'Neutralne',
}

const en = {
  views: {
    week: 'Week',
    month: 'Month',
    season: 'Season',
  },
  training: 'Training',
  trainingOneOff: 'One-off',
  trainingWeekly: 'Weekly',
  trainingDot: 'Training',
  yourMatch: 'Your match',
  otherMatches: 'Other matches',
  freeDay: 'Free day',
  scheduled: 'scheduled',
  play: 'Play',
  today: 'today',
  todayChip: 'Today',
  noEvents: 'No events',
  noEventsDay: 'No events on this day.',
  eventsTitle: (date, todaySuffix) => `Events · ${date}${todaySuffix}`,
  trainingsSection: 'Trainings',
  matchesSection: 'Matches',
  fixturesSection: 'Fixtures',
  simToDay: 'Sim to this day',
  confirmSim: (iso) => `Advance time to ${iso}?`,
  confirmSimKeep: 'Matches on the target day will remain to be played.',
  confirmMatchNotePlayer: (n) =>
    ` It will automatically play ${n} of your match${n === 1 ? '' : 'es'} along the way.`,
  confirmMatchNoteAi: ' AI matches along the way will be simulated automatically.',
  simOverlayHint: (n) =>
    n > 0
      ? `Simulation will advance the calendar to the selected date and play all matches along the way (including yours: ${n}).`
      : 'Simulation will advance the calendar to the selected date and play all matches along the way.',
  seasonOverview: 'Season overview',
  seasonMap: 'Season map',
  freeWeek: 'Free week',
  pqQuarters: 'PQ + quarterfinals',
  semisFinal: 'Semis + final',
  weekLabel: 'Week',
  monthLabel: 'Month',
  calendarTitle: 'Calendar',
  tileTitle: 'Calendar',
  tileOpen: 'Open calendar →',
  planTeamTraining: 'Team training plan',
  season: 'Season',
  currentPhase: 'Current phase',
  januaryCupSchedule: 'January cup schedule',
  noScheduledTrainings: 'No scheduled trainings — add them on the Training tab.',
  everyWeek: '· every week',
  matchCount: (n) => `${n} match${n === 1 ? '' : 'es'}`,
  otherMatchCount: (n) => `+${n} other`,
  noScheduledFixtures: 'No scheduled fixtures.',
  yourSeasonFixtures: 'Your fixtures this season',
  weeklyOneOffCounts: (weekly, oneOff) => `${weekly} weekly · ${oneOff} one-off`,
  roundsRange: (a, b) => `Rounds ${a}–${b}`,
  summerWindowEnd: 'Summer window · season end',
  calendarIntro: 'Matches and team trainings · pick a future day to advance time.',
  trainingChip: (label) => `Training · ${label}`,
  cupShort: ' · Cup',
  roundShort: (n) => ` · Round ${n}`,
  thisWeekMeetings: (n) => `This week: ${n} fixture${n === 1 ? '' : 's'}`,
  yoursCount: (n) => ` · Yours: ${n}`,
  noUpcomingYours: 'No upcoming matches of yours',
  viewsHint: 'Weekly · monthly · season views',
  doneSession: ' · done',
  venueHome: 'Home',
  venueAway: 'Away',
  venueNeutral: 'Neutral',
}

export function calendarStrings(lang = UI_LANG.PL) {
  return pickDict({ pl, en }, lang)
}
