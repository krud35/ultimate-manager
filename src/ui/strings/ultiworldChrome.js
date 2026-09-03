import { pickDict, UI_LANG } from '../locale'

const pl = {
  brand: 'Ultizone',
  tagline: 'ultimate media',
  intro:
    'Krótkie newsy z ligi i Pucharu: hity kolejek, siódemki, zawodnik miesiąca, ruchy transferowe i plotki — plus wydarzenia, które czasem ruszają nawet budżetem.',
  unread: (n) => ` · ${n} nieprzeczytanych`,
  markRead: 'Oznacz przeczytane',
  emptyAll: 'Redakcja milczy — graj kolejkę albo przewiń kalendarz, a Ultizone zacznie pisać.',
  emptyFilter: 'Brak artykułów w tym filtrze.',
  site: 'Ultizone.com',
  pickArticle: 'Wybierz artykuł z listy.',
  impact: 'Wpływ na rozgrywkę:',
  filters: {
    all: 'Wszystkie',
    unread: 'Nowe',
    transfer: 'Transfery',
    rumor: 'Plotki',
    match: 'Mecze',
    round: 'Kolejki',
    cup: 'Puchar',
    awards: 'Nagrody',
    power_rankings: 'Power Rankings',
    breaking: 'Breaking',
    feature: 'Feature',
  },
  categories: {
    transfer: 'Transfer',
    rumor: 'Plotka',
    match: 'Mecz',
    round: 'Kolejka',
    cup: 'Puchar',
    awards: 'Nagrody',
    power_rankings: 'Power Rankings',
    feature: 'Feature',
    breaking: 'Breaking',
  },
}

const en = {
  brand: 'Ultiworld',
  tagline: 'ultimate media',
  intro:
    'Short league and Cup news: round highlights, top sevens, player of the month, transfer moves and rumors — plus events that sometimes move the budget.',
  unread: (n) => ` · ${n} unread`,
  markRead: 'Mark all read',
  emptyAll: 'The newsroom is quiet — play a round or advance the calendar and Ultiworld will start writing.',
  emptyFilter: 'No articles in this filter.',
  site: 'Ultiworld.com',
  pickArticle: 'Pick an article from the list.',
  impact: 'Impact on the game:',
  filters: {
    all: 'All',
    unread: 'New',
    transfer: 'Transfers',
    rumor: 'Rumors',
    match: 'Matches',
    round: 'Rounds',
    cup: 'Cup',
    awards: 'Awards',
    power_rankings: 'Power Rankings',
    breaking: 'Breaking',
    feature: 'Feature',
  },
  categories: {
    transfer: 'Transfer',
    rumor: 'Rumor',
    match: 'Match',
    round: 'Round',
    cup: 'Cup',
    awards: 'Awards',
    power_rankings: 'Power Rankings',
    feature: 'Feature',
    breaking: 'Breaking',
  },
}

export function ultiworldChromeStrings(lang = UI_LANG.PL) {
  return pickDict({ pl, en }, lang)
}
