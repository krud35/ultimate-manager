import { pickDict, UI_LANG } from '../locale'

const pl = {
  compsDone: 'Rozgrywki zakończone',
  leagueChampion: 'Mistrz ligi',
  cup: 'Puchar',
  yourPlace: 'Twoje miejsce',
  officialEnd: 'oficjalny koniec sezonu',
  topScorers: 'Najlepsi strzelcy',
  summaryHint:
    'Możesz dalej przewijać kalendarz (treningi, transfery od 1 lipca). 31 lipca pojawi się pytanie o przejście do kolejnego sezonu.',
  fullTable: 'Pełna tabela',
  transfers: 'Transfery',
  seasonEndOfficial: 'Koniec sezonu · 31 lipca',
  seasonEnded: 'Sezon zakończony',
  record: 'bilans',
  pointDiff: 'różnica punktów',
  scorersSummary: 'Podsumowanie · strzelcy',
  transferWindow: 'Okno transferowe (1 lip – 31 sie)',
  transferBudgetHint:
    'Po starcie kolejnego sezonu okno zostaje otwarte przez sierpień.',
  budget: 'Budżet',
  careerHistory: 'Historia kariery',
  placeN: (n) => `${n}. miejsce`,
  archiveNote: (next) =>
    `Statystyki sezonu są w archiwum i all-time. Start ${next} wyczyści skrzynkę, newsy Ultizone i log transferów dla płynności.`,
  confirmNext: (next) =>
    `Przejść do ${next}?\n\nZostaną zapisane statystyki do all-time, a skrzynka, newsy Ultizone i log transferów zostaną wyczyszczone dla płynności.`,
  goToNext: (next) => `Przejdź do ${next}`,
  viewTable: 'Zobacz tabelę',
  nextLeague: (y1, y2) => `Liga ${y1}/${y2}`,
}

const en = {
  compsDone: 'Competitions finished',
  leagueChampion: 'League champion',
  cup: 'Cup',
  yourPlace: 'Your place',
  officialEnd: 'official season end',
  topScorers: 'Top scorers',
  summaryHint:
    'You can keep advancing the calendar (training, transfers from July 1). On July 31 you will be asked about the next season.',
  fullTable: 'Full table',
  transfers: 'Transfers',
  seasonEndOfficial: 'Season end · July 31',
  seasonEnded: 'Season finished',
  record: 'record',
  pointDiff: 'point differential',
  scorersSummary: 'Summary · scorers',
  transferWindow: 'Transfer window (1 Jul – 31 Aug)',
  transferBudgetHint: 'After starting the next season the window stays open through August.',
  budget: 'Budget',
  careerHistory: 'Career history',
  placeN: (n) => `${n}. place`,
  archiveNote: (next) =>
    `Season stats are archived in all-time. Starting ${next} clears inbox, Ultiworld news and the transfer log for performance.`,
  confirmNext: (next) =>
    `Continue to ${next}?\n\nStats will be saved to all-time, and the inbox, Ultiworld news and transfer log will be cleared for performance.`,
  goToNext: (next) => `Continue to ${next}`,
  viewTable: 'View table',
  nextLeague: (y1, y2) => `League ${y1}/${y2}`,
}

export function seasonRecapStrings(lang = UI_LANG.PL) {
  return pickDict({ pl, en }, lang)
}
