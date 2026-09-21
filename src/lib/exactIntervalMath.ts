import type { Temporal } from '@js-temporal/polyfill'
import { getTemporal } from './temporal'

export interface ExactIntervalValue {
  end: Temporal.Instant
  start: Temporal.Instant
}

export function alignInstantAtOrAfter(
  instant: Temporal.Instant,
  origin: Temporal.Instant,
  stepNanoseconds: bigint,
) {
  if (stepNanoseconds <= 0n) {
    throw new RangeError('stepNanoseconds must be positive.')
  }
  const difference = instant.epochNanoseconds - origin.epochNanoseconds
  const remainder = (
    (difference % stepNanoseconds) + stepNanoseconds
  ) % stepNanoseconds
  if (remainder === 0n) return instant
  return getTemporal().Instant.fromEpochNanoseconds(
    instant.epochNanoseconds + stepNanoseconds - remainder,
  )
}

function laterInstant(left: Temporal.Instant, right: Temporal.Instant) {
  return getTemporal().Instant.compare(left, right) >= 0 ? left : right
}

function earlierInstant(left: Temporal.Instant, right: Temporal.Instant) {
  return getTemporal().Instant.compare(left, right) <= 0 ? left : right
}

export function mergeExactIntervals(
  intervals: ExactIntervalValue[],
): ExactIntervalValue[] {
  const ordered = [...intervals].sort((left, right) =>
    getTemporal().Instant.compare(left.start, right.start),
  )
  const merged: ExactIntervalValue[] = []
  for (const interval of ordered) {
    const previous = merged.at(-1)
    if (
      previous
      && getTemporal().Instant.compare(interval.start, previous.end) <= 0
    ) {
      previous.end = laterInstant(previous.end, interval.end)
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

export function intersectExactIntervals(
  left: ExactIntervalValue[],
  right: ExactIntervalValue[],
): ExactIntervalValue[] {
  const intersections: ExactIntervalValue[] = []
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    const start = laterInstant(left[leftIndex].start, right[rightIndex].start)
    const end = earlierInstant(left[leftIndex].end, right[rightIndex].end)
    if (getTemporal().Instant.compare(start, end) < 0) {
      intersections.push({ end, start })
    }
    if (
      getTemporal().Instant.compare(left[leftIndex].end, right[rightIndex].end) <= 0
    ) {
      leftIndex += 1
    } else {
      rightIndex += 1
    }
  }
  return intersections
}

export function intersectManyExactIntervals(
  groups: ExactIntervalValue[][],
  search: ExactIntervalValue,
) {
  return groups.reduce(
    (common, group) => intersectExactIntervals(common, group),
    [{ ...search }],
  )
}

export function subtractExactIntervals(
  available: ExactIntervalValue[],
  busy: ExactIntervalValue[],
) {
  const result: ExactIntervalValue[] = []
  const blockers = mergeExactIntervals(busy)
  for (const interval of available) {
    let cursor = interval.start
    for (const blocker of blockers) {
      if (getTemporal().Instant.compare(blocker.end, cursor) <= 0) continue
      if (getTemporal().Instant.compare(blocker.start, interval.end) >= 0) break
      if (getTemporal().Instant.compare(blocker.start, cursor) > 0) {
        result.push({
          end: earlierInstant(blocker.start, interval.end),
          start: cursor,
        })
      }
      cursor = laterInstant(cursor, blocker.end)
      if (getTemporal().Instant.compare(cursor, interval.end) >= 0) break
    }
    if (getTemporal().Instant.compare(cursor, interval.end) < 0) {
      result.push({ end: interval.end, start: cursor })
    }
  }
  return mergeExactIntervals(result)
}

export function intervalContains(
  intervals: ExactIntervalValue[],
  start: Temporal.Instant,
  end: Temporal.Instant,
) {
  return intervals.some(
    (interval) =>
      getTemporal().Instant.compare(interval.start, start) <= 0
      && getTemporal().Instant.compare(interval.end, end) >= 0,
  )
}
