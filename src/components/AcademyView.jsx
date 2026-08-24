import { useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { academyStrings } from '../ui/strings/academy'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers'
import { scoutedValueDisplay, trainingRoomLabel } from '../ui/fogOfWar'
import {
  worldTeamById,
  getFacilityLevel,
  promoteAcademyPlayer,
  releaseAcademyPlayer,
  queueScoutMission,
  pendingScoutMissions,
  getPlayerKnowledge,
  signAcademyCandidate,
  rejectAcademyCandidate,
  recallScoutMission,
  formatUsd,
  ACADEMY_CONTINENTS,
  ACADEMY_EUROPE_REGIONS,
  ACADEMY_DURATIONS_MONTHS,
  academyContinentLabel,
  academyCountryLabel,
  academyCountriesForContinent,
  academyEuropeRegionCountries,
  academyScoutMissionCost,
  PLAYER_SEARCH_PROFILES,
  playerSearchProfile,
} from '../career'

function firstCountryFor(continentId, europeRegionId) {
  if (continentId === 'europe') {
    return academyEuropeRegionCountries(europeRegionId)[0]?.id ?? ''
  }
  return academyCountriesForContinent(continentId)[0]?.id ?? ''
}

export default function AcademyView({ career, onCareerUpdate }) {
  const { lang } = useUiLang()
  const t = academyStrings(lang)
  const [continentId, setContinentId] = useState(ACADEMY_CONTINENTS[0]?.id ?? '')
  const [europeRegionId, setEuropeRegionId] = useState(ACADEMY_EUROPE_REGIONS[0]?.id ?? '')
  const [countryId, setCountryId] = useState(() =>
    firstCountryFor(ACADEMY_CONTINENTS[0]?.id, ACADEMY_EUROPE_REGIONS[0]?.id),
  )
  const [profileId, setProfileId] = useState('')
  const [durationMonths, setDurationMonths] = useState(ACADEMY_DURATIONS_MONTHS[0])
  const [scoutError, setScoutError] = useState(null)
  const [scoutMsg, setScoutMsg] = useState(null)
  const [actionError, setActionError] = useState(null)

  function handleContinentChange(nextContinentId) {
    setContinentId(nextContinentId)
    if (nextContinentId === 'europe') {
      const nextRegion = ACADEMY_EUROPE_REGIONS[0]?.id ?? ''
      setEuropeRegionId(nextRegion)
      setCountryId(firstCountryFor('europe', nextRegion))
    } else {
      setCountryId(firstCountryFor(nextContinentId))
    }
  }

  function handleEuropeRegionChange(nextRegionId) {
    setEuropeRegionId(nextRegionId)
    setCountryId(firstCountryFor('europe', nextRegionId))
  }

  const team = worldTeamById(career.world, career.playerTeamId)
  const prospects = team?.academyPlayers ?? []
  const candidates = team?.academyCandidates ?? []
  const academyLevel = getFacilityLevel(team, 'academy')
  const allPending = pendingScoutMissions(team)
  const pending = allPending.filter((m) => m.kind === 'academyProspect')

  function candidateHasActiveMission(candidateId) {
    return allPending.some(
      (m) =>
        (m.kind === 'academyProspect' && (m.candidateIds ?? []).includes(candidateId)) ||
        (m.kind === 'player' && m.targetPlayerId === candidateId),
    )
  }

  function handleSign(candidateId) {
    setActionError(null)
    const result = signAcademyCandidate(team, candidateId)
    if (!result.ok) {
      setActionError(t.promoteConfirmError)
      return
    }
    onCareerUpdate({ world: career.world })
  }

  function handleReject(candidateId) {
    setActionError(null)
    const result = rejectAcademyCandidate(team, candidateId)
    if (!result.ok) return
    onCareerUpdate({ world: career.world })
  }

  function handleKeepObserving(candidateId) {
    setActionError(null)
    const result = queueScoutMission(team, {
      kind: 'player',
      targetPlayerId: candidateId,
      date: career.league?.currentDate ?? null,
    })
    if (!result.ok) {
      if (result.error === 'capacity') setActionError(t.errorCapacity)
      else if (result.error === 'insufficient_funds') setActionError(t.errorInsufficientFunds)
      else setActionError(t.errorGeneric)
      return
    }
    onCareerUpdate({ world: career.world })
  }

  function handlePromote(playerId) {
    setActionError(null)
    const result = promoteAcademyPlayer(team, playerId, { league: career.league })
    if (!result.ok) {
      setActionError(t.promoteConfirmError)
      return
    }
    onCareerUpdate({ world: career.world })
  }

  function handleRelease(playerId) {
    setActionError(null)
    const result = releaseAcademyPlayer(team, playerId, career.world)
    if (!result.ok) return
    onCareerUpdate({ world: career.world })
  }

  function handleSendScout() {
    setScoutError(null)
    setScoutMsg(null)
    if (!countryId) {
      setScoutError(t.errorMissingCountry)
      return
    }
    const result = queueScoutMission(team, {
      kind: 'academyProspect',
      countryId,
      profileId: profileId || null,
      durationMonths,
      date: career.league?.currentDate ?? null,
    })
    if (!result.ok) {
      if (result.error === 'capacity') setScoutError(t.errorCapacity)
      else if (result.error === 'insufficient_funds') setScoutError(t.errorInsufficientFunds)
      else if (result.error === 'invalid_duration') setScoutError(t.errorInvalidDuration)
      else setScoutError(t.errorGeneric)
      return
    }
    setScoutMsg(t.scoutQueued)
    onCareerUpdate({ world: career.world })
  }

  function handleRecall(missionId) {
    setActionError(null)
    const result = recallScoutMission(team, missionId, career.league?.currentDate ?? null)
    if (!result.ok) return
    onCareerUpdate({ world: career.world })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ufa-text">{t.title}</h2>
        <p className="mt-1 text-sm text-ufa-muted">{t.intro}</p>
        <p className="mt-1 text-sm font-medium text-ufa-text">{t.academyLevelLabel(academyLevel)}</p>
      </div>

      <section className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
        <h3 className="font-semibold text-ufa-text mb-3">{t.prospectsTitle}</h3>
        {actionError && <p className="mb-3 text-sm text-red-400">{actionError}</p>}
        {prospects.length === 0 ? (
          <p className="text-sm text-ufa-muted">{t.prospectsEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ufa-muted">
                <tr className="border-b border-ufa-border">
                  <th className="px-2 py-2 font-medium">{t.colPlayer}</th>
                  <th className="px-2 py-2 font-medium">{t.colAge}</th>
                  <th className="px-2 py-2 font-medium">{t.colOvr}</th>
                  <th className="px-2 py-2 font-medium">{t.colPotential}</th>
                  <th className="px-2 py-2 font-medium">{t.colSource}</th>
                  <th className="px-2 py-2 font-medium">{t.colJoined}</th>
                  <th className="px-2 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {prospects.map((p) => {
                  const warning = t.ageOutWarning(p.age)
                  return (
                    <tr key={p.id} className="border-b border-ufa-border/70 hover:bg-ufa-bg/40">
                      <td className="px-2 py-2.5 font-medium text-ufa-text">{getPlayerFullName(p)}</td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {p.age}
                        {warning && <span className="ml-1.5 text-xs text-amber-400">{warning}</span>}
                      </td>
                      <td className="px-2 py-2.5 font-semibold tabular-nums text-ufa-accent">
                        {getOverallRating(p.skills)}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-ufa-muted">{p.potential ?? '—'}</td>
                      <td className="px-2 py-2.5 text-ufa-muted">
                        {p.academySource === 'scouted' ? t.sourceScouted : t.sourceIntake}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-ufa-muted">
                        {p.academyJoinedSeason ?? '—'}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handlePromote(p.id)}
                            className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-text hover:bg-ufa-panel-hover"
                          >
                            {t.promoteAction}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRelease(p.id)}
                            className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-text hover:bg-ufa-panel-hover"
                          >
                            {t.releaseAction}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
        <h3 className="font-semibold text-ufa-text mb-1">{t.candidatesTitle}</h3>
        <p className="mb-3 text-xs text-ufa-muted">{t.candidatesHint}</p>
        {candidates.length === 0 ? (
          <p className="text-sm text-ufa-muted">{t.candidatesEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ufa-muted">
                <tr className="border-b border-ufa-border">
                  <th className="px-2 py-2 font-medium">{t.colPlayer}</th>
                  <th className="px-2 py-2 font-medium">{t.colAge}</th>
                  <th className="px-2 py-2 font-medium">{t.colOvr}</th>
                  <th className="px-2 py-2 font-medium">{t.colPotentialShort}</th>
                  <th className="px-2 py-2 font-medium">{t.colCountry}</th>
                  <th className="px-2 py-2 font-medium">{t.colKnowledge}</th>
                  <th className="px-2 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const knowledge = getPlayerKnowledge(team, c.id)
                  const ovr = getOverallRating(c.skills)
                  const ovrDisplay = scoutedValueDisplay(ovr, knowledge, lang)
                  const room = (c.potential ?? ovr) - ovr
                  const potentialLabel = trainingRoomLabel(room, c.age, lang)
                  const busy = candidateHasActiveMission(c.id)
                  return (
                    <tr key={c.id} className="border-b border-ufa-border/70 hover:bg-ufa-bg/40">
                      <td className="px-2 py-2.5 font-medium text-ufa-text">{getPlayerFullName(c)}</td>
                      <td className="px-2 py-2.5 tabular-nums">{c.age}</td>
                      <td
                        className={`px-2 py-2.5 font-semibold tabular-nums ${
                          ovrDisplay.kind === 'exact' ? 'text-ufa-accent' : ovrDisplay.toneClass
                        }`}
                      >
                        {ovrDisplay.label}
                      </td>
                      <td className="px-2 py-2.5 text-ufa-muted">{potentialLabel}</td>
                      <td className="px-2 py-2.5 text-ufa-muted">{academyCountryLabel(c.academyCountry, lang)}</td>
                      <td className="px-2 py-2.5 tabular-nums">{knowledge}%</td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSign(c.id)}
                            className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-text hover:bg-ufa-panel-hover"
                          >
                            {t.signAction}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleKeepObserving(c.id)}
                            disabled={busy}
                            className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
                          >
                            {busy ? t.keepObservingPending : t.keepObservingAction}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(c.id)}
                            className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-text hover:bg-ufa-panel-hover"
                          >
                            {t.rejectAction}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
        <h3 className="font-semibold text-ufa-text mb-3">{t.sendScoutTitle}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-ufa-muted">
            {t.continentLabel}
            <select
              value={continentId}
              onChange={(e) => handleContinentChange(e.target.value)}
              className="rounded-md border border-ufa-border bg-ufa-bg px-2.5 py-1.5 text-sm text-ufa-text"
            >
              {ACADEMY_CONTINENTS.map((c) => (
                <option key={c.id} value={c.id}>
                  {academyContinentLabel(c.id, lang)}
                </option>
              ))}
            </select>
          </label>
          {continentId === 'europe' && (
            <label className="flex flex-col gap-1 text-sm text-ufa-muted">
              {t.europeRegionLabel}
              <select
                value={europeRegionId}
                onChange={(e) => handleEuropeRegionChange(e.target.value)}
                className="rounded-md border border-ufa-border bg-ufa-bg px-2.5 py-1.5 text-sm text-ufa-text"
              >
                {ACADEMY_EUROPE_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {lang === 'en' ? r.labelEn : r.labelPl}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm text-ufa-muted">
            {t.countryLabel}
            <select
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
              className="rounded-md border border-ufa-border bg-ufa-bg px-2.5 py-1.5 text-sm text-ufa-text"
            >
              {(continentId === 'europe'
                ? academyEuropeRegionCountries(europeRegionId)
                : academyCountriesForContinent(continentId)
              ).map((c) => (
                <option key={c.id} value={c.id}>
                  {academyCountryLabel(c.id, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-ufa-muted">
            {t.profileLabel}
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="rounded-md border border-ufa-border bg-ufa-bg px-2.5 py-1.5 text-sm text-ufa-text"
            >
              <option value="">{t.anyProfileOption}</option>
              {PLAYER_SEARCH_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {lang === 'en' ? p.labelEn : p.labelPl}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3">
          <p className="mb-1.5 text-sm text-ufa-muted">{t.durationLabel}</p>
          <div className="flex flex-wrap gap-1.5">
            {ACADEMY_DURATIONS_MONTHS.map((months) => (
              <button
                key={months}
                type="button"
                onClick={() => setDurationMonths(months)}
                className={`rounded-md border px-2.5 py-1.5 text-xs ${
                  durationMonths === months
                    ? 'border-ufa-accent bg-ufa-accent/10 text-ufa-accent'
                    : 'border-ufa-border text-ufa-text hover:bg-ufa-panel-hover'
                }`}
              >
                {t.monthsOption(months)} — {formatUsd(academyScoutMissionCost(team, countryId, months))}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSendScout}
          className="mt-3 rounded-md border border-ufa-border px-3 py-1.5 text-sm text-ufa-text hover:bg-ufa-panel-hover"
        >
          {t.sendScoutButton}
        </button>
        {scoutError && <p className="mt-2 text-sm text-red-400">{scoutError}</p>}
        {scoutMsg && <p className="mt-2 text-sm text-emerald-400">{scoutMsg}</p>}

        <h4 className="mt-4 text-sm font-semibold text-ufa-text">{t.pendingMissionsTitle}</h4>
        {pending.length === 0 ? (
          <p className="mt-1 text-sm text-ufa-muted">{t.noPendingMissions}</p>
        ) : (
          <ul className="mt-1 space-y-1.5 text-sm text-ufa-muted">
            {pending.map((m) => {
              const profile = m.profileId ? playerSearchProfile(m.profileId) : null
              const profileLabel = profile ? (lang === 'en' ? profile.labelEn : profile.labelPl) : null
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {academyCountryLabel(m.countryId, lang)}
                    {profileLabel ? ` · ${profileLabel}` : ''} ·{' '}
                    {m.recalling ? t.recalling : t.monthProgress(m.monthsElapsed ?? 0, m.monthsTotal ?? 1)}
                  </span>
                  {!m.recalling && (
                    <button
                      type="button"
                      onClick={() => handleRecall(m.id)}
                      className="rounded-md border border-ufa-border px-2.5 py-1 text-xs text-ufa-text hover:bg-ufa-panel-hover"
                    >
                      {t.recallAction}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
