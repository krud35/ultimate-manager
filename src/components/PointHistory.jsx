import { EVENT, TACTICS_MODIFIERS, DEFENSE_STYLES } from '../matchEngine'
import { useUiLang } from '../ui/UiLangContext'
import { pickCopy, UI_LANG } from '../ui/locale'
import { matchStrings } from '../ui/strings/match'

function pointEventLabel(event, homeName, awayName, t, lang) {
  switch (event.type) {
    case EVENT.POINT_START:
      return t.historyPointStart(
        event.pointIndex,
        event.attackTeam === 'home' ? homeName : awayName,
      )
    case EVENT.PULL:
      return t.eventPull(event.teamName)
    case EVENT.PERSON_MATCHUPS:
      return t.personMatchups(event.pairs?.length ?? 0)
    case EVENT.POSSESSION:
      return t.eventPossession(event.teamName, event.discPosition)
    case EVENT.SEPARATION:
    case EVENT.STALL_PRESSURE:
    case EVENT.STALL_OUT:
      return pickCopy(event, 'narrative', lang) || event.type
    case EVENT.THROW_ATTEMPT:
      return (
        pickCopy(event, 'narrative', lang) ||
        `${event.throwerName} → ${event.receiverName}`
      )
    case EVENT.THROW_SUCCESS:
      return pickCopy(event, 'narrative', lang) || `✓ ${event.yardsGained ?? 0}m`
    case EVENT.THROW_FAIL:
      return pickCopy(event, 'narrative', lang) || `✗ turnover`
    case EVENT.TURNOVER:
      return event.reason === 'stall_out'
        ? t.eventStallOut(event.teamName, event.discPosition)
        : t.possessionChange(event.teamName, event.discPosition)
    case EVENT.SCORE:
      return (
        pickCopy(event, 'narrative', lang) ||
        t.eventScore(event.teamName, event.reason)
      )
    case EVENT.INJURY: {
      const label =
        lang === UI_LANG.EN
          ? event.labelEn ?? event.label
          : event.label ?? event.labelEn
      return (
        pickCopy(event, 'narrative', lang) ||
        t.eventInjury(event.playerName, label, event.daysRemaining)
      )
    }
    case EVENT.POINT_END:
      return t.eventPointEnd(event.throws)
    default:
      return event.type
  }
}

function eventRowClass(event) {
  if (event.type === EVENT.SCORE) return 'text-ufa-accent font-semibold'
  if (event.type === EVENT.INJURY) return 'text-red-400 font-semibold'
  if (event.type === EVENT.THROW_FAIL) return 'text-orange-300/90'
  if (event.type === EVENT.TURNOVER) return 'text-ufa-gold/90'
  if (event.type === EVENT.STALL_OUT) return 'text-red-300 font-semibold'
  if (event.type === EVENT.STALL_PRESSURE) return 'text-amber-200/90'
  if (event.type === EVENT.PERSON_MATCHUPS) return 'text-sky-300/90'
  return 'text-ufa-muted'
}

export default function PointHistory({
  events,
  pointIndex,
  pointIndices,
  onSelectPointIndex,
  scoringTeam,
  throws,
  homeTeamName,
  awayTeamName,
}) {
  const { lang } = useUiLang()
  const t = matchStrings(lang)

  if (!events?.length) return null

  const homeName = homeTeamName ?? t.home
  const awayName = awayTeamName ?? t.away
  const winnerName =
    scoringTeam === 'home' ? homeName : scoringTeam === 'away' ? awayName : null
  const zoneLabel =
    lang === UI_LANG.EN
      ? TACTICS_MODIFIERS.defense[DEFENSE_STYLES.ZONE_CUP]?.labelEn ??
        TACTICS_MODIFIERS.defense[DEFENSE_STYLES.ZONE_CUP]?.label
      : TACTICS_MODIFIERS.defense[DEFENSE_STYLES.ZONE_CUP]?.label

  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel shadow-xl shadow-black/30 overflow-hidden">
      <div className="border-b border-ufa-border px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-semibold text-ufa-text">{t.pointHistoryTitle}</h3>
          <p className="text-xs text-ufa-muted mt-1">
            {t.pointHistorySubtitle}
            {winnerName ? (
              <>
                {' '}
                · {t.winnerLabel}: <span className="text-ufa-text">{winnerName}</span>
                {throws != null ? ` · ${t.throwsN(throws)}` : ''}
              </>
            ) : null}
          </p>
        </div>
        {pointIndices?.length > 1 && onSelectPointIndex && (
          <label className="flex flex-col gap-1 text-xs text-ufa-muted">
            {t.pointLabel}
            <select
              value={pointIndex}
              onChange={(e) => onSelectPointIndex(Number(e.target.value))}
              className="rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-sm text-ufa-text min-w-[5rem]"
            >
              {pointIndices.map((idx) => (
                <option key={idx} value={idx}>
                  {idx}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <ul className="max-h-[420px] overflow-y-auto divide-y divide-ufa-border/40 px-4 py-2 text-sm font-mono">
        {events.map((event) => (
          <li key={event.id}>
            {event.type === EVENT.PERSON_MATCHUPS ? (
              <div className={`py-2 px-2 ${eventRowClass(event)}`}>
                <p>{pointEventLabel(event, homeName, awayName, t, lang)}</p>
                <ul className="mt-1.5 space-y-0.5 pl-2 text-xs opacity-90">
                  {event.pairs?.map((pair) => (
                    <li key={pair.offenseId}>
                      {pair.offenseName}{' '}
                      <span className="opacity-60">←</span> {pair.defenderName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className={`py-2 px-2 ${eventRowClass(event)}`}>
                {pointEventLabel(event, homeName, awayName, t, lang)}
              </p>
            )}
          </li>
        ))}
      </ul>

      <p className="border-t border-ufa-border px-4 py-2 text-[11px] text-ufa-muted">
        {t.personZoneFootnote(zoneLabel)}
      </p>
    </div>
  )
}
