/** Import verified throw-level observations, never fill unknown weather or denominators. */
import fs from 'node:fs'
const input = process.argv[2]
if (!input) throw new Error('Podaj plik JSON: { sourceUrl, competition, division, season, observations: [{ matchId, windMph, distanceM, completed }] }.')
const data = JSON.parse(fs.readFileSync(input, 'utf8'))
if (!/^https:\/\//.test(data.sourceUrl ?? '') || !data.competition || !data.division || !Number.isInteger(data.season)) throw new Error('Brak pochodzenia, dywizji lub sezonu danych.')
if (!Array.isArray(data.observations) || !data.observations.length) throw new Error('Brak obserwacji.')
const segments = {}
for (const row of data.observations) {
  if (!row.matchId || typeof row.completed !== 'boolean' || !Number.isFinite(row.distanceM) || row.distanceM < 0) throw new Error('Niepełna obserwacja podania.')
  if (row.windMph != null && (!Number.isFinite(row.windMph) || row.windMph < 0)) throw new Error('Niepoprawny wiatr.')
  const key = `${row.windMph == null ? 'unknown-wind' : row.windMph < 7 ? '0-7mph' : row.windMph < 15 ? '7-15mph' : '15+mph'}|${row.distanceM < 10 ? 'short' : row.distanceM < 25 ? 'mid' : 'long'}`
  const segment = segments[key] ??= { attempts: 0, completions: 0 }
  segment.attempts++; segment.completions += Number(row.completed)
}
console.log(JSON.stringify({ sourceUrl: data.sourceUrl, competition: data.competition, division: data.division,
  season: data.season, segments, note: 'Nie mieszać dywizji, poziomów i nieznanego wiatru. To dane obserwacyjne, nie automatyczna konfiguracja silnika.' }, null, 2))
