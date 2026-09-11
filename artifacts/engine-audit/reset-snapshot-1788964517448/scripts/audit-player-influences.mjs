/** Static influence inventory. References are evidence of wiring, not a causal test. */
import fs from 'node:fs'
import path from 'node:path'
import { TRAIT_DEFS, getTraitMods } from '../src/models/playerTraits.js'
import { PLAYER_STAT_CATEGORIES, SUB_STAT_LABELS } from '../src/models/playerStats.js'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'artifacts/disc-flight')
const files = []
function scan(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name)
    if (item.isDirectory()) scan(file)
    else if (/\.js$/.test(file)) files.push({
      file: path.relative(root, file).replaceAll('\\', '/'),
      text: fs.readFileSync(file, 'utf8'),
    })
  }
}
for (const dir of ['src/matchEngine', 'src/models', 'src/career']) scan(path.join(root, dir))
const base = getTraitMods({ traits: [] })
const helperKeys = new Set(['huckAccuracy', 'dumpAccuracy', 'ottAccuracy', 'standardAccuracy', 'huckBlockRisk', 'ottBlockRisk'])
const traits = Object.values(TRAIT_DEFS).map(def => {
  const mods = getTraitMods({ traits: [def.id] })
  const effects = {}
  for (const [key, value] of Object.entries(mods)) {
    if (value === base[key]) continue
    const consumers = files.filter(f => f.file !== 'src/models/playerTraits.js'
      && new RegExp(`\\b${key}\\b`).test(f.text)).map(f => f.file)
    if (helperKeys.has(key)) consumers.unshift('src/models/playerTraits.js (throwTypeAccuracyTraitBonus / throwTypeBlockRiskTraitBonus)')
    effects[key] = { default: base[key], value, consumers }
  }
  return { id: def.id, name: def.namePl, description: def.descPl, effects }
})
const attributes = Object.entries(PLAYER_STAT_CATEGORIES).flatMap(([category, keys]) => keys.map(key => ({
  category, key, label: SUB_STAT_LABELS[category][key],
  // Literal reads plus shared category loops. Dynamic role-dependent reads need manual review.
  references: files.filter(f => f.file.startsWith('src/matchEngine/')
    && new RegExp(`['"]${key}['"]`).test(f.text)).map(f => f.file),
})))
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'trait-effects.json'), JSON.stringify(traits, null, 2) + '\n')
fs.writeFileSync(path.join(out, 'attribute-references.json'), JSON.stringify(attributes, null, 2) + '\n')
const lines = ['# Inwentarz wpływu cech zawodników', '',
  `Katalog: ${traits.length} cech. Każda porównana z zawodnikiem bez cech. Wartości dotyczą pojedynczej cechy; zestawy przechodzą agregację i ograniczenia w getTraitMods.`, '',
  'To analiza statycznych połączeń, nie pomiar siły efektu ani dowód, że każda gałąź występuje w każdym meczu. Forma i rozwój mogą zmieniać karierę bez bezpośredniego wpływu na decyzje w bieżącym punkcie. Pełna lista plików używających modyfikatorów jest w trait-effects.json. Sześć premii zależnych od typu rzutu jest używanych przez pomocnicze funkcje wewnątrz playerTraits.js.', '',
  '| Cecha | Znaczenie deklarowane w grze | Modyfikatory: domyślnie → z cechą |', '|---|---|---|']
for (const trait of traits) lines.push(`| ${trait.name} (${trait.id}) | ${trait.description} | ${Object.entries(trait.effects).map(([k, e]) => `${k}: ${e.default} → ${e.value}`).join('; ')} |`)
fs.writeFileSync(path.join(out, 'TRAITS.md'), lines.join('\n') + '\n')
console.log(`Inwentarz: ${traits.length} cech, ${attributes.length} atrybuty; ${traits.filter(t => !Object.keys(t.effects).length).length} cech bez zmiany modyfikatorów.`)
