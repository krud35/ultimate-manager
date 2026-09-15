import { useUiLang } from '../ui/UiLangContext'
import { MANAGER_ATTRIBUTES, managerClubFit } from '../career/managerProfiles.js'
import { AI_COACH_ARCHETYPES } from '../matchEngine/aiCoachProfile.js'
import { ACADEMY_COUNTRIES } from '../data/academyScoutGeography.js'

export default function ManagerProfilePanel({ manager, team }) {
  const { lang } = useUiLang(), en = lang === 'en'
  if (!manager) return null
  const style = AI_COACH_ARCHETYPES.find(p => p.id === manager.styleId)
  const nationality = ACADEMY_COUNTRIES[manager.nationality]?.[en ? 'labelEn' : 'labelPl'] ?? manager.nationality
  const stats = manager.stats ?? {}, fit = team ? managerClubFit(manager,team) : null
  const styleName = id => { const p = AI_COACH_ARCHETYPES.find(x=>x.id===id); return (en?p?.labelEn:p?.label) ?? id }
  return <section className="um-section space-y-4 text-ufa-text">
    <header><h3 className="text-xl font-semibold">{manager.name}</h3><p className="text-sm text-ufa-muted">{nationality} · {manager.age} {en?'years':'lat'} · {en?style?.labelEn:style?.label}</p></header>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(MANAGER_ATTRIBUTES).map(([key,label])=><div key={key} className="rounded border border-ufa-border p-3"><dt className="text-xs text-ufa-muted">{label[en?'en':'pl']}</dt><dd className="text-lg font-semibold">{manager.attributes?.[key]??'—'}<span className="text-xs text-ufa-muted"> /20</span></dd></div>)}</dl>
    <p className="text-sm">{en?'Matches':'Mecze'}: <strong>{stats.matches??0}</strong> · {en?'Wins':'Zwycięstwa'}: {stats.wins??0} · {en?'Losses':'Porażki'}: {stats.losses??0} · {en?'Win rate':'Procent zwycięstw'}: {stats.matches?Math.round(100*stats.wins/stats.matches):0}% · {en?'Trophies':'Trofea'}: {stats.trophies?.length??0}</p>
    <p className="text-sm">{en?'Promotions':'Awanse'}: {stats.promotions??0} · {en?'Relegations':'Spadki'}: {stats.relegations??0} · {en?'Academy graduates':'Wychowankowie'}: {stats.academyGraduates??0}</p>
    {fit&&<div className="grid gap-3 sm:grid-cols-2"><div className="rounded border border-ufa-border p-3"><h4 className="font-semibold">{en?'Board expectations':'Preferencje zarządu'}</h4><p className="text-sm">{styleName(team.boardPreferences.styleId)}{team.boardPreferences.youth?` · ${en?'Youth development':'Rozwój młodzieży'}`:''}{team.boardPreferences.finance?` · ${en?'Financial stability':'Stabilność finansowa'}`:''}</p><p className="text-xs text-ufa-muted">{en?'Manager fit':'Dopasowanie managera'}: {fit.board}/100</p></div><div className="rounded border border-ufa-border p-3"><h4 className="font-semibold">{en?'Fan expectations':'Preferencje kibiców'}</h4><p className="text-sm">{styleName(team.fanPreferences.styleId)}{team.fanPreferences.youth?` · ${en?'Homegrown talent':'Wychowankowie'}`:''}{team.fanPreferences.localIdentity?` · ${en?'Local identity':'Lokalna tożsamość'}`:''}</p><p className="text-xs text-ufa-muted">{en?'Manager fit':'Dopasowanie managera'}: {fit.fans}/100</p></div></div>}
    {!!stats.trophies?.length&&<details><summary>{en?'Trophy cabinet':'Gablotka trofeów'}</summary>{stats.trophies.map(t=><p key={`${t.seasonYear}:${t.id}`} className="text-sm">{t.seasonYear} · {t.title??t.competitionId}</p>)}</details>}
    {!!Object.keys(stats.bySeason??{}).length&&<details><summary>{en?'Results by season and competition':'Wyniki według sezonu i rozgrywek'}</summary>{Object.entries(stats.bySeason).map(([key,s])=><p className="mt-2 text-sm" key={key}>{s.seasonYear} · {s.competitionId} · {en?'Matches / wins / losses':'Mecze / zwycięstwa / porażki'}: {s.matches} / {s.wins} / {s.losses}</p>)}</details>}
    {!!manager.history?.length&&<details><summary>{en?'Previous clubs':'Poprzednie kluby'}</summary>{manager.history.map((h,i)=><p key={i} className="mt-2 text-sm">{h.teamName??h.teamId} · {h.from}–{h.to}</p>)}</details>}
  </section>
}
