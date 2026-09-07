/**
 * Efektywne modyfikatory zawodnika na czas punktu — ZAPIS (stemplowanie).
 * Odczyt i sam rejestr: `playerModsRegistry.js` (liść bez cykli importów).
 *
 * PROBLEM, KTÓRY TO ROZWIĄZUJE. Cechy, dyrektywy trenera i rozkazy indywidualne mówią tym
 * samym słownikiem ~45 kluczy (`getTraitMods` / `coachDirectiveMods` / `rawInstructionMods`),
 * ale silnik czytał je DWIEMA drogami. Część miejsc brała scalony obiekt z
 * `mergeTraitAndCoachMods` — i widziała rozkazy. Reszta wołała `getTraitMods(player)` wprost —
 * i widziała WYŁĄCZNIE cechy. W tej drugiej grupie siedziały m.in. `throwScanRadiusM`,
 * `perceivedOptionLimit` i `decisionNoiseAmplitude` (statFormulas.js), więc rozkaz `dominate`
 * liczył sobie +2.5 m zasięgu skanu i +1 dostrzeganą opcję, po czym oba szły do kosza.
 *
 * ZMIERZONE PRZED ZMIANĄ (scripts/bench-player-instructions.mjs, 20 meczów/warunek, sondy
 * per zawodnik): 10 z 20 rozkazów nie ruszało własnej metryki zachowania instruowanego
 * gracza poza podłogę szumu — m.in. `throw_hucks` (+1.55 pp przy szumie ±1.61),
 * `dominate` (+0.37 inicjacji cutu / 1000 ticków przy progu 1.50) i `take_space`.
 *
 * ROZWIĄZANIE. Raz na punkt — i ponownie po każdej zmianie posiadania — stemplujemy
 * zawodników z boiska scalonymi modami dla roli, w której AKTUALNIE są (atak / obrona).
 * Kod spoza meczu (kariera, morale, trening, transfery) zostaje na `getTraitMods`, żeby
 * taktyka pojedynczego meczu nie wyciekła do symulacji sezonu — stąd `clearPointPlayerMods()`
 * na końcu punktu.
 *
 * DLACZEGO STEMPEL, A NIE `tactics` W SYGNATURACH. `resolution.js` i `stall.js` nie mają
 * taktyki w zasięgu wywołania i musiałyby ją dostać przez kilka warstw, które o niej nic nie
 * wiedzą. Rejestr trzyma koszt w jednym miejscu i zachowuje istniejącą historię wydajnościową:
 * `mergeTraitAndCoachMods` jest już memoizowany po tożsamości (player, tactics, role), a w
 * miejscach odczytu dochodzi jedno odpytanie WeakMap ZAMIAST jednego odpytania WeakMap
 * w `getTraitMods`.
 */

import { mergeTraitAndCoachMods } from './coachDirectives.js'
import { setPlayerMods } from './playerModsRegistry.js'

export { playerMatchMods, clearPointPlayerMods } from './playerModsRegistry.js'

/**
 * Stempluje obie strony pod aktualne posiadanie: drużyna z dyskiem dostaje mody roli
 * `offense`, broniąca `defense`. Wołane na starcie punktu i po każdej zmianie posiadania —
 * od roli zależy zarówno compliance (offensive vs defensive systems knowledge), jak i to,
 * który zestaw dyrektyw trenera obowiązuje.
 *
 * `lineRole` zostaje null: rozstrzyga go `_pointStartRole` ostemplowany na taktyce drużyny
 * w `simulatePoint`, tak samo jak we wszystkich dotychczasowych wywołaniach
 * `mergeTraitAndCoachMods`.
 *
 * @param {object[]} offensePlayers
 * @param {object|null} offenseTactics
 * @param {object[]} defensePlayers
 * @param {object|null} defenseTactics
 */
export function setPossessionPlayerMods(
  offensePlayers,
  offenseTactics,
  defensePlayers,
  defenseTactics,
) {
  stampSide(offensePlayers, offenseTactics, 'offense')
  stampSide(defensePlayers, defenseTactics, 'defense')
}

function stampSide(players, tactics, role) {
  if (!Array.isArray(players)) return
  for (const player of players) {
    if (!player || typeof player !== 'object') continue
    setPlayerMods(player, mergeTraitAndCoachMods(player, tactics, role, null))
  }
}
