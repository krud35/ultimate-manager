import { pickDict, UI_LANG } from '../locale'

const pl = {
  title: 'Symulacja kalendarza…',
  daysAdvanced: (n) => (n === 1 ? '1 dzień' : `${n} dni`),
  inbox: 'Skrzynka',
  inboxEmpty: 'Brak nowych wiadomości',
  ultiworld: 'Ultizone',
}

const en = {
  title: 'Simulating the calendar…',
  daysAdvanced: (n) => (n === 1 ? '1 day' : `${n} days`),
  inbox: 'Inbox',
  inboxEmpty: 'No new messages',
  ultiworld: 'Ultiworld',
}

export function calendarSimStrings(lang = UI_LANG.PL) {
  return pickDict({ pl, en }, lang)
}
