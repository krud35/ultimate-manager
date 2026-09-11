/**
 * Generuje src/data/ufa2025LeagueRosters.raw.js z danych sezonu 2025.
 * Źródło: UFA Stats (watchufa.com/stats/player-stats?year=2025, ufastats.com)
 * przez publiczne strony zespołów UFA Almanac (ufaalmanac.com).
 *
 * Uruchom: node scripts/generateLeagueRosters.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../src/data/ufa2025LeagueRosters.raw.js')

const TEAMS = [
  { exportName: 'AUSTIN_RAW', slug: 'austin-sol', teamName: 'Austin Sol' },
  { exportName: 'CAROLINA_RAW', slug: 'carolina-flyers', teamName: 'Carolina Flyers' },
  { exportName: 'CHICAGO_RAW', slug: 'chicago-union', teamName: 'Chicago Union' },
  { exportName: 'COLORADO_RAW', slug: 'colorado-apex', teamName: 'Colorado Apex' },
  { exportName: 'HOUSTON_RAW', slug: 'houston-havoc', teamName: 'Houston Havoc' },
  { exportName: 'MINNESOTA_RAW', slug: 'minnesota-wind-chill', teamName: 'Minnesota Wind Chill' },
  { exportName: 'DC_BREEZE_RAW', slug: 'dc-breeze', teamName: 'DC Breeze' },
  { exportName: 'NEW_YORK_EMPIRE_RAW', slug: 'new-york-empire', teamName: 'New York Empire' },
  { exportName: 'OAKLAND_SPIDERS_RAW', slug: 'oakland-spiders', teamName: 'Oakland Spiders' },
  { exportName: 'ATLANTA_HUSTLE_RAW', slug: 'atlanta-hustle', teamName: 'Atlanta Hustle' },
  { exportName: 'TORONTO_RUSH_RAW', slug: 'toronto-rush', teamName: 'Toronto Rush' },
  { exportName: 'MONTREAL_ROYAL_RAW', slug: 'montreal-royal', teamName: 'Montreal Royal' },
  { exportName: 'SAN_DIEGO_GROWLERS_RAW', slug: 'san-diego-growlers', teamName: 'San Diego Growlers' },
  { exportName: 'SALT_LAKE_SHRED_RAW', slug: 'salt-lake-shred', teamName: 'Salt Lake Shred' },
]

function parseNum(s) {
  return Number.parseInt(String(s).replace(/,/g, ''), 10) || 0
}

function parseJersey(raw) {
  if (raw === '—' || raw === '-' || raw === '') return 0
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

function parseName(linkInner) {
  const noComments = linkInner.replace(/<!--[\s\S]*?-->/g, ' ')
  const cleaned = noComments.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = cleaned.split(' ').filter(Boolean)
  if (parts.length < 2) return { firstName: cleaned, lastName: '' }
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')
  return { firstName, lastName }
}

function parseRosterHtml(html) {
  const rosterIdx = html.indexOf('>roster (')
  if (rosterIdx === -1) throw new Error('Nie znaleziono sekcji roster')
  const slice = html.slice(rosterIdx)
  const tbodyMatch = slice.match(/<tbody>([\s\S]*?)<\/tbody>/i)
  if (!tbodyMatch) throw new Error('Nie znaleziono tabeli roster')

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

  if (!rows.length) throw new Error('Brak wierszy w rosterze')
  return rows
}

function rowToJs(row) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `  { jersey: ${row.jersey}, firstName: '${esc(row.firstName)}', lastName: '${esc(row.lastName)}', gls: ${row.gls}, ast: ${row.ast}, blk: ${row.blk}, ha: ${row.ha}, throwingYards: ${row.throwingYards}, receivingYards: ${row.receivingYards} },`
}

async function main() {
  const blocks = [
    `/**`,
    ` * Surowe statystyki sezonu regularnego UFA 2025 — drużyny ligowe.`,
    ` * Źródło: https://watchufa.com/stats/player-stats?year=2025 (UFA Stats / ufastats.com).`,
    ` * Wygenerowano: node scripts/generateLeagueRosters.mjs`,
    ` */`,
    ``,
  ]

  for (const team of TEAMS) {
    const url = `https://www.ufaalmanac.com/teams/${team.slug}/2025`
    console.log(`Pobieram ${team.teamName}…`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} → ${res.status}`)
    const html = await res.text()
    const rows = parseRosterHtml(html)
    console.log(`  → ${rows.length} zawodników`)

    blocks.push(`export const ${team.exportName} = [`)
    for (const row of rows) blocks.push(rowToJs(row))
    blocks.push(`]`)
    blocks.push(``)
  }

  fs.writeFileSync(OUT, `${blocks.join('\n')}\n`, 'utf8')
  console.log(`Zapisano ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
