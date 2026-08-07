/**
 * Fikcyjne drużyny i zawodnicy — uzupełnienie ligi do 16 slotów.
 */

/** Stała pula (max uzupełnienie w historycznych sezonach ≈ 4). */
const FICTIONAL_FRANCHISES = [
  {
    id: 'fic-krysiaki-stacha',
    namePl: 'Krysiaki Stacha',
    nameEn: "Stanislaus' Krysiaks",
    shortName: 'KRS',
    primaryColor: '#7c3aed',
    awayColor: '#f8fafc',
  },
  {
    id: 'fic-bob',
    namePl: 'BOB',
    nameEn: 'BOB',
    shortName: 'BOB',
    primaryColor: '#0f766e',
    awayColor: '#fbbf24',
  },
  {
    id: 'fic-koziolki-matolki',
    namePl: 'Koziołki Matołki',
    nameEn: 'Silly-billy Goats',
    shortName: 'KZM',
    primaryColor: '#c2410c',
    awayColor: '#0f172a',
  },
  {
    id: 'fic-sky-this',
    namePl: 'Sky This Warszawa',
    nameEn: 'Sky This Warsaw',
    shortName: 'STW',
    primaryColor: '#1e3a8a',
    awayColor: '#f8fafc',
  },
]

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Avery', 'Cameron', 'Drew', 'Jamie',
  'Taylor', 'Reese', 'Parker', 'Skyler', 'Blake', 'Hayden', 'Logan', 'Noah', 'Ethan', 'Owen',
  'Leo', 'Miles', 'Kai', 'Felix', 'Theo', 'Marcus', 'Julian', 'Adrian', 'Silas', 'Nico',
]

const LAST_NAMES = [
  'Brooks', 'Hayes', 'Reed', 'Cole', 'Bennett', 'Foster', 'Griffin', 'Harper', 'Lane', 'West',
  'North', 'Stone', 'Rivera', 'Keller', 'Vaughn', 'Pratt', 'Nash', 'Crowe', 'Bishop', 'Vance',
  'Monroe', 'Adler', 'Quincy', 'Sato', 'Nguyen', 'Patel', 'Okoye', 'Berg', 'Diaz', 'Shaw',
]

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

/**
 * Generuje surowy wiersz zawodnika (jak UFA raw) z lekkim „profilem” statystyk.
 */
function inventRawPlayer(rng, index) {
  const tier = rng()
  const star = tier > 0.92
  const good = !star && tier > 0.78
  const scale = star ? 1.35 + rng() * 0.4 : good ? 0.85 + rng() * 0.35 : 0.25 + rng() * 0.55
  const handlerBias = rng() > 0.55
  const gls = Math.round((handlerBias ? 4 : 12) * scale + rng() * 6)
  const ast = Math.round((handlerBias ? 14 : 5) * scale + rng() * 5)
  const blk = Math.round((3 + rng() * 8) * (star ? 1.2 : 0.8))
  const ha = Math.round((handlerBias ? 12 : 4) * scale)
  const throwingYards = Math.round((handlerBias ? 1400 : 400) * scale + rng() * 200)
  const receivingYards = Math.round((handlerBias ? 500 : 1200) * scale + rng() * 200)
  return {
    jersey: index + 1,
    firstName: pick(rng, FIRST_NAMES),
    lastName: pick(rng, LAST_NAMES),
    gls,
    ast,
    blk,
    ha,
    throwingYards,
    receivingYards,
  }
}

/**
 * @param {number} count
 * @param {string} seedKey
 * @param {Set<string>} [usedIds]
 */
export function createFictionalTeams(count, seedKey, usedIds = new Set()) {
  if (count <= 0) return []
  const rng = mulberry32(hashSeed(`fic-teams:${seedKey}`))
  const pool = [...FICTIONAL_FRANCHISES].filter((f) => !usedIds.has(f.id))
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const picked = pool.slice(0, count)
  while (picked.length < count) {
    const n = picked.length + 1
    picked.push({
      id: `fic-extra-${seedKey}-${n}`,
      namePl: `Ekspansja ${n}`,
      nameEn: `Expansion ${n}`,
      shortName: `E${n}`,
      primaryColor: '#64748b',
      awayColor: '#f8fafc',
    })
  }

  return picked.map((franchise) => {
    const teamRng = mulberry32(hashSeed(`${seedKey}:${franchise.id}`))
    const rosterSize = 22 + Math.floor(teamRng() * 8)
    const players = []
    for (let i = 0; i < rosterSize; i += 1) {
      players.push(inventRawPlayer(teamRng, i))
    }
    const namePl = franchise.namePl ?? franchise.name
    const nameEn = franchise.nameEn ?? franchise.namePl ?? franchise.name
    return {
      id: franchise.id,
      name: namePl,
      namePl,
      nameEn,
      shortName: franchise.shortName,
      primaryColor: franchise.primaryColor,
      awayColor: franchise.awayColor,
      isFictional: true,
      wins: 0,
      losses: 0,
      players,
    }
  })
}

export { FICTIONAL_FRANCHISES }
