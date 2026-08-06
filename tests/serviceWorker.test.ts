import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('service worker cache behavior', () => {
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
          'migratory-time-v2',
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
    ])
  })

  it('stores every query-based navigation under one app-shell cache key', async () => {
    const source = await readFile(
      new URL('../public/sw.js', import.meta.url),
      'utf8',
    )
    const listeners = new Map<string, (event: unknown) => void>()
    const cachedKeys: string[] = []
    const response = {
      ok: true,
      clone() {
        return this
      },
    }

    runInNewContext(source, {
      URL,
      caches: {
        open: async () => ({
          put: async (key: string | { url: string }) => {
            cachedKeys.push(typeof key === 'string' ? key : key.url)
          },
        }),
        match: async () => undefined,
      },
      fetch: async () => response,
      self: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          listeners.set(type, listener)
        },
        clients: { claim: () => undefined },
        location: { href: 'https://example.com/migratory-time/sw.js' },
        skipWaiting: () => undefined,
      },
    })

    async function navigate(url: string) {
      let responsePromise: Promise<unknown> | undefined
      const backgroundWrites: Promise<unknown>[] = []
      listeners.get('fetch')?.({
        request: { method: 'GET', mode: 'navigate', url },
        respondWith(promise: Promise<unknown>) {
          responsePromise = promise
        },
        waitUntil(promise: Promise<unknown>) {
          backgroundWrites.push(promise)
        },
      })
      await responsePromise
      await Promise.all(backgroundWrites)
    }

    await navigate(
      'https://example.com/migratory-time/?t=20260817T0700Z&z=cn,pt',
    )
    await navigate(
      'https://example.com/migratory-time/?t=20370817T0700Z&z=cn,uk',
    )

    expect(cachedKeys).toEqual([
      'https://example.com/migratory-time/',
      'https://example.com/migratory-time/',
    ])
    expect(new Set(cachedKeys).size).toBe(1)
  })

  it('returns a successful network response even when cache writing fails', async () => {
    const source = await readFile(
      new URL('../public/sw.js', import.meta.url),
      'utf8',
    )
    const listeners = new Map<string, (event: unknown) => void>()
    const networkResponse = {
      ok: true,
      clone() {
        return { ...this }
      },
    }
    let cacheFallbackCount = 0

    runInNewContext(source, {
      URL,
      caches: {
        open: async () => ({
          put: async () => {
            throw new Error('storage quota exceeded')
          },
        }),
        match: async () => {
          cacheFallbackCount += 1
          return undefined
        },
      },
      fetch: async () => networkResponse,
      self: {
        addEventListener(type: string, listener: (event: unknown) => void) {
          listeners.set(type, listener)
        },
        clients: { claim: () => undefined },
        location: { href: 'https://example.com/migratory-time/sw.js' },
        skipWaiting: () => undefined,
      },
    })

    let responsePromise: Promise<unknown> | undefined
    const backgroundWrites: Promise<unknown>[] = []
    listeners.get('fetch')?.({
      request: {
        method: 'GET',
        mode: 'navigate',
        url: 'https://example.com/migratory-time/?t=20260817T0700Z&z=cn',
      },
      respondWith(promise: Promise<unknown>) {
        responsePromise = promise
      },
      waitUntil(promise: Promise<unknown>) {
        backgroundWrites.push(promise)
      },
    })

    await expect(responsePromise).resolves.toBe(networkResponse)
    await expect(Promise.all(backgroundWrites)).resolves.toEqual([undefined])
    expect(cacheFallbackCount).toBe(0)
  })
})
