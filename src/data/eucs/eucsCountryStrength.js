/**
 * Kraje dostępne w skautingu młodzieżowym Ligi Europejskiej — z ukrytym modyfikatorem
 * "siły" (0-100), złożonym z historii kadr narodowych (European Ultimate Championships,
 * ultimate-reference.com/recurring-events/Europe, 1982-2023) i liczby/poziomu klubów
 * tego kraju w naszej 48-klubowej piramidzie EUCS (eucsPyramidTeams.json). Modyfikator
 * jest CAŁKOWICIE ukryty przed graczem — wpływa tylko na jakość naboru (patrz
 * `eucsCountryIntakeMult`, użyte w academy.js obok poziomu obiektu akademii).
 *
 * Wartości to świadoma, przybliżona ocena reżysera gry, nie twardy ranking WFDF —
 * traktuj jako punkt startowy do dalszego dostrajania w miarę grania.
 */
export const EUCS_COUNTRIES = [
  { id: 'fi', country: 'Finland', labelPl: 'Finlandia', labelEn: 'Finland', strength: 95 },
  { id: 'se', country: 'Sweden', labelPl: 'Szwecja', labelEn: 'Sweden', strength: 85 },
  { id: 'de', country: 'Germany', labelPl: 'Niemcy', labelEn: 'Germany', strength: 82 },
  { id: 'nl', country: 'Netherlands', labelPl: 'Holandia', labelEn: 'Netherlands', strength: 80 },
  { id: 'gb', country: 'Great Britain', labelPl: 'Wielka Brytania', labelEn: 'Great Britain', strength: 78 },
  { id: 'be', country: 'Belgium', labelPl: 'Belgia', labelEn: 'Belgium', strength: 75 },
  { id: 'ie', country: 'Ireland', labelPl: 'Irlandia', labelEn: 'Ireland', strength: 74 },
  { id: 'ch', country: 'Switzerland', labelPl: 'Szwajcaria', labelEn: 'Switzerland', strength: 72 },
  { id: 'cz', country: 'Czech Republic', labelPl: 'Czechy', labelEn: 'Czech Republic', strength: 68 },
  { id: 'it', country: 'Italy', labelPl: 'Włochy', labelEn: 'Italy', strength: 66 },
  { id: 'fr', country: 'France', labelPl: 'Francja', labelEn: 'France', strength: 60 },
  { id: 'dk', country: 'Denmark', labelPl: 'Dania', labelEn: 'Denmark', strength: 58 },
  { id: 'at', country: 'Austria', labelPl: 'Austria', labelEn: 'Austria', strength: 55 },
  { id: 'pl', country: 'Poland', labelPl: 'Polska', labelEn: 'Poland', strength: 52 },
  { id: 'es', country: 'Spain', labelPl: 'Hiszpania', labelEn: 'Spain', strength: 42 },
  { id: 'sk', country: 'Slovakia', labelPl: 'Słowacja', labelEn: 'Slovakia', strength: 32 },
  { id: 'tr', country: 'Turkey', labelPl: 'Turcja', labelEn: 'Turkey', strength: 25 },
]

/**
 * Kraje spoza piramidy EUCS, potrzebne WYŁĄCZNIE do wyświetlenia polskiej/angielskiej
 * etykiety narodowości zawodnika (patrz eucsNationalityOverrides.js) — nie mają siły
 * skautingu, bo żaden klub tej ligi się w nich nie znajduje.
 */
const EUCS_EXTRA_NATIONALITIES = [
  { country: 'Latvia', labelPl: 'Łotwa', labelEn: 'Latvia' },
  { country: 'Venezuela', labelPl: 'Wenezuela', labelEn: 'Venezuela' },
  { country: 'United States', labelPl: 'USA', labelEn: 'United States' },
]

const BY_ID = Object.fromEntries(EUCS_COUNTRIES.map((c) => [c.id, c]))
const BY_COUNTRY_NAME = Object.fromEntries(
  [...EUCS_COUNTRIES, ...EUCS_EXTRA_NATIONALITIES].map((c) => [c.country, c]),
)

export function eucsCountryById(id) {
  return BY_ID[id] ?? null
}

/** Odwrotne wyszukanie: pełna nazwa kraju (jak w eucsPyramidTeams.json "country") -> wpis. */
export function eucsCountryByName(countryName) {
  return BY_COUNTRY_NAME[countryName] ?? null
}

export function eucsCountryLabel(id, lang = 'pl') {
  const entry = eucsCountryById(id)
  if (!entry) return id ?? ''
  return lang === 'en' ? entry.labelEn : entry.labelPl
}

/** Siła 0-100 (ukryta) -> mnożnik naboru w paśmie [0.7, 1.3], symetryczny do academyIntakeMult. */
export function eucsCountryIntakeMult(id) {
  const entry = eucsCountryById(id)
  if (!entry) return 1
  return 0.7 + (entry.strength / 100) * 0.6
}
