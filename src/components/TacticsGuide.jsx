import { useMemo, useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { pickCopy, pickLabel, UI_LANG } from '../ui/locale'
import { getTacticsGuideStrings } from '../ui/strings/tacticsGuide'
import {
  TACTICS_GUIDE_CATEGORIES,
  TACTICS_GUIDE_ENTRIES,
  TACTICS_GUIDE_SOURCES,
  getEntriesByCategory,
  getEngineCoverage,
  getEntryById,
  getLoadouts,
} from '../data/tacticsGuide'

const ACCENT = {
  sky: {
    tab: 'data-[active=true]:bg-sky-500/20 data-[active=true]:text-sky-200 data-[active=true]:ring-sky-500/40',
    badge: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
    border: 'border-sky-500/30',
  },
  orange: {
    tab: 'data-[active=true]:bg-orange-500/20 data-[active=true]:text-orange-200 data-[active=true]:ring-orange-500/40',
    badge: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
    border: 'border-orange-500/30',
  },
  amber: {
    tab: 'data-[active=true]:bg-amber-500/20 data-[active=true]:text-amber-200 data-[active=true]:ring-amber-500/40',
    badge: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
    border: 'border-amber-500/30',
  },
  violet: {
    tab: 'data-[active=true]:bg-violet-500/20 data-[active=true]:text-violet-200 data-[active=true]:ring-violet-500/40',
    badge: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
    border: 'border-violet-500/30',
  },
  emerald: {
    tab: 'data-[active=true]:bg-emerald-500/20 data-[active=true]:text-emerald-200 data-[active=true]:ring-emerald-500/40',
    badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    border: 'border-emerald-500/30',
  },
}

/** @param {object} entry @param {string} field @param {string} lang */
function pickField(entry, field, lang) {
  if (!entry) return ''
  if (lang === UI_LANG.EN) return entry[`${field}En`] ?? entry[field] ?? ''
  return entry[field] ?? entry[`${field}En`] ?? ''
}

/** @param {object} entry @param {string} field @param {string} lang */
function pickList(entry, field, lang) {
  if (!entry) return []
  if (lang === UI_LANG.EN) return entry[`${field}En`] ?? entry[field] ?? []
  return entry[field] ?? entry[`${field}En`] ?? []
}

function EngineBadge({ entry, t }) {
  const coverage = getEngineCoverage()
  const inEngine =
    coverage.attackStyles.includes(entry.id) ||
    coverage.defenseStyles.includes(entry.id) ||
    coverage.forceSides.includes(entry.id) ||
    (entry.engineId &&
      (coverage.attackStyles.includes(entry.engineId) ||
        coverage.defenseStyles.includes(entry.engineId) ||
        coverage.forceSides.includes(entry.engineId)))

  return inEngine ? (
    <span className="rounded-full bg-ufa-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ufa-accent ring-1 ring-ufa-accent/30">
      {t.inGameBadge}
    </span>
  ) : (
    <span className="rounded-full bg-ufa-panel-hover px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ufa-muted ring-1 ring-ufa-border">
      {t.descBadge}
    </span>
  )
}

function BulletList({ items, tone = 'muted' }) {
  if (!items?.length) return null
  const color =
    tone === 'good'
      ? 'text-emerald-300/90'
      : tone === 'bad'
        ? 'text-red-300/90'
        : 'text-ufa-muted'
  return (
    <ul className={`mt-2 space-y-1.5 text-sm leading-relaxed ${color}`}>
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function SectionTitle({ children }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-ufa-muted">{children}</h4>
  )
}

function TacticCard({ entry, accent, selected, onSelect, lang, t }) {
  const styles = ACCENT[accent] ?? ACCENT.sky
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 text-left transition-all ${
        selected
          ? `${styles.border} bg-ufa-panel-hover ring-1 ring-ufa-accent/40`
          : 'border-ufa-border bg-ufa-bg/40 hover:border-ufa-muted hover:bg-ufa-panel-hover'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ufa-text">{pickLabel(entry, lang)}</p>
        </div>
        <EngineBadge entry={entry} t={t} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ufa-muted">
        {pickField(entry, 'summary', lang)}
      </p>
    </button>
  )
}

function TacticDetail({ entry, accent, lang, t }) {
  if (!entry) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-ufa-border bg-ufa-panel/50 p-8 text-center text-sm text-ufa-muted">
        {t.emptyDetail}
      </div>
    )
  }

  const styles = ACCENT[accent] ?? ACCENT.sky
  const pairNames = entry.pairsWellWith
    .map((id) => {
      const e = getEntryById(id)
      return e ? pickLabel(e, lang) : id
    })
    .filter(Boolean)
  const conflictNames = entry.conflictsWith
    .map((id) => {
      const e = getEntryById(id)
      return e ? pickLabel(e, lang) : id
    })
    .filter(Boolean)

  const behaviors = pickList(entry, 'playerBehaviors', lang)
  const impacts = pickList(entry, 'matchImpact', lang)

  return (
    <article className="space-y-5 rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-xl shadow-black/20 sm:p-6">
      <header className="space-y-2 border-b border-ufa-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${styles.badge}`}>
            {pickLabel(TACTICS_GUIDE_CATEGORIES.find((c) => c.id === entry.category), lang)}
          </span>
          <EngineBadge entry={entry} t={t} />
        </div>
        <h3 className="text-xl font-bold text-ufa-text">{pickLabel(entry, lang)}</h3>
        <p className="text-sm leading-relaxed text-ufa-text/90">
          {pickField(entry, 'description', lang)}
        </p>
      </header>

      <section>
        <SectionTitle>{t.howItWorks}</SectionTitle>
        <BulletList items={pickList(entry, 'howItWorks', lang)} />
      </section>

      <section>
        <SectionTitle>{t.playerBehaviors}</SectionTitle>
        <div className="mt-2 space-y-2">
          {behaviors.map((row) => (
            <div
              key={`${row.role}-${row.behavior}`}
              className="rounded-lg border border-ufa-border/80 bg-ufa-bg/50 px-3 py-2.5"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-ufa-accent">{row.role}</p>
              <p className="mt-1 text-sm leading-relaxed text-ufa-muted">{row.behavior}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>{t.matchImpact}</SectionTitle>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {impacts.map((row) => (
            <div
              key={row.label}
              className="rounded-lg border border-ufa-border/80 bg-ufa-bg/50 px-3 py-2.5"
            >
              <p className="text-sm font-medium text-ufa-text">{row.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-ufa-muted">{row.effect}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <SectionTitle>{t.pros}</SectionTitle>
          <BulletList items={pickList(entry, 'pros', lang)} tone="good" />
        </section>
        <section>
          <SectionTitle>{t.cons}</SectionTitle>
          <BulletList items={pickList(entry, 'cons', lang)} tone="bad" />
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <SectionTitle>{t.suggestedWhen}</SectionTitle>
          <BulletList items={pickList(entry, 'suggestedWhen', lang)} tone="good" />
        </section>
        <section>
          <SectionTitle>{t.avoidWhen}</SectionTitle>
          <BulletList items={pickList(entry, 'avoidWhen', lang)} tone="bad" />
        </section>
      </div>

      {(pairNames.length > 0 || conflictNames.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {pairNames.length > 0 && (
            <section>
              <SectionTitle>{t.pairsWell}</SectionTitle>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pairNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 ring-1 ring-emerald-500/25"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </section>
          )}
          {conflictNames.length > 0 && (
            <section>
              <SectionTitle>{t.conflicts}</SectionTitle>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {conflictNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-300 ring-1 ring-red-500/25"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {(entry.engineStatus || entry.engineStatusEn) && (
        <section className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
          <SectionTitle>{t.engineStatus}</SectionTitle>
          <p className="mt-1.5 text-sm leading-relaxed text-amber-100/80">
            {pickField(entry, 'engineStatus', lang)}
          </p>
        </section>
      )}

      {entry.sources?.length > 0 && (
        <section>
          <SectionTitle>{t.sources}</SectionTitle>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.sources.map((sid) => {
              const src = TACTICS_GUIDE_SOURCES.find((s) => s.id === sid)
              if (!src) return null
              return (
                <a
                  key={sid}
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-ufa-bg px-2 py-1 text-xs text-ufa-muted ring-1 ring-ufa-border transition hover:text-ufa-accent hover:ring-ufa-accent/40"
                >
                  {pickLabel(src, lang) || src.label}
                </a>
              )
            })}
          </div>
        </section>
      )}
    </article>
  )
}

function LoadoutCard({ loadout, lang }) {
  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-lg shadow-black/20">
      <h3 className="font-semibold text-ufa-text">{pickLabel(loadout, lang)}</h3>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[loadout.attackEntry, loadout.defenseEntry, loadout.forceEntry]
          .filter(Boolean)
          .map((e) => (
            <span
              key={e.id}
              className="rounded-md bg-ufa-bg px-2 py-1 text-xs text-ufa-text ring-1 ring-ufa-border"
            >
              {pickLabel(e, lang)}
            </span>
          ))}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ufa-muted">
        {pickCopy(loadout, 'why', lang)}
      </p>
    </div>
  )
}

export default function TacticsGuide() {
  const { lang } = useUiLang()
  const t = useMemo(() => getTacticsGuideStrings(lang), [lang])

  const [categoryId, setCategoryId] = useState('offense')
  const [selectedId, setSelectedId] = useState('vertical_stack')
  const [view, setView] = useState('catalog') // catalog | loadouts | sources

  const category = TACTICS_GUIDE_CATEGORIES.find((c) => c.id === categoryId)
  const entries = useMemo(() => getEntriesByCategory(categoryId), [categoryId])
  const selected = useMemo(() => getEntryById(selectedId), [selectedId])
  const loadouts = useMemo(() => getLoadouts(), [])
  const coverage = getEngineCoverage()

  const handleCategory = (id) => {
    setCategoryId(id)
    const first = getEntriesByCategory(id)[0]
    if (first) setSelectedId(first.id)
    setView('catalog')
  }

  const viewTabs = [
    { id: 'catalog', label: t.catalog },
    { id: 'loadouts', label: t.loadouts },
    { id: 'sources', label: t.sources },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-lg font-semibold text-ufa-text">{t.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ufa-muted">
              {t.introBefore}{' '}
              <span className="text-ufa-text">{t.introEngineNote}</span>
              {t.introAfter}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-ufa-accent/10 px-2.5 py-1 text-ufa-accent ring-1 ring-ufa-accent/30">
              {t.coverageBadge(
                coverage.attackStyles.length,
                coverage.defenseStyles.length,
                coverage.forceSides.length,
              )}
            </span>
            <span className="rounded-md bg-ufa-bg px-2.5 py-1 text-ufa-muted ring-1 ring-ufa-border">
              {t.encyclopediaBadge(TACTICS_GUIDE_ENTRIES.length)}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1 rounded-lg bg-ufa-bg p-1 ring-1 ring-ufa-border">
          {viewTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                view === tab.id
                  ? 'bg-ufa-accent text-ufa-bg'
                  : 'text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'catalog' && (
        <>
          <nav className="flex flex-wrap gap-1.5">
            {TACTICS_GUIDE_CATEGORIES.map((cat) => {
              const styles = ACCENT[cat.accent] ?? ACCENT.sky
              const active = categoryId === cat.id
              return (
                <button
                  key={cat.id}
                  type="button"
                  data-active={active}
                  onClick={() => handleCategory(cat.id)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium text-ufa-muted ring-1 ring-ufa-border transition hover:text-ufa-text ${styles.tab}`}
                >
                  {pickLabel(cat, lang)}{' '}
                </button>
              )
            })}
          </nav>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wider text-ufa-muted">
                {pickLabel(category, lang)} · {entries.length}
              </p>
              {entries.map((entry) => (
                <TacticCard
                  key={entry.id}
                  entry={entry}
                  accent={category?.accent ?? 'sky'}
                  selected={selectedId === entry.id}
                  onSelect={() => setSelectedId(entry.id)}
                  lang={lang}
                  t={t}
                />
              ))}
            </div>
            <TacticDetail
              entry={selected}
              accent={category?.accent ?? 'sky'}
              lang={lang}
              t={t}
            />
          </div>
        </>
      )}

      {view === 'loadouts' && (
        <div className="space-y-4">
          <p className="text-sm text-ufa-muted">{t.loadoutsIntro}</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {loadouts.map((l) => (
              <LoadoutCard key={l.id} loadout={l} lang={lang} />
            ))}
          </div>
        </div>
      )}

      {view === 'sources' && (
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
          <h3 className="font-semibold text-ufa-text">{t.sourcesTitle}</h3>
          <p className="mt-1 text-sm text-ufa-muted">{t.sourcesIntro}</p>
          <ul className="mt-4 space-y-2">
            {TACTICS_GUIDE_SOURCES.map((src) => (
              <li key={src.id}>
                <a
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-ufa-accent hover:underline"
                >
                  {pickLabel(src, lang) || src.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-ufa-muted">{t.sourcesFooter}</p>
        </div>
      )}
    </div>
  )
}
