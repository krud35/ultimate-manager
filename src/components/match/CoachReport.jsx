import { buildCoachReport } from '../../matchEngine/streamlinedMatch.js'
import { useUiLang } from '../../ui/UiLangContext'
export default function CoachReport({ result, side, onReview }) {
  const { lang } = useUiLang(), en = lang === 'en'
  return <section className="um-section"><h3 className="um-section-title">{en ? 'Coach report' : 'Raport trenera'}</h3><div className="mt-4 grid gap-4 md:grid-cols-3">{buildCoachReport(result, side, lang).map(row => <article key={row.id}><h4 className="font-semibold">{row.title}</h4><p className="mt-2 text-sm">{row.observation}</p><p className="mt-2 text-sm text-ufa-muted">{row.suggestion}</p><div className="mt-3 flex flex-wrap gap-2">{row.points.map(point => <button className="um-button" key={point} onClick={() => onReview(point)}>{en ? 'Point' : 'Punkt'} {point} →</button>)}</div></article>)}</div></section>
}
