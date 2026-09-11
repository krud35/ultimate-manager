import { useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { internationalCompetitionStrings } from '../ui/strings/internationalCompetition.js'
import CurrentCompetitionPanel from './international/CurrentCompetitionPanel.jsx'
import ResultsPanel from './international/ResultsPanel.jsx'
import CountriesPanel from './international/CountriesPanel.jsx'
import LeadersPanel from './international/LeadersPanel.jsx'

/**
 * Zakładka "Reprezentacje" — widok nad `career.nationalTeams` (patrz `career/nationalTeam*.js`,
 * Fazy 1-6). Cztery pod-zakładki jako pill-switcher (wzorzec `TacticsGuide.jsx`), profil kraju
 * to WEWNĘTRZNY stan `CountriesPanel` (nie osobny `activeTab` App.jsx) — więc opuszczenie tej
 * zakładki i powrót naturalnie resetuje wybrany kraj (odmontowanie/przemontowanie).
 */
export default function InternationalCompetitionView({ career, onCareerUpdate }) {
  const { lang } = useUiLang()
  const t = internationalCompetitionStrings(lang)
  const [subTab, setSubTab] = useState('current')

  const tabs = [
    { id: 'current', label: t.tabs.current },
    { id: 'results', label: t.tabs.results },
    { id: 'countries', label: t.tabs.countries },
    { id: 'leaders', label: t.tabs.leaders },
  ]

  return (
    <div className="space-y-6 league-fade-in">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ufa-text">{t.title}</h2>
            <p className="mt-1 text-sm text-ufa-muted">{t.intro}</p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-ufa-bg p-1 ring-1 ring-ufa-border self-start">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                  subTab === tab.id
                    ? 'bg-ufa-accent text-ufa-bg shadow-md'
                    : 'text-ufa-muted hover:text-ufa-text'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {subTab === 'current' && (
        <CurrentCompetitionPanel career={career} onCareerUpdate={onCareerUpdate} t={t} lang={lang} />
      )}
      {subTab === 'results' && <ResultsPanel career={career} t={t} lang={lang} />}
      {subTab === 'countries' && (
        <CountriesPanel career={career} onCareerUpdate={onCareerUpdate} t={t} lang={lang} />
      )}
      {subTab === 'leaders' && <LeadersPanel career={career} t={t} lang={lang} />}
    </div>
  )
}
