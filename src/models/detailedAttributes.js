import { rawAttribute } from './attributeAliases.js'
/** Nowe umiejętności są osobnymi wartościami; rodzice służą tylko migracji
 * profilu, który nie ma jeszcze danej wartości. Bez losowania i zmiany starych pól.
 */
export const DETAILED_ATTRIBUTES = {
  throwing: {
    power: { label: 'Throwing power', from: ['huck', 'backhand'] },
    touch: { label: 'Touch', from: ['backhand', 'forehand'] },
    releaseControl: { label: 'Release control', from: ['forehand', 'hammer'] },
    windControl: { label: 'Wind control', from: ['backhand', 'forehand'] },
  },
  physical: {
    acceleration: { label: 'Acceleration', from: ['speed', 'agility'] },
    balance: { label: 'Balance', from: ['agility'] },
  },
  mental: {
    anticipation: { label: 'Anticipation', from: ['vision', 'reactions'] },
    spatialAwareness: { label: 'Spatial awareness', from: ['vision', 'decisionMaking'] },
  },
  offensive: {
    cutTiming: { label: 'Cut timing', from: ['routeCraft', 'offensiveSystemsKnowledge'] },
    discReading: { label: 'Disc reading', from: ['catching', 'offensiveSystemsKnowledge'] },
  },
  defensive: {
    positioning: { label: 'Positioning', from: ['matchupReading', 'defensiveSystemsKnowledge'] },
    marking: { label: 'Marking', from: ['resetDefense', 'blocking'] },
    discReading: { label: 'Disc reading', from: ['blocking', 'defensiveSystemsKnowledge'] },
  },
}

export const ATTRIBUTE_HELP_PL = {
  routeCraft: ['Technika cutu', 'Dobór kąta, zwodu i trasy otwierającej podanie.'],
  resetMovement: ['Ruch resetowy', 'Wybór momentu i miejsca bezpiecznej oferty handlera.'],
  matchupReading: ['Czytanie krycia', 'Rozpoznawanie kierunku ruchu i zamiaru krytego zawodnika.'],
  resetDefense: ['Obrona resetu', 'Zamykanie okna resetu i ruchu upline.'],
  power: ['Siła rzutu', 'Zasięg podania bez dodatkowej utraty celności.'],
  touch: ['Wyczucie rzutu', 'Dozowanie wysokości i tempa podania.'],
  releaseControl: ['Kontrola wypuszczenia', 'Powtarzalność kąta, krzywizny i kierunku rzutu.'],
  windControl: ['Gra na wietrze', 'Dobór poprawki na wiatr i ograniczanie błędów wykonania rzutu.'],
  acceleration: ['Przyspieszenie', 'Tempo rozpędzania się do biegu.'],
  balance: ['Równowaga', 'Kontrola ciała podczas zmiany kierunku.'],
  anticipation: ['Przewidywanie', 'Rozpoznawanie rozwoju akcji i momentu ruchu.'],
  spatialAwareness: ['Orientacja przestrzenna', 'Czytanie wolnego miejsca, zajętych korytarzy i tras kolegów.'],
  cutTiming: ['Timing cutu', 'Dobór momentu rozpoczęcia cięcia.'],
  discReading: ['Czytanie lotu', 'Szybkość rozpoznania rzeczywistego toru i miejsca przechwytu.'],
  positioning: ['Ustawianie się', 'Dobór odstępu i bronionej przestrzeni.'],
  marking: ['Markowanie', 'Utrzymywanie wybranej strony marka i utrudnianie wypuszczenia.'],
}

export function derivedAttribute(skills, category, key, fallback = 75) {
  const definition = DETAILED_ATTRIBUTES[category]?.[key]
  if (!definition) return undefined
  const values = definition.from.map(k => rawAttribute(skills, category, k)).filter(Number.isFinite)
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : fallback
}

export function completeDetailedSkills(skills) {
  for (const [category, definitions] of Object.entries(DETAILED_ATTRIBUTES)) {
    skills[category] ??= {}
    for (const key of Object.keys(definitions)) {
      if (!Number.isFinite(skills[category][key])) skills[category][key] = derivedAttribute(skills, category, key)
    }
  }
  return skills
}
