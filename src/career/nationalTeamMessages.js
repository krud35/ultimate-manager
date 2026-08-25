/**
 * Faza 5 planu kadr narodowych: wiadomości do skrzynki o kwalifikacjach/turnieju.
 * Reużywa istniejący typ `INBOX_TYPES.CLUB_NEWS` z własnym `payload.kind` — dokładnie ten
 * sam wzorzec co `sponsor_payout`/`league_placement_prize` itd. (patrz inbox.js) — więc
 * ZERO zmian w `INBOX_TYPES`/`INBOX_TYPE_META` samego inbox.js. Czyste FYI bez żadnej
 * decyzji do podjęcia, więc oba kindy są w `SILENT_CLUB_NEWS_KINDS` (inbox.js) — trafiają
 * do skrzynki, ale nie przerywają pętli "symuluj dalej".
 */
import { createInboxMessage, INBOX_TYPES } from './inbox.js'
import { academyCountryLabel } from '../data/academyScoutGeography.js'
import { countryIdFromPseudoTeamId } from './nationalTeamQualifying.js'

function tournamentKindLabel(kind, lang) {
  if (kind === 'world') return lang === 'en' ? 'World Championship' : 'Mistrzostwa Świata'
  return lang === 'en' ? 'European Championship' : 'Mistrzostwa Europy'
}

function countryListLabel(countryIds, lang) {
  const labels = (countryIds ?? []).map((id) => academyCountryLabel(id, lang))
  return labels.length ? labels.join(', ') : lang === 'en' ? 'none' : 'brak'
}

/** Wiadomość podsumowująca zakończone kwalifikacje — kto się zakwalifikował. */
export function messageFromQualifyingResult(qualifying, career) {
  if (!qualifying || qualifying.phase !== 'complete') return null
  const kindPl = tournamentKindLabel(qualifying.kind, 'pl')
  const kindEn = tournamentKindLabel(qualifying.kind, 'en')
  const qualifiedPl = countryListLabel(qualifying.qualifiedCountryIds, 'pl')
  const qualifiedEn = countryListLabel(qualifying.qualifiedCountryIds, 'en')
  const count = qualifying.qualifiedCountryIds?.length ?? 0

  return createInboxMessage({
    type: INBOX_TYPES.CLUB_NEWS,
    title: `Kwalifikacje zakończone: ${kindPl} ${qualifying.year}`,
    titleEn: `Qualifying complete: ${kindEn} ${qualifying.year}`,
    body: `Zakwalifikowane reprezentacje (${count}): ${qualifiedPl}.`,
    bodyEn: `Qualified national teams (${count}): ${qualifiedEn}.`,
    date: career?.league?.currentDate ?? null,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    payload: {
      kind: 'nationalTeamQualifying',
      tournamentKind: qualifying.kind,
      year: qualifying.year,
      qualifiedCountryIds: qualifying.qualifiedCountryIds ?? [],
    },
  })
}

/** Wiadomość o zakończonym turnieju — mistrz, finalista, wynik finału. */
export function messageFromTournamentResult(finals, career) {
  if (!finals?.knockout || finals.phase !== 'complete') return null
  const kindPl = tournamentKindLabel(finals.kind, 'pl')
  const kindEn = tournamentKindLabel(finals.kind, 'en')
  const championPl = academyCountryLabel(finals.championCountryId, 'pl')
  const championEn = academyCountryLabel(finals.championCountryId, 'en')

  const finalMatch = finals.knockout.matches.find((m) => m.round === 'final')
  const runnerUpTeamId = finalMatch
    ? finalMatch.winnerTeamId === finalMatch.homeTeamId
      ? finalMatch.awayTeamId
      : finalMatch.homeTeamId
    : null
  const runnerUpCountryId = runnerUpTeamId ? countryIdFromPseudoTeamId(runnerUpTeamId) : null
  const runnerUpPl = runnerUpCountryId ? academyCountryLabel(runnerUpCountryId, 'pl') : '—'
  const runnerUpEn = runnerUpCountryId ? academyCountryLabel(runnerUpCountryId, 'en') : '—'
  const score = finalMatch ? `${finalMatch.homeScore}:${finalMatch.awayScore}` : '—'
  const scoreEn = finalMatch ? `${finalMatch.homeScore}-${finalMatch.awayScore}` : '—'

  return createInboxMessage({
    type: INBOX_TYPES.CLUB_NEWS,
    title: `${kindPl} ${finals.year}: mistrzem zostaje ${championPl}!`,
    titleEn: `${kindEn} ${finals.year}: champions are ${championEn}!`,
    body: `${championPl} pokonuje w finale ${runnerUpPl} (${score}) i zdobywa tytuł.`,
    bodyEn: `${championEn} beat ${runnerUpEn} in the final (${scoreEn}) to win the title.`,
    date: career?.league?.currentDate ?? null,
    seasonIndex: career?.seasonIndex ?? null,
    seasonYear: career?.seasonYear ?? null,
    payload: {
      kind: 'nationalTeamTournament',
      tournamentKind: finals.kind,
      year: finals.year,
      championCountryId: finals.championCountryId,
      runnerUpCountryId,
    },
  })
}
