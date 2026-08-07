/** Typy zdarzeń — rozszerzaj listę, UI i replay mogą na nich polegać. */
export const EVENT = {
  MATCH_START: 'match_start',
  POINT_START: 'point_start',
  PULL: 'pull',
  POSSESSION: 'possession',
  THROW_ATTEMPT: 'throw_attempt',
  THROW_SUCCESS: 'throw_success',
  THROW_FAIL: 'throw_fail',
  TURNOVER: 'turnover',
  SCORE: 'score',
  POINT_END: 'point_end',
  MATCH_END: 'match_end',
  PERSON_MATCHUPS: 'person_matchups',
  STALL_PRESSURE: 'stall_pressure',
  STALL_OUT: 'stall_out',
  SEPARATION: 'separation',
  INJURY: 'injury',
}

let eventId = 0

export function createEvent(type, payload = {}) {
  eventId += 1
  return { id: eventId, type, ...payload }
}

export function resetEventIds() {
  eventId = 0
}
