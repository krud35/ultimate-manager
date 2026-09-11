import { onboardingStrings } from '../ui/strings/onboarding'

export default function WelcomeModal({ managerName, teamName, lang, onYes, onNo }) {
  const t = onboardingStrings(lang)

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-md border border-ufa-border bg-ufa-panel p-6 text-center shadow-2xl shadow-black/50 league-fade-in">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ufa-accent/15">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-ufa-accent" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9 12.5s1 1.5 3 1.5 3-1.5 3-1.5" />
            <path d="M9 9h.01M15 9h.01" />
          </svg>
        </div>
        <p className="text-sm leading-relaxed text-ufa-text">{t.welcomeBody(managerName, teamName)}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onYes}
            className="flex-1 rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90"
          >
            {t.yes}
          </button>
          <button
            type="button"
            onClick={onNo}
            className="flex-1 rounded-md border border-ufa-border px-4 py-2 text-sm text-ufa-muted hover:bg-ufa-panel-hover hover:text-ufa-text"
          >
            {t.no}
          </button>
        </div>
      </div>
    </div>
  )
}
