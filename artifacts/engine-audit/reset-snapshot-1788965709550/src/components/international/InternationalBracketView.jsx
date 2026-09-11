import { useMemo } from 'react'
import { academyCountryLabel } from '../../data/academyScoutGeography.js'
import { countryIdFromPseudoTeamId } from '../../career/nationalTeamQualifying.js'

/**
 * Kopia `BracketView`/`BracketMatchCard` z `CupView.jsx`, nie reużycie — patrz plan, sekcja 4:
 * kształt meczu jest zgodny 1:1 (ten sam `advanceCupAfterMatch`), ale nazwy rund i drużyny się
 * nie zgadzają (kadry to pseudo-drużyny `nt-<countryId>`, nie ma ich w `league.teamsById`) —
 * kopiowanie mniejszym ryzykiem konfliktu z aktywnie rozwijanym CupView.jsx niż uogólnianie go.
 * Bez przycisku "Zagraj" — mecze reprezentacji rozstrzyga codzienny hak pętli kariery
 * (`advanceNationalTeamsForDate`), nie akcja gracza.
 */
const ROUND_ORDER = {
  euro: ['quarterfinal', 'semifinal', 'final'],
  world: ['roundOf16', 'quarterfinal', 'semifinal', 'final'],
}
const CENTERED_ROUNDS = new Set(['semifinal', 'final'])

function shortName(name) {
  if (!name) return null
  if (name.length <= 18) return name
  return `${name.slice(0, 16)}…`
}

function countryName(pseudoTeamId, lang, t) {
  if (!pseudoTeamId) return t.waiting
  return shortName(academyCountryLabel(countryIdFromPseudoTeamId(pseudoTeamId), lang)) ?? t.waiting
}

function BracketMatchCard({ match, lang, t }) {
  const done = match.status === 'completed'
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${
        done ? 'border-ufa-border bg-ufa-bg/60' : 'border-ufa-border/70 bg-ufa-bg/40'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-ufa-muted">
          {t.round[match.round] ?? match.round}
        </span>
        {match.date && <span className="tabular-nums text-ufa-muted">{match.date.slice(5)}</span>}
      </div>
      <div className="space-y-1">
        <div
          className={`flex items-center justify-between gap-2 ${
            done && match.winnerTeamId === match.homeTeamId ? 'font-semibold text-ufa-text' : 'text-ufa-muted'
          }`}
        >
          <span className="truncate">{countryName(match.homeTeamId, lang, t)}</span>
          <span className="w-5 shrink-0 text-right tabular-nums">{done ? match.homeScore : '—'}</span>
        </div>
        <div
          className={`flex items-center justify-between gap-2 ${
            done && match.winnerTeamId === match.awayTeamId ? 'font-semibold text-ufa-text' : 'text-ufa-muted'
          }`}
        >
          <span className="truncate">{countryName(match.awayTeamId, lang, t)}</span>
          <span className="w-5 shrink-0 text-right tabular-nums">{done ? match.awayScore : '—'}</span>
        </div>
      </div>
    </div>
  )
}

export default function InternationalBracketView({ finals, t, lang }) {
  const roundOrder = ROUND_ORDER[finals.kind] ?? ROUND_ORDER.euro
  const byRound = useMemo(() => {
    const map = Object.fromEntries(roundOrder.map((r) => [r, []]))
    for (const m of finals.knockout?.matches ?? []) {
      if (map[m.round]) map[m.round].push(m)
    }
    for (const r of roundOrder) map[r].sort((a, b) => (a.bracketIndex ?? 0) - (b.bracketIndex ?? 0))
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finals.knockout?.matches, roundOrder.join('|')])

  // Mecz o brąz jest bocznym meczem poza kaskadą (patrz nationalTeamFinals.js), więc nie ma
  // go w `roundOrder` — dokładamy go pod kolumną finału, gdzie chronologicznie należy.
  const bronze = (finals.knockout?.matches ?? []).find((m) => m.round === 'bronze')

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[640px] gap-4">
        {roundOrder.map((round) => (
          <div key={round} className="min-w-[160px] flex-1 space-y-3">
            <h4 className="px-1 text-xs font-semibold uppercase tracking-wide text-ufa-gold">
              {t.round[round] ?? round}
            </h4>
            <div className={`flex flex-col gap-3 ${CENTERED_ROUNDS.has(round) ? 'min-h-[280px] justify-around' : ''}`}>
              {byRound[round].map((match) => (
                <BracketMatchCard key={match.id} match={match} lang={lang} t={t} />
              ))}
              {round === 'final' && bronze && (
                <div className="mt-2 border-t border-ufa-border pt-3">
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-ufa-muted">
                    {t.bronzeMatch}
                  </p>
                  <BracketMatchCard match={bronze} lang={lang} t={t} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
