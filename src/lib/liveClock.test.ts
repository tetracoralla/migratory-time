import { describe, expect, it } from 'vitest'
import {
  millisecondsUntilNextMinute,
  startVisibleMinuteTicker,
} from './liveClock'

describe('live clock scheduling', () => {
  it('aligns the next refresh to the next minute boundary', () => {
    expect(millisecondsUntilNextMinute(12_345)).toBe(47_655)
    expect(millisecondsUntilNextMinute(60_000)).toBe(60_000)
    expect(millisecondsUntilNextMinute(119_999)).toBe(1)
  })

  it('pauses while hidden and catches up when the page becomes visible', () => {
    let visibility: DocumentVisibilityState = 'visible'
    let visibilityListener: () => void = () => undefined
    let timerId = 0
    const scheduled = new Map<number, { callback: () => void; delay: number }>()
    const cleared: number[] = []
    let ticks = 0

    const stop = startVisibleMinuteTicker(
      () => {
        ticks += 1
      },
      {
        addVisibilityListener(listener) {
          visibilityListener = listener
          return () => {
            visibilityListener = () => undefined
          }
        },
        clearTimer(id) {
          cleared.push(id)
          scheduled.delete(id)
        },
        getVisibility: () => visibility,
        now: () => 12_345,
        setTimer(callback, delay) {
          timerId += 1
          scheduled.set(timerId, { callback, delay })
          return timerId
        },
      },
    )

    expect([...scheduled.values()].map((timer) => timer.delay)).toEqual([
      47_675,
    ])

    visibility = 'hidden'
    visibilityListener()
    expect(scheduled.size).toBe(0)
    expect(ticks).toBe(0)

    visibility = 'visible'
    visibilityListener()
    expect(ticks).toBe(1)
    expect(scheduled.size).toBe(1)

    stop()
    expect(scheduled.size).toBe(0)
    expect(cleared).toEqual([1, 2])
  })
})
