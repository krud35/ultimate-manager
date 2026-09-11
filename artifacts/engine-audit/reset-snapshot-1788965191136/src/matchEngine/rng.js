/** Prosty generator losowy; opcjonalnie seed do powtarzalnych testów. */
export function createRng(seed = null) {
  if (seed == null) {
    return {
      float: () => Math.random(),
      int: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    }
  }

  let s = seed >>> 0
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
  return {
    float: next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
  }
}

export function randomSpread(rng, spread) {
  return (rng.float() * 2 - 1) * spread
}

/** Los w zakresie [-spread, 0] — tylko obniża wynik (np. obrona). */
export function negativeRandomSpread(rng, spread) {
  return (rng.float() - 1) * spread
}
