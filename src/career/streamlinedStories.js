import { getPlayerFullName } from '../data/mockPlayers.js'
import { ensurePlayerMorale, getPlayerMorale } from '../models/playerMorale.js'
export const SQUAD_ROLES = { reserve: { pl: 'Rezerwowy', en: 'Reserve', share: 0 }, rotation: { pl: 'Rotacja', en: 'Rotation', share: .25 }, starter: { pl: 'Podstawowy', en: 'Starter', share: .5 } }
export function squadRole(role) { return SQUAD_ROLES[role] ? role : 'rotation' }
export function promisePlayingTime(player, { role = 'rotation', date, source = 'event' }) {
  const target = SQUAD_ROLES[squadRole(role)].share
  if (!target) return
  const existing = player.playingTimePromise?.status === 'active' ? player.playingTimePromise : null
  player.playingTimePromise = { role: target >= (existing?.target ?? 0) ? role : existing.role, target: Math.max(target, existing?.target ?? 0), from: existing?.status === 'active' ? existing.from : date, source, status: 'active' }
}
export function playingTimeProgress(player, teamId) {
  const promise = player.playingTimePromise
  const rows = (player.recentPlayingTime ?? []).filter(r => r.teamId === teamId && r.available && r.date > (promise?.from ?? ''))
  return { games: rows.length, share: rows.length ? rows.reduce((s, r) => s + r.share, 0) / rows.length : 0 }
}
export function processStreamlinedStories(career, date) {
  if (career.gameplayEdition !== 'streamlined') return []
  const messages = []
  for (const team of Object.values(career.world?.teamsById ?? {})) for (const p of team.players ?? []) {
    if (p.contract?.squadRole && !p.playingTimePromise && SQUAD_ROLES[p.contract.squadRole]?.share) promisePlayingTime(p, { role: p.contract.squadRole, date: p.contract.signedDate ?? date, source: 'contract' })
    const promise = p.playingTimePromise
    if (promise?.status !== 'active') continue
    const progress = playingTimeProgress(p, team.id)
    if (progress.games < 6) continue // Injuries and match-free weeks never count as broken promises.
    const met = progress.share >= promise.target
    ensurePlayerMorale(p)
    p.morale = Math.max(25, Math.min(99, getPlayerMorale(p) + (met ? 1 : -3)))
    promise.status = met ? 'fulfilled' : 'broken'
    promise.resolvedOn = date
    promise.actualShare = progress.share
    p.playingTimeHistory = [...(p.playingTimeHistory ?? []), { ...promise }].slice(-6)
    if (team.id === career.playerTeamId) messages.push({ id: `role-${p.id}-${promise.from}-${date}`, date, type: 'club_news', read: false, title: `${getPlayerFullName(p)} · ${met ? 'rola dotrzymana' : 'za mało gry'}`, titleEn: `${getPlayerFullName(p)} · ${met ? 'role fulfilled' : 'not enough playing time'}`, body: `Udział w punktach z 6 dostępnych meczów: ${Math.round(progress.share * 100)}%; cel ${Math.round(promise.target * 100)}%. Morale ${met ? '+1' : '−3'}.`, bodyEn: `Point share across 6 available matches: ${Math.round(progress.share * 100)}%; target ${Math.round(promise.target * 100)}%. Morale ${met ? '+1' : '−3'}.`, payload: { kind: 'role_review', playerId: p.id } })
    if (p.contract?.squadRole && p.contract.weeksRemaining > 0) promisePlayingTime(p, { role: p.contract.squadRole, date, source: 'contract' })
  }
  const club = career.world?.teamsById?.[career.playerTeamId]
  if (club && new Date(`${date}T12:00:00Z`).getUTCDay() === 0 && club.lastStreamlinedBulletin !== date) {
    club.lastStreamlinedBulletin = date
    const injured = club.players.filter(p => p.injury?.daysRemaining > 0).length
    const roles = club.players.filter(p => p.playingTimePromise?.status === 'active').length
    const juniors = club.academyPlayers?.length ?? 0
    messages.push({ id: `weekly-bulletin-${club.id}-${date}`, date, type: 'club_news', read: false, title: 'Biuletyn tygodnia', titleEn: 'Weekly bulletin', body: `Kontuzjowani: ${injured}. Obserwowane role w zespole: ${roles}. Juniorzy w akademii: ${juniors}. Szczegóły w odprawie, kadrze i rekrutacji.`, bodyEn: `Injured: ${injured}. Squad roles under review: ${roles}. Academy players: ${juniors}. See briefing, squad and recruitment for details.`, payload: { kind: 'weekly_bulletin' } })
  }
  return messages
}
export function academyMilestone(player, teamId) {
  const rows = (player.recentPlayingTime ?? []).filter(r => r.teamId === teamId && r.available)
  const appearances = rows.filter(r => r.share > 0).length
  const share = rows.length ? rows.reduce((s, r) => s + r.share, 0) / rows.length : 0
  if (appearances >= 6 && share >= .5) return ['Miejsce w składzie', 'Established']
  if (appearances >= 3 && share >= .25) return ['Rotacja', 'Rotation']
  if (appearances) return ['Debiut za nim', 'Debut completed']
  return player.inAcademy ? ['Akademia', 'Academy'] : ['Trening z seniorami', 'Senior training']
}
