/**
 * Persistencja 3 slotów kariery w localStorage.
 */

import { SAVE_VERSION, SLOT_COUNT, STORAGE_KEY } from './constants.js'
import { careerForStorage, rehydrateCareerWorld } from './worldState.js'

function emptySlots() {
  return Array.from({ length: SLOT_COUNT }, () => null)
}

function normalizeStore(raw) {
  const slots = emptySlots()
  if (!raw || typeof raw !== 'object') {
    return { version: SAVE_VERSION, slots }
  }
  const incoming = Array.isArray(raw.slots) ? raw.slots : []
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const slot = incoming[i]
    slots[i] = slot && typeof slot === 'object' ? rehydrateCareerWorld(slot) : null
  }
  return { version: SAVE_VERSION, slots }
}

export function loadSaveStore() {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (!text) return normalizeStore(null)
    return normalizeStore(JSON.parse(text))
  } catch {
    return normalizeStore(null)
  }
}

export function writeSaveStore(store) {
  const slots = emptySlots()
  const incoming = Array.isArray(store?.slots) ? store.slots : []
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const slot = incoming[i]
    slots[i] = slot && typeof slot === 'object' ? careerForStorage(slot) : null
  }
  const payload = { version: SAVE_VERSION, slots }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  return normalizeStore(payload)
}

export function listSlots() {
  return loadSaveStore().slots
}

export function getSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return null
  return loadSaveStore().slots[slotIndex] ?? null
}

export function writeSlot(slotIndex, career) {
  if (slotIndex < 0 || slotIndex >= SLOT_COUNT) {
    throw new Error(`Nieprawidłowy slot: ${slotIndex}`)
  }
  const store = loadSaveStore()
  const withMeta = {
    ...career,
    slotIndex,
    updatedAt: new Date().toISOString(),
  }
  store.slots[slotIndex] = withMeta
  writeSaveStore(store)
  return rehydrateCareerWorld(getSlot(slotIndex))
}

export function clearSlot(slotIndex) {
  if (slotIndex < 0 || slotIndex >= SLOT_COUNT) {
    throw new Error(`Nieprawidłowy slot: ${slotIndex}`)
  }
  const store = loadSaveStore()
  store.slots[slotIndex] = null
  writeSaveStore(store)
  return store.slots
}

export function slotSummary(career) {
  if (!career) return null
  const standing = career.league?.standings?.[career.playerTeamId]
  const team =
    career.world?.teamsById?.[career.playerTeamId] ?? null
  return {
    slotIndex: career.slotIndex,
    managerName: career.managerName,
    playerTeamId: career.playerTeamId,
    teamName: team?.name ?? null,
    teamColor: team?.primaryColor ?? null,
    seasonYear: career.seasonYear,
    seasonIndex: career.seasonIndex,
    seasonLabel: career.league?.seasonLabel ?? `UFA ${career.seasonYear}`,
    phase: career.phase,
    wins: standing?.wins ?? 0,
    losses: standing?.losses ?? 0,
    seasonsPlayed: career.seasonHistory?.length ?? 0,
    rosterCount: team?.players?.length ?? null,
    updatedAt: career.updatedAt,
    createdAt: career.createdAt,
  }
}
