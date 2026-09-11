import { ensureClubManagement } from './clubManagement.js'
import { clubBudgetAllocation, contractualWeeklyBill } from './clubEconomy.js'
import { clubObjectives } from './clubObjectives.js'

export function clubWelcomeSnapshot(team, year) {
  const copy = structuredClone(team)
  ensureClubManagement(copy, year)
  return {
    teamId: copy.id, teamName: copy.name, strategy: copy.clubStrategy,
    confidence: copy.boardObjective.confidence,
    objectives: { pl: clubObjectives(copy, 'pl'), en: clubObjectives(copy, 'en') },
    funds: { ...clubBudgetAllocation(copy), weeklyWages: contractualWeeklyBill(copy) },
  }
}

export function welcomeForMessage(message, career) {
  if (message.payload?.welcome) return message.payload.welcome
  if (!message.id?.startsWith('manager-welcome-')) return null
  const team = Object.values(career?.world?.teamsById ?? {}).find(t => message.id.startsWith(`manager-welcome-${t.id}-`))
  // Older messages did not store a financial snapshot. Label the fallback as current data.
  return team ? { ...clubWelcomeSnapshot(team, career.seasonYear), currentData: true } : null
}
