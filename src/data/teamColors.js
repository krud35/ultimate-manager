/** Domyślne kolory boiska, gdy drużyna nie ma primaryColor / awayColor. */
export const DEFAULT_HOME_FIELD_COLOR = '#3b82f6'
export const DEFAULT_AWAY_FIELD_COLOR = '#ef4444'

/** Minimalna odległość RGB (0–441), poniżej której kolory uważamy za konflikt. */
const COLOR_CONFLICT_DISTANCE = 95

function parseHexRgb(hex) {
  if (!hex || typeof hex !== 'string') return null
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 || Number.isNaN(Number.parseInt(h, 16))) return null
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  }
}

/** Odległość euklidesowa w przestrzeni RGB (0 ≈ identyczne, ~441 max). */
export function colorDistance(a, b) {
  const ca = parseHexRgb(a)
  const cb = parseHexRgb(b)
  if (!ca || !cb) return Infinity
  const dr = ca.r - cb.r
  const dg = ca.g - cb.g
  const db = ca.b - cb.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

export function colorsConflict(a, b, threshold = COLOR_CONFLICT_DISTANCE) {
  return colorDistance(a, b) < threshold
}

function relativeLuminance(hex) {
  const c = parseHexRgb(hex)
  if (!c) return 0.5
  const lin = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

/** Kontrastowy zapasowy kolor, gdy żaden zestaw kitów nie rozróżnia drużyn. */
function contrastingFallback(against) {
  return relativeLuminance(against) > 0.45 ? '#0f172a' : '#f8fafc'
}

function kitPrimary(team, sideFallback) {
  if (team?.primaryColor) return team.primaryColor
  return sideFallback === 'home' ? DEFAULT_HOME_FIELD_COLOR : DEFAULT_AWAY_FIELD_COLOR
}

function kitAway(team, sideFallback) {
  if (team?.awayColor) return team.awayColor
  if (team?.primaryColor) return contrastingFallback(team.primaryColor)
  return sideFallback === 'home' ? DEFAULT_HOME_FIELD_COLOR : DEFAULT_AWAY_FIELD_COLOR
}

/**
 * Kolor „domyślny” dla strony (bez rozwiązywania konfliktu).
 * Dom: primary, wyjazd: awayColor.
 */
export function teamFieldColor(team, sideFallback) {
  if (sideFallback === 'away') return kitAway(team, 'away')
  return kitPrimary(team, 'home')
}

/**
 * Wybiera kolory meczowe bez konfliktu wizualnego.
 * Preferencja: gospodarz w primary, gość w awayColor; przy konflikcie
 * najpierw zmienia gość, potem gospodarz.
 *
 * @returns {{ homeColor: string, awayColor: string }}
 */
export function resolveMatchColors(homeTeam, awayTeam) {
  const homePrimary = kitPrimary(homeTeam, 'home')
  const homeAlt = kitAway(homeTeam, 'home')
  const awayPrimary = kitPrimary(awayTeam, 'away')
  const awayAlt = kitAway(awayTeam, 'away')

  const candidates = [
    [homePrimary, awayAlt],
    [homePrimary, awayPrimary],
    [homeAlt, awayAlt],
    [homeAlt, awayPrimary],
  ]

  for (const [homeColor, awayColor] of candidates) {
    if (!colorsConflict(homeColor, awayColor)) {
      return { homeColor, awayColor }
    }
  }

  return {
    homeColor: homePrimary,
    awayColor: contrastingFallback(homePrimary),
  }
}
