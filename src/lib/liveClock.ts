const MILLISECONDS_PER_MINUTE = 60_000
const BOUNDARY_BUFFER_MILLISECONDS = 20

interface MinuteTickerEnvironment {
  addVisibilityListener: (listener: () => void) => () => void
  clearTimer: (timer: number) => void
  getVisibility: () => DocumentVisibilityState
  now: () => number
  setTimer: (callback: () => void, delay: number) => number
}

export function millisecondsUntilNextMinute(nowMilliseconds: number) {
  const elapsedInMinute =
    ((nowMilliseconds % MILLISECONDS_PER_MINUTE) + MILLISECONDS_PER_MINUTE) %
    MILLISECONDS_PER_MINUTE

  return elapsedInMinute === 0
    ? MILLISECONDS_PER_MINUTE
    : MILLISECONDS_PER_MINUTE - elapsedInMinute
}

export function startVisibleMinuteTicker(
  onTick: () => void,
  environment: MinuteTickerEnvironment,
) {
  let timer: number | undefined

  const clearScheduledTick = () => {
    if (timer === undefined) return
    environment.clearTimer(timer)
    timer = undefined
  }

  const scheduleNextTick = () => {
    clearScheduledTick()
    if (environment.getVisibility() !== 'visible') return

    timer = environment.setTimer(() => {
      timer = undefined
      onTick()
      scheduleNextTick()
    }, millisecondsUntilNextMinute(environment.now()) + BOUNDARY_BUFFER_MILLISECONDS)
  }

  const handleVisibilityChange = () => {
    clearScheduledTick()
    if (environment.getVisibility() !== 'visible') return

    onTick()
    scheduleNextTick()
  }

  const removeVisibilityListener =
    environment.addVisibilityListener(handleVisibilityChange)
  scheduleNextTick()

  return () => {
    clearScheduledTick()
    removeVisibilityListener()
  }
}

export function startBrowserMinuteTicker(onTick: () => void) {
  return startVisibleMinuteTicker(onTick, {
    addVisibilityListener(listener) {
      document.addEventListener('visibilitychange', listener)
      return () => document.removeEventListener('visibilitychange', listener)
    },
    clearTimer: (timer) => window.clearTimeout(timer),
    getVisibility: () => document.visibilityState,
    now: () => Date.now(),
    setTimer: (callback, delay) => window.setTimeout(callback, delay),
  })
}
