/**
 * Losowe eventy decyzyjne w skrzynce odbiorczej.
 * Efekty (morale / forma / budżet) są w szablonach — resolver czyta templateId + choiceId.
 */

import { getPlayerFullName } from '../data/mockPlayers.js'
import { getOverallRating } from '../models/playerStats.js'
import { ensurePlayerMorale, getPlayerMorale } from '../models/playerMorale.js'
import { ensurePlayerForm } from '../models/playerForm.js'
import { ensurePlayerTraits, getTraitMods } from '../models/playerTraits.js'
import { noteLoyaltyFromTreatment } from '../models/playerLoyalty.js'
import { adjustTeamReputation } from '../models/teamReputation.js'
import {
  ensureTeamFans,
  getFanSize,
  getFanMood,
  getFanTraits,
  teamHasFanTrait,
  formatFanSize,
  fanTraitLabel,
  adjustFanMood,
  adjustFanSize,
} from '../models/teamFans.js'
import { worldTeamById } from './worldState.js'
import { adjustTransferBudget, formatUsd, getTransferBudget } from './transfers/index.js'
import { randomEventBodyEn, localizeEventChoices } from './randomEventCopyEn.js'
import { hasActiveSponsor, getActiveSponsors, brandDisplayName } from './clubSponsors.js'

/** Zgodne z INBOX_TYPES.RANDOM_EVENT — bez importu inbox (unikamy cyklu). */
export const RANDOM_EVENT_TYPE = 'random_event'

const SPAWN_CHANCE = 0.26

function newMessageId(prefix = 'msg') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function sortByOvrDesc(players) {
  return [...(players ?? [])].sort(
    (a, b) => getOverallRating(b.skills) - getOverallRating(a.skills),
  )
}

function pickRandom(arr, rng) {
  if (!arr?.length) return null
  return arr[Math.floor(rng() * arr.length)]
}

function playerName(player) {
  return getPlayerFullName(player) || 'Zawodnik'
}

function findPlayer(roster, playerId) {
  return (roster ?? []).find((p) => p.id === playerId) ?? null
}

function applyMoraleDelta(player, delta) {
  if (!player || !delta) return
  ensurePlayerMorale(player)
  ensurePlayerTraits(player)
  const mods = getTraitMods(player)
  let scaled = delta
  if (delta > 0) scaled *= mods.mediaPositiveMoraleMult ?? 1
  else scaled *= mods.mediaNegativeMoraleMult ?? 1
  player.morale = Math.max(25, Math.min(99, Math.round(player.morale + scaled)))
  noteLoyaltyFromTreatment(player, scaled)
}

function applyFormDelta(player, delta) {
  if (!player || !delta) return
  ensurePlayerForm(player)
  player.form = Math.max(25, Math.min(99, Math.round(player.form + delta)))
}

function applyTeamMorale(roster, delta) {
  for (const p of roster ?? []) applyMoraleDelta(p, delta)
}

function applyTeamForm(roster, delta) {
  for (const p of roster ?? []) applyFormDelta(p, delta)
}

/**
 * Aplikuje listę efektów na drużynę gracza (mutacja in-place na sklonowanym world).
 * @returns {{ bits: string[], bitsEn: string[] }} krótkie fragmenty podsumowania PL|EN
 */
function applyEffects(team, effects) {
  const bits = []
  const bitsEn = []
  const roster = team.players ?? []

  for (const fx of effects ?? []) {
    if (!fx) continue
    if (fx.type === 'budget') {
      adjustTransferBudget(team, fx.delta)
      const sign = fx.delta >= 0 ? '+' : ''
      bits.push(`budżet ${sign}${formatUsd(fx.delta)}`)
      bitsEn.push(`budget ${sign}${formatUsd(fx.delta)}`)
    } else if (fx.type === 'morale') {
      const p = findPlayer(roster, fx.playerId)
      if (!p) continue
      applyMoraleDelta(p, fx.delta)
      const sign = fx.delta >= 0 ? '+' : ''
      bits.push(`morale ${playerName(p)} ${sign}${fx.delta}`)
      bitsEn.push(`morale ${playerName(p)} ${sign}${fx.delta}`)
    } else if (fx.type === 'form') {
      const p = findPlayer(roster, fx.playerId)
      if (!p) continue
      applyFormDelta(p, fx.delta)
      const sign = fx.delta >= 0 ? '+' : ''
      bits.push(`forma ${playerName(p)} ${sign}${fx.delta}`)
      bitsEn.push(`form ${playerName(p)} ${sign}${fx.delta}`)
    } else if (fx.type === 'moraleTeam') {
      applyTeamMorale(roster, fx.delta)
      const sign = fx.delta >= 0 ? '+' : ''
      bits.push(`morale drużyny ${sign}${fx.delta}`)
      bitsEn.push(`team morale ${sign}${fx.delta}`)
    } else if (fx.type === 'formTeam') {
      applyTeamForm(roster, fx.delta)
      const sign = fx.delta >= 0 ? '+' : ''
      bits.push(`forma drużyny ${sign}${fx.delta}`)
      bitsEn.push(`team form ${sign}${fx.delta}`)
    } else if (fx.type === 'moraleMany') {
      for (const id of fx.playerIds ?? []) {
        const p = findPlayer(roster, id)
        if (p) applyMoraleDelta(p, fx.delta)
      }
      if ((fx.playerIds ?? []).length) {
        const sign = fx.delta >= 0 ? '+' : ''
        bits.push(`morale wybranych ${sign}${fx.delta}`)
        bitsEn.push(`selected morale ${sign}${fx.delta}`)
      }
    } else if (fx.type === 'formMany') {
      for (const id of fx.playerIds ?? []) {
        const p = findPlayer(roster, id)
        if (p) applyFormDelta(p, fx.delta)
      }
      if ((fx.playerIds ?? []).length) {
        const sign = fx.delta >= 0 ? '+' : ''
        bits.push(`forma wybranych ${sign}${fx.delta}`)
        bitsEn.push(`selected form ${sign}${fx.delta}`)
      }
    } else if (fx.type === 'reputation') {
      adjustTeamReputation(team, fx.delta)
      const sign = fx.delta >= 0 ? '+' : ''
      bits.push(`reputacja ${sign}${fx.delta}`)
      bitsEn.push(`reputation ${sign}${fx.delta}`)
    } else if (fx.type === 'fansMood') {
      ensureTeamFans(team)
      adjustFanMood(team, fx.delta)
      const sign = fx.delta >= 0 ? '+' : ''
      bits.push(`nastrój kibiców ${sign}${fx.delta}`)
      bitsEn.push(`fan mood ${sign}${fx.delta}`)
    } else if (fx.type === 'fansSize') {
      ensureTeamFans(team)
      adjustFanSize(team, fx.delta)
      const sign = fx.delta >= 0 ? '+' : ''
      bits.push(`fanbase ${sign}${fx.delta}`)
      bitsEn.push(`fanbase ${sign}${fx.delta}`)
    }
  }

  return { bits, bitsEn }
}

function fanContextBits(team) {
  ensureTeamFans(team)
  const traits = getFanTraits(team)
  return {
    fanSize: getFanSize(team),
    fanSizeLabel: formatFanSize(getFanSize(team), 'pl'),
    fanSizeLabelEn: formatFanSize(getFanSize(team), 'en'),
    fanMood: getFanMood(team),
    fanTraits: traits,
    fanTraitNames: traits.map((id) => fanTraitLabel(id, 'pl')).join(', ') || 'brak',
    fanTraitNamesEn: traits.map((id) => fanTraitLabel(id, 'en')).join(', ') || 'none',
  }
}

/** @typedef {{ id: string, label: string, hint?: string }} EventChoice */

/**
 * @typedef {object} EventTemplate
 * @property {string} id
 * @property {number} weight
 * @property {(ctx: object) => boolean} [canSpawn]
 * @property {(roster: object[], rng: () => number) => object|null} pickContext
 * @property {(ctx: object) => string} title
 * @property {(ctx: object) => string} body
 * @property {(ctx: object) => EventChoice[]} choices
 * @property {(ctx: object, choiceId: string, rng: () => number) => { effects: object[], summary: string, summaryEn?: string }} resolve
 */

/** @type {EventTemplate[]} */
export const RANDOM_EVENT_TEMPLATES = [
  {
    id: 'sponsor_clinic',
    weight: 1.1,
    canSpawn: (_career, team) =>
      (team?.players?.length ?? 0) >= 2 && hasActiveSponsor(team),
    pickContext(roster, rng, team) {
      const sorted = sortByOvrDesc(roster)
      const star = sorted[0]
      if (!star) return null
      const reserves = sorted.slice(1)
      const reserve = pickRandom(reserves, rng)
      const sponsor = pickRandom(getActiveSponsors(team), rng)
      return {
        starId: star.id,
        starName: playerName(star),
        reserveId: reserve?.id ?? null,
        reserveName: reserve ? playerName(reserve) : null,
        sponsorName: brandDisplayName(sponsor, 'pl'),
      }
    },
    title: (ctx) => `Sponsor · klinika z ${ctx.starName}`,
    titleEn: (ctx) => `Sponsor · clinic with ${ctx.starName}`,
    body: (ctx) =>
      `${ctx.sponsorName ?? 'Sponsor'} chce, żeby ${ctx.starName} poprowadził klinikę dla fanów. To dobry PR i pieniądze, ale gwiazda będzie zmęczona ekstra obowiązkami.`,
    choices: (ctx) =>
      [
        {
          id: 'accept',
          label: 'Zgoda — wyślij gwiazdę',
          hint: 'Budżet +, reputacja +2, morale gwiazdy −',
        },
        {
          id: 'decline',
          label: 'Odmów — chronisz zawodnika',
          hint: 'Lekki boost morale gwiazdy',
        },
        ctx.reserveId
          ? {
              id: 'send_reserve',
              label: `Wyślij ${ctx.reserveName} zamiast niego`,
              hint: 'Mniejszy budżet, reputacja +1, gwiazda zadowolona',
            }
          : null,
      ].filter(Boolean),
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'accept') {
        const pay = 8000 + Math.floor(rng() * 7001)
        const rounded = Math.round(pay / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: rounded },
            { type: 'morale', playerId: ctx.starId, delta: -4 },
            { type: 'reputation', delta: 2 },
          ],
          summary: `${ctx.starName} poszedł na klinikę. Sponsor dopłacił ${formatUsd(rounded)}, reputacja klubu wzrosła, ale gwiazda jest zmęczona PR-em.`,
          summaryEn: `${ctx.starName} went to the clinic. The sponsor paid ${formatUsd(rounded)}, club reputation rose, but the star is worn out by PR.`,
        }
      }
      if (choiceId === 'send_reserve' && ctx.reserveId) {
        return {
          effects: [
            { type: 'budget', delta: 4000 },
            { type: 'morale', playerId: ctx.starId, delta: 3 },
            { type: 'form', playerId: ctx.reserveId, delta: -2 },
            { type: 'reputation', delta: 1 },
          ],
          summary: `${ctx.reserveName} zastąpił gwiazdę na klinice. Mniejszy zastrzyk gotówki, lekki boost reputacji, ${ctx.starName} docenia ochronę.`,
          summaryEn: `${ctx.reserveName} stood in for the star at the clinic. Smaller cash injection, light reputation boost, ${ctx.starName} appreciates the protection.`,
        }
      }
      return {
        effects: [{ type: 'morale', playerId: ctx.starId, delta: 2 }],
        summary: `Odmówiłeś kliniki. ${ctx.starName} czuje, że dbasz o jego obciążenie.`,
        summaryEn: `You refused the clinic. ${ctx.starName} feels you care about their workload.`,
      }
    },
  },

  {
    id: 'locker_room_clash',
    weight: 1,
    canSpawn: (_career, team) => (team?.players?.length ?? 0) >= 2,
    pickContext(roster, rng) {
      if ((roster?.length ?? 0) < 2) return null
      const a = pickRandom(roster, rng)
      let b = pickRandom(
        roster.filter((p) => p.id !== a.id),
        rng,
      )
      if (!a || !b) return null
      // „Lider” = wyższy OVR
      const aOvr = getOverallRating(a.skills)
      const bOvr = getOverallRating(b.skills)
      const leader = aOvr >= bOvr ? a : b
      const other = leader.id === a.id ? b : a
      return {
        playerAId: a.id,
        playerAName: playerName(a),
        playerBId: b.id,
        playerBName: playerName(b),
        leaderId: leader.id,
        leaderName: playerName(leader),
        otherId: other.id,
        otherName: playerName(other),
      }
    },
    title: () => 'Konflikt w szatni',
    titleEn: () => 'Locker-room conflict',
    body: (ctx) =>
      `${ctx.playerAName} i ${ctx.playerBName} pokłócili się po treningu. Szatnia czeka na Twoją reakcję.`,
    choices: () => [
      { id: 'talk', label: 'Rozmowa 1:1 z oboma', hint: 'Morale obu +3' },
      {
        id: 'public',
        label: 'Publiczne ostrzeżenie',
        hint: 'Lider +, drugi −',
      },
      { id: 'ignore', label: 'Zignoruj', hint: 'Morale drużyny −2' },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'talk') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.playerAId, delta: 3 },
            { type: 'morale', playerId: ctx.playerBId, delta: 3 },
          ],
          summary: `Usiadłeś z ${ctx.playerAName} i ${ctx.playerBName}. Atmosfera się poprawia.`,
          summaryEn: `You sat down with ${ctx.playerAName} and ${ctx.playerBName}. The atmosphere improves.`,
        }
      }
      if (choiceId === 'public') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.leaderId, delta: 5 },
            { type: 'morale', playerId: ctx.otherId, delta: -6 },
          ],
          summary: `Publiczne ostrzeżenie wzmocniło pozycję ${ctx.leaderName}, ale ${ctx.otherName} jest wściekły.`,
          summaryEn: `The public warning strengthened ${ctx.leaderName}, but ${ctx.otherName} is furious.`,
        }
      }
      return {
        effects: [{ type: 'moraleTeam', delta: -2 }],
        summary: 'Puściłeś konflikt samemu sobie. Napięcie w szatni rośnie.',
        summaryEn: 'You let the conflict run itself. Locker-room tension grows.',
      }
    },
  },

  {
    id: 'exhibition_invite',
    weight: 0.95,
    canSpawn: (_career, team) => (team?.players?.length ?? 0) >= 7,
    pickContext(roster) {
      const sorted = sortByOvrDesc(roster)
      return {
        topIds: sorted.slice(0, 7).map((p) => p.id),
        youthIds: sorted.slice(-3).map((p) => p.id),
      }
    },
    title: () => 'Zaproszenie na turniej exhibition',
    titleEn: () => 'Exhibition tournament invite',
    body: () =>
      'Organizatorzy zapraszają Twój klub na weekendowy turniej pokazowy. Pieniądze kuszą, ale kalendarz jest gęsty.',
    choices: () => [
      {
        id: 'accept',
        label: 'Przyjmij pełnym składem',
        hint: '+$12k, forma top 7 −3',
      },
      { id: 'decline', label: 'Odmów', hint: 'Bez zmian' },
      {
        id: 'youth',
        label: 'Wyślij młodzież / rezerwy',
        hint: '+$5k, forma najsłabszych +',
      },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'accept') {
        return {
          effects: [
            { type: 'budget', delta: 12000 },
            { type: 'formMany', playerIds: ctx.topIds, delta: -3 },
          ],
          summary:
            'Pojechaliście na exhibition pełnym składem. Kasa wpłynęła, ale liderzy są zmęczeni.',
          summaryEn: 'You went to the exhibition with a full squad. Cash arrived, but the leaders are tired.',
        }
      }
      if (choiceId === 'youth') {
        return {
          effects: [
            { type: 'budget', delta: 5000 },
            { type: 'formMany', playerIds: ctx.youthIds, delta: 4 },
          ],
          summary:
            'Wysłaliście młodszych / rezerwowych. Mniejszy cache, za to rezerwy złapały rytm.',
          summaryEn: 'You sent the younger / reserve players. Smaller fee, but the bench found rhythm.',
        }
      }
      return {
        effects: [],
        summary: 'Odmówiłeś turnieju exhibition. Kalendarz zostaje czysty.',
        summaryEn: 'You declined the exhibition. The calendar stays clear.',
      }
    },
  },

  {
    id: 'player_day_off',
    weight: 1.05,
    canSpawn: (_career, team) => (team?.players?.length ?? 0) >= 1,
    pickContext(roster, rng) {
      const withMorale = [...roster].sort(
        (a, b) => getPlayerMorale(a) - getPlayerMorale(b),
      )
      // Preferuj najniższe morale, czasem losowy
      const target =
        rng() < 0.7 ? withMorale[0] : pickRandom(roster, rng)
      if (!target) return null
      return { playerId: target.id, playerName: playerName(target) }
    },
    title: (ctx) => `${ctx.playerName} prosi o dzień wolny`,
    titleEn: (ctx) => `${ctx.playerName} asks for a day off`,
    body: (ctx) =>
      `${ctx.playerName} skarży się na przeciążenie i prosi o dzień bez treningu. Jak zareagujesz?`,
    choices: () => [
      { id: 'grant', label: 'Daj wolne', hint: 'Morale +8, forma −2' },
      { id: 'train', label: 'Trening jak zwykle', hint: 'Morale −5' },
      { id: 'recovery', label: 'Lekki recovery', hint: 'Morale +3' },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'grant') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.playerId, delta: 8 },
            { type: 'form', playerId: ctx.playerId, delta: -2 },
          ],
          summary: `${ctx.playerName} dostał dzień wolny — zadowolony, ale trochę wypadł z rytmu.`,
          summaryEn: `${ctx.playerName} got a day off — happy, but a bit out of rhythm.`,
        }
      }
      if (choiceId === 'train') {
        return {
          effects: [{ type: 'morale', playerId: ctx.playerId, delta: -5 }],
          summary: `${ctx.playerName} został na treningu. Nie jest zadowolony z decyzji.`,
          summaryEn: `${ctx.playerName} stayed in training. Not happy with the decision.`,
        }
      }
      return {
        effects: [{ type: 'morale', playerId: ctx.playerId, delta: 3 }],
        summary: `Zaplanowałeś lekki recovery dla ${ctx.playerName}. Kompromis przyjęty pozytywnie.`,
        summaryEn: `You planned light recovery for ${ctx.playerName}. The compromise landed well.`,
      }
    },
  },

  {
    id: 'media_interview',
    weight: 1,
    canSpawn: (_career, team) => (team?.players?.length ?? 0) >= 1,
    pickContext(roster) {
      const sorted = sortByOvrDesc(roster)
      const captain = sorted[0]
      return {
        captainId: captain?.id ?? null,
        captainName: captain ? playerName(captain) : 'kapitan',
      }
    },
    title: () => 'Media chcą wywiadu',
    titleEn: () => 'Media want an interview',
    body: () =>
      'Lokalna stacja prosi o krótką rozmowę przed kamerą. Możesz zagrać bezpiecznie, ostro albo wcale.',
    choices: (ctx) => [
      {
        id: 'positive',
        label: 'Pozytywny PR',
        hint: '+$3k, morale drużyny +2, reputacja +3',
      },
      {
        id: 'spicy',
        label: 'Kontrowersyjna wypowiedź',
        hint: `Forma ${ctx.captainName} +, morale −, reputacja −2`,
      },
      { id: 'decline', label: 'Odmów wywiadu', hint: 'Bez zmian' },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'positive') {
        return {
          effects: [
            { type: 'budget', delta: 3000 },
            { type: 'moraleTeam', delta: 2 },
            { type: 'reputation', delta: 3 },
          ],
          summary:
            'Wywiad wypadł dobrze. Sponsorzy zadowoleni, atmosfera i reputacja klubu w górę.',
          summaryEn: 'The interview went well. Sponsors happy; atmosphere and club reputation up.',
        }
      }
      if (choiceId === 'spicy') {
        const effects = [
          { type: 'moraleTeam', delta: -1 },
          { type: 'reputation', delta: -2 },
        ]
        if (ctx.captainId) {
          effects.push({ type: 'form', playerId: ctx.captainId, delta: 3 })
        }
        return {
          effects,
          summary: `Ostra wypowiedź podgrzała media. ${ctx.captainName} czuje adrenalę, wizerunek klubu ucierpiał.`,
          summaryEn: `The spicy take heated up the media. ${ctx.captainName} feels the adrenaline; the club image took a hit.`,
        }
      }
      return {
        effects: [],
        summary: 'Odmówiłeś wywiadu. Temat szybko ucichł.',
        summaryEn: 'You declined the interview. The topic faded quickly.',
      }
    },
  },

  {
    id: 'friendly_clinic',
    weight: 0.9,
    canSpawn: (career, team) => getTransferBudget(team) >= 4000,
    pickContext() {
      return {}
    },
    title: () => 'Wspólny trening z lokalnym klubem',
    titleEn: () => 'Joint training with a local club',
    body: () =>
      'Lokalny klub proponuje wspólny sparing / klinikę. Koszt organizacyjny niewielki, atmosfera może wzrosnąć.',
    choices: () => [
      {
        id: 'organize',
        label: 'Zorganizuj',
        hint: '−$4k, morale +4, forma +2',
      },
      { id: 'decline', label: 'Odmów', hint: 'Bez zmian' },
    ],
    resolve(_ctx, choiceId) {
      if (choiceId === 'organize') {
        return {
          effects: [
            { type: 'budget', delta: -4000 },
            { type: 'moraleTeam', delta: 4 },
            { type: 'formTeam', delta: 2 },
          ],
          summary:
            'Wspólny trening wyszedł świetnie. Skład złapał luz i rytm kosztem drobnych kosztów.',
          summaryEn: 'The joint session went great. The squad found looseness and rhythm at a small cost.',
        }
      }
      return {
        effects: [],
        summary: 'Odmówiłeś wspólnego treningu. Kalendarz bez zmian.',
        summaryEn: 'You declined the joint training. Calendar unchanged.',
      }
    },
  },

  {
    id: 'board_budget_push',
    weight: 0.85,
    pickContext() {
      return {}
    },
    title: () => 'Zarząd i budżet transferowy',
    titleEn: () => 'Board and transfer budget',
    body: () =>
      'Zarząd sugeruje „ostrożność” przy wydatkach. Możesz zawalczyć o dodatkowe środki albo ustąpić dla spokoju.',
    choices: () => [
      {
        id: 'fight',
        label: 'Walcz o środki',
        hint: '50%: +$20k albo morale drużyny −3',
      },
      {
        id: 'yield',
        label: 'Ustąp',
        hint: '−$8k budżetu, morale +1',
      },
    ],
    resolve(_ctx, choiceId, rng) {
      if (choiceId === 'fight') {
        if (rng() < 0.5) {
          return {
            effects: [{ type: 'budget', delta: 20000 }],
            summary:
              'Przekonałeś zarząd — dodatkowe 20 000 $ wpłynęło na konto transferowe.',
            summaryEn: 'You convinced the board — an extra $20,000 hit the transfer account.',
          }
        }
        return {
          effects: [{ type: 'moraleTeam', delta: -3 }],
          summary:
            'Zarząd stanął okoniem. Nie ma dodatkowej kasy, a napięcie w klubie rośnie.',
          summaryEn: 'The board dug in. No extra cash, and club tension rises.',
        }
      }
      return {
        effects: [
          { type: 'budget', delta: -8000 },
          { type: 'moraleTeam', delta: 1 },
        ],
        summary:
          'Ustąpiłeś zarządowi. Budżet ścięty, ale w klubie panuje względny spokój.',
        summaryEn: 'You yielded to the board. Budget cut, but relative calm in the club.',
      }
    },
  },

  {
    id: 'playing_time_request',
    weight: 1,
    canSpawn: (_career, team) => (team?.players?.length ?? 0) >= 8,
    pickContext(roster, rng) {
      const sorted = sortByOvrDesc(roster)
      const bench = sorted.slice(7)
      if (!bench.length) return null
      // Preferuj lepszych z ławki
      const topBench = bench.slice(0, Math.min(4, bench.length))
      const target = pickRandom(topBench, rng)
      if (!target) return null
      return {
        playerId: target.id,
        playerName: playerName(target),
        playerOvr: getOverallRating(target.skills),
      }
    },
    title: (ctx) => `${ctx.playerName} chce więcej minut`,
    titleEn: (ctx) => `${ctx.playerName} wants more minutes`,
    body: (ctx) =>
      `${ctx.playerName} (OVR ${ctx.playerOvr}) prosi o większą rolę w składzie. Obietnica nic nie zmienia w lineupie — na razie to kwestia relacji.`,
    choices: () => [
      {
        id: 'promise',
        label: 'Obiecaj więcej gry',
        hint: 'Morale +6',
      },
      { id: 'honest', label: 'Bądź szczery', hint: 'Morale −2' },
      { id: 'ignore', label: 'Zignoruj', hint: 'Morale −7' },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'promise') {
        return {
          effects: [{ type: 'morale', playerId: ctx.playerId, delta: 6 }],
          summary: `${ctx.playerName} wyszedł zmotywowany po obietnicy większej roli.`,
          summaryEn: `${ctx.playerName} left motivated after a promise of a bigger role.`,
        }
      }
      if (choiceId === 'honest') {
        return {
          effects: [{ type: 'morale', playerId: ctx.playerId, delta: -2 }],
          summary: `Szczera rozmowa z ${ctx.playerName} — nie zachwycony, ale szanuje feedback.`,
          summaryEn: `An honest talk with ${ctx.playerName} — not thrilled, but respects the feedback.`,
        }
      }
      return {
        effects: [{ type: 'morale', playerId: ctx.playerId, delta: -7 }],
        summary: `${ctx.playerName} czuje się zignorowany. Relacja wyraźnie się psuje.`,
        summaryEn: `${ctx.playerName} feels ignored. The relationship is clearly souring.`,
      }
    },
  },

  {
    id: 'fan_appreciation_day',
    weight: 0.95,
    canSpawn: (career, team) => getTransferBudget(team) >= 2500,
    pickContext(_roster, _rng, team) {
      return fanContextBits(team)
    },
    title: () => 'Dzień kibica',
    titleEn: () => 'Fans day',
    body: (ctx) =>
      `Kibice (${ctx.fanSizeLabel} osób, cechy: ${ctx.fanTraitNames}) proponują wspólny dzień na boisku: autografy, mini-turniej i zdjęcia. Koszt niewielki, atmosfera może wzrosnąć.`,
    choices: () => [
      {
        id: 'full',
        label: 'Zrób pełny dzień kibica',
        hint: '−$3k, morale drużyny +5, reputacja +4, nastrój kibiców +',
      },
      {
        id: 'short',
        label: 'Krótka sesja autografów',
        hint: '−$1k, morale +2, reputacja +2, nastrój +',
      },
      { id: 'skip', label: 'Odmów', hint: 'Morale −1, reputacja −2, nastrój kibiców −' },
    ],
    resolve(ctx, choiceId) {
      const demanding = (ctx.fanTraits ?? []).includes('demanding')
      const festive = (ctx.fanTraits ?? []).includes('festive')
      if (choiceId === 'full') {
        return {
          effects: [
            { type: 'budget', delta: -3000 },
            { type: 'moraleTeam', delta: 5 },
            { type: 'reputation', delta: 4 },
            { type: 'fansMood', delta: festive ? 10 : 7 },
            { type: 'fansSize', delta: Math.round((ctx.fanSize ?? 3000) * 0.01) },
          ],
          summary:
            'Dzień kibica był hitem. Skład czuje wsparcie trybun, reputacja i nastrój kibiców mocno wzrosły.',
          summaryEn: 'Fans day was a hit. The squad feels terrace support; reputation and fan mood jumped.',
        }
      }
      if (choiceId === 'short') {
        return {
          effects: [
            { type: 'budget', delta: -1000 },
            { type: 'moraleTeam', delta: 2 },
            { type: 'reputation', delta: 2 },
            { type: 'fansMood', delta: demanding ? 2 : 4 },
          ],
          summary: 'Krótka sesja autografów uspokoiła fanów i lekko podbiła wizerunek bez dużego kosztu.',
          summaryEn: 'A short autograph session calmed fans and lightly boosted image without big cost.',
        }
      }
      return {
        effects: [
          { type: 'moraleTeam', delta: -1 },
          { type: 'reputation', delta: -2 },
          { type: 'fansMood', delta: demanding ? -8 : -5 },
        ],
        summary: 'Odmowa dnia kibica zostawiła niesmak w szatni i na trybunach — reputacja spadła.',
        summaryEn: 'Refusing fans day left a bad taste in the locker room and stands — reputation dropped.',
      }
    },
  },

  {
    id: 'kit_sponsor_deal',
    weight: 0.9,
    pickContext() {
      return {}
    },
    title: () => 'Nowa umowa na stroje',
    titleEn: () => 'New kit deal',
    body: () =>
      'Producent kitów oferuje pakiet: logo na koszulkach i dopłatę do budżetu. Warunki są OK, ale niektórzy wolą klasyczny wygląd.',
    choices: () => [
      {
        id: 'sign',
        label: 'Podpisz umowę',
        hint: '+$15k, morale +1, reputacja +2',
      },
      {
        id: 'negotiate',
        label: 'Negocjuj wyżej',
        hint: '50%: +$22k i reputacja +3 albo nic',
      },
      {
        id: 'refuse',
        label: 'Odmów — zostawcie klasyczny look',
        hint: 'Morale +2, reputacja +1',
      },
    ],
    resolve(_ctx, choiceId, rng) {
      if (choiceId === 'sign') {
        return {
          effects: [
            { type: 'budget', delta: 15000 },
            { type: 'moraleTeam', delta: 1 },
            { type: 'reputation', delta: 2 },
          ],
          summary: 'Umowa na stroje podpisana. Klub ma +15 000 $ i świeższy branding.',
          summaryEn: 'Kit deal signed. The club has +$15,000 and fresher branding.',
        }
      }
      if (choiceId === 'negotiate') {
        if (rng() < 0.5) {
          return {
            effects: [
              { type: 'budget', delta: 22000 },
              { type: 'reputation', delta: 3 },
            ],
            summary: 'Negocjacje poszły świetnie — producent dołożył do 22 000 $, a media chwalą deal.',
            summaryEn: 'Negotiations went great — the maker topped up to $22,000 and media praise the deal.',
          }
        }
        return {
          effects: [
            { type: 'moraleTeam', delta: -1 },
            { type: 'reputation', delta: -1 },
          ],
          summary: 'Producent się wycofał po twardych negocjacjach. Szansa i trochę prestiżu przepadły.',
          summaryEn: 'The maker walked away after hard talks. The chance and some prestige are gone.',
        }
      }
      return {
        effects: [
          { type: 'moraleTeam', delta: 2 },
          { type: 'reputation', delta: 1 },
        ],
        summary: 'Zostaliście przy klasycznym looku. Skład i fani doceniają tożsamość klubu.',
        summaryEn: 'You kept the classic look. Squad and fans appreciate club identity.',
      }
    },
  },

  {
    id: 'sponsor_logo_week',
    weight: 1.05,
    canSpawn: (_c, team) => hasActiveSponsor(team),
    pickContext(_roster, rng, team) {
      const sponsor = pickRandom(getActiveSponsors(team), rng)
      if (!sponsor) return null
      return {
        sponsorName: brandDisplayName(sponsor, 'pl'),
        sponsorNameEn: brandDisplayName(sponsor, 'en'),
      }
    },
    title: (ctx) => `${ctx.sponsorName} · tydzień logo`,
    titleEn: (ctx) => `${ctx.sponsorNameEn} · logo week`,
    body: (ctx) =>
      `${ctx.sponsorName} chce „tydzień logo”: większe naszywki, posty w socialach i autografy na gadżetach. Gotówka spada szybko — morale szatni niekoniecznie.`,
    bodyEn: (ctx) =>
      `${ctx.sponsorNameEn} wants a “logo week”: bigger patches, social posts and merch signings. Cash arrives fast — locker-room morale maybe not.`,
    choices: () => [
      {
        id: 'full',
        label: 'Pełny pakiet PR',
        hint: 'Budżet +, morale drużyny −2, reputacja +2',
      },
      {
        id: 'soft',
        label: 'Miękki wariant',
        hint: 'Mniejszy budżet, morale −0',
      },
      {
        id: 'refuse',
        label: 'Odmów — chronisz szatnię',
        hint: 'Reputacja −1 u sponsora (lekko)',
      },
    ],
    resolve(_ctx, choiceId, rng) {
      if (choiceId === 'full') {
        const pay = Math.round((12_000 + rng() * 10_000) / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: pay },
            { type: 'moraleTeam', delta: -2 },
            { type: 'reputation', delta: 2 },
          ],
          summary: `Tydzień logo zakończony. Na koncie +${formatUsd(pay)}, szatnia lekko zmęczona PR-em.`,
          summaryEn: `Logo week done. Account +${formatUsd(pay)}; the locker room is a bit PR-tired.`,
        }
      }
      if (choiceId === 'soft') {
        const pay = Math.round((5_000 + rng() * 5_000) / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: pay },
            { type: 'reputation', delta: 1 },
          ],
          summary: `Kompromis z sponsorem: +${formatUsd(pay)} bez wielkiej rewolucji w szatni.`,
          summaryEn: `Sponsor compromise: +${formatUsd(pay)} without a locker-room revolution.`,
        }
      }
      return {
        effects: [{ type: 'reputation', delta: -1 }],
        summary: 'Odmówiliście tygodnia logo. Sponsor jest chłodniejszy, szatnia odetchnęła.',
        summaryEn: 'You refused logo week. The sponsor is cooler; the locker room exhaled.',
      }
    },
  },

  {
    id: 'sponsor_scandal_tweet',
    weight: 0.85,
    canSpawn: (_c, team) => hasActiveSponsor(team),
    pickContext(roster, rng, team) {
      const sponsor = pickRandom(getActiveSponsors(team), rng)
      const loud = pickRandom(sortByOvrDesc(roster).slice(0, 5), rng)
      if (!sponsor || !loud) return null
      return {
        sponsorName: brandDisplayName(sponsor, 'pl'),
        sponsorNameEn: brandDisplayName(sponsor, 'en'),
        playerId: loud.id,
        playerName: playerName(loud),
      }
    },
    title: (ctx) => `Afera: tweet o ${ctx.sponsorName}`,
    titleEn: (ctx) => `Drama: tweet about ${ctx.sponsorNameEn}`,
    body: (ctx) =>
      `${ctx.playerName} wrzucił mema z logo ${ctx.sponsorName}, który „nie wszystkim się spodobał”. Sponsor dzwoni. Media już mają nagłówek.`,
    bodyEn: (ctx) =>
      `${ctx.playerName} posted a meme with the ${ctx.sponsorNameEn} logo that “not everyone loved.” The sponsor is calling. Media already have a headline.`,
    choices: (ctx) => [
      {
        id: 'apologize',
        label: 'Publiczne przeprosiny',
        hint: 'Morale zawodnika −3, reputacja +1, budżet lekko −',
      },
      {
        id: 'defend',
        label: `Broń ${ctx.playerName}`,
        hint: 'Morale +4, reputacja −2, sponsor chłodniejszy',
      },
      {
        id: 'fine',
        label: 'Grzywna wewnętrzna',
        hint: 'Budżet +, morale −5, reputacja 0',
      },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'apologize') {
        const fine = Math.round((2_000 + rng() * 3_000) / 500) * 500
        return {
          effects: [
            { type: 'budget', delta: -fine },
            { type: 'morale', playerId: ctx.playerId, delta: -3 },
            { type: 'reputation', delta: 1 },
          ],
          summary: `Przeprosiny poszły w świat. Klub dopłacił ${formatUsd(fine)} do „kampanii clarifying”, ${ctx.playerName} jest wkurzony.`,
          summaryEn: `Apologies went public. The club paid ${formatUsd(fine)} for a “clarifying campaign”; ${ctx.playerName} is furious.`,
        }
      }
      if (choiceId === 'defend') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.playerId, delta: 4 },
            { type: 'reputation', delta: -2 },
          ],
          summary: `Stanęliście za ${ctx.playerName}. Szatnia kibicuje, sponsor mniej.`,
          summaryEn: `You stood by ${ctx.playerName}. The locker room cheers; the sponsor less so.`,
        }
      }
      const gain = Math.round((1_500 + rng() * 2_500) / 500) * 500
      return {
        effects: [
          { type: 'budget', delta: gain },
          { type: 'morale', playerId: ctx.playerId, delta: -5 },
        ],
        summary: `Grzywna ${formatUsd(gain)} wpada do kasy klubu. ${ctx.playerName} czuje się jak w reality show.`,
        summaryEn: `A ${formatUsd(gain)} fine hits the club account. ${ctx.playerName} feels like a reality-show cast member.`,
      }
    },
  },

  {
    id: 'sponsor_bonus_tease',
    weight: 0.95,
    canSpawn: (_c, team) => hasActiveSponsor(team),
    pickContext(_roster, rng, team) {
      const sponsor = pickRandom(getActiveSponsors(team), rng)
      if (!sponsor) return null
      return {
        sponsorName: brandDisplayName(sponsor, 'pl'),
        sponsorNameEn: brandDisplayName(sponsor, 'en'),
      }
    },
    title: (ctx) => `${ctx.sponsorName} · „premia motywacyjna”`,
    titleEn: (ctx) => `${ctx.sponsorNameEn} · “motivation bonus”`,
    body: (ctx) =>
      `${ctx.sponsorName} oferuje jednorazową premię „za charakter”, jeśli obiecasz walkę o top tabeli. Brzmi jak darmowe pieniądze… albo jak haczyk na przyszły sezon.`,
    bodyEn: (ctx) =>
      `${ctx.sponsorNameEn} offers a one-off “character” bonus if you promise a top-table push. Sounds like free money… or a hook for next season.`,
    choices: () => [
      {
        id: 'take',
        label: 'Bierz kasę',
        hint: 'Budżet +, reputacja +1',
      },
      {
        id: 'negotiate',
        label: 'Negocjuj wyżej',
        hint: '55%: duży zastrzyk / inaczej nic',
      },
      {
        id: 'pass',
        label: 'Podziękuj i odmów',
        hint: 'Morale drużyny +1 (zero presji)',
      },
    ],
    resolve(_ctx, choiceId, rng) {
      if (choiceId === 'take') {
        const pay = Math.round((8_000 + rng() * 9_000) / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: pay },
            { type: 'reputation', delta: 1 },
          ],
          summary: `Premia sponsora: +${formatUsd(pay)}. Zarząd uśmiecha się na zdjęciu z logo.`,
          summaryEn: `Sponsor bonus: +${formatUsd(pay)}. The board smiles in the logo photo.`,
        }
      }
      if (choiceId === 'negotiate') {
        if (rng() < 0.55) {
          const pay = Math.round((14_000 + rng() * 12_000) / 1000) * 1000
          return {
            effects: [
              { type: 'budget', delta: pay },
              { type: 'reputation', delta: 2 },
            ],
            summary: `Negocjacje wypaliły — sponsor dołożył do ${formatUsd(pay)}.`,
            summaryEn: `Negotiations paid off — the sponsor topped up to ${formatUsd(pay)}.`,
          }
        }
        return {
          effects: [{ type: 'reputation', delta: -1 }],
          summary: 'Sponsor uznał, że przesadziliście. Premia znika, atmosfera lekko sztywna.',
          summaryEn: 'The sponsor decided you overreached. Bonus gone; the air is a bit stiff.',
        }
      }
      return {
        effects: [{ type: 'moraleTeam', delta: 1 }],
        summary: 'Odmówiliście „haczka”. Szatnia lubi mniej korporacyjnego ciśnienia.',
        summaryEn: 'You refused the “hook.” The locker room likes less corporate pressure.',
      }
    },
  },

  {
    id: 'late_night_party',
    weight: 1,
    canSpawn: (_career, team) => (team?.players?.length ?? 0) >= 3,
    pickContext(roster, rng) {
      const sorted = sortByOvrDesc(roster)
      const pool = sorted.slice(0, Math.min(8, sorted.length))
      const shuffled = [...pool]
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      const culprits = shuffled.slice(0, Math.min(3, shuffled.length))
      if (!culprits.length) return null
      return {
        culpritIds: culprits.map((p) => p.id),
        culpritNames: culprits.map((p) => playerName(p)).join(', '),
      }
    },
    title: () => 'Nocna impreza przed treningiem',
    titleEn: () => 'Late-night party before training',
    body: (ctx) =>
      `Sztab złapał, że ${ctx.culpritNames} wrócili późno z miasta. Forma może ucierpieć — jak zareagujesz?`,
    choices: () => [
      {
        id: 'fine',
        label: 'Upomnienie + dodatkowy bieg',
        hint: 'Forma −, morale −',
      },
      {
        id: 'talk',
        label: 'Poufna rozmowa',
        hint: 'Forma −1, morale bez zmian',
      },
      {
        id: 'ignore',
        label: 'Puść płazem',
        hint: 'Forma −3, morale +2 u winnych',
      },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'fine') {
        return {
          effects: [
            { type: 'formMany', playerIds: ctx.culpritIds, delta: -4 },
            { type: 'moraleMany', playerIds: ctx.culpritIds, delta: -3 },
          ],
          summary: `Surowa reakcja: ${ctx.culpritNames} dostali bieg. Forma i morale spadły.`,
          summaryEn: `Hard line: ${ctx.culpritNames} got extra running. Form and morale dropped.`,
        }
      }
      if (choiceId === 'talk') {
        return {
          effects: [{ type: 'formMany', playerIds: ctx.culpritIds, delta: -1 }],
          summary: `Poufna rozmowa z ${ctx.culpritNames}. Lekki spadek formy, bez dramatu w szatni.`,
          summaryEn: `A private talk with ${ctx.culpritNames}. Slight form dip, no locker-room drama.`,
        }
      }
      return {
        effects: [
          { type: 'formMany', playerIds: ctx.culpritIds, delta: -3 },
          { type: 'moraleMany', playerIds: ctx.culpritIds, delta: 2 },
        ],
        summary: `Puściłeś imprezę płazem. ${ctx.culpritNames} są zadowoleni, ale wciąż zmęczeni.`,
        summaryEn: `You let the party slide. ${ctx.culpritNames} are happy, but still tired.`,
      }
    },
  },

  {
    id: 'captain_armband',
    weight: 0.85,
    canSpawn: (_career, team) => (team?.players?.length ?? 0) >= 2,
    pickContext(roster) {
      const sorted = sortByOvrDesc(roster)
      const a = sorted[0]
      const b = sorted[1]
      if (!a || !b) return null
      return {
        playerAId: a.id,
        playerAName: playerName(a),
        playerBId: b.id,
        playerBName: playerName(b),
      }
    },
    title: () => 'Opaska kapitana',
    titleEn: () => 'Captain’s armband',
    body: (ctx) =>
      `W szatni rośnie dyskusja: kto powinien nosić opaskę — ${ctx.playerAName} czy ${ctx.playerBName}? Twój głos waży.`,
    choices: (ctx) => [
      {
        id: 'pick_a',
        label: `Wskaż ${ctx.playerAName}`,
        hint: 'Morale A +5, B −4',
      },
      {
        id: 'pick_b',
        label: `Wskaż ${ctx.playerBName}`,
        hint: 'Morale B +5, A −4',
      },
      {
        id: 'rotate',
        label: 'Rotacja / współkapitanowie',
        hint: 'Morale obu +2',
      },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'pick_a') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.playerAId, delta: 5 },
            { type: 'morale', playerId: ctx.playerBId, delta: -4 },
          ],
          summary: `${ctx.playerAName} dostał opaskę. ${ctx.playerBName} jest zawiedziony.`,
          summaryEn: `${ctx.playerAName} got the armband. ${ctx.playerBName} is disappointed.`,
        }
      }
      if (choiceId === 'pick_b') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.playerBId, delta: 5 },
            { type: 'morale', playerId: ctx.playerAId, delta: -4 },
          ],
          summary: `${ctx.playerBName} dostał opaskę. ${ctx.playerAName} czuje niedosyt.`,
          summaryEn: `${ctx.playerBName} got the armband. ${ctx.playerAName} feels short-changed.`,
        }
      }
      return {
        effects: [
          { type: 'morale', playerId: ctx.playerAId, delta: 2 },
          { type: 'morale', playerId: ctx.playerBId, delta: 2 },
        ],
        summary: 'Ustaliliście rotację / współkapitanów. Obaj liderzy zostają przy projekcie.',
        summaryEn: 'You set a rotation / co-captains. Both leaders stay invested.',
      }
    },
  },

  {
    id: 'muddy_field',
    weight: 1,
    pickContext() {
      return {}
    },
    title: () => 'Boisko po ulewie',
    titleEn: () => 'Field after a downpour',
    body: () =>
      'Poranny deszcz zamienił boisko w błoto. Możesz trenować na siłę, przenieść sesję albo dać wolne.',
    choices: () => [
      {
        id: 'push',
        label: 'Trening mimo błota',
        hint: 'Forma −2, morale −1',
      },
      {
        id: 'indoor',
        label: 'Sesja indoor / wideo',
        hint: 'Forma +1, −$1.5k',
      },
      {
        id: 'rest',
        label: 'Dzień regeneracji',
        hint: 'Morale +3, forma −1',
      },
    ],
    resolve(_ctx, choiceId) {
      if (choiceId === 'push') {
        return {
          effects: [
            { type: 'formTeam', delta: -2 },
            { type: 'moraleTeam', delta: -1 },
          ],
          summary: 'Trening w błocie był ciężki. Skład jest zmęczony i lekko zirytowany.',
          summaryEn: 'Training in the mud was hard. The squad is tired and a bit irritated.',
        }
      }
      if (choiceId === 'indoor') {
        return {
          effects: [
            { type: 'budget', delta: -1500 },
            { type: 'formTeam', delta: 1 },
          ],
          summary: 'Wynajęliście salę / zrobiliście analizę wideo. Sesja solidna, kasa mniejsza.',
          summaryEn: 'You rented a hall / did video. Solid session, thinner wallet.',
        }
      }
      return {
        effects: [
          { type: 'moraleTeam', delta: 3 },
          { type: 'formTeam', delta: -1 },
        ],
        summary: 'Dzień regeneracji poprawił humor, ale skład trochę wypadł z rytmu.',
        summaryEn: 'A recovery day lifted moods, but the squad slipped out of rhythm a bit.',
      }
    },
  },

  {
    id: 'rival_trash_talk',
    weight: 1,
    canSpawn: (_career, team) => (team?.players?.length ?? 0) >= 1,
    pickContext(roster) {
      const star = sortByOvrDesc(roster)[0]
      if (!star) return null
      return { starId: star.id, starName: playerName(star) }
    },
    title: () => 'Prowokacja rywali',
    titleEn: () => 'Rival provocation',
    body: (ctx) =>
      `Rywal wrzucił w social media zaczepkę pod adresem Twojego klubu — szczególnie ${ctx.starName}. Media czekają na reakcję.`,
    choices: (ctx) => [
      {
        id: 'clapback',
        label: 'Ostra odpowiedź',
        hint: `Forma ${ctx.starName} +4, morale −1, reputacja −1`,
      },
      {
        id: 'classy',
        label: 'Klasyczna, spokojna odpowiedź',
        hint: 'Morale +3, reputacja +3',
      },
      { id: 'mute', label: 'Ignoruj', hint: 'Bez zmian' },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'clapback') {
        return {
          effects: [
            { type: 'form', playerId: ctx.starId, delta: 4 },
            { type: 'moraleTeam', delta: -1 },
            { type: 'reputation', delta: -1 },
          ],
          summary: `${ctx.starName} odpalił się na prowokację. Adrenalina w górę, wizerunek lekko ucierpiał.`,
          summaryEn: `${ctx.starName} fired back at the provocation. Adrenaline up; image took a light hit.`,
        }
      }
      if (choiceId === 'classy') {
        return {
          effects: [
            { type: 'moraleTeam', delta: 3 },
            { type: 'reputation', delta: 3 },
          ],
          summary: 'Spokojna odpowiedź wzmocniła wizerunek i reputację klubu. Atmosfera w drużynie dobra.',
          summaryEn: 'A calm reply strengthened the club’s image and reputation. Team vibe is good.',
        }
      }
      return {
        effects: [],
        summary: 'Zignorowaliście zaczepkę. Temat szybko ucichł.',
        summaryEn: 'You ignored the jab. The topic faded quickly.',
      }
    },
  },

  {
    id: 'charity_hat_tournament',
    weight: 0.9,
    pickContext(roster) {
      const sorted = sortByOvrDesc(roster)
      return {
        topIds: sorted.slice(0, Math.min(5, sorted.length)).map((p) => p.id),
      }
    },
    title: () => 'Charytatywny turniej hat',
    titleEn: () => 'Charity hat tournament',
    body: () =>
      'Organizatorzy proszą o udział w charytatywnym turnieju hat. Dobry PR, ale obciążenie dla kluczowych zawodników.',
    choices: () => [
      {
        id: 'stars',
        label: 'Wyślij gwiazdy',
        hint: '+$4k, forma top 5 −2, morale +3, reputacja +5',
      },
      {
        id: 'mix',
        label: 'Skład mieszany',
        hint: '+$2k, morale +2, reputacja +3',
      },
      { id: 'decline', label: 'Odmów', hint: 'Morale −1, reputacja −2' },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'stars') {
        return {
          effects: [
            { type: 'budget', delta: 4000 },
            { type: 'formMany', playerIds: ctx.topIds, delta: -2 },
            { type: 'moraleTeam', delta: 3 },
            { type: 'reputation', delta: 5 },
          ],
          summary:
            'Gwiazdy zagrały charytatywnie. PR i reputacja mocno w górę, forma kluczowych lekko spadła.',
          summaryEn: 'The stars played for charity. PR and reputation up hard; key players’ form dipped slightly.',
        }
      }
      if (choiceId === 'mix') {
        return {
          effects: [
            { type: 'budget', delta: 2000 },
            { type: 'moraleTeam', delta: 2 },
            { type: 'reputation', delta: 3 },
          ],
          summary: 'Mieszany skład reprezentował klub. Solidny PR i reputacja bez dużego ryzyka formy.',
          summaryEn: 'A mixed squad represented the club. Solid PR and reputation without big form risk.',
        }
      }
      return {
        effects: [
          { type: 'moraleTeam', delta: -1 },
          { type: 'reputation', delta: -2 },
        ],
        summary: 'Odmowa charytatywnego turnieju zostawiła niesmak i uszczerbek na reputacji.',
        summaryEn: 'Declining the charity tournament left a sour taste and a reputation ding.',
      }
    },
  },

  {
    id: 'equipment_upgrade',
    weight: 0.85,
    canSpawn: (_career, team) => getTransferBudget(team) >= 5000,
    pickContext() {
      return {}
    },
    title: () => 'Nowy sprzęt treningowy',
    titleEn: () => 'New training gear',
    body: () =>
      'Sztab chce nowe dyski, stożki i maty regeneracyjne. Inwestycja w komfort może przełożyć się na formę.',
    choices: () => [
      {
        id: 'premium',
        label: 'Kup premium',
        hint: '−$8k, forma +3, morale +2',
      },
      {
        id: 'basic',
        label: 'Pakiet podstawowy',
        hint: '−$3k, forma +1',
      },
      { id: 'refuse', label: 'Nie teraz', hint: 'Morale sztabu/składu −1' },
    ],
    resolve(_ctx, choiceId) {
      if (choiceId === 'premium') {
        return {
          effects: [
            { type: 'budget', delta: -8000 },
            { type: 'formTeam', delta: 3 },
            { type: 'moraleTeam', delta: 2 },
          ],
          summary: 'Premium sprzęt trafił do klubu. Skład czuje różnicę na treningu.',
          summaryEn: 'Premium gear arrived. The squad feels the difference in training.',
        }
      }
      if (choiceId === 'basic') {
        return {
          effects: [
            { type: 'budget', delta: -3000 },
            { type: 'formTeam', delta: 1 },
          ],
          summary: 'Podstawowy upgrade sprzętu — rozsądny kompromis.',
          summaryEn: 'Basic equipment upgrade — a sensible compromise.',
        }
      }
      return {
        effects: [{ type: 'moraleTeam', delta: -1 }],
        summary: 'Odmowa zakupu sprzętu zirytowała część szatni.',
        summaryEn: 'Refusing the gear purchase irritated part of the locker room.',
      }
    },
  },

  {
    id: 'social_media_drama',
    weight: 1,
    canSpawn: (_career, team) => (team?.players?.length ?? 0) >= 1,
    pickContext(roster, rng) {
      const target = pickRandom(roster, rng)
      if (!target) return null
      return { playerId: target.id, playerName: playerName(target) }
    },
    title: (ctx) => `${ctx.playerName} i social media`,
    titleEn: (ctx) => `${ctx.playerName} and social media`,
    body: (ctx) =>
      `${ctx.playerName} wrzucił kontrowersyjny post. Fani są podzieleni, a klub może odnieść wizerunkową szkodę.`,
    choices: (ctx) => [
      {
        id: 'apology',
        label: 'Każ przeprosić',
        hint: `Morale ${ctx.playerName} −4, morale drużyny +1, reputacja +2`,
      },
      {
        id: 'defend',
        label: 'Broń zawodnika',
        hint: `Morale ${ctx.playerName} +5, −$2k PR, reputacja −3`,
      },
      {
        id: 'mute',
        label: 'Cicha dyscyplina wewnętrzna',
        hint: 'Morale −2, reputacja −1',
      },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'apology') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.playerId, delta: -4 },
            { type: 'moraleTeam', delta: 1 },
            { type: 'reputation', delta: 2 },
          ],
          summary: `${ctx.playerName} przeprosił publicznie. Reputacja klubu stabilniejsza, zawodnik niepocieszony.`,
          summaryEn: `${ctx.playerName} apologized publicly. Club reputation steadier; the player is not thrilled.`,
        }
      }
      if (choiceId === 'defend') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.playerId, delta: 5 },
            { type: 'budget', delta: -2000 },
            { type: 'reputation', delta: -3 },
          ],
          summary: `Stanąłeś za ${ctx.playerName}. Lojalność w górę, wizerunek i budżet PR w dół.`,
          summaryEn: `You stood by ${ctx.playerName}. Loyalty up; image and PR budget down.`,
        }
      }
      return {
        effects: [
          { type: 'morale', playerId: ctx.playerId, delta: -2 },
          { type: 'reputation', delta: -1 },
        ],
        summary: `Wewnętrzna rozmowa z ${ctx.playerName} zamknęła temat, ale media i tak lekko podgryzały klub.`,
        summaryEn: `An internal talk with ${ctx.playerName} closed it, but media still nipped at the club.`,
      }
    },
  },

  {
    id: 'team_bonding_trip',
    weight: 0.9,
    canSpawn: (_career, team) => getTransferBudget(team) >= 4000,
    pickContext() {
      return {}
    },
    title: () => 'Wyjazd integracyjny',
    titleEn: () => 'Team bonding trip',
    body: () =>
      'Kapitan sugeruje krótki wyjazd / wspólną kolację zespołu. Koszt umiarkowany, efekt na chemię może być duży.',
    choices: () => [
      {
        id: 'weekend',
        label: 'Weekendowy wyjazd',
        hint: '−$6k, morale +6, forma −1',
      },
      {
        id: 'dinner',
        label: 'Kolacja w mieście',
        hint: '−$2k, morale +3',
      },
      { id: 'skip', label: 'Bez integracji', hint: 'Bez zmian' },
    ],
    resolve(_ctx, choiceId) {
      if (choiceId === 'weekend') {
        return {
          effects: [
            { type: 'budget', delta: -6000 },
            { type: 'moraleTeam', delta: 6 },
            { type: 'formTeam', delta: -1 },
          ],
          summary:
            'Weekend integracyjny zbliżył skład. Atmosfera świetna, lekki spadek ostrości treningowej.',
          summaryEn: 'The bonding weekend brought the squad closer. Great vibe, slight drop in training sharpness.',
        }
      }
      if (choiceId === 'dinner') {
        return {
          effects: [
            { type: 'budget', delta: -2000 },
            { type: 'moraleTeam', delta: 3 },
          ],
          summary: 'Wspólna kolacja poprawiła chemię bez dużego kosztu.',
          summaryEn: 'A team dinner improved chemistry without big cost.',
        }
      }
      return {
        effects: [],
        summary: 'Zrezygnowaliście z integracji. Kalendarz i budżet bez zmian.',
        summaryEn: 'You skipped bonding. Calendar and budget unchanged.',
      }
    },
  },

  {
    id: 'scout_hot_tip',
    weight: 0.8,
    canSpawn: (_career, team) => getTransferBudget(team) >= 3000,
    pickContext() {
      return {}
    },
    title: () => 'Gorący tip skauta',
    titleEn: () => 'Hot scout tip',
    body: () =>
      'Skaut twierdzi, że ma lead na niedoszacowanego zawodnika z innej ligi. Chce budżet na wyjazd i raport.',
    choices: () => [
      {
        id: 'fund',
        label: 'Sfinansuj wyjazd',
        hint: '−$5k, 55%: morale drużyny +2 (dobry raport)',
      },
      {
        id: 'cheap',
        label: 'Zdalny research',
        hint: '−$1k, morale +0/+1',
      },
      { id: 'pass', label: 'Odpuść', hint: 'Bez zmian' },
    ],
    resolve(_ctx, choiceId, rng) {
      if (choiceId === 'fund') {
        if (rng() < 0.55) {
          return {
            effects: [
              { type: 'budget', delta: -5000 },
              { type: 'moraleTeam', delta: 2 },
            ],
            summary:
              'Wyjazd skauta się opłacił — solidny raport podniósł wiarę szatni w projekt transferowy.',
            summaryEn: 'The scout trip paid off — a solid report lifted locker-room faith in the transfer project.',
          }
        }
        return {
          effects: [{ type: 'budget', delta: -5000 }],
          summary: 'Wyjazd skauta nic nie dał. Pieniądze poszły, lead był przeceniony.',
          summaryEn: 'The scout trip gave nothing. Money spent; the lead was overrated.',
        }
      }
      if (choiceId === 'cheap') {
        const boost = rng() < 0.5 ? 1 : 0
        return {
          effects: [
            { type: 'budget', delta: -1000 },
            ...(boost ? [{ type: 'moraleTeam', delta: 1 }] : []),
          ],
          summary:
            boost > 0
              ? 'Zdalny research coś podpowiedział. Lekki zastrzyk optymizmu w klubie.'
              : 'Zdalny research nic konkretnego nie przyniósł.',
          summaryEn:
            boost > 0
              ? 'Remote research hinted at something. A light optimism boost in the club.'
              : 'Remote research brought nothing concrete.',
        }
      }
      return {
        effects: [],
        summary: 'Odpuściłeś tip skauta. Budżet nienaruszony.',
        summaryEn: 'You passed on the scout tip. Budget untouched.',
      }
    },
  },

  {
    id: 'rookie_nerves',
    weight: 1,
    canSpawn: (_career, team) => (team?.players?.length ?? 0) >= 4,
    pickContext(roster, rng) {
      const sorted = sortByOvrDesc(roster)
      const rookies = sorted.slice(-Math.max(3, Math.floor(sorted.length / 3)))
      const rookie = pickRandom(rookies, rng) ?? sorted[sorted.length - 1]
      const mentor = sorted[0]
      if (!rookie || !mentor || rookie.id === mentor.id) return null
      return {
        rookieId: rookie.id,
        rookieName: playerName(rookie),
        mentorId: mentor.id,
        mentorName: playerName(mentor),
      }
    },
    title: (ctx) => `${ctx.rookieName} ma tremę`,
    titleEn: (ctx) => `${ctx.rookieName} has stage fright`,
    body: (ctx) =>
      `${ctx.rookieName} wygląda spięty przed kolejnymi meczami. Możesz dać mentoring, odciążyć go albo postawić ultimatum.`,
    choices: (ctx) => [
      {
        id: 'mentor',
        label: `Mentoring z ${ctx.mentorName}`,
        hint: 'Morale young +, forma mentora −1',
      },
      {
        id: 'ease',
        label: 'Zmniejsz oczekiwania',
        hint: 'Morale +5, forma −2',
      },
      {
        id: 'pressure',
        label: '„Poradź sobie”',
        hint: 'Morale −5, forma +2 albo −3 (50%)',
      },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'mentor') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.rookieId, delta: 6 },
            { type: 'form', playerId: ctx.rookieId, delta: 2 },
            { type: 'form', playerId: ctx.mentorId, delta: -1 },
          ],
          summary: `${ctx.mentorName} wziął ${ctx.rookieName} pod skrzydło. Młody rośnie, mentor lekko obciążony.`,
          summaryEn: `${ctx.mentorName} took ${ctx.rookieName} under their wing. The youngster grows; the mentor is lightly loaded.`,
        }
      }
      if (choiceId === 'ease') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.rookieId, delta: 5 },
            { type: 'form', playerId: ctx.rookieId, delta: -2 },
          ],
          summary: `${ctx.rookieName} odetchnął po obniżeniu oczekiwań, ale stracił trochę ostrości.`,
          summaryEn: `${ctx.rookieName} exhaled after lowered expectations, but lost a bit of edge.`,
        }
      }
      if (rng() < 0.5) {
        return {
          effects: [
            { type: 'morale', playerId: ctx.rookieId, delta: -5 },
            { type: 'form', playerId: ctx.rookieId, delta: 2 },
          ],
          summary: `Presja podziałała na ${ctx.rookieName} — morale w dół, ale złapał luz bojowy.`,
          summaryEn: `Pressure worked on ${ctx.rookieName} — morale down, but they found competitive focus.`,
        }
      }
      return {
        effects: [
          { type: 'morale', playerId: ctx.rookieId, delta: -5 },
          { type: 'form', playerId: ctx.rookieId, delta: -3 },
        ],
        summary: `Presja przytłoczyła ${ctx.rookieName}. Morale i forma lecą w dół.`,
        summaryEn: `Pressure overwhelmed ${ctx.rookieName}. Morale and form are sliding.`,
      }
    },
  },

  {
    id: 'nutritionist_visit',
    weight: 0.95,
    canSpawn: (_c, team) => (team?.players?.length ?? 0) >= 5,
    pickContext(roster, rng) {
      const sorted = sortByOvrDesc(roster)
      return {
        focusIds: sorted.slice(0, 4).map((p) => p.id),
        focusNames: sorted.slice(0, 4).map((p) => playerName(p)),
      }
    },
    title: () => 'Dietetyk w bazie treningowej',
    titleEn: () => 'Dietitian at the training base',
    body: () =>
      'Klubowy dietetyk proponuje dwutygodniowy program żywieniowy. Kosztuje, ale może podkręcić formę kluczowych zawodników.',
    choices: () => [
      { id: 'full', label: 'Pełny program', hint: 'Budżet −, forma top 4 ↑' },
      { id: 'snacks', label: 'Tylko zdrowsze przekąski', hint: 'Tani boost morale' },
      { id: 'skip', label: 'Odłóż na później', hint: 'Bez zmian' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'full') {
        const cost = 5000 + Math.floor(rng() * 3001)
        const rounded = Math.round(cost / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: -rounded },
            { type: 'formMany', playerIds: ctx.focusIds, delta: 3 },
            { type: 'moraleMany', playerIds: ctx.focusIds, delta: 1 },
          ],
          summary: `Zainwestowałeś ${formatUsd(rounded)} w żywienie. Forma ${ctx.focusNames.join(', ')} w górę.`,
          summaryEn: `You invested ${formatUsd(rounded)} in nutrition. Form for ${ctx.focusNames.join(', ')} is up.`,
        }
      }
      if (choiceId === 'snacks') {
        return {
          effects: [
            { type: 'budget', delta: -1000 },
            { type: 'moraleTeam', delta: 2 },
          ],
          summary: 'Zdrowsze przekąski w szatni — mały koszt, lepsze humory.',
          summaryEn: 'Healthier snacks in the locker room — small cost, better moods.',
        }
      }
      return { effects: [], summary: 'Program żywieniowy odłożony. Lodówka bez rewolucji.',
      summaryEn: 'Nutrition program postponed. No fridge revolution.' }
    },
  },

  {
    id: 'analytics_hire',
    weight: 0.9,
    canSpawn: (career) => getTransferBudget(worldTeamById(career.world, career.playerTeamId)) >= 4000,
    pickContext() {
      return {}
    },
    title: () => 'Analityk video puka do drzwi',
    titleEn: () => 'Video analyst knocks on the door',
    body: () =>
      'Freelance’owy analityk oferuje pakiet filmów z rywali i raporty o Twoich turnowerach. Drogo, ale konkretnie.',
    choices: () => [
      { id: 'hire', label: 'Zatrudnij na miesiąc', hint: 'Budżet −, forma drużyny +' },
      { id: 'one_report', label: 'Jeden raport testowy', hint: 'Mały koszt, mały boost' },
      { id: 'pass', label: 'Polegamy na oku trenera', hint: 'Morale sztabu (drużyna) +1' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'hire') {
        const cost = 7000 + Math.floor(rng() * 4001)
        const rounded = Math.round(cost / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: -rounded },
            { type: 'formTeam', delta: 2 },
          ],
          summary: `Analityk na pokładzie za ${formatUsd(rounded)}. Drużyna czyta rywali lepiej.`,
          summaryEn: `Analyst on board for ${formatUsd(rounded)}. The team reads rivals better.`,
        }
      }
      if (choiceId === 'one_report') {
        return {
          effects: [
            { type: 'budget', delta: -2000 },
            { type: 'formTeam', delta: 1 },
          ],
          summary: 'Jeden raport testowy — tani wgląd, lekki boost formy.',
          summaryEn: 'One test report — cheap insight, light form boost.',
        }
      }
      return {
        effects: [{ type: 'moraleTeam', delta: 1 }],
        summary: 'Zostajecie przy tradycyjnym scoutingu. Szatnia ceni zaufanie do sztabu.',
        summaryEn: 'You stick with traditional scouting. The locker room trusts the staff’s eye.',
      }
    },
  },

  {
    id: 'jersey_number_dispute',
    weight: 0.85,
    canSpawn: (_c, team) => (team?.players?.length ?? 0) >= 2,
    pickContext(roster, rng) {
      const a = pickRandom(roster, rng)
      const b = pickRandom(
        roster.filter((p) => p.id !== a?.id),
        rng,
      )
      if (!a || !b) return null
      const num = a.jersey ?? b.jersey ?? 7
      return {
        aId: a.id,
        aName: playerName(a),
        bId: b.id,
        bName: playerName(b),
        number: num,
      }
    },
    title: (ctx) => `Spór o numer ${ctx.number}`,
    titleEn: (ctx) => `Fight over jersey number ${ctx.number}`,
    body: (ctx) =>
      `${ctx.aName} i ${ctx.bName} chcą tego samego numeru na sezon. Mała rzecz, duże ego.`,
    choices: (ctx) => [
      { id: 'a', label: `Numer dla ${ctx.aName}`, hint: 'Morale A +, B −' },
      { id: 'b', label: `Numer dla ${ctx.bName}`, hint: 'Morale B +, A −' },
      { id: 'neither', label: 'Obaj dostają inne numery', hint: 'Obaj lekko −, koniec tematu' },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'a') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.aId, delta: 4 },
            { type: 'morale', playerId: ctx.bId, delta: -4 },
          ],
          summary: `${ctx.aName} dostaje #${ctx.number}. ${ctx.bName} nie jest zachwycony.`,
          summaryEn: `${ctx.aName} gets #${ctx.number}. ${ctx.bName} is not thrilled.`,
        }
      }
      if (choiceId === 'b') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.bId, delta: 4 },
            { type: 'morale', playerId: ctx.aId, delta: -4 },
          ],
          summary: `${ctx.bName} dostaje #${ctx.number}. ${ctx.aName} gryzie wędzidło.`,
          summaryEn: `${ctx.bName} gets #${ctx.number}. ${ctx.aName} bites the bullet.`,
        }
      }
      return {
        effects: [
          { type: 'morale', playerId: ctx.aId, delta: -1 },
          { type: 'morale', playerId: ctx.bId, delta: -1 },
        ],
        summary: 'Solomoniczny wyrok: nowe numery dla obu. Spór ucichł.',
        summaryEn: 'Solomon’s verdict: new numbers for both. Dispute settled.',
      }
    },
  },

  {
    id: 'weather_camp',
    weight: 0.9,
    pickContext() {
      return {}
    },
    title: () => 'Prognoza: tydzień burzowy',
    titleEn: () => 'Forecast: stormy week',
    body: () =>
      'Nadchodzący tydzień zapowiada się mokro i wietrznie. Możesz trenować outdoor „na charakter”, wynająć halę albo dać regenerację.',
    choices: () => [
      { id: 'grit', label: 'Trening w wietrze', hint: 'Forma +, morale −' },
      { id: 'hall', label: 'Wynajmij halę', hint: 'Budżet −, forma +' },
      { id: 'regen', label: 'Regeneracja / video', hint: 'Morale +, forma −1' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'grit') {
        return {
          effects: [
            { type: 'formTeam', delta: 2 },
            { type: 'moraleTeam', delta: -2 },
          ],
          summary: 'Trening w burzy zahartował skład — forma ↑, humory lekko ↓.',
          summaryEn: 'Training in the storm hardened the squad — form ↑, moods slightly ↓.',
        }
      }
      if (choiceId === 'hall') {
        const cost = 2000 + Math.floor(rng() * 2001)
        const rounded = Math.round(cost / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: -rounded },
            { type: 'formTeam', delta: 2 },
          ],
          summary: `Hala za ${formatUsd(rounded)}. Suche dyski, dobra jakość sesji.`,
          summaryEn: `Hall for ${formatUsd(rounded)}. Dry discs, good session quality.`,
        }
      }
      return {
        effects: [
          { type: 'moraleTeam', delta: 3 },
          { type: 'formTeam', delta: -1 },
        ],
        summary: 'Tydzień regeneracji i video. Skład odetchnął, ostrość lekko spadła.',
        summaryEn: 'A recovery/video week. The squad exhaled; sharpness dipped slightly.',
      }
    },
  },

  {
    id: 'veteran_contract_talk',
    weight: 0.95,
    canSpawn: (_c, team) => (team?.players ?? []).some((p) => (p.age ?? 25) >= 30),
    pickContext(roster, rng) {
      const vets = roster.filter((p) => (p.age ?? 25) >= 30)
      const vet = pickRandom(vets, rng)
      if (!vet) return null
      return { vetId: vet.id, vetName: playerName(vet), age: vet.age ?? 30 }
    },
    title: (ctx) => `${ctx.vetName} chce jasności`,
    titleEn: (ctx) => `${ctx.vetName} wants clarity`,
    body: (ctx) =>
      `${ctx.vetName} (${ctx.age} lat) prosi o rozmowę o roli na resztę sezonu: mentoring, rotacja czy walka o minuty.`,
    choices: (ctx) => [
      {
        id: 'mentor',
        label: 'Rola mentora / lidera szatni',
        hint: 'Morale weterana +, forma −1',
      },
      {
        id: 'compete',
        label: 'Walczysz o skład jak wszyscy',
        hint: 'Forma +, morale 50/50',
      },
      {
        id: 'minutes',
        label: 'Obiecaj stabilne minuty',
        hint: 'Morale +, lekki koszt „polityczny” (drużyna −1)',
      },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'mentor') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.vetId, delta: 5 },
            { type: 'form', playerId: ctx.vetId, delta: -1 },
            { type: 'moraleTeam', delta: 1 },
          ],
          summary: `${ctx.vetName} przyjmuje rolę mentora. Szatnia to docenia.`,
          summaryEn: `${ctx.vetName} takes a mentor role. The locker room appreciates it.`,
        }
      }
      if (choiceId === 'compete') {
        if (rng() < 0.55) {
          return {
            effects: [
              { type: 'form', playerId: ctx.vetId, delta: 3 },
              { type: 'morale', playerId: ctx.vetId, delta: 2 },
            ],
            summary: `${ctx.vetName} odpalił się na konkurencję — forma i morale w górę.`,
            summaryEn: `${ctx.vetName} fired up for competition — form and morale up.`,
          }
        }
        return {
          effects: [
            { type: 'form', playerId: ctx.vetId, delta: 2 },
            { type: 'morale', playerId: ctx.vetId, delta: -3 },
          ],
          summary: `${ctx.vetName} trenuje ostro, ale czuje się niedoceniony.`,
          summaryEn: `${ctx.vetName} trains hard but feels underappreciated.`,
        }
      }
      return {
        effects: [
          { type: 'morale', playerId: ctx.vetId, delta: 6 },
          { type: 'moraleTeam', delta: -1 },
        ],
        summary: `Obiecałeś minuty ${ctx.vetName}. On zadowolony; reszta składu lekko mruczy.`,
        summaryEn: `You promised minutes to ${ctx.vetName}. They’re happy; the rest of the squad murmurs a bit.`,
      }
    },
  },

  {
    id: 'local_derby_hype',
    weight: 1,
    canSpawn: (career) => {
      const league = career.league
      if (!league) return false
      return (league.fixtures ?? []).some(
        (f) =>
          (f.status === 'scheduled' || f.status === 'pending') &&
          f.date &&
          f.date >= league.currentDate &&
          (f.homeTeamId === career.playerTeamId || f.awayTeamId === career.playerTeamId),
      )
    },
    pickContext(roster, rng) {
      const sorted = sortByOvrDesc(roster)
      return {
        starId: sorted[0]?.id,
        starName: sorted[0] ? playerName(sorted[0]) : 'Kapitan',
      }
    },
    title: () => 'Hype przed lokalnym starciem',
    titleEn: () => 'Hype before a local clash',
    body: () =>
      'Media i kibice podkręcają atmosferę przed Twoim najbliższym meczem. Możesz podsycić ogień, wyciszyć szatnię albo wykorzystać PR.',
    choices: (ctx) => [
      { id: 'fire', label: 'Podkręć motywację', hint: 'Forma +, morale − u gwiazdy (presja)' },
      { id: 'calm', label: 'Wycisz szatnię', hint: 'Morale drużyny +' },
      {
        id: 'pr',
        label: `Wywiad z ${ctx.starName}`,
        hint: 'Budżet + (sponsor), forma gwiazdy −1',
      },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'fire') {
        return {
          effects: [
            { type: 'formTeam', delta: 2 },
            ...(ctx.starId
              ? [{ type: 'morale', playerId: ctx.starId, delta: -2 }]
              : []),
          ],
          summary: 'Szatnia jest „na ostro”. Forma ↑, gwiazda czuje ciężar oczekiwań.',
          summaryEn: 'The locker room is ‘on edge.’ Form ↑; the star feels expectation weight.',
        }
      }
      if (choiceId === 'calm') {
        return {
          effects: [{ type: 'moraleTeam', delta: 3 }],
          summary: 'Wyciszyłeś szum medialny. Skład wchodzi w mecz spokojniej.',
          summaryEn: 'You quieted the media noise. The squad enters the match calmer.',
        }
      }
      const pay = 3000 + Math.floor(rng() * 3001)
      const rounded = Math.round(pay / 1000) * 1000
      return {
        effects: [
          { type: 'budget', delta: rounded },
          ...(ctx.starId
            ? [
                { type: 'form', playerId: ctx.starId, delta: -1 },
                { type: 'morale', playerId: ctx.starId, delta: 2 },
              ]
            : []),
        ],
        summary: `Wywiad przyniósł ${formatUsd(rounded)} od sponsora mediów. ${ctx.starName} lekko zmęczony PR-em.`,
        summaryEn: `The interview brought ${formatUsd(rounded)} from a media sponsor. ${ctx.starName} is slightly PR-tired.`,
      }
    },
  },

  {
    id: 'practice_tourament',
    weight: 0.9,
    canSpawn: (_c, team) => (team?.players?.length ?? 0) >= 8,
    pickContext(roster) {
      const sorted = sortByOvrDesc(roster)
      return {
        topIds: sorted.slice(0, 5).map((p) => p.id),
        benchIds: sorted.slice(-4).map((p) => p.id),
      }
    },
    title: () => 'Wewnętrzny turniej treningowy',
    titleEn: () => 'Internal training tournament',
    body: () =>
      'Sztab proponuje mini-turniej w ramach tygodnia. Rywalizacja wewnętrzna może podnieść poziom — albo zostawić siniaki na ego.',
    choices: () => [
      { id: 'compete', label: 'Pełna rywalizacja', hint: 'Forma top ↑, morale bench ryzykowne' },
      { id: 'fun', label: 'Luz + nagrody śmieszne', hint: 'Morale drużyny +, forma 0' },
      { id: 'skip', label: 'Zwykły trening', hint: 'Bez zmian' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'compete') {
        const benchHit = rng() < 0.45
        return {
          effects: [
            { type: 'formMany', playerIds: ctx.topIds, delta: 2 },
            ...(benchHit
              ? [{ type: 'moraleMany', playerIds: ctx.benchIds, delta: -3 }]
              : [{ type: 'moraleMany', playerIds: ctx.benchIds, delta: 1 }]),
          ],
          summary: benchHit
            ? 'Turniej podkręcił top — ławka wyszła z lekkim niesmakiem.'
            : 'Turniej wyszedł sportowo. Forma liderów ↑, ławka też ok.',
          summaryEn: benchHit
            ? 'The tournament sharpened the top — the bench left mildly sour.'
            : 'The tournament was sporting. Leaders’ form ↑; bench OK too.',
        }
      }
      if (choiceId === 'fun') {
        return {
          effects: [{ type: 'moraleTeam', delta: 4 }],
          summary: 'Luźny turniej z nagrodami-żartami. Szatnia umocniona.',
          summaryEn: 'A loose tournament with joke prizes. Locker room strengthened.',
        }
      }
      return { effects: [], summary: 'Zostajecie przy standardowym planie treningowym.',
      summaryEn: 'You stick with the standard training plan.' }
    },
  },

  {
    id: 'medical_checkup',
    weight: 0.85,
    canSpawn: (_c, team) => (team?.players?.length ?? 0) >= 3,
    pickContext(roster, rng) {
      const p = pickRandom(roster, rng)
      if (!p) return null
      return { playerId: p.id, playerName: playerName(p) }
    },
    title: (ctx) => `Badania kontrolne: ${ctx.playerName}`,
    titleEn: (ctx) => `Medical check: ${ctx.playerName}`,
    body: (ctx) =>
      `Sztab medyczny chce dodatkowe badania ${ctx.playerName}. Może wykryć przeciążenie — albo tylko wyciągnąć kasę i nerwy.`,
    choices: (ctx) => [
      { id: 'full', label: 'Pełny pakiet badań', hint: 'Budżet −; forma + lub odpoczynek' },
      { id: 'basic', label: 'Podstawowy check', hint: 'Tani, mały efekt' },
      { id: 'skip', label: `${ctx.playerName} czuje się dobrze`, hint: 'Ryzyko formy −' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'full') {
        const cost = 3000 + Math.floor(rng() * 2001)
        const rounded = Math.round(cost / 1000) * 1000
        if (rng() < 0.6) {
          return {
            effects: [
              { type: 'budget', delta: -rounded },
              { type: 'form', playerId: ctx.playerId, delta: 3 },
              { type: 'morale', playerId: ctx.playerId, delta: 2 },
            ],
            summary: `Badania (${formatUsd(rounded)}) wykryły drobne przeciążenie — skorygowaliście plan. Forma ${ctx.playerName} ↑.`,
            summaryEn: `Tests (${formatUsd(rounded)}) caught light overload — you adjusted the plan. Form ${ctx.playerName} ↑.`,
          }
        }
        return {
          effects: [
            { type: 'budget', delta: -rounded },
            { type: 'form', playerId: ctx.playerId, delta: -2 },
            { type: 'morale', playerId: ctx.playerId, delta: 1 },
          ],
          summary: `Po badaniach (${formatUsd(rounded)}) zalecono odciążenie. ${ctx.playerName} odpoczywa (forma −), ale czuje opiekę.`,
          summaryEn: `After tests (${formatUsd(rounded)}) they recommended rest. ${ctx.playerName} recovers (form −) but feels cared for.`,
        }
      }
      if (choiceId === 'basic') {
        return {
          effects: [
            { type: 'budget', delta: -1000 },
            { type: 'morale', playerId: ctx.playerId, delta: 1 },
          ],
          summary: `Podstawowy check za ${formatUsd(1000)}. Wszystko wygląda OK.`,
          summaryEn: `Basic check for ${formatUsd(1000)}. Everything looks OK.`,
        }
      }
      if (rng() < 0.35) {
        return {
          effects: [{ type: 'form', playerId: ctx.playerId, delta: -4 }],
          summary: `Odpuściliście badania. ${ctx.playerName} łapie drobne przeciążenie — forma spada.`,
          summaryEn: `You skipped the tests. ${ctx.playerName} picks up light overload — form drops.`,
        }
      }
      return {
        effects: [{ type: 'morale', playerId: ctx.playerId, delta: 1 }],
        summary: `${ctx.playerName} faktycznie czuje się dobrze. Tym razem pech nie uderzył.`,
        summaryEn: `${ctx.playerName} actually feels fine. Luck held this time.`,
      }
    },
  },

  {
    id: 'podcast_guest',
    weight: 0.8,
    canSpawn: (_c, team) => (team?.players?.length ?? 0) >= 1,
    pickContext(roster, rng) {
      const sorted = sortByOvrDesc(roster)
      const star = sorted[0]
      if (!star) return null
      return { starId: star.id, starName: playerName(star) }
    },
    title: () => 'Zaproszenie do podcastu UFA Talk',
    titleEn: () => 'Invite to the League Talk podcast',
    body: (ctx) =>
      `Popularny podcast chce ${ctx.starName} na godzinę „bez cenzury”. Ekspozycja vs ryzyko wpadki.`,
    choices: (ctx) => [
      { id: 'go', label: `Wyślij ${ctx.starName}`, hint: 'Morale +, forma −1; 20% drama' },
      { id: 'coach', label: 'Idź Ty (manager)', hint: 'Budżet + (fee), morale drużyny +' },
      { id: 'decline', label: 'Odmów', hint: 'Bez zmian' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'go') {
        if (rng() < 0.2) {
          return {
            effects: [
              { type: 'morale', playerId: ctx.starId, delta: -3 },
              { type: 'moraleTeam', delta: -1 },
              { type: 'form', playerId: ctx.starId, delta: -1 },
            ],
            summary: `${ctx.starName} powiedział za dużo. Mały storm w socialach, morale w dół.`,
            summaryEn: `${ctx.starName} said too much. A small social storm; morale down.`,
          }
        }
        return {
          effects: [
            { type: 'morale', playerId: ctx.starId, delta: 4 },
            { type: 'form', playerId: ctx.starId, delta: -1 },
            { type: 'budget', delta: 2000 },
          ],
          summary: `Świetny odcinek. ${ctx.starName} zadowolony, klub dostał ${formatUsd(2000)} fee.`,
          summaryEn: `Great episode. ${ctx.starName} happy; the club got a ${formatUsd(2000)} fee.`,
        }
      }
      if (choiceId === 'coach') {
        return {
          effects: [
            { type: 'budget', delta: 4000 },
            { type: 'moraleTeam', delta: 2 },
          ],
          summary: `Poszedłeś sam. Opowiedziałeś wizję klubu — ${formatUsd(4000)} i plus dla szatni.`,
          summaryEn: `You went yourself. You sold the club vision — ${formatUsd(4000)} and a locker-room plus.`,
        }
      }
      return { effects: [], summary: 'Odmowa bez dramatów. Podcast bierze innego gościa.',
      summaryEn: 'Decline without drama. The podcast takes another guest.' }
    },
  },

  {
    id: 'youth_camp_invite',
    weight: 0.85,
    canSpawn: (_c, team) =>
      (team?.players ?? []).some((p) => (p.age ?? 25) <= 22) && (team?.players?.length ?? 0) >= 2,
    pickContext(roster, rng) {
      const youth = roster.filter((p) => (p.age ?? 25) <= 22)
      const y = pickRandom(youth, rng)
      if (!y) return null
      return { youthId: y.id, youthName: playerName(y), age: y.age ?? 20 }
    },
    title: (ctx) => `Obóz reprezentacji U-22 dla ${ctx.youthName}`,
    titleEn: (ctx) => `U-22 national camp for ${ctx.youthName}`,
    body: (ctx) =>
      `${ctx.youthName} (${ctx.age} lat) dostał zaproszenie na krótki obóz młodzieżowy. Prestige vs zmęczenie.`,
    choices: (ctx) => [
      { id: 'send', label: 'Wyślij', hint: 'Morale youth +, forma −2, PR budżet +' },
      { id: 'partial', label: 'Tylko weekend', hint: 'Mniejszy efekt obu stron' },
      { id: 'keep', label: 'Zostaw w klubie', hint: 'Morale youth −' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'send') {
        const pay = 2000 + Math.floor(rng() * 2001)
        const rounded = Math.round(pay / 1000) * 1000
        return {
          effects: [
            { type: 'morale', playerId: ctx.youthId, delta: 7 },
            { type: 'form', playerId: ctx.youthId, delta: -2 },
            { type: 'budget', delta: rounded },
          ],
          summary: `${ctx.youthName} jedzie na obóz. Morale rakieta, forma lekko ↓, klub +${formatUsd(rounded)} z grantu.`,
          summaryEn: `${ctx.youthName} goes to camp. Morale rocket, form slightly ↓, club +${formatUsd(rounded)} from a grant.`,
        }
      }
      if (choiceId === 'partial') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.youthId, delta: 3 },
            { type: 'form', playerId: ctx.youthId, delta: -1 },
            { type: 'budget', delta: 1000 },
          ],
          summary: `${ctx.youthName} jedzie na skrócony wyjazd. Kompromis zaakceptowany.`,
          summaryEn: `${ctx.youthName} goes on a shortened trip. Compromise accepted.`,
        }
      }
      return {
        effects: [{ type: 'morale', playerId: ctx.youthId, delta: -5 }],
        summary: `${ctx.youthName} zostaje — i nie ukrywa rozczarowania.`,
        summaryEn: `${ctx.youthName} stays — and doesn’t hide the disappointment.`,
      }
    },
  },

  {
    id: 'bench_meeting',
    weight: 0.9,
    canSpawn: (_c, team) => (team?.players?.length ?? 0) >= 6,
    pickContext(roster) {
      const sorted = sortByOvrDesc(roster)
      const bench = sorted.slice(Math.floor(sorted.length / 2))
      return {
        benchIds: bench.slice(0, 5).map((p) => p.id),
        benchNames: bench.slice(0, 3).map((p) => playerName(p)),
      }
    },
    title: () => 'Spotkanie z ławką',
    titleEn: () => 'Meeting with the bench',
    body: (ctx) =>
      `Część rotacji (${ctx.benchNames.join(', ')}…) chce rozmowy o minutach i perspektywach. Ignorowanie też jest decyzją.`,
    choices: () => [
      { id: 'honest', label: 'Szczera rozmowa + plan', hint: 'Morale ławki +, forma top −1 (czas)' },
      { id: 'promise', label: 'Obiecaj więcej minut', hint: 'Morale ławki ++; ryzyko niespełnienia (− później nie modelujemy)' },
      { id: 'ignore', label: '„Skład wybiera boisko”', hint: 'Morale ławki −' },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'honest') {
        return {
          effects: [
            { type: 'moraleMany', playerIds: ctx.benchIds, delta: 4 },
            { type: 'formTeam', delta: -1 },
          ],
          summary: 'Szczera rozmowa uspokoiła ławkę. Lekki koszt czasu sztabu (forma −1).',
          summaryEn: 'An honest talk calmed the bench. Light staff-time cost (form −1).',
        }
      }
      if (choiceId === 'promise') {
        return {
          effects: [{ type: 'moraleMany', playerIds: ctx.benchIds, delta: 6 }],
          summary: 'Obietnice podniosły morale ławki. Teraz trzeba ich dotrzymać na boisku.',
          summaryEn: 'Promises lifted bench morale. Now you have to deliver on the pitch.',
        }
      }
      return {
        effects: [{ type: 'moraleMany', playerIds: ctx.benchIds, delta: -4 }],
        summary: 'Zamknąłeś temat. Ławka czuje chłód.',
        summaryEn: 'You shut the topic down. The bench feels the chill.',
      }
    },
  },

  {
    id: 'merch_drop',
    weight: 0.75,
    pickContext() {
      return {}
    },
    title: () => 'Drop merchu klubowego',
    titleEn: () => 'Club merch drop',
    body: () =>
      'Marketing chce limitowany drop koszulek. Możesz wejść agresywnie, ostrożnie albo odpuścić sezonowy hype.',
    choices: () => [
      { id: 'big', label: 'Duży drop', hint: 'Budżet − teraz, potem + (netto +); morale +' },
      { id: 'small', label: 'Mała seria', hint: 'Mały zysk, mały boost' },
      { id: 'skip', label: 'Bez merchu', hint: 'Bez zmian' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'big') {
        const invest = 8000
        const revenue = 12000 + Math.floor(rng() * 8001)
        const rev = Math.round(revenue / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: -invest },
            { type: 'budget', delta: rev },
            { type: 'moraleTeam', delta: 2 },
          ],
          summary: `Drop hype’owy: −${formatUsd(invest)} kosztów, +${formatUsd(rev)} wpływu. Szatnia lubi buzz.`,
          summaryEn: `Hype drop: −${formatUsd(invest)} costs, +${formatUsd(rev)} revenue. The locker room likes the buzz.`,
        }
      }
      if (choiceId === 'small') {
        return {
          effects: [
            { type: 'budget', delta: 3000 },
            { type: 'moraleTeam', delta: 1 },
          ],
          summary: `Mała seria merchu: +${formatUsd(3000)}. Bez fajerwerków, solidnie.`,
          summaryEn: `Small merch run: +${formatUsd(3000)}. No fireworks, solid.`,
        }
      }
      return { effects: [], summary: 'Sezon bez dropu. Magazyn pusty, spokój w księgowości.',
      summaryEn: 'Season without a drop. Empty warehouse, calm accounting.' }
    },
  },

  {
    id: 'referee_clinic',
    weight: 0.7,
    pickContext(roster, rng) {
      const sorted = sortByOvrDesc(roster)
      const hosts = sorted.slice(0, 3)
      return {
        hostIds: hosts.map((p) => p.id),
        hostNames: hosts.map((p) => playerName(p)),
      }
    },
    title: () => 'Warsztaty spirit of the game',
    titleEn: () => 'Spirit of the Game workshop',
    body: () =>
      'Liga prosi kluby o prowadzenie warsztatów fair-play dla juniorów. Prestige i zmęczenie w pakiecie.',
    choices: (ctx) => [
      {
        id: 'host',
        label: `Prowadzą ${ctx.hostNames[0] ?? 'liderzy'}`,
        hint: 'Morale hostów +, forma −1, budżet +',
      },
      { id: 'staff', label: 'Wyślij sztab / wolontariuszy', hint: 'Budżet +, bez efektu na skład' },
      { id: 'decline', label: 'Nie tym razem', hint: 'Lekki − morale (wizerunek)' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'host') {
        const pay = 2000 + Math.floor(rng() * 2001)
        const rounded = Math.round(pay / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: rounded },
            { type: 'moraleMany', playerIds: ctx.hostIds, delta: 3 },
            { type: 'formMany', playerIds: ctx.hostIds, delta: -1 },
          ],
          summary: `Warsztaty OK. +${formatUsd(rounded)}, hosty dumni, lekko zmęczeni.`,
          summaryEn: `Workshop OK. +${formatUsd(rounded)}; hosts proud, lightly tired.`,
        }
      }
      if (choiceId === 'staff') {
        return {
          effects: [{ type: 'budget', delta: 1500 }],
          summary: `Sztab ogarnął warsztaty. +${formatUsd(1500)}, skład nietknięty.`,
          summaryEn: `Staff handled the workshop. +${formatUsd(1500)}; roster untouched.`,
        }
      }
      return {
        effects: [{ type: 'moraleTeam', delta: -1 }],
        summary: 'Odmowa — drobny minus wizerunkowy w szatni.',
        summaryEn: 'Refusal — a small image ding in the locker room.',
      }
    },
  },

  {
    id: 'hotel_nightmare',
    weight: 0.85,
    canSpawn: () => true,
    pickContext(roster, rng) {
      const sorted = sortByOvrDesc(roster)
      const victims = sorted.slice(0, 5).map((p) => ({ id: p.id, name: playerName(p) }))
      return { victims }
    },
    title: () => 'Koszmarny hotel przed wyjazdem',
    titleEn: () => 'Nightmare hotel before travel',
    body: (ctx) =>
      `Rezerwacja poszła nie tak: hałas, brak klimatyzacji, śniadanie „inspirujące”. Najbardziej ucierpieli: ${ctx.victims.map((v) => v.name).join(', ')}.`,
    choices: (ctx) => [
      {
        id: 'upgrade',
        label: 'Dopłać za lepszy hotel',
        hint: 'Budżet −, morale wybranych +',
      },
      {
        id: 'tough',
        label: '„Hartujemy charakter”',
        hint: 'Morale −, forma −1 u wybranych',
      },
      {
        id: 'early',
        label: 'Wcześniejszy wyjazd / drzemka w busie',
        hint: 'Lekki koszt, neutralna forma',
      },
    ],
    resolve(ctx, choiceId, rng) {
      const ids = ctx.victims.map((v) => v.id)
      if (choiceId === 'upgrade') {
        const cost = 3000 + Math.floor(rng() * 3001)
        const rounded = Math.round(cost / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: -rounded },
            { type: 'moraleMany', playerIds: ids, delta: 4 },
          ],
          summary: `Lepszy hotel (−${formatUsd(rounded)}). Zawodnicy doceniają.`,
          summaryEn: `Better hotel (−${formatUsd(rounded)}). Players appreciate it.`,
        }
      }
      if (choiceId === 'early') {
        return {
          effects: [
            { type: 'budget', delta: -1000 },
            { type: 'moraleMany', playerIds: ids, delta: 1 },
          ],
          summary: 'Wcześniejszy wyjazd złagodził kryzys. Mały koszt logistyczny.',
          summaryEn: 'Leaving early softened the crisis. Small logistics cost.',
        }
      }
      return {
        effects: [
          { type: 'moraleMany', playerIds: ids, delta: -4 },
          { type: 'formMany', playerIds: ids, delta: -1 },
        ],
        summary: 'Hartowanie charakteru… i zmęczonych nóg. Morale i forma w dół.',
        summaryEn: 'Character building… and tired legs. Morale and form down.',
      }
    },
  },

  {
    id: 'new_throw_obsession',
    weight: 0.9,
    canSpawn: (_c, team) => (team?.players?.length ?? 0) >= 3,
    pickContext(roster, rng) {
      const p = pickRandom(sortByOvrDesc(roster).slice(0, 8), rng)
      if (!p) return null
      const throws = ['scoober', 'push-pass', 'around backhand', 'high release flick']
      return {
        playerId: p.id,
        playerName: playerName(p),
        throwName: pickRandom(throws, rng),
      }
    },
    title: (ctx) => `${ctx.playerName} zakochał się w ${ctx.throwName}`,
    titleEn: (ctx) => `${ctx.playerName} fell in love with the ${ctx.throwName}`,
    body: (ctx) =>
      `${ctx.playerName} rzuca ${ctx.throwName} wszędzie — nawet gdy nie trzeba. Możesz to ukierunkować albo przyciąć.`,
    choices: (ctx) => [
      {
        id: 'encourage',
        label: 'Daj zielone światło',
        hint: 'Forma +, morale +, ryzyko chaotycznych decyzji',
      },
      {
        id: 'drill',
        label: 'Zamień w structured drill',
        hint: 'Forma +2, morale +1',
      },
      {
        id: 'ban',
        label: '„Tylko w treningu”',
        hint: 'Morale −, forma stabilna',
      },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'encourage') {
        const boom = rng() > 0.45
        return {
          effects: [
            { type: 'morale', playerId: ctx.playerId, delta: 4 },
            { type: 'form', playerId: ctx.playerId, delta: boom ? 4 : -2 },
          ],
          summary: boom
            ? `${ctx.playerName} ogarnia nowy throw — forma ↑.`
            : `${ctx.playerName} przesadza z eksperymentami — forma ↓.`,
          summaryEn: boom
            ? `${ctx.playerName} is nailing the new throw — form ↑.`
            : `${ctx.playerName} overdoes the experiments — form ↓.`,
        }
      }
      if (choiceId === 'drill') {
        return {
          effects: [
            { type: 'morale', playerId: ctx.playerId, delta: 2 },
            { type: 'form', playerId: ctx.playerId, delta: 3 },
          ],
          summary: `Uporządkowany drill z ${ctx.throwName}. Postęp bez chaosu.`,
          summaryEn: `Structured drill with ${ctx.throwName}. Progress without chaos.`,
        }
      }
      return {
        effects: [{ type: 'morale', playerId: ctx.playerId, delta: -3 }],
        summary: `${ctx.playerName} czuje się przycięty. Morale −.`,
        summaryEn: `${ctx.playerName} feels clipped. Morale −.`,
      }
    },
  },

  {
    id: 'rival_spy_rumor',
    weight: 0.8,
    canSpawn: () => true,
    pickContext(roster, rng) {
      const sorted = sortByOvrDesc(roster)
      const captain = sorted[0]
      return {
        captainId: captain?.id,
        captainName: captain ? playerName(captain) : 'Kapitan',
      }
    },
    title: () => 'Plotka: ktoś filmował wasz trening',
    titleEn: () => 'Rumor: someone filmed your training',
    body: () =>
      'Na parkingu ktoś z kamerą. Może skaut rywala, może fan, może influencer. Szatnia się gotuje.',
    choices: (ctx) => [
      {
        id: 'confront',
        label: 'Zrób scenę / zgłoś',
        hint: 'Morale drużyny +, forma −1 (rozproszenie)',
      },
      {
        id: 'decoy',
        label: 'Pokaż fałszywy playbook',
        hint: 'Morale kapitana +, lekki koszt',
      },
      { id: 'ignore', label: 'Olewać', hint: 'Neutralnie / lekki − morale' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'confront') {
        return {
          effects: [
            { type: 'moraleTeam', delta: 2 },
            { type: 'formTeam', delta: -1 },
          ],
          summary: 'Scena na parkingu. Szatnia zadowolona, skupienie lekko ucierpiało.',
          summaryEn: 'Parking-lot scene. Locker room happy; focus took a light hit.',
        }
      }
      if (choiceId === 'decoy') {
        return {
          effects: [
            { type: 'budget', delta: -1000 },
            ...(ctx.captainId
              ? [{ type: 'morale', playerId: ctx.captainId, delta: 3 }]
              : [{ type: 'moraleTeam', delta: 1 }]),
          ],
          summary: `${ctx.captainName} prowadzi operację dezinformacji. Koszt −${formatUsd(1000)}.`,
          summaryEn: `${ctx.captainName} runs a disinfo op. Cost −${formatUsd(1000)}.`,
        }
      }
      return {
        effects: [{ type: 'moraleTeam', delta: -1 }],
        summary: 'Olewanie działa… prawie. Lekki niepokój zostaje.',
        summaryEn: 'Ignoring almost works. A light unease remains.',
      }
    },
  },

  {
    id: 'yoga_experiment',
    weight: 0.85,
    canSpawn: (_c, team) => (team?.players?.length ?? 0) >= 6,
    pickContext(roster, rng) {
      const skeptics = sortByOvrDesc(roster).slice(0, 4)
      return {
        skepticIds: skeptics.map((p) => p.id),
        skepticNames: skeptics.map((p) => playerName(p)),
      }
    },
    title: () => 'Eksperyment: poranna joga przed treningiem',
    titleEn: () => 'Experiment: morning yoga before training',
    body: (ctx) =>
      `Fizjo proponuje jogę. Sceptycy z przodu sali: ${ctx.skepticNames.join(', ')}.`,
    choices: () => [
      { id: 'full', label: 'Wszyscy na matę', hint: 'Forma drużyny +, morale mieszane' },
      { id: 'opt', label: 'Opcjonalnie', hint: 'Forma sceptyków +, mały koszt' },
      { id: 'skip', label: 'Zostaw klasyczny warm-up', hint: 'Bez zmian / lekki − fizjo vibes' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'full') {
        const like = rng() > 0.35
        return {
          effects: [
            { type: 'formTeam', delta: 2 },
            {
              type: 'moraleMany',
              playerIds: ctx.skepticIds,
              delta: like ? 1 : -2,
            },
          ],
          summary: like
            ? 'Joga zaskoczyła pozytywnie. Forma ↑.'
            : 'Forma ↑, ale sceptycy narzekają na „nowoczesność”.',
          summaryEn: like
            ? 'Yoga surprised on the upside. Form ↑.'
            : 'Form ↑, but skeptics grumble about “modernity.”',
        }
      }
      if (choiceId === 'opt') {
        return {
          effects: [
            { type: 'budget', delta: -1500 },
            { type: 'formMany', playerIds: ctx.skepticIds, delta: 2 },
            { type: 'moraleMany', playerIds: ctx.skepticIds, delta: 2 },
          ],
          summary: `Opcjonalna sesja (−${formatUsd(1500)}). Chętni zyskują.`,
          summaryEn: `Optional session (−${formatUsd(1500)}). Willing players gain.`,
        }
      }
      return {
        effects: [{ type: 'moraleTeam', delta: -1 }],
        summary: 'Bez jogi. Fizjo wzdycha, szatnia w starej rutynie.',
        summaryEn: 'No yoga. Physio sighs; locker room stays in the old routine.',
      }
    },
  },

  {
    id: 'birthday_surprise',
    weight: 0.75,
    canSpawn: (_c, team) => (team?.players?.length ?? 0) >= 4,
    pickContext(roster, rng) {
      const p = pickRandom(roster, rng)
      if (!p) return null
      return { playerId: p.id, playerName: playerName(p) }
    },
    title: (ctx) => `Urodziny ${ctx.playerName}`,
    titleEn: (ctx) => `${ctx.playerName}’s birthday`,
    body: (ctx) =>
      `Szatnia chce uczcić ${ctx.playerName}. Pytanie: tort i memy, czy pełen team-building?`,
    choices: (ctx) => [
      {
        id: 'party',
        label: 'Impreza drużynowa',
        hint: 'Budżet −, morale drużyny +',
      },
      {
        id: 'gift',
        label: `Prezent dla ${ctx.playerName}`,
        hint: 'Mały koszt, morale jubilata ++',
      },
      { id: 'lowkey', label: 'Cichy tort po treningu', hint: 'Morale +1 drużyny' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'party') {
        const cost = 2000 + Math.floor(rng() * 3001)
        const rounded = Math.round(cost / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: -rounded },
            { type: 'moraleTeam', delta: 3 },
            { type: 'morale', playerId: ctx.playerId, delta: 4 },
          ],
          summary: `Impreza OK (−${formatUsd(rounded)}). Atmosfera ↑.`,
          summaryEn: `Party OK (−${formatUsd(rounded)}). Atmosphere ↑.`,
        }
      }
      if (choiceId === 'gift') {
        return {
          effects: [
            { type: 'budget', delta: -1000 },
            { type: 'morale', playerId: ctx.playerId, delta: 6 },
          ],
          summary: `${ctx.playerName} dostaje prezent. Morale ↑↑.`,
          summaryEn: `${ctx.playerName} gets a gift. Morale ↑↑.`,
        }
      }
      return {
        effects: [
          { type: 'moraleTeam', delta: 1 },
          { type: 'morale', playerId: ctx.playerId, delta: 2 },
        ],
        summary: 'Tort, świeczka, zero dramatu. Miło.',
        summaryEn: 'Cake, candle, zero drama. Nice.',
      }
    },
  },

  {
    id: 'field_booking_war',
    weight: 0.8,
    canSpawn: () => true,
    pickContext() {
      return {}
    },
    title: () => 'Konflikt o rezerwację boiska',
    titleEn: () => 'Field booking conflict',
    body: () =>
      'Miejski obiekt pomylił terminy. Albo płacicie za slot awaryjny, albo trenicie na prowizorce.',
    choices: () => [
      { id: 'pay', label: 'Zapłać za awaryjny slot', hint: 'Budżet −, forma +' },
      { id: 'park', label: 'Trening w parku', hint: 'Forma −1, morale −1' },
      { id: 'video', label: 'Sesja video zamiast boiska', hint: 'Forma 0, morale +1 u liderów' },
    ],
    resolve(_ctx, choiceId, rng) {
      if (choiceId === 'pay') {
        const cost = 2500 + Math.floor(rng() * 2501)
        const rounded = Math.round(cost / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: -rounded },
            { type: 'formTeam', delta: 2 },
          ],
          summary: `Slot wykupiony (−${formatUsd(rounded)}). Trening pełnowartościowy.`,
          summaryEn: `Slot bought (−${formatUsd(rounded)}). Full-value training.`,
        }
      }
      if (choiceId === 'video') {
        return {
          effects: [{ type: 'moraleTeam', delta: 1 }],
          summary: 'Video session. Zero kilometrów, odrobina taktyki i spokoju.',
          summaryEn: 'Video session. Zero kilometers, a bit of tactics and calm.',
        }
      }
      return {
        effects: [
          { type: 'formTeam', delta: -1 },
          { type: 'moraleTeam', delta: -1 },
        ],
        summary: 'Park, dziury w murawie, słabe warunki. Forma i morale −.',
        summaryEn: 'Park, holes in the turf, poor conditions. Form and morale −.',
      }
    },
  },

  {
    id: 'dance_challenge',
    weight: 0.7,
    canSpawn: (_c, team) => (team?.players?.length ?? 0) >= 3,
    pickContext(roster, rng) {
      const crew = pickRandom(sortByOvrDesc(roster).slice(2), rng) ?? sortByOvrDesc(roster)[0]
      if (!crew) return null
      return { playerId: crew.id, playerName: playerName(crew) }
    },
    title: (ctx) => `${ctx.playerName} ciągnie ekipę w dance challenge`,
    titleEn: (ctx) => `${ctx.playerName} drags the crew into a dance challenge`,
    body: (ctx) =>
      `Trend na TikToku. ${ctx.playerName} chce, by cała drużyna nagrała choreo w jerseyach. Sponsorzy mogą polubić.`,
    choices: (ctx) => [
      {
        id: 'full',
        label: 'Cała drużyna w klipie',
        hint: 'Budżet + (PR), forma −1, morale +',
      },
      {
        id: 'star',
        label: `Tylko ${ctx.playerName}`,
        hint: 'Mały budżet +, morale gracza +',
      },
      { id: 'no', label: 'Blokada social media w sezonie', hint: 'Morale −' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'full') {
        const pay = 3000 + Math.floor(rng() * 4001)
        const rounded = Math.round(pay / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: rounded },
            { type: 'moraleTeam', delta: 3 },
            { type: 'formTeam', delta: -1 },
          ],
          summary: `Viralowy klip. +${formatUsd(rounded)} z PR, lekki koszt skupienia.`,
          summaryEn: `Viral clip. +${formatUsd(rounded)} from PR; light focus cost.`,
        }
      }
      if (choiceId === 'star') {
        return {
          effects: [
            { type: 'budget', delta: 1500 },
            { type: 'morale', playerId: ctx.playerId, delta: 4 },
          ],
          summary: `${ctx.playerName} robi solo. +${formatUsd(1500)}, reszta spokojna.`,
          summaryEn: `${ctx.playerName} goes solo. +${formatUsd(1500)}; the rest stay calm.`,
        }
      }
      return {
        effects: [
          { type: 'morale', playerId: ctx.playerId, delta: -4 },
          { type: 'moraleTeam', delta: -1 },
        ],
        summary: 'Blokada trendów. Młodsi niezadowoleni.',
        summaryEn: 'Trend ban. Younger players unhappy.',
      }
    },
  },

  {
    id: 'massage_gun_craze',
    weight: 0.75,
    canSpawn: () => true,
    pickContext(roster, rng) {
      const loud = pickRandom(sortByOvrDesc(roster), rng)
      return {
        playerId: loud?.id,
        playerName: loud ? playerName(loud) : 'Zawodnik',
      }
    },
    title: () => 'Szatnia chce pistolety do masażu',
    titleEn: () => 'Locker room wants massage guns',
    body: (ctx) =>
      `${ctx.playerName} pokazuje unboxing z Instagrama. Reszta chce to samo „dla regeneracji”.`,
    choices: () => [
      { id: 'buy', label: 'Kup zestaw dla drużyny', hint: 'Budżet −−, forma +' },
      { id: 'few', label: 'Kup 3 sztuki na zmianę', hint: 'Budżet −, forma lekko +' },
      { id: 'no', label: 'Wystarczy foam roller', hint: 'Morale −1' },
    ],
    resolve(_ctx, choiceId, rng) {
      if (choiceId === 'buy') {
        const cost = 4000 + Math.floor(rng() * 3001)
        const rounded = Math.round(cost / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: -rounded },
            { type: 'formTeam', delta: 3 },
            { type: 'moraleTeam', delta: 2 },
          ],
          summary: `Zestaw kupiony (−${formatUsd(rounded)}). Regeneracja ↑.`,
          summaryEn: `Set bought (−${formatUsd(rounded)}). Recovery ↑.`,
        }
      }
      if (choiceId === 'few') {
        return {
          effects: [
            { type: 'budget', delta: -2000 },
            { type: 'formTeam', delta: 1 },
          ],
          summary: `Trzy sztuki na zmiany (−${formatUsd(2000)}). Lepiej niż nic.`,
          summaryEn: `Three units to share (−${formatUsd(2000)}). Better than nothing.`,
        }
      }
      return {
        effects: [{ type: 'moraleTeam', delta: -1 }],
        summary: 'Foam roller zostaje królem. Lekkie rozczarowanie.',
        summaryEn: 'Foam roller remains king. Mild disappointment.',
      }
    },
  },

  {
    id: 'old_rival_media',
    weight: 0.7,
    canSpawn: () => true,
    pickContext(roster, rng) {
      const star = sortByOvrDesc(roster)[0]
      if (!star) return null
      return { starId: star.id, starName: playerName(star) }
    },
    title: () => 'Były rywal komentuje was w mediach',
    titleEn: () => 'Ex-rival talks about you in the media',
    body: (ctx) =>
      `Były zawodnik konkurencji mówi w podcastzie, że ${ctx.starName} „przeszacowany”. Szatnia czeka na reakcję.`,
    choices: (ctx) => [
      {
        id: 'clapback',
        label: `${ctx.starName} odpowiada ostro`,
        hint: 'Morale gwiazdy +, forma drużyny +/−',
      },
      {
        id: 'class',
        label: 'Klasyczna odpowiedź sztabu',
        hint: 'Morale drużyny +2',
      },
      { id: 'silence', label: 'Cisza radiowa', hint: 'Bez efektu / lekki −' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'clapback') {
        const fired = rng() > 0.4
        return {
          effects: [
            { type: 'morale', playerId: ctx.starId, delta: 5 },
            { type: 'formTeam', delta: fired ? 2 : -1 },
          ],
          summary: fired
            ? 'Ostra riposta podgrzała drużynę. Forma ↑.'
            : 'Riposta była, skupienie ucierpiało. Forma ↓.',
          summaryEn: fired
            ? 'A sharp clapback fired up the team. Form ↑.'
            : 'There was a clapback, but focus suffered. Form ↓.',
        }
      }
      if (choiceId === 'class') {
        return {
          effects: [{ type: 'moraleTeam', delta: 2 }],
          summary: 'Klasa powyżej hejtu. Morale drużyny +.',
          summaryEn: 'Class above the hate. Team morale +.',
        }
      }
      return {
        effects: [{ type: 'morale', playerId: ctx.starId, delta: -2 }],
        summary: `${ctx.starName} milczy, ale gotuje się w środku.`,
        summaryEn: `${ctx.starName} stays quiet but boils inside.`,
      }
    },
  },

  {
    id: 'flight_delay_tour',
    weight: 0.65,
    canSpawn: () => true,
    pickContext(roster, rng) {
      const group = sortByOvrDesc(roster).slice(0, 6)
      return {
        playerIds: group.map((p) => p.id),
        names: group.map((p) => playerName(p)),
      }
    },
    title: () => 'Opóźniony lot na turniej/ sparing',
    titleEn: () => 'Delayed flight to a tournament / scrimmage',
    body: (ctx) =>
      `Lot stoi. Na lotnisku siedzą m.in. ${ctx.names.slice(0, 3).join(', ')}. Decyzja: czekać, zmienić połączenie, czy odwołać?`,
    choices: () => [
      { id: 'rebook', label: 'Kup nowe bilety', hint: 'Budżet −−, forma ocalona' },
      { id: 'wait', label: 'Czekać na oryginał', hint: 'Forma −, morale −' },
      { id: 'cancel', label: 'Odwołaj wyjazd', hint: 'Budżet częściowo odzyskany, morale −' },
    ],
    resolve(ctx, choiceId, rng) {
      if (choiceId === 'rebook') {
        const cost = 5000 + Math.floor(rng() * 4001)
        const rounded = Math.round(cost / 1000) * 1000
        return {
          effects: [
            { type: 'budget', delta: -rounded },
            { type: 'moraleMany', playerIds: ctx.playerIds, delta: 2 },
          ],
          summary: `Nowe bilety (−${formatUsd(rounded)}). Ekipa dojeżdża względnie świeża.`,
          summaryEn: `New tickets (−${formatUsd(rounded)}). The group arrives relatively fresh.`,
        }
      }
      if (choiceId === 'cancel') {
        return {
          effects: [
            { type: 'budget', delta: 2000 },
            { type: 'moraleTeam', delta: -3 },
          ],
          summary: `Wyjazd odwołany. Zwrot ~${formatUsd(2000)}, frustracja w szatni.`,
          summaryEn: `Trip canceled. ~${formatUsd(2000)} refund; locker-room frustration.`,
        }
      }
      return {
        effects: [
          { type: 'formMany', playerIds: ctx.playerIds, delta: -3 },
          { type: 'moraleMany', playerIds: ctx.playerIds, delta: -2 },
        ],
        summary: 'Godziny na lotnisku. Forma i morale w dół.',
        summaryEn: 'Hours at the airport. Form and morale down.',
      }
    },
  },

  // ——— Zdarzenia kibicowskie ———
  {
    id: 'fan_open_letter',
    weight: 1.05,
    canSpawn: (_career, team) => getFanMood(team) <= 52 || teamHasFanTrait(team, 'loyal'),
    pickContext(_roster, _rng, team) {
      return fanContextBits(team)
    },
    title: (ctx) =>
      (ctx.fanTraits ?? []).includes('loyal')
        ? 'List otwarty fanów'
        : 'List otwarty niezadowolonych kibiców',
    titleEn: (ctx) =>
      (ctx.fanTraits ?? []).includes('loyal')
        ? 'Open letter from fans'
        : 'Open letter from restless fans',
    body: (ctx) => {
      const loyal = (ctx.fanTraits ?? []).includes('loyal')
      if (loyal) {
        return `Wierni kibice (${ctx.fanSizeLabel}) publikują list otwarty: „Trzymamy z wami”. Chcą jednak konkretów od sztabu — spotkania, planu, gestu.`
      }
      return `Kibice (${ctx.fanSizeLabel}, cechy: ${ctx.fanTraitNames}) publikują ostry list: wyniki, komunikacja, atmosfera. Media już cytują fragmenty.`
    },
    choices: (ctx) => [
      {
        id: 'meet',
        label: 'Spotkanie z przedstawicielami',
        hint: 'Nastrój kibiców +, morale drużyny +1',
      },
      {
        id: 'plan',
        label: 'Opublikuj plan na miesiąc',
        hint: 'Reputacja +2, nastrój +',
      },
      {
        id: 'ignore',
        label: 'Zignoruj szum',
        hint: (ctx.fanTraits ?? []).includes('demanding')
          ? 'Nastrój kibiców mocno −'
          : 'Nastrój kibiców −',
      },
    ],
    resolve(ctx, choiceId) {
      const critical = (ctx.fanTraits ?? []).includes('critical')
      const loyal = (ctx.fanTraits ?? []).includes('loyal')
      const demanding = (ctx.fanTraits ?? []).includes('demanding')
      if (choiceId === 'meet') {
        return {
          effects: [
            { type: 'fansMood', delta: loyal ? 8 : 6 },
            { type: 'moraleTeam', delta: 1 },
            { type: 'reputation', delta: 1 },
          ],
          summary: 'Spotkanie z kibicami uspokoiło trybuny. Relacja z fanami się poprawia.',
          summaryEn: 'Meeting fans calmed the stands. Fan relations improve.',
        }
      }
      if (choiceId === 'plan') {
        const effects = [
          { type: 'reputation', delta: 2 },
          { type: 'fansMood', delta: 5 },
        ]
        if (critical) effects.push({ type: 'moraleTeam', delta: -1 })
        return {
          effects,
          summary: 'Plan na papierze. Kibice doceniają komunikację, media też.',
          summaryEn: 'A plan on paper. Fans appreciate communication; media too.',
        }
      }
      return {
        effects: [
          { type: 'fansMood', delta: critical || demanding ? -9 : -5 },
          { type: 'reputation', delta: -1 },
        ],
        summary: 'Cisza ze strony klubu. List krąży dalej — nastrój trybun spada.',
        summaryEn: 'Club silence. The letter keeps circulating — terrace mood drops.',
      }
    },
  },

  {
    id: 'ultras_banner',
    weight: 0.95,
    canSpawn: (_career, team) =>
      teamHasFanTrait(team, 'ultras') ||
      teamHasFanTrait(team, 'vocal') ||
      teamHasFanTrait(team, 'passionate'),
    pickContext(_roster, _rng, team) {
      return fanContextBits(team)
    },
    title: () => 'Kontrowersyjna oprawa',
    titleEn: () => 'Controversial display',
    body: (ctx) =>
      `Grupa kibiców (${ctx.fanTraitNames}) chce dużej oprawy z hasłem na granicy fair play. Liga patrzy, trybuny się gotują.`,
    choices: () => [
      {
        id: 'approve',
        label: 'Zezwól na oprawę',
        hint: 'Nastrój kibiców +, reputacja ryzykowna',
      },
      {
        id: 'tone_down',
        label: 'Poproś o złagodzenie hasła',
        hint: 'Kompromis: nastrój +, reputacja +1',
      },
      {
        id: 'ban',
        label: 'Zablokuj oprawę',
        hint: 'Reputacja +, nastrój ultrasów −',
      },
    ],
    resolve(ctx, choiceId) {
      const ultras = (ctx.fanTraits ?? []).includes('ultras')
      const fair = (ctx.fanTraits ?? []).includes('fair')
      if (choiceId === 'approve') {
        return {
          effects: [
            { type: 'fansMood', delta: ultras ? 10 : 7 },
            { type: 'reputation', delta: fair ? -4 : -2 },
            { type: 'moraleTeam', delta: 2 },
          ],
          summary: 'Oprawa przeszła. Trybuny w euforii, ale liga i część mediów marszczą brwi.',
          summaryEn: 'The display went ahead. Stands euphoric, but the league and some media frown.',
        }
      }
      if (choiceId === 'tone_down') {
        return {
          effects: [
            { type: 'fansMood', delta: 4 },
            { type: 'reputation', delta: 1 },
          ],
          summary: 'Hasło złagodzono. Kibice trochę pomrukują, ale klimat zostaje.',
          summaryEn: 'Slogan softened. Fans grumble a bit, but the vibe stays.',
        }
      }
      return {
        effects: [
          { type: 'fansMood', delta: ultras ? -10 : -6 },
          { type: 'reputation', delta: 3 },
          { type: 'moraleTeam', delta: -1 },
        ],
        summary: 'Oprawa zablokowana. Klub wygląda „porządnie”, trybuny — mniej.',
        summaryEn: 'Display blocked. Club looks ‘proper’; the stands — less so.',
      }
    },
  },

  {
    id: 'season_ticket_drive',
    weight: 0.9,
    canSpawn: (_career, team) => getFanSize(team) >= 3500,
    pickContext(_roster, _rng, team) {
      return fanContextBits(team)
    },
    title: () => 'Kampania karnetów',
    titleEn: () => 'Season-ticket drive',
    body: (ctx) =>
      `Marketing chce kampanii karnetów. Fanbase: ${ctx.fanSizeLabel}. Duży zasięg = szansa na kasę i nowych kibiców — albo flop.`,
    choices: () => [
      {
        id: 'aggressive',
        label: 'Agresywna kampania',
        hint: '−$4k, szansa na budżet + i fanbase +',
      },
      {
        id: 'steady',
        label: 'Spokojna promocja',
        hint: '−$1.5k, stabilny wzrost',
      },
      { id: 'skip', label: 'Odłóż na później', hint: 'Bez zmian / lekki − nastroju' },
    ],
    resolve(ctx, choiceId, rng) {
      const festive = (ctx.fanTraits ?? []).includes('festive')
      const fickle = (ctx.fanTraits ?? []).includes('fickle')
      if (choiceId === 'aggressive') {
        const boom = rng() < (festive ? 0.62 : 0.48)
        if (boom) {
          const gain = 400 + Math.floor(rng() * 900)
          const pay = 9000 + Math.floor(rng() * 8000)
          const rounded = Math.round(pay / 500) * 500
          return {
            effects: [
              { type: 'budget', delta: -4000 + rounded },
              { type: 'fansSize', delta: gain },
              { type: 'fansMood', delta: 6 },
              { type: 'reputation', delta: 2 },
            ],
            summary: `Kampania wypaliła: +${gain} kibiców i zysk netto ~${formatUsd(rounded - 4000)}.`,
            summaryEn: `Campaign worked: +${gain} fans and net profit ~${formatUsd(rounded - 4000)}.`,
          }
        }
        return {
          effects: [
            { type: 'budget', delta: -4000 },
            { type: 'fansMood', delta: fickle ? -4 : -2 },
          ],
          summary: 'Kampania poszła w próżnię. Budżet −$4k, trybuny lekko zirytowane szumem.',
          summaryEn: 'Campaign went nowhere. Budget −$4k; stands mildly annoyed by the noise.',
        }
      }
      if (choiceId === 'steady') {
        const gain = 120 + Math.floor(rng() * 280)
        return {
          effects: [
            { type: 'budget', delta: 2000 },
            { type: 'fansSize', delta: gain },
            { type: 'fansMood', delta: 3 },
          ],
          summary: `Spokojna promocja: +${gain} kibiców i niewielki zysk netto.`,
          summaryEn: `Steady promo: +${gain} fans and a small net profit.`,
        }
      }
      return {
        effects: [{ type: 'fansMood', delta: -2 }],
        summary: 'Kampania odłożona. Część fanów czuje, że klub śpi.',
        summaryEn: 'Campaign postponed. Some fans feel the club is asleep.',
      }
    },
  },

  {
    id: 'fan_boycott_threat',
    weight: 1,
    canSpawn: (_career, team) =>
      getFanMood(team) <= 42 ||
      teamHasFanTrait(team, 'demanding') ||
      teamHasFanTrait(team, 'critical'),
    pickContext(_roster, _rng, team) {
      return fanContextBits(team)
    },
    title: () => 'Zapowiedź bojkotu',
    titleEn: () => 'Boycott threat',
    body: (ctx) =>
      `Część kibiców (${ctx.fanTraitNames}) grozi bojkotem najbliższego meczu. Nastrój trybun: ${ctx.fanMood}/100. Trzeba zareagować.`,
    choices: () => [
      {
        id: 'gesture',
        label: 'Gest dobrej woli (zniżki / spotkanie)',
        hint: '−$2k, nastrój ++',
      },
      {
        id: 'hardline',
        label: 'Twarda linia — „gramy dla tych, którzy zostają”',
        hint: 'Morale drużyny +, nastrój kibiców −',
      },
      {
        id: 'mediate',
        label: 'Mediator / spokojna rozmowa',
        hint: 'Nastrój +, reputacja +1',
      },
    ],
    resolve(ctx, choiceId) {
      const loyal = (ctx.fanTraits ?? []).includes('loyal')
      const demanding = (ctx.fanTraits ?? []).includes('demanding')
      if (choiceId === 'gesture') {
        return {
          effects: [
            { type: 'budget', delta: -2000 },
            { type: 'fansMood', delta: demanding ? 9 : 7 },
            { type: 'reputation', delta: 1 },
          ],
          summary: 'Gest uspokoił nastroje. Bojkot odwołany — na razie.',
          summaryEn: 'The gesture calmed moods. Boycott called off — for now.',
        }
      }
      if (choiceId === 'hardline') {
        return {
          effects: [
            { type: 'moraleTeam', delta: 3 },
            { type: 'fansMood', delta: loyal ? -4 : -9 },
            { type: 'fansSize', delta: loyal ? -40 : -120 },
            { type: 'reputation', delta: -1 },
          ],
          summary: 'Twarda linia. Szatnia czuje wsparcie sztabu, trybuny — mniej.',
          summaryEn: 'Hard line. Locker room feels staff support; the stands — less.',
        }
      }
      return {
        effects: [
          { type: 'fansMood', delta: 5 },
          { type: 'reputation', delta: 1 },
          { type: 'moraleTeam', delta: 1 },
        ],
        summary: 'Mediator zrobił robotę. Temperatura na trybunach spada.',
        summaryEn: 'The mediator did the job. Terrace temperature drops.',
      }
    },
  },

  {
    id: 'away_day_caravan',
    weight: 0.9,
    canSpawn: (_career, team) =>
      teamHasFanTrait(team, 'passionate') ||
      teamHasFanTrait(team, 'vocal') ||
      getFanSize(team) >= 5000,
    pickContext(roster, _rng, team) {
      const base = fanContextBits(team)
      const star = sortByOvrDesc(roster)[0]
      return {
        ...base,
        starId: star?.id ?? null,
        starName: star ? playerName(star) : null,
      }
    },
    title: () => 'Wyjazdowa karawana',
    titleEn: () => 'Away-day caravan',
    body: (ctx) =>
      `Kibice chcą zorganizować duży wyjazd: busy, śpiewy, oprawa. Fanbase ${ctx.fanSizeLabel}. Proszą o wsparcie logistyczne.`,
    choices: (ctx) => [
      {
        id: 'sponsor',
        label: 'Dołóż do busów',
        hint: '−$2.5k, nastrój +, morale drużyny +',
      },
      {
        id: 'star',
        label: ctx.starName
          ? `Wyślij ${ctx.starName} na powitanie`
          : 'Wyślij gwiazdę na powitanie',
        hint: 'Morale gwiazdy −, nastrój kibiców ++',
      },
      { id: 'decline', label: 'Nie wspieraj wyjazdu', hint: 'Nastrój −' },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'sponsor') {
        return {
          effects: [
            { type: 'budget', delta: -2500 },
            { type: 'fansMood', delta: 8 },
            { type: 'moraleTeam', delta: 3 },
            { type: 'reputation', delta: 1 },
          ],
          summary: 'Karawana ruszyła. Atmosfera wyjazdowa podbija morale składu.',
          summaryEn: 'The caravan rolled. Away-day atmosphere lifts squad morale.',
        }
      }
      if (choiceId === 'star' && ctx.starId) {
        return {
          effects: [
            { type: 'morale', playerId: ctx.starId, delta: -3 },
            { type: 'fansMood', delta: 10 },
            { type: 'fansSize', delta: 80 },
            { type: 'reputation', delta: 2 },
          ],
          summary: `${ctx.starName} przywitał karawanę. Kibice zachwyceni, gwiazda trochę zmęczona PR-em.`,
          summaryEn: `${ctx.starName} greeted the caravan. Fans delighted; the star a bit PR-tired.`,
        }
      }
      return {
        effects: [{ type: 'fansMood', delta: -5 }],
        summary: 'Bez wsparcia klubu wyjazd był skromniejszy. Trybuny to zapamiętają.',
        summaryEn: 'Without club support the trip was smaller. The stands will remember.',
      }
    },
  },

  {
    id: 'family_fan_day',
    weight: 0.85,
    canSpawn: (_career, team) =>
      teamHasFanTrait(team, 'family') || teamHasFanTrait(team, 'festive'),
    pickContext(roster, _rng, team) {
      const base = fanContextBits(team)
      const sorted = sortByOvrDesc(roster)
      const youth = sorted.slice(-2)
      return {
        ...base,
        youthIds: youth.map((p) => p.id),
        youthNames: youth.map((p) => playerName(p)).join(', '),
      }
    },
    title: () => 'Dzień rodzinny na trybunach',
    titleEn: () => 'Family day in the stands',
    body: (ctx) =>
      `Rodzinna część fanbase (${ctx.fanTraitNames}) chce dnia z warsztatami dla dzieci i zdjęciami z zawodnikami — np. ${ctx.youthNames || 'młodszymi graczami'}.`,
    choices: () => [
      {
        id: 'full',
        label: 'Zorganizuj pełny dzień rodzinny',
        hint: '−$2k, fanbase +, nastrój +, reputacja +3',
      },
      {
        id: 'photo',
        label: 'Tylko sesja zdjęciowa',
        hint: '−$500, nastrój +',
      },
      { id: 'skip', label: 'Odmów', hint: 'Nastrój −, reputacja −1' },
    ],
    resolve(ctx, choiceId) {
      if (choiceId === 'full') {
        return {
          effects: [
            { type: 'budget', delta: -2000 },
            { type: 'fansMood', delta: 8 },
            { type: 'fansSize', delta: 150 },
            { type: 'reputation', delta: 3 },
            { type: 'formMany', playerIds: ctx.youthIds, delta: -1 },
            { type: 'moraleMany', playerIds: ctx.youthIds, delta: 3 },
          ],
          summary:
            'Dzień rodzinny przyciągnął nowych kibiców. Młodsi zawodnicy czują się bohaterami.',
          summaryEn: 'Family day drew new fans. Younger players feel like heroes.',
        }
      }
      if (choiceId === 'photo') {
        return {
          effects: [
            { type: 'budget', delta: -500 },
            { type: 'fansMood', delta: 4 },
            { type: 'reputation', delta: 1 },
          ],
          summary: 'Krótka sesja z rodzinami. Miło, bez dużego kosztu.',
          summaryEn: 'A short session with families. Nice, without big cost.',
        }
      }
      return {
        effects: [
          { type: 'fansMood', delta: -4 },
          { type: 'reputation', delta: -1 },
        ],
        summary: 'Odmowa dnia rodzinnego — część fanów czuje się pominięta.',
        summaryEn: 'Refusing family day — some fans feel left out.',
      }
    },
  },

  {
    id: 'chant_tradition_clash',
    weight: 0.8,
    canSpawn: (_career, team) =>
      teamHasFanTrait(team, 'traditional') || teamHasFanTrait(team, 'festive'),
    pickContext(_roster, _rng, team) {
      return fanContextBits(team)
    },
    title: () => 'Spór o pieśni klubowe',
    titleEn: () => 'Club chant dispute',
    body: (ctx) =>
      `Część kibiców chce nowych, „imprezowych” pieśni; tradycjonaliści bronią klasyki. Fanbase (${ctx.fanTraitNames}) czeka na sygnał z klubu.`,
    choices: () => [
      {
        id: 'tradition',
        label: 'Broń tradycyjnych pieśni',
        hint: 'Tradycjonaliści +, imprezowicze −',
      },
      {
        id: 'new',
        label: 'Wspieraj nowe pieśni',
        hint: 'Imprezowicze +, tradycja −',
      },
      {
        id: 'both',
        label: '„Miejsce dla obu”',
        hint: 'Kompromis, lekki boost nastroju',
      },
    ],
    resolve(ctx, choiceId) {
      const traditional = (ctx.fanTraits ?? []).includes('traditional')
      const festive = (ctx.fanTraits ?? []).includes('festive')
      if (choiceId === 'tradition') {
        return {
          effects: [
            { type: 'fansMood', delta: traditional ? 6 : festive ? -3 : 2 },
            { type: 'reputation', delta: 1 },
            { type: 'moraleTeam', delta: 1 },
          ],
          summary: 'Klub staje po stronie tradycji. Część trybun wiwatuje, część kręci nosem.',
          summaryEn: 'The club sides with tradition. Part of the stands cheers; part turns up their nose.',
        }
      }
      if (choiceId === 'new') {
        return {
          effects: [
            { type: 'fansMood', delta: festive ? 7 : traditional ? -4 : 3 },
            { type: 'fansSize', delta: festive ? 100 : 40 },
            { type: 'reputation', delta: 1 },
          ],
          summary: 'Nowe pieśni weszły do playlisty. Młodsza publika zadowolona.',
          summaryEn: 'New chants hit the playlist. Younger crowds are happy.',
        }
      }
      return {
        effects: [
          { type: 'fansMood', delta: 4 },
          { type: 'reputation', delta: 2 },
        ],
        summary: 'Kompromis: stare i nowe. Trybuny nie są w 100% zgodne, ale atmosfera OK.',
        summaryEn: 'Compromise: old and new. Stands aren’t 100% aligned, but the vibe is OK.',
      }
    },
  },

  {
    id: 'fan_club_donation',
    weight: 0.75,
    canSpawn: (_career, team) =>
      (teamHasFanTrait(team, 'loyal') && getFanSize(team) >= 2500) || getFanMood(team) >= 72,
    pickContext(roster, _rng, team) {
      const base = fanContextBits(team)
      const sorted = sortByOvrDesc(roster)
      const mid = sorted[Math.min(3, Math.max(0, sorted.length - 1))]
      const pick = mid ?? sorted[0]
      return {
        ...base,
        playerId: pick?.id ?? null,
        playerName: pick ? playerName(pick) : 'skład',
      }
    },
    title: () => 'Zrzutka kibicowska',
    titleEn: () => 'Fan club donation',
    body: (ctx) =>
      `Oficjalny fan club (${ctx.fanSizeLabel} wokół klubu) zbiera kasę na sprzęt dla akademii / rezerw. Proszą o współudział i obecność ${ctx.playerName}.`,
    choices: (ctx) =>
      [
        {
          id: 'match',
          label: 'Dorównaj zrzutce',
          hint: '−$3k, reputacja +4, nastrój ++',
        },
        {
          id: 'token',
          label: 'Symboliczna dopłata',
          hint: '−$800, nastrój +',
        },
        ctx.playerId
          ? {
              id: 'appear',
              label: `Tylko obecność ${ctx.playerName}`,
              hint: 'Morale zawodnika +, nastrój +',
            }
          : null,
      ].filter(Boolean),
    resolve(ctx, choiceId) {
      if (choiceId === 'match') {
        return {
          effects: [
            { type: 'budget', delta: -3000 },
            { type: 'reputation', delta: 4 },
            { type: 'fansMood', delta: 9 },
            { type: 'fansSize', delta: 200 },
            { type: 'moraleTeam', delta: 2 },
          ],
          summary: 'Klub dorównał zrzutce. Lojalność kibiców i prestiż mocno w górę.',
          summaryEn: 'The club matched the fundraiser. Fan loyalty and prestige jump.',
        }
      }
      if (choiceId === 'appear' && ctx.playerId) {
        return {
          effects: [
            { type: 'morale', playerId: ctx.playerId, delta: 4 },
            { type: 'fansMood', delta: 5 },
            { type: 'reputation', delta: 1 },
          ],
          summary: `${ctx.playerName} pojawił się na zbiórce. Gest bez dużego kosztu — dobrze przyjęty.`,
          summaryEn: `${ctx.playerName} showed up at the collection. Low-cost gesture — well received.`,
        }
      }
      return {
        effects: [
          { type: 'budget', delta: -800 },
          { type: 'fansMood', delta: 4 },
          { type: 'reputation', delta: 2 },
        ],
        summary: 'Symboliczna dopłata. Kibice doceniają gest, nawet jeśli nie jest to jackpot.',
        summaryEn: 'Token top-up. Fans appreciate the gesture even if it isn’t a jackpot.',
      }
    },
  },
]

function templateById(id) {
  return RANDOM_EVENT_TEMPLATES.find((t) => t.id === id) ?? null
}

/** Runtime EN title for saved messages that lack titleEn. */
export function randomEventTitleEn(templateId, ctx) {
  const template = templateById(templateId)
  if (!template || typeof template.titleEn !== 'function') return null
  try {
    return template.titleEn(ctx ?? {})
  } catch {
    return null
  }
}

function eligibleTemplates(career, team) {
  return RANDOM_EVENT_TEMPLATES.filter((t) => {
    if (typeof t.canSpawn === 'function') {
      try {
        return !!t.canSpawn(career, team)
      } catch {
        return false
      }
    }
    return true
  })
}

function pickWeighted(templates, rng) {
  if (!templates.length) return null
  const total = templates.reduce((s, t) => s + (t.weight ?? 1), 0)
  let roll = rng() * total
  for (const t of templates) {
    roll -= t.weight ?? 1
    if (roll <= 0) return t
  }
  return templates[templates.length - 1]
}

/**
 * Buduje jedną wiadomość inbox z wylosowanego szablonu (albo null).
 */
export function pickRandomEventMessage(career, { date = null, rng = null } = {}) {
  const simDate = date ?? career?.league?.currentDate
  if (!career?.world || !simDate) return null

  const team = worldTeamById(career.world, career.playerTeamId)
  if (!team?.players?.length) return null

  const rand =
    rng ??
    mulberry32(
      hashSeed(
        `${career.id}|${career.seasonIndex}|${simDate}|random-events|${(career.inbox ?? []).length}`,
      ),
    )

  if (rand() > SPAWN_CHANCE) return null

  const pool = eligibleTemplates(career, team)
  const template = pickWeighted(pool, rand)
  if (!template) return null

  const ctx = template.pickContext(team.players, rand, team)
  if (!ctx) return null

  const choices = localizeEventChoices(template.id, template.choices(ctx))
  if (!choices?.length) return null

  const bodyEn =
    (typeof template.bodyEn === 'function' ? template.bodyEn(ctx) : null) ??
    randomEventBodyEn(template.id, ctx)

  return {
    id: newMessageId(RANDOM_EVENT_TYPE),
    type: RANDOM_EVENT_TYPE,
    createdAt: new Date().toISOString(),
    date: simDate,
    seasonIndex: career.seasonIndex ?? null,
    seasonYear: career.seasonYear ?? null,
    read: false,
    title: template.title(ctx),
    body: template.body(ctx),
    ...(typeof template.titleEn === 'function' ? { titleEn: template.titleEn(ctx) } : {}),
    ...(bodyEn ? { bodyEn } : {}),
    payload: {
      kind: 'decision',
      templateId: template.id,
      status: 'pending',
      context: ctx,
      choices,
    },
  }
}

/**
 * Aplikuje wybór gracza: mutuje sklonowany world + aktualizuje wiadomość.
 * @returns {{ ok: boolean, error?: string, errorEn?: string, world?: object, nextInbox?: object[], outcomeSummary?: string, outcomeSummaryEn?: string }}
 */
export function applyRandomEventChoice(career, messageId, choiceId) {
  if (!career || !messageId || !choiceId) {
    return {
      ok: false,
      error: 'Brak danych decyzji',
      errorEn: 'Missing decision data',
    }
  }

  const inbox = Array.isArray(career.inbox) ? career.inbox : []
  const message = inbox.find((m) => m.id === messageId)
  if (!message || message.type !== RANDOM_EVENT_TYPE) {
    return {
      ok: false,
      error: 'Nie znaleziono zdarzenia',
      errorEn: 'Event not found',
    }
  }

  const payload = message.payload ?? {}
  if (payload.kind !== 'decision') {
    return {
      ok: false,
      error: 'To nie jest zdarzenie decyzyjne',
      errorEn: 'Not a decision event',
    }
  }
  if (payload.status === 'resolved') {
    return {
      ok: false,
      error: 'Zdarzenie już rozstrzygnięte',
      errorEn: 'Event already resolved',
    }
  }

  const template = templateById(payload.templateId)
  if (!template) {
    return {
      ok: false,
      error: 'Nieznany szablon zdarzenia',
      errorEn: 'Unknown event template',
    }
  }

  const choice = (payload.choices ?? []).find((c) => c.id === choiceId)
  if (!choice) {
    return {
      ok: false,
      error: 'Nieprawidłowy wybór',
      errorEn: 'Invalid choice',
    }
  }

  const ctx = payload.context ?? {}
  const rng = mulberry32(hashSeed(`${message.id}|${choiceId}|resolve`))
  const resolved = template.resolve(ctx, choiceId, rng)
  const { effects, summary } = resolved
  const summaryEn = resolved.summaryEn ?? summary

  const world = structuredClone(career.world)
  const team = worldTeamById(world, career.playerTeamId)
  if (!team) {
    return {
      ok: false,
      error: 'Brak drużyny gracza',
      errorEn: 'Player team not found',
    }
  }

  const { bits: effectBits, bitsEn: effectBitsEn } = applyEffects(team, effects)
  const outcomeSummary =
    summary + (effectBits.length ? ` (${effectBits.join(', ')})` : '')
  const outcomeSummaryEn =
    summaryEn + (effectBitsEn.length ? ` (${effectBitsEn.join(', ')})` : '')

  const nextInbox = inbox.map((m) => {
    if (m.id !== messageId) return m
    return {
      ...m,
      read: true,
      payload: {
        ...payload,
        status: 'resolved',
        chosenId: choiceId,
        chosenLabel: choice.label,
        ...(choice.labelEn ? { chosenLabelEn: choice.labelEn } : {}),
        outcomeSummary,
        outcomeSummaryEn,
      },
    }
  })

  return {
    ok: true,
    world,
    nextInbox,
    outcomeSummary,
    outcomeSummaryEn,
  }
}

/**
 * Alias zgodny z planem — resolve decyzji w skrzynce.
 */
export function resolveInboxDecision(career, messageId, choiceId) {
  const result = applyRandomEventChoice(career, messageId, choiceId)
  if (!result.ok) {
    return { ok: false, error: result.error, errorEn: result.errorEn }
  }
  return {
    ok: true,
    careerPatch: {
      world: result.world,
      inbox: result.nextInbox,
    },
    outcomeSummary: result.outcomeSummary,
    outcomeSummaryEn: result.outcomeSummaryEn,
  }
}

export { hashSeed as randomEventHashSeed, mulberry32 as randomEventRng }
