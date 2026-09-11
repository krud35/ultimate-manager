/**
 * 16 drużyn ligi UFA — składy z sezonu regularnego 2025 (UFA Stats / watchufa.com).
 *
 * To jest SZABLON startowy kariery. Edytujesz tu / w plikach rosterów swobodnie;
 * każda nowa kariera klonuje te dane do `career.world` i potem żyje osobno.
 */
import {
  austinSol2025,
  carolinaFlyers2025,
  chicagoUnion2025,
  coloradoApex2025,
  houstonHavoc2025,
  minnesotaWindChill2025,
  dcBreeze2025,
  newYorkEmpire2025,
  oaklandSpiders2025,
  atlantaHustle2025,
  torontoRush2025,
  montrealRoyal2025,
  sanDiegoGrowlers2025,
  saltLakeShred2025,
} from './ufa2025LeagueRosters.js'
import { seattleCascades2025, bostonGlory2025 } from './ufa2025Rosters.js'

export const PLAYER_TEAM_ID = 'seattle-cascades'

export const UFA_LEAGUE_TEAMS = [
  {
    id: PLAYER_TEAM_ID,
    name: 'Seattle Cascades',
    shortName: 'SEA',
    primaryColor: '#0d9488',
    awayColor: '#f8fafc',
    players: seattleCascades2025,
    isPlayerTeam: true,
  },
  {
    id: 'boston-glory',
    name: 'Boston Glory',
    shortName: 'BOS',
    primaryColor: '#c8102e',
    awayColor: '#0f172a',
    players: bostonGlory2025,
  },
  {
    id: 'austin-sol',
    name: 'Austin Sol',
    shortName: 'AUS',
    primaryColor: '#f59e0b',
    awayColor: '#0f172a',
    players: austinSol2025,
  },
  {
    id: 'carolina-flyers',
    name: 'Carolina Flyers',
    shortName: 'CAR',
    primaryColor: '#1e40af',
    awayColor: '#f8fafc',
    players: carolinaFlyers2025,
  },
  {
    id: 'chicago-union',
    name: 'Chicago Union',
    shortName: 'CHI',
    primaryColor: '#dc2626',
    awayColor: '#f8fafc',
    players: chicagoUnion2025,
  },
  {
    id: 'colorado-apex',
    name: 'Colorado Apex',
    shortName: 'COL',
    primaryColor: '#7c3aed',
    awayColor: '#fbbf24',
    players: coloradoApex2025,
  },
  {
    id: 'houston-havoc',
    name: 'Houston Havoc',
    shortName: 'HTX',
    primaryColor: '#b91c1c',
    awayColor: '#f8fafc',
    players: houstonHavoc2025,
  },
  {
    id: 'minnesota-wind-chill',
    name: 'Minnesota Wind Chill',
    shortName: 'MIN',
    primaryColor: '#0284c7',
    awayColor: '#f8fafc',
    players: minnesotaWindChill2025,
  },
  {
    id: 'dc-breeze',
    name: 'DC Breeze',
    shortName: 'DC',
    primaryColor: '#1d4ed8',
    awayColor: '#f97316',
    players: dcBreeze2025,
  },
  {
    id: 'new-york-empire',
    name: 'New York Empire',
    shortName: 'NY',
    primaryColor: '#ea580c',
    awayColor: '#0f172a',
    players: newYorkEmpire2025,
  },
  {
    id: 'oakland-spiders',
    name: 'Oakland Spiders',
    shortName: 'OAK',
    primaryColor: '#ca8a04',
    awayColor: '#0f172a',
    players: oaklandSpiders2025,
  },
  {
    id: 'atlanta-hustle',
    name: 'Atlanta Hustle',
    shortName: 'ATL',
    primaryColor: '#be123c',
    awayColor: '#f8fafc',
    players: atlantaHustle2025,
  },
  {
    id: 'toronto-rush',
    name: 'Toronto Rush',
    shortName: 'TOR',
    primaryColor: '#dc2626',
    awayColor: '#0f172a',
    players: torontoRush2025,
  },
  {
    id: 'montreal-royal',
    name: 'Montreal Royal',
    shortName: 'MTL',
    primaryColor: '#1e3a8a',
    awayColor: '#f8fafc',
    players: montrealRoyal2025,
  },
  {
    id: 'san-diego-growlers',
    name: 'San Diego Growlers',
    shortName: 'SD',
    primaryColor: '#15803d',
    awayColor: '#f8fafc',
    players: sanDiegoGrowlers2025,
  },
  {
    id: 'salt-lake-shred',
    name: 'Salt Lake Shred',
    shortName: 'SLC',
    primaryColor: '#0ea5e9',
    awayColor: '#0f172a',
    players: saltLakeShred2025,
  },
]

export function teamById(teamId) {
  return UFA_LEAGUE_TEAMS.find((t) => t.id === teamId) ?? null
}

export function playerTeam(teamId = PLAYER_TEAM_ID) {
  return teamById(teamId) ?? teamById(PLAYER_TEAM_ID)
}

/** Obiekt drużyny w formacie silnika meczowego (home/away). */
export function teamForMatchEngine(team) {
  return {
    id: team.id,
    name: team.name,
    primaryColor: team.primaryColor ?? null,
    awayColor: team.awayColor ?? null,
    players: team.players,
  }
}

export const allLeaguePlayers = UFA_LEAGUE_TEAMS.flatMap((t) =>
  t.players.map((p) => ({ ...p, leagueTeamId: t.id })),
)

/** @deprecated użyj colorado-apex */
export const LEGACY_TEAM_ID_MAP = {
  'colorado-summit': 'colorado-apex',
  'dallas-roughnecks': 'houston-havoc',
}
