import { useUiLang } from '../ui/UiLangContext'
import { tacticsStrings } from '../ui/strings/tactics'
import { useState } from 'react'
import { getPlayerFullName, getOverallRating } from '../data/mockPlayers'
import PlayerProfileModal from './PlayerProfileModal'
import { getStaminaForPlayer } from './StaminaBar'
import {
  SUB_LINE_TAGS,
  SUB_POSITION_TAGS,
  normalizePlayerSubTagsMap,
  normalizeTactics,
} from '../matchEngine'

const LINE_TAGS = new Set(Object.values(SUB_LINE_TAGS))
const POSITION_TAGS = new Set(Object.values(SUB_POSITION_TAGS))

function tagForGroup(tags, group) {
  const allowed = group === 'line' ? LINE_TAGS : POSITION_TAGS
  return (tags ?? []).find((tag) => allowed.has(tag)) ?? null
}

/**
 * Priorytety auto-zmian tylko dla ławki. Zawodnik wpisany do siódemki ma już swoją
 * linię; jego tag nie powinien ukrywać ani nadpisywać tego przypisania.
 */
export default function PlayerSubTagsPanel({
  roster = [],
  tactics,
  onTacticsChange,
  staminaMap = null,
  leaguePlayerStats = null,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const [draggedId, setDraggedId] = useState(null)
  const [profilePlayer, setProfilePlayer] = useState(null)
  if (!tactics || typeof onTacticsChange !== 'function') return null

  const assigned = new Set([
    ...(tactics.lineupWhenOffenseStartPlayerIds ?? []),
    ...(tactics.lineupWhenDefenseStartPlayerIds ?? []),
  ].filter((id) => id != null))
  const priorityRank = Object.fromEntries(
    (tactics.playerSubPriorityIds ?? []).map((id, index) => [String(id), index]),
  )
  const bench = roster
    .filter((player) => !assigned.has(player.id))
    .sort(
      (a, b) =>
        (priorityRank[String(a.id)] ?? Number.MAX_SAFE_INTEGER) -
          (priorityRank[String(b.id)] ?? Number.MAX_SAFE_INTEGER),
    )
  const tagsMap = normalizePlayerSubTagsMap(tactics.playerSubTags)

  function setTag(playerId, group, tag) {
    const key = String(playerId)
    const prior = tagsMap[key] ?? []
    const allowed = group === 'line' ? LINE_TAGS : POSITION_TAGS
    const nextTags = [...prior.filter((entry) => !allowed.has(entry)), tag]
    const nextMap = { ...tagsMap, [key]: nextTags }
    onTacticsChange(normalizeTactics({ ...tactics, playerSubTags: nextMap }))
  }

  function moveBefore(targetId) {
    if (draggedId == null || draggedId === targetId) return
    const ids = bench.map((player) => player.id)
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, draggedId)
    setDraggedId(null)
    onTacticsChange(normalizeTactics({ ...tactics, playerSubPriorityIds: ids }))
  }

  const lineOptions = [
    [SUB_LINE_TAGS.O_LINE, t.subOLine],
    [SUB_LINE_TAGS.D_LINE, t.subDLine],
    [SUB_LINE_TAGS.EITHER, t.subEitherLine],
  ]
  const positionOptions = [
    [SUB_POSITION_TAGS.CUTTER, t.subCutter],
    [SUB_POSITION_TAGS.HANDLER, t.subHandler],
    [SUB_POSITION_TAGS.EITHER, t.subEitherPosition],
  ]

  return (
    <>
      <section className="rounded-xl border border-ufa-border/80 bg-ufa-panel/50 px-4 py-3">
      <h3 className="text-sm font-semibold text-ufa-text">{t.subAssignments}</h3>
      <p className="mt-0.5 text-xs text-ufa-muted">{t.subAssignmentsHint}</p>
      <p className="mt-1 text-[11px] font-medium text-ufa-accent">{t.subPriorityHint}</p>
      {!bench.length ? (
        <p className="mt-2 text-xs text-ufa-muted">{t.noBenchPlayers}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {bench.map((player, index) => {
            const tags = tagsMap[String(player.id)] ?? []
            return (
              <div
                key={player.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveBefore(player.id)}
                className={`grid gap-2 rounded-lg bg-ufa-bg/35 px-2.5 py-2 transition sm:grid-cols-[minmax(10rem,1fr)_minmax(8rem,0.7fr)_minmax(8rem,0.7fr)] sm:items-center ${
                  draggedId === player.id ? 'opacity-45 ring-1 ring-ufa-accent/50' : 'hover:bg-ufa-bg/55'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    draggable
                    onDragStart={() => setDraggedId(player.id)}
                    onDragEnd={() => setDraggedId(null)}
                    title={t.subPriorityHint}
                    className="cursor-grab rounded px-1 text-sm text-ufa-muted hover:text-ufa-accent active:cursor-grabbing"
                    aria-label={`${t.subAssignments}: ${index + 1}`}
                  >
                    ⠿
                  </button>
                  <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-ufa-muted">{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => setProfilePlayer(player)}
                    className="min-w-0 truncate text-left text-xs font-medium text-ufa-accent hover:underline"
                    title={t.openProfile}
                  >
                    {getPlayerFullName(player)}
                  </button>
                  <span className="shrink-0 text-[11px] tabular-nums text-ufa-muted">OVR {getOverallRating(player.skills)}</span>
                </div>
                <label className="flex items-center justify-between gap-2 text-[11px] text-ufa-muted">
                  {t.subLine}
                  <select
                    value={tagForGroup(tags, 'line') ?? SUB_LINE_TAGS.EITHER}
                    onChange={(event) => setTag(player.id, 'line', event.target.value)}
                    className="rounded border border-ufa-border bg-ufa-panel px-1.5 py-1 text-xs text-ufa-text"
                  >
                    {lineOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2 text-[11px] text-ufa-muted">
                  {t.subPosition}
                  <select
                    value={tagForGroup(tags, 'position') ?? SUB_POSITION_TAGS.EITHER}
                    onChange={(event) => setTag(player.id, 'position', event.target.value)}
                    className="rounded border border-ufa-border bg-ufa-panel px-1.5 py-1 text-xs text-ufa-text"
                  >
                    {positionOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
              </div>
            )
          })}
        </div>
      )}
      </section>
      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => setProfilePlayer(null)}
        stamina={profilePlayer ? getStaminaForPlayer(staminaMap, profilePlayer.id) : null}
        leaguePlayerStats={leaguePlayerStats}
        isOwnPlayer
      />
    </>
  )
}
