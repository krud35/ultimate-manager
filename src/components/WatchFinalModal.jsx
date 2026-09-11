import { pickCopy, UI_LANG } from '../ui/locale'

/**
 * Full-screen popup for a pending `watchable_final` message (January Cup final / Euro-World
 * Championship final) — mirrors RandomEventModal's "fires immediately" pattern, but the
 * choice here is static (Watch / Ignore), not a random-event template lookup.
 */
export default function WatchFinalModal({ message, lang, onWatch, onIgnore }) {
  if (!message) return null

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-md border border-ufa-border bg-ufa-panel p-6 shadow-2xl shadow-black/50 league-fade-in">
        <span className="rounded border border-ufa-gold/40 bg-ufa-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ufa-gold">
          {lang === UI_LANG.EN ? 'Final' : 'Finał'}
        </span>
        <h3 className="mt-3 text-lg font-semibold text-ufa-text">{pickCopy(message, 'title', lang)}</h3>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ufa-muted">
          {pickCopy(message, 'body', lang)}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onWatch?.(message.id)}
            className="rounded-lg border border-ufa-accent/50 bg-ufa-accent/10 px-4 py-3 text-left transition-colors hover:border-ufa-accent hover:bg-ufa-accent/20"
          >
            <span className="block text-sm font-medium text-ufa-text">
              {lang === UI_LANG.EN ? 'Watch live' : 'Oglądaj na żywo'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onIgnore?.(message.id)}
            className="rounded-lg border border-ufa-border bg-ufa-bg/60 px-4 py-3 text-left transition-colors hover:border-ufa-border/80 hover:bg-ufa-bg"
          >
            <span className="block text-sm font-medium text-ufa-text">
              {lang === UI_LANG.EN ? 'Ignore (resolve automatically)' : 'Zignoruj (rozstrzygnie się automatycznie)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
