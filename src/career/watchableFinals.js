/**
 * "Obejrzyj finał" — finał Pucharu Stycznia i finał kadry (ME/MŚ), gdy gracz w nim nie
 * gra, można albo zignorować (rozstrzyga się jak dotychczas, silnikiem szybkim), albo
 * obejrzeć na żywo pełnym silnikiem z wizualizacją (MatchView w `spectatorMode` — patrz
 * App.jsx). Wiadomość w skrzynce blokuje "Dalej" dokładnie tak samo jak decyzja ze
 * zdarzenia losowego (patrz `isImportantInboxMessage` w inbox.js).
 *
 * Detekcja "finał gotowy, bez decyzji" i pominięcie automatycznego rozstrzygnięcia mieszka
 * przy silnikach obu rozgrywek (`league/dayEngine.js`: simulateFixturesOnDate,
 * `nationalTeamFinals.js`: advanceFinalsKnockout — oba ustawiają `watchDecision: 'pending'`
 * na meczu). Ten moduł tylko: buduje wiadomość do skrzynki (wołane z dziennego kroku, który
 * ma dostęp i do `career`, i do świeżo policzonego stanu ligi/kadr) oraz rozstrzyga wybór
 * gracza (Zignoruj / Oglądaj / zapisz wynik obejrzanego meczu).
 */
import { createInboxMessage, INBOX_TYPES } from './inbox.js'
import { academyCountryLabel } from '../data/academyScoutGeography.js'
import { countryIdFromPseudoTeamId } from './nationalTeamQualifying.js'
import { selectNationalSquad } from './nationalTeams.js'
import { nationalTeamPseudoTeam } from './nationalTeamMatches.js'
import { resolveKnockoutMatchNow, applyKnockoutMatchResult } from './nationalTeamFinals.js'
import { simulateFixtureMatch, leagueRecordFromEngineResult } from '../league/leagueEngine.js'
import { applyCupMatchResult } from '../league/dayEngine.js'
import { teamFromLeague } from './worldState.js'
import { resolveTeamName } from '../ui/locale.js'

function hasPendingWatchableFinalMessage(career, matchId) {
  return (career?.inbox ?? []).some(
    (m) =>
      m.type === INBOX_TYPES.WATCHABLE_FINAL &&
      m.payload?.matchId === matchId &&
      m.payload?.status === 'pending',
  )
}

function tournamentKindLabel(kind, lang) {
  if (kind === 'world') return lang === 'en' ? 'World Championship' : 'Mistrzostwa Świata'
  return lang === 'en' ? 'European Championship' : 'Mistrzostwa Europy'
}

/** Nowa wiadomość dla finału Pucharu Stycznia — wołane z calendarSimulation.js po dziennym
 * kroku, gdy dayEngine.js zostawił finał nierozstrzygnięty (`watchDecision === 'pending'`). */
export function cupFinalWatchableMessage(league, career) {
  const final = league?.cup?.matches?.find((m) => m.round === 'final' && m.watchDecision === 'pending')
  if (!final || hasPendingWatchableFinalMessage(career, final.id)) return null

  const homeTeam = teamFromLeague(league, final.homeTeamId)
  const awayTeam = teamFromLeague(league, final.awayTeamId)
  const homeLabel = homeTeam ? resolveTeamName(homeTeam, 'pl') : final.homeTeamId
  const awayLabel = awayTeam ? resolveTeamName(awayTeam, 'pl') : final.awayTeamId
  const homeLabelEn = homeTeam ? resolveTeamName(homeTeam, 'en') : final.homeTeamId
  const awayLabelEn = awayTeam ? resolveTeamName(awayTeam, 'en') : final.awayTeamId

  return createInboxMessage({
    type: INBOX_TYPES.WATCHABLE_FINAL,
    title: `Finał Pucharu Stycznia: ${homeLabel} – ${awayLabel}`,
    titleEn: `January Cup final: ${homeLabelEn} – ${awayLabelEn}`,
    body: 'Możesz obejrzeć ten mecz na żywo (pełna wizualizacja, bez dostępu do taktyk) albo pozwolić, żeby rozstrzygnął się automatycznie.',
    bodyEn: 'You can watch this match live (full visualization, no tactics access) or let it resolve automatically.',
    date: league.currentDate,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    payload: {
      kind: 'watchable_final',
      competition: 'januaryCup',
      matchId: final.id,
      homeTeamId: final.homeTeamId,
      awayTeamId: final.awayTeamId,
      homeLabel,
      awayLabel,
      homeLabelEn,
      awayLabelEn,
      date: final.date,
      status: 'pending',
    },
  })
}

/** Analogiczna wiadomość dla finału ME/MŚ — wołane z nationalTeamSeason.js po
 * advanceFinalsKnockout, gdy ten zostawił finał `watchDecision === 'pending'`. */
export function internationalFinalWatchableMessage(finals, career) {
  const final = finals?.knockout?.matches?.find((m) => m.round === 'final' && m.watchDecision === 'pending')
  if (!final || hasPendingWatchableFinalMessage(career, final.id)) return null

  const homeCountryId = countryIdFromPseudoTeamId(final.homeTeamId)
  const awayCountryId = countryIdFromPseudoTeamId(final.awayTeamId)
  const homeLabel = academyCountryLabel(homeCountryId, 'pl')
  const awayLabel = academyCountryLabel(awayCountryId, 'pl')
  const homeLabelEn = academyCountryLabel(homeCountryId, 'en')
  const awayLabelEn = academyCountryLabel(awayCountryId, 'en')
  const kindPl = tournamentKindLabel(finals.kind, 'pl')
  const kindEn = tournamentKindLabel(finals.kind, 'en')

  return createInboxMessage({
    type: INBOX_TYPES.WATCHABLE_FINAL,
    title: `Finał ${kindPl} ${finals.year}: ${homeLabel} – ${awayLabel}`,
    titleEn: `${kindEn} ${finals.year} final: ${homeLabelEn} – ${awayLabelEn}`,
    body: 'Możesz obejrzeć finał na żywo (pełna wizualizacja, bez dostępu do taktyk) albo pozwolić, żeby rozstrzygnął się automatycznie.',
    bodyEn: 'You can watch the final live (full visualization, no tactics access) or let it resolve automatically.',
    date: final.date,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    payload: {
      kind: 'watchable_final',
      competition: 'international',
      matchId: final.id,
      homeTeamId: final.homeTeamId,
      awayTeamId: final.awayTeamId,
      homeCountryId,
      awayCountryId,
      homeLabel,
      awayLabel,
      homeLabelEn,
      awayLabelEn,
      tournamentKind: finals.kind,
      tournamentYear: finals.year,
      date: final.date,
      status: 'pending',
    },
  })
}

/** "Zignoruj": rozstrzyga finał NATYCHMIAST silnikiem szybkim — ten sam efekt, jaki dałby
 * kolejny dzień symulacji, bez czekania na kolejne kliknięcie "Dalej". Mutuje `career.league`
 * (klon — wołający decyduje) / `career.nationalTeams` (w miejscu, jak reszta kadr). */
export function resolveWatchableFinalIgnore(career, message) {
  const payload = message.payload ?? {}
  if (payload.competition === 'januaryCup') {
    const league = career.league
    const fixture = league?.cup?.matches?.find((m) => m.id === payload.matchId)
    if (!fixture) return null
    fixture.watchDecision = 'ignored'
    if (fixture.status === 'completed') return { league }
    const record = simulateFixtureMatch(league, fixture)
    applyCupMatchResult(league, fixture, record)
    return { league }
  }
  if (payload.competition === 'international') {
    const finals = career.nationalTeams?.finals
    const match = finals?.knockout?.matches?.find((m) => m.id === payload.matchId)
    if (!match || !finals) return null
    match.watchDecision = 'ignored'
    if (match.status !== 'completed') {
      resolveKnockoutMatchNow(finals, career.world, career, match)
    }
    return { nationalTeams: career.nationalTeams }
  }
  return null
}

/** "Oglądaj": oznacza mecz jako "w trakcie oglądania" (nie będzie już powiadamiał) i
 * zwraca dane potrzebne do uruchomienia widza (MatchView w `spectatorMode`, App.jsx). */
export function beginWatchingFinal(career, message) {
  const payload = message.payload ?? {}
  if (payload.competition === 'januaryCup') {
    const fixture = career.league?.cup?.matches?.find((m) => m.id === payload.matchId)
    if (!fixture) return null
    fixture.watchDecision = 'watching'
    return { league: career.league, fixture }
  }
  if (payload.competition === 'international') {
    const finals = career.nationalTeams?.finals
    const match = finals?.knockout?.matches?.find((m) => m.id === payload.matchId)
    if (!match || !finals) return null
    match.watchDecision = 'watching'
    const homeSquad = selectNationalSquad(career.world, career, payload.homeCountryId, {
      seasonYear: finals.year,
    })
    const awaySquad = selectNationalSquad(career.world, career, payload.awayCountryId, {
      seasonYear: finals.year,
    })
    const homeTeam = nationalTeamPseudoTeam(homeSquad)
    const awayTeam = nationalTeamPseudoTeam(awaySquad)
    return { nationalTeams: career.nationalTeams, match, homeTeam, awayTeam }
  }
  return null
}

/** Po zakończeniu widza: wpisuje wynik z sesji NA ŻYWO dokładnie tak, jak zrobiłby to
 * silnik szybki w tle (ta sama logika zamknięcia — applyCupMatchResult / applyKnockoutMatchResult),
 * tylko z rekordem policzonym przez pełny silnik zamiast fastMode. */
export function completeWatchedFinal(career, message, engineResult, extra = {}) {
  const payload = message.payload ?? {}
  if (payload.competition === 'januaryCup') {
    const league = career.league
    const fixture = league?.cup?.matches?.find((m) => m.id === payload.matchId)
    if (!fixture) return null
    const record = leagueRecordFromEngineResult(fixture, engineResult, false)
    applyCupMatchResult(league, fixture, record)
    return { league }
  }
  if (payload.competition === 'international') {
    const finals = career.nationalTeams?.finals
    const match = finals?.knockout?.matches?.find((m) => m.id === payload.matchId)
    if (!match || !finals) return null
    const record = leagueRecordFromEngineResult(
      { id: match.id, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
      engineResult,
      false,
    )
    applyKnockoutMatchResult(finals, match, record, extra.homeTeam, extra.awayTeam)
    return { nationalTeams: career.nationalTeams }
  }
  return null
}
