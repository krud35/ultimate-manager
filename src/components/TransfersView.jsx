import { useUiLang } from '../ui/UiLangContext'
import { pickLabel } from '../ui/locale'
import { transfersStrings } from '../ui/strings/transfers'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getOverallRating } from '../data/mockPlayers'
import PlayerProfileModal from './PlayerProfileModal'
import {
  queueOutgoingClubOffer,
  formatUsd,
  formatUsdCompact,
  getPlayerMarketValue,
  getTransferBudget,
  getSalaryBudget,
  getTransferWindowState,
  listTransferMarketWithFreeAgents,
  signFreeAgent,
  simulateAiTransferActivity,
  worldTeamById,
  teamWeeklyWageBill,
  mergeInbox,
  previewContractOffer,
  computePlayerContractDemands,
  canBuyPlayers,
  CONTRACT_BONUS_DEFS,
  CONTRACT_PROMISE_DEFS,
  getPlayerKnowledge,
  isPlayerShortlisted,
  toggleShortlist,
  hasPendingScoutMission,
  queueScoutMission,
  findPlayerTeamId,
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

function NegotiateModal({
  row,
  budget,
  onClose,
  onSubmitOffer,
}) {
  const { lang } = useUiLang()
  const t = transfersStrings(lang)
  const isFa = !!row?.freeAgent
  const [offer, setOffer] = useState(() => String(row?.marketValue ?? 0))
  const [wage, setWage] = useState(() => {
    if (!row?.player) return '500'
    const d = computePlayerContractDemands({
      player: row.player,
      sellerTeam: null,
      buyerTeam: null,
    })
    return String(d.minWeeklyWage)
  })
  const [years, setYears] = useState('3')
  const [selectedBonuses, setSelectedBonuses] = useState(() => new Set())
  const [selectedPromises, setSelectedPromises] = useState(() => new Set())

  const toggleSet = (setter, id) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const bonusesPayload = [...selectedBonuses].map((id) => {
    const def = CONTRACT_BONUS_DEFS.find((d) => d.id === id)
    return { type: id, amount: def?.defaultAmount ?? 5000 }
  })
  const promisesPayload = [...selectedPromises].map((id) => ({ type: id }))

  if (!row) return null

  const offerNum = Math.round(Number(offer) || 0)
  const overBudget = !isFa && offerNum > budget
  const preview = previewContractOffer(
    Math.round(Number(wage) || 0),
    Math.max(1, Math.min(5, Math.round(Number(years) || 1))),
  )
  const faOverBudget = isFa && preview.totalCost > budget

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label={t.close}
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg max-h-[min(92vh,100%)] overflow-y-auto rounded-t-xl sm:rounded-xl border border-ufa-border bg-ufa-panel p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ufa-muted">{t.negotiateTitle}</p>
            <h3 className="text-lg font-semibold text-ufa-text">{row.name}</h3>
            <p className="mt-1 text-sm text-ufa-muted">
              {row.teamName}
              {row.age != null ? ` · ${row.age}` : ''}
              {!isFa && row.rank === 0
                ? t.clubTop1
                : !isFa && row.rank <= 2
                  ? t.clubTopN(row.rank + 1)
                  : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ufa-muted hover:text-ufa-text text-sm">
            {t.close}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2">
            <p className="text-[10px] uppercase text-ufa-muted">{t.value}</p>
            <p className="font-semibold tabular-nums text-ufa-text">{formatUsd(row.marketValue)}</p>
          </div>
          <div className="rounded-lg border border-ufa-border bg-ufa-bg/50 px-3 py-2">
            <p className="text-[10px] uppercase text-ufa-muted">{t.years}</p>
            <p className="font-semibold tabular-nums text-ufa-text">
              {isFa ? 'FA' : row.contractYears ?? '—'}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-ufa-muted">
          {t.yourBudget}: {formatUsd(budget)}
        </p>

        {isFa ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-ufa-muted leading-relaxed">{t.faHint}</p>
            <label className="block text-sm text-ufa-text">
              {t.weeklyWage}
              <input
                type="number"
                value={wage}
                onChange={(e) => setWage(e.target.value)}
                className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text tabular-nums"
              />
            </label>
            <label className="block text-sm text-ufa-text">
              {t.years}
              <input
                type="number"
                min={1}
                max={5}
                value={years}
                onChange={(e) => setYears(e.target.value)}
                className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text tabular-nums"
              />
            </label>
            <p className="text-xs text-ufa-muted tabular-nums">{formatUsd(preview.totalCost)}</p>
            {faOverBudget && <p className="text-xs text-red-400">{t.overBudgetContract}</p>}

            <div>
              <p className="text-[10px] uppercase text-ufa-muted mb-1">{t.bonuses}</p>
              <div className="flex flex-wrap gap-1.5">
                {CONTRACT_BONUS_DEFS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleSet(setSelectedBonuses, b.id)}
                    className={`rounded px-2 py-1 text-[10px] ring-1 ${
                      selectedBonuses.has(b.id)
                        ? 'bg-ufa-gold/20 text-ufa-gold ring-ufa-gold/40'
                        : 'bg-ufa-bg text-ufa-muted ring-ufa-border'
                    }`}
                  >
                    {lang === 'en' ? b.labelEn : b.labelPl} · {formatUsdCompact(b.defaultAmount)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase text-ufa-muted mb-1">{t.promises}</p>
              <div className="flex flex-wrap gap-1.5">
                {CONTRACT_PROMISE_DEFS.map((pr) => (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => toggleSet(setSelectedPromises, pr.id)}
                    className={`rounded px-2 py-1 text-[10px] ring-1 ${
                      selectedPromises.has(pr.id)
                        ? 'bg-ufa-accent/20 text-ufa-accent ring-ufa-accent/40'
                        : 'bg-ufa-bg text-ufa-muted ring-ufa-border'
                    }`}
                  >
                    {lang === 'en' ? pr.labelEn : pr.labelPl}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={faOverBudget || budget <= 0}
              onClick={() =>
                onSubmitOffer(0, {
                  weeklyWage: Math.round(Number(wage) || 0),
                  years: Math.max(1, Math.min(5, Math.round(Number(years) || 1))),
                  bonuses: bonusesPayload,
                  promises: promisesPayload,
                })
              }
              className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
            >
              {t.sendOffer}
            </button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-xs text-ufa-muted leading-relaxed">{t.negotiateHint}</p>
            <p className="mt-2 text-xs text-ufa-gold leading-relaxed">
              {t.negotiateInboxHint}
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-ufa-text">
                {t.yourOffer}
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={offer}
                  onChange={(e) => setOffer(e.target.value)}
                  className="mt-1 w-full rounded-md border border-ufa-border bg-ufa-bg px-3 py-2 text-ufa-text tabular-nums"
                />
              </label>
              {overBudget && <p className="text-xs text-red-400">{t.overBudget}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={overBudget || offerNum <= 0 || budget <= 0}
                  onClick={() => onSubmitOffer(offerNum)}
                  className="rounded-md bg-ufa-accent px-4 py-2 text-sm font-semibold text-ufa-bg hover:opacity-90 disabled:opacity-40"
                >
                  {t.sendOffer}
                </button>
                <button
                  type="button"
                  onClick={() => setOffer(String(row.marketValue))}
                  className="rounded-md border border-ufa-border px-3 py-2 text-sm text-ufa-text hover:bg-ufa-panel-hover"
                >
                  {t.setValue}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
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

  const market = useMemo(
    () => listTransferMarketWithFreeAgents(career.world, career.playerTeamId),
    [career.world, career.playerTeamId],
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

    if (selected.freeAgent) {
      if (!canBuyPlayers(buyer)) {
        setFlash({ type: 'error', text: t.negativeBudgetBlock })
        return
      }
      const demands = computePlayerContractDemands({
        player: selected.player,
        sellerTeam: null,
        buyerTeam: buyer,
        league: career.league,
      })
      const terms = contractTerms ?? {
        weeklyWage: demands.minWeeklyWage,
        years: demands.preferredYears,
        bonuses: [],
        promises: [],
      }
      const result = signFreeAgent(career, {
        playerId: selected.playerId,
        contract: terms,
      })
      if (!result.ok) {
        setFlash({ type: 'error', text: result.error ?? t.transferError })
        return
      }
      onCareerUpdate({
        world: result.world,
        transferLog: result.transferLog,
      })
      setFlash({ type: 'ok', text: t.faSigned })
      setSelected(null)
      return
    }

    const result = queueOutgoingClubOffer(career, {
      playerId: selected.playerId,
      offerAmount,
    })
    if (!result.ok) {
      setFlash({ type: 'error', text: result.error ?? t.transferError })
      return
    }
    onCareerUpdate({
      inbox: mergeInbox(career, [result.message]),
    })
    setFlash({
      type: 'ok',
      text: result.flash ?? t.offerSentFlash,
    })
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
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-ufa-muted">{row.teamShort}</td>
                    <td className="px-2 py-2.5 tabular-nums text-ufa-text">
                      {row.age ?? '—'}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-ufa-text">
                      {formatUsdCompact(row.marketValue)}
                    </td>
                    <td className="px-2 py-2.5 text-right">
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

      <PlayerProfileModal
        player={profilePlayer}
        onClose={() => {
          setProfilePlayer(null)
          setProfileTeamName(null)
        }}
        teamName={profileTeamName}
        isOwnPlayer={false}
        knowledge={profilePlayer ? getPlayerKnowledge(buyer, profilePlayer.id) : null}
        isShortlisted={profilePlayer ? isPlayerShortlisted(buyer, profilePlayer.id) : false}
        scoutPending={
          profilePlayer
            ? hasPendingScoutMission(buyer, { kind: 'player', targetPlayerId: profilePlayer.id })
            : false
        }
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
      />
    </div>
  )
}
