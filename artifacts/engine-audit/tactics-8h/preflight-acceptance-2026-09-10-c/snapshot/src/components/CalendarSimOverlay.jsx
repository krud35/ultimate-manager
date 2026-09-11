import { useEffect, useRef, useState } from 'react'
import { useUiLang } from '../ui/UiLangContext'
import { calendarSimStrings } from '../ui/strings/calendarSim'
import { pickCopy, UI_LANG } from '../ui/locale'

const TRAIL_LEN = 6

function formatShortDay(iso, lang) {
  if (!iso) return '—'
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(
      lang === UI_LANG.EN ? 'en-US' : 'pl-PL',
      { weekday: 'short', day: 'numeric', month: 'short' },
    )
  } catch {
    return iso
  }
}

/**
 * Popup ciągłej symulacji kalendarza ("Dalej") — pokazuje przesuwający się pasek dni,
 * ostatnie wiadomości ze skrzynki i najnowszy nagłówek Ultiworld, dzień po dniu.
 */
export default function CalendarSimOverlay({ sim }) {
  const { lang } = useUiLang()
  const t = calendarSimStrings(lang)
  const [trail, setTrail] = useState([])
  const lastDateRef = useRef(null)

  useEffect(() => {
    if (!sim?.currentDate) {
      setTrail([])
      lastDateRef.current = null
      return
    }
    if (sim.currentDate === lastDateRef.current) return
    lastDateRef.current = sim.currentDate
    setTrail((prev) => [...prev, sim.currentDate].slice(-TRAIL_LEN))
  }, [sim?.currentDate])

  if (!sim) return null

  const messages = sim.recentMessages ?? []
  const uw = sim.latestUltiworld

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
      role="status"
      aria-busy="true"
      aria-label={t.title}
    >
      <div className="w-full max-w-sm rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ufa-text">{t.title}</p>
          {sim.daysAdvanced ? (
            <p className="text-[11px] text-ufa-muted tabular-nums">
              {t.daysAdvanced(sim.daysAdvanced)}
            </p>
          ) : null}
        </div>

        <div className="calsim-track mt-4 overflow-hidden rounded-lg border border-ufa-border bg-ufa-bg/60 py-3">
          <div className="flex items-center gap-2 px-3">
            {trail.map((date, i) => {
              const isLast = i === trail.length - 1
              return (
                <div
                  key={date}
                  className={
                    isLast
                      ? 'calsim-chip flex-shrink-0 rounded-md bg-ufa-accent px-2.5 py-1.5 text-center text-xs font-semibold text-ufa-bg tabular-nums'
                      : 'calsim-chip flex-shrink-0 rounded-md bg-ufa-panel-hover px-2.5 py-1.5 text-center text-[11px] text-ufa-muted tabular-nums'
                  }
                >
                  {formatShortDay(date, lang)}
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ufa-muted">
            {t.inbox}
          </p>
          <ul className="mt-1.5 space-y-1">
            {messages.length ? (
              messages.slice(0, 3).map((m) => (
                <li key={m.id} className="truncate text-xs text-ufa-text">
                  {pickCopy(m, 'title', lang)}
                </li>
              ))
            ) : (
              <li className="text-xs text-ufa-muted">{t.inboxEmpty}</li>
            )}
          </ul>
        </div>

        {uw ? (
          <div className="mt-3 border-t border-ufa-border pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ufa-muted">
              {t.ultiworld}
            </p>
            <p className="mt-1 truncate text-xs text-ufa-text">{pickCopy(uw, 'headline', lang)}</p>
          </div>
        ) : null}
      </div>

      <style>{`
        .calsim-chip {
          animation: calsim-enter 260ms ease-out;
        }
        @keyframes calsim-enter {
          0% { opacity: 0; transform: translateX(18px); }
          100% { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
