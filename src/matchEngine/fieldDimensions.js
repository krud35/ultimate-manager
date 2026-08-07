/** Wymiary boiska Ultimate (widok 2D, metry). Strefy punktowe wchodzą w długość 100 m. */
export const FIELD_DIMENSIONS = {
  lengthM: 100,
  widthM: 37,
  endzoneM: 18,
}

export function playingLengthM() {
  return FIELD_DIMENSIONS.lengthM - 2 * FIELD_DIMENSIONS.endzoneM
}

export function fieldCenterY() {
  return FIELD_DIMENSIONS.widthM / 2
}

export function clampFieldX(x) {
  return Math.max(0.5, Math.min(FIELD_DIMENSIONS.lengthM - 0.5, x))
}

export function clampFieldY(y) {
  return Math.max(0.5, Math.min(FIELD_DIMENSIONS.widthM - 0.5, y))
}

/** Linia bramkowa (wejście w strefę punktową) po stronie ataku. */
export function opponentGoalLineM(possessionTeam) {
  return possessionTeam === 'home'
    ? FIELD_DIMENSIONS.lengthM - FIELD_DIMENSIONS.endzoneM
    : FIELD_DIMENSIONS.endzoneM
}

/** +1 = atak w stronę rosnącego X (home), −1 = w lewo (away). */
export function attackDirectionX(possessionTeam) {
  return possessionTeam === 'home' ? 1 : -1
}

/** Pozycja silnika 0–100 (progress wzdłuż boiska) → metr X na boisku 2D. */
export function engineDiscXToFieldMeters(discMeters) {
  return clampFieldX(discMeters)
}
