/**
 * Formatowanie kwot — osobny liść bez zależności,
 * żeby dało się importować z clubFinances / playerValue / stąd bezpośrednio.
 *
 * Waluta jest globalna dla aktywnej kariery (moduł-singleton, ustawiany przez
 * `setMoneyCurrency` przy ładowaniu/tworzeniu kariery w App.jsx) — Liga Europejska
 * (EUCS) używa EUR, UFA zostaje przy USD. Jedna kariera aktywna naraz, więc singleton
 * jest bezpieczny i pozwala uniknąć przekazywania waluty przez dziesiątki call site'ów.
 */

let currentCurrency = 'USD'

export function setMoneyCurrency(code) {
  currentCurrency = code === 'EUR' ? 'EUR' : 'USD'
}

export function getMoneyCurrency() {
  return currentCurrency
}

export function formatUsd(amount) {
  const n = Math.round(Number(amount) || 0)
  return new Intl.NumberFormat(currentCurrency === 'EUR' ? 'de-DE' : 'en-US', {
    style: 'currency',
    currency: currentCurrency,
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatUsdCompact(amount) {
  const n = Math.round(Number(amount) || 0)
  const abs = Math.abs(n)
  const symbol = currentCurrency === 'EUR' ? '€' : '$'
  if (abs >= 1_000_000) {
    const m = n / 1_000_000
    return `${symbol}${m.toFixed(m >= 10 || Number.isInteger(m) ? 0 : 1)}M`
  }
  if (abs >= 1000) {
    const k = n / 1000
    return `${symbol}${k.toFixed(k >= 100 || Number.isInteger(k) ? 0 : 1)}k`
  }
  return `${symbol}${n}`
}
