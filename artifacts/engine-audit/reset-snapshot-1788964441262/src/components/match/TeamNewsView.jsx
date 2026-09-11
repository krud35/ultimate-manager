import { useMemo } from 'react'
import { getPlayerFullName, getOverallRating } from '../../data/mockPlayers'
import { ThrowingHandBadge } from '../TeamRosterPanel'
import { isPlayerInjured, injuryStatusLabel } from '../../models/playerInjury.js'
import { useUiLang } from '../../ui/UiLangContext'
import { matchStrings } from '../../ui/strings/match'

function PlayerRow({ player, starting, injured, t, lang }) {
  return (
    <li
      className={`flex items-center gap-2 px-4 py-2 text-sm ${
        injured ? 'opacity-60' : starting ? 'bg-ufa-accent/5' : ''
      }`}
    >
      <span
        className={`w-7 shrink-0 text-center text-[10px] font-bold tabular-nums ${
          starting ? 'text-ufa-accent' : 'text-ufa-muted/50'
        }`}
      >
        {player.jersey ?? ''}
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${
          starting ? 'font-semibold text-ufa-text' : 'text-ufa-muted'
        }`}
      >
        {getPlayerFullName(player)}
      </span>
      {starting ? (
        <span className="shrink-0 rounded bg-ufa-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-ufa-accent ring-1 ring-ufa-accent/30">
          {t.teamNewsStarting}
        </span>
      ) : null}
      <ThrowingHandBadge player={player} />
      {injured ? (
        <span
          title={injuryStatusLabel(player, lang)}
          className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400 ring-1 ring-red-500/40"
        >
          {injuryStatusLabel(player, lang)}
        </span>
      ) : null}
    </li>
  )
}

function RosterColumn({ team, startingIds, t, lang }) {
  const { starting, bench, injured } = useMemo(() => {
    const ids = startingIds ?? []
    const startingSet = new Set(ids)
    const byOvrDesc = (a, b) => getOverallRating(b.skills) - getOverallRating(a.skills)
    const startingList = []
    const benchList = []
    const injuredList = []
    for (const p of team?.players ?? []) {
      if (isPlayerInjured(p)) {
        injuredList.push(p)
      } else if (startingSet.has(p.id)) {
        startingList.push(p)
      } else {
        benchList.push(p)
      }
    }
    startingList.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    benchList.sort(byOvrDesc)
    injuredList.sort(byOvrDesc)
    return { starting: startingList, bench: benchList, injured: injuredList }
  }, [team?.players, startingIds])

  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30">
      <div className="border-b border-ufa-border px-4 py-3">
        <h3 className="font-semibold text-ufa-text">{team?.name ?? '—'}</h3>
        <p className="mt-0.5 text-xs text-ufa-muted">
          {t.teamNewsRosterCount(team?.players?.length ?? 0)}
        </p>
      </div>
      <ul className="max-h-[60vh] divide-y divide-ufa-border/50 overflow-y-auto">
        {[...starting, ...bench].map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            starting={starting.includes(p)}
            injured={false}
            t={t}
            lang={lang}
          />
        ))}
        {injured.length > 0 ? (
          <>
            <li className="bg-ufa-bg/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ufa-muted">
              {t.teamNewsInjured}
            </li>
            {injured.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                starting={false}
                injured
                t={t}
                lang={lang}
              />
            ))}
          </>
        ) : null}
      </ul>
    </div>
  )
}

/** Ekran "team news" — pełne rostery obu drużyn, potwierdzone siódemki wyróżnione, kontuzjowani na dole. */
export default function TeamNewsView({
  homeTeam,
  awayTeam,
  homeStartingIds,
  awayStartingIds,
  onContinue,
}) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)

  return (
    <div className="space-y-5 league-fade-in">
      <div className="rounded-xl border border-ufa-accent/35 bg-ufa-panel p-5 text-center shadow-xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-ufa-accent">
          {t.teamNewsTitle}
        </p>
        <p className="mt-1 text-sm text-ufa-muted">{t.teamNewsHint}</p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-4 rounded-md bg-ufa-accent px-6 py-2.5 text-sm font-semibold text-ufa-bg shadow-md hover:opacity-90"
        >
          {t.teamNewsContinue}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RosterColumn team={homeTeam} startingIds={homeStartingIds} t={t} lang={lang} />
        <RosterColumn team={awayTeam} startingIds={awayStartingIds} t={t} lang={lang} />
      </div>
    </div>
  )
}
