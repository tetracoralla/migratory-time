import { useEffect } from 'react'

interface ClockHistoryShortcutOptions {
  blocked: boolean
  onApplied: () => void
  onRedo: () => boolean
  onUndo: () => boolean
}

export function useClockHistoryShortcuts({
  blocked,
  onApplied,
  onRedo,
  onUndo,
}: ClockHistoryShortcutOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        blocked
      ) {
        return
      }

      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return
      }

      const key = event.key.toLowerCase()
      const modified = event.metaKey || event.ctrlKey
      const wantsUndo = modified && key === 'z' && !event.shiftKey
      const wantsRedo =
        (modified && key === 'z' && event.shiftKey) ||
        (event.ctrlKey && !event.metaKey && key === 'y' && !event.shiftKey)

      if (!wantsUndo && !wantsRedo) return

      const changed = wantsRedo ? onRedo() : onUndo()
      if (!changed) return

      event.preventDefault()
      onApplied()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [blocked, onApplied, onRedo, onUndo])
}
