const CACHE_PREFIX = 'migratory-time-'
const LEGACY_CACHE_PREFIX = 'time-zone-app-'
const CACHE_NAME = `${CACHE_PREFIX}v5`
const SCOPE_URL = new URL('./', self.location.href)
const INDEX_URL = new URL('index.html', SCOPE_URL)
const ASSET_MANIFEST_URL = new URL('asset-manifest.json', SCOPE_URL)

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME)
  const [indexResponse, manifestResponse] = await Promise.all([
    fetch(INDEX_URL),
    fetch(ASSET_MANIFEST_URL),
  ])
  if (!indexResponse.ok || !manifestResponse.ok) {
    throw new Error('Unable to load the complete app-shell manifest')
  }
  const indexForCache = indexResponse.clone()
  const html = await indexResponse.text()
  const manifestForCache = manifestResponse.clone()
  const manifest = await manifestResponse.json()
  const assetPaths = Array.from(
    html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g),
    (match) => new URL(match[1], SCOPE_URL).href,
  )
  const manifestPaths = Object.values(manifest).flatMap((entry) => [
    entry.file,
    ...(entry.css ?? []),
    ...(entry.assets ?? []),
  ])
  const staticUrls = [
    new URL('manifest.webmanifest', SCOPE_URL).href,
    new URL('icon-192.png', SCOPE_URL).href,
    new URL('icon-512.png', SCOPE_URL).href,
    ...assetPaths,
    ...manifestPaths.map((path) => new URL(path, SCOPE_URL).href),
  ]

  await cache.put(SCOPE_URL, indexForCache.clone())
  await cache.put(INDEX_URL, indexForCache)
  await cache.put(ASSET_MANIFEST_URL, manifestForCache)
  await cache.addAll([...new Set(staticUrls)])
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith(CACHE_PREFIX) ||
                  key.startsWith(LEGACY_CACHE_PREFIX)) &&
                key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const isDocumentNavigation =
    event.request.mode === 'navigate' || event.request.destination === 'document'
  const cacheKey = isDocumentNavigation ? SCOPE_URL.href : event.request
  const networkRequest = fetch(event.request)

  event.waitUntil(
    networkRequest
      .then((response) => {
        if (!response.ok) return undefined

        const responseForCache = response.clone()
        return caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(cacheKey, responseForCache))
      })
      .catch(() => undefined),
  )

  event.respondWith(
    networkRequest.catch(async () => {
      // Same-origin development and static hosts may add `Vary: Origin`; the
      // versioned asset URL is the owned cache identity for this app shell.
      const cached = await caches.match(cacheKey, { ignoreVary: true })
      if (cached) return cached
      if (isDocumentNavigation) {
        return caches.match(SCOPE_URL, { ignoreVary: true })
      }
      throw new Error(`Offline resource was not cached: ${event.request.url}`)
    }),
  )
})
