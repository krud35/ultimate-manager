import ThemeControl from '../ui/ThemeControl'
import Wordmark from '../ui/Wordmark'
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
      <article className="um-save-slot">
        <p className="text-xs font-medium uppercase tracking-wide text-ufa-muted">
          {t.slotLabel(slotIndex + 1)}
        </p>
        <h3 className="mt-3 text-lg font-semibold text-ufa-text">{t.emptyTitle}</h3>
        <p className="mt-1 flex-1 text-sm text-ufa-muted">{t.emptyHint}</p>
        <button
          type="button"
          onClick={() => onNew(slotIndex)}
          className="um-button um-button--primary mt-5"
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
    <article className="um-save-slot">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ufa-muted">
          {t.slotLabel(slotIndex + 1)}
        </p>
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
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
          className="um-button um-button--primary"
        >
          {t.load}
        </button>
        <button
          type="button"
          onClick={() => onDelete(slotIndex)}
          className="um-button"
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
    <div className="um-career-start">
      <div className="um-career-top"><Wordmark /><div className="flex flex-wrap items-center gap-4"><LangSwitch lang={lang} onChange={onLangChange} /><ThemeControl /></div></div>
      <header className="um-career-intro"><p className="um-eyebrow">{lang === 'en' ? 'Your club. Your decisions.' : 'Twój klub. Twoje decyzje.'}</p><h1>{lang === 'en' ? <>Every season.<br />Every point.</> : <>Każdy sezon.<br />Każdy punkt.</>}</h1><p>{t.selectSubtitle(SLOT_COUNT)}</p></header>

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

      <footer className="mt-auto pt-12 pb-2 text-center text-[11px] leading-relaxed text-ufa-muted">
        <p className="mt-1.5">{t.disclaimer}</p>
      </footer>
    </div>
  )
}
