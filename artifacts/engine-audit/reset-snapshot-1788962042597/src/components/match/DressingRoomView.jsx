import { useMemo, useState } from 'react'
import { getPlayerFullName } from '../../data/mockPlayers'
import {
  getInfluenceTiers,
  rankRosterByInfluence,
  statementsFor,
  statementText,
  computeStatementReactions,
  applyTeamTalkEffect,
  reactionLine,
} from '../../models/teamTalk.js'
import { useUiLang } from '../../ui/UiLangContext'
import { teamTalkStrings } from '../../ui/strings/teamTalk'

const TIER_ORDER = ['leader', 'influential', 'other']

const SENTIMENT_DOT = {
  positive: 'bg-emerald-400',
  neutral: 'bg-ufa-muted/60',
  negative: 'bg-red-400',
}

function PlayerRow({ player, reaction, lang }) {
  return (
    <li className="flex items-start gap-2 px-4 py-2 text-sm">
      {reaction ? (
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SENTIMENT_DOT[reaction.sentiment]}`}
          aria-hidden
        />
      ) : (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-transparent" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-ufa-text">{getPlayerFullName(player)}</p>
        {reaction ? (
          <p className="mt-0.5 text-xs italic text-ufa-muted">{reactionLine(reaction.sentiment, lang)}</p>
        ) : null}
      </div>
    </li>
  )
}

function TierGroup({ title, players, reactionsById, lang }) {
  if (!players.length) return null
  return (
    <div>
      <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ufa-muted">
        {title}
      </p>
      <ul className="divide-y divide-ufa-border/40">
        {players.map((p) => (
          <PlayerRow key={p.id} player={p} reaction={reactionsById?.get(p.id)} lang={lang} />
        ))}
      </ul>
    </div>
  )
}

/** Szatnia przed/po meczu — wybór wypowiedzi, krótkie reakcje zawodników, mały wpływ na morale. */
export default function DressingRoomView({
  mode,
  roster,
  outcome = null,
  onContinue,
}) {
  const { lang } = useUiLang()
  const t = teamTalkStrings(lang)
  const [pickedId, setPickedId] = useState(null)
  const [reactions, setReactions] = useState(null)

  const tierById = useMemo(() => getInfluenceTiers(roster), [roster])
  const ranked = useMemo(() => rankRosterByInfluence(roster), [roster])
  const grouped = useMemo(() => {
    const byTier = { leader: [], influential: [], other: [] }
    for (const p of ranked) {
      const tier = tierById.get(p.id) ?? 'other'
      byTier[tier].push(p)
    }
    return byTier
  }, [ranked, tierById])

  const statements = useMemo(() => statementsFor(mode, outcome), [mode, outcome])

  const reactionsById = useMemo(() => {
    if (!reactions) return null
    return new Map(reactions.map((r) => [r.playerId, r]))
  }, [reactions])

  const title =
    mode === 'pre'
      ? t.preTitle
      : outcome === 'win'
        ? t.postTitleWin
        : outcome === 'loss'
          ? t.postTitleLoss
          : t.postTitleDraw

  function pick(statement) {
    if (pickedId) return
    const computed = computeStatementReactions(roster, statement)
    applyTeamTalkEffect(roster, computed)
    setPickedId(statement.id)
    setReactions(computed)
  }

  const pickedStatement = statements.find((s) => s.id === pickedId) ?? null

  return (
    <div className="space-y-4 league-fade-in">
      <div className="rounded-xl border border-ufa-accent/35 bg-ufa-panel p-5 text-center shadow-xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-ufa-accent">{title}</p>
        {mode === 'pre' ? <p className="mt-1 text-sm text-ufa-muted">{t.preHint}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30">
          <p className="border-b border-ufa-border px-4 py-3 text-sm font-semibold text-ufa-text">
            {t.reactionsTitle}
          </p>
          <div className="max-h-[55vh] divide-y divide-ufa-border/40 overflow-y-auto">
            {TIER_ORDER.map((tier) => (
              <TierGroup
                key={tier}
                title={tier === 'leader' ? t.tierLeader : tier === 'influential' ? t.tierInfluential : t.tierOther}
                players={grouped[tier]}
                reactionsById={reactionsById}
                lang={lang}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-xl shadow-black/30">
          {!pickedStatement ? (
            <>
              <p className="mb-3 text-sm font-semibold text-ufa-text">{t.pickStatement}</p>
              <div className="space-y-2">
                {statements.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pick(s)}
                    className="block w-full rounded-md border border-ufa-border bg-ufa-bg/50 px-3 py-2.5 text-left text-sm text-ufa-text hover:border-ufa-accent/60 hover:bg-ufa-panel-hover"
                  >
                    {statementText(s, lang)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onContinue}
                className="mt-4 text-xs text-ufa-muted underline hover:text-ufa-text"
              >
                {t.skip}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-ufa-text">&ldquo;{statementText(pickedStatement, lang)}&rdquo;</p>
              <p className="mt-2 text-xs text-ufa-muted">{t.statementLocked}</p>
              <button
                type="button"
                onClick={onContinue}
                className="mt-4 w-full rounded-md bg-ufa-accent px-4 py-2.5 text-sm font-semibold text-ufa-bg shadow-md hover:opacity-90"
              >
                {mode === 'pre' ? t.kickoffLabel : t.continueLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
