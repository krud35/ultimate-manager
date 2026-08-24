import { useMemo, useState } from 'react'
import { topLeaders, detectSeasonPhase } from '../league'
import { useUiLang } from '../ui/UiLangContext'
import { leagueViewsStrings } from '../ui/strings/leagueViews'
import { resolveTeamName } from '../ui/locale'

const UFA_ROUND_ORDER = ['prequarter', 'quarter', 'semi', 'final']
// Puchar Piramidy (48 drużyn Ligi Europejskiej): 2 dodatkowe wczesne rundy, których
// nie ma zwykły puchar UFA — patrz pyramidCup.js. Rozpoznawany po `cup.pyramidCupDates`.
const PYRAMID_ROUND_ORDER = ['round1', 'roundOf32', 'roundOf16', 'quarterfinal', 'semifinal', 'final']
/** Rundy, w których kolumna ma być wyśrodkowana pionowo (mało meczów, dużo miejsca). */
const CENTERED_ROUNDS = new Set(['semi', 'final', 'semifinal'])

function roundOrderFor(cup) {
  return cup?.pyramidCupDates ? PYRAMID_ROUND_ORDER : UFA_ROUND_ORDER
}

/**
 * Nazwy WSZYSTKICH drużyn dostępnych w `league.teamsById` — nie tylko `league.teamIds`
 * (poziom gracza). Puchar Piramidy obejmuje wszystkie 48 klubów piramidy, więc mecze
 * spoza poziomu gracza potrzebują też swoich nazw (stąd nie da się użyć teamNameMap()
 * z leagueState.js, ograniczonego do league.teamIds).
 */
function allTeamNames(league, lang) {
  const map = {}
  const teamsById = league?.teamsById ?? {}
  for (const id of Object.keys(teamsById)) {
    map[id] = resolveTeamName(teamsById[id], lang) || id
  }
  return map
}

function shortName(name) {
  if (!name) return 'TBD'
  if (name.length <= 18) return name
  return `${name.slice(0, 16)}…`
}

function seedLabel(match, side) {
  const seed = side === 'home' ? match.homeSeed : match.awaySeed
  return seed != null ? seed : null
}

function LeaderColumn({ title, rows, valueKey, teamNames, emptyLabel }) {
  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-lg shadow-black/20">
      <h3 className="font-semibold text-ufa-text text-sm mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-ufa-muted">{emptyLabel}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row, i) => (
            <li key={row.playerId} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ufa-muted w-5 tabular-nums">{i + 1}.</span>
              <span className="flex-1 min-w-0 truncate text-ufa-text">
                {row.firstName} {row.lastName}
                <span className="text-xs text-ufa-muted ml-1">
                  ({teamNames[row.teamId]?.split(' ').pop()})
                </span>
              </span>
              <span className="font-semibold tabular-nums text-ufa-gold">{row[valueKey]}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function BracketMatchCard({ match, names, playerTeamId, onPlayFixture, currentDate, t }) {
  const done = match.status === 'completed'
  const isToday = !!match.date && match.date === currentDate
  const ready =
    !done &&
    isToday &&
    match.homeTeamId &&
    match.awayTeamId &&
    (match.status === 'scheduled' || match.status === 'pending')
  const isYours =
    playerTeamId &&
    (match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId)

  const homeSeed = seedLabel(match, 'home')
  const awaySeed = seedLabel(match, 'away')

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${
        isYours
          ? 'border-ufa-gold/50 bg-ufa-gold/10'
          : done
            ? 'border-ufa-border bg-ufa-bg/60'
            : 'border-ufa-border/70 bg-ufa-bg/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-wide text-ufa-muted">
          {t.cupRound[match.round] ?? match.round}
          <span className="ml-1.5 text-ufa-gold">N</span>
        </span>
        {match.date && (
          <span className="tabular-nums text-ufa-muted">{match.date.slice(5)}</span>
        )}
      </div>

      <div className="space-y-1">
        <div
          className={`flex items-center justify-between gap-2 ${
            done && match.winnerTeamId === match.homeTeamId
              ? 'text-ufa-text font-semibold'
              : 'text-ufa-muted'
          }`}
        >
          <span className="truncate flex items-center gap-1.5 min-w-0">
            {homeSeed != null && (
              <span className="tabular-nums text-[10px] text-ufa-gold/80 w-4 shrink-0">
                {homeSeed}
              </span>
            )}
            <span className="truncate">
              {match.homeTeamId ? shortName(names[match.homeTeamId]) : t.waiting}
            </span>
          </span>
          <span className="tabular-nums shrink-0 w-5 text-right">
            {done ? match.homeScore : '—'}
          </span>
        </div>
        <div
          className={`flex items-center justify-between gap-2 ${
            done && match.winnerTeamId === match.awayTeamId
              ? 'text-ufa-text font-semibold'
              : 'text-ufa-muted'
          }`}
        >
          <span className="truncate flex items-center gap-1.5 min-w-0">
            {awaySeed != null && (
              <span className="tabular-nums text-[10px] text-ufa-gold/80 w-4 shrink-0">
                {awaySeed}
              </span>
            )}
            <span className="truncate">
              {match.awayTeamId ? shortName(names[match.awayTeamId]) : t.waiting}
            </span>
          </span>
          <span className="tabular-nums shrink-0 w-5 text-right">
            {done ? match.awayScore : '—'}
          </span>
        </div>
      </div>

      {ready && isYours && onPlayFixture && (
        <button
          type="button"
          onClick={() => onPlayFixture(match)}
          className="mt-2 w-full rounded-md bg-ufa-gold/90 px-2 py-1 text-[11px] font-semibold text-ufa-bg hover:opacity-90"
        >
          {t.play}
        </button>
      )}
    </div>
  )
}

function BracketView({ league, names, onPlayFixture, t }) {
  const roundOrder = roundOrderFor(league.cup)
  const byRound = useMemo(() => {
    const map = Object.fromEntries(roundOrder.map((r) => [r, []]))
    for (const m of league.cup?.matches ?? []) {
      if (map[m.round]) map[m.round].push(m)
    }
    for (const r of roundOrder) {
      map[r].sort((a, b) => (a.bracketIndex ?? 0) - (b.bracketIndex ?? 0))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.cup?.matches, roundOrder.join('|')])

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4 min-w-[720px]">
        {roundOrder.map((round) => (
          <div key={round} className="flex-1 min-w-[160px] space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ufa-gold px-1">
              {t.cupRound[round] ?? round}
            </h4>
            <div
              className={`flex flex-col gap-3 ${
                CENTERED_ROUNDS.has(round) ? 'justify-around min-h-[280px]' : ''
              }`}
            >
              {byRound[round].map((match) => (
                <BracketMatchCard
                  key={match.id}
                  match={match}
                  names={names}
                  playerTeamId={league.playerTeamId}
                  onPlayFixture={onPlayFixture}
                  currentDate={league.currentDate}
                  t={t}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultsView({ league, names, onPlayFixture, t }) {
  const matches = useMemo(() => {
    const list = [...(league.cup?.matches ?? [])]
    return list.sort((a, b) => {
      const da = a.date ?? ''
      const db = b.date ?? ''
      if (da !== db) return da.localeCompare(db)
      return (a.bracketIndex ?? 0) - (b.bracketIndex ?? 0)
    })
  }, [league.cup?.matches])

  if (!matches.length) {
    return <p className="text-sm text-ufa-muted">{t.noCupMatches}</p>
  }

  return (
    <ul className="space-y-2">
      {matches.map((m) => {
        const done = m.status === 'completed'
        const isYours =
          m.homeTeamId === league.playerTeamId || m.awayTeamId === league.playerTeamId
        const canPlay =
          !done &&
          m.homeTeamId &&
          m.awayTeamId &&
          isYours &&
          onPlayFixture &&
          !!m.date &&
          m.date === league.currentDate

        return (
          <li
            key={m.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm ${
              isYours
                ? 'border-ufa-gold/40 bg-ufa-gold/5'
                : 'border-ufa-border bg-ufa-bg/50'
            }`}
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-ufa-muted">
                {t.cupRound[m.round] ?? m.round}
                {m.date ? ` · ${m.date}` : ''}
              </p>
              <p className="text-ufa-text mt-0.5">
                {m.homeTeamId ? names[m.homeTeamId] : 'TBD'}
                {' vs '}
                {m.awayTeamId ? names[m.awayTeamId] : 'TBD'}
                <span className="ml-2 text-[10px] font-semibold text-ufa-gold">N</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums text-ufa-muted font-medium">
                {done ? `${m.homeScore}:${m.awayScore}` : '—'}
              </span>
              {canPlay && (
                <button
                  type="button"
                  onClick={() => onPlayFixture(m)}
                  className="text-ufa-gold hover:underline text-xs font-semibold"
                >
                  {t.play}
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function CupStatsView({ league, names, t }) {
  const stats = league.cupPlayerStats ?? {}
  const goals = topLeaders(stats, 'goals', 10)
  const assists = topLeaders(stats, 'assists', 10)
  const blocks = topLeaders(stats, 'blocks', 10)
  const pointsPlayed = topLeaders(stats, 'pointsPlayed', 10)

  return (
    <div className="space-y-4">
      <p className="text-sm text-ufa-muted">{t.leadersHint}</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <LeaderColumn
          title={`${t.goals} (G)`}
          rows={goals}
          valueKey="goals"
          teamNames={names}
          emptyLabel={t.noCupData}
        />
        <LeaderColumn
          title={`${t.assists} (A)`}
          rows={assists}
          valueKey="assists"
          teamNames={names}
          emptyLabel={t.noCupData}
        />
        <LeaderColumn
          title={`${t.blocks} (D)`}
          rows={blocks}
          valueKey="blocks"
          teamNames={names}
          emptyLabel={t.noCupData}
        />
        <LeaderColumn
          title={`${t.pointsPlayed} (PP)`}
          rows={pointsPlayed}
          valueKey="pointsPlayed"
          teamNames={names}
          emptyLabel={t.noCupData}
        />
      </div>
    </div>
  )
}

export function CupTile({ league, onNavigate }) {
  const { lang } = useUiLang()
  const t = leagueViewsStrings(lang)
  const names = allTeamNames(league, lang)
  const cup = league.cup
  const phase = detectSeasonPhase(league)
  const champion =
    cup?.championTeamId != null
      ? names[cup.championTeamId] ?? cup.championTeamId
      : null

  const playerMatch = (cup?.matches ?? []).find(
    (m) =>
      m.status !== 'completed' &&
      m.homeTeamId &&
      m.awayTeamId &&
      (m.homeTeamId === league.playerTeamId || m.awayTeamId === league.playerTeamId),
  )

  const completed = (cup?.matches ?? []).filter((m) => m.status === 'completed').length
  const total = cup?.matches?.length ?? 0

  return (
    <button
      type="button"
      onClick={() => onNavigate('cup')}
      className="w-full rounded-xl border border-ufa-gold/30 bg-ufa-panel p-4 text-left shadow-lg shadow-black/20 transition hover:border-ufa-gold/60 hover:bg-ufa-panel-hover/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-ufa-gold">{t.cupTitle}</p>
          <p className="mt-0.5 text-sm font-semibold text-ufa-text">
            {champion
              ? t.champion(champion)
              : cup
                ? t.bracketReady
                : phase === 'cup'
                  ? t.cupPhaseActive
                  : t.afterFall}
          </p>
        </div>
        <span className="text-ufa-gold text-sm">→</span>
      </div>

      {cup ? (
        <>
          <p className="mt-2 text-xs text-ufa-muted">
            {t.playedMatches(completed, total)}
            {cup.status === 'complete' ? t.finished : ''}
          </p>
          {playerMatch && (
            <div className="mt-3 rounded-md border border-ufa-gold/40 bg-ufa-gold/10 px-2 py-1.5 text-xs">
              <span className="text-ufa-gold font-medium">{t.yourMatch} · </span>
              <span className="text-ufa-text">
                {shortName(names[playerMatch.homeTeamId])} vs{' '}
                {shortName(names[playerMatch.awayTeamId])}
              </span>
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-ufa-muted">{t.bracketHint}</p>
      )}

      <p className="mt-3 text-[10px] text-ufa-muted">{t.cupFooter}</p>
    </button>
  )
}

export default function CupView({ league, onPlayFixture = null }) {
  const { lang } = useUiLang()
  const t = leagueViewsStrings(lang)
  const tabs = [
    { id: 'bracket', label: t.tabBracket },
    { id: 'results', label: t.tabResults },
    { id: 'stats', label: t.tabStats },
  ]
  const [tab, setTab] = useState('bracket')
  const names = allTeamNames(league, lang)
  const cup = league.cup
  const champion =
    cup?.championTeamId != null
      ? names[cup.championTeamId] ?? cup.championTeamId
      : null

  return (
    <div className="space-y-6 league-fade-in">
      <div className="rounded-xl border border-ufa-gold/25 bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ufa-text">{t.cupTitle}</h2>
            <p className="mt-1 text-sm text-ufa-muted">{t.cupIntro}</p>
            {champion && (
              <p className="mt-2 text-sm text-ufa-gold font-medium">
                {t.winner}: {champion}
              </p>
            )}
            {!cup && <p className="mt-2 text-sm text-ufa-muted">{t.cupNotStarted}</p>}
          </div>
          {cup && (
            <div className="flex gap-1 rounded-lg bg-ufa-bg p-1 ring-1 ring-ufa-border self-start">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                    tab === item.id
                      ? 'bg-ufa-gold text-ufa-bg shadow-md'
                      : 'text-ufa-muted hover:text-ufa-text'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {cup && tab === 'bracket' && (
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-xl shadow-black/20">
          <BracketView league={league} names={names} onPlayFixture={onPlayFixture} t={t} />
        </div>
      )}

      {cup && tab === 'results' && (
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-xl shadow-black/20">
          <ResultsView league={league} names={names} onPlayFixture={onPlayFixture} t={t} />
        </div>
      )}

      {cup && tab === 'stats' && <CupStatsView league={league} names={names} t={t} />}

      {!cup && (
        <div className="rounded-xl border border-dashed border-ufa-border bg-ufa-panel/50 p-8 text-center">
          <p className="text-sm text-ufa-muted max-w-md mx-auto">{t.cupEmptyBody}</p>
        </div>
      )}
    </div>
  )
}
