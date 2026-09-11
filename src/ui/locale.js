const STORAGE_KEY = 'ufa-ui-lang'

export const UI_LANG = {
  PL: 'pl',
  EN: 'en',
}

export function readUiLang() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === UI_LANG.EN || raw === UI_LANG.PL) return raw
  } catch {
    /* ignore */
  }
  return UI_LANG.EN
}

export function writeUiLang(lang) {
  const next = lang === UI_LANG.EN ? UI_LANG.EN : UI_LANG.PL
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  return next
}

/** UFA w etykietach sezonu → Liga / League (tylko wyświetlanie). */
export function displaySeasonLabel(label, lang = UI_LANG.PL) {
  if (!label) return ''
  const word = lang === UI_LANG.EN ? 'League' : 'Liga'
  return String(label).replace(/\bUFA\b/g, word)
}

function pluralPl(n, one, few, many) {
  if (n === 1) return one
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few
  return many
}

/**
 * Pozostały czas kontraktu w zaokrągleniu do miesięcy; powyżej roku jako
 * „rok/lata/lat i X miesięcy” zamiast surowych tygodni.
 */
export function formatContractRemaining(weeksRemaining, lang = UI_LANG.PL) {
  const weeks = Math.max(0, Math.round(Number(weeksRemaining) || 0))
  const totalMonths = weeks > 0 ? Math.max(1, Math.round((weeks * 12) / 52)) : 0
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12

  if (lang === UI_LANG.EN) {
    const monthsPart = (n) => (n === 1 ? '1 mo' : `${n} mo`)
    if (years <= 0) return monthsPart(totalMonths)
    const yearsPart = years === 1 ? '1 yr' : `${years} yrs`
    return months > 0 ? `${yearsPart} ${monthsPart(months)}` : yearsPart
  }

  const monthsPl = (n) => `${n} ${pluralPl(n, 'miesiąc', 'miesiące', 'miesięcy')}`
  if (years <= 0) return monthsPl(totalMonths)
  const yearsPl = years === 1 ? 'rok' : `${years} ${pluralPl(years, 'rok', 'lata', 'lat')}`
  return months > 0 ? `${yearsPl} i ${monthsPl(months)}` : yearsPl
}

export function formatUiDate(iso, lang = UI_LANG.PL) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(lang === UI_LANG.EN ? 'en-US' : 'pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

/** Wybierz labelPl/labelEn (lub namePl/nameEn / name) wg języka UI. */
export function pickLabel(obj, lang = UI_LANG.PL) {
  if (!obj || typeof obj !== 'object') return ''
  if (lang === UI_LANG.EN) {
    return (
      obj.labelEn ??
      obj.nameEn ??
      obj.labelPl ??
      obj.namePl ??
      obj.label ??
      obj.name ??
      ''
    )
  }
  return (
    obj.labelPl ??
    obj.namePl ??
    obj.labelEn ??
    obj.nameEn ??
    obj.label ??
    obj.name ??
    ''
  )
}

/** Opis PL/EN (description / descriptionEn). */
export function pickDesc(obj, lang = UI_LANG.PL) {
  if (!obj || typeof obj !== 'object') return ''
  if (lang === UI_LANG.EN) {
    return obj.descriptionEn ?? obj.blurbEn ?? obj.description ?? obj.blurb ?? ''
  }
  return obj.description ?? obj.blurb ?? obj.descriptionEn ?? obj.blurbEn ?? ''
}

/**
 * Tekst wiadomości / artykułu: title↔titleEn, body↔bodyEn, headline↔headlineEn, dek↔dekEn.
 * @param {'title'|'body'|'headline'|'dek'|string} field
 */
export function pickCopy(obj, field, lang = UI_LANG.PL) {
  if (!obj || typeof obj !== 'object') return ''
  const enKey = `${field}En`
  if (lang === UI_LANG.EN) {
    return obj[enKey] ?? obj[field] ?? ''
  }
  return obj[field] ?? obj[enKey] ?? ''
}

/** Nazwa drużyny wg języka (fikcyjne mają namePl/nameEn). */
export function resolveTeamName(team, lang = UI_LANG.PL) {
  if (!team) return ''
  if (typeof team === 'string') return team
  const picked = pickLabel(team, lang)
  return picked || team.name || team.id || ''
}

export function pickDict(dictByLang, lang = UI_LANG.PL) {
  if (!dictByLang) return {}
  return dictByLang[lang] ?? dictByLang[UI_LANG.PL] ?? {}
}
