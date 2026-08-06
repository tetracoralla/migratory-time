import type { Temporal } from '@js-temporal/polyfill'

export interface ClockSnapshot {
  instant: Temporal.Instant
  isLive: boolean
}

export interface ClockHistory {
  future: ClockSnapshot[]
  past: ClockSnapshot[]
  present: ClockSnapshot
}

const HISTORY_LIMIT = 50

function sameClockState(left: ClockSnapshot, right: ClockSnapshot) {
  if (left.isLive || right.isLive) return left.isLive === right.isLive
  return left.instant.epochNanoseconds === right.instant.epochNanoseconds
}

function appendPast(past: ClockSnapshot[], snapshot: ClockSnapshot) {
  return [...past, snapshot].slice(-HISTORY_LIMIT)
}

function materialize(snapshot: ClockSnapshot, now: Temporal.Instant) {
  return snapshot.isLive ? { instant: now, isLive: true } : snapshot
}

export function createClockHistory(now: Temporal.Instant): ClockHistory {
  return {
    future: [],
    past: [],
    present: { instant: now, isLive: true },
  }
}

export function updateLiveClock(
  history: ClockHistory,
  now: Temporal.Instant,
): ClockHistory {
  if (!history.present.isLive) return history

  return {
    ...history,
    present: { instant: now, isLive: true },
  }
}

export function commitClockInstant(
  history: ClockHistory,
  instant: Temporal.Instant,
): ClockHistory {
  const next = { instant, isLive: false }
  if (sameClockState(history.present, next)) return history

  return {
    future: [],
    past: appendPast(history.past, history.present),
    present: next,
  }
}

export function resetClockToLive(
  history: ClockHistory,
  now: Temporal.Instant,
  coalesceCommittedEdit = false,
): ClockHistory {
  const next = { instant: now, isLive: true }

  if (history.present.isLive) {
    return updateLiveClock(history, now)
  }

  if (!coalesceCommittedEdit) {
    return {
      future: [],
      past: appendPast(history.past, history.present),
      present: next,
    }
  }

  const previous = history.past.at(-1)
  const past = previous?.isLive ? history.past.slice(0, -1) : history.past

  return {
    future: [],
    past,
    present: next,
  }
}

export function undoClockHistory(
  history: ClockHistory,
  now: Temporal.Instant,
): ClockHistory {
  const previous = history.past.at(-1)
  if (!previous) return history

  return {
    future: [history.present, ...history.future].slice(0, HISTORY_LIMIT),
    past: history.past.slice(0, -1),
    present: materialize(previous, now),
  }
}

export function redoClockHistory(
  history: ClockHistory,
  now: Temporal.Instant,
): ClockHistory {
  const next = history.future[0]
  if (!next) return history

  return {
    future: history.future.slice(1),
    past: appendPast(history.past, history.present),
    present: materialize(next, now),
  }
}
