/**
 * Stałe i pomocniki teł — osobno od komponentów, żeby Fast Refresh działał
 * przy edycji scen.
 */

/** Paleta trzymana blisko motywu z index.css (`--color-ufa-*`). */
export const INK = {
  void: '#050a06',
  base: '#080f0a',
  deep: '#0a120c',
  panel: '#101a13',
  mid: '#16241a',
  high: '#1f3324',
  edge: '#2b4331',
  rim: '#3d5c44',
  accent: '#8fae46',
  gold: '#e8a23d',
  haze: '#93a68a',
}

/** Deterministyczny PRNG — te same kształty przy każdym uruchomieniu gry. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const VIEW_W = 1600
export const VIEW_H = 900
