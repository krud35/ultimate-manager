import { ACADEMY_COUNTRIES } from '../data/academyScoutGeography.js'
import { currentEucsTier } from './competitionMembership.js'

// Game-balance profiles inspired by the 2008–2012 football economy, not GDP data.
// Capital, commercial reach, TV market and local prices are independent dimensions.
const market = (capital, commercial, television, prices) => ({ capital, commercial, television, prices })
export const COUNTRY_FINANCIAL_MARKETS = {
  us: market(1.5, 1.5, 1.3, 1.1), gb: market(1.4, 1.3, 1.5, 1.1),
  de: market(1.3, 1.4, 1.15, 1.05), fr: market(1.1, 1.1, 1, 1),
  es: market(1.05, 1, 1.2, .85), it: market(1.05, 1, 1.1, .9),
  ca: market(1.15, 1.2, .85, 1), au: market(1.1, 1.15, .8, 1),
  jp: market(1.15, 1.25, 1, 1.05), ch: market(1.1, 1.1, .45, 1.2),
  no: market(1.05, 1, .4, 1.2), se: market(.9, .95, .5, 1.05),
  dk: market(.9, .9, .45, 1.1), fi: market(.8, .85, .35, 1.05),
  nl: market(.9, 1, .7, 1), be: market(.8, .85, .55, .95),
  at: market(.85, .85, .45, 1), ie: market(.7, .75, .35, 1),
  nz: market(.7, .75, .3, .9), sg: market(.9, 1, .3, 1.05),
  hk: market(.85, .95, .3, 1.05), tw: market(.65, .75, .45, .8),
  pt: market(.55, .6, .6, .65), gr: market(.5, .55, .45, .65),
  tr: market(.6, .65, .75, .55), pl: market(.35, .4, .3, .45),
  cz: market(.4, .45, .25, .5), si: market(.4, .4, .18, .55),
  sk: market(.3, .35, .15, .45), hu: market(.3, .35, .2, .45),
  hr: market(.28, .3, .18, .4), ee: market(.3, .32, .12, .45),
  lt: market(.25, .28, .12, .4), lv: market(.23, .25, .1, .38),
  rs: market(.2, .23, .15, .32), bg: market(.2, .23, .14, .3),
  ua: market(.22, .25, .2, .3), cn: market(.65, .8, .8, .45),
  mx: market(.5, .6, .7, .45), br: market(.55, .65, .8, .45),
  ar: market(.35, .45, .5, .35), cl: market(.35, .4, .3, .4),
  co: market(.25, .3, .25, .3), pe: market(.22, .25, .18, .28),
  ve: market(.22, .25, .2, .3), py: market(.15, .18, .1, .22),
  za: market(.3, .35, .3, .35), eg: market(.18, .22, .2, .22),
  ma: market(.18, .22, .18, .22), in: market(.2, .35, .35, .22),
  ph: market(.18, .22, .18, .25),
}
const fallback = market(.25, .3, .2, .35)
const neutral = market(1, 1, 1, 1)
const aliases = { uk: 'gb', usa: 'us', 'united kingdom': 'gb' }

export function financialCountryId(team) {
  for (const input of [team?.countryId, team?.country]) {
    const raw = String(input ?? '').trim().toLowerCase()
    if (ACADEMY_COUNTRIES[raw]) return raw
    const found = aliases[raw] ?? Object.keys(ACADEMY_COUNTRIES).find(id =>
      [ACADEMY_COUNTRIES[id].nameEn, ACADEMY_COUNTRIES[id].labelEn, ACADEMY_COUNTRIES[id].labelPl].some(name => name.toLowerCase() === raw))
    if (found) return found
  }
  return null
}

export function clubFinancialMarket(team) {
  const domestic = Boolean(team?.domesticLeagueId)
  const countryId = financialCountryId(team)
  const profile = domestic ? COUNTRY_FINANCIAL_MARKETS[countryId] ?? fallback : neutral
  // Persisted live tier takes precedence over league ids (French regional ids have no tier suffix).
  const value = Number(domestic ? team.tier : currentEucsTier(team))
  const tier = Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1
  const depth = domestic ? tier - 1 : 0
  return { domestic, countryId, tier, ...profile,
    investment: profile.capital * .45 ** depth,
    sponsorship: profile.commercial * .5 ** depth,
    wages: Math.sqrt(profile.capital) * .68 ** depth,
    attendance: Math.sqrt(profile.commercial) * .65 ** depth,
    ticketPrice: Math.sqrt(profile.prices) * .85 ** depth,
    tvMonthly: domestic ? Math.round(1_500_000 * profile.television * .2 ** depth) : null,
    prize: profile.television * .2 ** depth,
  }
}

export const clubWageScale = team => clubFinancialMarket(team).wages
