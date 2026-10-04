/** Supplemental Polish tables; reads aggregates only, never reruns matches.
 * node artifacts/tactics-balance-2026-10-03/render-final-tables.mjs COMPARISON_JSON [OUTPUT_MD] [QUEUE_JSON]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const finite = n => typeof n === 'number' && Number.isFinite(n)
const stable = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
const fields = ['cohort', 'factor', 'level', 'context', 'weather', 'wind', 'attack', 'defense', 'family', 'split',
  'homeConfig', 'awayConfig', 'rotate', 'lockWind', 'observe']
const context = job => Object.fromEntries(fields.map(k => [k, job[k] ?? null]))
const tidy = s => String(s ?? '—').replaceAll('|', '/').replaceAll('\n', ' ')
const number = n => finite(n) ? n.toLocaleString('pl-PL', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—'
const styles = ['vertical_stack', 'horizontal_stack', 'split_stack', 'side_stack', 'motion_offense', 'hex_offense', 'zone_offense']
const defenses = ['person', 'all_person', 'zone_cup', 'zone_wall', 'clam']
const names = { vertical_stack: 'Vertical', horizontal_stack: 'Horizontal', split_stack: 'Split', side_stack: 'Side',
  motion_offense: 'Motion', hex_offense: 'HEX', zone_offense: 'Zone O', person: 'Person', all_person: 'All person',
  zone_cup: 'Cup', zone_wall: 'Wall', clam: 'Clam', tempo: 'Tempo', risk: 'Ryzyko', direction: 'Kierunek', pressure: 'Presja' }
const label = s => names[s] ?? tidy(s)
const metric = (cell, side, name) => cell?.[side]?.metrics?.[name]
const n = m => finite(m?.before?.mean) && finite(m?.after?.mean) ? m.delta?.distinctSeeds ?? 0 : 0
const pair = (m, planned) => `${number(m?.before?.mean)} → ${number(m?.after?.mean)} [${n(m)}/${planned}]`
const table = (head, rows) => ['| ' + head.join(' | ') + ' |', '| ' + head.map(() => '---').join(' | ') + ' |',
  ...rows.map(row => '| ' + row.map(tidy).join(' | ') + ' |')]

export function renderFinalTables(report, queue) {
  if (report.schema !== 1 || !Array.isArray(report.cells)) throw new Error('Unsupported comparison schema')
  const groups = Array.isArray(queue) ? queue : queue?.groups ?? queue?.queue ?? []
  const planned = new Map()
  for (const job of groups.flatMap(g => g.jobs ?? [])) {
    const key = stable(context(job)), entry = planned.get(key) ?? { context: context(job), jobs: [] }
    entry.jobs.push(job); planned.set(key, entry)
  }
  const observed = new Map(report.cells.map(c => [stable(c.context), c]))
  const effects = new Map()
  for (const c of report.treatmentEffects?.cells ?? []) {
    const key = stable(c.context)
    if (effects.has(key)) throw new Error('Ambiguous treatment baseline for ' + key)
    effects.set(key, c)
  }
  if (report.weatherEffects && report.weatherEffects.scope !== 'matrix') throw new Error('Unsupported weather effect scope')
  const weatherEffects = new Map()
  for (const c of report.weatherEffects?.cells ?? []) {
    if (c.baselineWeather !== 'calm') throw new Error('Weather table requires an explicit calm reference')
    const key = stable(c.context)
    if (weatherEffects.has(key)) throw new Error('Ambiguous paired weather context')
    weatherEffects.set(key, c)
  }
  const entries = [...planned].map(([key, p]) => ({ ...p,
    count: new Set(p.jobs.map(j => j.seed).filter(s => s != null)).size,
    value: observed.get(key), effect: effects.get(key) }))
  const getOne = predicate => {
    const matches = entries.filter(e => predicate(e.context))
    if (matches.length > 1) throw new Error('Ambiguous context; narrow the table instead of pooling contexts')
    return matches[0]
  }
  const treatment = e => !e.jobs.some(j => j.baseline === true || j.isBaseline === true
    || stable(j.level) === stable(j.baselineLevel ?? 'neutral'))
  const effectPair = (e, side, key) => pair(metric(e.effect, side, key), e.count)
  const weather = c => `${tidy(c.weather)} (${number(c.wind?.speedMph)} mph, ${number(c.wind?.directionDeg)}°)`
  const range = m => {
    if (n(m) < 3) return '— (n<3)'
    const ci = m?.delta?.ci95
    return Array.isArray(ci) && ci.length === 2 && ci.every(finite) ? ci.map(number).join(' … ') : '— (brak zakresu)'
  }
  const lines = ['# Tabele uzupełniające: pełne mecze przed / po', '',
    `Źródło agregatów: ${tidy(report.root)}; comparison wygenerowano ${tidy(report.generatedAt)}.`,
    `Wspólna próba: ${report.matchedPairs ?? 0} pełnych par, ${report.matchedGamesPerVersion ?? 0} meczów na wersję; plan ${report.plannedGamesPerVersion ?? '—'} meczów na wersję.`, '',
    'Zapis `przed → po [n/plan]`: n to liczba różnych seedów z metryką w pełnych parach obu wersji, plan to liczba seedów dla danego kontekstu. Każdy seed obejmuje zamianę stron. Brak wartości oznacza brak sparowanego pomiaru; [0/0] oznacza kontekst nieobecny w przekazanej kolejce.',
    'Wyniki są opisowe. Przy n<3 pominięto przedziały; n=3 nadal nie wystarcza do mocnych wniosków o balansie. Nie wyliczono zbiorczych CI ani testów istotności. A/B oznaczają tożsamości drużyn, nie gospodarzy/gości.', '',
    '## Macierz bez wiatru', '', 'Konwersja ataku A przeciw obronie B: punkty / posiadania, %. Każda komórka ma własne n.', '',
    ...table(['Atak A / obrona B', ...defenses.map(label)], styles.map(attack => [label(attack), ...defenses.map(defense => {
      const e = getOne(c => c.cohort === 'matrix' && c.attack === attack && c.defense === defense && c.weather === 'calm')
      return pair(metric(e?.value, 'a', 'conversionPct'), e?.count ?? 0)
    })])), '', '## Wyniki przy ustalonym wietrze: zmiana wersji silnika', '',
    'Konwersja A, %. Obie wersje grają przy tym samym wietrze. Δ wersji to po−przed w pp; nie jest efektem wiatru względem ciszy. Ostatnia kolumna zawiera zapisany eksploracyjny przedział bootstrapu dla zmiany wersji, nie zakres min–max wyników ani dowód istotności.', '',
  ]
  const windy = entries.filter(e => e.context.cohort === 'matrix' && e.context.weather !== 'calm')
  lines.push(...table(['Atak / obrona', 'Wiatr', 'Konwersja A przed → po [n/plan]', 'Δ wersji, pp', 'Bootstrap Δ wersji, pp (opisowo)'], windy.map(e => {
    const m = metric(e.value, 'a', 'conversionPct')
    return [`${label(e.context.attack)} / ${label(e.context.defense)}`, weather(e.context), pair(m, e.count), number(m?.delta?.mean), range(m)]
  })), '', `Zaplanowane konteksty wiatru w przekazanej kolejce: ${windy.length}.`, '',
  '## Efekt wiatru względem ciszy: sparowane porównanie', '',
  'Każda wartość jest różnicą wiatr−cisza obliczoną najpierw wewnątrz tego samego seeda, pary rosterów i taktyki, osobno w każdej wersji. Wymaga pełnych home/away przy obu pogodach w obu wersjach. Strzałka oznacza efekt wiatru przed → efekt wiatru po, w pp. Renderer nie odejmuje średnich z niezależnych lub niedopasowanych komórek.', '',
  ...table(['Atak / obrona', 'Wiatr − cisza', 'Efekt konwersji A [n/plan]', 'Efekt completion A [n/plan]',
    'Efekt huck A [n/plan]', 'Zmiana efektu konwersji, pp', 'Bootstrap zmiany efektu, pp (opisowo)'], windy.map(e => {
    const paired = weatherEffects.get(stable(e.context))
    const conversion = metric(paired, 'a', 'conversionPct')
    return [`${label(e.context.attack)} / ${label(e.context.defense)}`, weather(e.context) + ' − calm',
      pair(conversion, e.count), pair(metric(paired, 'a', 'completionPct'), e.count),
      pair(metric(paired, 'a', 'huckPct'), e.count), number(conversion?.delta?.mean), range(conversion)]
  })), '', report.weatherEffects
    ? `Dopasowane kontrasty pogodowe: ${report.weatherEffects.matchedComparisons}/${report.weatherEffects.plannedComparisons}; niedopasowane: ${report.weatherEffects.unmatched?.length ?? '—'}. Pełny kontrast wykorzystuje 4 mecze na wersję, ale pozostaje jedną repliką seedową.`
    : 'Brak sekcji weatherEffects w tym pliku comparison; sparowane efekty pogodowe pozostają nieznane. Nie odtworzono ich z niesparowanych średnich.',
  'Przy n<3 zakresów nie podano. Także n=3 daje wyłącznie opis tej małej próby, bez wniosku o ogólnej odporności taktyki na wiatr.', '',
  '## Instrukcje rzutowe: efekt względem neutralnego', '',
  'W tej i kolejnych tabelach efektów każda liczba jest treatment−neutral wewnątrz wersji. Strzałka pokazuje zmianę tego efektu po poprawkach. Wskaźniki procentowe są wyrażone w pp, czas w ms. Brak dopasowanego neutralnego bloku pozostaje brakiem pomiaru.', '')
  const risk = entries.filter(e => e.context.cohort === 'instruction' && e.context.factor === 'safe_throws|take_risks' && treatment(e))
  lines.push(...table(['Instrukcja', 'Completion A, pp', 'Huck A, pp', 'Czas trzymania dysku A, ms', 'Konwersja A, pp'], risk.map(e => [
    e.context.level, effectPair(e, 'a', 'completionPct'), effectPair(e, 'a', 'huckPct'), effectPair(e, 'a', 'meanHoldMs'), effectPair(e, 'a', 'conversionPct'),
  ])), '', '## Poach: efekt względem neutralnego', '',
  'Poach dotyczy obrońców A; jego wynik sportowy oceniamy przez atak B. Udział poachu to czas stanu POACHING / czas obrony, nie prawdopodobieństwo pojedynczej próby.', '')
  const poach = entries.filter(e => ['instruction', 'interaction'].includes(e.context.cohort) && /poach/.test(e.context.factor ?? '') && treatment(e))
  const poachName = e => {
    const c = e.context, instructions = c.homeConfig?.instructions ?? []
    const directive = c.homeConfig?.directives?.poachResetHandler
    return `${c.factor}: ${c.level}${instructions.length ? ' (' + instructions.join(', ') + ')' : directive != null ? ' (reset=' + directive + ')' : ''}`
  }
  lines.push(...table(['Ustawienie A', 'Poach A, pp', 'Konwersja B, pp', 'Completion B, pp'], poach.map(e => [
    poachName(e), effectPair(e, 'a', 'poachPct'), effectPair(e, 'b', 'conversionPct'), effectPair(e, 'b', 'completionPct'),
  ])), '', '## Aktualny plan kariery: efekt względem neutralnego', '',
  'Badany jest streamlinedPlan; low/high oznacza wartość osi −1/+1. Presja A jest oceniana przez zachowanie obrony A i konwersję przeciwnika B.', '')
  const careerMetrics = { tempo: ['a', 'meanHoldMs', 'Czas trzymania dysku A, ms'], risk: ['a', 'huckPct', 'Huck A, pp'],
    direction: ['a', 'meanThrowDistanceM', 'Dystans rzutu A, m'], pressure: ['a', 'cushionM', 'Odstęp krycia A, m'] }
  const career = entries.filter(e => e.context.cohort === 'career' && treatment(e))
  lines.push(...table(['Oś / poziom', 'Metryka zachowania', 'Efekt przed → po [n/plan]', 'Konwersja właściwej drużyny, pp'], career.map(e => {
    const spec = careerMetrics[e.context.factor]
    if (!spec) return [e.context.factor + ' / ' + e.context.level, 'brak mapowania', '—', '—']
    const side = e.context.factor === 'pressure' ? 'b' : 'a'
    return [`${label(e.context.factor)} / ${e.context.level}`, spec[2], effectPair(e, spec[0], spec[1]),
      `${side.toUpperCase()}: ${effectPair(e, side, 'conversionPct')}`]
  })), '', '## Role: tylko pomiar ruchu', '',
  'Poniżej porównanie wersji przy tym samym ustawieniu roli, bez odejmowania neutralnego. Agregat obejmuje wszystkich zawodników grających wskazaną rolę, nie wyłącznie zmieniany slot. Nie opisuje udziału w kontaktach z dyskiem, jakości odbiorów ani przyczynowego efektu zamiany roli.', '')
  const roles = entries.filter(e => e.context.cohort === 'roles')
  lines.push(...table(['Slot / poziom', 'Agregat roli A', 'Ruch, m/min zawodnika', 'Czas cutu, % ataku', 'Clearing, % ataku'], roles.map(e => {
    const slot = Number(String(e.context.factor).replace('slot-', ''))
    const role = e.context.homeConfig?.subRoles?.[slot]
    const metrics = e.value?.a?.roles?.[role]
    return [`${e.context.factor} / ${e.context.level}`, role ?? 'nieznana', pair(metrics?.metersPerPlayerMinute, e.count),
      pair(metrics?.cutPct, e.count), pair(metrics?.clearPct, e.count)]
  })), '', '## Force: efekt obrony A względem neutralnego', '',
  'Zmiana force A dotyczy przeciwnych rzutów B. Wartości procentowe są efektami treatment−neutral w pp.', '')
  const force = entries.filter(e => e.context.cohort === 'force' && treatment(e))
  lines.push(...table(['Force A', 'Konwersja B, pp', 'Rzuty break B, pp', 'Completion B, pp'], force.map(e => [
    e.context.factor, effectPair(e, 'b', 'conversionPct'), effectPair(e, 'b', 'breakPassPct'), effectPair(e, 'b', 'completionPct'),
  ])), '', '## Braki i ograniczenia', '',
  `Komórki z choć jednym dopasowanym blokiem: ${report.cells.length}/${entries.length}; bez wspólnej pełnej pary: ${entries.filter(e => !e.value).length}.`,
  `Wykluczone bloki: ${report.excludedBlocks?.length ?? '—'}; niedopasowane kontrasty neutralne: ${report.treatmentEffects?.unmatched?.length ?? '—'}.`,
  `Problemy globalne dopasowania: ${report.globalIssues?.length ? report.globalIssues.join(', ') : 'brak'}.`,
  'Sport obejmuje tylko kompletne poprawne pary w obu wersjach; poprawę awarii trzeba oceniać osobno na wszystkich zaplanowanych próbach. Liczba rzutów, klatek i sekund-zawodnika jest ekspozycją, nie liczbą niezależnych powtórzeń. Brak wind-context w tej kolejce nie został dopisany jako wykonany test.', '')
  return lines.join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = path.resolve(process.argv[2] ?? 'artifacts/engine-audit/tactics-balance-2026-10-03-validation/comparison/comparison.json')
  const report = JSON.parse(fs.readFileSync(source, 'utf8'))
  const queueFile = path.resolve(process.argv[4] ?? path.join(report.root, 'queue.json'))
  const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'))
  const target = path.resolve(process.argv[3] ?? 'artifacts/tactics-balance-2026-10-03/final-tables.md')
  if (target === source || ['before', 'after', 'candidate-v1', 'candidate-v2'].some(v => target.startsWith(path.join(report.root, v) + path.sep))) {
    throw new Error('Supplement must be outside immutable result/source files')
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, renderFinalTables(report, queue))
  console.log(JSON.stringify({ source, queue: queueFile, output: target, matchedPairs: report.matchedPairs }))
}
