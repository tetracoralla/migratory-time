import { describe, expect, it } from 'vitest'
import {
  commitClockInstant,
  createClockHistory,
  redoClockHistory,
  resetClockToLive,
  undoClockHistory,
} from './clockHistory'
import { getTemporal } from './temporal'

const Temporal = getTemporal()

function instant(value: string) {
  return Temporal.Instant.from(value)
}

describe('clock history', () => {
  it('undoes and redoes multiple committed clock states', () => {
    const live = instant('2026-08-05T04:00:00Z')
    const first = instant('2026-08-05T05:00:00Z')
    const second = instant('2026-08-05T06:00:00Z')
    const undoNow = instant('2026-08-05T07:00:00Z')

    let history = createClockHistory(live)
    history = commitClockInstant(history, first)
    history = commitClockInstant(history, second)

    history = undoClockHistory(history, undoNow)
    expect(history.present).toEqual({ instant: first, isLive: false })

    history = undoClockHistory(history, undoNow)
    expect(history.present).toEqual({ instant: undoNow, isLive: true })

    history = redoClockHistory(history, undoNow)
    expect(history.present).toEqual({ instant: first, isLive: false })

    history = redoClockHistory(history, undoNow)
    expect(history.present).toEqual({ instant: second, isLive: false })
  })

  it('treats reset after a live edit as one no-op operation', () => {
    const live = instant('2026-08-05T04:00:00Z')
    const edited = instant('2026-08-05T05:00:00Z')
    const resetNow = instant('2026-08-05T06:00:00Z')

    let history = createClockHistory(live)
    history = commitClockInstant(history, edited)
    history = resetClockToLive(history, resetNow, true)

    expect(history.past).toHaveLength(0)
    expect(undoClockHistory(history, resetNow)).toBe(history)
  })

  it('restores the prior fixed clock after a coalesced reset', () => {
    const live = instant('2026-08-05T04:00:00Z')
    const first = instant('2026-08-05T05:00:00Z')
    const second = instant('2026-08-05T06:00:00Z')
    const resetNow = instant('2026-08-05T07:00:00Z')

    let history = createClockHistory(live)
    history = commitClockInstant(history, first)
    history = commitClockInstant(history, second)
    history = resetClockToLive(history, resetNow, true)
    history = undoClockHistory(history, resetNow)

    expect(history.present).toEqual({ instant: first, isLive: false })
  })

  it('keeps a normal reset reversible in both directions', () => {
    const live = instant('2026-08-05T04:00:00Z')
    const fixed = instant('2026-08-05T05:00:00Z')
    const resetNow = instant('2026-08-05T06:00:00Z')
    const redoNow = instant('2026-08-05T07:00:00Z')

    let history = createClockHistory(live)
    history = commitClockInstant(history, fixed)
    history = resetClockToLive(history, resetNow)
    history = undoClockHistory(history, resetNow)
    expect(history.present).toEqual({ instant: fixed, isLive: false })

    history = redoClockHistory(history, redoNow)
    expect(history.present).toEqual({ instant: redoNow, isLive: true })
  })

  it('clears redo only after a new committed clock change', () => {
    const live = instant('2026-08-05T04:00:00Z')
    const first = instant('2026-08-05T05:00:00Z')
    const second = instant('2026-08-05T06:00:00Z')
    const replacement = instant('2026-08-05T07:00:00Z')

    let history = createClockHistory(live)
    history = commitClockInstant(history, first)
    history = commitClockInstant(history, second)
    history = undoClockHistory(history, live)
    expect(history.future).toHaveLength(1)

    history = commitClockInstant(history, replacement)
    expect(history.future).toHaveLength(0)
    expect(redoClockHistory(history, live)).toBe(history)
  })
})
