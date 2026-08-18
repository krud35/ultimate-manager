/**
 * Kalendarz sezonu UFA: jesień (ligi), styczeń (puchar), wiosna (ligi).
 * Daty lokalne jako 'YYYY-MM-DD' — bez stref czasowych.
 */

/** @param {string} iso */
export function parseISODate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** @param {Date} date */
export function formatISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** @param {Date|string} date @param {number} days */
export function addDays(date, days) {
  const d = typeof date === 'string' ? parseISODate(date) : new Date(date.getTime())
  d.setDate(d.getDate() + days)
  return d
}

/**
 * Najbliższy dzień tygodnia on/after date (0=Sun … 6=Sat).
 * @param {Date|string} date
 * @param {number} weekday
 */
export function nextWeekday(date, weekday) {
  const d = typeof date === 'string' ? parseISODate(date) : new Date(date.getTime())
  const current = d.getDay()
  const delta = (weekday - current + 7) % 7
  return addDays(d, delta)
}

/** Mecze ligowe tylko w piątek / sobotę / niedzielę. */
export function isWeekendGameDay(date) {
  const d = typeof date === 'string' ? parseISODate(date) : date
  const day = d.getDay()
  return day === 5 || day === 6 || day === 0
}

function dateRange(start, end) {
  return {
    start: typeof start === 'string' ? start : formatISODate(start),
    end: typeof end === 'string' ? end : formatISODate(end),
  }
}

/** Rozkład 8 slotów meczu na weekend: 3 Fri / 3 Sat / 2 Sun. */
export function spreadRoundAcrossWeekend(fridayIso) {
  const fri = typeof fridayIso === 'string' ? fridayIso : formatISODate(fridayIso)
  const sat = formatISODate(addDays(fri, 1))
  const sun = formatISODate(addDays(fri, 2))
  return [
    { date: fri },
    { date: fri },
    { date: fri },
    { date: sat },
    { date: sat },
    { date: sat },
    { date: sun },
    { date: sun },
  ]
}

function listFridaysInclusive(fromDate, toDate) {
  const fridays = []
  let cursor = nextWeekday(fromDate, 5)
  const end = typeof toDate === 'string' ? parseISODate(toDate) : toDate
  while (cursor.getTime() <= end.getTime()) {
    fridays.push(new Date(cursor.getTime()))
    cursor = addDays(cursor, 7)
  }
  return fridays
}

/** Równomierny wybór `count` piątków z listy. */
function pickEvenly(items, count) {
  if (items.length === 0 || count <= 0) return []
  if (count >= items.length) return items.slice(0, count)
  if (count === 1) return [items[0]]

  const picked = []
  for (let i = 0; i < count; i += 1) {
    const idx = Math.round((i * (items.length - 1)) / (count - 1))
    picked.push(items[idx])
  }
  return picked
}

function mondayOfWeek(date) {
  const d = typeof date === 'string' ? parseISODate(date) : new Date(date.getTime())
  const day = d.getDay()
  const back = day === 0 ? 6 : day - 1
  return addDays(d, -back)
}

function sundayOfWeek(date) {
  return addDays(mondayOfWeek(date), 6)
}

/**
 * Cztery tygodnie stycznia (rok kalendarzowy po starcie sezonu):
 * 1 free, 2 puchar (PQ+Q), 3 puchar (S+F), 4 free.
 */
function buildJanuaryCupWeeks(janYear) {
  const jan1 = new Date(janYear, 0, 1)
  const week1Start = mondayOfWeek(jan1)
  // Jeśli poniedziałek wypada w grudniu, tydzień 1 i tak obejmuje 1 stycznia.
  const week1End = sundayOfWeek(week1Start)

  const week2Start = addDays(week1Start, 7)
  const week2End = addDays(week2Start, 6)
  const week3Start = addDays(week2Start, 7)
  const week3End = addDays(week3Start, 6)
  const week4Start = addDays(week3Start, 7)
  const week4End = addDays(week4Start, 6)

  const week2Friday = nextWeekday(week2Start, 5)
  const week3Friday = nextWeekday(week3Start, 5)

  return {
    freeWeek1: dateRange(week1Start, week1End),
    playWeek2: {
      ...dateRange(week2Start, week2End),
      friday: formatISODate(week2Friday),
      saturday: formatISODate(addDays(week2Friday, 1)),
      sunday: formatISODate(addDays(week2Friday, 2)),
    },
    playWeek3: {
      ...dateRange(week3Start, week3End),
      friday: formatISODate(week3Friday),
      saturday: formatISODate(addDays(week3Friday, 1)),
      sunday: formatISODate(addDays(week3Friday, 2)),
    },
    freeWeek4: dateRange(week4Start, week4End),
  }
}

/**
 * Pięć tygodni stycznia dla pucharu piramidy Ligi Europejskiej (48 drużyn, losowa
 * drabinka): 1 free, 2 puchar (runda 1 + runda 32), 3 puchar (1/8 + ćwierćfinał),
 * 4 puchar (półfinał + finał), 5 free.
 */
function buildJanuaryPyramidCupWeeks(janYear) {
  const jan1 = new Date(janYear, 0, 1)
  const week1Start = mondayOfWeek(jan1)
  const week1End = sundayOfWeek(week1Start)

  const week2Start = addDays(week1Start, 7)
  const week2End = addDays(week2Start, 6)
  const week3Start = addDays(week2Start, 7)
  const week3End = addDays(week3Start, 6)
  const week4Start = addDays(week3Start, 7)
  const week4End = addDays(week4Start, 6)
  const week5Start = addDays(week4Start, 7)
  const week5End = addDays(week5Start, 6)

  const week2Friday = nextWeekday(week2Start, 5)
  const week3Friday = nextWeekday(week3Start, 5)
  const week4Friday = nextWeekday(week4Start, 5)

  return {
    freeWeek1: dateRange(week1Start, week1End),
    playWeek2: {
      ...dateRange(week2Start, week2End),
      round1: formatISODate(week2Friday),
      roundOf32: formatISODate(addDays(week2Friday, 1)),
    },
    playWeek3: {
      ...dateRange(week3Start, week3End),
      roundOf16: formatISODate(week3Friday),
      quarterfinal: formatISODate(addDays(week3Friday, 1)),
    },
    playWeek4: {
      ...dateRange(week4Start, week4End),
      semifinal: formatISODate(week4Friday),
      final: formatISODate(addDays(week4Friday, 2)),
    },
    freeWeek5: dateRange(week5Start, week5End),
  }
}

/**
 * @param {{ seasonYear: number, teamIds?: string[] }} options
 */
export function buildSeasonCalendar({ seasonYear, teamIds = [] }) {
  const gamesPerRound = Math.max(1, Math.floor(teamIds.length / 2) || 8)
  const fallRoundCount = 15
  const springRoundCount = 15
  const janYear = seasonYear + 1

  const aug1 = new Date(seasonYear, 7, 1)
  const startDate = formatISODate(aug1)
  const firstFriday = nextWeekday(aug1, 5)

  // Jesień: Aug → ~20 grudnia (przed świętami).
  const fallWindowEnd = new Date(seasonYear, 11, 20)
  const fallFridays = pickEvenly(listFridaysInclusive(firstFriday, fallWindowEnd), fallRoundCount)

  // Wiosna: od pierwszego piątku lutego do ~końca czerwca.
  const feb1 = new Date(janYear, 1, 1)
  const springFirstFriday = nextWeekday(feb1, 5)
  const springWindowEnd = new Date(janYear, 5, 30)
  const springFridays = pickEvenly(
    listFridaysInclusive(springFirstFriday, springWindowEnd),
    springRoundCount,
  )

  const cup = buildJanuaryCupWeeks(janYear)
  const pyramidCup = buildJanuaryPyramidCupWeeks(janYear)

  const fallRounds = fallFridays.map((_, i) => i + 1)
  const springRounds = springFridays.map((_, i) => fallRoundCount + i + 1)

  /** @type {Record<number, { date: string }[]>} */
  const roundDates = {}

  for (let i = 0; i < fallFridays.length; i += 1) {
    const round = i + 1
    const slots = spreadRoundAcrossWeekend(fallFridays[i])
    roundDates[round] = slots.slice(0, gamesPerRound)
  }

  for (let i = 0; i < springFridays.length; i += 1) {
    const round = fallRoundCount + i + 1
    const slots = spreadRoundAcrossWeekend(springFridays[i])
    roundDates[round] = slots.slice(0, gamesPerRound)
  }

  const lastSpring = springFridays[springFridays.length - 1]
  const endDate = lastSpring
    ? formatISODate(addDays(lastSpring, 2))
    : formatISODate(springWindowEnd)

  // Oficjalny koniec sezonu kariery: 31 lipca roku po starcie (po oknie transferowym lipca).
  const officialEndDate = formatISODate(new Date(janYear, 6, 31))

  return {
    seasonYear,
    seasonLabel: `UFA ${seasonYear}/${String(seasonYear + 1).slice(-2)}`,
    startDate,
    endDate,
    officialEndDate,
    fallRounds,
    springRounds,
    cup,
    pyramidCup,
    roundDates,
  }
}

/** 31 lipca roku kończącego sezon (seasonYear → year+1). */
export function officialSeasonEndDate(calendarOrYear) {
  if (calendarOrYear && typeof calendarOrYear === 'object') {
    if (calendarOrYear.officialEndDate) return calendarOrYear.officialEndDate
    const y = calendarOrYear.seasonYear
    if (y != null) return formatISODate(new Date(y + 1, 6, 31))
  }
  const y = Number(calendarOrYear)
  if (Number.isFinite(y)) return formatISODate(new Date(y + 1, 6, 31))
  return null
}

/**
 * Przypisuje daty ISO do fixture'ów ligowych według kolejki (kolejność w rundzie = slot).
 * Mutuje i zwraca tablicę fixtures.
 */
export function assignDatesToLeagueFixtures(fixtures, calendar) {
  const byRound = new Map()
  for (const fixture of fixtures) {
    if (fixture.competition && fixture.competition !== 'league') continue
    if (!byRound.has(fixture.round)) byRound.set(fixture.round, [])
    byRound.get(fixture.round).push(fixture)
  }

  for (const [round, roundFixtures] of byRound) {
    const slots = calendar.roundDates?.[round] ?? []
    for (let i = 0; i < roundFixtures.length; i += 1) {
      const slot = slots[i] ?? slots[slots.length - 1]
      if (slot?.date) {
        roundFixtures[i].date = slot.date
      }
    }
  }

  return fixtures
}

/** Data piątku weekendowej kolejki (pierwszy slot). */
export function fridayForRound(calendar, round) {
  const slots = calendar.roundDates?.[round]
  return slots?.[0]?.date ?? null
}
