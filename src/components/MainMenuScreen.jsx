import ThemeControl from '../ui/ThemeControl'
import Wordmark from '../ui/Wordmark'
import { LangSwitch } from '../ui/LangSwitch'

export default function MainMenuScreen({ lang, onLangChange, onNew, onLoad, hasSaves = true }) {
  const en = lang === 'en'
  return (
    <div className="um-career-start">
      <div className="um-career-top"><Wordmark /><div className="flex flex-wrap items-center gap-4"><LangSwitch lang={lang} onChange={onLangChange} /><ThemeControl /></div></div>
      <header className="um-career-intro">
        <p className="um-eyebrow">{en ? 'Your club. Your decisions.' : 'Twój klub. Twoje decyzje.'}</p>
        <h1>{en ? <>Every season.<br />Every point.</> : <>Każdy sezon.<br />Każdy punkt.</>}</h1>
        <p>{en ? 'Build your story, lead your club and shape the world of ultimate.' : 'Stwórz swoją historię, poprowadź klub i kształtuj świat ultimate.'}</p>
      </header>
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <button type="button" className="um-button um-button--primary py-5" onClick={onNew}>{en ? 'Start a new game' : 'Zacznij nową grę'}</button>
        <button type="button" className="um-button py-5 disabled:opacity-50" onClick={onLoad} disabled={!hasSaves}>{en ? 'Load game' : 'Wczytaj grę'}</button>
      </div>
      {!hasSaves && <p className="mt-3 text-sm text-ufa-muted">{en ? 'Your saved careers will be available here.' : 'Tutaj będą dostępne zapisane kariery.'}</p>}
    </div>
  )
}
