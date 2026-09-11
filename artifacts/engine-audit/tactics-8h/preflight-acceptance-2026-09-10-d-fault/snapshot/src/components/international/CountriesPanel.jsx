import { useState } from 'react'
import {
  ACADEMY_CONTINENTS,
  academyCountriesForContinent,
  academyContinentLabel,
  academyCountryLabel,
} from '../../data/academyScoutGeography.js'
import {
  computePublicWorldRanking,
  countryRankingTierLabel,
  countryRankingTierToneClass,
} from '../../career/nationalTeamRanking.js'
import CountryProfileView from './CountryProfileView.jsx'

/** Faza C planu "International Competition": lista krajów pogrupowana kontynentem + profil
 * kraju. `countryProfileId` żyje TUTAJ (wewnętrzny stan tej pod-zakładki), nie w App.jsx —
 * patrz InternationalCompetitionView.jsx. */
export default function CountriesPanel({ career, onCareerUpdate, t, lang }) {
  const [countryProfileId, setCountryProfileId] = useState(null)

  if (countryProfileId) {
    return (
      <CountryProfileView
        career={career}
        onCareerUpdate={onCareerUpdate}
        countryId={countryProfileId}
        onBack={() => setCountryProfileId(null)}
        t={t}
        lang={lang}
      />
    )
  }

  const ranking = computePublicWorldRanking(career)
  const pointsByCountry = Object.fromEntries(ranking.map((r) => [r.countryId, r.points]))

  return (
    <div className="space-y-6">
      <p className="text-sm text-ufa-muted">{t.countriesIntro}</p>
      {ACADEMY_CONTINENTS.map((continent) => {
        const countries = academyCountriesForContinent(continent.id).sort(
          (a, b) =>
            (pointsByCountry[b.id] ?? 0) - (pointsByCountry[a.id] ?? 0) ||
            String(a.labelPl).localeCompare(String(b.labelPl)),
        )
        if (!countries.length) return null
        return (
          <div key={continent.id}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ufa-gold">
              {academyContinentLabel(continent.id, lang)}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {countries.map((country) => {
                const points = pointsByCountry[country.id] ?? 0
                return (
                  <button
                    key={country.id}
                    type="button"
                    onClick={() => setCountryProfileId(country.id)}
                    className="rounded-xl border border-ufa-border bg-ufa-panel p-4 text-left shadow-lg shadow-black/20 transition hover:border-ufa-accent/50 hover:bg-ufa-panel-hover/40"
                  >
                    <p className="font-semibold text-ufa-text">{academyCountryLabel(country.id, lang)}</p>
                    <p className={`mt-1 text-xs font-medium ${countryRankingTierToneClass(points)}`}>
                      {countryRankingTierLabel(points, lang)}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
