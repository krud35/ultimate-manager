import { useUiLang } from '../ui/UiLangContext'
import { commonStrings } from '../ui/strings/common'

/**
 * Overlay postępu długiej symulacji (kalendarz / treningi / transfery).
 */
export default function SimulationProgressOverlay({ progress }) {
  const { lang } = useUiLang()
  const t = commonStrings(lang)

  if (!progress) return null

  const { label, detail, current = 0, total = 1, indeterminate = false } = progress
  const pct = indeterminate
    ? null
    : Math.max(0, Math.min(100, Math.round((current / Math.max(1, total)) * 100)))

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct ?? undefined}
      aria-busy="true"
      aria-label={label ?? t.simulation}
    >
      <div className="w-full max-w-md rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-2xl shadow-black/50">
        <p className="text-sm font-semibold text-ufa-text">{label ?? t.simulationEllipsis}</p>
        {detail ? <p className="mt-1 text-xs text-ufa-muted tabular-nums">{detail}</p> : null}

        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-ufa-bg ring-1 ring-ufa-border">
          {indeterminate ? (
            <div className="sim-progress-indeterminate h-full w-1/3 rounded-full bg-ufa-accent" />
          ) : (
            <div
              className="h-full rounded-full bg-ufa-accent transition-[width] duration-150 ease-out"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-ufa-muted tabular-nums">
          <span>{indeterminate ? t.processing : `${current} / ${total}`}</span>
          {!indeterminate && <span>{pct}%</span>}
        </div>
      </div>

      <style>{`
        @keyframes sim-progress-slide {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        .sim-progress-indeterminate {
          animation: sim-progress-slide 1.1s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

/** Oddaje sterowanie przeglądarce, żeby zdążyła odmalować UI. */
export function yieldToUi() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
