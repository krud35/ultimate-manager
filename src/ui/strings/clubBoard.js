import { pickDict, UI_LANG } from '../locale'

const pl = {
  title: 'Zarząd klubu',
  subtitle: 'Struktury obiektów i umowy sponsorskie',
  budget: 'Budżet transferowy',
  salaryBudget: 'Budżet pensji',
  facilities: 'Struktury',
  sponsors: 'Sponsorzy',
  level: 'Poziom',
  upgrade: 'Ulepsz',
  upgrading: 'Ulepszanie…',
  maxLevel: 'Maks. poziom',
  cannotAfford: 'Za mało środków',
  upgraded: (name, level) => `Ulepszono: ${name} → poz. ${level}`,
  effect: 'Efekt',
  cost: 'Koszt ulepszenia',
  lastMerch: 'Ostatnia sprzedaż merchu',
  slotEmpty: 'Wolny slot — wybierz ofertę',
  activeDeal: 'Aktywna umowa',
  yearsLeft: (n) => (n === 1 ? '1 rok pozostał' : `${n} lat pozostało`),
  paidToDate: 'Wpłacono łącznie',
  sign: 'Podpisz',
  signing: 'Podpisywanie…',
  signed: (brand, amount) =>
    amount > 0
      ? `Podpisano z ${brand}. Na konto: ${amount}`
      : `Podpisano z ${brand}.`,
  refreshOffers: 'Odśwież oferty',
  offer: (n) => `Oferta ${n}`,
  noOffers: 'Brak ofert — odśwież lub poczekaj na wygaśnięcie umowy.',
  signingBonus: 'Przy podpisaniu',
  totalValue: 'Suma kontraktu',
  hintFacilities:
    'Poziomy 1–4 lekko szkodzą (poza sklepikiem), 5 to standard, 6–10 dają rosnący bonus.',
  hintSponsors:
    'Oferta 1 = całość przy podpisaniu (najmniej łącznie). Oferta 2 = co sezon. Oferta 3 = co miesiąc (najwięcej łącznie).',
}

const en = {
  title: 'Club board',
  subtitle: 'Facilities and sponsorship deals',
  budget: 'Transfer budget',
  salaryBudget: 'Wage budget',
  facilities: 'Facilities',
  sponsors: 'Sponsors',
  level: 'Level',
  upgrade: 'Upgrade',
  upgrading: 'Upgrading…',
  maxLevel: 'Max level',
  cannotAfford: 'Not enough funds',
  upgraded: (name, level) => `Upgraded: ${name} → lv ${level}`,
  effect: 'Effect',
  cost: 'Upgrade cost',
  lastMerch: 'Last merch sale',
  slotEmpty: 'Open slot — pick an offer',
  activeDeal: 'Active deal',
  yearsLeft: (n) => (n === 1 ? '1 year left' : `${n} years left`),
  paidToDate: 'Paid to date',
  sign: 'Sign',
  signing: 'Signing…',
  signed: (brand, amount) =>
    amount > 0 ? `Signed with ${brand}. Credited: ${amount}` : `Signed with ${brand}.`,
  refreshOffers: 'Refresh offers',
  offer: (n) => `Offer ${n}`,
  noOffers: 'No offers — refresh or wait for a deal to expire.',
  signingBonus: 'On signing',
  totalValue: 'Contract total',
  hintFacilities:
    'Levels 1–4 lightly hurt (except the shop), 5 is baseline, 6–10 grow the bonus.',
  hintSponsors:
    'Offer 1 = full payout on signing (lowest total). Offer 2 = per season. Offer 3 = monthly (highest total).',
}

export function clubBoardStrings(lang = UI_LANG.PL) {
  return pickDict({ pl, en }, lang)
}
