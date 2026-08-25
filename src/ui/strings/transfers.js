import { pickDict, UI_LANG } from '../locale'



const pl = {

  windowClosed: 'Okno transferowe zamknięte',

  windowClosedHint:

    'Możesz negocjować już teraz. Dogadany transfer zarejestrujesz dopiero po otwarciu okna — dostaniesz wtedy prośbę o potwierdzenie w skrzynce (styczeń oraz 1 lip – 31 sie).',

  windowOpenHint:

    'Negocjujesz transfery, a kluby AI handlują między sobą w tle. Umowy wstępne spoza okna wymagają potwierdzenia rejestracji w skrzynce przy otwarciu.',

  marketTitle: 'Rynek transferowy',

  clubTitle: 'Centrum transferowe',

  leagueTitle: 'Transfery ligowe',

  budget: 'Budżet',

  sendOffer: 'Wyślij ofertę',

  history: 'Historia transferów',

  noPlayers: 'Brak zawodników spełniających filtry.',

  overBudget: 'Oferta przekracza budżet transferowy.',

  overBudgetContract: 'Transfer + kontrakt przekracza budżet transferowy.',

  faHint: 'Wolny agent — tylko kontrakt (bez opłaty transferowej).',
  faSigned: 'Podpisano wolnego agenta.',
  negativeBudgetBlock: 'Ujemny lub zerowy budżet — nie można podpisywać zawodników.',

  search: 'Szukaj',

  allTeams: 'Wszystkie drużyny',

  value: 'Wartość',

  offer: 'Oferta',

  cancel: 'Anuluj',

  negotiate: 'Negocjuj',

  accept: 'Akceptuj',

  reject: 'Odrzuć',

  difficulty: 'trudność negocjacji',

  negotiateTitle: 'Negocjacje',

  close: 'Zamknij',

  yourBudget: 'Twój budżet',

  negotiateHint:
    'Kluby niechętnie sprzedają najlepszych. Oferta bliska lub powyżej oficjalnej wyceny zwiększa szansę, ale nigdy nie gwarantuje sukcesu.',

  yourOffer: 'Twoja oferta (USD)',

  setValue: 'Ustaw wycenę',

  acceptCounter: (usd) => `Akceptuj kontrpropozycję ${usd}`,

  clubTop1: ' · #1 w klubie',

  clubTopN: (n) => ` · top ${n}`,

  clubBudgetHint: (name) => `${name} · budżet, negocjacje i Twoje deale`,

  leagueMarketHint:
    'Pełny rynek ligi · wyceny × wiek · AI handluje w oknie',

  transferBudget: 'Budżet transferowy',

  salaryBudget: 'Budżet pensji',

  weeklyWageBill: 'Tygodniówka składu',

  searchPlaceholder: 'Szukaj zawodnika / klubu…',

  sortValue: 'Sortuj: wartość',

  sortAge: 'Sortuj: wiek',

  age: 'Wiek',

  showN: (n) => `Pokaż: ${n}`,

  showAll: 'Pokaż: wszyscy',

  yourRosterValues: 'Twój skład · wartości',

  transferListedBadge: 'Na liście',
  myListedTitle: 'Twoi zawodnicy na liście transferowej',
  myListedEmpty: 'Żaden z Twoich zawodników nie jest na liście transferowej.',
  removeFromListAction: 'Zdejmij z listy',

  yourDeals: (n) => `Twoje deale · łącznie w lidze ${n}`,

  allDeals: (n) => `Wszystkie transakcje w lidze · łącznie ${n}`,

  noTransfersCat: 'Brak transferów w tej kategorii.',

  transferError: 'Błąd transferu',

  aiWave: (n) => `Rynek AI: ${n} nowych transferów między klubami`,

  january: 'Styczeń',

  next: 'Następna →',

  phaseClub: '1. Negocjacje z klubem',

  phasePlayer: '2. Negocjacje z zawodnikiem',

  playerNegotiateTitle: 'Kontrakt z zawodnikiem',

  playerNegotiateHint:

    'Po zgodzie klubu musisz dogadać się z zawodnikiem. Na chęć przenosin wpływają: miejsce w lidze obu klubów, morale, obecna pensja oraz reputacja.',

  weeklyWage: 'Tygodniówka',

  totalContractCost: 'Łączny koszt kontraktu',

  contractYears: 'Lata kontraktu',

  currentWage: 'Obecna pensja',

  demandedWage: 'Oczekiwana pensja',

  willingness: 'Chęć przenosin',

  bonuses: 'Bonusy za osiągnięcia',

  promises: 'Obietnice',

  sendContractOffer: 'Wyślij ofertę kontraktu',

  acceptPlayerCounter: (wage, years, total) =>

    `Akceptuj ${wage}/tydz. × ${years} lat (${total})`,

  setDemand: 'Ustaw oczekiwania',

  feeAgreed: 'Uzgodniona kwota transferu',

  remainingAfterContract: 'Zostanie w budżecie transferowym',

  wage: 'Pensja',

  years: 'Lata',

  player: 'Zawodnik',

  club: 'Klub',

  policy: 'Polityka',

  ask: 'Ask',

  sortOvr: 'Sortuj: OVR',

  sortAsk: 'Sortuj: ask',

  sortName: 'Sortuj: nazwisko',

  listSizeTitle: 'Liczba zawodników na liście',

  viewProfile: 'Zobacz profil',

  prev: '← Poprzednia',

  historyMine: 'Twoje',

  historyAll: 'Wszystkie',

  historyAi: 'AI',

  summer: 'Lato',

  yourClub: 'Twój klub',

  offerSentFlash: 'Oferta wysłana — sprawdź skrzynkę za 1–3 dni',

  negotiateInboxHint:
    'Klub i zawodnik odpowiadają w skrzynce w ciągu 1–3 dni. Przy zamkniętym oknie dogadany transfer czeka na Twoje potwierdzenie rejestracji w dniu otwarcia.',

  allClubs: 'Wszystkie kluby',

  date: 'Data',

  from: 'Z',

  to: 'Do',

  fee: 'Kwota',

  windowCol: 'Okno',

  type: 'Typ',

  you: 'Ty',

  showingOf: (shown, total) => `Pokazano ${shown} z ${total}`,

  pageOf: (page, count) => ` · strona ${page}/${count}`,

  perWeekShort: '/t',

  loan: 'Wypożycz',
  loanOutTitle: 'Wypożyczenie zawodnika',
  loanInTitle: 'Prośba o wypożyczenie',
  loanDestinationClub: 'Klub docelowy',
  loanFee: 'Opłata za wypożyczenie (USD)',
  loanDuration: 'Długość wypożyczenia',
  loanWageSplit: (pct) => `Podział pensji · klub docelowy płaci ${pct}%`,
  loanWageSplitHintOut: (pct) => `Ty zapłacisz ${100 - pct}% tygodniówki, oni ${pct}%.`,
  loanWageSplitHintIn: (pct) => `Ty zapłacisz ${pct}% tygodniówki, oni ${100 - pct}%.`,
  loanBuyClause: 'Klauzula wykupu',
  loanBuyClauseNone: 'Brak',
  loanBuyClauseOption: 'Opcja',
  loanBuyClauseObligation: 'Obowiązek',
  loanBuyClauseFee: 'Kwota wykupu (USD)',
  sendLoanProposal: 'Wyślij propozycję',
  loanSentFlash: 'Propozycja wypożyczenia wysłana — sprawdź skrzynkę za 1–3 dni',
  myLoansOutTitle: 'Twoi zawodnicy na wypożyczeniu',
  myLoansOutEmpty: 'Żaden z Twoich zawodników nie jest wypożyczony.',
  myLoansInTitle: 'Zawodnicy wypożyczeni do Twojego klubu',
  myLoansInEmpty: 'Nie masz żadnych zawodników wypożyczonych od innych klubów.',
  loanReturnDateLabel: 'Powrót',
  loanExerciseBuyClause: (usd) => `Wykup za ${usd}`,
  loanLetReturn: 'Niech wróci',
}



const en = {

  windowClosed: 'Transfer window closed',

  windowClosedHint:

    'You can negotiate now. An agreed deal only registers when the window opens — you will get an inbox confirmation prompt (January and 1 Jul – 31 Aug).',

  windowOpenHint:

    'You negotiate transfers while AI clubs trade in the background. Pre-agreements outside the window need inbox registration confirmation when it opens.',

  marketTitle: 'Transfer market',

  clubTitle: 'Transfer center',

  leagueTitle: 'League transfers',

  budget: 'Budget',

  sendOffer: 'Send offer',

  history: 'Transfer history',

  noPlayers: 'No players match the filters.',

  overBudget: 'Offer exceeds the transfer budget.',

  overBudgetContract: 'Transfer fee + contract exceeds the transfer budget.',

  faHint: 'Free agent — contract only (no transfer fee).',
  faSigned: 'Free agent signed.',
  negativeBudgetBlock: 'Budget ≤ 0 — you cannot sign players.',

  search: 'Search',

  allTeams: 'All teams',

  value: 'Value',

  offer: 'Offer',

  cancel: 'Cancel',

  negotiate: 'Negotiate',

  accept: 'Accept',

  reject: 'Reject',

  difficulty: 'negotiation difficulty',

  negotiateTitle: 'Negotiate',

  close: 'Close',

  yourBudget: 'Your budget',

  negotiateHint:
    'Clubs are reluctant to sell stars. An offer near or above official valuation improves odds but never guarantees success.',

  yourOffer: 'Your offer (USD)',

  setValue: 'Set valuation',

  acceptCounter: (usd) => `Accept counter ${usd}`,

  clubTop1: ' · #1 at club',

  clubTopN: (n) => ` · top ${n}`,

  clubBudgetHint: (name) => `${name} · budget, negotiations and your deals`,

  leagueMarketHint:
    'Full league market · valuation × age · AI trades in-window',

  transferBudget: 'Transfer budget',

  salaryBudget: 'Wage budget',

  weeklyWageBill: 'Weekly wage bill',

  searchPlaceholder: 'Search player / club…',

  sortValue: 'Sort: value',

  sortAge: 'Sort: age',

  age: 'Age',

  showN: (n) => `Show: ${n}`,

  showAll: 'Show: all',

  yourRosterValues: 'Your roster · values',

  transferListedBadge: 'Listed',
  myListedTitle: 'Your transfer-listed players',
  myListedEmpty: 'None of your players are on the transfer list.',
  removeFromListAction: 'Remove from list',

  yourDeals: (n) => `Your deals · ${n} league-wide`,

  allDeals: (n) => `All league deals · ${n} total`,

  noTransfersCat: 'No transfers in this category.',

  transferError: 'Transfer error',

  aiWave: (n) => `AI market: ${n} new club-to-club transfers`,

  january: 'January',

  next: 'Next →',

  phaseClub: '1. Club negotiations',

  phasePlayer: '2. Player contract',

  playerNegotiateTitle: 'Player contract',

  playerNegotiateHint:

    'After the club agrees you must agree terms with the player. Willingness depends on league places, morale, current wage and club reputations.',

  weeklyWage: 'Weekly wage',

  totalContractCost: 'Total contract cost',

  contractYears: 'Contract length (years)',

  currentWage: 'Current wage',

  demandedWage: 'Expected wage',

  willingness: 'Willingness to move',

  bonuses: 'Achievement bonuses',

  promises: 'Promises',

  sendContractOffer: 'Send contract offer',

  acceptPlayerCounter: (wage, years, total) =>

    `Accept ${wage}/wk × ${years} yrs (${total})`,

  setDemand: 'Match demand',

  feeAgreed: 'Agreed transfer fee',

  remainingAfterContract: 'Left in transfer budget',

  wage: 'Wage',

  years: 'Years',

  player: 'Player',

  club: 'Club',

  policy: 'Policy',

  ask: 'Ask',

  sortOvr: 'Sort: OVR',

  sortAsk: 'Sort: ask',

  sortName: 'Sort: name',

  listSizeTitle: 'Players shown on the list',

  viewProfile: 'View profile',

  prev: '← Previous',

  historyMine: 'Yours',

  historyAll: 'All',

  historyAi: 'AI',

  summer: 'Summer',

  yourClub: 'Your club',

  offerSentFlash: 'Offer sent — check inbox in 1–3 days',

  negotiateInboxHint:
    'Club and player reply in your inbox within 1–3 days. If the window is closed, a fully agreed deal waits for your registration confirmation when it opens.',

  allClubs: 'All clubs',

  date: 'Date',

  from: 'From',

  to: 'To',

  fee: 'Fee',

  windowCol: 'Window',

  type: 'Type',

  you: 'You',

  showingOf: (shown, total) => `Showing ${shown} of ${total}`,

  pageOf: (page, count) => ` · page ${page}/${count}`,

  perWeekShort: '/wk',

  loan: 'Loan',
  loanOutTitle: 'Loan out player',
  loanInTitle: 'Loan request',
  loanDestinationClub: 'Destination club',
  loanFee: 'Loan fee (USD)',
  loanDuration: 'Loan duration',
  loanWageSplit: (pct) => `Wage split · destination pays ${pct}%`,
  loanWageSplitHintOut: (pct) => `You pay ${100 - pct}% of the wage, they pay ${pct}%.`,
  loanWageSplitHintIn: (pct) => `You pay ${pct}% of the wage, they pay ${100 - pct}%.`,
  loanBuyClause: 'Buy clause',
  loanBuyClauseNone: 'None',
  loanBuyClauseOption: 'Option',
  loanBuyClauseObligation: 'Obligation',
  loanBuyClauseFee: 'Buy-out fee (USD)',
  sendLoanProposal: 'Send proposal',
  loanSentFlash: 'Loan proposal sent — check your inbox in 1–3 days',
  myLoansOutTitle: 'Your players on loan',
  myLoansOutEmpty: 'None of your players are out on loan.',
  myLoansInTitle: 'Players on loan at your club',
  myLoansInEmpty: "You don't have any players on loan from other clubs.",
  loanReturnDateLabel: 'Return',
  loanExerciseBuyClause: (usd) => `Buy out for ${usd}`,
  loanLetReturn: 'Let him return',
}



export function transfersStrings(lang = UI_LANG.PL) {

  return pickDict({ pl, en }, lang)

}


