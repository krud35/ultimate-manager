/**
 * Wpięcie kadr narodowych (Fazy 1-5) w pętlę kariery. Dwa haki:
 *
 *  - `maybeStartNationalTeamSeason(career, { seasonYear, calendar })` — wołane RAZ na
 *    sezon, przy tworzeniu kariery (createEucsCareer) i przy starcie każdego kolejnego
 *    sezonu (startNextSeasonEucs). Sprawdza `career.nationalTeams.nextTournament.year`
 *    względem nadchodzącego sezonu i decyduje: rok turniejowy → startTournamentFinals;
 *    rok tuż przed turniejem → startQualifyingCampaign. Dzięki arytmetyce lat (turnieje
 *    co 2 lata, kwalifikacje zajmują dokładnie sezon między nimi) KAŻDY sezon jest albo
 *    kwalifikacyjny, albo turniejowy, nigdy oba naraz — i pierwszy cykl (ME 2027) sam
 *    wychodzi bez kwalifikacji, bo kariera startuje w 2026, za późno na sezon kwalifikacyjny
 *    przed nim (żadnego specjalnego przypadku w kodzie nie trzeba pisać).
 *
 *  - `advanceNationalTeamsForDate(career, world, dateIso)` — wołane CODZIENNIE (patrz
 *    App.jsx: computeCalendarDayStep, obok advanceAcademyCampaigns/advancePlayerSearch
 *    Campaigns). Rozstrzyga zaległe mecze aktywnej kampanii/turnieju, obsługuje przejścia
 *    faz (grupa→baraż, grupa→drabinka, koniec→coefficient+wiadomość+następny cykl) i
 *    zwraca nowe wiadomości do skrzynki.
 */
import { ACADEMY_COUNTRIES } from '../data/academyScoutGeography.js'
import { ensureCareerNationalTeams } from './nationalTeams.js'
import {
  createQualifyingCampaign,
  advanceQualifyingGroupStage,
  isQualifyingGroupStageComplete,
  resolveQualifyingGroupStage,
  buildQualifyingPlayoff,
  advanceQualifyingPlayoff,
  computeWorldCupContinentSlots,
} from './nationalTeamQualifying.js'
import {
  createTournamentFinals,
  advanceFinalsGroupStage,
  isFinalsGroupStageComplete,
  resolveFinalsGroupStage,
  buildFinalsKnockout,
  advanceFinalsKnockout,
  topCountriesByStrength,
} from './nationalTeamFinals.js'
import { nationalTournamentStandingsTable } from './nationalTeamMatches.js'
import {
  applyQualifyingFailureToCountryStrength,
  applyTournamentResultToCountryStrength,
} from './nationalTeamCoefficient.js'
import { messageFromQualifyingResult, messageFromTournamentResult } from './nationalTeamMessages.js'
import { countryIdFromPseudoTeamId } from './nationalTeamQualifying.js'
import { internationalFinalWatchableMessage } from './watchableFinals.js'

const EURO_TOTAL_SLOTS = 16
const WORLD_TOTAL_SLOTS = 32

function europeCountryIds() {
  return Object.entries(ACADEMY_COUNTRIES)
    .filter(([, entry]) => entry.continent === 'europe')
    .map(([id]) => id)
}

function allCountryIds() {
  return Object.keys(ACADEMY_COUNTRIES)
}

function countryIdsByContinent() {
  const map = {}
  for (const [id, entry] of Object.entries(ACADEMY_COUNTRIES)) {
    ;(map[entry.continent] ??= []).push(id)
  }
  return map
}

/**
 * ME: jedna pula (Europa), jedna kampania. MŚ: osobna kampania per strefa kontynentalna
 * z dynamiczną kwotą (Faza 3: `computeWorldCupContinentSlots`) — strefy, gdzie krajów jest
 * mniej niż przyznanych miejsc (nie ma o co grać, np. Oceania 2 kraje / 2 miejsca), dostają
 * automatyczny awans bez żadnego meczu.
 */
function startQualifyingCampaign(career, { kind, year, availableDates }) {
  const nt = ensureCareerNationalTeams(career)
  const playoffDate = availableDates[availableDates.length - 1] ?? null

  if (kind !== 'world') {
    const campaign = createQualifyingCampaign(career, {
      kind,
      year,
      countryIds: europeCountryIds(),
      availableDates,
    })
    campaign.playoffDate = playoffDate
    nt.qualifying = {
      kind,
      year,
      totalSpots: EURO_TOTAL_SLOTS,
      campaigns: [campaign],
      autoQualifiedCountryIds: [],
      finalized: false,
      qualifiedCountryIds: [],
    }
    return nt.qualifying
  }

  const slots = computeWorldCupContinentSlots(career, { totalSlots: WORLD_TOTAL_SLOTS })
  const campaigns = []
  const autoQualifiedCountryIds = []
  for (const [continentId, countryIds] of Object.entries(countryIdsByContinent())) {
    const totalSpots = Math.max(0, Math.min(slots[continentId] ?? 1, countryIds.length))
    if (countryIds.length <= totalSpots) {
      autoQualifiedCountryIds.push(...countryIds)
      continue
    }
    const campaign = createQualifyingCampaign(career, { kind, year, countryIds, availableDates })
    campaign.playoffDate = playoffDate
    campaign.zoneTotalSpots = totalSpots
    campaign.zoneContinentId = continentId
    campaigns.push(campaign)
  }

  nt.qualifying = {
    kind,
    year,
    totalSpots: WORLD_TOTAL_SLOTS,
    continentSlots: slots,
    campaigns,
    autoQualifiedCountryIds,
    finalized: false,
    qualifiedCountryIds: [],
  }
  return nt.qualifying
}

/** Rozstrzyga zaległe mecze wszystkich aktywnych stref kwalifikacyjnych <= `dateIso`. Po
 * skompletowaniu WSZYSTKICH stref nalicza kary za brak awansu (Faza 5) i buduje jedną
 * wiadomość podsumowującą (nie po jednej na strefę — jedna, zbiorcza). */
function advanceQualifyingCycle(career, world, dateIso) {
  const nt = ensureCareerNationalTeams(career)
  const qualifying = nt.qualifying
  if (!qualifying) return []

  for (const campaign of qualifying.campaigns) {
    if (campaign.phase === 'groupStage') {
      advanceQualifyingGroupStage(campaign, world, career, dateIso)
      if (isQualifyingGroupStageComplete(campaign)) {
        resolveQualifyingGroupStage(campaign, {
          totalSpots: campaign.zoneTotalSpots ?? qualifying.totalSpots,
        })
        buildQualifyingPlayoff(campaign, [campaign.playoffDate])
      }
    } else if (campaign.phase === 'playoff') {
      advanceQualifyingPlayoff(campaign, world, career, dateIso)
    }
  }

  const allDone = qualifying.campaigns.every((c) => c.phase === 'complete')
  if (qualifying.finalized || (!allDone && qualifying.campaigns.length > 0)) return []

  qualifying.finalized = true
  // `messageFromQualifyingResult` sprawdza `qualifying.phase === 'complete'` (ten sam
  // wzorzec co pojedyncza kampania/finały) — wrapper stref sam z siebie tego pola nie ma.
  qualifying.phase = 'complete'
  qualifying.qualifiedCountryIds = [
    ...qualifying.autoQualifiedCountryIds,
    ...qualifying.campaigns.flatMap((c) => c.qualifiedCountryIds ?? []),
  ]
  for (const campaign of qualifying.campaigns) {
    applyQualifyingFailureToCountryStrength(career, campaign)
  }
  const message = messageFromQualifyingResult(qualifying, career)
  return message ? [message] : []
}

/** Uczestnicy fazy finałowej: wynik właśnie zakończonych kwalifikacji, albo (pierwszy
 * cykl / brak kwalifikacji z jakiegoś powodu) top N wg aktualnego coefficientu. Liczba
 * zawsze wyrównana do wielokrotności 4 (grupy 4-drużynowe) — z konstrukcji już taka
 * wychodzi (kwalifikacje zawsze produkują dokładnie `totalSpots`), to tylko siatka
 * bezpieczeństwa na wypadek nieprzewidzianego brzegowego przypadku. */
function startTournamentFinals(career, { kind, year, calendar }) {
  const nt = ensureCareerNationalTeams(career)
  const totalSpots = kind === 'world' ? WORLD_TOTAL_SLOTS : EURO_TOTAL_SLOTS
  const pool = kind === 'world' ? allCountryIds() : europeCountryIds()

  let participants = nt.qualifying?.qualifiedCountryIds?.length
    ? nt.qualifying.qualifiedCountryIds
    : topCountriesByStrength(career, pool, totalSpots)

  const roundedCount = Math.max(4, Math.floor(participants.length / 4) * 4)
  if (participants.length > roundedCount) {
    participants = participants.slice(0, roundedCount)
  } else if (participants.length < roundedCount) {
    const remaining = pool.filter((id) => !participants.includes(id))
    const fillers = topCountriesByStrength(career, remaining, roundedCount - participants.length)
    participants = [...participants, ...fillers]
  }

  nt.finals = createTournamentFinals(career, {
    kind,
    year,
    participantCountryIds: participants,
    calendar,
  })
  nt.qualifying = null
  return nt.finals
}

/**
 * Kompaktowy snapshot zakończonego turnieju do `nt.history` (Faza A planu "International
 * Competition") — wołane TUŻ PRZED wyzerowaniem `nt.finals`, bo Results/All-time Leaders
 * (przyszłe fazy UI) czytają wyłącznie z historii, nie z aktywnego stanu turnieju, który
 * znika po zamknięciu cyklu. `placements` mapuje KAŻDY uczestniczący kraj na etykietę
 * najdalszej rundy, w jakiej odpadł (`'champion'`/`'final'`/`'semifinal'`/`'quarterfinal'`/
 * `'roundOf16'`/`'group'`) — ten sam słownik rund co `nationalTeamCoefficient.js`, więc
 * `nationalTeamRanking.js` może przeliczyć punkty rankingowe bez duplikowania logiki drabinki.
 */
function buildTournamentHistoryEntry(finals) {
  const knockout = finals.knockout
  const finalMatch = knockout?.matches.find((m) => m.round === 'final' && m.status === 'completed')
  const runnerUpCountryId = finalMatch
    ? countryIdFromPseudoTeamId(
        finalMatch.winnerTeamId === finalMatch.homeTeamId ? finalMatch.awayTeamId : finalMatch.homeTeamId,
      )
    : null
  const finalScore = finalMatch
    ? {
        homeCountryId: countryIdFromPseudoTeamId(finalMatch.homeTeamId),
        awayCountryId: countryIdFromPseudoTeamId(finalMatch.awayTeamId),
        homeScore: finalMatch.homeScore,
        awayScore: finalMatch.awayScore,
      }
    : null

  const placements = {}
  for (const match of knockout?.matches ?? []) {
    if (match.status !== 'completed') continue
    // Brąz obsługiwany niżej — tu jego przegrany dostałby etykietę 'bronze', a to on jest
    // czwarty; brązowy medalista to ZWYCIĘZCA tego meczu.
    if (match.round === 'bronze') continue
    const loserTeamId = match.winnerTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
    placements[countryIdFromPseudoTeamId(loserTeamId)] = match.round
  }
  const bronzeMatch = knockout?.matches.find((m) => m.round === 'bronze' && m.status === 'completed')
  if (bronzeMatch?.winnerTeamId) {
    const loserTeamId =
      bronzeMatch.winnerTeamId === bronzeMatch.homeTeamId ? bronzeMatch.awayTeamId : bronzeMatch.homeTeamId
    placements[countryIdFromPseudoTeamId(bronzeMatch.winnerTeamId)] = 'bronze'
    placements[countryIdFromPseudoTeamId(loserTeamId)] = 'fourth'
  }
  if (finals.championCountryId) placements[finals.championCountryId] = 'champion'

  const groups = finals.groups.map((group) => ({
    id: group.id,
    table: nationalTournamentStandingsTable(finals.standings[group.id]).map((row) => ({
      countryId: countryIdFromPseudoTeamId(row.teamId),
      wins: row.wins,
      losses: row.losses,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst,
      diff: row.diff,
    })),
  }))
  for (const group of groups) {
    for (const row of group.table) {
      if (!(row.countryId in placements)) placements[row.countryId] = 'group'
    }
  }

  return {
    year: finals.year,
    kind: finals.kind,
    championCountryId: finals.championCountryId,
    runnerUpCountryId,
    bronzeCountryId: finals.bronzeCountryId ?? null,
    finalScore,
    placements,
    groups,
    playerStatsSnapshot: { ...finals.playerStats },
  }
}

/** Rozstrzyga zaległe mecze fazy finałowej <= `dateIso`: grupy, potem (po skompletowaniu)
 * drabinka pucharowa. Po mistrzostwie nalicza coefficient (Faza 5), buduje wiadomość,
 * dopisuje do historii, czyści stan i ustawia kolejny cykl (na przemian ME/MŚ, +2 lata). */
function advanceTournamentFinalsCycle(career, world, dateIso) {
  const nt = ensureCareerNationalTeams(career)
  const finals = nt.finals
  if (!finals) return []

  if (finals.phase === 'groupStage') {
    advanceFinalsGroupStage(finals, world, career, dateIso)
    if (isFinalsGroupStageComplete(finals)) {
      const seeds = resolveFinalsGroupStage(finals)
      buildFinalsKnockout(finals, seeds)
    }
    return []
  }

  if (finals.phase === 'knockout') {
    advanceFinalsKnockout(finals, world, career, dateIso)
    // Finał gotowy, ale czekający na decyzję gracza (Obejrzyj / Zignoruj) — patrz
    // watchableFinals.js. `finals.phase` zostaje 'knockout' aż do decyzji, więc trzeba
    // złapać wiadomość TU, przed wczesnym wyjściem niżej.
    const watchMsg = internationalFinalWatchableMessage(finals, career)
    if (watchMsg) return [watchMsg]
  }

  if (finals.phase !== 'complete') return []

  applyTournamentResultToCountryStrength(career, finals)
  const message = messageFromTournamentResult(finals, career)

  nt.history.push(buildTournamentHistoryEntry(finals))
  nt.nextTournament = { kind: finals.kind === 'euro' ? 'world' : 'euro', year: finals.year + 2 }
  nt.finals = null

  return message ? [message] : []
}

/**
 * Mecze reprezentacji zaplanowane na dany dzień — z aktywnych kwalifikacji (grupy + baraże)
 * albo z fazy finałowej (grupy + drabinka). Odpowiednik `pyramidCupFixturesOnDate` dla
 * kalendarza/huba: czysto odczytowa, zwraca `{ id, homeCountryId, awayCountryId, status,
 * homeScore, awayScore }`, więc wołający nie musi znać pseudo-drużyn `nt-<countryId>`.
 */
export function nationalTeamFixturesOnDate(nt, dateIso) {
  if (!nt || !dateIso) return []
  const day = String(dateIso).slice(0, 10)
  const out = []
  const push = (m) => {
    if (m.date !== day || !m.homeTeamId || !m.awayTeamId) return
    out.push({
      id: m.id,
      homeCountryId: countryIdFromPseudoTeamId(m.homeTeamId),
      awayCountryId: countryIdFromPseudoTeamId(m.awayTeamId),
      status: m.status,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    })
  }

  for (const campaign of nt.qualifying?.campaigns ?? []) {
    for (const f of campaign.fixtures ?? []) push(f)
    for (const m of campaign.playoff?.matches ?? []) push(m)
  }
  for (const f of nt.finals?.fixtures ?? []) push(f)
  for (const m of nt.finals?.knockout?.matches ?? []) push(m)

  return out
}

/** Hak dzienny (patrz App.jsx: computeCalendarDayStep) — kwalifikacje i finały nigdy nie są
 * aktywne jednocześnie, więc wołanie obu jest tanie (druga funkcja i tak od razu zwraca []). */
export function advanceNationalTeamsForDate(career, world, dateIso) {
  return [
    ...advanceQualifyingCycle(career, world, dateIso),
    ...advanceTournamentFinalsCycle(career, world, dateIso),
  ]
}

/** Hak sezonowy (patrz careerModel.js: createEucsCareer / startNextSeasonEucs) —
 * idempotentny: bezpieczny do wywołania więcej niż raz dla tego samego sezonu/cyklu. */
export function maybeStartNationalTeamSeason(career, { seasonYear, calendar }) {
  const nt = ensureCareerNationalTeams(career)
  const next = nt.nextTournament
  if (!next) return

  if (next.year === seasonYear + 1) {
    if (nt.finals?.year === next.year && nt.finals?.kind === next.kind) return
    startTournamentFinals(career, { kind: next.kind, year: next.year, calendar })
    return
  }
  if (next.year === seasonYear + 2) {
    if (nt.qualifying?.year === next.year && nt.qualifying?.kind === next.kind) return
    startQualifyingCampaign(career, {
      kind: next.kind,
      year: next.year,
      availableDates: calendar.internationalWindows.dates,
    })
  }
}
