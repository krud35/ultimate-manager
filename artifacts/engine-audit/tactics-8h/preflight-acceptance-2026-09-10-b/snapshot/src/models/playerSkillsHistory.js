/**
 * Historia skilli zawodnika: comiesięczny snapshot (rolling window ~12-13 mies.),
 * używana do pokazania wzrostu "76 (+3)" w profilu własnego zawodnika.
 */

import { normalizePlayerSkills, PLAYER_STAT_CATEGORIES } from './playerStats.js'

/** Trzymamy nieco więcej niż 12, żeby najstarszy wpis w oknie realnie odpowiadał ~12 mies. wstecz. */
const SNAPSHOT_WINDOW = 13

export function ensurePlayerSkillsSnapshots(player) {
  if (!player) return player
  if (!Array.isArray(player.skillsSnapshots)) player.skillsSnapshots = []
  return player
}

function cloneSkills(skills) {
  const nested = normalizePlayerSkills(skills ?? {})
  const clone = {}
  for (const [cat, keys] of Object.entries(PLAYER_STAT_CATEGORIES)) {
    clone[cat] = {}
    for (const key of keys) clone[cat][key] = nested[cat][key]
  }
  return clone
}

/**
 * Zapisuje snapshot skilli na dany miesiąc (`ym` = 'YYYY-MM'). Idempotentne — wołanie
 * kilka razy w tym samym miesiącu nic nie zmienia. Rolling window: najstarsze wpisy
 * powyżej SNAPSHOT_WINDOW są usuwane.
 */
export function recordPlayerSkillsSnapshot(player, ym) {
  if (!player || !ym) return player
  ensurePlayerSkillsSnapshots(player)
  const list = player.skillsSnapshots
  if (list.length && list[list.length - 1].ym === ym) return player
  list.push({ ym, skills: cloneSkills(player.skills) })
  while (list.length > SNAPSHOT_WINDOW) list.shift()
  return player
}

/**
 * Zmiana wartości pojedynczego substatu względem najstarszego snapshotu w oknie
 * (czyli ~ostatnie 12 miesięcy, mniej jeśli kariera/zawodnik w drużynie jest młodsza).
 * @returns {{ delta: number } | null} null gdy brak historii lub danych.
 */
export function getSubStatGrowth(skillsSnapshots, currentSkills, category, key) {
  const list = Array.isArray(skillsSnapshots) ? skillsSnapshots : []
  if (!list.length) return null
  const past = list[0]?.skills?.[category]?.[key]
  const current = currentSkills?.[category]?.[key]
  if (typeof past !== 'number' || typeof current !== 'number') return null
  return { delta: current - past }
}
