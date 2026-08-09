import { useUiLang } from '../ui/UiLangContext'
import { pickLabel, pickDesc } from '../ui/locale'
import { tacticsStrings } from '../ui/strings/tactics'
import { useEffect, useRef, useState } from 'react'
import {
  FORCE_SIDES,
  TACTICS_MODIFIERS,
  COACH_SLIDER_KEYS,
  COACH_DIRECTIVE_META,
  COACH_FORCE_PRIMARY,
  COACH_FORCE_ADVANCED,
  normalizeCoachDirectives,
  coachDirectivesForLine,
  coachSliderPoleDescription,
  coachDirectivePoleWord,
  normalizeTactics,
} from '../matchEngine'

/**
 * Aktualizacja dyrektyw dla O-Line lub D-Line + aliasów legacy.
 * @param {'offense'|'defense'} [lineRole]
 */
export function patchCoachDirectives(tactics, patch, lineRole = 'offense') {
  const role = lineRole === 'defense' ? 'defense' : 'offense'
  const field = role === 'defense' ? 'dLineCoachDirectives' : 'oLineCoachDirectives'
  const current = coachDirectivesForLine(tactics, role)
  const nextDirectives = normalizeCoachDirectives({ ...current, ...patch })
  const next = {
    ...tactics,
    [field]: nextDirectives,
  }
  if (role === 'offense') {
    next.coachDirectives = nextDirectives
    next.forceSide = nextDirectives.forceSide
  }
  return normalizeTactics(next)
}

function poleWord(key, value, lang = 'pl') {
  return coachDirectivePoleWord(key, value, lang)
}

function CoachSlider({ directiveKey, value, onChange, compact }) {
  const { lang } = useUiLang()
  const meta = COACH_DIRECTIVE_META[directiveKey]
  const desc = coachSliderPoleDescription(directiveKey, value, lang)
  if (!meta) return null

  return (
    <div
      className={
        compact
          ? 'space-y-1 rounded-md border border-ufa-border/50 bg-ufa-bg/40 px-2.5 py-2'
          : 'space-y-2 rounded-lg border border-ufa-border/60 bg-ufa-bg/30 px-3 py-3'
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-ufa-text">{pickLabel(meta, lang)}</p>
        <span className="text-[10px] tabular-nums text-ufa-muted">
          {Number(value).toFixed(2)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] text-ufa-muted">
        <span className="truncate">{lang === 'en' ? meta.leftEn ?? meta.left : meta.left}</span>
        <span className="shrink-0 opacity-70">
          {lang === 'en' ? meta.centerEn ?? meta.center : meta.center}
        </span>
        <span className="truncate text-right">
          {lang === 'en' ? meta.rightEn ?? meta.right : meta.right}
        </span>
      </div>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-ufa-accent"
        aria-label={pickLabel(meta, lang)}
      />
      {!compact && (
        <p className="text-[11px] leading-snug text-ufa-muted">{desc}</p>
      )}
    </div>
  )
}

function forceOptionsList(lang = 'pl') {
  return Object.entries(TACTICS_MODIFIERS.force ?? {}).map(([id, meta]) => ({
    id,
    label: meta.label ?? id,
    description: pickDesc(meta, lang),
  }))
}

function ForcePicker({ value, onChange, compact }) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const [advancedOpen, setAdvancedOpen] = useState(
    COACH_FORCE_ADVANCED.includes(value),
  )
  const forceOptions = forceOptionsList(lang)

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ufa-muted">
        {t.forceMark}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {COACH_FORCE_PRIMARY.map((id) => {
          const opt = forceOptions.find((o) => o.id === id)
          const active = value === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`rounded-md px-2.5 py-1.5 text-xs transition ${
                active
                  ? 'bg-ufa-accent/20 text-ufa-accent ring-1 ring-ufa-accent/40'
                  : 'bg-ufa-bg/50 text-ufa-muted hover:text-ufa-text'
              }`}
            >
              {opt?.label ?? id}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="rounded-md px-2 py-1.5 text-[11px] text-ufa-muted hover:text-ufa-text"
        >
          {advancedOpen ? t.less : t.more}
        </button>
      </div>
      {advancedOpen && (
        <div className="flex flex-wrap gap-1.5">
          {COACH_FORCE_ADVANCED.map((id) => {
            const opt = forceOptions.find((o) => o.id === id)
            const active = value === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(id)}
                className={`rounded-md px-2.5 py-1.5 text-xs transition ${
                  active
                    ? 'bg-ufa-accent/20 text-ufa-accent ring-1 ring-ufa-accent/40'
                    : 'bg-ufa-bg/50 text-ufa-muted hover:text-ufa-text'
                }`}
              >
                {opt?.label ?? id}
              </button>
            )
          })}
        </div>
      )}
      {!compact && forceOptions.find((o) => o.id === value)?.description && (
        <p className="text-[11px] text-ufa-muted">
          {forceOptions.find((o) => o.id === value)?.description}
        </p>
      )}
    </div>
  )
}

function CoachSummaryChips({ directives }) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const chips = []
  const forceOpt = forceOptionsList(lang).find((o) => o.id === directives.forceSide)
  if (forceOpt) {
    chips.push({ id: 'force', label: forceOpt.label })
  }
  for (const key of COACH_SLIDER_KEYS) {
    const word = poleWord(key, directives[key], lang)
    if (word) chips.push({ id: key, label: word })
  }
  if (!chips.length) {
    return (
      <p className="mt-1 text-[11px] text-ufa-muted">{t.coachNeutral}</p>
    )
  }
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {chips.slice(0, 5).map((c) => (
        <span
          key={c.id}
          className="rounded bg-ufa-bg/70 px-1.5 py-0.5 text-[10px] text-ufa-muted ring-1 ring-ufa-border/60"
        >
          {c.label}
        </span>
      ))}
      {chips.length > 5 && (
        <span className="text-[10px] text-ufa-muted">+{chips.length - 5}</span>
      )}
    </div>
  )
}

/**
 * Założenia trenera dla jednej linii (O-Line lub D-Line).
 * @param {'offense'|'defense'} lineRole
 */
export default function CoachDirectivesPanel({
  tactics,
  onTacticsChange,
  compact = false,
  defaultOpen = null,
  lineRole = 'offense',
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const role = lineRole === 'defense' ? 'defense' : 'offense'
  const isD = role === 'defense'
  const [open, setOpen] = useState(defaultOpen ?? !compact)
  const rootRef = useRef(null)
  const directives = coachDirectivesForLine(
    tactics,
    role,
  )

  // Zwijaj po kliknięciu poza panelem / Escape (mecz i taktyka).
  useEffect(() => {
    if (!open) return undefined
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function setSlider(key, value) {
    onTacticsChange(patchCoachDirectives(tactics, { [key]: value }, role))
  }

  function setForce(forceSide) {
    onTacticsChange(patchCoachDirectives(tactics, { forceSide }, role))
  }

  const lineLabel = isD ? 'D-Line' : 'O-Line'
  const lineAccent = isD
    ? 'bg-orange-500/15 text-orange-300'
    : 'bg-sky-500/15 text-sky-300'

  return (
    <section
      ref={rootRef}
      className={
        compact
          ? 'rounded-lg border border-ufa-border/80 bg-ufa-bg/30'
          : 'rounded-xl border border-ufa-border bg-ufa-panel shadow-lg shadow-black/15'
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-start justify-between gap-3 text-left transition hover:bg-ufa-panel-hover/40 ${
          compact ? 'px-3 py-2.5' : 'px-4 py-3.5'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ufa-text">{t.coachTitle}</h3>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${lineAccent}`}
            >
              {lineLabel}
            </span>
          </div>
          {!open && <CoachSummaryChips directives={directives} />}
          {open && !compact && (
            <p className="mt-1 text-xs text-ufa-muted">{t.coachHint(lineLabel)}</p>
          )}
        </div>
        <span className="shrink-0 pt-0.5 text-xs text-ufa-muted">
          {open ? t.collapse : t.expand}
        </span>
      </button>

      {open && (
        <div
          className={`border-t border-ufa-border/70 ${
            compact ? 'space-y-3 px-3 py-3' : 'space-y-4 px-4 py-4'
          }`}
        >
          <ForcePicker
            value={directives.forceSide ?? FORCE_SIDES.FORCE_FOREHAND}
            onChange={setForce}
            compact={compact}
          />

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ufa-muted">
              {t.scales}
            </p>
            <div
              className={
                compact ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-3 lg:grid-cols-2'
              }
            >
              {COACH_SLIDER_KEYS.map((key) => (
                <CoachSlider
                  key={key}
                  directiveKey={key}
                  value={directives[key]}
                  onChange={(v) => setSlider(key, v)}
                  compact={compact}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
