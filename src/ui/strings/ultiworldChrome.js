import { pickDict, UI_LANG } from '../locale'

const pl = {
  brand: 'Ultizone',
  tagline: 'ultimate media',
  intro:
    'Krótkie newsy z ligi i Pucharu: hity kolejek, siódemki, zawodnik miesiąca i wydarzenia, które czasem ruszają nawet budżetem.',
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
    match: 'Mecze',
    round: 'Kolejki',
    cup: 'Puchar',
    awards: 'Nagrody',
    breaking: 'Breaking',
    feature: 'Feature',
  },
  categories: {
    match: 'Mecz',
    round: 'Kolejka',
    cup: 'Puchar',
    awards: 'Nagrody',
    feature: 'Feature',
    breaking: 'Breaking',
  },
}

const en = {
  brand: 'Ultiworld',
  tagline: 'ultimate media',
  intro:
    'Short league and Cup news: round highlights, top sevens, player of the month, and events that sometimes move the budget.',
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
    match: 'Matches',
    round: 'Rounds',
    cup: 'Cup',
    awards: 'Awards',
    breaking: 'Breaking',
    feature: 'Feature',
  },
  categories: {
    match: 'Match',
    round: 'Round',
    cup: 'Cup',
    awards: 'Awards',
    feature: 'Feature',
    breaking: 'Breaking',
  },
}

export function ultiworldChromeStrings(lang = UI_LANG.PL) {
  return pickDict({ pl, en }, lang)
}
