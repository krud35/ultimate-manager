/**
 * Newsy transferowe Ultiworld — dwie rodziny materiałów:
 *
 * 1. Faktyczne ruchy — deterministycznie z `career.transferLog` / `career.loanLog`.
 *    Kursor po niepokrytych wpisach; nadmiar (burst off-season, przewijanie
 *    kalendarza) schodzi do jednego artykułu zbiorczego zamiast zalewać feed.
 * 2. Plotki — zainteresowanie klubów zawodnikiem, liczone tym samym modelem
 *    (`aiIncomingInterestChance`), którym realnie kieruje się rynek AI. Plotka
 *    nie zmienia stanu gry; jeśli jednak transfer dojdzie do skutku, artykuł
 *    o nim dostaje nawiązanie do wcześniejszego tekstu.
 *
 * Moduł zwraca *specyfikacje* artykułów w tym samym kształcie, co `WORLD_EVENTS`
 * (`{ article, inboxHint?, inboxHintEn? }`) — `ultiworld.js` opakowuje je
 * w `makeArticle()` i buduje wiadomości do skrzynki.
 */

import { getPlayerFullName } from '../data/mockPlayers.js'
import { getOverallRating } from '../models/playerStats.js'
import { getPlayerForm } from '../models/playerForm.js'
import { getPlayerMorale } from '../models/playerMorale.js'
import { parseISODate } from '../league/seasonCalendar.js'
import { worldTeamById, worldTeamsList, findWorldPlayerById } from './worldState.js'
import {
  aiIncomingInterestChance,
  classifyTransferTarget,
  computeAskPrice,
  formatUsd,
  formatUsdCompact,
  getTransferBudget,
  getTransferWindowState,
  refreshPlayerMarketValue,
} from './transfers/index.js'

/** Ile osobnych artykułów o dealach może wyjść w jednym ticku (reszta → zbiorczy). */
const MAX_DEAL_ARTICLES_PER_TICK = 2
/** Od ilu niepokrytych ruchów opłaca się artykuł zbiorczy. */
const ROUNDUP_MIN_DEALS = 3
/** Ile ruchów wymieniamy w zbiorczym. */
const ROUNDUP_MAX_LINES = 6
const COVERED_TRANSFER_KEYS_MAX = 400
const COVERED_LOAN_KEYS_MAX = 200

const RUMOR_BASE_CHANCE = 0.1
const RUMOR_WINDOW_MULT = 2.2
const RUMOR_PRE_WINDOW_MULT = 1.5
/** Ten sam zawodnik nie wraca do plotek częściej niż raz na tyle dni. */
const RUMOR_PLAYER_COOLDOWN_DAYS = 10
const RUMORS_MAX = 14
/** Po tylu dniach bez transferu nierozliczona plotka może dostać tekst „nie wypaliło”. */
const RUMOR_STALE_DAYS = 30
const RUMOR_FOLLOWUP_CHANCE = 0.35

function pick(arr, rng) {
  if (!arr?.length) return null
  return arr[Math.floor(rng() * arr.length)]
}

function daysBetween(isoA, isoB) {
  try {
    const a = parseISODate(isoA)
    const b = parseISODate(isoB)
    return Math.round((b.getTime() - a.getTime()) / 86_400_000)
  } catch {
    return Infinity
  }
}

function dayWord(days, lang) {
  if (lang === 'en') return days === 1 ? 'day' : 'days'
  return days === 1 ? 'dzień' : 'dni'
}

function agoPhrasePl(days) {
  if (!Number.isFinite(days) || days <= 0) return 'jeszcze dziś'
  if (days === 1) return 'wczoraj'
  return `${days} ${dayWord(days, 'pl')} temu`
}

function agoPhraseEn(days) {
  if (!Number.isFinite(days) || days <= 0) return 'earlier today'
  if (days === 1) return 'yesterday'
  return `${days} ${dayWord(days, 'en')} ago`
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/** 1 rok / 2–4 lata / 5 lat — polska odmiana po liczebniku. */
function yearWordPl(years) {
  const n = Math.abs(Math.round(years))
  if (n === 1) return 'rok'
  const last = n % 10
  const lastTwo = n % 100
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'lata'
  return 'lat'
}

function statScore(row) {
  if (!row) return 0
  return (
    (row.goals ?? 0) * 3 +
    (row.assists ?? 0) * 2 +
    (row.blocks ?? 0) * 2.5 -
    (row.turnovers ?? 0) * 2
  )
}

/* ------------------------------------------------------------------ */
/* Stan                                                                */
/* ------------------------------------------------------------------ */

/** Dokłada do obiektu `career.ultiworld` pola potrzebne newsom transferowym. */
export function ensureTransferNewsState(uw) {
  if (!uw || typeof uw !== 'object') return uw
  if (!Array.isArray(uw.coveredTransferKeys)) uw.coveredTransferKeys = []
  if (!Array.isArray(uw.coveredLoanKeys)) uw.coveredLoanKeys = []
  if (!Array.isArray(uw.transferRumors)) uw.transferRumors = []
  if (typeof uw.transferNewsSeeded !== 'boolean') uw.transferNewsSeeded = false
  return uw
}

/**
 * Wpisy free-agentów (`signFreeAgent`) nie mają `id` — klucz musi być pochodny,
 * inaczej ten sam ruch wracałby w feedzie po każdym ticku.
 */
function transferKey(entry) {
  if (entry?.id) return String(entry.id)
  return `${entry?.date ?? '?'}|${entry?.playerId ?? '?'}|${entry?.toTeamId ?? '?'}|${entry?.fee ?? 0}`
}

function loanKey(entry) {
  return `${entry?.id ?? '?'}|${entry?.kind ?? 'started'}|${entry?.date ?? '?'}`
}

function teamLabel(teamId, fallback, names) {
  return names?.[teamId] ?? fallback ?? teamId ?? '—'
}

/* ------------------------------------------------------------------ */
/* Faktyczne transfery                                                 */
/* ------------------------------------------------------------------ */

function medianPositiveFee(transferLog) {
  const fees = (transferLog ?? [])
    .map((e) => Number(e?.fee) || 0)
    .filter((f) => f > 0)
    .sort((a, b) => a - b)
  if (!fees.length) return 150_000
  return fees[Math.floor(fees.length / 2)]
}

function dealScore(entry, { medianFee, rumoredIds }) {
  const ovr = entry.playerOvr ?? 0
  const fee = Number(entry.fee) || 0
  let score = Math.max(0, ovr - 68) * 0.7
  score += medianFee > 0 ? Math.min(8, (fee / medianFee) * 2.5) : fee > 0 ? 2 : 0
  if (entry.involvesPlayer) score += 12
  if (entry.freeAgent) score -= 2
  if (rumoredIds.has(String(entry.playerId))) score += 5
  return score
}

function loanScore(entry) {
  let score = entry.kind === 'returned' ? -3 : 0
  if (entry.involvesPlayer) score += 9
  if ((Number(entry.fee) || 0) > 0) score += 1
  return score
}

/** Fragment „pisaliśmy o tym” + oznaczenie plotki jako potwierdzonej. */
function rumorCallback(rumors, playerId, simDate) {
  const hit = rumors.find((r) => String(r.playerId) === String(playerId) && !r.resolved)
  if (!hit) return null
  hit.resolved = true
  const days = daysBetween(hit.date, simDate)
  return {
    pl: `\n\nUltiworld pisał o tym zainteresowaniu ${agoPhrasePl(days)} — plotka się potwierdziła.`,
    en: `\n\nUltiworld reported that interest ${agoPhraseEn(days)} — the rumor checked out.`,
  }
}

function transferDealSpec(entry, ctx) {
  const { world, namesPl, namesEn, rng, simDate, rumors, medianFee } = ctx
  const name = entry.playerName ?? getPlayerFullName(findWorldPlayerById(world, entry.playerId).player) ?? '—'
  const toPl = teamLabel(entry.toTeamId, entry.toTeamName, namesPl)
  const toEn = teamLabel(entry.toTeamId, entry.toTeamName, namesEn)
  const fromPl = teamLabel(entry.fromTeamId, entry.fromTeamName, namesPl)
  const fromEn = teamLabel(entry.fromTeamId, entry.fromTeamName, namesEn)
  const ovr = entry.playerOvr ?? getOverallRating(findWorldPlayerById(world, entry.playerId).player?.skills)
  const fee = Number(entry.fee) || 0
  const feeText = formatUsd(fee)
  const value = Number(entry.marketValue) || 0
  const blockbuster = (fee >= medianFee * 2.5 && fee >= 200_000) || (ovr ?? 0) >= 80
  const bargain = !entry.freeAgent && value > 0 && fee > 0 && fee < value * 0.62
  const callback = rumorCallback(rumors, entry.playerId, simDate)

  const tags = ['transfer']
  if (blockbuster) tags.push('hit-transferowy')
  if (bargain) tags.push('okazja')
  if (entry.freeAgent) tags.push('wolny-transfer')
  if (callback) tags.push('potwierdzona-plotka')

  let variants
  if (entry.freeAgent) {
    variants = [
      {
        h: `Wolny transfer: ${toPl} bierze ${name}`,
        hEn: `Free transfer: ${toEn} take ${name}`,
        d: 'Zero za podpis, wszystko w pensji.',
        dEn: 'Nothing for the signature, everything in wages.',
        b: `${name} (OVR ${ovr}) kończy okres bez klubu i podpisuje z ${toPl}. Kwota odstępnego: żadna — bo i komu miałaby trafić. Cały koszt siedzi w kontrakcie, a ${toPl} dostaje zawodnika, o którego nie musiało się licytować.`,
        bEn: `${name} (OVR ${ovr}) ends their spell without a club and signs with ${toEn}. Transfer fee: none — there was nobody to pay. The whole cost sits in the contract, and ${toEn} get a player they never had to bid for.`,
      },
      {
        h: `${name} znalazł klub — podpis w ${toPl}`,
        hEn: `${name} found a club — signs at ${toEn}`,
        d: 'Rynek wolnych agentów wciąż pracuje.',
        dEn: 'The free-agent market is still working.',
        b: `${toPl} sięga po ${name} (OVR ${ovr}) bez wydawania złotówki na odstępne. To ruch, który nie robi nagłówków w dniu ogłoszenia — robi je w marcu, jeśli wypali.`,
        bEn: `${toEn} pick up ${name} (OVR ${ovr}) without spending a cent on a fee. It is not the move that makes headlines on announcement day — it makes them in March, if it works.`,
      },
    ]
  } else if (blockbuster) {
    variants = [
      {
        h: `Hit transferowy: ${name} przechodzi do ${toPl}`,
        hEn: `Blockbuster: ${name} joins ${toEn}`,
        d: `${feeText} — jedna z największych kwot tego okna.`,
        dEn: `${feeText} — one of the biggest fees of this window.`,
        b: `${toPl} płaci ${fromPl} ${feeText} za ${name} (OVR ${ovr}). To nie jest transfer uzupełniający rotację — to deklaracja. ${fromPl} dostaje gotówkę i dziurę w składzie, ${toPl} dostaje nazwisko i oczekiwania, które przyjdą razem z nim.`,
        bEn: `${toEn} pay ${fromEn} ${feeText} for ${name} (OVR ${ovr}). This is not a rotation top-up — it is a statement. ${fromEn} get cash and a hole in the roster; ${toEn} get a name, and the expectations that arrive with it.`,
      },
      {
        h: `${toPl} płaci ${feeText} za ${name}`,
        hEn: `${toEn} pay ${feeText} for ${name}`,
        d: 'Okno transferowe właśnie dostało swój nagłówek.',
        dEn: 'The transfer window just got its headline.',
        b: `Transfer domknięty: ${name} (OVR ${ovr}) opuszcza ${fromPl} i trafia do ${toPl}. Przy takiej kwocie nikt nie mówi już o „wzmocnieniu rotacji” — mówi się o tym, kto teraz siada na ławce, żeby zrobić mu miejsce.`,
        bEn: `Deal done: ${name} (OVR ${ovr}) leaves ${fromEn} for ${toEn}. At this price nobody talks about “squad depth” any more — they talk about who now sits down to make room.`,
      },
      {
        h: `${fromPl} sprzedaje ${name} — ${feeText} na stole`,
        hEn: `${fromEn} sell ${name} — ${feeText} on the table`,
        d: 'Kasa teraz, pytania później.',
        dEn: 'Cash now, questions later.',
        b: `${fromPl} przyjmuje ${feeText} od ${toPl} za ${name} (OVR ${ovr}). Księgowość zadowolona, szatnia mniej. Ultiworld będzie liczyć punkty straconego przez tę decyzję potencjału do końca sezonu.`,
        bEn: `${fromEn} accept ${feeText} from ${toEn} for ${name} (OVR ${ovr}). Accounting is happy, the locker room less so. Ultiworld will be counting the cost of this decision until the end of the season.`,
      },
    ]
  } else {
    variants = [
      {
        h: `${name} zmienia klub: ${fromPl} → ${toPl}`,
        hEn: `${name} changes clubs: ${fromEn} → ${toEn}`,
        d: `Kwota: ${feeText}.`,
        dEn: `Fee: ${feeText}.`,
        b: `${toPl} finalizuje transfer ${name} (OVR ${ovr}) z ${fromPl} za ${feeText}. ${bargain ? 'Cena wyraźnie poniżej wyceny rynkowej — ktoś tu zrobił dobry interes.' : 'Kwota mieści się w rynkowej normie dla tego poziomu.'}`,
        bEn: `${toEn} complete the transfer of ${name} (OVR ${ovr}) from ${fromEn} for ${feeText}. ${bargain ? 'Clearly below market valuation — somebody got good business done.' : 'The fee sits within the market norm at this level.'}`,
      },
      {
        h: `${toPl} wzmacnia skład — ${name} podpisał`,
        hEn: `${toEn} strengthen the roster — ${name} signs`,
        d: `Z ${fromPl} za ${feeText}.`,
        dEn: `From ${fromEn} for ${feeText}.`,
        b: `Ruch domknięty: ${name} (OVR ${ovr}) przenosi się z ${fromPl} do ${toPl}. ${feeText} to koszt, jaki ${toPl} uznało za rozsądny za tę konkretną rolę w rotacji.`,
        bEn: `Move done: ${name} (OVR ${ovr}) goes from ${fromEn} to ${toEn}. ${feeText} is what ${toEn} decided this particular rotation role was worth.`,
      },
      {
        h: `Transfer: ${name} trafia do ${toPl}`,
        hEn: `Transfer: ${name} lands at ${toEn}`,
        d: 'Podpis złożony, testy medyczne za nami.',
        dEn: 'Signature done, medicals cleared.',
        b: `${fromPl} żegna ${name} (OVR ${ovr}), ${toPl} wita. ${feeText} zmienia właściciela. Czy to był dobry ruch, dowiemy się nie z komunikatu prasowego, tylko z drugiej rundy.`,
        bEn: `${fromEn} say goodbye to ${name} (OVR ${ovr}); ${toEn} say hello. ${feeText} changes hands. Whether it was a good move we will learn from the second round, not the press release.`,
      },
    ]
  }

  const v = pick(variants, rng)
  let body = v.b
  let bodyEn = v.bEn

  if (entry.weeklyWage && entry.contractYears) {
    body += `\n\nKontrakt: ${entry.contractYears} ${yearWordPl(entry.contractYears)}, ${formatUsd(entry.weeklyWage)} tygodniowo.`
    bodyEn += `\n\nContract: ${entry.contractYears} ${entry.contractYears === 1 ? 'year' : 'years'}, ${formatUsd(entry.weeklyWage)} per week.`
  }
  if (callback) {
    body += callback.pl
    bodyEn += callback.en
  }

  const relatedTeamIds = [entry.fromTeamId, entry.toTeamId].filter(Boolean)

  return {
    article: {
      category: 'transfer',
      headline: v.h,
      headlineEn: v.hEn,
      dek: v.d,
      dekEn: v.dEn,
      body,
      bodyEn,
      tags,
      relatedTeamIds,
      relatedPlayerIds: entry.playerId != null ? [entry.playerId] : [],
    },
  }
}

function loanDealSpec(entry, ctx) {
  const { namesPl, namesEn, rng, rumors, simDate } = ctx
  const name = entry.playerName ?? '—'
  const parentPl = teamLabel(entry.parentTeamId, entry.parentTeamName, namesPl)
  const parentEn = teamLabel(entry.parentTeamId, entry.parentTeamName, namesEn)
  const destPl = teamLabel(entry.destinationTeamId, entry.destinationTeamName, namesPl)
  const destEn = teamLabel(entry.destinationTeamId, entry.destinationTeamName, namesEn)

  if (entry.kind === 'returned') {
    return {
      article: {
        category: 'transfer',
        headline: `${name} wraca z wypożyczenia do ${parentPl}`,
        headlineEn: `${name} returns from loan to ${parentEn}`,
        dek: `Koniec pobytu w ${destPl}.`,
        dekEn: `End of the spell at ${destEn}.`,
        body: `${name} kończy wypożyczenie w ${destPl} i melduje się z powrotem w ${parentPl}. Teraz pytanie, na które odpowie dopiero trening: czy te minuty coś zmieniły.`,
        bodyEn: `${name} ends the loan spell at ${destEn} and reports back to ${parentEn}. Now the question only training can answer: did those minutes change anything.`,
        tags: ['transfer', 'wypozyczenie'],
        relatedTeamIds: [entry.parentTeamId, entry.destinationTeamId].filter(Boolean),
        relatedPlayerIds: entry.playerId != null ? [entry.playerId] : [],
      },
    }
  }

  const fee = Number(entry.fee) || 0
  const callback = rumorCallback(rumors, entry.playerId, simDate)
  const variants = [
    {
      h: `${name} na wypożyczeniu w ${destPl}`,
      hEn: `${name} on loan at ${destEn}`,
      b: `${parentPl} wysyła ${name} do ${destPl}${fee > 0 ? ` za ${formatUsd(fee)}` : ''}. Podział pensji: ${entry.wageSplitPct ?? 50}% po stronie wypożyczającego. Chodzi o minuty — w macierzystym klubie ich nie było.`,
      bEn: `${parentEn} send ${name} to ${destEn}${fee > 0 ? ` for ${formatUsd(fee)}` : ''}. Wage split: ${entry.wageSplitPct ?? 50}% on the borrowing side. This is about minutes — there weren't any at the parent club.`,
    },
    {
      h: `${destPl} wypożycza ${name} z ${parentPl}`,
      hEn: `${destEn} take ${name} on loan from ${parentEn}`,
      b: `Umowa do ${entry.returnDate ?? 'końca sezonu'}. ${destPl} łata rotację bez ruszania budżetu transferowego, ${parentPl} liczy, że zawodnik wróci ograny.`,
      bEn: `Deal runs to ${entry.returnDate ?? 'the end of the season'}. ${destEn} patch the rotation without touching the transfer budget; ${parentEn} hope the player comes back match-hardened.`,
    },
  ]
  const v = pick(variants, rng)

  return {
    article: {
      category: 'transfer',
      headline: v.h,
      headlineEn: v.hEn,
      dek: 'Wypożyczenie, nie transfer definitywny.',
      dekEn: 'A loan, not a permanent move.',
      body: v.b + (callback ? callback.pl : ''),
      bodyEn: v.bEn + (callback ? callback.en : ''),
      tags: callback ? ['transfer', 'wypozyczenie', 'potwierdzona-plotka'] : ['transfer', 'wypozyczenie'],
      relatedTeamIds: [entry.parentTeamId, entry.destinationTeamId].filter(Boolean),
      relatedPlayerIds: entry.playerId != null ? [entry.playerId] : [],
    },
  }
}

function roundupSpec(entries, loanEntries, ctx) {
  const { namesPl, namesEn, rng } = ctx
  const total = entries.length + loanEntries.length
  const linesPl = []
  const linesEn = []

  for (const e of entries.slice(0, ROUNDUP_MAX_LINES)) {
    const toPl = teamLabel(e.toTeamId, e.toTeamName, namesPl)
    const toEn = teamLabel(e.toTeamId, e.toTeamName, namesEn)
    const fromPl = e.freeAgent ? 'wolny agent' : teamLabel(e.fromTeamId, e.fromTeamName, namesPl)
    const fromEn = e.freeAgent ? 'free agent' : teamLabel(e.fromTeamId, e.fromTeamName, namesEn)
    const feeTxt = e.freeAgent ? '—' : formatUsdCompact(Number(e.fee) || 0)
    const ovr = e.playerOvr != null ? ` (OVR ${e.playerOvr})` : ''
    linesPl.push(`• ${e.playerName}${ovr}: ${fromPl} → ${toPl}, ${feeTxt}`)
    linesEn.push(`• ${e.playerName}${ovr}: ${fromEn} → ${toEn}, ${feeTxt}`)
  }
  const loanRoom = ROUNDUP_MAX_LINES - linesPl.length
  for (const e of loanEntries.slice(0, Math.max(0, loanRoom))) {
    const parentPl = teamLabel(e.parentTeamId, e.parentTeamName, namesPl)
    const parentEn = teamLabel(e.parentTeamId, e.parentTeamName, namesEn)
    const destPl = teamLabel(e.destinationTeamId, e.destinationTeamName, namesPl)
    const destEn = teamLabel(e.destinationTeamId, e.destinationTeamName, namesEn)
    if (e.kind === 'returned') {
      linesPl.push(`• ${e.playerName}: powrót z wypożyczenia, ${destPl} → ${parentPl}`)
      linesEn.push(`• ${e.playerName}: back from loan, ${destEn} → ${parentEn}`)
    } else {
      linesPl.push(`• ${e.playerName}: wypożyczenie, ${parentPl} → ${destPl}`)
      linesEn.push(`• ${e.playerName}: loan, ${parentEn} → ${destEn}`)
    }
  }

  const rest = total - linesPl.length
  const totalFee = entries.reduce((s, e) => s + (Number(e.fee) || 0), 0)
  const headlines = [
    { h: `Dzień transferowy: ${total} ruchów w lidze`, hEn: `Transfer day: ${total} moves across the league` },
    { h: `Rynek w ruchu — ${total} transakcji`, hEn: `Market on the move — ${total} deals` },
    { h: `Podsumowanie okna: ${total} zmian barw`, hEn: `Window roundup: ${total} switches` },
  ]
  const v = pick(headlines, rng)

  const bodyPl = `${linesPl.join('\n')}${rest > 0 ? `\n• …i ${rest} ${rest === 1 ? 'kolejny ruch' : 'kolejnych ruchów'}` : ''}\n\nŁącznie na odstępne poszło ${formatUsd(totalFee)}. Ultiworld wróci do tych nazwisk, gdy zacznie być widać, które podpisy były trafione.`
  const bodyEn = `${linesEn.join('\n')}${rest > 0 ? `\n• …and ${rest} more ${rest === 1 ? 'move' : 'moves'}` : ''}\n\nFees added up to ${formatUsd(totalFee)}. Ultiworld will come back to these names once it starts showing which signatures landed.`

  const relatedTeamIds = [
    ...new Set(
      [
        ...entries.flatMap((e) => [e.fromTeamId, e.toTeamId]),
        ...loanEntries.flatMap((e) => [e.parentTeamId, e.destinationTeamId]),
      ].filter(Boolean),
    ),
  ]

  return {
    article: {
      category: 'transfer',
      headline: v.h,
      headlineEn: v.hEn,
      dek: 'Skrót wszystkiego, co przeszło przez rynek.',
      dekEn: 'Everything that moved through the market, in short.',
      body: bodyPl,
      bodyEn,
      tags: ['transfer', 'podsumowanie'],
      relatedTeamIds,
      relatedPlayerIds: [
        ...entries.map((e) => e.playerId),
        ...loanEntries.map((e) => e.playerId),
      ].filter((id) => id != null),
    },
  }
}

/* ------------------------------------------------------------------ */
/* Plotki — zainteresowanie klubów                                     */
/* ------------------------------------------------------------------ */

function rumorChanceForDate(career, league, simDate) {
  const window = getTransferWindowState({ ...career, league })
  if (window.open) return RUMOR_BASE_CHANCE * RUMOR_WINDOW_MULT
  try {
    const month = parseISODate(simDate).getMonth()
    // Grudzień przed oknem zimowym, czerwiec przed letnim — rynek już szumi.
    if (month === 11 || month === 5) return RUMOR_BASE_CHANCE * RUMOR_PRE_WINDOW_MULT
  } catch {
    /* brak daty — zostaw bazę */
  }
  return RUMOR_BASE_CHANCE
}

function rumorCandidates(career, league, simDate, rumors) {
  const recent = new Set(
    rumors
      .filter((r) => daysBetween(r.date, simDate) < RUMOR_PLAYER_COOLDOWN_DAYS)
      .map((r) => String(r.playerId)),
  )
  const statsByPlayer = league?.playerStats ?? {}
  const out = []

  for (const team of worldTeamsList(career.world)) {
    for (const player of team.players ?? []) {
      if (player.loan) continue
      if (recent.has(String(player.id))) continue
      const target = classifyTransferTarget(player)
      const ovr = target.ovr
      if (ovr < 68 && !target.strongProspect) continue

      let w = Math.max(0.05, (ovr - 66) / 20)
      const form = getPlayerForm(player)
      if (form >= 78) w *= 1.5
      else if (form >= 66) w *= 1.2
      else if (form < 50) w *= 0.5
      const morale = getPlayerMorale(player)
      if (morale < 45) w *= 1.8
      else if (morale < 55) w *= 1.3
      if (player.transferListed) w *= 2.2
      if (target.strongProspect) w *= 1.7
      else if (target.prospect) w *= 1.35
      if (target.veteranBargain) w *= 1.2
      const weeksLeft = player.contract?.weeksRemaining ?? 999
      if (weeksLeft <= 26) w *= 1.6
      else if (weeksLeft <= 52) w *= 1.25
      const stat = statsByPlayer[player.id]
      if (stat) w *= 1 + Math.min(0.6, Math.max(0, statScore(stat)) / 60)

      out.push({ player, team, weight: w, target, weeksLeft, form, morale })
    }
  }
  return out
}

function weightedPick(rows, rng) {
  const total = rows.reduce((s, r) => s + r.weight, 0)
  if (total <= 0) return null
  let roll = rng() * total
  for (const row of rows) {
    roll -= row.weight
    if (roll <= 0) return row
  }
  return rows[rows.length - 1]
}

function interestedClubs(career, subject, rng) {
  const { player, team } = subject
  refreshPlayerMarketValue(player)
  const ask = computeAskPrice(player, team)
  const out = []
  for (const buyer of worldTeamsList(career.world)) {
    if (buyer.id === team.id) continue
    if (getTransferBudget(buyer) < ask * 0.7) continue
    const chance = aiIncomingInterestChance(buyer, player, team, rng)
    if (chance <= 0.18) continue
    out.push({ team: buyer, chance })
  }
  out.sort((a, b) => b.chance - a.chance)
  return { clubs: out, ask }
}

function rumorSpec(career, subject, clubs, ask, ctx) {
  const { namesPl, namesEn, rng, simDate } = ctx
  const { player, team, target, weeksLeft, morale } = subject
  const name = getPlayerFullName(player)
  const ovr = target.ovr
  const clubPl = teamLabel(team.id, team.name, namesPl)
  const clubEn = teamLabel(team.id, team.name, namesEn)
  const isPlayerClub = String(team.id) === String(career.playerTeamId)
  const listPl = clubs.map((c) => teamLabel(c.team.id, c.team.name, namesPl))
  const listEn = clubs.map((c) => teamLabel(c.team.id, c.team.name, namesEn))
  const askText = formatUsd(Math.round(ask / 10_000) * 10_000)

  const standoff = weeksLeft <= 26
  let kind
  if (standoff && (!clubs.length || rng() < 0.45)) kind = 'standoff'
  else if (!clubs.length) return null
  else if (clubs.length >= 2 && rng() < 0.6) kind = 'race'
  else if (rng() < 0.18) kind = 'denial'
  else if (clubs[0].chance >= 0.45) kind = 'bid_prep'
  else kind = 'watch'

  const motivePl =
    target.strongProspect || target.prospect
      ? 'młody, z zapasem potencjału'
      : target.veteranBargain
        ? 'doświadczony i tańszy, niż sugeruje OVR'
        : morale < 50
          ? 'niezadowolony z roli w składzie'
          : 'w formie, która nie umyka skautom'
  const motiveEn =
    target.strongProspect || target.prospect
      ? 'young, with headroom left'
      : target.veteranBargain
        ? 'experienced and cheaper than the OVR suggests'
        : morale < 50
          ? 'unhappy with their role'
          : 'in form that scouts do not miss'

  let article
  if (kind === 'standoff') {
    const suffixPl = clubs.length
      ? ` W tle czeka ${listPl[0]} — i czeka cierpliwie.`
      : ' Na razie żaden klub nie wyłożył kart na stół. To się zmienia szybko.'
    const suffixEn = clubs.length
      ? ` ${listEn[0]} are waiting in the background — patiently.`
      : ' No club has shown its hand yet. That changes fast.'
    article = {
      headline: `Impas kontraktowy: ${name} i ${clubPl}`,
      headlineEn: `Contract standoff: ${name} and ${clubEn}`,
      dek: `Umowa kończy się za ok. ${Math.max(1, Math.round(weeksLeft))} tyg.`,
      dekEn: `Deal expires in about ${Math.max(1, Math.round(weeksLeft))} weeks.`,
      body: `Rozmowy ${clubPl} z ${name} (OVR ${ovr}) stanęły. Zawodnik jest ${motivePl}, a kontrakt topnieje szybciej niż argumenty klubu.${suffixPl}\n\nUltiworld: kluby, które czekają do ostatniej chwili, zwykle płacą albo dwa razy więcej, albo zero — bo zawodnika już nie ma.`,
      bodyEn: `Talks between ${clubEn} and ${name} (OVR ${ovr}) have stalled. The player is ${motiveEn}, and the contract is running down faster than the club's arguments.${suffixEn}\n\nUltiworld: clubs that wait until the last moment usually pay either double or nothing — because the player is already gone.`,
      tags: ['plotka', 'kontrakt'],
    }
  } else if (kind === 'race') {
    const namedPl = listPl.slice(0, 3)
    const namedEn = listEn.slice(0, 3)
    article = {
      headline: `${namedPl.length} kluby o ${name}`,
      headlineEn: `${namedEn.length} clubs chasing ${name}`,
      dek: `${namedPl.join(', ')} — wszyscy pytają w ${clubPl}.`,
      dekEn: `${namedEn.join(', ')} — all asking at ${clubEn}.`,
      body: `Według naszych źródeł ${namedPl.join(', ')} niezależnie od siebie sondowały ${clubPl} w sprawie ${name} (OVR ${ovr}). Zawodnik jest ${motivePl}, a cena wywoławcza krąży w okolicach ${askText}.\n\nGdy pytają trzy kluby naraz, jedno jest pewne: cena już nie spadnie.`,
      bodyEn: `Our sources say ${namedEn.join(', ')} have independently sounded out ${clubEn} about ${name} (OVR ${ovr}). The player is ${motiveEn}, and the asking price is circling ${askText}.\n\nWhen three clubs ask at once, one thing is certain: the price is not coming down.`,
      tags: ['plotka', 'zainteresowanie'],
    }
  } else if (kind === 'bid_prep') {
    article = {
      headline: `${listPl[0]} szykuje ofertę za ${name}`,
      headlineEn: `${listEn[0]} preparing a bid for ${name}`,
      dek: `Mowa o kwocie rzędu ${askText}.`,
      dekEn: `The figure being mentioned is around ${askText}.`,
      body: `${listPl[0]} ma być bliskie złożenia oferty w ${clubPl} za ${name} (OVR ${ovr}). Zawodnik jest ${motivePl} — dokładnie ten profil, którego szuka sztab kupującego. Nieoficjalnie: punkt wyjścia to ${askText}, a ${clubPl} nie odrzuciło rozmowy z góry.\n\nOferty jeszcze nie ma. Ale jest już cena.`,
      bodyEn: `${listEn[0]} are said to be close to putting an offer to ${clubEn} for ${name} (OVR ${ovr}). The player is ${motiveEn} — exactly the profile the buying staff wants. Unofficially: the starting point is ${askText}, and ${clubEn} did not shut the conversation down.\n\nThere is no bid yet. But there is already a price.`,
      tags: ['plotka', 'oferta'],
    }
  } else if (kind === 'denial') {
    article = {
      headline: `${clubPl} dementuje: ${name} nigdzie się nie wybiera`,
      headlineEn: `${clubEn} deny it: ${name} is going nowhere`,
      dek: 'Klasyczne „zawodnik nie jest na sprzedaż”.',
      dekEn: 'The classic “the player is not for sale”.',
      body: `Po naszych doniesieniach o zainteresowaniu ${listPl[0]} klub wydał oświadczenie: ${name} (OVR ${ovr}) nie jest na sprzedaż. Ultiworld skrupulatnie odnotowuje, że tak samo brzmiały komunikaty przed niejednym transferem.\n\nZawodnik pozostaje ${motivePl}. Zainteresowanie nie znika od oświadczenia.`,
      bodyEn: `After our report on ${listEn[0]}'s interest, the club issued a statement: ${name} (OVR ${ovr}) is not for sale. Ultiworld dutifully notes that the wording was identical before more than one completed transfer.\n\nThe player remains ${motiveEn}. Interest does not disappear because of a statement.`,
      tags: ['plotka', 'dementi'],
    }
  } else {
    article = {
      headline: `${listPl[0]} obserwuje ${name}`,
      headlineEn: `${listEn[0]} monitoring ${name}`,
      dek: `Na razie skauting, nie oferta.`,
      dekEn: 'Scouting for now, not a bid.',
      body: `Skauci ${listPl[0]} pojawiają się na meczach ${clubPl} częściej, niż wynikałoby to z uprzejmości. Cel: ${name} (OVR ${ovr}) — ${motivePl}. Wycena wywoławcza to mniej więcej ${askText}.\n\nTo jeszcze nie transfer. To etap, na którym transfery się zaczynają.`,
      bodyEn: `${listEn[0]}'s scouts turn up at ${clubEn} games more often than politeness would explain. The target: ${name} (OVR ${ovr}) — ${motiveEn}. The asking price is roughly ${askText}.\n\nThis is not a transfer yet. It is the stage where transfers begin.`,
      tags: ['plotka', 'zainteresowanie'],
    }
  }

  const spec = {
    article: {
      category: 'rumor',
      ...article,
      relatedTeamIds: [team.id, ...clubs.slice(0, 3).map((c) => c.team.id)],
      relatedPlayerIds: [player.id],
      impact: false,
    },
  }

  if (isPlayerClub) {
    spec.inboxHint =
      kind === 'standoff'
        ? `Media piszą o impasie w rozmowach z ${name}. Kontrakt kończy się za ok. ${Math.max(1, Math.round(weeksLeft))} tygodni — warto usiąść do stołu, zanim zrobi to ktoś inny.`
        : `Media donoszą o zainteresowaniu ${name} ze strony: ${listPl.slice(0, 3).join(', ')}. Cena wywoławcza szacowana na ${askText}. Możesz to zignorować albo uprzedzić ofertę.`
    spec.inboxHintEn =
      kind === 'standoff'
        ? `The media are writing about a standoff in talks with ${name}. The contract expires in about ${Math.max(1, Math.round(weeksLeft))} weeks — worth sitting down before somebody else does.`
        : `The media report interest in ${name} from: ${listEn.slice(0, 3).join(', ')}. Asking price estimated at ${askText}. You can ignore it, or get ahead of the bid.`
  }

  return {
    spec,
    record: {
      playerId: player.id,
      playerName: name,
      teamId: team.id,
      teamIds: clubs.slice(0, 3).map((c) => c.team.id),
      date: simDate,
      kind,
      resolved: false,
    },
  }
}

/** Nierozliczona, stara plotka → „nie wypaliło”. Zamyka wątek zamiast go gubić. */
function staleRumorSpec(career, rumors, ctx) {
  const { namesPl, namesEn, rng, simDate } = ctx
  const stale = rumors.filter(
    (r) => !r.resolved && r.kind !== 'denial' && daysBetween(r.date, simDate) >= RUMOR_STALE_DAYS,
  )
  if (!stale.length) return null
  if (rng() > RUMOR_FOLLOWUP_CHANCE) return null
  const hit = pick(stale, rng)
  if (!hit) return null
  hit.resolved = true

  const team = worldTeamById(career.world, hit.teamId)
  const found = findWorldPlayerById(career.world, hit.playerId)
  // Zawodnik już zmienił klub inną drogą — nie ma czego prostować.
  if (found.teamId != null && String(found.teamId) !== String(hit.teamId)) return null

  const clubPl = teamLabel(hit.teamId, team?.name, namesPl)
  const clubEn = teamLabel(hit.teamId, team?.name, namesEn)
  const suitorPl = teamLabel(hit.teamIds?.[0], null, namesPl)
  const suitorEn = teamLabel(hit.teamIds?.[0], null, namesEn)
  const days = daysBetween(hit.date, simDate)

  return {
    spec: {
      article: {
        category: 'rumor',
        headline: `Transfer, którego nie było: ${hit.playerName} zostaje w ${clubPl}`,
        headlineEn: `The transfer that wasn't: ${hit.playerName} stays at ${clubEn}`,
        dek: `Po ${days} ${dayWord(days, 'pl')} temat wygasł.`,
        dekEn: `After ${days} ${dayWord(days, 'en')} the story is dead.`,
        body: `${capitalize(agoPhrasePl(days))} pisaliśmy o zainteresowaniu ${suitorPl === '—' ? 'rynku' : suitorPl} zawodnikiem ${hit.playerName}. Rozmowy nie ruszyły z miejsca, a ${clubPl} zachowuje zawodnika.\n\nUltiworld nie wycofuje doniesienia — odnotowuje tylko, że nie każde zainteresowanie kończy się podpisem.`,
        bodyEn: `${capitalize(agoPhraseEn(days))} we reported ${suitorEn === '—' ? 'market' : `${suitorEn}'s`} interest in ${hit.playerName}. The talks never moved, and ${clubEn} keep the player.\n\nUltiworld is not retracting the report — just noting that not every interest ends in a signature.`,
        tags: ['plotka', 'niedoszly-transfer'],
        relatedTeamIds: [hit.teamId, ...(hit.teamIds ?? [])].filter(Boolean),
        relatedPlayerIds: hit.playerId != null ? [hit.playerId] : [],
        impact: false,
      },
    },
  }
}

/* ------------------------------------------------------------------ */
/* Wejście                                                             */
/* ------------------------------------------------------------------ */

/**
 * Buduje newsy transferowe dla jednego ticka.
 *
 * @param {object} args
 * @param {object} args.career — z aktualnym `world`, `transferLog`, `loanLog`
 * @param {object} args.league
 * @param {string} args.simDate
 * @param {() => number} args.rng
 * @param {Record<string,string>} args.namesPl
 * @param {Record<string,string>} args.namesEn
 * @param {object} args.ultiworld — stan (nie jest mutowany; zwracamy nowe pola)
 * @returns {{
 *   specs: object[],
 *   coveredTransferKeys: string[],
 *   coveredLoanKeys: string[],
 *   transferRumors: object[],
 * }}
 */
export function transferNewsForTick({
  career,
  league,
  simDate,
  rng,
  namesPl,
  namesEn,
  ultiworld,
}) {
  const transferLog = career?.transferLog ?? []
  const loanLog = career?.loanLog ?? []
  const coveredTransfers = new Set(ultiworld.coveredTransferKeys ?? [])
  const coveredLoans = new Set(ultiworld.coveredLoanKeys ?? [])
  const rumors = (ultiworld.transferRumors ?? []).map((r) => ({ ...r }))
  const specs = []

  const fresh = transferLog.filter((e) => e && !coveredTransfers.has(transferKey(e)))
  const freshLoans = loanLog.filter((e) => e && !coveredLoans.has(loanKey(e)))
  for (const e of fresh) coveredTransfers.add(transferKey(e))
  for (const e of freshLoans) coveredLoans.add(loanKey(e))

  const finish = () => ({
    specs,
    coveredTransferKeys: [...coveredTransfers].slice(-COVERED_TRANSFER_KEYS_MAX),
    coveredLoanKeys: [...coveredLoans].slice(-COVERED_LOAN_KEYS_MAX),
    transferRumors: rumors.slice(0, RUMORS_MAX),
    transferNewsSeeded: true,
  })

  // Pierwszy tick na istniejącym save'ie: oznacz historię jako pokrytą, nie pisz o niej.
  if (!ultiworld.transferNewsSeeded) {
    return finish()
  }

  const ctx = {
    world: career.world,
    namesPl,
    namesEn,
    rng,
    simDate,
    rumors,
    medianFee: medianPositiveFee(transferLog),
  }
  const rumoredIds = new Set(rumors.filter((r) => !r.resolved).map((r) => String(r.playerId)))

  // 1) Faktyczne ruchy — najciekawsze osobno, reszta zbiorczo.
  const scoredTransfers = fresh
    .map((entry) => ({ entry, score: dealScore(entry, { medianFee: ctx.medianFee, rumoredIds }) }))
    .sort((a, b) => b.score - a.score)
  const scoredLoans = freshLoans
    .map((entry) => ({ entry, score: loanScore(entry) }))
    .sort((a, b) => b.score - a.score)

  // Transfery i wypożyczenia dzielą ten sam budżet osobnych tekstów.
  const featured = []
  const featuredLoans = []
  for (const row of scoredTransfers) {
    if (featured.length + featuredLoans.length >= MAX_DEAL_ARTICLES_PER_TICK) break
    featured.push(row.entry)
    specs.push(transferDealSpec(row.entry, ctx))
  }
  for (const row of scoredLoans) {
    if (featured.length + featuredLoans.length >= MAX_DEAL_ARTICLES_PER_TICK) break
    // Wypożyczenie dostaje własny tekst tylko, gdy naprawdę na to zasługuje.
    if (row.score < 6) break
    featuredLoans.push(row.entry)
    specs.push(loanDealSpec(row.entry, ctx))
  }

  const restTransfers = scoredTransfers.map((r) => r.entry).filter((e) => !featured.includes(e))
  const restLoans = scoredLoans.map((r) => r.entry).filter((e) => !featuredLoans.includes(e))
  if (restTransfers.length + restLoans.length >= ROUNDUP_MIN_DEALS) {
    specs.push(roundupSpec(restTransfers, restLoans, ctx))
  }

  // 2) Plotka — najwyżej jedna na tick (albo domknięcie starej).
  const stale = staleRumorSpec(career, rumors, ctx)
  if (stale) {
    specs.push(stale.spec)
    return finish()
  }

  if (rng() < rumorChanceForDate(career, league, simDate)) {
    const candidates = rumorCandidates(career, league, simDate, rumors)
    const subject = weightedPick(candidates, rng)
    if (subject) {
      const { clubs, ask } = interestedClubs(career, subject, rng)
      const built = rumorSpec(career, subject, clubs, ask, ctx)
      if (built) {
        specs.push(built.spec)
        rumors.unshift(built.record)
      }
    }
  }

  return finish()
}
