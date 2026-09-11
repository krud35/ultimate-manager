/**
 * Faza A planu "International Competition": ranking światowy z JAWNYCH faktów — zawsze
 * wyprowadzony z widocznych dla gracza wyników (`career.nationalTeams.history` + prawdziwa
 * przedkarierowa historia medalowa), NIGDY z ukrytego `countryStrength`
 * (`nationalTeams.js`/`nationalTeamCoefficient.js`) — to świadomie dwa różne liczniki: jeden
 * rządzi rozstawieniem/generowaniem fillerów w tle, drugi to jedyna "siła kraju" jaką gracz
 * kiedykolwiek zobaczy. Wagi rund pożyczone 1:1 z `nationalTeamCoefficient.js`, żeby ranking
 * i coefficient przynajmniej ZGADZAŁY SIĘ CO DO KIERUNKU (mistrz > finalista > półfinalista...),
 * nawet jeśli to dwa osobne stany.
 */
import { ACADEMY_COUNTRIES } from '../data/academyScoutGeography.js'
import {
  TOURNAMENT_PLACEMENT_DELTA,
  TOURNAMENT_CHAMPION_DELTA,
  TOURNAMENT_BRONZE_DELTA,
  GROUP_STAGE_EXIT_PER_WIN,
  GROUP_STAGE_EXIT_CAP,
} from './nationalTeamCoefficient.js'
import { realWorldMedalsForCountryName } from '../data/eucs/worldChampionshipHistoryReal.js'
import { worldTeamById } from './worldState.js'
import { ensureCareerNationalTeams } from './nationalTeams.js'

function placementPoints(placement, groupWins) {
  if (placement === 'champion') return TOURNAMENT_CHAMPION_DELTA
  if (placement === 'bronze') return TOURNAMENT_BRONZE_DELTA
  // 4. miejsce wyceniane jak przegrany półfinał — patrz TOURNAMENT_PLACEMENT_DELTA.bronze.
  if (placement === 'fourth') return TOURNAMENT_PLACEMENT_DELTA.semifinal
  if (placement === 'group') {
    return Math.min(GROUP_STAGE_EXIT_CAP, (groupWins ?? 0) * GROUP_STAGE_EXIT_PER_WIN)
  }
  return TOURNAMENT_PLACEMENT_DELTA[placement] ?? 0
}

function emptyRankingRow(countryId) {
  // `semifinal` zostaje osobno od `bronze`: prawdziwa historia sprzed kariery
  // (worldChampionshipHistoryReal.js) zna tylko półfinalistów, bez rozstrzygnięcia brązu.
  return { countryId, points: 0, medals: { gold: 0, silver: 0, bronze: 0, semifinal: 0 } }
}

/**
 * Ranking światowy widoczny dla gracza — łączy prawdziwą historię sprzed kariery
 * (`worldChampionshipHistoryReal.js`) z wynikami rozegranymi W TEJ karierze
 * (`nt.history`, rozszerzone o `placements`/`groups` — patrz `nationalTeamSeason.js`).
 * Zwraca listę posortowaną malejąco po punktach, wszystkie znane kraje (nawet 0 pkt).
 */
export function computePublicWorldRanking(career) {
  const nt = ensureCareerNationalTeams(career)
  const rows = {}
  for (const countryId of Object.keys(ACADEMY_COUNTRIES)) {
    rows[countryId] = emptyRankingRow(countryId)
  }

  for (const countryId of Object.keys(ACADEMY_COUNTRIES)) {
    const nameEn = ACADEMY_COUNTRIES[countryId].nameEn
    const real = realWorldMedalsForCountryName(nameEn)
    if (!real) continue
    const row = rows[countryId]
    row.medals.gold += real.gold
    row.medals.silver += real.silver
    row.medals.semifinal += real.semifinal
    row.points += real.gold * TOURNAMENT_CHAMPION_DELTA
    row.points += real.silver * TOURNAMENT_PLACEMENT_DELTA.final
    row.points += real.semifinal * TOURNAMENT_PLACEMENT_DELTA.semifinal
  }

  for (const entry of nt.history ?? []) {
    const placements = entry.placements ?? {}
    const groupWinsByCountry = {}
    for (const group of entry.groups ?? []) {
      for (const row of group.table ?? []) {
        groupWinsByCountry[row.countryId] = row.wins
      }
    }
    for (const [countryId, placement] of Object.entries(placements)) {
      const row = rows[countryId]
      if (!row) continue
      row.points += placementPoints(placement, groupWinsByCountry[countryId])
      if (placement === 'champion') row.medals.gold += 1
      else if (placement === 'final') row.medals.silver += 1
      else if (placement === 'bronze') row.medals.bronze += 1
      // 'semifinal' bez rozegranego brązu = stary zapis sprzed tej mechaniki; 'fourth'
      // świadomie nie jest medalem.
      else if (placement === 'semifinal') row.medals.semifinal += 1
    }
  }

  return Object.values(rows).sort((a, b) => b.points - a.points)
}

/**
 * Opisowy tier zamiast surowej liczby punktów w profilu kraju — ten sam mechanizm progowy
 * co `reputationLabel`/`reputationToneClass` (teamReputation.js), ale na WŁASNEJ skali:
 * punkty rankingu światowego nie są ograniczone do 0-100 (mistrzostwo warte 6 pkt, USA w
 * realnej historii ma ich 4 — więc realistyczny zakres to raczej 0-30), przeniesienie progów
 * reputacji klubowej 1:1 dałoby złe wrażenie ("Elitarna" przy 6 punktach).
 */
export function countryRankingTierLabel(points, lang = 'pl') {
  if (lang === 'en') {
    if (points >= 15) return 'World power'
    if (points >= 8) return 'Strong contender'
    if (points >= 3) return 'Solid mid-table'
    if (points > 0) return 'Plucky underdog'
    return 'Newcomer'
  }
  if (points >= 15) return 'Potęga światowa'
  if (points >= 8) return 'Silny pretendent'
  if (points >= 3) return 'Solidny średniak'
  if (points > 0) return 'Ambitny outsider'
  return 'Debiutant'
}

export function countryRankingTierToneClass(points) {
  if (points >= 15) return 'text-emerald-400'
  if (points >= 8) return 'text-ufa-gold'
  if (points >= 3) return 'text-amber-400'
  if (points > 0) return 'text-ufa-muted'
  return 'text-ufa-muted'
}

/**
 * Propozycja 1: "Twoi zawodnicy w kadrach" — zawodnicy klubu gracza aktualnie powołani do
 * aktywnej kampanii kwalifikacyjnej lub fazy finałowej. Czysto odczytowa, nic nie generuje ani
 * nie zapisuje. `nextFixtureDate` to najbliższy nierozegrany fixture/mecz drabinki tego kraju
 * w aktywnym cyklu (albo `null` jeśli żaden już nie czeka — np. kraj odpadł, ale kadra
 * historycznie istniała w tym oknie).
 */
export function playersAwayOnNationalDuty(career, world) {
  const nt = ensureCareerNationalTeams(career)
  const team = worldTeamById(world, career?.playerTeamId)
  if (!team?.players?.length) return []

  const activeCountryIds = new Set()
  if (nt.qualifying) {
    for (const id of nt.qualifying.autoQualifiedCountryIds ?? []) activeCountryIds.add(id)
    for (const campaign of nt.qualifying.campaigns ?? []) {
      for (const group of campaign.groups ?? []) {
        for (const id of group.countryIds ?? []) activeCountryIds.add(id)
      }
    }
  }
  if (nt.finals) {
    for (const group of nt.finals.groups ?? []) {
      for (const id of group.countryIds ?? []) activeCountryIds.add(id)
    }
  }
  if (!activeCountryIds.size) return []

  const byCountryEnglishName = {}
  for (const [id, entry] of Object.entries(ACADEMY_COUNTRIES)) {
    byCountryEnglishName[entry.nameEn] = id
  }

  const result = []
  for (const player of team.players) {
    const countryId = byCountryEnglishName[player.nationality]
    if (!countryId || !activeCountryIds.has(countryId)) continue
    // Sam paszport nie wystarczy — kadra to najwyżej `NATIONAL_SQUAD_SIZE_MAX` nazwisk
    // (patrz selectNationalSquad), więc gdy skład jest już ogłoszony, pytamy o faktyczne
    // powołanie. `squadsByCountry` zapełnia się dopiero przy rozstrzyganiu pierwszego meczu
    // danego kraju — do tego czasu (okno przed turniejem) pokazujemy uprawnionych, bo nic
    // lepszego jeszcze nie istnieje.
    const squadIds = nt.squadsByCountry?.[countryId]?.playerIds
    const calledUp = squadIds ? squadIds.includes(player.id) : null
    if (calledUp === false) continue
    result.push({
      player,
      countryId,
      calledUp: calledUp === true,
      nextFixtureDate: nextFixtureDateForCountry(nt, countryId),
    })
  }
  return result
}

function nextFixtureDateForCountry(nt, countryId) {
  const teamId = `nt-${countryId}`
  const candidates = []

  for (const campaign of nt.qualifying?.campaigns ?? []) {
    for (const fixture of campaign.fixtures ?? []) {
      if (fixture.status === 'completed') continue
      if (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId) {
        if (fixture.date) candidates.push(fixture.date)
      }
    }
    for (const match of campaign.playoff?.matches ?? []) {
      if (match.status === 'completed') continue
      if (match.homeTeamId === teamId || match.awayTeamId === teamId) {
        if (match.date) candidates.push(match.date)
      }
    }
  }

  if (nt.finals) {
    for (const fixture of nt.finals.fixtures ?? []) {
      if (fixture.status === 'completed') continue
      if (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId) {
        if (fixture.date) candidates.push(fixture.date)
      }
    }
    for (const match of nt.finals.knockout?.matches ?? []) {
      if (match.status === 'completed') continue
      if (match.homeTeamId === teamId || match.awayTeamId === teamId) {
        if (match.date) candidates.push(match.date)
      }
    }
  }

  candidates.sort()
  return candidates[0] ?? null
}
