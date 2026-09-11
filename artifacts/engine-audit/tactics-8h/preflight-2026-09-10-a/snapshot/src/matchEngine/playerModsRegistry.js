/**
 * Rejestr efektywnych modyfikatorów zawodnika na czas punktu — CZYTANIE.
 *
 * Ten plik jest celowo liściem: importuje wyłącznie `playerTraits.js`. Zapis do rejestru
 * (który potrzebuje `mergeTraitAndCoachMods`, a więc całego `coachDirectives.js`) siedzi
 * w `playerMods.js`. Rozdział jest konieczny, bo czytają stąd `stall.js` i `resolution.js`,
 * a `coachDirectives.js` → `throwTechnique.js` → `throwTypes.js` → `stall.js` domknęłoby
 * cykl importów.
 *
 * PO CO TO W OGÓLE JEST — patrz nagłówek `playerMods.js`.
 */

import { getTraitMods } from '../models/playerTraits.js'

/**
 * Rejestr żyje tylko przez punkt. `clearPointPlayerMods` podmienia całą mapę zamiast
 * kasować wpisy — WeakMap nie da się wyczyścić, a podmiana od razu uwalnia poprzednią.
 */
let registry = new WeakMap()

/**
 * Modyfikatory zawodnika widziane przez silnik meczowy: cechy + dyrektywy trenera +
 * rozkazy indywidualne, dla roli, w której zawodnik aktualnie jest.
 *
 * Poza punktem (i dla zawodnika spoza boiska) schodzi do samych cech — dzięki temu skrypty,
 * testy i kod kariery działają bez stemplowania i widzą dokładnie to, co wcześniej.
 * @param {object|null|undefined} player
 */
export function playerMatchMods(player) {
  if (player && typeof player === 'object') {
    const stamped = registry.get(player)
    if (stamped) return stamped
  }
  return getTraitMods(player)
}

/** @param {object} player @param {object} mods */
export function setPlayerMods(player, mods) {
  if (player && typeof player === 'object' && mods) registry.set(player, mods)
}

/** Koniec punktu — mody meczowe przestają obowiązywać. */
export function clearPointPlayerMods() {
  registry = new WeakMap()
}
