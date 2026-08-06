export type DeferredAction =
  | { type: 'copy' }
  | { type: 'share' }
  | { type: 'language' }
  | { type: 'regions' }
  | { type: 'reset' }
  | { type: 'edit-zone'; zoneId: string }

interface DeferredActionHandlers<TCommit> {
  copy: (commit: TCommit) => void
  share: (commit: TCommit) => void
  editZone: (zoneId: string, commit: TCommit) => void
  language: () => void
  regions: () => void
  reset: (commit: TCommit) => void
}

export function getDeferredAction(
  target: EventTarget | null,
): DeferredAction | undefined {
  if (!(target instanceof Element)) return undefined

  const timeAction = target.closest<HTMLElement>('[data-time-action]')?.dataset
    .timeAction
  if (
    timeAction === 'copy' ||
    timeAction === 'share' ||
    timeAction === 'language' ||
    timeAction === 'regions' ||
    timeAction === 'reset'
  ) {
    return { type: timeAction }
  }

  const zoneId = target.closest<HTMLElement>('[data-edit-zone]')?.dataset.editZone
  return zoneId ? { type: 'edit-zone', zoneId } : undefined
}

export function replayDeferredAction<TCommit>(
  action: DeferredAction | undefined,
  commit: TCommit,
  handlers: DeferredActionHandlers<TCommit>,
) {
  if (action?.type === 'copy') {
    handlers.copy(commit)
  } else if (action?.type === 'share') {
    handlers.share(commit)
  } else if (action?.type === 'reset') {
    handlers.reset(commit)
  } else if (action?.type === 'language') {
    handlers.language()
  } else if (action?.type === 'regions') {
    handlers.regions()
  } else if (action?.type === 'edit-zone') {
    handlers.editZone(action.zoneId, commit)
  }
}
