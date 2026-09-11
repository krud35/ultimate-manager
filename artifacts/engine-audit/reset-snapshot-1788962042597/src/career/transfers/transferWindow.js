/**
 * Okna transferowe:
 * - styczeń (zimowe),
 * - 1 lipca – 31 sierpnia (letnie; także pierwszy miesiąc nowego sezonu).
 */

import { parseISODate } from '../../league/seasonCalendar.js'

/**
 * @typedef {{ open: boolean, kind: 'january'|'summer'|null, labelPl: string, labelEn: string }} TransferWindowState
 */

/**
 * @param {object} career
 * @returns {TransferWindowState}
 */
export function getTransferWindowState(career) {
  if (!career) {
    return { open: false, kind: null, labelPl: 'Okno zamknięte', labelEn: 'Window closed' }
  }

  const iso = career.league?.currentDate
  if (!iso) {
    // Po kliknięciu „kolejny sezon” data już jest w nowej lidze; bez daty — zamknięte.
    if (career.phase === 'season_complete') {
      return {
        open: true,
        kind: 'summer',
        labelPl: 'Okno letnie (1 lip – 31 sie)',
        labelEn: 'Summer window (1 Jul – 31 Aug)',
      }
    }
    return { open: false, kind: null, labelPl: 'Okno zamknięte', labelEn: 'Window closed' }
  }

  const d = parseISODate(iso)
  const month = d.getMonth() // 0=sty … 6=lip … 7=sie

  // Styczeń — okno zimowe.
  if (month === 0) {
    return {
      open: true,
      kind: 'january',
      labelPl: 'Okno styczniowe',
      labelEn: 'January window',
    }
  }

  // 1 lipca – 31 sierpnia (włącznie).
  if (month === 6 || month === 7) {
    return {
      open: true,
      kind: 'summer',
      labelPl: 'Okno letnie (1 lip – 31 sie)',
      labelEn: 'Summer window (1 Jul – 31 Aug)',
    }
  }

  return { open: false, kind: null, labelPl: 'Okno zamknięte', labelEn: 'Window closed' }
}

export function isTransferWindowOpen(career) {
  return getTransferWindowState(career).open
}
