import { useCallback, useRef, useState } from 'react'
import {
  commitClockInstant,
  createClockHistory,
  redoClockHistory,
  resetClockToLive,
  undoClockHistory,
  updateLiveClock,
  type ClockSnapshot,
  type ClockHistory,
} from '../lib/clockHistory'
import { getNowInstant } from '../lib/timeConversion'
import type { WallTimeResolution } from '../types'

type Instant = Extract<WallTimeResolution, { status: 'valid' }>['instant']

export function useClockHistory(initialSnapshot?: ClockSnapshot) {
  const [history, setHistory] = useState(() =>
    createClockHistory(
      initialSnapshot ?? { instant: getNowInstant(), isLive: true },
    ),
  )
  const historyRef = useRef(history)

  const apply = useCallback(
    (transition: (current: ClockHistory) => ClockHistory) => {
      const current = historyRef.current
      const next = transition(current)
      if (next === current) return false

      historyRef.current = next
      setHistory(next)
      return true
    },
    [],
  )

  const commitInstant = useCallback(
    (instant: Instant) =>
      apply((current) => commitClockInstant(current, instant)),
    [apply],
  )

  const refreshLive = useCallback(
    () => apply((current) => updateLiveClock(current, getNowInstant())),
    [apply],
  )

  const resetToNow = useCallback(
    (coalesceCommittedEdit = false) =>
      apply((current) =>
        resetClockToLive(
          current,
          getNowInstant(),
          coalesceCommittedEdit,
        ),
      ),
    [apply],
  )

  const undo = useCallback(
    () =>
      apply((current) => undoClockHistory(current, getNowInstant())),
    [apply],
  )

  const redo = useCallback(
    () =>
      apply((current) => redoClockHistory(current, getNowInstant())),
    [apply],
  )

  return {
    commitInstant,
    instant: history.present.instant,
    isLive: history.present.isLive,
    redo,
    refreshLive,
    resetToNow,
    undo,
  }
}
