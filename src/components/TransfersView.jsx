import { useUiLang } from '../ui/UiLangContext'
import { pickLabel } from '../ui/locale'
import { transfersStrings } from '../ui/strings/transfers'
import { translateTransferError } from '../ui/strings/transferErrors'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getOverallRating } from '../data/mockPlayers'
import PlayerProfileModal from './PlayerProfileModal'
import NegotiateModal from './NegotiateModal'
import LoanTermsModal from './LoanTermsModal'
import {
  formatUsd,
  formatUsdCompact,
  getPlayerMarketValue,
  getTransferBudget,
  getSalaryBudget,
  getTransferWindowState,
  listTransferMarketWithFreeAgents,
  buildTransferRowForPlayer,
  submitTransferOffer,
  simulateAiTransferActivity,
  worldTeamById,
  teamWeeklyWageBill,
  mergeInbox,
  getPlayerKnowledge,
  isPlayerShortlisted,
  toggleShortlist,
  hasPendingScoutMission,
  queueScoutMission,
  scoutMissionCost,
  findPlayerTeamId,
  setPlayerTransferListed,
  listActiveLoans,
  queueLoanInRequest,
  decideLoanBuyClause,
} from '../career'

function WindowBanner({ windowState }) {
  const { lang } = useUiLang()
  const t = transfersStrings(lang)
  if (windowState.open) {
    return (
      <div className="rounded-lg border border-ufa-accent/40 bg-ufa-accent/10 px-4 py-3">
        <p className="text-sm font-semibold text-ufa-accent">{pickLabel(windowState, lang)}</p>
        <p className="mt-0.5 text-xs text-ufa-muted">{t.windowOpenHint}</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-ufa-border bg-ufa-bg/60 px-4 py-3">
      <p className="text-sm font-semibold text-ufa-text">{t.windowClosed}</p>
      <p className="mt-0.5 text-xs text-ufa-muted">{t.windowClosedHint}</p>
    </div>
  )
}

function formatTransferDate(entry, lang = 'pl') {
  if (entry?.date) return entry.date
  if (entry?.at) {
    try {
      return new Date(entry.at).toLocaleDateString(lang === 'en' ? 'en-US' : 'pl-PL')
    } catch {
      return '—'
    }
  }
  return '—'
}

export default function TransfersView({ career, onCareerUpdate, scope = 'club' }) {
  const { lang } = useUiLang()
  const t = transfersStrings(lang)
  const isClub = scope === 'club'
  const windowState = getTransferWindowState(career)
  const buyer = worldTeamById(career.world, career.playerTeamId)
  const budget = getTransferBudget(buyer)
  const salaryBudget = getSalaryBudget(buyer)
  const weeklyBill = teamWeeklyWageBill(buyer)

  const [teamFilter, setTeamFilter] = useState('all')
  const [sortKey, setSortKey] = useState('value')
  const [query, setQuery] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null)
  const [loanRow, setLoanRow] = useState(null)
  const [profilePlayer, setProfilePlayer] = useState(null)
  const [profileTeamName, setProfileTeamName] = useState(null)
  const [flash, setFlash] = useState(null)
  const [historyFilter, setHistoryFilter] = useState(isClub ? 'mine' : 'all')
  const summerWaveLock = useRef(false)
  useEffect(() => {
    setHistoryFilter(isClub ? 'mine' : 'all')
  }, [isClub])

  // Fale AI w oknie letnim (po oficjalnym końcu sezonu) przy wejściu w zakładkę (max 3).
  useEffect(() => {
    if (!windowState.open || windowState.kind !== 'summer') return
    if (career.phase !== 'season_complete') return
    if (summerWaveLock.current) return
    const waves = career.aiOffseasonTransferWaves ?? 0
    if (waves >= 3) return
    summerWaveLock.current = true
    const ai = simulateAiTransferActivity(career, {
      mode: 'burst',
      maxDeals: 4,
      date: `summer-wave-${career.seasonYear}-${career.seasonIndex}-${waves + 1}`,
    })
    onCareerUpdate({
      world: ai.world ?? career.world,
      transferLog: ai.transferLog ?? career.transferLog,
      loanLog: ai.loanLog ?? career.loanLog,
      aiOffseasonTransferWaves: waves + 1,
    })
    if (ai.deals?.length) {
      setFlash({
        type: 'ok',
        text: t.aiWave(ai.deals.length),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowState.open, windowState.kind, career.seasonIndex, career.phase])

  // `career.world` mutuje się w miejscu (transferListed toggle) — referencja się nie zmienia,
  // więc doliczamy licznik odświeżenia, żeby memoizacja rzeczywiście przeliczyła się po toggle
  // wykonanym bez opuszczania tego widoku.
  const [listedRefreshTick, setListedRefreshTick] = useState(0)

  const market = useMemo(
    () => listTransferMarketWithFreeAgents(career.world, career.playerTeamId),
    [career.world, career.playerTeamId, listedRefreshTick],
  )

  const teams = useMemo(() => {
    const map = new Map()
    for (const row of market) {
      if (!row.teamId) {
        map.set('__fa__', lang === 'en' ? 'Free Agents' : 'Wolni agenci')
        continue
      }
      if (!map.has(row.teamId)) map.set(row.teamId, row.teamName)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [market, lang])

  const rows = useMemo(() => {
    let list = market
    if (teamFilter === '__fa__') list = list.filter((r) => r.freeAgent)
    else if (teamFilter !== 'all') list = list.filter((r) => r.teamId === teamFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.teamName ?? '').toLowerCase().includes(q),
      )
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      const listedDiff = (b.listed ? 1 : 0) - (a.listed ? 1 : 0)
      if (listedDiff !== 0) return listedDiff
      if (sortKey === 'age') return (a.age ?? 99) - (b.age ?? 99)
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      return b.marketValue - a.marketValue
    })
    return sorted
  }, [market, teamFilter, query, sortKey])

  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)

  const visibleRows = useMemo(() => {
    if (pageSize === 0) return rows
    const start = safePage * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, pageSize, safePage])

  useEffect(() => {
    setPage(0)
  }, [teamFilter, query, sortKey, pageSize])

  const ownRoster = useMemo(() => {
    const players = [...(buyer?.players ?? [])]
    players.sort((a, b) => getOverallRating(b.skills) - getOverallRating(a.skills))
    return players
  }, [buyer])

  const myListed = useMemo(
    () => (isClub ? (buyer?.players ?? []).filter((p) => p.transferListed) : []),
    [buyer, isClub, listedRefreshTick],
  )

  const handleRemoveFromList = (playerId) => {
    const result = setPlayerTransferListed(buyer, playerId, false)
    if (result.ok) {
      setListedRefreshTick((t) => t + 1)
      onCareerUpdate({ world: career.world })
    }
  }

  const activeLoans = useMemo(
    () => listActiveLoans(career.world, { teamId: career.playerTeamId }),
    [career.world, career.playerTeamId, listedRefreshTick],
  )
  const loansOut = useMemo(
    () => activeLoans.filter((l) => l.parentTeamId === career.playerTeamId),
    [activeLoans, career.playerTeamId],
  )
  const loansIn = useMemo(
    () => activeLoans.filter((l) => l.destinationTeamId === career.playerTeamId),
    [activeLoans, career.playerTeamId],
  )

  const handleLoanRequest = (terms) => {
    if (!loanRow) return
    const result = queueLoanInRequest(career, {
      playerId: loanRow.playerId,
      fee: terms.fee,
      durationPreset: terms.durationPreset,
      wageSplitPct: terms.wageSplitPct,
      buyClause: terms.buyClause,
    })
    if (!result.ok) {
      setFlash({ type: 'error', text: translateTransferError(result.error, lang) ?? t.transferError })
      return
    }
    onCareerUpdate({ inbox: mergeInbox(career, [result.message]) })
    setFlash({ type: 'ok', text: t.loanSentFlash })
    setLoanRow(null)
  }

  const handleLoanBuyClauseDecision = (playerId, exercise) => {
    const result = decideLoanBuyClause(career, { playerId, exercise })
    if (result.ok) {
      setListedRefreshTick((tick) => tick + 1)
      onCareerUpdate({
        world: result.world ?? career.world,
        loanLog: result.loanLogEntry
          ? [...(career.loanLog ?? []), result.loanLogEntry]
          : career.loanLog,
        transferLog: result.transferLog ?? career.transferLog,
      })
    }
  }

  const log = career.transferLog ?? []

  const historyRows = useMemo(() => {
    let list = [...log].reverse()
    if (historyFilter === 'mine') {
      list = list.filter((e) => e.involvesPlayer)
    } else if (historyFilter === 'ai') {
      list = list.filter((e) => !e.involvesPlayer)
    }
    return list
  }, [log, historyFilter])

  const handleOffer = (offerAmount, contractTerms = null) => {
    if (!selected) return
    const result = submitTransferOffer(career, { row: selected, offerAmount, contractTerms })
    if (!result.ok) {
      const text =
        result.code === 'negative_budget'
          ? t.negativeBudgetBlock
          : translateTransferError(result.error, lang) ?? t.transferError
      setFlash({ type: 'error', text })
      return
    }
    if (result.kind === 'fa_signed') {
      onCareerUpdate({ world: result.world, transferLog: result.transferLog })
      setFlash({ type: 'ok', text: t.faSigned })
    } else {
      onCareerUpdate({ inbox: mergeInbox(career, [result.message]) })
      setFlash({ type: 'ok', text: result.flash ?? t.offerSentFlash })
    }
    setSelected(null)
  }

  return (
    <div className="space-y-6 league-fade-in">
      <div className="rounded-xl border border-ufa-border bg-ufa-panel p-6 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ufa-text">
              {isClub ? t.clubTitle : t.leagueTitle}
            </h2>
            <p className="mt-1 text-sm text-ufa-muted">
              {isClub
                ? t.clubBudgetHint(buyer?.name ?? t.yourClub)
                : t.leagueMarketHint}
            </p>
          </div>
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/60 px-4 py-3 min-w-[220px] space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-ufa-muted">{t.transferBudget}</p>
              <p className="text-xl font-bold tabular-nums text-ufa-accent">{formatUsd(budget)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-ufa-border/60 pt-2">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ufa-muted">{t.salaryBudget}</p>
                <p className="text-sm font-semibold tabular-nums text-ufa-gold">
                  {formatUsd(salaryBudget)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ufa-muted">{t.weeklyWageBill}</p>
                <p className="text-sm font-semibold tabular-nums text-ufa-text">
                  {formatUsd(weeklyBill)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <WindowBanner windowState={windowState} />
        </div>

        {flash && (
          <p
            className={`mt-3 text-sm ${
              flash.type === 'ok'
                ? 'text-ufa-accent'
                : flash.type === 'error'
                  ? 'text-red-400'
                  : 'text-ufa-gold'
            }`}
          >
            {flash.text}
          </p>
        )}
      </div>

      {isClub && myListed.length > 0 && (
        <section className="rounded-xl border border-ufa-border bg-ufa-panel p-4 sm:p-6 shadow-xl shadow-black/30">
          <h3 className="text-sm font-semibold text-ufa-text">{t.myListedTitle}</h3>
          <ul className="mt-3 space-y-2">
            {myListed.map((p) => {
              const ovr = getOverallRating(p.skills)
              const value = getPlayerMarketValue(p)
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ufa-border/60 bg-ufa-bg/40 px-3 py-2 text-sm"
                >
                  <span className="text-ufa-text">
                    {p.firstName} {p.lastName}
                    <span className="text-ufa-muted"> · {ovr}</span>
                    <span className="text-ufa-gold tabular-nums"> · {formatUsdCompact(value)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFromList(p.id)}
                    className="rounded-md px-3 py-1 text-xs font-medium text-ufa-muted ring-1 ring-ufa-border hover:bg-ufa-panel-hover hover:text-ufa-text"
                  >
                    {t.removeFromListAction}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {isClub && (loansOut.length > 0 || loansIn.length > 0) && (
        <section className="rounded-xl border border-ufa-border bg-ufa-panel p-4 sm:p-6 shadow-xl shadow-black/30 space-y-4">
          {loansOut.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-ufa-text">{t.myLoansOutTitle}</h3>
              <ul className="mt-3 space-y-2">
                {loansOut.map((l) => (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ufa-border/60 bg-ufa-bg/40 px-3 py-2 text-sm"
                  >
                    <span className="text-ufa-text">
                      {l.playerName}
                      <span className="text-ufa-muted"> · {l.destinationTeamName}</span>
                    </span>
                    <span className="text-xs text-ufa-muted tabular-nums">
                      {t.loanReturnDateLabel}: {l.returnDate}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {loansIn.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-ufa-text">{t.myLoansInTitle}</h3>
              <ul className="mt-3 space-y-2">
                {loansIn.map((l) => (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ufa-border/60 bg-ufa-bg/40 px-3 py-2 text-sm"
                  >
                    <span className="text-ufa-text">
                      {l.playerName}
                      <span className="text-ufa-muted"> · {l.parentTeamName}</span>
                    </span>
                    {l.status === 'pending_buy_decision' && l.buyClause ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoanBuyClauseDecision(l.playerId, true)}
                          className="rounded-md bg-ufa-accent/15 px-3 py-1 text-xs font-semibold text-ufa-accent ring-1 ring-ufa-accent/30 hover:bg-ufa-accent/25"
                        >
                          {t.loanExerciseBuyClause(formatUsdCompact(l.buyClause.fee))}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoanBuyClauseDecision(l.playerId, false)}
                          className="rounded-md px-3 py-1 text-xs font-medium text-ufa-muted ring-1 ring-ufa-border hover:bg-ufa-panel-hover hover:text-ufa-text"
                        >
                          {t.loanLetReturn}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-ufa-muted tabular-nums">
                        {t.loanReturnDateLabel}: {l.returnDate}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 sm:p-6 shadow-xl shadow-black/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-ufa-text">{t.marketTitle}</h3>
            <div className="flex flex-wrap gap-2">
              <input
                type="search"
                placeholder={t.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-md border border-ufa-border bg-ufa-bg px-3 py-1.5 text-sm text-ufa-text min-w-[180px]"
              />
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="rounded-md border border-ufa-border bg-ufa-bg px-3 py-1.5 text-sm text-ufa-text"
              >
                <option value="all">{t.allClubs}</option>
                {teams.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="rounded-md border border-ufa-border bg-ufa-bg px-3 py-1.5 text-sm text-ufa-text"
              >
                <option value="value">{t.sortValue}</option>
                <option value="age">{t.sortAge}</option>
                <option value="name">{t.sortName}</option>
              </select>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-md border border-ufa-border bg-ufa-bg px-3 py-1.5 text-sm text-ufa-text"
                title={t.listSizeTitle}
              >
                <option value={20}>{t.showN(20)}</option>
                <option value={50}>{t.showN(50)}</option>
                <option value={100}>{t.showN(100)}</option>
                <option value={0}>{t.showAll}</option>
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ufa-muted">
                <tr className="border-b border-ufa-border">
                  <th className="px-2 py-2 font-medium">{t.player}</th>
                  <th className="px-2 py-2 font-medium">{t.club}</th>
                  <th className="px-2 py-2 font-medium">{t.age}</th>
                  <th className="px-2 py-2 font-medium">{t.value}</th>
                  <th className="px-2 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={`${row.teamId ?? 'fa'}-${row.playerId}`}
                    className="border-b border-ufa-border/70 hover:bg-ufa-bg/40"
                  >
                    <td className="px-2 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setProfilePlayer(row.player ?? null)
                            setProfileTeamName(row.teamName ?? null)
                          }}
                          className="font-medium text-ufa-accent hover:underline text-left"
                          title={t.viewProfile}
                        >
                          {row.name}
                        </button>
                        {row.rank === 0 && (
                          <span className="text-[10px] text-ufa-gold">★ #1</span>
                        )}
                        {row.listed && (
                          <span className="rounded bg-ufa-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-ufa-gold ring-1 ring-ufa-gold/40">
                            {t.transferListedBadge}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-ufa-muted">{row.teamShort}</td>
                    <td className="px-2 py-2.5 tabular-nums text-ufa-text">
                      {row.age ?? '—'}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-ufa-text">
                      {formatUsdCompact(row.marketValue)}
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={false}
                        onClick={() => {
                          setSelected(row)
                          setFlash(null)
                        }}
                        className="rounded-md bg-ufa-accent/15 px-3 py-1.5 text-xs font-semibold text-ufa-accent ring-1 ring-ufa-accent/30 hover:bg-ufa-accent/25 disabled:opacity-40"
                      >
                        {t.negotiate}
                      </button>
                      {isClub && !row.freeAgent && (
                        <button
                          type="button"
                          onClick={() => {
                            setLoanRow(row)
                            setFlash(null)
                          }}
                          className="ml-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-ufa-text ring-1 ring-ufa-border hover:bg-ufa-panel-hover"
                        >
                          {t.loan}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-8 text-center text-ufa-muted">
                      {t.noPlayers}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-ufa-muted">
              <p>
                {t.showingOf(
                  pageSize === 0
                    ? rows.length
                    : Math.min(pageSize, rows.length - safePage * pageSize),
                  rows.length,
                )}
                {pageSize !== 0 && pageCount > 1 && t.pageOf(safePage + 1, pageCount)}
              </p>
              {pageSize !== 0 && pageCount > 1 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="rounded-md border border-ufa-border px-3 py-1.5 text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
                  >
                    {t.prev}
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    className="rounded-md border border-ufa-border px-3 py-1.5 text-ufa-text hover:bg-ufa-panel-hover disabled:opacity-40"
                  >
                    {t.next}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-ufa-border bg-ufa-panel p-4 shadow-xl shadow-black/30">
            <h3 className="text-sm font-semibold text-ufa-text">{t.yourRosterValues}</h3>
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
              {ownRoster.map((p) => {
                const ovr = getOverallRating(p.skills)
                const value = getPlayerMarketValue(p)
                const wage = p.contract?.weeklyWage
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 border-b border-ufa-border/50 pb-2"
                  >
                    <span className="text-ufa-text truncate">
                      {p.firstName} {p.lastName}
                      <span className="text-ufa-muted"> · {ovr}</span>
                      {wage != null && (
                        <span className="text-ufa-muted"> · {formatUsdCompact(wage)}{t.perWeekShort}</span>
                      )}
                    </span>
                    <span className="tabular-nums text-ufa-accent shrink-0">
                      {formatUsdCompact(value)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>
      </div>

      {/* {t.history} */}
      <section className="rounded-xl border border-ufa-border bg-ufa-panel p-4 sm:p-6 shadow-xl shadow-black/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ufa-text">{t.history}</h3>
            <p className="mt-0.5 text-xs text-ufa-muted">
              {isClub
                ? t.yourDeals(log.length)
                : t.allDeals(log.length)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-ufa-bg p-1 ring-1 ring-ufa-border">
            {(isClub
              ? [
                  { id: 'mine', label: t.historyMine },
                  { id: 'all', label: t.historyAll },
                  { id: 'ai', label: t.historyAi },
                ]
              : [
                  { id: 'all', label: t.historyAll },
                  { id: 'mine', label: t.historyMine },
                  { id: 'ai', label: t.historyAi },
                ]
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setHistoryFilter(f.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  historyFilter === f.id
                    ? 'bg-ufa-accent text-ufa-bg'
                    : 'text-ufa-muted hover:text-ufa-text'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ufa-muted">
              <tr className="border-b border-ufa-border">
                <th className="px-2 py-2 font-medium">{t.date}</th>
                <th className="px-2 py-2 font-medium">{t.player}</th>
                <th className="px-2 py-2 font-medium">{t.from}</th>
                <th className="px-2 py-2 font-medium">{t.to}</th>
                <th className="px-2 py-2 font-medium">{t.fee}</th>
                <th className="px-2 py-2 font-medium">{t.windowCol}</th>
                <th className="px-2 py-2 font-medium">{t.type}</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b border-ufa-border/70 ${
                    e.involvesPlayer ? 'bg-ufa-accent/5' : ''
                  }`}
                >
                  <td className="px-2 py-2.5 tabular-nums text-ufa-muted whitespace-nowrap">
                    {formatTransferDate(e, lang)}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="font-medium text-ufa-text">{e.playerName}</span>
                    {e.playerOvr != null && (
                      <span className="text-ufa-muted"> · {e.playerOvr}</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-ufa-muted">{e.fromTeamName}</td>
                  <td className="px-2 py-2.5 text-ufa-text">{e.toTeamName}</td>
                  <td className="px-2 py-2.5 tabular-nums font-semibold text-ufa-accent">
                    {formatUsdCompact(e.fee)}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-ufa-muted">
                    {e.window === 'january'
                      ? t.january
                      : e.window === 'summer' || e.window === 'offseason'
                        ? t.summer
                        : '—'}
                  </td>
                  <td className="px-2 py-2.5">
                    {e.involvesPlayer ? (
                      <span className="rounded bg-ufa-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-ufa-accent ring-1 ring-ufa-accent/30">
                        {t.you}
                      </span>
                    ) : (
                      <span className="rounded bg-ufa-bg px-1.5 py-0.5 text-[10px] text-ufa-muted ring-1 ring-ufa-border">
                        {t.historyAi}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {historyRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-8 text-center text-ufa-muted">
                    {t.noTransfersCat}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <NegotiateModal
          row={selected}
          budget={budget}
          onClose={() => setSelected(null)}
          onSubmitOffer={handleOffer}
        />
      )}

      {loanRow && (
        <LoanTermsModal
          mode="in"
          row={loanRow}
          budget={budget}
          onClose={() => setLoanRow(null)}
          onSubmit={handleLoanRequest}
        />
      )}

      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => {
          setProfilePlayer(null)
          setProfileTeamName(null)
        }}
        leaguePlayerStats={career.league?.playerStats}
        teamName={profileTeamName}
        isOwnPlayer={false}
        knowledge={profilePlayer ? getPlayerKnowledge(buyer, profilePlayer.id) : null}
        isShortlisted={profilePlayer ? isPlayerShortlisted(buyer, profilePlayer.id) : false}
        scoutPending={
          profilePlayer
            ? hasPendingScoutMission(buyer, { kind: 'player', targetPlayerId: profilePlayer.id })
            : false
        }
        scoutCost={buyer ? scoutMissionCost('player', buyer) : null}
        onToggleShortlist={(playerId) => {
          toggleShortlist(buyer, playerId)
          onCareerUpdate({ world: career.world })
        }}
        onScoutPlayer={(playerId) => {
          const clubId = findPlayerTeamId(career.world, playerId)
          const result = queueScoutMission(buyer, {
            kind: 'player',
            targetPlayerId: playerId,
            opponentTeamId: clubId,
            date: career.league?.currentDate ?? null,
          })
          if (result.ok) onCareerUpdate({ world: career.world })
          return result
        }}
        onStartNegotiation={(playerId) => {
          const row = buildTransferRowForPlayer(career.world, career.playerTeamId, playerId)
          if (!row) return
          setProfilePlayer(null)
          setProfileTeamName(null)
          setSelected(row)
        }}
      />
    </div>
  )
}
