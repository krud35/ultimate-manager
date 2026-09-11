import TacticsForm from './TacticsForm'
import { useUiLang } from '../ui/UiLangContext'
import { tacticsStrings } from '../ui/strings/tactics'

export default function Tactics({
  roster,
  tactics,
  onTacticsChange,
  teamName,
  staminaMap,
  leaguePlayerStats = null,
  teamColor = null,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  return (
    <div className="space-y-5">
      <header className="border-b border-ufa-border/60 pb-4">
        <h2 className="text-lg font-semibold tracking-tight text-ufa-text">
          {lang === 'en' ? 'Tactics' : 'Taktyka'} · {teamName}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ufa-muted">
          {t.intro}
        </p>
      </header>

      <TacticsForm
        roster={roster}
        tactics={tactics}
        onTacticsChange={onTacticsChange}
        staminaMap={staminaMap}
        lineupMode="dual"
        teamName={teamName}
        leaguePlayerStats={leaguePlayerStats}
        teamColor={teamColor}
      />

      <p className="text-center text-[11px] leading-relaxed text-ufa-muted">
        O-Line = {t.startOffense} · D-Line = {t.startDefense} · {t.sevenNote}
      </p>
    </div>
  )
}
