import { MATCH_CONFIG } from './config.js'
import { padLine } from './lineups.js'
import { isPlayerAvailable, isPlayerInjured } from '../models/playerInjury.js'
import { getPlayerFullName } from '../data/mockPlayers.js'

export const LINEUP_SIZE = MATCH_CONFIG.lineupSize

/** Czy gracz jest już na innej pozycji w tej samej linii. */
export function isPlayerTakenOnLine(line, playerId, excludeSlotIndex = -1) {
  if (playerId == null) return false
  const ids = padLine(line)
  return ids.some((id, i) => i !== excludeSlotIndex && id === playerId)
}

/** Przypisanie slotu — jeśli zawodnik jest już na linii, zamienia pozycje (swap). */
export function assignPlayerToLineupSlot(line, slotIndex, playerId) {
  const next = [...padLine(line)]
  if (slotIndex < 0 || slotIndex >= LINEUP_SIZE) return next

  if (playerId == null) {
    next[slotIndex] = null
    return next
  }

  if (next[slotIndex] === playerId) return next

  const otherIndex = next.findIndex((id, i) => i !== slotIndex && id === playerId)
  if (otherIndex >= 0) {
    next[otherIndex] = next[slotIndex] ?? null
    next[slotIndex] = playerId
    return next
  }

  next[slotIndex] = playerId
  return next
}

/** Indeks slotu zawodnika na linii (−1 jeśli brak). */
export function lineSlotIndexOf(line, playerId) {
  if (playerId == null) return -1
  return padLine(line).findIndex((id) => id === playerId)
}

function playerFromLookup(playersById, playerId) {
  if (playerId == null || !playersById) return null
  if (playersById instanceof Map) return playersById.get(playerId) ?? null
  return playersById[playerId] ?? null
}

/**
 * Walidacja składu przed startem punktu.
 * @param {unknown[]} lineupIds
 * @param {Record<string|number, object>|Map|object[]|null} [playersByIdOrRoster]
 * @returns {{ ok: boolean, reason?: 'incomplete'|'duplicate'|'empty'|'injured', injuredIds?: unknown[], injuredNames?: string[] }}
 */
export function validateLineupForSubmit(lineupIds, playersByIdOrRoster = null) {
  const line = padLine(lineupIds)
  const filled = line.filter((id) => id != null)
  if (filled.length === 0) return { ok: false, reason: 'empty' }
  if (filled.length !== LINEUP_SIZE) return { ok: false, reason: 'incomplete' }
  const unique = new Set(filled)
  if (unique.size !== LINEUP_SIZE) return { ok: false, reason: 'duplicate' }

  if (playersByIdOrRoster) {
    let lookup = playersByIdOrRoster
    if (Array.isArray(playersByIdOrRoster)) {
      lookup = Object.fromEntries(playersByIdOrRoster.map((p) => [p.id, p]))
    }
    const injuredPlayers = filled
      .map((id) => playerFromLookup(lookup, id))
      .filter((player) => player && isPlayerInjured(player))
    if (injuredPlayers.length) {
      return {
        ok: false,
        reason: 'injured',
        injuredIds: injuredPlayers.map((p) => p.id),
        injuredNames: injuredPlayers.map((p) => getPlayerFullName(p)),
      }
    }
  }

  return { ok: true }
}

export function lineupValidationMessage(result) {
  if (!result || result.ok) return null
  if (result.message) return result.message
  if (result.reason === 'duplicate') {
    return 'Każdy zawodnik może być w składzie tylko raz — usuń duplikaty.'
  }
  if (result.reason === 'incomplete') {
    return `Uzupełnij skład (${LINEUP_SIZE} zawodników).`
  }
  if (result.reason === 'injured') {
    const names = (result.injuredNames ?? []).filter(Boolean)
    if (names.length) {
      return `Kontuzjowany w składzie: ${names.join(', ')} — wymień przed punktem.`
    }
    return 'Kontuzjowany zawodnik nie może wyjść na punkt — wymień go w składzie.'
  }
  return 'Wybierz skład punktu.'
}

/** Usuwa kontuzjowanych z linii O/D taktyki (slot → null). */
export function stripInjuredPlayersFromTactics(tactics, roster = []) {
  if (!tactics) return tactics
  const byId = Object.fromEntries((roster ?? []).map((p) => [p.id, p]))
  const scrub = (line) =>
    padLine(line).map((id) => {
      if (id == null) return null
      const player = byId[id]
      if (player && !isPlayerAvailable(player)) return null
      return id
    })

  return {
    ...tactics,
    lineupWhenOffenseStartPlayerIds: scrub(tactics.lineupWhenOffenseStartPlayerIds),
    lineupWhenDefenseStartPlayerIds: scrub(tactics.lineupWhenDefenseStartPlayerIds),
  }
}
