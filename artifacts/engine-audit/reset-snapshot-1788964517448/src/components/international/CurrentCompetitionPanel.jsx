import { useState } from 'react'
import { academyCountryLabel, academyContinentLabel } from '../../data/academyScoutGeography.js'
import { ensureCareerNationalTeams } from '../../career/nationalTeams.js'
import { nationalTournamentStandingsTable } from '../../career/nationalTeamMatches.js'
import { countryIdFromPseudoTeamId } from '../../career/nationalTeamQualifying.js'
import { playersAwayOnNationalDuty } from '../../career/nationalTeamRanking.js'
import { resolveTeamName } from '../../ui/locale'
import { worldTeamById } from '../../career'
import PlayerProfileModal from '../PlayerProfileModal'
import InternationalBracketView from './InternationalBracketView.jsx'

function LiveGroupTable({ groupId, standings, t, lang }) {
  const table = nationalTournamentStandingsTable(standings)
  return (
    <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ufa-muted">{t.groupLabel(groupId)}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ufa-muted">
            <th className="pb-1 text-left font-normal">{t.standingsHeaders.team}</th>
            <th className="pb-1 text-right font-normal">{t.standingsHeaders.w}</th>
            <th className="pb-1 text-right font-normal">{t.standingsHeaders.l}</th>
            <th className="pb-1 text-right font-normal">{t.standingsHeaders.diff}</th>
          </tr>
        </thead>
        <tbody>
          {table.map((row) => (
            <tr key={row.teamId} className="text-ufa-text">
              <td className="py-0.5">{academyCountryLabel(countryIdFromPseudoTeamId(row.teamId), lang)}</td>
              <td className="py-0.5 text-right tabular-nums">{row.wins}</td>
              <td className="py-0.5 text-right tabular-nums">{row.losses}</td>
              <td className="py-0.5 text-right tabular-nums">{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayoffMatches({ playoff, t, lang }) {
  if (!playoff?.matches?.length) return null
  return (
    <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ufa-muted">{t.playoffTitle}</p>
      <ul className="space-y-1.5 text-xs">
        {playoff.matches.map((m) => {
          const done = m.status === 'completed'
          return (
            <li key={m.id} className="flex items-center justify-between gap-2 text-ufa-text">
              <span className="truncate">
                {academyCountryLabel(countryIdFromPseudoTeamId(m.homeTeamId), lang)} vs{' '}
                {academyCountryLabel(countryIdFromPseudoTeamId(m.awayTeamId), lang)}
              </span>
              <span className="shrink-0 tabular-nums text-ufa-muted">
                {done ? `${m.homeScore}:${m.awayScore}` : m.date ? m.date.slice(5) : '—'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function QualifyingCampaignCard({ campaign, t, lang }) {
  const phaseLabel =
    campaign.phase === 'groupStage'
      ? t.phaseGroupStage
      : campaign.phase === 'playoff'
        ? t.phasePlayoff
        : t.phaseComplete
  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ufa-text">
          {campaign.zoneContinentId ? academyContinentLabel(campaign.zoneContinentId, lang) : t.kind.euro}
        </p>
        <span className="rounded-full bg-ufa-bg px-2.5 py-1 text-[10px] font-medium text-ufa-muted ring-1 ring-ufa-border">
          {phaseLabel}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {campaign.groups.map((group) => (
          <LiveGroupTable key={group.id} groupId={group.id} standings={campaign.standings[group.id]} t={t} lang={lang} />
        ))}
      </div>
      {campaign.phase !== 'groupStage' && <div className="mt-3">
        <PlayoffMatches playoff={campaign.playoff} t={t} lang={lang} />
      </div>}
    </div>
  )
}

function YourPlayersOnDuty({ career, world, t, lang, onSelectPlayer }) {
  const rows = playersAwayOnNationalDuty(career, world)
  const provisional = rows.length > 0 && rows.every((r) => !r.calledUp)
  return (
    <div className="rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-lg shadow-black/20">
      <h3 className="text-sm font-semibold text-ufa-text">{t.yourPlayersTitle}</h3>
      {provisional && <p className="mt-1 text-xs text-ufa-muted">{t.yourPlayersProvisional}</p>}
      {!rows.length ? (
        <p className="mt-2 text-xs text-ufa-muted">{t.yourPlayersEmpty}</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {rows.map(({ player, countryId, nextFixtureDate }) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-ufa-gold/30 bg-ufa-gold/5 px-3 py-2 text-sm"
            >
              <button
                type="button"
                onClick={() => onSelectPlayer(player)}
                className="min-w-0 flex-1 truncate text-left text-ufa-text hover:text-ufa-accent hover:underline"
              >
                {player.firstName} {player.lastName}
                <span className="ml-1.5 text-xs text-ufa-muted">({academyCountryLabel(countryId, lang)})</span>
              </button>
              <span className="shrink-0 text-[11px] text-ufa-muted">
                {nextFixtureDate ? t.nextFixture(nextFixtureDate) : t.noFixtureScheduled}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Faza D planu "International Competition": aktywne kwalifikacje LUB faza finałowa (nigdy
 * oba naraz — patrz `nationalTeamSeason.js`), plus "Twoi zawodnicy w kadrach" (propozycja 1). */
export default function CurrentCompetitionPanel({ career, t, lang }) {
  const world = career?.world
  const nt = ensureCareerNationalTeams(career)
  const viewerTeam = world && career?.playerTeamId ? worldTeamById(world, career.playerTeamId) : null

  const [profilePlayer, setProfilePlayer] = useState(null)

  const qualifying = nt.qualifying
  const finals = nt.finals
  const autoQualifiedNames = (qualifying?.autoQualifiedCountryIds ?? []).map((id) => academyCountryLabel(id, lang))

  return (
    <div className="space-y-6">
      <YourPlayersOnDuty career={career} world={world} t={t} lang={lang} onSelectPlayer={setProfilePlayer} />

      {qualifying && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-ufa-text">{t.qualifyingTitle(t.kind[qualifying.kind] ?? qualifying.kind, qualifying.year)}</h3>
          {qualifying.campaigns.map((campaign, i) => (
            <QualifyingCampaignCard key={campaign.zoneContinentId ?? `campaign-${i}`} campaign={campaign} t={t} lang={lang} />
          ))}
          {!!autoQualifiedNames.length && (
            <p className="rounded-lg border border-dashed border-ufa-border bg-ufa-panel/50 p-3 text-xs text-ufa-muted">
              {t.zoneAutoQualified}: {autoQualifiedNames.join(', ')}
            </p>
          )}
        </div>
      )}

      {finals && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-ufa-text">{t.finalsTitle(t.kind[finals.kind] ?? finals.kind, finals.year)}</h3>
          {finals.phase === 'groupStage' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {finals.groups.map((group) => (
                <LiveGroupTable key={group.id} groupId={group.id} standings={finals.standings[group.id]} t={t} lang={lang} />
              ))}
            </div>
          )}
          {finals.knockout && (
            <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-xl shadow-black/20">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ufa-gold">{t.bracketTitle}</p>
              <InternationalBracketView finals={finals} t={t} lang={lang} />
            </div>
          )}
        </div>
      )}

      {!qualifying && !finals && (
        <div className="rounded-xl border border-dashed border-ufa-border bg-ufa-panel/50 p-8 text-center">
          <p className="text-sm font-semibold text-ufa-text">{t.emptyWindowTitle}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ufa-muted">
            {t.emptyWindowBody(t.kind[nt.nextTournament?.kind] ?? nt.nextTournament?.kind, nt.nextTournament?.year)}
          </p>
          {!nt.history.length && <p className="mt-2 text-xs text-ufa-muted">{t.firstCycleNote}</p>}
        </div>
      )}

      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => setProfilePlayer(null)}
        teamName={viewerTeam ? resolveTeamName(viewerTeam, lang) : null}
        isOwnPlayer
        onToggleShortlist={null}
        onScoutPlayer={null}
      />
    </div>
  )
}
