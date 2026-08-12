import { useMemo, useState } from 'react'
import {
  ensureUltiworld,
  unreadUltiworldCount,
  markUltiworldRead,
  markAllUltiworldRead,
} from '../career/ultiworld.js'
import { useUiLang } from '../ui/UiLangContext'
import { UI_LANG, pickCopy } from '../ui/locale'
import { ultiworldChromeStrings } from '../ui/strings/ultiworldChrome'

const CATEGORY_STYLE = {
  match: 'border-ufa-accent/40 bg-ufa-accent/10 text-ufa-accent',
  round: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  cup: 'border-ufa-gold/40 bg-ufa-gold/10 text-ufa-gold',
  awards: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
  power_rankings: 'border-violet-400/40 bg-violet-500/10 text-violet-300',
  feature: 'border-ufa-border bg-ufa-bg text-ufa-muted',
  breaking: 'border-red-400/40 bg-red-500/10 text-red-300',
}

const FILTER_IDS = [
  'all',
  'unread',
  'match',
  'round',
  'cup',
  'awards',
  'power_rankings',
  'breaking',
  'feature',
]

function formatDay(iso, lang) {
  if (!iso) return '—'
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(
      lang === UI_LANG.EN ? 'en-US' : 'pl-PL',
      { day: 'numeric', month: 'short', year: 'numeric' },
    )
  } catch {
    return iso
  }
}

export default function UltiworldView({ career, onUltiworldChange }) {
  const { lang } = useUiLang()
  const t = ultiworldChromeStrings(lang)
  const uw = ensureUltiworld(career)
  const unread = unreadUltiworldCount(career)
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  const filtered = useMemo(() => {
    let list = uw.articles ?? []
    if (filter === 'unread') list = list.filter((a) => !a.read)
    else if (filter !== 'all') list = list.filter((a) => a.category === filter)
    return list
  }, [uw.articles, filter])

  const selected = filtered.find((a) => a.id === selectedId) ?? filtered[0] ?? null

  const selectArticle = (article) => {
    setSelectedId(article.id)
    if (!article.read && onUltiworldChange) {
      onUltiworldChange(markUltiworldRead(uw, article.id))
    }
  }

  const categoryLabel = (id) => t.categories[id] ?? id
  const impactTag = lang === UI_LANG.EN ? ' · impact' : ' · wpływ'

  return (
    <div className="space-y-6 league-fade-in">
      <div className="overflow-hidden rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30">
        <div className="relative border-b border-ufa-border bg-gradient-to-br from-ufa-bg via-ufa-panel to-ufa-bg px-5 py-6 sm:px-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, transparent, transparent 11px, currentColor 11px, currentColor 12px)',
            }}
          />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ufa-accent">
                {t.tagline}
              </p>
              <h2 className="mt-1 font-black tracking-tight text-ufa-text text-3xl sm:text-4xl">
                {t.brand}
              </h2>
              <p className="mt-2 max-w-xl text-sm text-ufa-muted">
                {t.intro}
                {unread > 0 ? <span className="text-ufa-accent">{t.unread(unread)}</span> : null}
              </p>
            </div>
            <button
              type="button"
              disabled={unread === 0}
              onClick={() => onUltiworldChange?.(markAllUltiworldRead(uw))}
              className="rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
            >
              {t.markRead}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-ufa-border px-4 py-3 sm:px-6">
          {FILTER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === id
                  ? 'bg-ufa-accent text-ufa-bg'
                  : 'border border-ufa-border text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text'
              }`}
            >
              {t.filters[id]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-10 text-center shadow-xl shadow-black/30">
          <p className="text-sm text-ufa-muted">
            {(uw.articles ?? []).length === 0 ? t.emptyAll : t.emptyFilter}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="overflow-hidden rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30">
            <ul className="max-h-[70vh] divide-y divide-ufa-border/80 overflow-y-auto">
              {filtered.map((article) => {
                const style = CATEGORY_STYLE[article.category] ?? CATEGORY_STYLE.feature
                const active = selected?.id === article.id
                return (
                  <li key={article.id}>
                    <button
                      type="button"
                      onClick={() => selectArticle(article)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        active ? 'bg-ufa-accent/10' : 'hover:bg-ufa-panel-hover'
                      } ${!article.read ? 'border-l-2 border-l-ufa-accent' : 'border-l-2 border-l-transparent'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${style}`}
                        >
                          {categoryLabel(article.category)}
                          {article.impact ? impactTag : ''}
                        </span>
                        <span className="shrink-0 text-[11px] text-ufa-muted">
                          {formatDay(article.date, lang)}
                        </span>
                      </div>
                      <p
                        className={`mt-1.5 text-sm leading-snug ${
                          article.read ? 'text-ufa-muted' : 'font-semibold text-ufa-text'
                        }`}
                      >
                        {pickCopy(article, 'headline', lang)}
                      </p>
                      {pickCopy(article, 'dek', lang) ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-ufa-muted">
                          {pickCopy(article, 'dek', lang)}
                        </p>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <article className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-xl shadow-black/30 sm:p-7">
            {selected ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      CATEGORY_STYLE[selected.category] ?? CATEGORY_STYLE.feature
                    }`}
                  >
                    {categoryLabel(selected.category)}
                  </span>
                  <span className="text-xs text-ufa-muted">{formatDay(selected.date, lang)}</span>
                  <span className="text-xs text-ufa-muted">· {t.site}</span>
                </div>
                <h3 className="mt-3 text-xl font-bold leading-snug text-ufa-text sm:text-2xl">
                  {pickCopy(selected, 'headline', lang)}
                </h3>
                {pickCopy(selected, 'dek', lang) ? (
                  <p className="mt-2 text-sm font-medium text-ufa-accent/90">
                    {pickCopy(selected, 'dek', lang)}
                  </p>
                ) : null}
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-ufa-muted whitespace-pre-line">
                  {pickCopy(selected, 'body', lang)}
                </div>
                {selected.effectsSummary || selected.effectsSummaryEn ? (
                  <p className="mt-4 rounded-lg border border-ufa-gold/30 bg-ufa-gold/5 px-3 py-2 text-xs text-ufa-gold">
                    {t.impact} {pickCopy(selected, 'effectsSummary', lang)}
                  </p>
                ) : null}
                {selected.tags?.length ? (
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {selected.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded border border-ufa-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-ufa-muted"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-ufa-muted">{t.pickArticle}</p>
            )}
          </article>
        </div>
      )}
    </div>
  )
}
