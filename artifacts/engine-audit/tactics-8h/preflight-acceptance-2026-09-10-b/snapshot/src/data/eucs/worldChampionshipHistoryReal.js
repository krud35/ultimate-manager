/**
 * Prawdziwa historia World Ultimate Championships (WFDF) SPRZED startu kariery EUCS —
 * ultimate-reference.com/recurring-events/World, domyślny widok (Country / Mixed), pobrane
 * 2026-08-21. Świadome uproszczenie: strona domyślnie pokazuje dywizję Mixed, nie osobno
 * zweryfikowane Open — traktuj jako rozsądny substytut/kolorystykę historyczną dla profilu
 * kraju i rankingu światowego (sekcja 2a/5 planu), nie twardy fakt per-dywizja. Ten sam
 * poziom pewności co `eucsCountryStrength.js`/`academyScoutGeography.js` (świadoma,
 * przybliżona ocena reżysera gry).
 *
 * Klucz kraju to pełna angielska nazwa (jak `player.nationality`/`ACADEMY_COUNTRIES[id].nameEn`)
 * — mapowanie na `countryId` w miejscu użycia przez `academyCountryByEnglishName`, ten sam
 * wzorzec co `eucsNationalityOverrides.js`. NIE miesza się z `career.nationalTeams.history`
 * (to prawdziwa historia świata, nie wydarzenia W TEJ karierze) — czytane wyłącznie przez
 * `realWorldMedalsFor` poniżej, na żądanie, przez profil kraju i ranking światowy.
 */
export const REAL_WORLD_CHAMPIONSHIP_HISTORY = [
  {
    year: 2024,
    host: 'Gold Coast, Australia',
    championCountry: 'United States',
    runnerUpCountry: 'Canada',
    semifinalistCountries: ['France', 'Australia'],
  },
  {
    year: 2016,
    host: 'London, Great Britain',
    championCountry: 'United States',
    runnerUpCountry: 'Australia',
    semifinalistCountries: ['Canada', 'France'],
  },
  {
    year: 2012,
    host: 'Sakai, Japan',
    championCountry: 'Canada',
    runnerUpCountry: 'Australia',
    semifinalistCountries: ['Japan', 'United States'],
  },
  {
    year: 2008,
    host: 'Vancouver, Canada',
    championCountry: 'Canada',
    runnerUpCountry: 'Japan',
    semifinalistCountries: ['United States', 'Australia'],
  },
  {
    year: 2004,
    host: 'Turku, Finland',
    championCountry: 'United States',
    runnerUpCountry: 'Canada',
    semifinalistCountries: ['New Zealand', 'Germany'],
  },
  {
    year: 2000,
    host: 'Heilbronn, Germany',
    championCountry: 'United States',
    runnerUpCountry: 'Canada',
    semifinalistCountries: ['Finland', 'Great Britain'],
  },
  {
    year: 1998,
    host: 'Blaine, USA',
    championCountry: 'Canada',
    runnerUpCountry: 'United States',
    semifinalistCountries: ['Germany', 'Brazil'],
  },
]

/**
 * Medale danego kraju (pełna angielska nazwa) z historii sprzed kariery — do gabloty trofeów
 * w profilu kraju i rankingu światowego. `null` gdy kraj nigdy się nie pojawił (nie 0/0/0 —
 * odróżnia "nigdy nie grał w finałach" od "grał i przegrywał wcześnie", co profil pokazuje
 * inaczej).
 */
export function realWorldMedalsForCountryName(countryName) {
  if (!countryName) return null
  let gold = 0
  let silver = 0
  let semifinal = 0
  const appearances = []
  for (const edition of REAL_WORLD_CHAMPIONSHIP_HISTORY) {
    if (edition.championCountry === countryName) {
      gold += 1
      appearances.push({ year: edition.year, result: 'champion' })
    } else if (edition.runnerUpCountry === countryName) {
      silver += 1
      appearances.push({ year: edition.year, result: 'runnerUp' })
    } else if (edition.semifinalistCountries.includes(countryName)) {
      semifinal += 1
      appearances.push({ year: edition.year, result: 'semifinal' })
    }
  }
  if (!appearances.length) return null
  appearances.sort((a, b) => b.year - a.year)
  return { gold, silver, semifinal, appearances }
}
