/**
 * Przemówienia w szatni (przed/po meczu) — lekki system: wybór tonu wypowiedzi,
 * krótkie reakcje zawodników wg cech charakteru, mały modyfikator morale.
 */

import { getOverallRating } from './playerStats.js'
import { getTraitMods, getPlayerTraits } from './playerTraits.js'
import { ensurePlayerMorale, getPlayerMorale, MORALE_MIN, MORALE_MAX } from './playerMorale.js'

function clampMorale(n) {
  return Math.max(MORALE_MIN, Math.min(MORALE_MAX, Math.round(n)))
}

/** Zgrubny wpływ zawodnika na szatnię: OVR + aura z cech (leader/vocal/loner itd). */
function influenceScore(player) {
  const ovr = getOverallRating(player.skills)
  const aura = getTraitMods(player).teamAuraEmit ?? 0
  return ovr + aura * 10
}

export function rankRosterByInfluence(players) {
  return [...(players ?? [])].sort((a, b) => influenceScore(b) - influenceScore(a))
}

/** Mapa playerId -> 'leader' | 'influential' | 'other'. */
export function getInfluenceTiers(players) {
  const ranked = rankRosterByInfluence(players)
  const n = ranked.length
  const leaderCount = Math.max(1, Math.round(n * 0.12))
  const influentialCount = Math.max(leaderCount, Math.round(n * 0.4))
  const tierById = new Map()
  ranked.forEach((p, i) => {
    tierById.set(p.id, i < leaderCount ? 'leader' : i < influentialCount ? 'influential' : 'other')
  })
  return tierById
}

export const TEAM_TALK_STATEMENTS = {
  pre: [
    {
      id: 'pre_calm',
      tone: 'calm',
      textPl: 'Trzymajcie się planu, grajcie swój styl — bez pośpiechu.',
      textEn: 'Stick to the game plan, play your style — no need to rush.',
      favoredTraits: ['professional', 'composed', 'stoic', 'disciplined'],
      disfavoredTraits: ['nervous', 'anxious', 'glory_hunter'],
    },
    {
      id: 'pre_confident',
      tone: 'confident',
      textPl: 'Jesteśmy tu, żeby wygrać. Wierzę w każdego z was.',
      textEn: "We're here to win. I believe in every one of you.",
      favoredTraits: ['confident', 'leader', 'competitor', 'vocal'],
      disfavoredTraits: ['fragile_ego', 'nervous', 'shy'],
    },
    {
      id: 'pre_aggressive',
      tone: 'aggressive',
      textPl: 'Wychodzimy ostro od pierwszego punktu. Żadnej taryfy ulgowej.',
      textEn: 'We come out hot from point one. No mercy today.',
      favoredTraits: ['competitor', 'determined', 'hot_headed', 'chip_on_shoulder'],
      disfavoredTraits: ['nervous', 'fragile_ego', 'professional', 'relaxed'],
    },
    {
      id: 'pre_underdog',
      tone: 'humble',
      textPl: 'Nikt na nas nie stawia — więc grajmy razem i zaskoczmy wszystkich.',
      textEn: "Nobody's picking us — so let's play together and surprise everyone.",
      favoredTraits: ['team_first', 'professional', 'loyal'],
      disfavoredTraits: ['confident', 'diva', 'selfish'],
    },
    {
      id: 'pre_relaxed',
      tone: 'relaxed',
      textPl: 'To tylko kolejny mecz — grajcie luźno i się dobrze bawcie.',
      textEn: "It's just another game — play loose and enjoy it.",
      favoredTraits: ['relaxed', 'party_animal', 'showman', 'content'],
      disfavoredTraits: ['professional', 'competitor', 'perfectionist'],
    },
  ],
  post: [
    {
      id: 'post_win_praise',
      tone: 'praise',
      outcome: 'win',
      textPl: 'Świetna robota — cieszcie się tym zwycięstwem, zasłużyliście.',
      textEn: 'Great job out there — enjoy this win, you earned it.',
      favoredTraits: ['confident', 'showman', 'team_first', 'content'],
      disfavoredTraits: ['professional', 'perfectionist', 'competitor'],
    },
    {
      id: 'post_win_hungry',
      tone: 'demanding',
      outcome: 'win',
      textPl: 'Dobry wynik, ale widziałem za dużo luzu w drugiej połowie. Bez samozadowolenia.',
      textEn: 'Good result, but I saw too much slack in the second half. No complacency.',
      favoredTraits: ['competitor', 'professional', 'determined', 'coachable'],
      disfavoredTraits: ['complacent', 'diva', 'fragile_ego'],
    },
    {
      id: 'post_loss_supportive',
      tone: 'supportive',
      outcome: 'loss',
      textPl: 'Ciężki wynik, ale trzymaliście się razem. Wyciągniemy wnioski i idziemy dalej.',
      textEn: 'Tough result, but you stuck together. We learn from this and move on.',
      favoredTraits: ['fragile_ego', 'nervous', 'loyal', 'team_first'],
      disfavoredTraits: ['competitor', 'hot_headed', 'chip_on_shoulder'],
    },
    {
      id: 'post_loss_critical',
      tone: 'critical',
      outcome: 'loss',
      textPl: 'To było za mało — na treningu wracamy do podstaw, bo dzisiaj ich zabrakło.',
      textEn: "That wasn't good enough — back to basics in training, because they were missing today.",
      favoredTraits: ['professional', 'competitor', 'determined', 'coachable'],
      disfavoredTraits: ['fragile_ego', 'nervous', 'diva'],
    },
    {
      id: 'post_neutral',
      tone: 'measured',
      outcome: 'any',
      textPl: 'Przeanalizujemy ten mecz spokojnie na treningu, jak zawsze.',
      textEn: "We'll go through this match calmly at training, like always.",
      favoredTraits: ['professional', 'stoic', 'composed'],
      disfavoredTraits: [],
    },
  ],
}

/** Zestaw wypowiedzi dostępnych dla danego etapu/wyniku meczu. */
export function statementsFor(timing, outcome = null) {
  const pool = TEAM_TALK_STATEMENTS[timing] ?? []
  if (timing !== 'post') return pool
  return pool.filter((s) => s.outcome === 'any' || s.outcome === outcome)
}

export function statementText(statement, lang = 'pl') {
  if (!statement) return ''
  return lang === 'en' ? (statement.textEn ?? statement.textPl) : (statement.textPl ?? statement.textEn)
}

/** Reakcja jednego zawodnika na wybraną wypowiedź: sentyment + cecha, która o tym zdecydowała. */
function reactionForPlayer(player, statement) {
  const traits = getPlayerTraits(player)
  const favored = traits.filter((t) => statement.favoredTraits?.includes(t))
  const disfavored = traits.filter((t) => statement.disfavoredTraits?.includes(t))
  let sentiment = 'neutral'
  if (favored.length > disfavored.length) sentiment = 'positive'
  else if (disfavored.length > favored.length) sentiment = 'negative'
  if (sentiment === 'neutral') {
    const morale = getPlayerMorale(player)
    if (morale >= 82) sentiment = 'positive'
    else if (morale <= 45) sentiment = 'negative'
  }
  return {
    playerId: player.id,
    sentiment,
    trait: favored[0] ?? disfavored[0] ?? null,
  }
}

export function computeStatementReactions(players, statement) {
  if (!statement) return []
  return (players ?? []).map((p) => reactionForPlayer(p, statement))
}

const SENTIMENT_MORALE_DELTA = { positive: 4, neutral: 0, negative: -4 }

/** Mutuje player.morale wg obliczonych reakcji (podobnie jak applyMoraleAfterMatch). */
export function applyTeamTalkEffect(players, reactions) {
  const byId = new Map((reactions ?? []).map((r) => [r.playerId, r]))
  for (const player of players ?? []) {
    ensurePlayerMorale(player)
    const r = byId.get(player.id)
    const delta = r ? (SENTIMENT_MORALE_DELTA[r.sentiment] ?? 0) : 0
    if (delta === 0) continue
    player.morale = clampMorale(player.morale + delta)
  }
}

const REACTION_LINES = {
  positive: {
    pl: [
      'Kiwa głową z aprobatą.',
      'Wygląda na zmotywowanego.',
      'Uśmiecha się, gotowy do gry.',
      'Klaszcze, podbudowany.',
    ],
    en: [
      'Nods in approval.',
      'Looks fired up.',
      'Smiles, ready to go.',
      'Claps, feeling good about it.',
    ],
  },
  neutral: {
    pl: ['Słucha bez większych emocji.', 'Kiwa głową neutralnie.', 'Przyjmuje to do wiadomości.'],
    en: ['Listens without much reaction.', 'Nods neutrally.', 'Takes it in stride.'],
  },
  negative: {
    pl: [
      'Marszczy brwi.',
      'Nie wygląda na przekonanego.',
      'Wymienia spojrzenia z kolegą z drużyny.',
      'Wzdycha cicho.',
    ],
    en: [
      'Frowns slightly.',
      "Doesn't look convinced.",
      'Trades a look with a teammate.',
      'Sighs quietly.',
    ],
  },
}

export function reactionLine(sentiment, lang = 'pl') {
  const pool = REACTION_LINES[sentiment]?.[lang] ?? REACTION_LINES[sentiment]?.pl ?? []
  if (!pool.length) return ''
  return pool[Math.floor(Math.random() * pool.length)]
}
