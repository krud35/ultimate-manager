/**
 * Formatowanie kwot USD — osobny liść bez zależności,
 * żeby dało się importować z clubFinances / playerValue / stąd bezpośrednio.
 */

export function formatUsd(amount) {
  const n = Math.round(Number(amount) || 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatUsdCompact(amount) {
  const n = Math.round(Number(amount) || 0)
  const abs = Math.abs(n)
  if (abs >= 1_000_000) {
    const m = n / 1_000_000
    return `$${m.toFixed(m >= 10 || Number.isInteger(m) ? 0 : 1)}M`
  }
  if (abs >= 1000) {
    const k = n / 1000
    return `$${k.toFixed(k >= 100 || Number.isInteger(k) ? 0 : 1)}k`
  }
  return `$${n}`
}
