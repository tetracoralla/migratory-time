import { describe, expect, it, vi } from 'vitest'
import { replayDeferredAction } from './deferredAction'

describe('deferred action replay', () => {
  it('replays copy, reset, and region switching with the committed result', () => {
    const commit = { instant: 'chosen-instant', sourceZone: 'America/New_York' }
    const handlers = {
      copy: vi.fn(),
      editZone: vi.fn(),
      language: vi.fn(),
      regions: vi.fn(),
      reset: vi.fn(),
    }

    replayDeferredAction({ type: 'copy' }, commit, handlers)
    expect(handlers.copy).toHaveBeenCalledWith(commit)

    replayDeferredAction({ type: 'reset' }, commit, handlers)
    expect(handlers.reset).toHaveBeenCalledWith(commit)

    replayDeferredAction(
      { type: 'edit-zone', zoneId: 'America/Los_Angeles' },
      commit,
      handlers,
    )
    expect(handlers.editZone).toHaveBeenCalledWith(
      'America/Los_Angeles',
      commit,
    )

    replayDeferredAction({ type: 'language' }, commit, handlers)
    expect(handlers.language).toHaveBeenCalledOnce()

    replayDeferredAction({ type: 'regions' }, commit, handlers)
    expect(handlers.regions).toHaveBeenCalledOnce()
  })

  it('does nothing when the interrupted click had no replayable action', () => {
    const handlers = {
      copy: vi.fn(),
      editZone: vi.fn(),
      language: vi.fn(),
      regions: vi.fn(),
      reset: vi.fn(),
    }

    replayDeferredAction(undefined, 'commit', handlers)

    expect(handlers.copy).not.toHaveBeenCalled()
    expect(handlers.editZone).not.toHaveBeenCalled()
    expect(handlers.reset).not.toHaveBeenCalled()
    expect(handlers.language).not.toHaveBeenCalled()
    expect(handlers.regions).not.toHaveBeenCalled()
  })
})
