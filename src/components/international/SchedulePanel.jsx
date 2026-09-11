import { academyCountryLabel, academyContinentLabel } from '../../data/academyScoutGeography.js'
import { ensureCareerNationalTeams } from '../../career/nationalTeams.js'
import { countryIdFromPseudoTeamId } from '../../career/nationalTeamQualifying.js'

function FixtureRow({ fixture, t, lang, roundLabel }) {
  const done = fixture.status === 'completed'
  const homeName = academyCountryLabel(countryIdFromPseudoTeamId(fixture.homeTeamId), lang)
  const awayName = fixture.awayTeamId
    ? academyCountryLabel(countryIdFromPseudoTeamId(fixture.awayTeamId), lang)
    : null
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        {roundLabel && (
          <p className="text-[10px] uppercase tracking-wide text-ufa-muted">{roundLabel}</p>
        )}
        <p className="truncate text-ufa-text">
          {homeName} {awayName ? `vs ${awayName}` : <span className="text-ufa-muted">— {t.waiting}</span>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {done ? (
          <span className="tabular-nums font-semibold text-ufa-text">
            {fixture.homeScore}:{fixture.awayScore}
          </span>
        ) : (
          <span className="text-xs text-ufa-muted">
            {fixture.date ? fixture.date : t.scheduleDateTbd}
          </span>
        )}
      </div>
    </li>
  )
}

function Section({ title, fixtures, t, lang, roundLabelFor }) {
  if (!fixtures.length) return null
  const sorted = [...fixtures].sort((a, b) => {
    const ad = a.date ?? '9999-99-99'
    const bd = b.date ?? '9999-99-99'
    return ad.localeCompare(bd)
  })
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ufa-gold">{title}</p>
      <ul className="space-y-1.5">
        {sorted.map((f) => (
          <FixtureRow key={f.id} fixture={f} t={t} lang={lang} roundLabel={roundLabelFor?.(f)} />
        ))}
      </ul>
    </div>
  )
}

/** Sekcja "Terminarz" w zakładce International — czysto odczytowy widok nad już
 * istniejącymi tablicami meczów kwalifikacji/fazy finałowej (patrz nationalTeamQualifying.js /
 * nationalTeamFinals.js) — bez żadnego nowego modelu danych. */
export default function SchedulePanel({ career, t, lang }) {
  const nt = ensureCareerNationalTeams(career)
  const qualifying = nt.qualifying
  const finals = nt.finals

  if (!qualifying && !finals) {
    return (
      <div className="rounded-xl border border-dashed border-ufa-border bg-ufa-panel/50 p-8 text-center">
        <p className="text-sm text-ufa-muted">{t.scheduleEmpty}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {qualifying && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-ufa-text">
            {t.qualifyingTitle(t.kind[qualifying.kind] ?? qualifying.kind, qualifying.year)}
          </h3>
          {qualifying.campaigns.map((campaign, i) => (
            <div
              key={campaign.zoneContinentId ?? `campaign-${i}`}
              className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-lg shadow-black/20 space-y-4"
            >
              <p className="text-sm font-semibold text-ufa-text">
                {campaign.zoneContinentId ? academyContinentLabel(campaign.zoneContinentId, lang) : t.kind.euro}
              </p>
              <Section
                title={t.scheduleQualifyingHeader}
                fixtures={campaign.fixtures ?? []}
                t={t}
                lang={lang}
                roundLabelFor={(f) => `${t.groupLabel(f.groupId)} · R${f.round}`}
              />
              <Section
                title={t.schedulePlayoffHeader}
                fixtures={campaign.playoff?.matches ?? []}
                t={t}
                lang={lang}
              />
            </div>
          ))}
        </div>
      )}

      {finals && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-ufa-text">
            {t.finalsTitle(t.kind[finals.kind] ?? finals.kind, finals.year)}
          </h3>
          <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-lg shadow-black/20 space-y-4">
            <Section
              title={t.scheduleFinalsGroupHeader}
              fixtures={finals.fixtures ?? []}
              t={t}
              lang={lang}
              roundLabelFor={(f) => `${t.groupLabel(f.groupId)} · R${f.round}`}
            />
            <Section
              title={t.scheduleKnockoutHeader}
              fixtures={(finals.knockout?.matches ?? []).filter((m) => m.homeTeamId && m.awayTeamId)}
              t={t}
              lang={lang}
              roundLabelFor={(f) => t.round[f.round] ?? f.round}
            />
          </div>
        </div>
      )}
    </div>
  )
}
