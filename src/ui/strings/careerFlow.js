import { UI_LANG } from '../locale'

const pl = {
  appName: 'Ultimate Manager',
  selectSubtitle: (n) =>
    `Wybierz zapis kariery — możesz prowadzić jednocześnie do ${n} karier.`,
  slotLabel: (n) => `Zapis ${n}`,
  emptyTitle: 'Pusty zapis',
  emptyHint: 'Rozpocznij nową karierę menedżerską w tym zapisie.',
  newCareer: 'Nowa kariera',
  phaseComplete: 'Koniec sezonu',
  phaseActive: 'W trakcie',
  careerSeason: (seasonLabel, seasonIndex) =>
    `${seasonLabel} · sezon kariery #${seasonIndex}`,
  record: (wins, losses) => `Bilans: ${wins}-${losses}`,
  seasonsCompleted: (n) => `ukończone sezony: ${n}`,
  savedAt: (date) => `Zapisano: ${date}`,
  load: 'Wczytaj',
  delete: 'Usuń',
  deleteConfirm: (name) =>
    `Usunąć karierę „${name}”? Tej operacji nie da się cofnąć.`,
  langPl: 'PL',
  langEn: 'EN',
  langAria: 'Język interfejsu',

  newBack: '← Powrót do zapisów',
  newTitle: (n) => `Nowa kariera · zapis ${n}`,
  newIntro: (year, yearShort) =>
    `Wybierz tryb składów, rok startu i drużynę na sezon ${year}/${yearShort}. Liga ma zawsze 16 drużyn · 30 kolejek · puchar w styczniu.`,
  leagueSlotsInfo:
    'W grze jednocześnie może grać 16 drużyn. Jeśli w danym sezonie grało ich więcej, możesz wymieniać składy z ławki (drużyny spoza aktywnej szesnastki).',
  managerName: 'Imię menedżera',
  managerPlaceholder: 'np. Alex Rivera',
  rosterMode: 'Składy zawodników',
  rosterHistorical: 'Historyczne',
  rosterHistoricalDesc: 'Na bazie UFA/AUDL — stałe statystyki sezonu; charakter drużyn i cechy zawodników losowane.',
  rosterRandom: 'Losowe',
  rosterRandomDesc:
    'Nazwiska i składy z wybranego roku, ale nowe OVR: większość 74–83, część 84–88, elita 89–94.',
  startYear: 'Rok rozpoczęcia kariery',
  realTeamsShort: 'drużyn historycznych',
  fictionalFillTitle: 'Uzupełnienie ligi',
  fictionalFillBody: (real, fic, total) =>
    `W sezonie jest ${real} drużyn historycznych. Liga zostanie uzupełniona o ${fic} fikcyjnych składów (łącznie ${total}).`,
  fictionalBadge: 'fikcyjna',
  team: 'Drużyna',
  activeLeague: 'Aktywna szesnastka',
  benchTitle: 'Ławka sezonu',
  benchHint: (n) =>
    `${n} drużyn z tego sezonu czeka na ławce — kliknij „Wymień” przy aktywnej drużynie.`,
  swap: 'Wymień',
  swapPick: 'Wybierz drużynę z ławki',
  swapCancel: 'Anuluj wymianę',
  resetLeague: 'Przywróć domyślną szesnastkę',
  previewProfile: 'Profil',
  previewClose: 'Zamknij',
  previewSelect: 'Wybierz tę drużynę',
  previewAverages: 'Średnie atrybuty (start)',
  previewRoster: 'Skład startowy',
  previewPlayer: 'Zawodnik',
  previewRecord: (w, l, pct) => `Sezon historyczny: ${w}–${l}${pct}`,
  previewNoRecord: 'Brak historycznego bilansu (drużyna fikcyjna lub brak danych)',
  previewUfaHint: 'G/A/B = statystyki referencyjne z sezonu UFA/AUDL (nie wynik kariery).',
  rosterCount: (n) => `${n} zawodników w składzie`,
  startWithBefore: 'Startujesz z ',
  startWithAfter: (year) => ` w sezonie ${year}.`,
  startHistoricalHint: 'Składy historyczne UFA/AUDL.',
  startRandomHint: 'Składy z losowymi skillami.',
  errManager: 'Podaj imię menedżera.',
  errTeam: 'Wybierz drużynę.',
  startCareer: 'Rozpocznij karierę',
  startingCareer: 'Tworzenie kariery…',
  cancel: 'Anuluj',
  pcHint: 'Przeznaczone do gry na PC — na telefonie może być nieczytelne',
  disclaimer:
    'Ta gra to osobisty projekt hobbystyczny, nie jest powiązana z Ultimate Frisbee Association (UFA) ani żadną inną organizacją. Copyright by Krzysztof Rud 2026©',
}

const en = {
  appName: 'Ultimate Manager',
  selectSubtitle: (n) =>
    `Choose a career save — you can run up to ${n} careers at once.`,
  slotLabel: (n) => `Slot ${n}`,
  emptyTitle: 'Empty slot',
  emptyHint: 'Start a new managerial career in this slot.',
  newCareer: 'New career',
  phaseComplete: 'Season complete',
  phaseActive: 'In progress',
  careerSeason: (seasonLabel, seasonIndex) =>
    `${seasonLabel} · Season ${seasonIndex} of career`,
  record: (wins, losses) => `Record: ${wins}-${losses}`,
  seasonsCompleted: (n) => `seasons completed: ${n}`,
  savedAt: (date) => `Saved: ${date}`,
  load: 'Load',
  delete: 'Delete',
  deleteConfirm: (name) =>
    `Delete career “${name}”? This cannot be undone.`,
  langPl: 'PL',
  langEn: 'EN',
  langAria: 'Interface language',

  newBack: '← Back to saves',
  newTitle: (n) => `New career · slot ${n}`,
  newIntro: (year, yearShort) =>
    `Choose roster mode, start year and team for ${year}/${yearShort}. The league always has 16 teams · 30 rounds · cup in January.`,
  leagueSlotsInfo:
    'Only 16 teams can play in the game at once. If more teams played that season, you can swap active clubs with teams on the bench.',
  managerName: 'Manager name',
  managerPlaceholder: 'e.g. Alex Rivera',
  rosterMode: 'Player rosters',
  rosterHistorical: 'Historical',
  rosterHistoricalDesc:
    'Based on UFA/AUDL — fixed season stats; team character and player traits are rolled.',
  rosterRandom: 'Random',
  rosterRandomDesc:
    'Names and rosters from the chosen year, but new OVRs: most 74–83, some 84–88, elite 89–94.',
  startYear: 'Career start year',
  realTeamsShort: 'historical teams',
  fictionalFillTitle: 'League fill',
  fictionalFillBody: (real, fic, total) =>
    `This season has ${real} historical teams. The league will be filled with ${fic} fictional rosters (total ${total}).`,
  fictionalBadge: 'fictional',
  team: 'Team',
  activeLeague: 'Active sixteen',
  benchTitle: 'Season bench',
  benchHint: (n) =>
    `${n} teams from this season are on the bench — click “Swap” on an active team.`,
  swap: 'Swap',
  swapPick: 'Pick a bench team',
  swapCancel: 'Cancel swap',
  resetLeague: 'Reset to default sixteen',
  previewProfile: 'Profile',
  previewClose: 'Close',
  previewSelect: 'Select this team',
  previewAverages: 'Average attributes (start)',
  previewRoster: 'Starting roster',
  previewPlayer: 'Player',
  previewRecord: (w, l, pct) => `Historical season: ${w}–${l}${pct}`,
  previewNoRecord: 'No historical record (fictional team or missing data)',
  previewUfaHint: 'G/A/B = UFA/AUDL season reference stats (not career results).',
  rosterCount: (n) => `${n} players on roster`,
  startWithBefore: 'You start with ',
  startWithAfter: (year) => ` in season ${year}.`,
  startHistoricalHint: 'Historical UFA/AUDL rosters.',
  startRandomHint: 'Rosters with random skills.',
  errManager: 'Enter a manager name.',
  errTeam: 'Choose a team.',
  startCareer: 'Start career',
  startingCareer: 'Creating career…',
  cancel: 'Cancel',
  pcHint: 'Intended to play on PC - might be messy on the phone',
  disclaimer:
    "This game is a personal hobby project, it's not affiliated with Ultimate Frisbee Association (UFA) or any other body. Copyright by Krzysztof Rud 2026©",
}

const BY_LANG = {
  [UI_LANG.PL]: pl,
  [UI_LANG.EN]: en,
}

export function careerFlowStrings(lang) {
  return BY_LANG[lang] ?? pl
}
