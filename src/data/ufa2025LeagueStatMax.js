/**
 * Maksima statów UFA 2025 policzone na tle CAŁEJ ligi (16 drużyn), nie pojedynczego składu.
 * Współdzielone przez ufa2025Rosters.js i ufa2025LeagueRosters.js, żeby demo/mock roster
 * używał tej samej skali co realny historyczny start kariery (seasonLeagueBuilder.js).
 */
import { isActiveRawRow, teamMaxFromRows } from './playerStatsFromUfa.js'
import { SEATTLE_RAW, BOSTON_RAW } from './ufa2025Rosters.raw.js'
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

const ALL_TEAMS_RAW = [
  SEATTLE_RAW,
  BOSTON_RAW,
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
]

export const UFA_2025_LEAGUE_STAT_MAX = teamMaxFromRows(
  ALL_TEAMS_RAW.flatMap((raw) => raw.filter(isActiveRawRow)),
)
