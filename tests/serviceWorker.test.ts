import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('service worker cache cleanup', () => {
  it('deletes only outdated caches owned by this app', async () => {
    const source = await readFile(
      new URL('../public/sw.js', import.meta.url),
      'utf8',
    )
    const listeners = new Map<string, (event: unknown) => void>()
    const deleted: string[] = []

    runInNewContext(source, {
      URL,
      caches: {
        delete: async (key: string) => {
          deleted.push(key)
          return true
        },
        keys: async () => [
          'migratory-time-v0',
          'migratory-time-v1',
          'time-zone-app-v6',
          'time-zone-app-v7',
          'time-zone-app-v8',
          'time-zone-app-v9',
          'time-zone-app-v10',
          'time-zone-app-v11',
          'time-zone-app-v12',
          'time-zone-app-v13',
          'time-zone-app-v14',
          'time-zone-app-v15',
          'time-zone-app-v16',
          'time-zone-app-v17',
          'another-pwa-v9',
        ],
      },
      self: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          listeners.set(type, listener)
        },
        clients: { claim: () => undefined },
        location: { href: 'https://example.com/time-zone/sw.js' },
        skipWaiting: () => undefined,
      },
    })

    let activation: Promise<unknown> | undefined
    listeners.get('activate')?.({
      waitUntil(promise: Promise<unknown>) {
        activation = promise
      },
    })
    await activation

    expect(deleted).toEqual([
      'migratory-time-v0',
      'time-zone-app-v6',
      'time-zone-app-v7',
      'time-zone-app-v8',
      'time-zone-app-v9',
      'time-zone-app-v10',
      'time-zone-app-v11',
      'time-zone-app-v12',
      'time-zone-app-v13',
      'time-zone-app-v14',
      'time-zone-app-v15',
      'time-zone-app-v16',
      'time-zone-app-v17',
    ])
  })
})
