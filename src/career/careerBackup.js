import { careerForStorage, rehydrateCareerWorld } from './worldState.js'
import { getSlot, saveCareerNow } from './saveStore.js'
import { SLOT_COUNT, SAVE_VERSION } from './constants.js'
import { STREAMLINED_VERSION } from './gameplayEdition.js'

export function exportCareerBackup(career) {
  return JSON.stringify({ format: 'ultimate-manager-career', version: 1, career: careerForStorage(career) })
}

export function restoreCareerBackup(text, slotIndex) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_COUNT || getSlot(slotIndex)) throw new Error('Wybierz pusty slot. / Choose an empty slot.')
  const data = JSON.parse(text)
  const c = data?.career
  if (data?.format !== 'ultimate-manager-career' || data.version !== 1 || !c?.league?.currentDate || !c.world?.teamsById || !c.playerTeamId || !c.world.teamsById[c.playerTeamId] || !Array.isArray(c.inbox)) throw new Error('Nieprawidłowa kopia kariery. / Invalid career backup.')
  if ((c.version ?? 1) > SAVE_VERSION || (c.editionVersion ?? 1) > STREAMLINED_VERSION || (c.gameplayEdition && !['classic','streamlined'].includes(c.gameplayEdition))) throw new Error('Ta kopia wymaga nowszej wersji gry. / This backup requires a newer game version.')
  const restored = rehydrateCareerWorld(structuredClone(c))
  return saveCareerNow({ ...restored, slotIndex })
}
