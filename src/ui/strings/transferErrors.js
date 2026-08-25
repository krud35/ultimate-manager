import { UI_LANG } from '../locale'

/**
 * `src/career/transfers/*.js` return `{ ok: false, error: '<polish sentence>' }` on
 * failure paths (a mix of fixed codes and full Polish sentences), and those are
 * rendered directly in the UI. This translates the known sentences for the EN UI
 * without touching the engine's return values (nothing compares against them).
 */
const STATIC_MAP = {
  'Brak świata kariery': 'No career world loaded',
  'Brak daty w lidze': 'No current league date',
  'Okno transferowe jest zamknięte': 'The transfer window is closed',
  'Okno transferowe jest zamknięte — nie można zarejestrować transferu':
    'The transfer window is closed — cannot register the transfer',
  'Brak klubu': 'No club found',
  'Brak drużyny': 'No team found',
  'Nie znaleziono Twojej drużyny': 'Could not find your team',
  'Nie znaleziono klubu kupującego': 'Could not find the buying club',
  'Nie znaleziono zawodnika': 'Could not find the player',
  'Nie znaleziono drużyny/zawodnika': 'Could not find the team/player',
  'Nie znaleziono drużyny': 'Could not find the team',
  'Nie znaleziono oferty': 'Could not find the offer',
  'Ujemny lub zerowy budżet — nie można podpisywać zawodników':
    'Negative or zero budget — cannot sign players',
  'Ujemny lub zerowy budżet — nie można kupować zawodników':
    'Negative or zero budget — cannot buy players',
  'Zawodnik nie jest wolnym agentem': 'The player is not a free agent',
  'Zawodnik nie zgodził się na warunki': 'The player did not agree to the terms',
  'Zawodnik nie zgodził się na warunki kontraktu': 'The player did not agree to the contract terms',
  'Zawodnik nie jest w Twoim klubie': 'The player is not in your club',
  'Zawodnik nie jest już w Twoim składzie': 'The player is no longer on your roster',
  'Ten zawodnik już jest w Twoim klubie': 'This player is already in your club',
  'Zawodnik już jest w klubie kupującego': 'The player is already at the buying club',
  'Zawodnik nie należy już do wskazanego sprzedającego':
    'The player no longer belongs to the given seller',
  'Zawodnik niedostępny': 'Player unavailable',
  'Podaj kwotę oferty': 'Enter an offer amount',
  'Podaj kwotę kontrpropozycji': 'Enter a counter-offer amount',
  'Masz już otwarte negocjacje dotyczące tego zawodnika':
    'You already have an open negotiation for this player',
  'Oferta nieaktywna': 'Offer is not active',
  'Brak aktywnej kontrpropozycji': 'No active counter-offer',
  'Brak kontrpropozycji zawodnika': "No player counter-offer",
  'Brak warunków kontrpropozycji': 'No counter-offer terms',
  'Niewystarczający budżet na kontrpropozycję': 'Insufficient budget for the counter-offer',
  'Niewystarczający budżet na te warunki': 'Insufficient budget for these terms',
  'Kupujący nie ma już wystarczającego budżetu': 'The buyer no longer has enough budget',
  'Brak oczekującej rejestracji': 'No pending registration',
  'Nie udało się przenieść zawodnika': 'Could not transfer the player',
  'Nie udało się podpisać kontraktu': 'Could not sign the contract',
  'Nieprawidłowa kwota oferty': 'Invalid offer amount',
  'Nieznana akcja negocjacji': 'Unknown negotiation action',
  'Zawodnik już jest w tym klubie': 'The player is already at this club',
  'Zawodnik nie jest w klubie macierzystym': 'The player is not at the parent club',
  'Zawodnik jest już wypożyczony': 'The player is already on loan',
  'Klub docelowy nie ma budżetu na opłatę wypożyczenia':
    'The destination club has no budget for the loan fee',
  'Klub docelowy nie ma wystarczającego budżetu transferowego':
    'The destination club does not have enough transfer budget',
  'Nie udało się wyliczyć daty powrotu': 'Could not compute the return date',
  'Zawodnik nie jest na wypożyczeniu': 'The player is not on loan',
  'Nie znaleziono klubu macierzystego': 'Could not find the parent club',
  'Brak aktywnej klauzuli wykupu': 'No active buy clause',
  'Brak oczekującej decyzji o klauzuli wykupu': 'No pending buy-clause decision',
  'Masz już otwartą propozycję wypożyczenia tego zawodnika':
    'You already have an open loan proposal for this player',
  'Zawodnik jest już wypożyczony gdzie indziej': 'The player is already on loan elsewhere',
  'Masz już otwartą prośbę o wypożyczenie tego zawodnika':
    'You already have an open loan request for this player',
  'Brak wystarczającego budżetu transferowego na opłatę':
    'Not enough transfer budget for the fee',
  'Nie znaleziono propozycji': 'Could not find the proposal',
  'Propozycja nieaktywna': 'Proposal is not active',
  'Nieznana akcja': 'Unknown action',
}

const DYNAMIC_PATTERNS = [
  {
    re: /^Brak środków na kontrakt \((.+); budżet (.+)\)$/,
    en: (m) => `Insufficient funds for the contract (${m[1]}; budget ${m[2]})`,
  },
  {
    re: /^Brak środków \(transfer (.+) \+ kontrakt (.+); budżet (.+)\)$/,
    en: (m) => `Insufficient funds (transfer ${m[1]} + contract ${m[2]}; budget ${m[3]})`,
  },
  {
    re: /^Brak środków \(budżet (.+), oferta (.+)\)$/,
    en: (m) => `Insufficient funds (budget ${m[1]}, offer ${m[2]})`,
  },
  {
    re: /^Nie możesz sprzedać — skład musi mieć więcej niż (\d+) zawodników$/,
    en: (m) => `You can't sell — the roster must have more than ${m[1]} players`,
  },
  {
    re: /^Nie możesz wypożyczyć — skład musi mieć co najmniej (\d+) zawodników$/,
    en: (m) => `You can't loan out — the roster must have at least ${m[1]} players`,
  },
]

export function translateTransferError(error, lang = UI_LANG.PL) {
  if (!error || lang !== UI_LANG.EN) return error
  if (STATIC_MAP[error]) return STATIC_MAP[error]
  for (const { re, en } of DYNAMIC_PATTERNS) {
    const m = error.match(re)
    if (m) return en(m)
  }
  return error
}

/** `src/career/clubSponsors.js` sign/resolve failures return short codes, not sentences. */
const SPONSOR_SIGN_ERRORS = {
  bad_slot: { pl: 'Nieprawidłowy slot sponsora', en: 'Invalid sponsor slot' },
  slot_taken: { pl: 'Slot jest już zajęty', en: 'Slot is already taken' },
  offer_not_found: { pl: 'Nie znaleziono oferty', en: 'Offer not found' },
  missing_data: { pl: 'Brak danych', en: 'Missing data' },
  message_not_found: { pl: 'Nie znaleziono wiadomości', en: 'Message not found' },
  not_sponsor_offer: { pl: 'To nie jest oferta sponsorska', en: 'This is not a sponsor offer' },
  already_resolved: { pl: 'Już rozstrzygnięte', en: 'Already resolved' },
  no_team: { pl: 'Nie znaleziono drużyny', en: 'Team not found' },
  sign_failed: { pl: 'Nie udało się podpisać', en: 'Could not sign' },
}

export function translateSponsorSignError(code, lang = UI_LANG.PL) {
  const entry = SPONSOR_SIGN_ERRORS[code]
  if (!entry) return code
  return lang === UI_LANG.EN ? entry.en : entry.pl
}
