/**
 * Rejestr scen tła + mapowanie zakładek i etapów meczu na sceny.
 *
 * `NO_SCENE` to celowy brak grafiki (płaskie tło) — używany w trakcie
 * rozgrywania punktu, gdzie treścią jest samo boisko.
 */
import {
  Boardroom,
  CareerNew,
  CoachDeskMail,
  CoachOffice,
  LockerRoom,
  LockerRoomPre,
  NegotiationRoom,
  PlanningWall,
  PressRoom,
  TacticsBoard,
  TrophyCabinet,
} from './scenesIndoor.jsx'
import {
  AcademyField,
  CareerSelect,
  CupTrophy,
  LeagueArena,
  PostMatchDusk,
  PreMatchTunnel,
  ScoutingStand,
  TrainingGround,
} from './scenesOutdoor.jsx'

export const NO_SCENE = 'none'
export const DEFAULT_SCENE = 'coach-office'

export const BACKGROUND_SCENES = {
  [NO_SCENE]: null,
  'career-select': CareerSelect,
  'career-new': CareerNew,
  'coach-office': CoachOffice,
  'coach-desk-mail': CoachDeskMail,
  'tactics-board': TacticsBoard,
  'locker-room': LockerRoom,
  'locker-room-pre': LockerRoomPre,
  'training-ground': TrainingGround,
  'planning-wall': PlanningWall,
  'negotiation-room': NegotiationRoom,
  'scouting-stand': ScoutingStand,
  boardroom: Boardroom,
  'academy-field': AcademyField,
  'league-arena': LeagueArena,
  'cup-trophy': CupTrophy,
  'press-room': PressRoom,
  'trophy-cabinet': TrophyCabinet,
  'pre-match-tunnel': PreMatchTunnel,
  'post-match-dusk': PostMatchDusk,
}

/** Zakładka (id z NAV_CATEGORIES) → scena. */
export const TAB_TO_SCENE = {
  hub: 'coach-office',
  inbox: 'coach-desk-mail',
  match: 'pre-match-tunnel',

  tactics: 'tactics-board',
  playbook: 'tactics-board',
  roster: 'locker-room',
  'team-profile': 'locker-room',
  training: 'training-ground',
  'team-schedule': 'planning-wall',
  calendar: 'planning-wall',
  'club-transfers': 'negotiation-room',
  'league-transfers': 'negotiation-room',
  'scouting-center': 'scouting-stand',
  'club-board': 'boardroom',
  academy: 'academy-field',

  standings: 'league-arena',
  pyramid: 'league-arena',
  'league-schedule': 'league-arena',
  leaders: 'league-arena',
  cup: 'cup-trophy',

  ultiworld: 'press-room',
  career: 'trophy-cabinet',
}

/** Etap dnia meczowego (`stage` w MatchView) → scena. */
export const MATCH_STAGE_TO_SCENE = {
  prep: 'pre-match-tunnel',
  teamNews: 'locker-room',
  dressingRoomPre: 'locker-room-pre',
  live: NO_SCENE,
  postMatch: 'post-match-dusk',
  dressingRoomPost: 'locker-room',
  roundResults: 'league-arena',
}

export function sceneForTab(tabId) {
  return TAB_TO_SCENE[tabId] ?? DEFAULT_SCENE
}
