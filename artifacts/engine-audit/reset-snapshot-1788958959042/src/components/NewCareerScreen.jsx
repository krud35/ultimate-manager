import { useEffect, useMemo, useState } from 'react'
import {
  HISTORICAL_YEARS,
  LEAGUE_TEAM_SLOTS,
  buildRawLeagueTeams,
  getYearMeta,
  selectRealTeamsForYear,
} from '../data/seasonLeagueBuilder'
import { EUCS_TIERS, eucsTeamsForTier } from '../data/eucsLeagueTeams'
import { careerFlowStrings } from '../ui/strings/careerFlow'
import { resolveTeamName } from '../ui/locale'
import TeamStartPreviewModal, {
  buildTeamStartPreview,
} from './TeamStartPreviewModal'
import EucsTeamPreviewModal from './EucsTeamPreviewModal'

export default function NewCareerScreen({
  slotIndex,
  lang,
  onCancel,
  onCreate,
  submitting = false,
  externalError = '',
}) {
  const t = careerFlowStrings(lang)
  const years = HISTORICAL_YEARS.length ? HISTORICAL_YEARS : [2025]
  const defaultYear = years.includes(2025) ? 2025 : years[years.length - 1]

  const [managerName, setManagerName] = useState('')
  const [competition, setCompetition] = useState('ufa')
  const [eucsTeamId, setEucsTeamId] = useState('')
  const [eucsPreviewTeamId, setEucsPreviewTeamId] = useState(null)
  const [eucsPreviewAnchorTop, setEucsPreviewAnchorTop] = useState(null)
  const eucsTiers = useMemo(
    () => EUCS_TIERS.map((tier) => ({ tier, teams: eucsTeamsForTier(tier) })),
    [],
  )
  const eucsPreviewTeam = useMemo(() => {
    if (!eucsPreviewTeamId) return null
    for (const { teams } of eucsTiers) {
      const found = teams.find((tm) => tm.id === eucsPreviewTeamId)
      if (found) return found
    }
    return null
  }, [eucsPreviewTeamId, eucsTiers])
  const [rosterMode, setRosterMode] = useState('historical')
  const [seasonYear, setSeasonYear] = useState(defaultYear)
  const [selectedTeamIds, setSelectedTeamIds] = useState(() =>
    selectRealTeamsForYear(defaultYear).map((team) => team.id),
  )
  const [playerTeamId, setPlayerTeamId] = useState('')
  const [swapOutId, setSwapOutId] = useState(null)
  const [previewTeamId, setPreviewTeamId] = useState(null)
  const [error, setError] = useState('')

  const defaultIds = useMemo(
    () => selectRealTeamsForYear(seasonYear).map((team) => team.id),
    [seasonYear],
  )

  useEffect(() => {
    setSelectedTeamIds(defaultIds)
    setSwapOutId(null)
    setPreviewTeamId(null)
  }, [defaultIds])

  const yearMeta = useMemo(() => getYearMeta(seasonYear), [seasonYear])
  const leaguePreview = useMemo(() => {
    try {
      return buildRawLeagueTeams(seasonYear, { selectedTeamIds })
    } catch {
      return {
        teams: [],
        realTeamCount: 0,
        fictionalCount: 0,
        benchTeams: [],
        selectedTeamIds: [],
        allSeasonTeams: [],
      }
    }
  }, [seasonYear, selectedTeamIds])

  const teams = leaguePreview.teams ?? []
  const benchTeams = leaguePreview.benchTeams ?? []
  const canSwap = benchTeams.length > 0

  useEffect(() => {
    if (!teams.length) {
      setPlayerTeamId('')
      return
    }
    setPlayerTeamId((prev) =>
      teams.some((team) => team.id === prev) ? prev : teams[0].id,
    )
  }, [teams])

  const selected = useMemo(
    () => teams.find((team) => team.id === playerTeamId) ?? null,
    [teams, playerTeamId],
  )

  const previewSource = useMemo(() => {
    if (!previewTeamId) return null
    return (
      teams.find((team) => team.id === previewTeamId) ??
      benchTeams.find((team) => team.id === previewTeamId) ??
      (leaguePreview.allSeasonTeams ?? []).find((team) => team.id === previewTeamId) ??
      null
    )
  }, [previewTeamId, teams, benchTeams, leaguePreview.allSeasonTeams])

  const teamPreview = useMemo(() => {
    if (!previewSource) return null
    return buildTeamStartPreview(previewSource, {
      rosterMode,
      seasonYear,
    })
  }, [previewSource, rosterMode, seasonYear])

  const fictionalFill = leaguePreview.fictionalCount ?? 0
  const yearShort = String(seasonYear + 1).slice(-2)
  const seasonRealCount = yearMeta?.realTeamCount ?? leaguePreview.realTeamCount ?? 0

  function handleSwap(outId, inId) {
    if (!outId || !inId) return
    setSelectedTeamIds((prev) => {
      if (prev.includes(inId)) return prev
      if (prev.includes(outId)) {
        return prev.map((id) => (id === outId ? inId : id))
      }
      return [...prev, inId].slice(0, LEAGUE_TEAM_SLOTS)
    })
    if (playerTeamId === outId) setPlayerTeamId(inId)
    setSwapOutId(null)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    const name = managerName.trim()
    if (!name) {
      setError(t.errManager)
      return
    }

    if (competition === 'eucs') {
      if (!eucsTeamId) {
        setError(t.errTeam)
        return
      }
      setError('')
      onCreate({
        slotIndex,
        managerName: name,
        playerTeamId: eucsTeamId,
        competition: 'eucs',
      })
      return
    }

    if (!playerTeamId) {
      setError(t.errTeam)
      return
    }
    setError('')
    onCreate({
      slotIndex,
      managerName: name,
      playerTeamId,
      seasonYear,
      rosterMode,
      selectedTeamIds,
      competition: 'ufa',
    })
  }

  function recordHint(team) {
    if (team.isFictional || team.wins == null || team.losses == null) return null
    return `${team.wins}–${team.losses}`
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:px-6 league-fade-in">
      <button
        type="button"
        onClick={onCancel}
        className="mb-6 self-start text-sm text-ufa-muted hover:text-ufa-accent"
      >
        {t.newBack}
      </button>

      <h1 className="text-2xl font-bold text-ufa-text">{t.newTitle(slotIndex + 1)}</h1>
      <p className="mt-2 text-sm text-ufa-muted">
        {competition === 'eucs' ? t.eucsIntro : t.newIntro(seasonYear, yearShort)}
      </p>

      {competition === 'ufa' && (
        <div className="mt-4 rounded-xl border border-ufa-border bg-ufa-panel px-4 py-3 text-sm text-ufa-muted">
          {t.leagueSlotsInfo}
        </div>
      )}

      <fieldset className="mt-6">
        <legend className="text-sm font-medium text-ufa-text">{t.competitionLabel}</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            { id: 'ufa', title: t.competitionUfa, desc: t.competitionUfaDesc },
            { id: 'eucs', title: t.competitionEucs, desc: t.competitionEucsDesc },
          ].map((opt) => {
            const active = competition === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCompetition(opt.id)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  active
                    ? 'border-ufa-accent bg-ufa-accent/10 shadow-md shadow-ufa-accent/10'
                    : 'border-ufa-border bg-ufa-panel hover:bg-ufa-panel-hover'
                }`}
              >
                <p className="font-semibold text-ufa-text">{opt.title}</p>
                <p className="mt-1 text-xs text-ufa-muted">{opt.desc}</p>
              </button>
            )
          })}
        </div>
      </fieldset>

      <form onSubmit={handleSubmit} className="mt-8 space-y-8">
        <label className="block">
          <span className="text-sm font-medium text-ufa-text">{t.managerName}</span>
          <input
            type="text"
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            maxLength={32}
            placeholder={t.managerPlaceholder}
            className="mt-2 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text outline-none focus:border-ufa-accent"
          />
        </label>

        {competition === 'eucs' ? (
          <fieldset>
            <legend className="text-sm font-medium text-ufa-text">{t.eucsPickTeam}</legend>
            <div className="mt-3 space-y-6">
              {eucsTiers.map(({ tier, teams }) => (
                <div key={tier}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ufa-muted">
                    {t.eucsTierLabel(tier)}
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {teams.map((team) => {
                      const active = team.id === eucsTeamId
                      return (
                        <div
                          key={team.id}
                          className={`rounded-xl border p-4 transition-all ${
                            active
                              ? 'border-ufa-accent bg-ufa-accent/10 shadow-md shadow-ufa-accent/10'
                              : 'border-ufa-border bg-ufa-panel'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setEucsTeamId(team.id)}
                            className="w-full text-left"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold text-white"
                                style={{ backgroundColor: team.primaryColor }}
                              >
                                {team.shortName}
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold text-ufa-text truncate">{team.name}</p>
                              </div>
                            </div>
                          </button>
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                setEucsPreviewAnchorTop(e.currentTarget.getBoundingClientRect().top)
                                setEucsPreviewTeamId(team.id)
                              }}
                              className="w-full rounded-md border border-ufa-border px-2 py-1.5 text-xs font-medium text-ufa-accent hover:bg-ufa-accent/10"
                            >
                              {t.previewProfile}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        ) : (
        <>
        <fieldset>
          <legend className="text-sm font-medium text-ufa-text">{t.rosterMode}</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              {
                id: 'historical',
                title: t.rosterHistorical,
                desc: t.rosterHistoricalDesc,
              },
              {
                id: 'random',
                title: t.rosterRandom,
                desc: t.rosterRandomDesc,
              },
            ].map((opt) => {
              const active = rosterMode === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRosterMode(opt.id)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    active
                      ? 'border-ufa-accent bg-ufa-accent/10 shadow-md shadow-ufa-accent/10'
                      : 'border-ufa-border bg-ufa-panel hover:bg-ufa-panel-hover'
                  }`}
                >
                  <p className="font-semibold text-ufa-text">{opt.title}</p>
                  <p className="mt-1 text-xs text-ufa-muted">{opt.desc}</p>
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-sm font-medium text-ufa-text">{t.startYear}</span>
          <select
            value={seasonYear}
            onChange={(e) => setSeasonYear(Number(e.target.value))}
            className="mt-2 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text outline-none focus:border-ufa-accent"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}/{String(y + 1).slice(-2)}
                {getYearMeta(y)?.realTeamCount != null
                  ? ` · ${getYearMeta(y).realTeamCount} ${t.realTeamsShort}`
                  : ''}
              </option>
            ))}
          </select>
        </label>

        {yearMeta?.note ? (
          <p className="text-xs text-ufa-muted -mt-4">{yearMeta.note}</p>
        ) : null}

        {fictionalFill > 0 && (
          <div className="rounded-xl border border-ufa-gold/40 bg-ufa-gold/10 px-4 py-3 text-sm text-ufa-text">
            <p className="font-semibold text-ufa-gold">{t.fictionalFillTitle}</p>
            <p className="mt-1 text-xs text-ufa-muted">
              {t.fictionalFillBody(seasonRealCount, fictionalFill, LEAGUE_TEAM_SLOTS)}
            </p>
          </div>
        )}

        <fieldset>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <legend className="text-sm font-medium text-ufa-text">
              {t.activeLeague} · {t.team}
            </legend>
            {canSwap && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTeamIds(defaultIds)
                  setSwapOutId(null)
                }}
                className="text-xs text-ufa-muted hover:text-ufa-accent"
              >
                {t.resetLeague}
              </button>
            )}
          </div>

          {canSwap && (
            <p className="mt-2 text-xs text-ufa-muted">{t.benchHint(benchTeams.length)}</p>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {teams.map((team) => {
              const active = team.id === playerTeamId
              const swapping = swapOutId === team.id
              const rec = recordHint(team)
              return (
                <div
                  key={team.id}
                  className={`rounded-xl border p-4 transition-all ${
                    active
                      ? 'border-ufa-accent bg-ufa-accent/10 shadow-md shadow-ufa-accent/10'
                      : swapping
                        ? 'border-ufa-gold/50 bg-ufa-gold/5'
                        : 'border-ufa-border bg-ufa-panel'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setPlayerTeamId(team.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold text-white"
                        style={{ backgroundColor: team.primaryColor }}
                      >
                        {team.shortName}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-ufa-text truncate">
                          {resolveTeamName(team, lang)}
                        </p>
                        <p className="text-xs text-ufa-muted">
                          {t.rosterCount(team.players?.length ?? 0)}
                          {rec ? ` · ${rec}` : ''}
                          {team.isFictional ? ` · ${t.fictionalBadge}` : ''}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewTeamId(team.id)}
                      className="flex-1 rounded-md border border-ufa-border px-2 py-1.5 text-xs font-medium text-ufa-accent hover:bg-ufa-accent/10"
                    >
                      {t.previewProfile}
                    </button>
                    {canSwap && (
                      <button
                        type="button"
                        onClick={() => setSwapOutId(swapping ? null : team.id)}
                        className="flex-1 rounded-md border border-ufa-border px-2 py-1.5 text-xs font-medium text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text"
                      >
                        {swapping ? t.swapCancel : t.swap}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </fieldset>

        {swapOutId && canSwap && (
          <div className="rounded-xl border border-ufa-gold/40 bg-ufa-panel p-4 shadow-lg shadow-black/20">
            <p className="text-sm font-semibold text-ufa-text">{t.swapPick}</p>
            <p className="mt-1 text-xs text-ufa-muted">{t.benchTitle}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 max-h-64 overflow-y-auto">
              {benchTeams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center gap-1 rounded-lg border border-ufa-border bg-ufa-bg"
                >
                  <button
                    type="button"
                    onClick={() => handleSwap(swapOutId, team.id)}
                    className="min-w-0 flex-1 px-3 py-2 text-left text-sm hover:bg-ufa-accent/10"
                  >
                    <span className="font-medium text-ufa-text">
                      {resolveTeamName(team, lang)}
                    </span>
                    <span className="ml-2 text-xs text-ufa-muted">
                      {recordHint(team) ?? t.rosterCount(team.players?.length ?? 0)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTeamId(team.id)}
                    className="shrink-0 px-2 py-2 text-xs text-ufa-accent hover:underline"
                    title={t.previewProfile}
                  >
                    {t.previewProfile}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <p className="text-sm text-ufa-muted">
            {t.startWithBefore}
            <span className="font-medium text-ufa-text">{resolveTeamName(selected, lang)}</span>
            {t.startWithAfter(seasonYear)}
            {rosterMode === 'random' ? ` ${t.startRandomHint}` : ` ${t.startHistoricalHint}`}{' '}
            <button
              type="button"
              onClick={() => setPreviewTeamId(selected.id)}
              className="text-ufa-accent hover:underline"
            >
              {t.previewProfile} →
            </button>
          </p>
        )}
        </>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        {externalError && <p className="text-sm text-red-400">{externalError}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-ufa-accent px-5 py-2.5 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? t.startingCareer : t.startCareer}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border border-ufa-border px-5 py-2.5 text-sm text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text disabled:opacity-50"
          >
            {t.cancel}
          </button>
        </div>
      </form>

      {teamPreview && (
        <TeamStartPreviewModal
          preview={teamPreview}
          lang={lang}
          labels={t}
          onClose={() => setPreviewTeamId(null)}
          onSelect={(id) => {
            setPlayerTeamId(id)
            setPreviewTeamId(null)
          }}
        />
      )}

      {eucsPreviewTeam && (
        <EucsTeamPreviewModal
          team={eucsPreviewTeam}
          t={t}
          anchorTop={eucsPreviewAnchorTop}
          onClose={() => setEucsPreviewTeamId(null)}
          onSelect={(id) => {
            setEucsTeamId(id)
            setEucsPreviewTeamId(null)
          }}
        />
      )}
    </div>
  )
}
