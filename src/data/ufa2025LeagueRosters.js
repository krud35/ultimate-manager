/**
 * Składy ligowe UFA 2025 — dane z UFA Stats (watchufa.com/stats/player-stats?year=2025).
 * Surowe tabele: ufa2025LeagueRosters.raw.js (node scripts/generateLeagueRosters.mjs).
 */
import { buildTeamRoster } from './playerStatsFromUfa.js'
import {
  AUSTIN_RAW,
  CAROLINA_RAW,
  CHICAGO_RAW,
  COLORADO_RAW,
  HOUSTON_RAW,
  MINNESOTA_RAW,
  DC_BREEZE_RAW,
  NEW_YORK_EMPIRE_RAW,
  OAKLAND_SPIDERS_RAW,
  ATLANTA_HUSTLE_RAW,
  TORONTO_RUSH_RAW,
  MONTREAL_ROYAL_RAW,
  SAN_DIEGO_GROWLERS_RAW,
  SALT_LAKE_SHRED_RAW,
} from './ufa2025LeagueRosters.raw.js'

export const austinSol2025 = buildTeamRoster('Austin Sol', AUSTIN_RAW, 3001)
export const carolinaFlyers2025 = buildTeamRoster('Carolina Flyers', CAROLINA_RAW, 4001)
export const chicagoUnion2025 = buildTeamRoster('Chicago Union', CHICAGO_RAW, 5001)
export const coloradoApex2025 = buildTeamRoster('Colorado Apex', COLORADO_RAW, 6001)
export const houstonHavoc2025 = buildTeamRoster('Houston Havoc', HOUSTON_RAW, 7001)
export const minnesotaWindChill2025 = buildTeamRoster(
  'Minnesota Wind Chill',
  MINNESOTA_RAW,
  8001,
)
export const dcBreeze2025 = buildTeamRoster('DC Breeze', DC_BREEZE_RAW, 9001)
export const newYorkEmpire2025 = buildTeamRoster('New York Empire', NEW_YORK_EMPIRE_RAW, 10001)
export const oaklandSpiders2025 = buildTeamRoster('Oakland Spiders', OAKLAND_SPIDERS_RAW, 11001)
export const atlantaHustle2025 = buildTeamRoster('Atlanta Hustle', ATLANTA_HUSTLE_RAW, 12001)
export const torontoRush2025 = buildTeamRoster('Toronto Rush', TORONTO_RUSH_RAW, 13001)
export const montrealRoyal2025 = buildTeamRoster('Montreal Royal', MONTREAL_ROYAL_RAW, 14001)
export const sanDiegoGrowlers2025 = buildTeamRoster(
  'San Diego Growlers',
  SAN_DIEGO_GROWLERS_RAW,
  15001,
)
export const saltLakeShred2025 = buildTeamRoster('Salt Lake Shred', SALT_LAKE_SHRED_RAW, 16001)
