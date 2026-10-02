import { compactStreamlinedTactics } from './streamlinedTactics.js'
/** Career-local rules. Missing metadata always means the original game. */
export const GAMEPLAY_EDITIONS = ['classic', 'streamlined']
export const STREAMLINED_VERSION = 2
export function gameplayEdition(career) {
  return career?.gameplayEdition === 'streamlined' ? 'streamlined' : 'classic'
}
export function isStreamlinedCareer(career) { return gameplayEdition(career) === 'streamlined' }
export function editionLabel(career, lang = 'pl') {
  return isStreamlinedCareer(career) ? (lang === 'en' ? 'Streamlined' : 'Uproszczona') : (lang === 'en' ? 'Classic' : 'Klasyczna')
}

/** Additive initialization only for explicitly opted-in careers; never converts old saves. */
export function prepareCareerEdition(career) {
  if (!isStreamlinedCareer(career)) return career
  // Do not throw inside the legacy store loader: its fallback clears the whole store.
  // Preserve unknown future metadata rather than downgrade it.
  if ((career.editionVersion ?? 1) > STREAMLINED_VERSION) return career
  if (!career.streamlinedRules) {
    const migrating = career.editionVersion === 1
    career.streamlinedRules = { version: 2, economyFromSeason: (career.seasonYear ?? 2025) + (migrating ? 1 : 0), migrated: migrating }
    if (migrating) career.streamlinedMigration = {
      date: career.league?.currentDate, previousTactics: structuredClone(career.homeTactics ?? {}),
      messagePl: 'Taktykę przeliczono na cztery osie. Umowy, premie, obietnice, juniorzy, poziomy obiektów i opłacone działania pozostają w mocy. Wartość zachowanych obiektów nie zmienia się; rekompensata: 0. Automatyczna rezerwa finansowa zacznie działać w kolejnym sezonie.',
      messageEn: 'Tactics were mapped to four axes. Contracts, bonuses, promises, juniors, facility levels and paid projects remain in force. Facility value is unchanged; compensation: 0. Automatic financial reserves start next season.',
    }
  }
  career.editionVersion = STREAMLINED_VERSION
  career.homeTactics = compactStreamlinedTactics(career.homeTactics)
  for (const club of Object.values(career.world?.teamsById ?? {})) {
    club.streamlinedClub ??= { enabled: true, staffRenewalCap: null }
    club.streamlinedClub.economyActive = career.seasonYear >= career.streamlinedRules.economyFromSeason
  }
  const team = career.world?.teamsById?.[career.playerTeamId]
  if (team) {
    team.teamTraining ??= { weekly: [], oneOff: [], sessionLog: [], tacticsFamiliarity: 38 }
    team.teamTraining.schedule ??= { version: 1, template: 'balanced', overrides: {}, weeks: {} }
    const schedule = team.teamTraining.schedule
    schedule.streamlined ??= { version: 1, goal: 'tactical', intensity: 'normal', projects: [] }
    schedule.legacy = false
    schedule.autoRest = true
    schedule.restBelow = 55
    schedule.adaptMatches = true
  }
  return career
}
