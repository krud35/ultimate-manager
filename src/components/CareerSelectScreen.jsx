import { SLOT_COUNT, slotSummary } from '../career'
import { teamById } from '../data/ufaLeagueTeams'
import { displaySeasonLabel, formatUiDate } from '../ui/locale'
import { LangSwitch } from '../ui/LangSwitch'
import { careerFlowStrings } from '../ui/strings/careerFlow'

function SlotCard({ slotIndex, career, lang, t, onNew, onLoad, onDelete }) {
  const summary = slotSummary(career)
  const team =
    (summary?.playerTeamId && career?.world?.teamsById?.[summary.playerTeamId]) ||
    (summary ? teamById(summary.playerTeamId) : null)

  if (!summary) {
    return (
      <article className="flex flex-col rounded-xl border border-dashed border-ufa-border bg-ufa-panel/60 p-5 shadow-lg shadow-black/20">
        <p className="text-xs font-medium uppercase tracking-wide text-ufa-muted">
          {t.slotLabel(slotIndex + 1)}
        </p>
        <h3 className="mt-3 text-lg font-semibold text-ufa-text">{t.emptyTitle}</h3>
        <p className="mt-1 flex-1 text-sm text-ufa-muted">{t.emptyHint}</p>
        <button
          type="button"
          onClick={() => onNew(slotIndex)}
          className="mt-5 rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
        >
          {t.newCareer}
        </button>
      </article>
    )
  }

  const seasonLine = t.careerSeason(
    displaySeasonLabel(summary.seasonLabel, lang),
    summary.seasonIndex,
  )

  return (
    <article className="flex flex-col rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-xl shadow-black/30">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ufa-muted">
          {t.slotLabel(slotIndex + 1)}
        </p>
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            summary.phase === 'season_complete'
              ? 'bg-ufa-gold/20 text-ufa-gold'
              : 'bg-ufa-accent/15 text-ufa-accent'
          }`}
        >
          {summary.phase === 'season_complete' ? t.phaseComplete : t.phaseActive}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-semibold text-ufa-text">{summary.managerName}</h3>
      <p className="mt-1 text-sm text-ufa-text">
        <span
          className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
          style={{ backgroundColor: team?.primaryColor ?? '#64748b' }}
        />
        {team?.name ?? summary.playerTeamId}
      </p>
      <p className="mt-2 text-sm text-ufa-muted">{seasonLine}</p>
      <p className="text-sm text-ufa-muted">
        {t.record(summary.wins, summary.losses)}
        {summary.seasonsPlayed > 0 ? ` · ${t.seasonsCompleted(summary.seasonsPlayed)}` : ''}
      </p>
      <p className="mt-1 text-xs text-ufa-muted">
        {t.savedAt(formatUiDate(summary.updatedAt, lang))}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onLoad(slotIndex)}
          className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
        >
          {t.load}
        </button>
        <button
          type="button"
          onClick={() => onDelete(slotIndex)}
          className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text"
        >
          {t.delete}
        </button>
      </div>
    </article>
  )
}

export default function CareerSelectScreen({ slots, lang, onLangChange, onNew, onLoad, onDelete }) {
  const list = Array.from({ length: SLOT_COUNT }, (_, i) => slots?.[i] ?? null)
  const t = careerFlowStrings(lang)

  return (
    <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-10 sm:px-6 league-fade-in">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <LangSwitch lang={lang} onChange={onLangChange} />
      </div>

      <header className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-ufa-accent to-ufa-accent-dim text-2xl font-black text-ufa-bg shadow-lg shadow-ufa-accent/25">
          U
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-ufa-text">{t.appName}</h1>
        <p className="mt-2 text-sm text-ufa-muted">{t.selectSubtitle(SLOT_COUNT)}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {list.map((career, index) => (
          <SlotCard
            key={index}
            slotIndex={index}
            career={career}
            lang={lang}
            t={t}
            onNew={onNew}
            onLoad={onLoad}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
