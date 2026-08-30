import {
  buildThrowPathPoints,
  discMetersFromState,
  fieldStateAtEventStep,
  resolveFieldTactics,
  resolveMarkForceSide,
  fieldSlotId,
  fieldLineupIdsFromPointEvents,
  filterPlayersToPointLineup,
} from './fieldViz.js'
import { motionFatigueModifiers } from './stamina.js'
import { THROW_TYPE } from './throwTypes.js'
import { THROW_TECHNIQUE } from './throwTechnique.js'
import { ATTACK_STYLES, FORCE_SIDES } from './tacticsModifiers.js'
import { forceMarkLayoutSide, normalizeForceMark } from './throwTechnique.js'
import { forceMarkPosition } from './ai/defenderBrain.js'
import { applyMotionTraceToTracks, sampleDiscFromMotionTrace, resolveCatchPointFromMotionTrace, resolveTurnoverPointFromMotionTrace, lockPlayerTrackToCatchAnchor } from './motionFromTicks.js'
import { plantStopMs } from './ai/statFormulas.js'
import { SIM_TICK_MS } from './ai/actionSimulator.js'
import { stallCountFromHoldMs } from './stall.js'
import {
  computeDynamicOffenseTarget,
  isCloggingThrowLane,
} from './ai/offenseReorganization.js'
import {
  DISC_STATE,
  discPositionHeld,
  discPositionInFlight,
  discPositionOnGround,
  discCatchSnapFrame,
  CATCH_SNAP_MS,
  DISC_GROUND_Z_M,
  DISC_HELD_Z_M,
} from './discState.js'

export const FIELD_PHASE_MS = {
  setup: 1800,
  release: 300,
  flight: 1000,
}

export const HIGH_STALL_EXTRA_MS = 600
export const HIGH_STALL_THRESHOLD = 6

export const FIELD_SHORT_TRANSITION_MS = 450

/** Prędkość biegu do wyliczania czasu przejść (m/s) — bez teleportacji. */
export const FIELD_RUN_SPEED_MPS = 5.4
export const FIELD_TRANSITION_MIN_MS = 320
export const FIELD_TRANSITION_MAX_MS = 2400

/** Czas przejścia do formacji na początku klipu (ms). */
export const REPOSITION_PHASE_MS = 700

import { fieldCenterY, clampFieldX, clampFieldY, attackDirectionX, geoTeam, FIELD_DIMENSIONS } from './fieldDimensions.js'

const FIELD_Y_CENTER = fieldCenterY()

function clampX(v) {
  return clampFieldX(v)
}

function clampY(v) {
  return clampFieldY(v)
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t)
}

function easeInQuad(t) {
  return t * t
}

function easeLinear(t) {
  return t
}

const PLANT_FOOT_MS = 125
const HIP_TURN_BASE_MS = 150
const MARK_ARC_RADIUS_M = 1.5
const MOTION_SAMPLE_MS = 45

function sampleKeyframes(keyframes, timeMs) {
  if (!keyframes?.length) return { x: 50, y: FIELD_Y_CENTER }
  if (timeMs <= keyframes[0].ms) return { x: keyframes[0].x, y: keyframes[0].y }
  const last = keyframes[keyframes.length - 1]
  if (timeMs >= last.ms) return { x: last.x, y: last.y }
  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const a = keyframes[i]
    const b = keyframes[i + 1]
    if (timeMs >= a.ms && timeMs <= b.ms) {
      const span = b.ms - a.ms || 1
      const local = (timeMs - a.ms) / span
      let e = easeInOutCubic(local)
      if (b.ease === 'out') e = easeOutQuad(local)
      else if (b.ease === 'in') e = easeInQuad(local)
      else if (b.ease === 'linear') e = easeLinear(local)
      return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) }
    }
  }
  return { x: last.x, y: last.y }
}

function laggedSample(keyframes, timeMs, lagMs) {
  return sampleKeyframes(keyframes, Math.max(0, timeMs - lagMs))
}

function cutDepthForSeparation(separationOutcome) {
  if (separationOutcome === 'open') return 12
  if (separationOutcome === 'tight') return 5.5
  return 8
}

function markGap(separationOutcome, stallCount = 0) {
  let g = 2.6
  if (separationOutcome === 'open') g = 4.2
  if (separationOutcome === 'tight') g = 1.2
  if (stallCount > HIGH_STALL_THRESHOLD) g *= 0.7
  return g
}

export function setupDurationForStall(stallCount) {
  if (stallCount > HIGH_STALL_THRESHOLD) {
    return FIELD_PHASE_MS.setup + HIGH_STALL_EXTRA_MS
  }
  return FIELD_PHASE_MS.setup
}

function cutTargetForStyle(attackStyle, stackX, stackY, depth, inCut, attackSign = 1) {
  if (attackStyle === ATTACK_STYLES.HORIZONTAL_STACK) {
    const lateral = stackY < FIELD_Y_CENTER ? depth * 0.5 : -depth * 0.5
    return {
      cutX: clampX(stackX + attackSign * depth * 0.2),
      cutY: clampY(stackY + lateral),
      fakeX: clampX(stackX - attackSign * 1.5),
      fakeY: clampY(stackY - lateral * 0.35),
    }
  }
  const outCut = !inCut
  return {
    cutX: clampX(stackX + attackSign * (outCut ? depth * 0.65 : -depth * 0.35)),
    cutY: clampY(stackY + (inCut ? -1.2 : 1.5)),
    fakeX: clampX(stackX - attackSign * 2.5),
    fakeY: clampY(stackY + (stackY >= FIELD_Y_CENTER ? 1.5 : -1.5)),
  }
}

function defenderLagMs(separationOutcome) {
  if (separationOutcome === 'open') return 220
  if (separationOutcome === 'tight') return 120
  return 170
}

function findPlayerSkills(playerId, homeTeam, awayTeam) {
  if (!playerId) return {}
  for (const pool of [homeTeam?.players, awayTeam?.players]) {
    const p = pool?.find((x) => x.id === playerId)
    if (p?.skills) return p.skills
  }
  return {}
}

function cutterAgilityDelayMs(skills, player) {
  if (player) return plantStopMs(player)
  const agility = skills?.physical?.agility ?? skills?.agility ?? 50
  return 300 - (agility / 100) * 180
}

function motionPhaseAtTrack(track, timeMs) {
  if (!track?.keyframes?.length) return track?.defaultMotion ?? null
  let phase = track.defaultMotion ?? null
  for (const k of track.keyframes) {
    if (timeMs >= k.ms) phase = k.motionPhase ?? phase
    else break
  }
  return phase
}

function bearingRad(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax)
}

function offenseTurnRad(track, ms, setupMs, windowMs = 100) {
  const t0 = Math.max(0, ms - windowMs)
  const t1 = Math.max(0, ms - windowMs / 2)
  const p0 = samplePlayerTrackAt(track, t0, setupMs)
  const p1 = samplePlayerTrackAt(track, t1, setupMs)
  const p2 = samplePlayerTrackAt(track, ms, setupMs)
  const b1 = bearingRad(p0.x, p0.y, p1.x, p1.y)
  const b2 = bearingRad(p1.x, p1.y, p2.x, p2.y)
  let d = b2 - b1
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}

function nearestSidelineClearTarget(x, y, attackSign) {
  const w = FIELD_DIMENSIONS.widthM
  const toLow = y
  const toHigh = w - y
  const clearY = toLow <= toHigh ? 1.1 : w - 1.1
  return { x: clampX(x + attackSign * 3.5), y: clampY(clearY) }
}

/** Plant & cut: fake sprint → plant (125ms) → gwałtowny cut 90–120°. */
function buildPlantCutKeyframes({
  stackX,
  stackY,
  fakeX,
  fakeY,
  cutX,
  cutY,
  setupMs,
  totalThroughSetup,
  flightMs,
  catchX,
  catchY,
  throwSuccess,
  attackSign,
  includeClearing,
  clearStartMs,
}) {
  const fakeEndMs = setupMs * 0.26
  const plantEndMs = fakeEndMs + PLANT_FOOT_MS
  const cutEndMs = setupMs * 0.78
  const approachDx = fakeX - stackX
  const approachDy = fakeY - stackY
  const plantX = fakeX + approachDx * 0.06
  const plantY = fakeY + approachDy * 0.06

  const clearTarget = nearestSidelineClearTarget(cutX, cutY, attackSign)

  const setupFrames = [
    { ms: 0, x: stackX, y: stackY, motionPhase: 'stack' },
    { ms: fakeEndMs, x: fakeX, y: fakeY, ease: 'out', motionPhase: 'sprint' },
    { ms: plantEndMs, x: plantX, y: plantY, ease: 'linear', motionPhase: 'plant' },
    { ms: cutEndMs, x: cutX, y: cutY, ease: 'in', motionPhase: 'cut' },
  ]

  if (includeClearing) {
    const clearingStart = clearStartMs ?? setupMs * 0.68
    setupFrames.push({
      ms: Math.max(clearingStart, cutEndMs),
      x: cutX,
      y: cutY,
      motionPhase: 'clear',
    })
    setupFrames.push({
      ms: totalThroughSetup,
      x: clearTarget.x,
      y: clearTarget.y,
      ease: 'in',
      motionPhase: 'clear',
    })
  } else {
    setupFrames.push({ ms: totalThroughSetup, x: cutX, y: cutY, motionPhase: 'cut' })
  }

  const flightFrames = throwSuccess
    ? [
        {
          ms: totalThroughSetup + flightMs * 0.85,
          x: catchX,
          y: catchY,
          motionPhase: 'cut',
        },
        { ms: totalThroughSetup + flightMs, x: catchX, y: catchY, motionPhase: 'cut' },
      ]
    : [
        {
          ms: totalThroughSetup + flightMs * 0.5,
          x: cutX + attackSign * 1.5,
          y: cutY,
          motionPhase: 'clear',
        },
        {
          ms: totalThroughSetup + flightMs,
          x: clearTarget.x,
          y: clearTarget.y,
          ease: 'out',
          motionPhase: 'clear',
        },
      ]

  return [...setupFrames, ...flightFrames]
}

function buildThrowerPivotKeyframes(px, py, setupMs, totalThroughSetup, flightMs) {
  const frames = []
  const cycles = 5
  for (let i = 0; i <= cycles; i += 1) {
    const t = (i / cycles) * setupMs
    const swing = Math.sin(i * 2.05) * 0.42
    const fwd = Math.cos(i * 1.65) * 0.18
    frames.push({
      ms: t,
      x: clampX(px + fwd),
      y: clampY(py + swing),
      motionPhase: 'pivot',
      ease: 'linear',
    })
  }
  frames.push({ ms: totalThroughSetup, x: px, y: py, motionPhase: 'pivot' })
  frames.push({ ms: totalThroughSetup + flightMs, x: px, y: py, motionPhase: 'pivot' })
  return frames
}

function buildThrowerMarkArcKeyframes(throwerTrack, setupMs, totalMs, forceMark, attackSign = 1) {
  const keyframes = []
  let stepIndex = 0
  for (let ms = 0; ms <= totalMs; ms += MOTION_SAMPLE_MS) {
    const tp = samplePlayerTrackAt(throwerTrack, ms, setupMs)
    const base = forceMarkPosition(tp.x, tp.y, forceMark, attackSign)
    // Lekki shuffle stóp przy kryciu — bez orbity po sideline.
    const shuffle = Math.sin(stepIndex * 1.15) * 0.08
    keyframes.push({
      ms,
      x: clampX(base.x),
      y: clampY(base.y + shuffle),
      motionPhase: 'shuffle',
      ease: 'linear',
    })
    stepIndex += 1
  }
  return keyframes
}

function buildHipTurnMarkTrack(defender, offenseTrack, opts) {
  const {
    setupMs,
    totalMs,
    separationOutcome,
    stallCount,
    attackSign,
    isActiveMark,
    receiverAgilityDelayMs: agilityDelay = 0,
    defenderStamina = 100,
  } = opts
  const fatigue = motionFatigueModifiers(defenderStamina)
  const hipFatigueMs = fatigue.hipTurnExtraMs
  const markSpeed = 5.2 * fatigue.runSpeedMultiplier
  const sep = isActiveMark ? separationOutcome : 'contested'
  const baseGap = markGap(sep, stallCount)
  const baseLag = isActiveMark ? defenderLagMs(sep) : defenderLagMs(sep) + 40

  const keyframes = []
  let prevX = defender.x
  let prevY = defender.y
  let hipUntil = 0
  let lastHeading = bearingRad(prevX, prevY, prevX + attackSign, prevY)

  for (let ms = 0; ms <= totalMs; ms += MOTION_SAMPLE_MS) {
    const turn = offenseTurnRad(offenseTrack, ms, setupMs, 110)
    const inCut = turn > 0.55
    if (inCut && ms > setupMs * 0.2) {
      hipUntil = Math.max(hipUntil, ms + HIP_TURN_BASE_MS + agilityDelay + hipFatigueMs)
    }

    const offFollow = samplePlayerTrackAt(
      offenseTrack,
      Math.max(0, ms - baseLag),
      setupMs,
    )

    let x
    let y
    if (ms < hipUntil && ms > 0) {
      const dt = MOTION_SAMPLE_MS / 1000
      const speed = markSpeed
      x = clampX(prevX + Math.cos(lastHeading) * speed * dt)
      y = clampY(prevY + Math.sin(lastHeading) * speed * dt * 0.35)
    } else {
      const extraSep = inCut ? Math.min(2.2, turn * 3.5) : 0
      x = clampX(offFollow.x - attackSign * (baseGap + extraSep))
      y = clampY(offFollow.y + (offFollow.y >= FIELD_Y_CENTER ? -0.85 : 0.85))
      lastHeading = bearingRad(prevX, prevY, x, y)
    }

    prevX = x
    prevY = y
    keyframes.push({
      ms,
      x,
      y,
      motionPhase: ms < hipUntil ? 'hip-turn' : 'mark',
      ease: 'linear',
    })
  }

  return {
    teamId: defender.teamId,
    label: defender.label,
    role: 'marker',
    markTargetId: defender.markTargetId ?? offenseTrack?.id ?? null,
    keyframes,
    defaultMotion: 'mark',
  }
}

function stackMicroOffset(stackIndex, setupMs, timeMs) {
  const phase = (timeMs / setupMs) * Math.PI * 2
  const slot = stackIndex * 0.85
  return {
    dx: Math.sin(phase * 1.6 + slot) * 0.45,
    dy: Math.cos(phase * 1.3 + slot) * 0.38,
  }
}

function samplePlayerTrackAt(track, timeMs, setupMs) {
  if (!track) return { x: 50, y: FIELD_Y_CENTER }
  if (track.micro) {
    const base = sampleKeyframes(track.keyframes, timeMs)
    const { dx, dy } = stackMicroOffset(track.stackIndex ?? 0, setupMs, Math.min(timeMs, setupMs))
    return { x: base.x + dx, y: base.y + dy }
  }
  return sampleKeyframes(track.keyframes, timeMs)
}

/**
 * Po anchorPivot / lock throwera marker z motionTrace zostaje przy starej pozycji dysku.
 * Przebuduj tor markera throwera tak, by forsował ~0.55 m względem aktualnego throwera.
 */
function syncStallMarkerTrackToThrower(
  tracks,
  markerId,
  throwerId,
  forceSide,
  attackSign,
  throughMs,
) {
  if (markerId == null || throwerId == null) return
  const throwerTrack = tracks[throwerId]
  const markerTrack = tracks[markerId]
  if (!throwerTrack?.keyframes?.length || !markerTrack?.keyframes?.length) return

  const through = Math.max(0, throughMs ?? 0)
  markerTrack.keyframes = markerTrack.keyframes.map((k) => {
    if ((k.ms ?? 0) > through) return k
    const tp = samplePlayerTrackAt(throwerTrack, k.ms, through)
    if (!tp || tp.x == null || tp.y == null) return k
    const mark = forceMarkPosition(tp.x, tp.y, forceSide, attackSign)
    return {
      ...k,
      x: clampX(mark.x),
      y: clampY(mark.y),
      motionPhase: k.motionPhase === 'contest' ? k.motionPhase : 'shuffle',
    }
  })
  markerTrack.role = 'marker'
  markerTrack.isActiveMark = true
  markerTrack.markTargetId = throwerId
  tracks[markerId] = markerTrack
}

function collectTrackTimes(tracks, totalMs) {
  const set = new Set([0, totalMs])
  for (const track of Object.values(tracks)) {
    for (const k of track.keyframes ?? []) {
      set.add(k.ms)
    }
  }
  return [...set].sort((a, b) => a - b)
}

function buildPlayerBaseTracks(allStart, setupMs, flightMs, releaseMs, ctx) {
  const {
    throwerId,
    receiverId,
    defenderId,
    separationOutcome,
    offenseTeamId,
    attackStyle,
    personMark,
    stallCount,
    highStall,
    dumpPlayerId,
    attackSign = 1,
    forceSide = FORCE_SIDES.FORCE_FOREHAND,
    receiverAgilityDelayMs: agilityDelay = 0,
  } = ctx
  const totalThroughSetup = setupMs + releaseMs
  const totalMs = totalThroughSetup + flightMs
  const tracks = {}

  const receiverPlayer = allStart.find((p) => p.id === receiverId)
  const receiverStackIndex = receiverPlayer?.stackIndex ?? 3

  const stackCutters = allStart
    .filter(
      (p) =>
        p.teamId === offenseTeamId &&
        p.fieldRole === 'stack' &&
        p.id !== throwerId &&
        p.id !== dumpPlayerId,
    )
    .sort((a, b) => (a.stackIndex ?? 0) - (b.stackIndex ?? 0))

  const primaryClearStartMs = setupMs * 0.68

  const buildDumpResetTrack = (p) => {
    const stackX = p.x
    const stackY = p.y
    const side = stackY >= FIELD_Y_CENTER ? -1 : 1
    const throwerPt = allStart.find((pl) => pl.id === throwerId)
    const tx = throwerPt?.x ?? stackX - attackSign * 3
    const ty = throwerPt?.y ?? stackY
    const emergency = stallCount > 6
    const catchX = ctx.catchX ?? (emergency ? tx - attackSign * 2.5 : stackX - attackSign * 7)
    const catchY = ctx.catchY ?? (emergency ? ty + side * 2 : stackY + side * 5)
    return {
      teamId: p.teamId,
      label: p.label,
      role: 'dump',
      defaultMotion: emergency ? 'cut' : 'stack',
      keyframes: emergency
        ? [
            { ms: 0, x: stackX, y: stackY, motionPhase: 'stack' },
            {
              ms: setupMs * 0.22,
              x: stackX + (tx - stackX) * 0.35 - attackSign * 1.2,
              y: stackY + (ty - stackY) * 0.4 + side * 1.5,
              ease: 'out',
              motionPhase: 'cut',
            },
            {
              ms: setupMs * 0.55,
              x: stackX + (tx - stackX) * 0.72 - attackSign * 2,
              y: stackY + (ty - stackY) * 0.65 + side * 2.5,
              motionPhase: 'cut',
            },
            {
              ms: totalThroughSetup,
              x: catchX,
              y: catchY,
              motionPhase: 'cut',
            },
            {
              ms: totalThroughSetup + flightMs * 0.85,
              x: ctx.throwSuccess ? catchX : stackX + (tx - stackX) * 0.5,
              y: ctx.throwSuccess ? catchY : stackY + side * 2,
            },
            ...(ctx.throwSuccess
              ? [{ ms: totalThroughSetup + flightMs, x: catchX, y: catchY }]
              : [{ ms: totalThroughSetup + flightMs, x: stackX, y: stackY, ease: 'out' }]),
          ]
        : [
            { ms: 0, x: stackX, y: stackY },
            { ms: setupMs * 0.28, x: stackX - attackSign * 2.5, y: stackY + side * 2.5, ease: 'out' },
            { ms: setupMs * 0.72, x: stackX - attackSign * 5.5, y: stackY + side * 5.5 },
            { ms: totalThroughSetup, x: stackX - attackSign * 6.5, y: stackY + side * 6 },
            {
              ms: totalThroughSetup + flightMs * 0.85,
              x: ctx.throwSuccess ? catchX : stackX - attackSign * 4,
              y: ctx.throwSuccess ? catchY : stackY + side * 3,
            },
            ...(ctx.throwSuccess
              ? [{ ms: totalThroughSetup + flightMs, x: catchX, y: catchY }]
              : [{ ms: totalThroughSetup + flightMs, x: stackX, y: stackY, ease: 'out' }]),
          ],
    }
  }

  const buildReceiverTrack = (p) => {
    if (highStall && p.fieldRole === 'dump') {
      return buildDumpResetTrack(p)
    }

    const depth = highStall
      ? cutDepthForSeparation(separationOutcome) * 0.35
      : cutDepthForSeparation(separationOutcome)
    const stackX = p.x
    const stackY = p.y
    const inCut = stallCount <= 5
    const { cutX, cutY, fakeX, fakeY } = cutTargetForStyle(
      attackStyle,
      stackX,
      stackY,
      depth,
      inCut,
      attackSign,
    )
    const catchX = ctx.catchX ?? cutX
    const catchY = ctx.catchY ?? cutY

    return {
      teamId: p.teamId,
      label: p.label,
      role: 'cutter',
      defaultMotion: 'cut',
      keyframes: buildPlantCutKeyframes({
        stackX,
        stackY,
        fakeX,
        fakeY,
        cutX,
        cutY,
        setupMs,
        totalThroughSetup,
        flightMs,
        catchX,
        catchY,
        throwSuccess: ctx.throwSuccess,
        attackSign,
        includeClearing: false,
      }),
    }
  }

  const buildDecoyStackTrack = (p, continuationStartMs) => {
    const depth = cutDepthForSeparation(separationOutcome) * 0.75
    const stackX = p.x
    const stackY = p.y
    const inCut = stallCount <= 5
    const { cutX, cutY, fakeX, fakeY } = cutTargetForStyle(
      attackStyle,
      stackX,
      stackY,
      depth,
      inCut,
      attackSign,
    )
    const isBeforeReceiver = (p.stackIndex ?? 0) < receiverStackIndex
    const clearStartMs = isBeforeReceiver
      ? primaryClearStartMs
      : Math.max(continuationStartMs ?? primaryClearStartMs, setupMs * 0.38)

    return {
      teamId: p.teamId,
      label: p.label,
      role: 'cutter',
      defaultMotion: 'stack',
      keyframes: buildPlantCutKeyframes({
        stackX,
        stackY,
        fakeX,
        fakeY,
        cutX,
        cutY,
        setupMs,
        totalThroughSetup,
        flightMs,
        catchX: cutX,
        catchY: cutY,
        throwSuccess: false,
        attackSign,
        includeClearing: true,
        clearStartMs,
      }),
    }
  }

  for (const p of allStart) {
    if (p.id === receiverId) {
      tracks[p.id] = buildReceiverTrack(p)
    }
  }

  let continuationStart = primaryClearStartMs
  for (const p of stackCutters) {
    if (p.id === receiverId) continue
    tracks[p.id] = buildDecoyStackTrack(p, continuationStart)
    continuationStart = primaryClearStartMs + setupMs * 0.12
  }

  for (const p of allStart) {
    if (p.teamId !== offenseTeamId) continue
    const isThrower = p.id === throwerId
    const isReceiver = p.id === receiverId
    if (isReceiver) continue

    if (
      (highStall || stallCount > 6) &&
      p.fieldRole === 'dump' &&
      p.id !== throwerId &&
      dumpPlayerId === p.id
    ) {
      tracks[p.id] = buildDumpResetTrack(p)
      continue
    }

    const stackIndex = p.stackIndex ?? 0
    const role = isThrower ? 'thrower' : p.fieldRole ?? 'stack'

    if (isThrower) {
      const px = ctx.discFromX ?? p.x
      const py = ctx.discFromY ?? p.y
      tracks[p.id] = {
        teamId: p.teamId,
        label: p.label,
        role: 'thrower',
        defaultMotion: 'pivot',
        keyframes: buildThrowerPivotKeyframes(px, py, setupMs, totalThroughSetup, flightMs),
      }
      continue
    }

    if (p.fieldRole === 'stack' && tracks[p.id]) {
      continue
    }

    if (highStall && p.fieldRole === 'stack') {
      tracks[p.id] = {
        teamId: p.teamId,
        label: p.label,
        role: 'stack',
        keyframes: [
          { ms: 0, x: p.x, y: p.y },
          { ms: totalThroughSetup + flightMs, x: p.x, y: p.y },
        ],
        stackIndex,
        micro: true,
      }
      continue
    }

    const dumpPullback = p.fieldRole === 'dump' ? -2.2 * attackSign : 0
    tracks[p.id] = {
      teamId: p.teamId,
      label: p.label,
      role,
      keyframes: [
        { ms: 0, x: p.x, y: p.y, motionPhase: 'stack' },
        {
          ms: setupMs,
          x: clampX(p.x + dumpPullback - 0.8),
          y: p.y,
          motionPhase: 'stack',
          ease: 'linear',
        },
        {
          ms: totalThroughSetup + flightMs,
          x: clampX(p.x + dumpPullback - 1.2),
          y: p.y,
          motionPhase: 'stack',
          ease: 'linear',
        },
      ],
      stackIndex,
      defaultMotion: 'stack',
    }
  }

  const totalMsFinal = totalMs

  for (const p of allStart) {
    if (p.teamId === offenseTeamId) continue

    if (!personMark && (p.fieldRole === 'zone_cup' || p.fieldRole === 'zone_wall')) {
      tracks[p.id] = {
        teamId: p.teamId,
        label: p.label,
        role: p.fieldRole,
        keyframes: [
          { ms: 0, x: p.x, y: p.y },
          { ms: setupMs * 0.55, x: clampX(p.x + attackSign * 1.4), y: p.y },
          { ms: totalMs, x: clampX(p.x + 0.8), y: p.y },
        ],
      }
      continue
    }

    if (personMark && p.markTargetId === throwerId && tracks[throwerId]) {
      tracks[p.id] = {
        teamId: p.teamId,
        label: p.label,
        role: 'marker',
        defaultMotion: 'shuffle',
        keyframes: buildThrowerMarkArcKeyframes(
          tracks[throwerId],
          setupMs,
          totalMsFinal,
          forceSide,
          attackSign,
        ),
      }
      continue
    }

    if (personMark && p.markTargetId && tracks[p.markTargetId]) {
      tracks[p.id] = buildHipTurnMarkTrack(p, tracks[p.markTargetId], {
        setupMs,
        totalMs: totalMsFinal,
        separationOutcome,
        stallCount,
        attackSign,
        isActiveMark: p.id === defenderId,
        receiverAgilityDelayMs: agilityDelay,
        defenderStamina: p.currentStamina ?? 100,
      })
      continue
    }

    if (personMark && p.fieldRole === 'marker') {
      const offensePeers = allStart.filter((pl) => pl.teamId === offenseTeamId)
      const target = offensePeers[p.stackIndex ?? 0]
      if (target?.id === throwerId && tracks[throwerId]) {
        tracks[p.id] = {
          teamId: p.teamId,
          label: p.label,
          role: 'marker',
          defaultMotion: 'shuffle',
          keyframes: buildThrowerMarkArcKeyframes(
            tracks[throwerId],
            setupMs,
            totalMsFinal,
            forceSide,
            attackSign,
          ),
        }
        continue
      }
      if (target?.id && tracks[target.id]) {
        tracks[p.id] = buildHipTurnMarkTrack(p, tracks[target.id], {
          setupMs,
          totalMs: totalMsFinal,
          separationOutcome,
          stallCount,
          attackSign,
          isActiveMark: p.id === defenderId,
          receiverAgilityDelayMs: agilityDelay,
          defenderStamina: p.currentStamina ?? 100,
        })
      }
      continue
    }

    if (!personMark && p.fieldRole === 'zone') {
      tracks[p.id] = {
        teamId: p.teamId,
        label: p.label,
        role: 'zone',
        keyframes: [
          { ms: 0, x: p.x, y: p.y },
          { ms: totalMs, x: p.x, y: p.y },
        ],
        stackIndex: p.stackIndex ?? 0,
        micro: true,
      }
    }
  }

  return tracks
}

function applyStackMicro(tracks, setupMs, timeMs) {
  const out = {}
  for (const [id, track] of Object.entries(tracks)) {
    if (!track.micro) {
      out[id] = track
      continue
    }
    const base = sampleKeyframes(track.keyframes, timeMs)
    const { dx, dy } = stackMicroOffset(track.stackIndex ?? 0, setupMs, Math.min(timeMs, setupMs))
    out[id] = {
      ...track,
      sample: { x: base.x + dx, y: base.y + dy },
    }
  }
  return out
}

function filterPlayersToTacticalRoster(players, tacticalAll) {
  if (!tacticalAll?.length || !players?.length) return players ?? []
  const allowed = new Set(tacticalAll.map((p) => p.id))
  return players.filter((p) => allowed.has(p.id))
}

function sampleTracks(tracks, timeMs, setupMs, tacticalAll = null) {
  const withMicro = applyStackMicro(tracks, setupMs, timeMs)
  const tacticalById = new Map((tacticalAll ?? []).map((p) => [p.id, p]))
  const players = []
  const seen = new Set()
  for (const [id, track] of Object.entries(withMicro)) {
    const pos = track.sample ?? sampleKeyframes(track.keyframes, timeMs)
    const tactical = tacticalById.get(id) ?? tacticalById.get(Number(id))
    seen.add(id)
    players.push({
      id: Number.isFinite(Number(id)) ? Number(id) : id,
      fieldId: track.fieldId ?? id,
      teamId: track.teamId,
      label: track.label,
      role: track.role,
      isActiveMark: track.isActiveMark ?? false,
      markTargetId: track.markTargetId ?? tactical?.markTargetId ?? null,
      x: pos.x,
      y: pos.y,
      motionPhase: motionPhaseAtTrack(track, timeMs),
    })
  }
  if (tacticalAll?.length) {
    for (const p of tacticalAll) {
      if (seen.has(p.id) || seen.has(String(p.id))) continue
      const track = withMicro[p.id] ?? withMicro[String(p.id)]
      const pos = track
        ? track.sample ?? sampleKeyframes(track.keyframes, timeMs)
        : { x: p.x, y: p.y }
      players.push({
        id: p.id,
        fieldId: p.fieldId ?? p.id,
        teamId: p.teamId,
        label: p.label,
        role: p.fieldRole ?? 'stack',
        markTargetId: p.markTargetId ?? null,
        x: pos.x,
        y: pos.y,
        motionPhase: track ? motionPhaseAtTrack(track, timeMs) : 'stack',
      })
    }
  }
  return filterPlayersToTacticalRoster(players, tacticalAll)
}

function samplePathPoint(pathPoints, u) {
  if (!pathPoints?.length) return null
  if (pathPoints.length === 1) return pathPoints[0]
  const segs = pathPoints.length - 1
  const f = u * segs
  const i = Math.min(segs - 1, Math.floor(f))
  const local = f - i
  const a = pathPoints[i]
  const b = pathPoints[i + 1]
  return { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local) }
}

/** Ostatnia poza klipu — ciągłość między tickami. */
export function extractClipEndPose(clip) {
  if (!clip) return null
  const frame = sampleFieldActionClip(clip, clip.totalDurationMs)
  if (!frame?.players) return null
  return {
    discX: frame.discX,
    discY: frame.discY,
    players: frame.players.map((p) => ({
      id: p.id,
      fieldId: p.fieldId ?? p.id,
      teamId: p.teamId,
      x: p.x,
      y: p.y,
    })),
  }
}

export function poseToRenderFrame(pose, fieldState) {
  if (!pose || !fieldState) return null
  const discX = pose.discX
  const discY = pose.discY
  const labelById = new Map()
  for (const p of [...fieldState.homePlayers, ...fieldState.awayPlayers]) {
    labelById.set(p.id, p.label)
  }
  const mapped = pose.players.map((p) => ({
    ...p,
    label: labelById.get(p.id) ?? p.label ?? '?',
    role:
      Math.hypot(p.x - discX, p.y - discY) < 4
        ? 'thrower'
        : p.role ?? 'stack',
  }))
  return {
    phase: 'idle',
    phaseProgress: 0,
    players: filterPlayersToPointLineup(
      mapped,
      fieldState.homeLineupIds,
      fieldState.awayLineupIds,
    ),
    discX,
    discY,
    stallCount: fieldState.stallCount,
    displayStall: fieldState.stallCount,
    showPath: false,
    pathProgress: 0,
    throwType: fieldState.throwType,
    throwPathPoints: null,
    actionLabel: null,
    stallPulse: false,
    cameraFocusX: discX,
    cameraFocusY: discY,
  }
}

function applyStartPoseToLayout(players, startPose) {
  const initial = normalizeInitialPlayerPositions(startPose)
  if (!initial) return players
  const warnedIds = new Set()
  return players.map((p) => {
    const s = resolveStartXY(p, initial, p, warnedIds)
    if (!s.fromInitial) return p
    return { ...p, x: s.x, y: s.y }
  })
}

/**
 * Mapa pozycji startowych klipu: { players: { [id]: { x, y } }, disc?: { x, y } }
 * lub legacy pose z extractClipEndPose ({ players: [...], discX, discY }).
 */
export function normalizeInitialPlayerPositions(input) {
  if (!input) return null
  const previousById = input.previousById instanceof Map
    ? input.previousById
    : input.previousById
      ? new Map(Object.entries(input.previousById))
      : null

  if (input.byId instanceof Map) {
    return {
      byId: input.byId,
      discX: input.discX,
      discY: input.discY,
      previousById,
    }
  }
  if (input.players && !Array.isArray(input.players)) {
    const byId = new Map(Object.entries(input.players))
    return {
      byId,
      discX: input.disc?.x ?? input.discX,
      discY: input.disc?.y ?? input.discY,
      previousById,
    }
  }
  if (Array.isArray(input.players)) {
    const byId = new Map()
    for (const p of input.players) {
      const key = p.fieldId ?? p.id
      if (key) byId.set(key, { x: p.x, y: p.y })
      if (p.id && p.fieldId && p.id !== p.fieldId) {
        byId.set(p.id, { x: p.x, y: p.y })
      }
    }
    return { byId, discX: input.discX, discY: input.discY, previousById }
  }
  return null
}

export function renderedFrameToInitialPlayerPositions(frame) {
  if (!frame?.players?.length) return null
  const players = {}
  const previousById = {}
  for (const p of frame.players) {
    const slotKey = p.fieldId ?? p.id
    if (!slotKey) continue
    const pt = { x: p.x, y: p.y }
    players[slotKey] = pt
    previousById[slotKey] = pt
    if (p.id && p.id !== slotKey) {
      players[p.id] = pt
      previousById[p.id] = pt
    }
  }
  return {
    players,
    disc: { x: frame.discX, y: frame.discY },
    previousById,
  }
}

export function pruneInitialPositionsToLineup(initialInput, homeLineupIds, awayLineupIds) {
  if (!initialInput) return null
  const norm = normalizeInitialPlayerPositions(initialInput)
  if (!norm?.byId) return initialInput
  const home = new Set((homeLineupIds ?? []).filter(Boolean))
  const away = new Set((awayLineupIds ?? []).filter(Boolean))
  const rosterIds = new Set([...home, ...away])
  if (!rosterIds.size) return initialInput

  const players = {}
  const previousById = {}
  for (const [key, pt] of norm.byId.entries()) {
    if (rosterIds.has(key)) {
      players[key] = pt
      previousById[key] = pt
    } else if (key.startsWith('home_') && home.size) {
      const idx = Number(key.split('_')[1])
      const rosterId = homeLineupIds?.[idx]
      if (rosterId) {
        players[key] = pt
        previousById[key] = pt
      }
    } else if (key.startsWith('away_') && away.size) {
      const idx = Number(key.split('_')[1])
      const rosterId = awayLineupIds?.[idx]
      if (rosterId) {
        players[key] = pt
        previousById[key] = pt
      }
    }
  }
  return {
    players,
    disc: norm.discX != null ? { x: norm.discX, y: norm.discY } : initialInput.disc,
    previousById,
  }
}

export function clipEndToInitialPlayerPositions(pose) {
  const norm = normalizeInitialPlayerPositions(pose)
  if (!norm) return null
  const players = {}
  for (const [id, pt] of norm.byId.entries()) {
    if (id.includes('_') || id.startsWith('home') || id.startsWith('away')) {
      players[id] = { x: pt.x, y: pt.y }
    }
  }
  for (const [id, pt] of norm.byId.entries()) {
    if (!players[id]) players[id] = { x: pt.x, y: pt.y }
  }
  return {
    players,
    disc: norm.discX != null ? { x: norm.discX, y: norm.discY } : undefined,
    previousById: Object.fromEntries(norm.byId.entries()),
  }
}

function initialXY(initial, player, tactical, warnedIds) {
  return resolveStartXY(player, initial, tactical, warnedIds ?? new Set())
}

function shiftTrackKeyframes(track, deltaMs) {
  if (!deltaMs || !track?.keyframes) return track
  return {
    ...track,
    keyframes: track.keyframes.map((k) => ({ ...k, ms: k.ms + deltaMs })),
  }
}

function repositionTarget(tactical, playerId, ctx) {
  const {
    throwerId,
    holdThrowerAtCatch,
    turnoverPickupId,
    discX,
    discY,
    initial,
    catchAnchorX,
    catchAnchorY,
    dynamicReorg,
    forceSide,
    possessionTeam,
    sidesSwapped,
  } = ctx
  if (turnoverPickupId && playerId === turnoverPickupId && discX != null && discY != null) {
    return { x: discX, y: discY }
  }
  if (holdThrowerAtCatch && playerId === throwerId) {
    if (catchAnchorX != null && catchAnchorY != null) {
      return { x: catchAnchorX, y: catchAnchorY }
    }
    if (initial) {
      const start = resolveStartXY(tactical, initial, tactical, new Set())
      return { x: start.x, y: start.y }
    }
  }
  if (dynamicReorg && discX != null && discY != null) {
    const poss = possessionTeam ?? tactical.teamId
    const isOffense = tactical.teamId === poss
    const defenseRole =
      tactical.fieldRole === 'marker' ||
      tactical.fieldRole === 'defender' ||
      tactical.fieldRole === 'zone' ||
      tactical.fieldRole === 'zone_cup' ||
      tactical.fieldRole === 'zone_wall' ||
      (tactical.markTargetId != null && !isOffense)
    // Obrońcy zostają przy taktycznych markach — computeDynamicOffenseTarget
    // rozrzuca ich jak cuttersów i wygląda jak kompletne zgubienie krycia.
    if (!isOffense || defenseRole) {
      return { x: tactical.x, y: tactical.y }
    }
    const start = initial
      ? resolveStartXY(tactical, initial, tactical, new Set())
      : { x: tactical.x, y: tactical.y }
    // `poss` to etykieta rosterowa (do isOffense wyżej) — kierunek ataku na boisku
    // trzeba liczyć przez geoTeam/sidesSwapped, inaczej co drugi punkt (strony
    // zamienione) rozstawia zawodników za dyskiem zamiast przed nim.
    const attackSign = attackDirectionX(geoTeam(poss, sidesSwapped))
    const inLane = isCloggingThrowLane(
      start.x,
      start.y,
      { x: discX, y: discY },
      { x: discX, y: discY },
      poss,
      attackSign,
    )
    return computeDynamicOffenseTarget({
      x: start.x,
      y: start.y,
      disc: { x: discX, y: discY },
      throwerId,
      playerId,
      throwerPos: { x: discX, y: discY },
      forceSide,
      possessionTeam: poss,
      inThrowLane: inLane,
      rng: null,
      attackSign,
    })
  }
  return { x: tactical.x, y: tactical.y }
}

function ensureTracksForAllPlayers(tracks, tacticalAll) {
  for (const tactical of tacticalAll) {
    if (tracks[tactical.id]) continue
    tracks[tactical.id] = {
      id: tactical.id,
      teamId: tactical.teamId,
      label: tactical.label,
      role: tactical.fieldRole ?? 'stack',
      fieldId: tactical.fieldId,
      keyframes: [{ ms: 0, x: tactical.x, y: tactical.y, ease: 'linear' }],
    }
  }
  return tracks
}

/** Klatka 0 = initial; do repositionMs → pozycje taktyczne (formacja). */
function applyRepositioningToTracks(tracks, tacticalAll, initial, repositionMs, ctx) {
  if (!initial || !repositionMs || repositionMs <= 0) return tracks
  ensureTracksForAllPlayers(tracks, tacticalAll)
  const tacticalById = new Map(tacticalAll.map((p) => [p.id, p]))
  const warnedIds = new Set()

  for (const tactical of tacticalAll) {
    const id = tactical.id
    const track = tracks[id]
    if (!track) continue
    const start = resolveStartXY(tactical, initial, tactical, warnedIds)
    const end = repositionTarget(tactical, id, { ...ctx, initial })
    const shifted = shiftTrackKeyframes(track, repositionMs)
    tracks[id] = {
      ...shifted,
      fieldId: tactical.fieldId,
      keyframes: [
        { ms: 0, x: start.x, y: start.y, ease: 'linear', motionPhase: 'reposition' },
        { ms: repositionMs, x: end.x, y: end.y, ease: 'linear', motionPhase: 'stack' },
        ...(shifted.keyframes ?? []),
      ],
    }
  }
  return tracks
}

function computeTravelDurationMs(
  startAll,
  endAll,
  discFromX,
  discFromY,
  discToX,
  discToY,
  runSpeedMultiplier = 1,
) {
  let maxM = 0
  for (const p of startAll) {
    const end = endAll.find((e) => e.id === p.id)
    if (!end) continue
    maxM = Math.max(maxM, Math.hypot(end.x - p.x, end.y - p.y))
  }
  maxM = Math.max(maxM, Math.hypot(discToX - discFromX, discToY - discFromY))
  if (maxM < 0.15) return FIELD_TRANSITION_MIN_MS
  const speed = FIELD_RUN_SPEED_MPS * Math.max(0.75, runSpeedMultiplier)
  const ms = (maxM / speed) * 1000
  return clamp(ms, FIELD_TRANSITION_MIN_MS, FIELD_TRANSITION_MAX_MS)
}

function layoutsFromState(state) {
  return [
    ...state.homePlayers.map((p, i) => ({
      ...p,
      teamId: 'home',
      fieldId: p.fieldId ?? fieldSlotId('home', i),
    })),
    ...state.awayPlayers.map((p, i) => ({
      ...p,
      teamId: 'away',
      fieldId: p.fieldId ?? fieldSlotId('away', i),
    })),
  ]
}

function positionKeysForPlayer(player) {
  const keys = []
  if (player.fieldId) keys.push(player.fieldId)
  if (player.id) keys.push(player.id)
  return keys
}

function resolveStartXY(player, initial, tactical, warnedIds) {
  if (initial?.byId) {
    for (const key of positionKeysForPlayer(player)) {
      const pt = initial.byId.get(key)
      if (pt) return { x: pt.x, y: pt.y, fromInitial: true }
    }
  }
  if (initial?.previousById) {
    for (const key of positionKeysForPlayer(player)) {
      const pt = initial.previousById.get(key)
      if (pt) {
        const label = player.fieldId ?? player.id
        if (!warnedIds.has(label)) {
          warnedIds.add(label)
          console.warn(
            `[fieldMotion] Brak pozycji w initialPlayerPositions dla ${label}; używam ostatniej klatki.`,
          )
        }
        return { x: pt.x, y: pt.y, fromInitial: true }
      }
    }
  }
  const label = player.fieldId ?? player.id
  if (initial && !warnedIds.has(label)) {
    warnedIds.add(label)
    console.warn(
      `[fieldMotion] Brak dopasowania ID dla ${label}; fallback taktyczny (możliwy skok).`,
    )
  }
  return { x: tactical.x, y: tactical.y, fromInitial: false }
}

function enrichLayoutRoles(players, throwerId) {
  return players.map((p) => ({
    ...p,
    fieldRole: p.id === throwerId ? 'thrower' : p.fieldRole ?? 'stack',
  }))
}

function mergeActionSimIntoTracks(tracks, actionSim, tacticalAll, setupMs) {
  if (!actionSim?.frames?.length) return tracks
  const throwMs = actionSim.throwMs ?? actionSim.frames[actionSim.frames.length - 1]?.ms ?? setupMs
  const simDuration = Math.max(throwMs, 400)
  const timeScale = setupMs / simDuration

  for (const tactical of tacticalAll) {
    const keyframes = []
    for (const frame of actionSim.frames) {
      if (frame.ms > throwMs + 50) break
      const pl = frame.players?.find((p) => p.id === tactical.id)
      if (!pl) continue
      const phase =
        pl.cutterState === 'ACTIVE_CUT' || pl.cutterState === 'INITIATING_CUT'
          ? 'cut'
          : pl.cutterState === 'CLEARING'
            ? 'clear'
            : pl.role === 'thrower'
              ? 'pivot'
              : 'stack'
      keyframes.push({
        ms: Math.round(frame.ms * timeScale),
        x: pl.x,
        y: pl.y,
        motionPhase: phase,
        ease: 'linear',
      })
    }
    while (keyframes.length >= 2) {
      const last = keyframes[keyframes.length - 1]
      const prev = keyframes[keyframes.length - 2]
      if (last.ms <= prev.ms) keyframes.pop()
      else break
    }
    if (keyframes.length < 2) continue
    const last = keyframes[keyframes.length - 1]
    if (last.ms < setupMs) {
      keyframes.push({ ms: setupMs, x: last.x, y: last.y, motionPhase: last.motionPhase })
    }
    tracks[tactical.id] = {
      ...(tracks[tactical.id] ?? {}),
      id: tactical.id,
      fieldId: tactical.fieldId,
      teamId: tactical.teamId,
      label: tactical.label,
      role: tactical.fieldRole ?? tracks[tactical.id]?.role ?? 'stack',
      keyframes,
    }
  }
  return tracks
}

/**
 * Klip animacji rzutu (throw_attempt → throw_success|throw_fail).
 */
export function buildThrowActionClip(
  pointEvents,
  attemptStepIndex,
  homeTeam,
  awayTeam,
  pullTeam,
  initialPlayerPositions = null,
) {
  const attemptEv = pointEvents[attemptStepIndex]
  if (attemptEv?.type !== 'throw_attempt') return null

  const resultEv = pointEvents[attemptStepIndex + 1]
  if (!resultEv || !['throw_success', 'throw_fail'].includes(resultEv.type)) return null

  const prevIndex = Math.max(0, attemptStepIndex - 1)
  const stateStart = fieldStateAtEventStep(
    pointEvents,
    prevIndex,
    homeTeam,
    awayTeam,
    pullTeam,
  )
  const stateEnd = fieldStateAtEventStep(
    pointEvents,
    attemptStepIndex + 1,
    homeTeam,
    awayTeam,
    pullTeam,
  )

  const initial = normalizeInitialPlayerPositions(initialPlayerPositions)
  const repositionMs = initial ? REPOSITION_PHASE_MS : 0
  const holdStartMs = attemptEv.holdStartMs ?? attemptEv.motionTrace?.holdStartMs ?? 0
  const throwMsForStall = attemptEv.motionTrace?.throwMs ?? null
  // Czas setupu = realny czas do rzutu (żeby stall tickał 1 s = 1).
  const actionSetupMs =
    throwMsForStall != null && throwMsForStall > 0
      ? throwMsForStall
      : setupDurationForStall(attemptEv.stallCount ?? 0)
  const setupMs = repositionMs + actionSetupMs
  let releaseMs = attemptEv.motionTrace?.releaseMs ?? 0
  let flightMs = FIELD_PHASE_MS.flight
  if (attemptEv.motionTrace?.totalMs != null && attemptEv.motionTrace?.throwMs != null) {
    const traceFlightMs = Math.max(
      0,
      attemptEv.motionTrace.totalMs - (attemptEv.motionTrace.throwMs ?? 0) - releaseMs,
    )
    flightMs = Math.max(flightMs, traceFlightMs)
  } else if (attemptEv.motionTrace?.flightMs) {
    flightMs = Math.max(flightMs, attemptEv.motionTrace.flightMs)
  }
  const totalDurationMs = setupMs + releaseMs + flightMs

  const stallCount = attemptEv.stallCount ?? 0
  const highStall = stallCount > HIGH_STALL_THRESHOLD
  const stallStart = stallCountFromHoldMs(holdStartMs)
  const stallEnd = Math.max(
    stallStart,
    attemptEv.stallCount ?? stallCountFromHoldMs(holdStartMs + actionSetupMs),
  )

  const { attackStyle, defenseStyle, personMark } = resolveFieldTactics(
    attemptEv.possessionTeam ?? stateStart.possessionTeam,
    homeTeam,
    awayTeam,
    attemptEv,
  )

  const separationOutcome = attemptEv.separationOutcome ?? 'contested'
  const offenseTeamId = attemptEv.possessionTeam ?? stateStart.possessionTeam
  const sidesSwapped = stateStart.sidesSwapped
  const discMeters = stateStart.discMeters
  const attackSign = attackDirectionX(geoTeam(offenseTeamId, sidesSwapped))

  const tacticalAll = enrichLayoutRoles(
    layoutsFromState(stateStart),
    attemptEv.throwerId,
  )
  const endAll = layoutsFromState(stateEnd)
  const catchPlayer = endAll.find((p) => p.id === attemptEv.receiverId)
  const throwerStart = tacticalAll.find((p) => p.id === attemptEv.throwerId)

  const throwerInitial =
    initial && throwerStart
      ? resolveStartXY(throwerStart, initial, throwerStart, new Set())
      : null
  const discFromX = initial?.discX ?? throwerInitial?.x ?? throwerStart?.x ?? stateStart.discX
  const discFromY = initial?.discY ?? throwerInitial?.y ?? throwerStart?.y ?? stateStart.discY
  const catchX = catchPlayer?.x ?? stateEnd.discX
  const catchY = catchPlayer?.y ?? attemptEv.targetFieldY ?? stateEnd.discY
  const throwSuccess = resultEv.type === 'throw_success'

  const motionCatch = resolveCatchPointFromMotionTrace(
    attemptEv.motionTrace,
    attemptEv.receiverId,
    throwSuccess,
  )
  const resolvedCatchX = motionCatch?.x ?? catchX
  const resolvedCatchY = motionCatch?.y ?? catchY

  let discToX = resolvedCatchX
  let discToY = resolvedCatchY
  if (!throwSuccess) {
    const ground =
      resultEv.turnoverPoint ??
      resolveTurnoverPointFromMotionTrace(attemptEv.motionTrace, {
        receiverId: attemptEv.receiverId ?? resultEv.receiverId,
        defenderId: resultEv.defenderId,
        isBlock: !!resultEv.isBlock,
      })
    if (ground) {
      discToX = ground.x
      discToY = ground.y
    } else {
      discToX =
        resultEv.discPosition != null
          ? discMetersFromState(resultEv.discPosition, geoTeam(stateEnd.possessionTeam, stateEnd.sidesSwapped))
          : stateEnd.discX
      discToY = resultEv.discYMeters ?? stateEnd.discY
    }
  }

  const throwPathPoints = attemptEv.motionTrace?.throwPathPoints ??
    buildThrowPathPoints(
    discFromX,
    discFromY,
    discToX,
    discToY,
    attemptEv.trajectory ?? resultEv.trajectory,
    attemptEv.throwType ?? resultEv.throwType,
  )

  const dumpPlayerId = tacticalAll.find((p) => p.fieldRole === 'dump')?.id ?? null

  const defenseTeam = offenseTeamId === 'home' ? awayTeam : homeTeam
  const forceSide = resolveMarkForceSide(defenseTeam, attemptEv)
  const receiverSkills = findPlayerSkills(attemptEv.receiverId, homeTeam, awayTeam)
  const agilityDelay = cutterAgilityDelayMs(receiverSkills)

  const tracks = buildPlayerBaseTracks(tacticalAll, actionSetupMs, flightMs, releaseMs, {
    throwerId: attemptEv.throwerId,
    receiverId: attemptEv.receiverId,
    defenderId: attemptEv.defenderId,
    separationOutcome,
    discMeters,
    offenseTeamId,
    catchX: resolvedCatchX,
    catchY: resolvedCatchY,
    discFromX,
    discFromY,
    throwSuccess,
    attackStyle,
    personMark,
    stallCount,
    highStall,
    dumpPlayerId,
    attackSign,
    forceSide,
    receiverAgilityDelayMs: agilityDelay,
  })

  applyRepositioningToTracks(tracks, tacticalAll, initial, repositionMs, {
    throwerId: attemptEv.throwerId,
    holdThrowerAtCatch: true,
    turnoverPickupId: null,
    discX: discFromX,
    discY: discFromY,
    catchAnchorX: discFromX,
    catchAnchorY: discFromY,
    initial,
    dynamicReorg: true,
    forceSide,
    possessionTeam: offenseTeamId,
    sidesSwapped,
  })

  const anchorPivot =
    initial && discFromX != null
      ? { [attemptEv.throwerId]: { x: discFromX, y: discFromY } }
      : {}

  const keyframesAfterReposition = {}
  for (const id of Object.keys(tracks)) {
    keyframesAfterReposition[id] = (tracks[id].keyframes ?? []).map((k) => ({ ...k }))
  }

  if (attemptEv.motionTrace?.frames?.length) {
    applyMotionTraceToTracks(tracks, attemptEv.motionTrace, tacticalAll, {
      setupMs,
      releaseMs,
      flightMs,
    }, { anchorPivot })
    if (anchorPivot[attemptEv.throwerId]) {
      lockPlayerTrackToCatchAnchor(
        tracks,
        attemptEv.throwerId,
        discFromX,
        discFromY,
        0,
        setupMs,
        { pivotDuringSetup: true, setupMs },
      )
    }
    const stallMarkerId = attemptEv.markerId ?? attemptEv.motionTrace?.markerId ?? null
    if (stallMarkerId != null) {
      syncStallMarkerTrackToThrower(
        tracks,
        stallMarkerId,
        attemptEv.throwerId,
        forceSide,
        attackSign,
        setupMs,
      )
    }
    // Gdy motionTrace ma już fazę lotu, nie doklejaj syntetycznych cutów —
    // powodowały bieg odbiorcy do B przy dysku lecącym do A (i teleporcie na koniec).
    const throwMs = attemptEv.motionTrace.throwMs
    const traceHasFlight =
      (attemptEv.motionTrace.flightMs ?? 0) > 0 ||
      (throwMs != null &&
        attemptEv.motionTrace.frames.some((f) => (f.ms ?? 0) > throwMs))
    if (!traceHasFlight) {
      for (const p of tacticalAll) {
        const tail = (keyframesAfterReposition[p.id] ?? []).filter((k) => k.ms > setupMs)
        if (tail.length && tracks[p.id]?.keyframes) {
          tracks[p.id].keyframes = [...tracks[p.id].keyframes, ...tail]
        }
      }
    }
  } else if (attemptEv.actionSim?.frames?.length) {
    mergeActionSimIntoTracks(tracks, attemptEv.actionSim, tacticalAll, setupMs)
    for (const p of tacticalAll) {
      const tail = (keyframesAfterReposition[p.id] ?? []).filter((k) => k.ms > setupMs)
      if (tail.length && tracks[p.id]?.keyframes) {
        tracks[p.id].keyframes = [...tracks[p.id].keyframes, ...tail]
      }
    }
  }

  {
    const stallMarkerId = attemptEv.markerId ?? attemptEv.motionTrace?.markerId ?? null
    if (stallMarkerId != null && !attemptEv.motionTrace?.frames?.length) {
      syncStallMarkerTrackToThrower(
        tracks,
        stallMarkerId,
        attemptEv.throwerId,
        forceSide,
        attackSign,
        setupMs,
      )
    }
  }

  if (throwSuccess && attemptEv.receiverId) {
    const flightEndMs = setupMs + releaseMs + flightMs
    lockPlayerTrackToCatchAnchor(
      tracks,
      attemptEv.receiverId,
      resolvedCatchX,
      resolvedCatchY,
      flightEndMs,
      totalDurationMs,
    )
  }

  for (const p of tacticalAll) {
    if (tracks[p.id]) {
      tracks[p.id].id = p.id
      tracks[p.id].fieldId = p.fieldId
      if (attemptEv.markerId != null && p.id === attemptEv.markerId) {
        tracks[p.id].role = 'marker'
        tracks[p.id].isActiveMark = true
        tracks[p.id].markTargetId = attemptEv.throwerId
      } else if (p.markTargetId != null) {
        tracks[p.id].role =
          p.fieldRole === 'zone_cup'
            ? 'zone_cup'
            : p.fieldRole === 'zone_wall'
              ? 'zone_wall'
              : p.fieldRole === 'zone'
                ? 'zone'
                : 'defender'
        tracks[p.id].isActiveMark = false
        tracks[p.id].markTargetId = p.markTargetId
      } else if (tracks[p.id].role === 'marker' && p.markTargetId !== attemptEv.throwerId) {
        tracks[p.id].role = p.fieldRole === 'zone_cup' ? 'zone_cup' : 'defender'
        tracks[p.id].isActiveMark = false
      }
    }
  }

  return {
    kind: 'throw',
    attemptStepIndex,
    tacticalAll,
    totalDurationMs,
    setupMs,
    repositionMs,
    releaseMs,
    flightMs,
    stallStart,
    stallEnd,
    holdStartMs,
    throwMs: actionSetupMs,
    markerId: attemptEv.markerId ?? attemptEv.motionTrace?.markerId ?? null,
    highStall,
    attackStyle,
    defenseStyle,
    personMark,
    throwType: attemptEv.throwType ?? resultEv.throwType,
    trajectory: attemptEv.trajectory ?? resultEv.trajectory,
    actionLabel: actionLabelForClip(attemptEv, resultEv),
    throwPathPoints,
    throwerId: attemptEv.throwerId,
    discFromX,
    discFromY,
    discToX,
    discToY,
    tracks,
    cameraDiscX: discMeters,
    motionTrace: attemptEv.motionTrace ?? null,
    receiverId: attemptEv.receiverId,
    throwSuccess,
    possessionTeam: offenseTeamId,
    attackSign,
  }
}

/**
 * Etykieta rzutu w tekście meczowym nad boiskiem 2D.
 *
 * Rozróżnia trzy wymiary, bo w ultimate to są realnie różne zagrania:
 *  - TECHNIKA (backhand / forehand) — którą ręką i którą stroną marka,
 *  - DYSTANS (huck) — czy to rzut głęboki,
 *  - KIERUNEK BIEGU ODBIORCY (leading) — czy dysk czekał na odbiorcę w przestrzeni,
 *    czy odbiorca wbiegł w lecący dysk. Ta sama miara, którą rzucający dobiera tempo
 *    lotu (flightSpeed.js: leading = float, in-cut = płasko).
 *
 * Hammer jest osobną kategorią, bo rzut górny nie ma sensownego podziału na
 * backhand/forehand w tym sensie — leci nad zawodnikami niezależnie od marka.
 */
function actionLabelForClip(attemptEv, resultEv) {
  if (resultEv.type === 'throw_fail' && resultEv.isBlock) {
    return attemptEv.throwType === THROW_TYPE.OVER_THE_TOP ? 'Przechwyt!' : 'D-Block!'
  }
  const t = attemptEv.throwType
  if (t === THROW_TYPE.OVER_THE_TOP) return 'Hammer!'
  if (t === THROW_TYPE.DUMP_SWING) return 'Dump Reset'

  const tech = attemptEv.throwTechnique
  const hand =
    tech === THROW_TECHNIQUE.BACKHAND
      ? 'Backhand'
      : tech === THROW_TECHNIQUE.FOREHAND
        ? 'Forehand'
        : null
  // Bez znanej techniki nie zgadujemy — lepiej ogólna etykieta niż zmyślona ręka.
  if (!hand) return t === THROW_TYPE.HUCK ? 'Huck!' : 'Rzut!'
  if (t === THROW_TYPE.HUCK) return `${hand} huck!`
  if (attemptEv.leadingPass) return `Leading ${hand.toLowerCase()}!`
  return `${hand}!`
}

function findTurnoverPickupId(initial, tacticalAll, discX, discY, offenseTeamId) {
  if (!initial) return null
  let bestId = null
  let bestD = Infinity
  for (const p of tacticalAll) {
    if (p.teamId !== offenseTeamId) continue
    const start = resolveStartXY(p, initial, p, new Set())
    const d = Math.hypot(discX - start.x, discY - start.y)
    if (d < bestD) {
      bestD = d
      bestId = p.id
    }
  }
  return bestId
}

export function buildTransitionClip(
  pointEvents,
  stepIndex,
  homeTeam,
  awayTeam,
  pullTeam,
  initialPlayerPositions = null,
) {
  if (stepIndex <= 0) return null
  const ev = pointEvents[stepIndex]
  const stateA = fieldStateAtEventStep(
    pointEvents,
    stepIndex - 1,
    homeTeam,
    awayTeam,
    pullTeam,
  )
  const stateB = fieldStateAtEventStep(pointEvents, stepIndex, homeTeam, awayTeam, pullTeam)
  const endAll = layoutsFromState(stateB)
  const tacticalAll = endAll
  const initial = normalizeInitialPlayerPositions(initialPlayerPositions)

  const discToX = stateB.discX
  const discToY = stateB.discY
  const discFromX = initial?.discX ?? stateA.discX
  const discFromY = initial?.discY ?? stateA.discY

  const isTurnover =
    ev?.type === 'turnover' || stateA.possessionTeam !== stateB.possessionTeam
  const offenseTeamId = stateB.possessionTeam
  const defenseTeamObj = offenseTeamId === 'home' ? awayTeam : homeTeam
  const transitionForce = resolveMarkForceSide(defenseTeamObj, ev)
  const turnoverPickupId = isTurnover
    ? findTurnoverPickupId(initial, tacticalAll, discToX, discToY, offenseTeamId)
    : null

  if (initial) {
    const repositionMs = REPOSITION_PHASE_MS
    const tracks = {}
    for (const tactical of tacticalAll) {
      const start = resolveStartXY(tactical, initial, tactical, new Set())
      // Bez zmiany posiadania zawodnicy zostają tam, gdzie dobiegli — do formacji
      // dojdą biegiem w kolejnej symulacji, a nie przeskokiem w klipie przejścia.
      const end = isTurnover
        ? repositionTarget(tactical, tactical.id, {
            throwerId: null,
            holdThrowerAtCatch: false,
            turnoverPickupId,
            discX: discToX,
            discY: discToY,
            initial,
            dynamicReorg: false,
            forceSide: transitionForce,
            possessionTeam: offenseTeamId,
          })
        : start
      tracks[tactical.id] = {
        id: tactical.id,
        fieldId: tactical.fieldId,
        teamId: tactical.teamId,
        label: tactical.label,
        role: tactical.fieldRole ?? 'stack',
        defaultMotion: isTurnover ? 'mark' : 'stack',
        keyframes: [
          { ms: 0, x: start.x, y: start.y, ease: 'linear', motionPhase: 'reposition' },
          { ms: repositionMs, x: end.x, y: end.y, ease: 'linear', motionPhase: isTurnover ? 'mark' : 'stack' },
        ],
      }
    }
    return {
      kind: isTurnover ? 'turnover' : 'transition',
      tacticalAll,
      totalDurationMs: repositionMs,
      setupMs: repositionMs,
      repositionMs,
      releaseMs: 0,
      flightMs: 0,
      stallStart: stateB.stallCount,
      stallEnd: stateB.stallCount,
      throwPathPoints: null,
      throwType: null,
      actionLabel: isTurnover ? 'Turnover' : stateB.actionLabel,
      tracks,
      discFromX,
      discFromY,
      discToX,
      discToY,
      throwerId: turnoverPickupId,
      cameraDiscX: stateB.discMeters,
      skipSimInterpolation: isTurnover,
      instantLayout: isTurnover,
    }
  }

  let startAll = layoutsFromState(stateA)
  const avgStamina =
    startAll.reduce((sum, pl) => sum + (pl.currentStamina ?? 100), 0) /
    Math.max(1, startAll.length)
  const runMult = motionFatigueModifiers(avgStamina).runSpeedMultiplier
  const durationMs = computeTravelDurationMs(
    startAll,
    endAll,
    discFromX,
    discFromY,
    discToX,
    discToY,
    runMult,
  )

  const tracks = {}
  for (const p of startAll) {
    const endStatic = endAll.find((e) => e.id === p.id)
    const endDyn = repositionTarget(p, p.id, {
      throwerId: stateB.discHolderId ?? null,
      holdThrowerAtCatch: false,
      turnoverPickupId: null,
      discX: discToX,
      discY: discToY,
      initial: null,
      dynamicReorg: true,
      forceSide: transitionForce,
      possessionTeam: offenseTeamId,
      sidesSwapped: stateB.sidesSwapped,
    })
    const end = endDyn ?? endStatic
    if (!end) continue
    tracks[p.id] = {
      id: p.id,
      teamId: p.teamId,
      label: p.label,
      role: p.fieldRole ?? 'stack',
      defaultMotion: 'stack',
      keyframes: [
        { ms: 0, x: p.x, y: p.y, ease: 'linear', motionPhase: 'stack' },
        { ms: durationMs, x: end.x, y: end.y, ease: 'linear', motionPhase: 'stack' },
      ],
    }
  }
  return {
    kind: 'transition',
    tacticalAll: endAll,
    totalDurationMs: durationMs,
    setupMs: durationMs,
    repositionMs: 0,
    releaseMs: 0,
    flightMs: 0,
    stallStart: stateB.stallCount,
    stallEnd: stateB.stallCount,
    throwPathPoints: null,
    throwType: null,
    actionLabel: stateB.actionLabel,
    tracks,
    discFromX,
    discFromY,
    discToX,
    discToY,
    throwerId: null,
    cameraDiscX: stateB.discMeters,
  }
}

export function buildFieldActionClip(
  pointEvents,
  stepIndex,
  homeTeam,
  awayTeam,
  pullTeam,
  initialPlayerPositions = null,
) {
  const lineups = fieldLineupIdsFromPointEvents(pointEvents)
  const initialForClip = pruneInitialPositionsToLineup(
    initialPlayerPositions,
    lineups.homeLineupIds,
    lineups.awayLineupIds,
  )
  const ev = pointEvents[stepIndex]
  if (ev?.type === 'throw_attempt') {
    return buildThrowActionClip(
      pointEvents,
      stepIndex,
      homeTeam,
      awayTeam,
      pullTeam,
      initialForClip,
    )
  }
  if (ev?.type === 'stall_out') {
    const state = fieldStateAtEventStep(
      pointEvents,
      stepIndex,
      homeTeam,
      awayTeam,
      pullTeam,
    )
    const durationMs = 900
    const layoutAll = layoutsFromState(state)
    const initial = normalizeInitialPlayerPositions(initialForClip)
    const repositionMs = initial ? REPOSITION_PHASE_MS : 0
    const totalDurationMs = repositionMs + durationMs
    const tracks = {}
    for (const p of layoutAll) {
      const startPt = initial
        ? resolveStartXY(p, initial, p, new Set())
        : { x: p.x, y: p.y }
      const isMark = ev.markerId != null && p.id === ev.markerId
      tracks[p.id] = {
        id: p.id,
        fieldId: p.fieldId,
        teamId: p.teamId,
        label: p.label,
        role: p.id === ev.throwerId ? 'thrower' : isMark ? 'marker' : p.fieldRole ?? 'stack',
        isActiveMark: isMark,
        markTargetId: isMark ? ev.throwerId : p.markTargetId ?? null,
        keyframes: [
          { ms: 0, x: startPt.x, y: startPt.y },
          { ms: totalDurationMs, x: startPt.x, y: startPt.y },
        ],
      }
    }
    if (initial && repositionMs > 0) {
      applyRepositioningToTracks(tracks, layoutAll, initial, repositionMs, {
        throwerId: ev.throwerId,
        holdThrowerAtCatch: true,
        turnoverPickupId: null,
        discX: initial.discX ?? state.discX,
        discY: initial.discY ?? state.discY,
        initial,
      })
    }
    return {
      kind: 'stall_out',
      tacticalAll: layoutAll,
      totalDurationMs,
      setupMs: totalDurationMs,
      repositionMs,
      releaseMs: 0,
      flightMs: 0,
      stallStart: ev.stallCount ?? 10,
      stallEnd: ev.stallCount ?? 10,
      holdStartMs: Math.max(0, ((ev.stallCount ?? 10) - 1) * 1000),
      markerId: ev.markerId ?? ev.defenderId ?? null,
      highStall: true,
      throwPathPoints: null,
      throwType: null,
      actionLabel: 'Stall Out!',
      tracks,
      discFromX: state.discX,
      discFromY: state.discY,
      discToX: state.discX,
      discToY: state.discY,
      throwerId: ev.throwerId,
      cameraDiscX: state.discMeters,
    }
  }
  if (ev?.type === 'stall_pressure') {
    const state = fieldStateAtEventStep(
      pointEvents,
      stepIndex,
      homeTeam,
      awayTeam,
      pullTeam,
    )
    const stallCount = ev.stallCount ?? state.stallCount ?? 0
    const hasTrace = ev.motionTrace?.frames?.length > 0
    const holdStartMs = ev.holdStartMs ?? ev.motionTrace?.holdStartMs ?? 0
    const actionMs = hasTrace
      ? ev.motionTrace.totalMs || setupDurationForStall(stallCount)
      : setupDurationForStall(stallCount)
    const initial = normalizeInitialPlayerPositions(initialForClip)
    // Przy własnym zapisie ruchu nie ma czego repozycjonować — klip odtwarza bieg z symulacji.
    const repositionMs = initial && !hasTrace ? REPOSITION_PHASE_MS : 0
    const durationMs = repositionMs + actionMs
    const layoutAll = layoutsFromState(state)
    const offenseTeamId = state.possessionTeam
    const tracks = {}

    const stallWarned = new Set()
    for (const p of layoutAll) {
      const startPt = initial
        ? resolveStartXY(p, initial, p, stallWarned)
        : { x: p.x, y: p.y }
      const holdThrower = p.id === ev.throwerId
      const isMark = (ev.markerId ?? ev.defenderId) != null && p.id === (ev.markerId ?? ev.defenderId)
      tracks[p.id] = {
        id: p.id,
        fieldId: p.fieldId,
        teamId: p.teamId,
        label: p.label,
        role: holdThrower ? 'thrower' : isMark ? 'marker' : p.fieldRole ?? 'stack',
        isActiveMark: isMark,
        markTargetId: isMark ? ev.throwerId : p.markTargetId ?? null,
        keyframes: [
          { ms: 0, x: startPt.x, y: startPt.y },
          {
            ms: actionMs,
            x: holdThrower ? startPt.x : p.x,
            y: holdThrower ? startPt.y : p.y,
          },
        ],
        stackIndex: p.stackIndex ?? 0,
      }
    }

    if (initial && repositionMs > 0) {
      applyRepositioningToTracks(tracks, layoutAll, initial, repositionMs, {
        throwerId: ev.throwerId,
        holdThrowerAtCatch: true,
        turnoverPickupId: null,
        discX: initial.discX ?? state.discX,
        discY: initial.discY ?? state.discY,
        initial,
      })
    }

    if (hasTrace) {
      applyMotionTraceToTracks(
        tracks,
        ev.motionTrace,
        layoutAll,
        { setupMs: durationMs, releaseMs: 0, flightMs: 0 },
      )
    }

    const stallMarkerId = ev.markerId ?? ev.defenderId ?? null
    if (stallMarkerId != null && ev.throwerId != null) {
      syncStallMarkerTrackToThrower(
        tracks,
        stallMarkerId,
        ev.throwerId,
        resolveMarkForceSide(
          state.possessionTeam === 'home' ? awayTeam : homeTeam,
          ev,
        ),
        attackDirectionX(geoTeam(state.possessionTeam, state.sidesSwapped)),
        durationMs,
      )
    }

    const personMark = state.personMark !== false
    for (const p of layoutAll) {
      if (hasTrace) break
      if (p.teamId === offenseTeamId) continue
      if (personMark && (p.markTargetId || p.fieldRole === 'marker')) {
        const targetId =
          p.markTargetId ??
          layoutAll.find((pl) => pl.teamId === offenseTeamId && pl.stackIndex === p.stackIndex)?.id
        if (targetId && tracks[targetId]) {
          tracks[p.id] = buildHipTurnMarkTrack(p, tracks[targetId], {
            setupMs: durationMs,
            totalMs: durationMs,
            separationOutcome: 'contested',
            stallCount,
            attackSign: attackDirectionX(geoTeam(state.possessionTeam, state.sidesSwapped)),
            isActiveMark: false,
            receiverAgilityDelayMs: 0,
            defenderStamina: p.currentStamina ?? 100,
          })
          tracks[p.id].id = p.id
        }
      }
    }

    // Po hip-turnach bez trace: marker throwera z powrotem na force mark.
    if (!hasTrace && stallMarkerId != null && ev.throwerId != null) {
      syncStallMarkerTrackToThrower(
        tracks,
        stallMarkerId,
        ev.throwerId,
        resolveMarkForceSide(
          state.possessionTeam === 'home' ? awayTeam : homeTeam,
          ev,
        ),
        attackDirectionX(geoTeam(state.possessionTeam, state.sidesSwapped)),
        durationMs,
      )
    }

    const discFromX = initial?.discX ?? state.discX
    const discFromY = initial?.discY ?? state.discY
    return {
      kind: 'stall',
      tacticalAll: layoutAll,
      totalDurationMs: durationMs,
      setupMs: durationMs,
      repositionMs,
      releaseMs: 0,
      flightMs: 0,
      stallStart: stallCountFromHoldMs(holdStartMs),
      stallEnd: ev.stallCount ?? state.stallCount,
      holdStartMs,
      throwMs: actionMs,
      markerId: stallMarkerId,
      highStall: stallCount > HIGH_STALL_THRESHOLD,
      throwPathPoints: null,
      throwType: null,
      actionLabel: 'Stall Pressure!',
      tracks,
      discFromX,
      discFromY,
      discToX: state.discX,
      discToY: state.discY,
      throwerId: ev.throwerId,
      cameraDiscX: state.discMeters,
      motionTrace: hasTrace ? ev.motionTrace : null,
    }
  }
  if (['throw_success', 'throw_fail'].includes(ev?.type)) {
    return buildTransitionClip(
      pointEvents,
      stepIndex,
      homeTeam,
      awayTeam,
      pullTeam,
      initialForClip,
    )
  }
  return buildTransitionClip(
    pointEvents,
    stepIndex,
    homeTeam,
    awayTeam,
    pullTeam,
    initialForClip,
  )
}

export function sampleFieldActionClip(clip, elapsedMs) {
  if (!clip) return null
  let t = clamp(elapsedMs, 0, clip.totalDurationMs)
  if (clip.instantLayout) {
    t = clip.totalDurationMs
  }
  const { setupMs, releaseMs, flightMs, repositionMs = 0 } = clip

  let phase = 'setup'
  let phaseProgress = 0
  if (repositionMs > 0 && t < repositionMs) {
    phase = 'reposition'
    phaseProgress = repositionMs > 0 ? t / repositionMs : 1
  } else if (t <= setupMs) {
    phase = 'setup'
    phaseProgress = setupMs > repositionMs ? (t - repositionMs) / (setupMs - repositionMs || 1) : 1
  } else if (t <= setupMs + releaseMs) {
    phase = 'release'
    phaseProgress = releaseMs > 0 ? (t - setupMs) / releaseMs : 1
  } else {
    phase = 'flight'
    phaseProgress = flightMs > 0 ? (t - setupMs - releaseMs) / flightMs : 1
  }

  let players = filterPlayersToTacticalRoster(
    sampleTracks(clip.tracks, t, setupMs, clip.tacticalAll),
    clip.tacticalAll,
  )

  const attackSign = clip.attackSign ?? 1
  let discX = clip.discFromX
  let discY = clip.discFromY
  let discZ = DISC_HELD_Z_M
  let discState = DISC_STATE.HELD

  let showPath = false
  let pathProgress = 0

  const thrower = clip.throwerId && players.find((pl) => pl.id === clip.throwerId)
  const receiver = clip.receiverId && players.find((pl) => pl.id === clip.receiverId)

  if (phase === 'release' || phase === 'setup' || phase === 'reposition') {
    if (thrower) {
      const held = discPositionHeld(thrower.x, thrower.y, attackSign)
      discX = held.x
      discY = held.y
      discZ = held.z
      discState = DISC_STATE.HELD
    }
    if (phase === 'release') {
      showPath = !!clip.throwPathPoints
      pathProgress = 0
    }
  } else if (phase === 'flight') {
    showPath = !!clip.throwPathPoints
    pathProgress = phaseProgress
    discState = DISC_STATE.IN_FLIGHT
    const traced =
      clip.motionTrace &&
      sampleDiscFromMotionTrace(clip.motionTrace, t, setupMs, releaseMs, flightMs)
    if (traced) {
      discX = traced.x
      discY = traced.y
      discZ = traced.z ?? 0
    } else {
      const pt = samplePathPoint(clip.throwPathPoints, easeOutQuad(phaseProgress))
      if (pt) {
        discX = pt.x
        discY = pt.y
      } else {
        discX = lerp(clip.discFromX, clip.discToX, phaseProgress)
        discY = lerp(clip.discFromY, clip.discToY, phaseProgress)
      }
      discZ = 0
    }
    const flightEnd = setupMs + releaseMs + flightMs
    if (clip.throwSuccess !== false && t >= flightEnd - CATCH_SNAP_MS) {
      const snapT = (t - (flightEnd - CATCH_SNAP_MS)) / CATCH_SNAP_MS
      const hx = receiver?.x ?? clip.discToX
      const hy = receiver?.y ?? clip.discToY
      const snapped = discCatchSnapFrame(
        { x: discX, y: discY, z: discZ },
        hx,
        hy,
        attackSign,
        snapT,
      )
      discX = snapped.x
      discY = snapped.y
      discZ = snapped.z
      discState = DISC_STATE.HELD
    } else if (clip.throwSuccess === false && phaseProgress > 0.92) {
      const g = discPositionOnGround(discX, discY)
      discX = g.x
      discY = g.y
      discZ = g.z
      discState = DISC_STATE.ON_GROUND
    }
  } else if (
    clip.kind === 'transition' ||
    clip.kind === 'turnover' ||
    clip.kind === 'stall' ||
    clip.kind === 'stall_out'
  ) {
    const u = clip.totalDurationMs > 0 ? clamp(t / clip.totalDurationMs, 0, 1) : 1
    discX = lerp(clip.discFromX, clip.discToX, u)
    discY = lerp(clip.discFromY, clip.discToY, u)
    discZ = DISC_GROUND_Z_M
    discState = clip.kind === 'turnover' ? DISC_STATE.ON_GROUND : DISC_STATE.HELD
  } else if (thrower) {
    const held = discPositionHeld(thrower.x, thrower.y, attackSign)
    discX = held.x
    discY = held.y
    discZ = held.z
    discState = DISC_STATE.HELD
  }

  const stallT = phase === 'setup' ? easeInOutCubic(phaseProgress) : 1
  const setupOnlyMs = Math.max(0, (setupMs ?? 0) - (repositionMs ?? 0))
  let setupElapsedMs = 0
  if (phase === 'reposition') setupElapsedMs = 0
  else if (phase === 'setup') setupElapsedMs = phaseProgress * setupOnlyMs
  else setupElapsedMs = clip.throwMs ?? setupOnlyMs

  const holdBasedStall =
    clip.holdStartMs != null
      ? stallCountFromHoldMs((clip.holdStartMs ?? 0) + setupElapsedMs)
      : null
  const stallCount =
    holdBasedStall != null
      ? holdBasedStall
      : lerp(clip.stallStart, clip.stallEnd, stallT)
  const displayStall =
    holdBasedStall != null
      ? holdBasedStall >= 1
        ? holdBasedStall
        : null
      : Math.max(1, Math.round(stallCount))

  const focusX = lerp(clip.cameraDiscX ?? discX, discX, phase === 'flight' ? 0.65 : 0.35)
  const focusY = lerp(FIELD_Y_CENTER, discY, 0.5)

  // Oznacz markera throwera na klatce.
  if (clip.markerId != null) {
    for (const p of players) {
      if (p.id === clip.markerId) {
        p.role = 'marker'
        p.isActiveMark = true
        p.markTargetId = clip.throwerId ?? p.markTargetId
      } else if (p.isActiveMark) {
        p.isActiveMark = false
      }
    }
  }

  return {
    phase,
    phaseProgress,
    players,
    discX,
    discY,
    discZ,
    discState,
    stallCount: Math.round(stallCount * 10) / 10,
    displayStall,
    markerId: clip.markerId ?? null,
    throwerId: clip.throwerId ?? null,
    showPath,
    pathProgress,
    throwType: clip.throwType,
    throwPathPoints: clip.throwPathPoints,
    actionLabel: phase === 'release' || phase === 'flight' ? clip.actionLabel : null,
    stallPulse:
      clip.kind === 'stall' ||
      clip.kind === 'stall_out' ||
      clip.highStall ||
      (displayStall ?? 0) >= 8,
    cameraFocusX: focusX,
    cameraFocusY: focusY,
  }
}

export function fieldStateToRenderFrame(fieldState) {
  if (!fieldState) return null
  const players = filterPlayersToPointLineup(
    [
      ...fieldState.homePlayers.map((p) => ({ ...p, teamId: 'home' })),
      ...fieldState.awayPlayers.map((p) => ({ ...p, teamId: 'away' })),
    ],
    fieldState.homeLineupIds,
    fieldState.awayLineupIds,
  )
  return {
    phase: 'idle',
    phaseProgress: 0,
    players: players.map((p) => ({
      ...p,
      role:
        Math.hypot(p.x - fieldState.discX, p.y - fieldState.discY) < 4
          ? 'thrower'
          : p.role ?? 'stack',
    })),
    discX: fieldState.discX,
    discY: fieldState.discY,
    stallCount: fieldState.stallCount,
    displayStall: fieldState.stallCount,
    showPath: false,
    pathProgress: 0,
    throwType: fieldState.throwType,
    throwPathPoints: fieldState.throwPathPoints,
    actionLabel: null,
    stallPulse:
      fieldState.currentEventType === 'stall_pressure' ||
      fieldState.currentEventType === 'stall_out' ||
      (fieldState.stallCount ?? 0) >= 8,
    cameraFocusX: fieldState.discMeters,
    cameraFocusY: fieldState.discY,
  }
}

export function playbackStepAdvanceDelta(pointEvents, stepIndex) {
  const ev = pointEvents[stepIndex]
  if (ev?.type === 'throw_attempt') return 2
  return 1
}