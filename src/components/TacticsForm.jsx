import { useUiLang } from '../ui/UiLangContext'
import { tacticsStrings } from '../ui/strings/tactics'
import { useState } from 'react'
import { getPlayerFullName } from '../data/mockPlayers'
import {
  ATTACK_STYLES,
  DEFENSE_STYLES,
  TACTICS_MODIFIERS,
  findExhaustedInLineup,
  findExhaustedInTactics,
  lineupIdsForPointStart,
  updateLineupSlot,
  POINT_LINEUP_SIZE,
  validateLineupForSubmit,
  lineupValidationMessage,
  offenseLineSlotsForAttackStyle,
  attackStyleForPointStart,
  normalizeTactics,
  playerInstructionLabel,
  normalizePlayerInstructionsMap,
} from '../matchEngine'
import TeamRosterPanel from './TeamRosterPanel'
import CollapsibleStylePicker from './CollapsibleStylePicker'
import FormationPreview from './FormationPreview'
import PlayerSlotPicker from './PlayerSlotPicker'
import CoachDirectivesPanel from './CoachDirectivesPanel'

const LINE_SIZE = POINT_LINEUP_SIZE

/** Aktualizacja stylu linii z synchronizacją aliasów O-Line → attackStyle/defenseStyle. */
function patchTacticsStyles(tactics, patch) {
  const next = { ...tactics, ...patch }
  if (patch.oLineAttackStyle != null) next.attackStyle = patch.oLineAttackStyle
  if (patch.oLineDefenseStyle != null) next.defenseStyle = patch.oLineDefenseStyle
  return normalizeTactics(next)
}

function PointStartBadge({ role }) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const isOffense = role === 'offense'
  return (
    <span
      className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-semibold ${
        isOffense
          ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40'
          : 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40'
      }`}
    >
      {isOffense ? t.startOffense : t.startDefense}
    </span>
  )
}

function PlayerInstructionsOverview({ roster, tactics }) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const map = normalizePlayerInstructionsMap(tactics?.playerInstructions)
  const rows = Object.entries(map)
    .map(([id, tags]) => {
      const player = roster.find((p) => String(p.id) === String(id))
      if (!player || !tags?.length) return null
      return { player, tags }
    })
    .filter(Boolean)

  return (
    <section className="rounded-xl border border-ufa-border/80 bg-ufa-panel/50 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ufa-text">{t.individualOrders}</h3>
        <span className="text-[11px] text-ufa-muted">{t.playersShort(rows.length)}</span>
      </div>
      {!rows.length ? (
        <p className="mt-1.5 text-xs text-ufa-muted">
          {t.noInstr}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-ufa-border/40">
          {rows.map(({ player, tags }) => (
            <li
              key={player.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-xs first:pt-0 last:pb-0"
            >
              <span className="min-w-[8rem] font-medium text-ufa-text">
                {getPlayerFullName(player)}
              </span>
              <span className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-ufa-accent/12 px-1.5 py-0.5 text-[10px] text-ufa-accent ring-1 ring-ufa-accent/25"
                  >
                    {playerInstructionLabel(tag, lang)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CompactLineupSection({
  title,
  subtitle,
  line,
  roster,
  staminaMap,
  compact,
  accentClass,
  onSlotChange,
  positionSlots = null,
  tactics = null,
  onTacticsChange = null,
  teamName = null,
  leaguePlayerStats = null,
  offenseLineIds = null,
  defenseLineIds = null,
  dndGroupKey = null,
}) {
  const filled = line.filter(Boolean).length
  const slots = positionSlots ?? Array.from({ length: LINE_SIZE }, (_, i) => ({
    label: `Slot ${i + 1}`,
    shortLabel: String(i + 1),
  }))
  return (
    <section
      className={
        compact
          ? ''
          : 'rounded-xl border border-ufa-border bg-ufa-panel p-3 shadow-xl shadow-black/30 sm:p-5'
      }
    >
      <div className="mb-3">
        <div className="flex items-baseline justify-between gap-2">
          {title ? (
            <h3 className={`font-semibold text-ufa-text ${compact ? 'text-sm' : ''}`}>{title}</h3>
          ) : (
            <span />
          )}
          <span className="text-xs text-ufa-muted">
            {filled}/{LINE_SIZE}
          </span>
        </div>
        {subtitle && <p className="mt-1 text-xs text-ufa-muted">{subtitle}</p>}
      </div>
      <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
        {slots.map((slot, i) => (
          <PlayerSlotPicker
            key={slot.key ?? i}
            index={i}
            playerId={line[i] ?? null}
            line={line}
            roster={roster}
            staminaMap={staminaMap}
            accentClass={
              slot.role === 'handler'
                ? 'bg-sky-500/25 text-sky-300'
                : slot.role === 'cutter'
                  ? 'bg-violet-500/25 text-violet-300'
                  : accentClass
            }
            slotLabel={slot.label}
            slotShortLabel={slot.shortLabel}
            slotRole={slot.role ?? null}
            slotRoleIndex={slot.roleIndex ?? 1}
            tactics={tactics}
            onTacticsChange={onTacticsChange}
            teamName={teamName}
            leaguePlayerStats={leaguePlayerStats}
            offenseLineIds={offenseLineIds}
            defenseLineIds={defenseLineIds}
            positionSlots={slots}
            dndGroupKey={dndGroupKey}
            onChange={(id) => onSlotChange(i, id)}
          />
        ))}
      </div>
    </section>
  )
}

function RichLineupSection({
  title,
  subtitle,
  lineRole,
  line,
  roster,
  staminaMap,
  accentClass,
  activeSlot,
  openSlot,
  onSelectSlot,
  onOpenSlotChange,
  onSlotChange,
  positionSlots = null,
  tactics = null,
  onTacticsChange = null,
  teamName = null,
  leaguePlayerStats = null,
  offenseLineIds = null,
  defenseLineIds = null,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const filled = line.filter(Boolean).length
  const slots = positionSlots ?? Array.from({ length: LINE_SIZE }, (_, i) => ({
    label: `Slot ${i + 1}`,
    shortLabel: String(i + 1),
  }))
  const handlerN = slots.filter((s) => s.role === 'handler').length
  const cutterN = slots.filter((s) => s.role === 'cutter').length
  return (
    <section className="rounded-xl border border-ufa-border bg-ufa-panel p-3 shadow-xl shadow-black/30 sm:p-5">
      <div className="mb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold text-ufa-text">{title}</h3>
          <span className="text-xs text-ufa-muted">
            {filled}/{LINE_SIZE}
          </span>
        </div>
        {subtitle && <p className="mt-1 text-xs text-ufa-muted">{subtitle}</p>}
        <p className="mt-1 text-[11px] text-ufa-muted">
          {t.formationSlotHint(handlerN, cutterN)}
        </p>
      </div>
      <div className="space-y-2">
        {slots.map((slot, i) => (
          <PlayerSlotPicker
            key={`${lineRole}-${slot.key ?? i}`}
            index={i}
            playerId={line[i] ?? null}
            line={line}
            roster={roster}
            staminaMap={staminaMap}
            accentClass={
              slot.role === 'handler'
                ? 'bg-sky-500/25 text-sky-300'
                : slot.role === 'cutter'
                  ? 'bg-violet-500/25 text-violet-300'
                  : accentClass
            }
            slotLabel={slot.label}
            slotShortLabel={slot.shortLabel}
            slotRole={slot.role ?? null}
            slotRoleIndex={slot.roleIndex ?? 1}
            selected={activeSlot?.role === lineRole && activeSlot?.index === i}
            open={openSlot?.role === lineRole && openSlot?.index === i}
            onSelectSlot={(idx) => onSelectSlot({ role: lineRole, index: idx })}
            onOpenChange={(next) =>
              onOpenSlotChange(next ? { role: lineRole, index: i } : null)
            }
            onChange={(id) => onSlotChange(i, id)}
            tactics={tactics}
            onTacticsChange={onTacticsChange}
            teamName={teamName}
            leaguePlayerStats={leaguePlayerStats}
            offenseLineIds={offenseLineIds}
            defenseLineIds={defenseLineIds}
            positionSlots={slots}
            dndGroupKey={lineRole}
          />
        ))}
      </div>
    </section>
  )
}

export default function TacticsForm({
  roster,
  tactics,
  onTacticsChange,
  compact = false,
  showLines = true,
  staminaMap = null,
  lineupMode = 'dual',
  pointStartRole = 'offense',
  teamName = '',
  leaguePlayerStats = null,
  teamColor = null,
}) {
  const { lang } = useUiLang()
  const t = tacticsStrings(lang)
  const [activeSlot, setActiveSlot] = useState(null)
  const [openSlot, setOpenSlot] = useState(null)
  /** 'o-line' | 'd-line' | 'combined' — desktop opens with O/D shown side by side
   *  (there's room), mobile opens on a single line to keep scrolling short. */
  const [viewTab, setViewTab] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches
      ? 'combined'
      : 'o-line',
  )

  const attackOptions = Object.values(ATTACK_STYLES).map((id) => ({
    id,
    ...TACTICS_MODIFIERS.attack[id],
  }))

  const defenseOptions = Object.values(DEFENSE_STYLES).map((id) => ({
    id,
    ...TACTICS_MODIFIERS.defense[id],
  }))

  const offenseLine = lineupIdsForPointStart(tactics, 'offense')
  const defenseLine = lineupIdsForPointStart(tactics, 'defense')
  const pointLine = lineupIdsForPointStart(tactics, pointStartRole)
  const oAttackStyle = tactics.oLineAttackStyle ?? tactics.attackStyle
  const dAttackStyle = tactics.dLineAttackStyle ?? tactics.attackStyle
  const oPositionSlots = offenseLineSlotsForAttackStyle(oAttackStyle)
  const dPositionSlots = offenseLineSlotsForAttackStyle(dAttackStyle)
  const pointAttackStyle = attackStyleForPointStart(tactics, pointStartRole)
  const pointPositionSlots = offenseLineSlotsForAttackStyle(pointAttackStyle)
  const positionSlotsForRole = (role) => {
    if (role === 'defense') return dPositionSlots
    if (role === 'point') return pointPositionSlots
    return oPositionSlots
  }
  const pointLineValidation =
    lineupMode === 'single' ? validateLineupForSubmit(pointLine, roster) : { ok: true }
  const lineupError =
    lineupMode === 'single' ? lineupValidationMessage(pointLineValidation) : null

  const exhaustedIds =
    lineupMode === 'single'
      ? findExhaustedInLineup(pointLine, staminaMap)
      : findExhaustedInTactics(tactics, staminaMap)

  const activeLine =
    activeSlot?.role === 'defense'
      ? defenseLine
      : activeSlot?.role === 'offense'
        ? offenseLine
        : activeSlot?.role === 'point'
          ? pointLine
          : offenseLine

  const activeSlots = activeSlot != null ? positionSlotsForRole(activeSlot.role) : oPositionSlots
  const activeSlotMeta =
    activeSlot != null ? activeSlots[activeSlot.index] ?? null : null

  const replaceTarget =
    activeSlot != null
      ? {
          slotIndex: activeSlot.index,
          lineLabel: `${
            activeSlot.role === 'defense'
              ? 'D-Line'
              : activeSlot.role === 'offense'
                ? 'O-Line'
                : t.seven
          } · ${activeSlotMeta?.label ?? `slot ${activeSlot.index + 1}`}`,
          currentPlayerId: activeLine[activeSlot.index] ?? null,
        }
      : null

  function assignToActiveSlot(playerId) {
    if (!activeSlot) return
    const role =
      activeSlot.role === 'point' ? pointStartRole : activeSlot.role
    onTacticsChange(updateLineupSlot(tactics, role, activeSlot.index, playerId))
  }

  const compactPointStyles =
    pointStartRole === 'defense'
      ? {
          attackKey: 'dLineAttackStyle',
          defenseKey: 'dLineDefenseStyle',
          attackValue: tactics.dLineAttackStyle ?? tactics.attackStyle,
          defenseValue: tactics.dLineDefenseStyle ?? tactics.defenseStyle,
          labelPrefix: 'D-Line',
          coachLineRole: 'defense',
        }
      : {
          attackKey: 'oLineAttackStyle',
          defenseKey: 'oLineDefenseStyle',
          attackValue: tactics.oLineAttackStyle ?? tactics.attackStyle,
          defenseValue: tactics.oLineDefenseStyle ?? tactics.defenseStyle,
          labelPrefix: 'O-Line',
          coachLineRole: 'offense',
        }

  const showO = viewTab === 'o-line' || viewTab === 'combined'
  const showD = viewTab === 'd-line' || viewTab === 'combined'
  const isCombined = viewTab === 'combined'
  const useTabs = lineupMode === 'dual'

  if (!tactics) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        {t.noTactics}
      </div>
    )
  }

  function renderLineStyles(lineRole, embedded = false) {
    const isD = lineRole === 'defense'
    const atkKey = isD ? 'dLineAttackStyle' : 'oLineAttackStyle'
    const defKey = isD ? 'dLineDefenseStyle' : 'oLineDefenseStyle'
    const atkVal = isD
      ? (tactics.dLineAttackStyle ?? tactics.attackStyle)
      : (tactics.oLineAttackStyle ?? tactics.attackStyle)
    const defVal = isD
      ? (tactics.dLineDefenseStyle ?? tactics.defenseStyle)
      : (tactics.oLineDefenseStyle ?? tactics.defenseStyle)
    const accent = isD
      ? 'border-orange-500/25 bg-orange-500/[0.04]'
      : 'border-sky-500/25 bg-sky-500/[0.04]'
    const titleColor = isD ? 'text-orange-300/90' : 'text-sky-300/90'
    const label = isD ? 'D-Line' : 'O-Line'

    if (compact) {
      return (
        <div className={`grid gap-3 sm:grid-cols-2 ${embedded ? '' : ''}`}>
          <label className="flex flex-col gap-1 text-xs text-ufa-muted">
            {t.lineDotAttack(label)}
            <select
              value={atkVal}
              onChange={(e) =>
                onTacticsChange(patchTacticsStyles(tactics, { [atkKey]: e.target.value }))
              }
              className="rounded-md border border-ufa-border bg-ufa-panel px-2 py-2 text-sm text-ufa-text"
            >
              {attackOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ufa-muted">
            {t.lineDotDefense(label)}
            <select
              value={defVal}
              onChange={(e) =>
                onTacticsChange(patchTacticsStyles(tactics, { [defKey]: e.target.value }))
              }
              className="rounded-md border border-ufa-border bg-ufa-panel px-2 py-2 text-sm text-ufa-text"
            >
              {defenseOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )
    }

    return (
      <div className={`space-y-3 rounded-xl border p-4 ${accent}`}>
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${titleColor}`}>
          {t.lineDotStyles(label)}
        </p>
        <CollapsibleStylePicker
          embedded
          label={t.attack}
          name={atkKey}
          options={attackOptions}
          value={atkVal}
          onChange={(id) => onTacticsChange(patchTacticsStyles(tactics, { [atkKey]: id }))}
        />
        <CollapsibleStylePicker
          embedded
          label={t.defense}
          name={defKey}
          options={defenseOptions}
          value={defVal}
          onChange={(id) => onTacticsChange(patchTacticsStyles(tactics, { [defKey]: id }))}
        />
      </div>
    )
  }

  function renderLineup(lineRole) {
    const isD = lineRole === 'defense'
    const line = isD ? defenseLine : offenseLine
    const slots = isD ? dPositionSlots : oPositionSlots
    const accent = isD ? 'bg-orange-500/25 text-orange-300' : 'bg-sky-500/25 text-sky-300'
    const title = isD ? t.dLine : t.oLine
    const subtitle = isD
      ? t.dLinePullHint
      : t.oLinePullHint

    if (compact) {
      return (
        <CompactLineupSection
          title={title}
          subtitle={subtitle}
          line={line}
          roster={roster}
          staminaMap={staminaMap}
          compact={compact}
          accentClass={accent}
          positionSlots={slots}
          tactics={tactics}
          onTacticsChange={onTacticsChange}
          teamName={teamName}
          leaguePlayerStats={leaguePlayerStats}
          offenseLineIds={offenseLine}
          defenseLineIds={defenseLine}
          dndGroupKey={lineRole}
          onSlotChange={(i, id) =>
            onTacticsChange(updateLineupSlot(tactics, lineRole, i, id))
          }
        />
      )
    }

    return (
      <RichLineupSection
        title={title}
        subtitle={subtitle}
        lineRole={lineRole}
        line={line}
        roster={roster}
        staminaMap={staminaMap}
        accentClass={accent}
        positionSlots={slots}
        tactics={tactics}
        onTacticsChange={onTacticsChange}
        teamName={teamName}
        leaguePlayerStats={leaguePlayerStats}
        offenseLineIds={offenseLine}
        defenseLineIds={defenseLine}
        activeSlot={activeSlot}
        openSlot={openSlot}
        onSelectSlot={setActiveSlot}
        onOpenSlotChange={setOpenSlot}
        onSlotChange={(i, id) => {
          onTacticsChange(updateLineupSlot(tactics, lineRole, i, id))
          setActiveSlot({ role: lineRole, index: i })
        }}
      />
    )
  }

  function renderFormation(lineRole) {
    const isD = lineRole === 'defense'
    return (
      <FormationPreview
        roster={roster}
        lineupIds={isD ? defenseLine : offenseLine}
        attackStyle={isD ? dAttackStyle : oAttackStyle}
        teamColor={teamColor}
        teamName={
          teamName
            ? `${teamName} · ${isD ? 'D-Line' : 'O-Line'}`
            : isD
              ? 'D-Line'
              : 'O-Line'
        }
      />
    )
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-5'}>
      {lineupError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {lineupError}
        </div>
      )}

      {exhaustedIds.length > 0 && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <p className="font-medium">{t.exhaustedWarn}</p>
          <p className="mt-1 text-xs text-red-200/80">
            {t.exhaustedHint}
          </p>
        </div>
      )}

      {useTabs && (
        <div
          className={`flex flex-wrap gap-1 rounded-lg border border-ufa-border/80 bg-ufa-bg/40 p-1 ${
            compact ? '' : ''
          }`}
          role="tablist"
          aria-label={t.tacticsViewAria}
        >
          {[
            { id: 'o-line', label: 'O-Line', accent: 'data-[on]:bg-sky-500/20 data-[on]:text-sky-200' },
            { id: 'd-line', label: 'D-Line', accent: 'data-[on]:bg-orange-500/20 data-[on]:text-orange-200' },
            { id: 'combined', label: t.linked, accent: 'data-[on]:bg-ufa-accent/20 data-[on]:text-ufa-accent' },
          ].map((tab) => {
            const on = viewTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={on}
                data-on={on ? '' : undefined}
                onClick={() => setViewTab(tab.id)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                  on
                    ? tab.accent.replace(/data-\[on\]:/g, '')
                    : 'text-ufa-muted hover:text-ufa-text'
                } ${on ? (tab.id === 'o-line' ? 'bg-sky-500/20 text-sky-200' : tab.id === 'd-line' ? 'bg-orange-500/20 text-orange-200' : 'bg-ufa-accent/20 text-ufa-accent') : ''}`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Tryb meczowy: jedna siódemka na punkt ── */}
      {showLines && lineupMode === 'single' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-ufa-muted">
              {t.attackStyleOf(compactPointStyles.labelPrefix)}
              <select
                value={compactPointStyles.attackValue}
                onChange={(e) =>
                  onTacticsChange(
                    patchTacticsStyles(tactics, {
                      [compactPointStyles.attackKey]: e.target.value,
                    }),
                  )
                }
                className="rounded-md border border-ufa-border bg-ufa-panel px-2 py-2 text-sm text-ufa-text"
              >
                {attackOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ufa-muted">
              {t.defenseStyleOf(compactPointStyles.labelPrefix)}
              <select
                value={compactPointStyles.defenseValue}
                onChange={(e) =>
                  onTacticsChange(
                    patchTacticsStyles(tactics, {
                      [compactPointStyles.defenseKey]: e.target.value,
                    }),
                  )
                }
                className="rounded-md border border-ufa-border bg-ufa-panel px-2 py-2 text-sm text-ufa-text"
              >
                {defenseOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <CoachDirectivesPanel
            tactics={tactics}
            onTacticsChange={onTacticsChange}
            compact={compact}
            lineRole={compactPointStyles.coachLineRole}
            defaultOpen
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-ufa-text text-sm">{t.pointSeven}</h3>
              <p className="text-xs text-ufa-muted mt-0.5">
                {t.pointSevenHint}
              </p>
            </div>
            <PointStartBadge role={pointStartRole} />
          </div>
          {compact ? (
            <CompactLineupSection
              compact
              title=""
              line={pointLine}
              roster={roster}
              staminaMap={staminaMap}
              accentClass="bg-ufa-accent/25 text-ufa-accent"
              positionSlots={pointPositionSlots}
              tactics={tactics}
              onTacticsChange={onTacticsChange}
              teamName={teamName}
              leaguePlayerStats={leaguePlayerStats}
              offenseLineIds={offenseLine}
              defenseLineIds={defenseLine}
              dndGroupKey="point"
              onSlotChange={(i, id) =>
                onTacticsChange(updateLineupSlot(tactics, pointStartRole, i, id))
              }
            />
          ) : (
            <RichLineupSection
              title={t.seven}
              subtitle=""
              lineRole="point"
              line={pointLine}
              roster={roster}
              staminaMap={staminaMap}
              accentClass="bg-ufa-accent/25 text-ufa-accent"
              positionSlots={pointPositionSlots}
              tactics={tactics}
              onTacticsChange={onTacticsChange}
              teamName={teamName}
              leaguePlayerStats={leaguePlayerStats}
              offenseLineIds={offenseLine}
              defenseLineIds={defenseLine}
              activeSlot={activeSlot}
              openSlot={openSlot}
              onSelectSlot={setActiveSlot}
              onOpenSlotChange={setOpenSlot}
              onSlotChange={(i, id) => {
                onTacticsChange(updateLineupSlot(tactics, pointStartRole, i, id))
                setActiveSlot({ role: 'point', index: i })
              }}
            />
          )}
          <TeamRosterPanel
            roster={roster}
            teamName={teamName}
            staminaMap={staminaMap}
            compact
            leaguePlayerStats={leaguePlayerStats}
            replaceTarget={compact ? null : replaceTarget}
            onReplacePlayer={compact ? null : assignToActiveSlot}
            linePlayerIds={pointLine}
            positionSlots={pointPositionSlots}
            offenseLineIds={offenseLine}
            defenseLineIds={defenseLine}
            tactics={tactics}
            onTacticsChange={onTacticsChange}
          />
        </div>
      )}

      {/* ── Dual: O-Line / D-Line / Połączony ── */}
      {lineupMode === 'dual' && (
        <>
          {(showO || showD) && (
            <section className="space-y-3">
              {!compact && (
                <div>
                  <h3 className="text-sm font-semibold text-ufa-text">
                    {isCombined ? t.lineStyles : showO ? t.oLineStyles : t.dLineStyles}
                  </h3>
                  <p className="mt-0.5 text-xs text-ufa-muted">
                    {isCombined ? t.formationAttackDefenseSeparate : t.formationAttackDefense}
                  </p>
                </div>
              )}
              <div
                className={
                  isCombined && !compact ? 'grid gap-4 lg:grid-cols-2' : 'space-y-3'
                }
              >
                {showO && renderLineStyles('offense')}
                {showD && renderLineStyles('defense')}
              </div>
            </section>
          )}

          {showO && (
            <CoachDirectivesPanel
              tactics={tactics}
              onTacticsChange={onTacticsChange}
              compact={compact}
              lineRole="offense"
              defaultOpen={!compact && !isCombined}
            />
          )}
          {showD && (
            <CoachDirectivesPanel
              tactics={tactics}
              onTacticsChange={onTacticsChange}
              compact={compact}
              lineRole="defense"
              defaultOpen={!compact && !isCombined}
            />
          )}

          {!compact && isCombined && (
            <PlayerInstructionsOverview roster={roster} tactics={tactics} />
          )}
          {!compact && !isCombined && viewTab === 'o-line' && (
            <PlayerInstructionsOverview roster={roster} tactics={tactics} />
          )}

          {!compact && showLines && (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-ufa-text">{t.formationPreview}</h3>
                <p className="mt-0.5 text-xs text-ufa-muted">
                  {t.formationPreviewHint}
                </p>
              </div>
              <div
                className={
                  isCombined ? 'grid gap-4 lg:grid-cols-2' : 'grid gap-4'
                }
              >
                {showO && renderFormation('offense')}
                {showD && renderFormation('defense')}
              </div>
            </section>
          )}

          {showLines && (
            <div
              className={
                isCombined
                  ? compact
                    ? 'grid gap-6 lg:grid-cols-2'
                    : 'grid gap-6 lg:grid-cols-2'
                  : 'space-y-6'
              }
            >
              {showO && renderLineup('offense')}
              {showD && renderLineup('defense')}
            </div>
          )}

          {showLines && !compact && (
            <TeamRosterPanel
              roster={roster}
              teamName={teamName}
              staminaMap={staminaMap}
              leaguePlayerStats={leaguePlayerStats}
              defaultOpen
              replaceTarget={replaceTarget}
              onReplacePlayer={assignToActiveSlot}
              linePlayerIds={
                activeSlot?.role === 'defense'
                  ? defenseLine
                  : activeSlot?.role === 'offense'
                    ? offenseLine
                    : showD && !showO
                      ? defenseLine
                      : offenseLine
              }
              positionSlots={activeSlots}
              offenseLineIds={offenseLine}
              defenseLineIds={defenseLine}
              tactics={tactics}
              onTacticsChange={onTacticsChange}
            />
          )}
        </>
      )}
    </div>
  )
}
