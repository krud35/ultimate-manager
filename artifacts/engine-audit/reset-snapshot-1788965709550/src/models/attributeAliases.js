/** Schema migration without rerolling skills. Canonical values take precedence. */
export const ATTRIBUTE_ALIASES = {
  offensive: { cutterMovement: 'routeCraft', handlerMovement: 'resetMovement' },
  defensive: { defensiveCutterMovement: 'matchupReading', defensiveHandlerMovement: 'resetDefense' },
}
export const canonicalAttribute = (category, key) => ATTRIBUTE_ALIASES[category]?.[key] ?? key
const LEGACY_ATTRIBUTES = Object.fromEntries(Object.entries(ATTRIBUTE_ALIASES).map(([category, aliases]) =>
  [category, Object.fromEntries(Object.entries(aliases).map(([oldKey, newKey]) => [newKey, oldKey]))]))
export function legacyAttribute(category, key) {
  return LEGACY_ATTRIBUTES[category]?.[key] ?? key
}
export function rawAttribute(skills, category, key) {
  const canonical = canonicalAttribute(category, key)
  const value = skills?.[category]?.[canonical]
  return Number.isFinite(value) ? value : skills?.[category]?.[legacyAttribute(category, canonical)]
}
