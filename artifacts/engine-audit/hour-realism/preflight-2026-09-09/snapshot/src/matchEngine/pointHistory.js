import { EVENT } from './events.js'

/** Zdarzenia jednego punktu (od POINT_START do POINT_END). */
export function slicePointEvents(events, pointIndex) {
  const collected = []
  let capturing = false

  for (const event of events) {
    if (event.type === EVENT.POINT_START && event.pointIndex === pointIndex) {
      capturing = true
    }
    if (capturing) {
      collected.push(event)
    }
    if (
      capturing &&
      event.type === EVENT.POINT_END &&
      event.pointIndex === pointIndex
    ) {
      break
    }
  }

  return collected
}

export function listPointIndices(events) {
  return events
    .filter((e) => e.type === EVENT.POINT_START)
    .map((e) => e.pointIndex)
}
