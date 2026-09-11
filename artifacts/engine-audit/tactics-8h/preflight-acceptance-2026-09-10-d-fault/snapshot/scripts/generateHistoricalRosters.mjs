/**
 * Generuje src/data/historical/season-{year}.json dla lat 2013–2025.
 * Źródło: UFA Almanac (ufaalmanac.com) — dane UFA Stats / watchufa.com.
 *
 * Uruchom: node scripts/generateHistoricalRosters.mjs
 * Opcjonalnie: node scripts/generateHistoricalRosters.mjs 2015 2020
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/historical')

/** Skrót z Almanac / standings → slug strony drużyny. */
const ABBR_TO_SLUG = {
  ATL: 'atlanta-hustle',
  ATX: 'austin-sol',
  AUS: 'austin-sol',
  BOS: 'boston-glory',
  CAR: 'carolina-flyers',
  CHA: 'charlotte-express',
  CHI: 'chicago-union',
  CIN: 'cincinnati-revolution',
  CLB: 'columbus-cranes',
  COL: 'colorado-apex',
  CON: 'connecticut-constitution',
  DAL: 'dallas-legion',
  DC: 'dc-breeze',
  DET: 'detroit-mechanix',
  HTX: 'houston-havoc',
  IND: 'indianapolis-alleycats',
  LA: 'la-aviators',
  LV: 'vegas-bighorns',
  MAD: 'madison-radicals',
  MIN: 'minnesota-wind-chill',
  MTL: 'montreal-royal',
  NJ: 'new-jersey-hammerheads',
  NSH: 'nashville-nightwatch',
  NY: 'new-york-empire',
  OAK: 'oakland-spiders',
  ORE: 'oregon-steel',
  OTT: 'ottawa-outlaws',
  PHI: 'philadelphia-phoenix',
  PIT: 'pittsburgh-thunderbirds',
  RI: 'rhode-island-rampage',
  ROC: 'rochester-dragons',
  SD: 'san-diego-growlers',
  SEA: 'seattle-cascades',
  SF: 'san-francisco-flamethrowers',
  SJ: 'san-jose-spiders',
  SLC: 'salt-lake-shred',
  SLL: 'salt-lake-lions',
  TB: 'tampa-bay-cannons',
  TOR: 'toronto-rush',
  VAN: 'vancouver-riptide',
}

/** Preferowane id z obecnego szablonu gry (priorytet przy trim >16). */
const MODERN_TEAM_PRIORITY = [
  'seattle-cascades',
  'boston-glory',
  'austin-sol',
  'carolina-flyers',
  'chicago-union',
  'colorado-apex',
  'houston-havoc',
  'minnesota-wind-chill',
  'dc-breeze',
  'new-york-empire',
  'oakland-spiders',
  'atlanta-hustle',
  'toronto-rush',
  'montreal-royal',
  'san-diego-growlers',
  'salt-lake-shred',
]

const DEFAULT_COLORS = {
  'seattle-cascades': { primaryColor: '#0d9488', awayColor: '#f8fafc', shortName: 'SEA' },
  'boston-glory': { primaryColor: '#c8102e', awayColor: '#0f172a', shortName: 'BOS' },
  'austin-sol': { primaryColor: '#f59e0b', awayColor: '#0f172a', shortName: 'AUS' },
  'carolina-flyers': { primaryColor: '#1e40af', awayColor: '#f8fafc', shortName: 'CAR' },
  'chicago-union': { primaryColor: '#dc2626', awayColor: '#f8fafc', shortName: 'CHI' },
  'colorado-apex': { primaryColor: '#7c3aed', awayColor: '#fbbf24', shortName: 'COL' },
  'houston-havoc': { primaryColor: '#b91c1c', awayColor: '#f8fafc', shortName: 'HTX' },
  'minnesota-wind-chill': { primaryColor: '#0284c7', awayColor: '#f8fafc', shortName: 'MIN' },
  'dc-breeze': { primaryColor: '#1d4ed8', awayColor: '#f97316', shortName: 'DC' },
  'new-york-empire': { primaryColor: '#ea580c', awayColor: '#0f172a', shortName: 'NY' },
  'oakland-spiders': { primaryColor: '#ca8a04', awayColor: '#0f172a', shortName: 'OAK' },
  'atlanta-hustle': { primaryColor: '#be123c', awayColor: '#f8fafc', shortName: 'ATL' },
  'toronto-rush': { primaryColor: '#dc2626', awayColor: '#0f172a', shortName: 'TOR' },
  'montreal-royal': { primaryColor: '#1e3a8a', awayColor: '#f8fafc', shortName: 'MTL' },
  'san-diego-growlers': { primaryColor: '#15803d', awayColor: '#f8fafc', shortName: 'SD' },
  'salt-lake-shred': { primaryColor: '#0ea5e9', awayColor: '#0f172a', shortName: 'SLC' },
  'indianapolis-alleycats': { primaryColor: '#7c2d12', awayColor: '#f8fafc', shortName: 'IND' },
  'madison-radicals': { primaryColor: '#b45309', awayColor: '#0f172a', shortName: 'MAD' },
  'pittsburgh-thunderbirds': { primaryColor: '#fbbf24', awayColor: '#0f172a', shortName: 'PIT' },
  'philadelphia-phoenix': { primaryColor: '#ea580c', awayColor: '#f8fafc', shortName: 'PHI' },
  'detroit-mechanix': { primaryColor: '#64748b', awayColor: '#0f172a', shortName: 'DET' },
  'dallas-legion': { primaryColor: '#1e40af', awayColor: '#f8fafc', shortName: 'DAL' },
  'la-aviators': { primaryColor: '#0ea5e9', awayColor: '#0f172a', shortName: 'LA' },
  'ottawa-outlaws': { primaryColor: '#166534', awayColor: '#f8fafc', shortName: 'OTT' },
  'tampa-bay-cannons': { primaryColor: '#c2410c', awayColor: '#0f172a', shortName: 'TB' },
  'vancouver-riptide': { primaryColor: '#0369a1', awayColor: '#f8fafc', shortName: 'VAN' },
  'san-francisco-flamethrowers': { primaryColor: '#dc2626', awayColor: '#0f172a', shortName: 'SF' },
  'rochester-dragons': { primaryColor: '#15803d', awayColor: '#f8fafc', shortName: 'ROC' },
  'cincinnati-revolution': { primaryColor: '#b91c1c', awayColor: '#0f172a', shortName: 'CIN' },
  'nashville-nightwatch': { primaryColor: '#312e81', awayColor: '#f8fafc', shortName: 'NSH' },
  'charlotte-express': { primaryColor: '#075985', awayColor: '#f8fafc', shortName: 'CHA' },
  'oregon-steel': { primaryColor: '#334155', awayColor: '#f8fafc', shortName: 'ORE' },
  'vegas-bighorns': { primaryColor: '#a16207', awayColor: '#0f172a', shortName: 'LV' },
  'salt-lake-lions': { primaryColor: '#ca8a04', awayColor: '#0f172a', shortName: 'SLL' },
  'new-jersey-hammerheads': { primaryColor: '#1e3a8a', awayColor: '#f8fafc', shortName: 'NJ' },
}

function parseNum(s) {
  return Number.parseInt(String(s).replace(/,/g, ''), 10) || 0
}

function parseJersey(raw) {
  if (raw === '—' || raw === '-' || raw === '' || raw == null) return 0
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

function parseName(linkInner) {
  const noComments = String(linkInner).replace(/<!--[\s\S]*?-->/g, ' ')
  const cleaned = noComments.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = cleaned.split(' ').filter(Boolean)
  if (parts.length < 2) return { firstName: cleaned || 'Unknown', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'UltimateManagerUFA/1.0 (historical roster import; local game data)',
      Accept: 'text/html',
    },
  })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.text()
}

/**
 * Parsuje standings z /seasons/{year} — wiersze typu:
 * `| 1 | TORToronto Rushsemis | 14 | 2 | ...`
 * albo HTML z abbr + name.
 */
function parseSeasonTeams(html, year) {
  const teams = []
  const seen = new Set()

  // Markdown-ish table rows from WebFetch-style or raw HTML
  const rowRe =
    /\|?\s*\d+\s*\|\s*([A-Z]{2,3})([A-Za-z][A-Za-z .'-]*?)(?:semis|playoffs|finals|champ|runner-up)?\s*\|\s*(\d+)\s*\|\s*(\d+)/g
  let m
  while ((m = rowRe.exec(html)) !== null) {
    const abbr = m[1]
    let name = m[2].trim()
    // Strip trailing status words glued to name
    name = name.replace(/(semis|playoffs|finals|champ|runner-up)$/i, '').trim()
    const slug = ABBR_TO_SLUG[abbr]
    if (!slug) {
      console.warn(`  ! nieznany skrót ${abbr} (${name}) w ${year}`)
      continue
    }
    if (seen.has(slug)) continue
    seen.add(slug)
    const wins = parseNum(m[3])
    const losses = parseNum(m[4])
    teams.push({
      id: slug,
      abbr,
      name: name.includes(' ') ? name : guessFullName(abbr, name),
      wins,
      losses,
    })
  }

  // HTML standings: look for team links /teams/slug/year
  const linkRe = new RegExp(`/teams/([a-z0-9-]+)/${year}`, 'g')
  while ((m = linkRe.exec(html)) !== null) {
    const slug = m[1]
    if (seen.has(slug)) continue
    seen.add(slug)
    teams.push({
      id: slug,
      abbr: Object.entries(ABBR_TO_SLUG).find(([, s]) => s === slug)?.[0] ?? slug.slice(0, 3).toUpperCase(),
      name: titleFromSlug(slug),
      wins: 0,
      losses: 0,
    })
  }

  return teams
}

function titleFromSlug(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function guessFullName(abbr, partial) {
  const slug = ABBR_TO_SLUG[abbr]
  return slug ? titleFromSlug(slug) : partial
}

function parseRosterHtml(html) {
  const rosterIdx = html.indexOf('>roster (')
  if (rosterIdx === -1) {
    // try markdown table fallback
    return parseRosterMarkdown(html)
  }
  const slice = html.slice(rosterIdx)
  const tbodyMatch = slice.match(/<tbody>([\s\S]*?)<\/tbody>/i)
  if (!tbodyMatch) return parseRosterMarkdown(html)

  const rows = []
  const rowRe =
    /<tr><td[^>]*>([^<]*)<\/td><td><a[^>]*>([\s\S]*?)<\/a><\/td><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td><td class="num">[^<]*<\/td><td class="num">[^<]*<\/td><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td><\/tr>/g

  let m
  while ((m = rowRe.exec(tbodyMatch[1])) !== null) {
    const { firstName, lastName } = parseName(m[2])
    rows.push({
      jersey: parseJersey(m[1].trim()),
      firstName,
      lastName,
      gls: parseNum(m[3]),
      ast: parseNum(m[4]),
      blk: parseNum(m[5]),
      ha: parseNum(m[6]),
      throwingYards: parseNum(m[7]),
      receivingYards: parseNum(m[8]),
    })
  }
  return rows
}

function parseRosterMarkdown(html) {
  const rows = []
  const re =
    /\|\s*([^|\n]+)\s*\|\s*([^|\n]+)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|/g
  let m
  while ((m = re.exec(html)) !== null) {
    const jerseyRaw = m[1].trim()
    if (jerseyRaw === '#' || jerseyRaw.toLowerCase() === 'player') continue
    const { firstName, lastName } = parseName(m[2])
    if (!firstName || firstName.toLowerCase() === 'player') continue
    rows.push({
      jersey: parseJersey(jerseyRaw),
      firstName,
      lastName,
      gls: parseNum(m[3]),
      ast: parseNum(m[4]),
      blk: parseNum(m[5]),
      ha: parseNum(m[6]),
      throwingYards: parseNum(m[9]),
      receivingYards: parseNum(m[10]),
    })
  }
  return rows
}

function teamMeta(slug, name, abbr) {
  const colors = DEFAULT_COLORS[slug] ?? {
    primaryColor: '#475569',
    awayColor: '#f8fafc',
    shortName: abbr || slug.slice(0, 3).toUpperCase(),
  }
  return {
    id: slug,
    name,
    shortName: colors.shortName,
    primaryColor: colors.primaryColor,
    awayColor: colors.awayColor,
  }
}

async function fetchSeason(year) {
  console.log(`\n=== Sezon ${year} ===`)
  const seasonHtml = await fetchText(`https://www.ufaalmanac.com/seasons/${year}`)
  let teams = parseSeasonTeams(seasonHtml, year)

  // 2020 (COVID): brak standings — przejmij listę drużyn z poprzedniego sezonu
  if (!teams.length) {
    const prevPath = path.join(OUT_DIR, `season-${year - 1}.json`)
    if (fs.existsSync(prevPath)) {
      console.warn(`  brak standings ${year} — używam listy drużyn z ${year - 1}`)
      const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'))
      teams = (prev.teams ?? []).map((t) => ({
        id: t.id,
        abbr: t.shortName,
        name: t.name,
        wins: 0,
        losses: 0,
      }))
    }
  }

  if (!teams.length) {
    throw new Error(`Brak drużyn w standings ${year}`)
  }
  console.log(`  znaleziono ${teams.length} drużyn`)

  const outTeams = []
  for (const t of teams) {
    const url = `https://www.ufaalmanac.com/teams/${t.id}/${year}`
    process.stdout.write(`  ${t.name}… `)
    try {
      await sleep(200)
      let html
      let players
      try {
        html = await fetchText(url)
        players = parseRosterHtml(html)
      } catch {
        // fallback: roster z poprzedniego roku (np. 2020)
        const prevUrl = `https://www.ufaalmanac.com/teams/${t.id}/${year - 1}`
        console.log(`(fallback ${year - 1}) `)
        process.stdout.write('')
        html = await fetchText(prevUrl)
        players = parseRosterHtml(html)
      }
      if (!players.length) {
        console.log('BRAK ROSTERU')
        continue
      }
      console.log(`${players.length} zawodników`)
      const meta = teamMeta(t.id, t.name || titleFromSlug(t.id), t.abbr)
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/^#\s+(.+)$/m)
      if (titleMatch) {
        const title = titleMatch[1].replace(/\s+\d{4}.*$/, '').trim()
        if (title.length > 3) meta.name = title
      }
      meta.name = improveTeamName(meta.name, t.id)
      outTeams.push({
        ...meta,
        wins: t.wins,
        losses: t.losses,
        players,
      })
    } catch (err) {
      console.log(`BŁĄD: ${err.message}`)
    }
  }

  if (!outTeams.length) throw new Error(`Sezon ${year}: zero składów`)

  return {
    year,
    source: `https://www.ufaalmanac.com/seasons/${year}`,
    generatedAt: new Date().toISOString(),
    realTeamCount: outTeams.length,
    note:
      year === 2020
        ? 'Sezon 2020 odwołany (COVID) — składy na bazie 2019 / dostępnych stron Almanac.'
        : undefined,
    teams: outTeams,
  }
}

function improveTeamName(name, slug) {
  const known = {
    'dc-breeze': 'DC Breeze',
    'la-aviators': 'Los Angeles Aviators',
    'new-york-empire': 'New York Empire',
    'san-francisco-flamethrowers': 'San Francisco FlameThrowers',
    'indianapolis-alleycats': 'Indianapolis AlleyCats',
    'salt-lake-lions': 'Salt Lake Lions',
    'salt-lake-shred': 'Salt Lake Shred',
  }
  if (known[slug]) return known[slug]
  return name
    .split(' ')
    .map((w) => {
      if (w === 'Dc' || w === 'DC') return w === 'Dc' ? 'DC' : w
      if (w === 'La') return 'Los Angeles'
      if (w === 'Ny') return 'NY'
      if (w.toLowerCase() === 'alleycats') return 'AlleyCats'
      if (w.toLowerCase() === 'flamethrowers') return 'FlameThrowers'
      if (w.toLowerCase() === 'aviators' && name.toLowerCase().includes('la ')) return 'Aviators'
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

async function main() {
  const args = process.argv.slice(2).map(Number).filter((n) => n >= 2012 && n <= 2026)
  const years =
    args.length >= 2
      ? Array.from({ length: args[1] - args[0] + 1 }, (_, i) => args[0] + i)
      : args.length === 1
        ? [args[0]]
        : Array.from({ length: 2025 - 2013 + 1 }, (_, i) => 2013 + i)

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const index = {
    years: [],
    source: 'ufaalmanac.com (UFA Stats / watchufa)',
    generatedAt: new Date().toISOString(),
  }

  for (const year of years) {
    const data = await fetchSeason(year)
    const file = path.join(OUT_DIR, `season-${year}.json`)
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    index.years.push({
      year,
      realTeamCount: data.realTeamCount,
      file: `season-${year}.json`,
    })
    console.log(`  zapisano ${file}`)
  }

  // Merge with existing index years if partial run
  const indexPath = path.join(OUT_DIR, 'index.json')
  if (fs.existsSync(indexPath) && args.length > 0) {
    try {
      const prev = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
      const byYear = new Map((prev.years ?? []).map((y) => [y.year, y]))
      for (const y of index.years) byYear.set(y.year, y)
      index.years = [...byYear.values()].sort((a, b) => a.year - b.year)
    } catch {
      /* ignore */
    }
  }

  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  console.log(`\nIndeks: ${indexPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
