import { useState } from 'react'
import { pickLabel, pickCopy, UI_LANG } from '../ui/locale'
import { randomEventBodyEn } from '../career/randomEventCopyEn.js'
import { randomEventTitleEn, currentRandomEventChoices } from '../career/randomEvents.js'

/** Same copy-enrichment InboxView applies to decision random_event messages. */
function enrichRandomEventMessage(message) {
  const p = message?.payload ?? {}
  return {
    ...message,
    titleEn: message.titleEn ?? randomEventTitleEn(p.templateId, p.context) ?? undefined,
    bodyEn: message.bodyEn ?? randomEventBodyEn(p.templateId, p.context) ?? undefined,
  }
}

/**
 * Full-screen popup for a pending `decision` random_event — fires the moment it's
 * rolled during live play (not fast-forward, see calendarSimulation.js's
 * `allowRandomEvents`), instead of waiting for the manager to notice it in the
 * inbox. The message itself still lands in the inbox as a resolved-history entry.
 */
export default function RandomEventModal({ message, lang, onChoose }) {
  const [error, setError] = useState(null)
  if (!message) return null
  const p = message.payload ?? {}
  const displayMessage = enrichRandomEventMessage(message)
  const choices = currentRandomEventChoices(p.templateId, p.context) ?? []

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-md border border-ufa-border bg-ufa-panel p-6 shadow-2xl shadow-black/50 league-fade-in">
        <span className="rounded border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
          {lang === UI_LANG.EN ? 'Decision needed' : 'Wymagana decyzja'}
        </span>
        <h3 className="mt-3 text-lg font-semibold text-ufa-text">
          {pickCopy(displayMessage, 'title', lang)}
        </h3>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ufa-muted">
          {pickCopy(displayMessage, 'body', lang)}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {lang === UI_LANG.EN ? error.errorEn : error.error}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => {
                const result = onChoose?.(message.id, choice.id)
                if (result?.ok === false) setError(result)
              }}
              className="rounded-lg border border-violet-400/35 bg-violet-400/5 px-4 py-3 text-left transition-colors hover:border-violet-400/60 hover:bg-violet-400/10"
            >
              <span className="block text-sm font-medium text-ufa-text">
                {pickLabel(choice, lang) || choice.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
