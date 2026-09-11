import { useEffect, useState } from 'react'
import { TUTORIAL_LOOP, TUTORIAL_SECTIONS, TUTORIAL_TIPS } from '../data/tutorialGuide'
import { pickCopy } from '../ui/locale'
import { onboardingStrings } from '../ui/strings/onboarding'

const TABS = [TUTORIAL_LOOP, ...TUTORIAL_SECTIONS, { id: 'tips', label: 'Wskazówki', labelEn: 'Tips' }]

function LoopPanel({ lang }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-ufa-muted">{pickCopy(TUTORIAL_LOOP, 'intro', lang)}</p>
      <div className="flex flex-col divide-y divide-ufa-border overflow-hidden rounded-sm border border-ufa-border sm:flex-row sm:divide-x sm:divide-y-0">
        {TUTORIAL_LOOP.steps.map((step, i) => (
          <div
            key={step.label}
            className={`flex-1 px-4 py-3 ${i === TUTORIAL_LOOP.steps.length - 1 ? 'bg-ufa-gold/10' : 'bg-ufa-panel'}`}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-ufa-text">
              {pickCopy(step, 'label', lang)}
            </p>
            <p className="mt-0.5 text-xs text-ufa-muted">{pickCopy(step, 'sub', lang)}</p>
          </div>
        ))}
      </div>
      <p className="border-l-2 border-ufa-gold pl-3 text-xs text-ufa-muted">
        {pickCopy(TUTORIAL_LOOP, 'branchNote', lang)}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {TUTORIAL_LOOP.callouts.map((c) => (
          <div key={pickCopy(c, 'title', lang)} className="rounded-sm border border-ufa-border bg-ufa-panel p-3">
            <p className="text-xs font-semibold text-ufa-accent">{pickCopy(c, 'title', lang)}</p>
            <p className="mt-1 text-xs text-ufa-muted">{pickCopy(c, 'body', lang)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionPanel({ section, lang }) {
  const intro = pickCopy(section, 'intro', lang)
  return (
    <div className="space-y-4">
      {intro ? <p className="text-sm text-ufa-muted">{intro}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {section.cards.map((card) => (
          <div key={pickCopy(card, 'title', lang)} className="rounded-sm border border-ufa-border bg-ufa-panel p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ufa-muted">
              {pickCopy(card, 'crumb', lang)}
            </p>
            <h4 className="mt-1 text-sm font-semibold text-ufa-text">{pickCopy(card, 'title', lang)}</h4>
            <p className="mt-1.5 text-xs leading-relaxed text-ufa-text">{pickCopy(card, 'body', lang)}</p>
            {card.actions?.length ? (
              <ul className="mt-2 space-y-1">
                {card.actions.map((a) => (
                  <li key={a.t} className="relative pl-3 text-xs text-ufa-muted">
                    <span className="absolute left-0 top-[7px] h-[4px] w-[4px] rounded-[1px] bg-ufa-accent" />
                    {lang === 'en' ? a.e : a.t}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function TipsPanel({ lang }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {TUTORIAL_TIPS.map((tip) => (
        <div key={pickCopy(tip, 'title', lang)} className="rounded-sm border border-ufa-border bg-ufa-panel p-4">
          <h4 className="text-sm font-semibold text-ufa-text">{pickCopy(tip, 'title', lang)}</h4>
          <p className="mt-1.5 text-xs leading-relaxed text-ufa-muted">{pickCopy(tip, 'body', lang)}</p>
        </div>
      ))}
    </div>
  )
}

export default function TutorialGuide({ open, onClose, lang }) {
  const t = onboardingStrings(lang)
  const [activeId, setActiveId] = useState('loop')

  useEffect(() => {
    if (open) setActiveId('loop')
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const active = TABS.find((s) => s.id === activeId) ?? TABS[0]

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px] sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[720px] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-ufa-border bg-ufa-panel shadow-2xl shadow-black/50 league-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ufa-border px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-ufa-text">{t.tutorialTitle}</h2>
            <p className="mt-0.5 text-xs text-ufa-muted">{t.tutorialSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="shrink-0 rounded-sm border border-ufa-border p-1.5 text-ufa-muted hover:border-ufa-accent/50 hover:text-ufa-text"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-ufa-border px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                tab.id === activeId
                  ? 'bg-ufa-accent text-ufa-bg'
                  : 'text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text'
              }`}
            >
              {pickCopy(tab, 'label', lang)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {active.id === 'loop' ? (
            <LoopPanel lang={lang} />
          ) : active.id === 'tips' ? (
            <TipsPanel lang={lang} />
          ) : (
            <SectionPanel section={active} lang={lang} />
          )}
        </div>

        <div className="flex justify-end border-t border-ufa-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
          >
            {t.gotIt}
          </button>
        </div>
      </div>
    </div>
  )
}
