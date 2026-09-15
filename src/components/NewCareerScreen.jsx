import { focusedLimit } from '../data/focusedWorld.js'
import WorldCountryChoice from './WorldCountryChoice'
import { useMemo, useState } from 'react'
import { ACADEMY_COUNTRIES } from '../data/academyScoutGeography'
import { DOMESTIC_CONTINENTS, DOMESTIC_LEAGUES, REGIONAL_LEAGUES, defaultWorldConfig, estimateWorldCost, normalizeWorldConfig } from '../data/domesticLeagues'
import { MANAGER_ATTRIBUTES, MANAGER_BACKGROUND_QUESTIONS, MANAGER_PLAYING_BACKGROUNDS, createManagerProfile, managerClubFit } from '../career/managerProfiles'
import { AI_COACH_ARCHETYPES } from '../matchEngine/aiCoachProfile.js'
import UfaCareerSetup from './UfaCareerSetup'
import SelectionIndicator from './SelectionIndicator'

const input = 'mt-2 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text outline-none focus:border-ufa-accent'
const panel = 'rounded-sm border border-ufa-border bg-ufa-panel p-4'
const cups = { nationals: ['Reprezentacje', 'National teams'], europe: ['Europejska Champions League', 'European Champions League'], paucc: ['PAUCC — Ameryki', 'PAUCC — Americas'], aoucc: ['AOUCC — Azja i Oceania', 'AOUCC — Asia and Oceania'], wucc: ['WUCC — mistrzostwa świata klubów', 'WUCC — World club championships'] }

function Attributes({ profile, lang }) {
  return <div className={panel}><h3 className="font-semibold text-ufa-text">{lang === 'en' ? 'Your strengths' : 'Twoje umiejętności'}</h3><dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">{Object.entries(profile.attributes).map(([key, value]) => <div key={key} className="flex justify-between gap-3 text-sm"><dt className="text-ufa-muted">{MANAGER_ATTRIBUTES[key]?.[lang] ?? key}</dt><dd className="font-semibold text-ufa-accent">{value}/20</dd></div>)}</dl></div>
}

function ClubFit({ team, profile, lang }) {
  if (!team) return null
  const preview = { ...team }
  const fit = managerClubFit(profile, preview)
  const style = id => { const archetype = AI_COACH_ARCHETYPES.find(a => a.id === id); return (lang === 'en' ? archetype?.labelEn : archetype?.label) ?? id }
  return <div className={panel}><h3 className="font-semibold text-ufa-text">{team.name} · {lang === 'en' ? 'Club expectations' : 'Oczekiwania klubu'}</h3><div className="mt-3 grid gap-3 text-sm text-ufa-muted sm:grid-cols-2"><p>{lang === 'en' ? 'Board' : 'Zarząd'}: {style(preview.boardPreferences.styleId)}<br />{lang === 'en' ? 'Manager fit' : 'Dopasowanie managera'}: {fit.board}/100</p><p>{lang === 'en' ? 'Fans' : 'Kibice'}: {style(preview.fanPreferences.styleId)}<br />{lang === 'en' ? 'Manager fit' : 'Dopasowanie managera'}: {fit.fans}/100</p></div></div>
}

export default function NewCareerScreen({ slotIndex, lang = 'pl', onCancel, onCreate, submitting = false, externalError = '' }) {
  const en = lang === 'en'
  const tr = (pl, english) => en ? english : pl
  const [step, setStep] = useState(0)
  const [identity, setIdentity] = useState({ firstName: '', lastName: '', nationality: 'pl', age: 30, formerPlayer: 'amateur', styleId: 'balanced_pro' })
  const [answers, setAnswers] = useState({})
  const [skipBackground, setSkipBackground] = useState(false)
  const [competition, setCompetition] = useState('domestic')
  const [worldConfig, setWorldConfig] = useState(() => normalizeWorldConfig({...defaultWorldConfig(),simulationModel:'focused',mainCountryId:'pl',additionalCountryIds:[]}))
  const [playerTeamId, setPlayerTeamId] = useState('')
  const [ufaOptions, setUfaOptions] = useState(null)
  const [clubSearch, setClubSearch] = useState('')
  const [error, setError] = useState('')
  const profile = useMemo(() => createManagerProfile({ ...identity, answers: skipBackground ? {} : answers }), [identity, answers, skipBackground])
  const cost = useMemo(() => estimateWorldCost(worldConfig), [worldConfig])
  const effectiveConfig = useMemo(() => normalizeWorldConfig(worldConfig), [worldConfig])
  const playable = DOMESTIC_LEAGUES.filter(league => effectiveConfig.leagues[league.id] === 'playable' && !league.hidden && (effectiveConfig.simulationModel !== 'focused' || league.countryId === effectiveConfig.mainCountryId))
  const activeLeagueCount = DOMESTIC_LEAGUES.filter(league => effectiveConfig.leagues[league.id] === 'playable').length
  const selectedLeague = playable.find(league => league.teams.some(team => team.id === playerTeamId))
  const selectedTeam = selectedLeague?.teams.find(team => team.id === playerTeamId)
  const managerName = `${identity.firstName.trim()} ${identity.lastName.trim()}`.trim()
  const titles = en ? ['Your manager', 'Game mode', 'Your world', 'Choose a club', 'Review career'] : ['Twój manager', 'Tryb gry', 'Twój świat', 'Wybierz klub', 'Podsumowanie']
  const country = id => REGIONAL_LEAGUES[id]?.[en ? 'labelEn' : 'labelPl'] ?? ACADEMY_COUNTRIES[id]?.[en ? 'labelEn' : 'labelPl'] ?? id
  const international = Object.entries(cups).filter(([id]) => competition !== 'ufa' || id === 'nationals')

  function advance() {
    if (step === 0 && (!identity.firstName.trim() || !identity.lastName.trim() || !Number.isFinite(identity.age) || identity.age < 18 || identity.age > 80)) return setError(tr('Podaj imię, nazwisko i wiek od 18 do 80 lat.', 'Enter your first and last name and an age between 18 and 80.'))
    if (step === 0 && !skipBackground && MANAGER_BACKGROUND_QUESTIONS.some(q => !answers[q.id])) return setError(tr('Odpowiedz na wszystkie pytania lub wybierz pominięcie pytań o przeszłość.', 'Answer each background question or choose to skip them.'))
    if (step === 2 && competition === 'domestic' && !playable.length) return setError(tr('Wybierz co najmniej jeden grywalny kraj.', 'Select at least one playable country.'))
    if (step === 3 && competition === 'domestic' && !selectedTeam) return setError(tr('Wybierz klub z grywalnej ligi.', 'Choose a club from a playable league.'))
    setError(''); setStep(value => Math.min(4, value + 1))
  }
  function submit() {
    if (submitting) return
    if (competition === 'domestic' && !selectedTeam || competition === 'ufa' && !ufaOptions) return setStep(3)
    onCreate({ ...(competition === 'ufa' ? ufaOptions : { playerTeamId, seasonYear: 2026 }), slotIndex, competition, managerName, managerProfile: profile, worldConfig: effectiveConfig })
  }

  return <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 league-fade-in">
    <button type="button" onClick={onCancel} disabled={submitting} className="mb-5 text-sm text-ufa-muted hover:text-ufa-accent">← {tr('Menu główne', 'Main menu')}</button>
    <p className="um-eyebrow">{tr('Nowa kariera · Zapis', 'New career · Save slot')} {slotIndex + 1}</p>
    <h1 className="um-page-title text-ufa-text">{titles[step]}</h1>
    <ol aria-label={tr('Etapy tworzenia kariery', 'Career creation steps')} className="my-6 flex flex-wrap gap-2">{titles.map((title, i) => <li key={title} aria-current={step === i ? 'step' : undefined} className={`rounded px-3 py-2 text-xs ${i === step ? 'bg-ufa-accent text-ufa-on-accent' : 'bg-ufa-panel text-ufa-muted'}`}>{i + 1}. {title}</li>)}</ol>

    {step === 0 && <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {[['firstName', tr('Imię', 'First name')], ['lastName', tr('Nazwisko', 'Last name')]].map(([key, label]) => <label key={key} className="text-sm text-ufa-text">{label}<input className={input} autoComplete={key === 'firstName' ? 'given-name' : 'family-name'} value={identity[key]} maxLength={40} onChange={e => setIdentity({ ...identity, [key]: e.target.value })} /></label>)}
        <label className="text-sm text-ufa-text">{tr('Narodowość', 'Nationality')}<select className={input} value={identity.nationality} onChange={e => setIdentity({ ...identity, nationality: e.target.value })}>{Object.keys(ACADEMY_COUNTRIES).sort((a, b) => country(a).localeCompare(country(b), lang)).map(id => <option key={id} value={id}>{country(id)}</option>)}</select></label>
        <label className="text-sm text-ufa-text">{tr('Wiek', 'Age')}<input className={input} type="number" min="18" max="80" value={identity.age} onChange={e => setIdentity({ ...identity, age: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
      </div>
      <fieldset className={panel}><legend className="px-1 font-semibold text-ufa-text">{tr('Czy grałeś przed rozpoczęciem kariery trenerskiej?', 'Did you play before coaching?')}</legend><div className="flex flex-wrap gap-4">{MANAGER_PLAYING_BACKGROUNDS.map(o => <label key={o.id} className="flex items-center gap-2 text-sm text-ufa-text"><input type="radio" name="playing-background" checked={identity.formerPlayer === o.id} onChange={() => setIdentity({ ...identity, formerPlayer: o.id })} />{o[lang]}</label>)}</div></fieldset>
      <p className="text-sm text-ufa-muted">{tr('Opowiedz swoją historię. Każdy wybór rozwija inne mocne strony — nie ma jednej najlepszej odpowiedzi.', 'Build your story. Each choice shapes different strengths; there is no perfect answer.')}</p>
      <label className="flex items-center gap-3 text-sm text-ufa-text"><input type="checkbox" checked={skipBackground} onChange={e => { setSkipBackground(e.target.checked); setError('') }} />{tr('Pomiń pytania o przeszłość', 'Skip background questions')}</label>
      {skipBackground && <p className="text-sm text-ufa-muted">{tr('Umiejętności wynikają z wybranej przeszłości zawodniczej, bez modyfikatorów z quizu.', 'Your attributes use your selected playing background, without quiz modifiers.')}</p>}
      {!skipBackground && MANAGER_BACKGROUND_QUESTIONS.map((q, i) => <fieldset key={q.id} className={panel}><legend className="px-1 font-semibold text-ufa-text">{i + 1}. {identity.formerPlayer === 'none' ? (q[en ? 'nonPlayerEn' : 'nonPlayerPl'] ?? q[lang]) : q[lang]}</legend><div className="mt-2 grid gap-3 sm:grid-cols-2">{q.options.map(o => <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded border p-3 text-sm text-ufa-text ${answers[q.id] === o.id ? 'border-ufa-accent bg-ufa-accent/10' : 'border-ufa-border'}`}><input type="radio" name={`background-${q.id}`} checked={answers[q.id] === o.id} onChange={() => setAnswers({ ...answers, [q.id]: o.id })} className="mt-1" />{o[lang]}</label>)}</div></fieldset>)}
      <Attributes profile={profile} lang={lang} />
      <label className="block text-sm text-ufa-text">{tr('Preferowany styl prowadzenia zespołu', 'Preferred coaching style')}<select className={input} value={identity.styleId} onChange={e => setIdentity({ ...identity, styleId: e.target.value })}>{AI_COACH_ARCHETYPES.map(a => <option key={a.id} value={a.id}>{en ? a.labelEn : a.label}</option>)}</select></label>
    </div>}

    {step === 1 && <div className="grid gap-4 sm:grid-cols-2">{[['domestic', tr('Ligi krajowe', 'Domestic leagues'), tr('Świat lig krajowych, krajowych pucharów i rozgrywek międzynarodowych.', 'Build a world of national leagues, domestic cups and international competitions.')], ['ufa', 'UFA', tr('Oddzielna liga północnoamerykańska z historycznymi sezonami i ustawieniami składów.', 'A separate North American league with historical seasons and roster settings.')]].map(([id, title, description]) => <button type="button" key={id} aria-pressed={competition === id} onClick={() => setCompetition(id)} className={`${panel} career-choice text-left ${competition === id ? 'border-ufa-accent bg-ufa-accent/10' : ''}`}><span className="mb-3 flex justify-end"><SelectionIndicator selected={competition === id} lang={lang} /></span><h2 className="text-xl font-semibold text-ufa-text">{title}</h2><p className="mt-3 text-sm text-ufa-muted">{description}</p></button>)}</div>}

    {step === 2 && <div className="space-y-5">
      {competition === 'domestic' && <>
        <div className={panel} aria-live="polite"><h2 className="font-semibold text-ufa-text">{tr('Liga główna', 'Main league')}: {country(effectiveConfig.mainCountryId)} · + {effectiveConfig.additionalCountryIds.length}/{focusedLimit(effectiveConfig)} {tr('dodatkowe aktywne', 'additional active')}</h2><p className="mt-2 text-sm text-ufa-muted">{tr('Liga główna i dodatkowe ligi umożliwiają transfery oraz zmianę klubu. Pozostałe ligi zachowują wyniki i zawodników w tle. Francja zmniejsza limit dodatkowych lig do trzech.', 'The main and additional active leagues allow transfers and changing clubs. Other leagues retain results and players in the background. France reduces the additional league limit to three.')}</p><p className="mt-3 font-semibold text-ufa-accent">{tr('Szacowane obciążenie', 'Estimated load')}: {{ low: tr('niskie', 'low'), medium: tr('średnie', 'medium'), high: tr('wysokie', 'high') }[cost.load]} · {cost.relativeSpeed}% {tr('względnej szybkości', 'relative speed')}</p><p className="mt-1 text-sm text-ufa-muted">{activeLeagueCount} {tr('grywalnych lig', 'playable leagues')} · {DOMESTIC_LEAGUES.filter(l => effectiveConfig.leagues[l.id] === 'background').length} {tr('lig w tle', 'background leagues')} · {cost.clubs} {tr('klubów', 'clubs')} · {cost.players} {tr('zawodników', 'players')}</p><p className="mt-2 text-xs text-ufa-muted">{tr('Wskaźnik porównawczy, bez pomiaru czasu na tym urządzeniu. Niższy poziom wymaga wszystkich wyższych lig. Grupy regionalne włączane są razem. Awanse i spadki obejmują też ligi tła. Liga Twojego klubu zawsze pozostaje aktywna.', 'A relative estimate, without timing this device. Lower tiers require all higher tiers. Regional groups are enabled together. Promotion and relegation include background tiers. Your club’s league always stays active.')}</p></div>
        <p className="text-sm text-ufa-muted">{tr('Reprezentacje działają normalnie. Kluby uczestniczące w pucharach międzynarodowych korzystają z dokładniejszej symulacji na czas udziału.', 'National teams operate normally. Clubs in international cups receive detailed simulation during their participation.')}</p>
        <div className="space-y-6">{DOMESTIC_CONTINENTS.map(continent => <section key={continent.id} aria-labelledby={`continent-${continent.id}`}><h2 id={`continent-${continent.id}`} className="mb-3 text-lg font-semibold text-ufa-text">{continent[en ? "labelEn" : "labelPl"]}</h2><div className="space-y-2">{[...continent.countries].sort((a, b) => a[en ? "labelEn" : "labelPl"].localeCompare(b[en ? "labelEn" : "labelPl"], lang)).map(c => <WorldCountryChoice key={c.id} country={c} config={worldConfig} lang={lang} onChange={next=>{setWorldConfig(next);setPlayerTeamId("")}} />)}</div></section>)}</div>
        <p className="text-xs text-ufa-muted">{tr('Sierpień–maj · Liga: piątek–poniedziałek · Puchary: wtorek–czwartek · Turnieje międzynarodowe: połowa czerwca–połowa lipca. Okna transferowe bez zmian.', 'August–May · League: Friday–Monday · Cups: Tuesday–Thursday · International tournaments: mid-June–mid-July. Transfer windows unchanged.')}</p>
      </>}
      <fieldset className={panel}><legend className="px-1 font-semibold text-ufa-text">{tr('Rozgrywki międzynarodowe', 'International competitions')}</legend><div className="grid gap-3 sm:grid-cols-2">{international.map(([id, labels]) => <label key={id} className="flex items-center gap-3 text-sm text-ufa-text"><input type="checkbox" checked={worldConfig.international[id]} onChange={e => setWorldConfig({ ...worldConfig, international: { ...worldConfig.international, [id]: e.target.checked } })} />{labels[en ? 1 : 0]}</label>)}</div></fieldset>
      {competition === 'ufa' && <p className="text-sm text-ufa-muted">{tr('UFA zachowuje własny terminarz. Kluby UFA nie uczestniczą w pucharach klubowych świata lig krajowych.', 'UFA keeps its own calendar. Domestic-world club cups do not include UFA teams.')}</p>}
    </div>}

    {step === 3 && competition === 'domestic' && <div className="space-y-5"><label className="block text-sm text-ufa-text">{tr('Znajdź klub', 'Find a club')}<input className={input} value={clubSearch} onChange={e => setClubSearch(e.target.value)} /></label>{playable.map(l => <section key={l.id}><h2 className="mb-3 font-semibold text-ufa-text">{l.name} · {country(l.countryId)}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{l.teams.filter(team => team.name.toLocaleLowerCase().includes(clubSearch.toLocaleLowerCase())).map(team => <button type="button" key={team.id} aria-pressed={playerTeamId === team.id} onClick={() => setPlayerTeamId(team.id)} className={`${panel} career-choice text-left ${playerTeamId === team.id ? 'border-ufa-accent bg-ufa-accent/10' : ''}`}><span className="mb-3 flex justify-end"><SelectionIndicator selected={playerTeamId === team.id} lang={lang} /></span><span className="font-semibold text-ufa-text">{team.name}</span><span className="mt-2 block text-xs text-ufa-muted">{country(l.countryId)} · {tr('Poziom', 'Tier')} {l.tier}</span></button>)}</div></section>)}</div>}
    {step === 3 && competition === 'domestic' && <div className="mt-5"><ClubFit team={selectedTeam} profile={profile} lang={lang} /></div>}
    {competition === 'ufa' && <div hidden={step !== 3}><UfaCareerSetup slotIndex={slotIndex} lang={lang} embedded initialManagerName={managerName} onCancel={() => setStep(2)} onCreate={options => { setUfaOptions(options); setError(''); setStep(4) }} /></div>}

    {step === 4 && <div className="space-y-5"><div className={panel}><h2 className="text-xl font-semibold text-ufa-text">{managerName}</h2><p className="mt-2 text-sm text-ufa-muted">{country(identity.nationality)} · {identity.age} {tr('lat', 'years old')}</p><p className="mt-4 text-lg text-ufa-text">{competition === 'domestic' ? selectedTeam?.name : (ufaOptions?.playerTeamName ?? ufaOptions?.playerTeamId)}</p><p className="mt-1 text-sm text-ufa-muted">{competition === 'domestic' ? `${selectedLeague?.name} · 2026/27` : `UFA · ${ufaOptions?.seasonYear}`}</p>{competition === 'domestic' && <p className="mt-3 text-sm text-ufa-muted">{activeLeagueCount} {tr('grywalnych lig · Krajowe puchary aktywne', 'playable leagues · Domestic cups included')}</p>}<p className="mt-3 text-sm text-ufa-muted">{tr('Rozgrywki międzynarodowe', 'International competitions')}: {international.filter(([id]) => worldConfig.international[id]).map(([, labels]) => labels[en ? 1 : 0]).join(', ') || tr('Wyłączone', 'Disabled')}</p></div><Attributes profile={profile} lang={lang} /><p className="text-sm text-ufa-muted">{tr('Świat zostanie wygenerowany po rozpoczęciu gry. Dodatkowe aktywne ligi możesz zmienić na następny sezon.', 'Your world will be generated when you start. You can change additional active leagues for the next season.')}</p></div>}
    {(error || externalError) && <p role="alert" className="mt-5 text-sm text-ufa-danger">{error || externalError}</p>}
    <div className="mt-8 flex flex-wrap gap-3">
      {step > 0 && <button type="button" disabled={submitting} className="um-button" onClick={() => { setError(''); setStep(step - 1) }}>{tr('Wstecz', 'Back')}</button>}
      {step < 4 && !(step === 3 && competition === 'ufa') && <button type="button" className="um-button um-button--primary" onClick={advance}>{tr('Dalej', 'Continue')}</button>}
      {step === 4 && <button type="button" className="um-button um-button--primary disabled:opacity-50" disabled={submitting} onClick={submit}>{submitting ? tr('Tworzenie świata…', 'Creating your world…') : tr('Rozpocznij grę', 'Start game')}</button>}
    </div>
  </main>
}
